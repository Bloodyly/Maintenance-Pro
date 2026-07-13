# -*- coding: utf-8 -*-
import os
import sys
import time
import json
import sqlite3
import io
import threading
from datetime import datetime

from reportlab.lib.pagesizes import A4, landscape, portrait
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.pdfbase.pdfmetrics import stringWidth
from flask import Flask, jsonify, Response

import storage

DB_PATH = os.environ.get("DB_PATH", "/shared_db/protocols.db")
COMPANY_NAME = os.environ.get("COMPANY_NAME", "Firmenname GmbH")

# ── Palette (matches the approved "Raster-Matrix" mockup) ───────────────────────
INK = colors.HexColor("#1c2530")
ACCENT = colors.HexColor("#c1481f")    # defects only
OK_GREEN = colors.HexColor("#3d6b52")  # geprüft / i.O.
OK_GREEN_BG = colors.HexColor("#e3ebe5")  # light wash behind geprüfte Melder
MUTED = colors.HexColor("#736b5c")
LINE = colors.HexColor("#dbd6c9")
PAPER = colors.HexColor("#f7f5f0")
ROW_ALT = colors.HexColor("#f1efe8")
NO_MELDER_BG = colors.HexColor("#e2ded3")  # greyed-out "no detector here" cells

MARGIN = 15 * mm
MIN_COL_WIDTH = 7 * mm
GRP_COL_WIDTH = 10 * mm
ANZAHL_COL_WIDTH = 15 * mm
MAX_BEZEICHNUNG_WIDTH = 90 * mm


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_schema(cursor):
    """pdf_generated_at now lives on protocol_groups (per Gerät) rather than
    protocols, so only the device that actually changed gets archived+rebuilt,
    not the whole contract. blank_pdf_requested_at is a tiny request queue the
    WebUI's 'Druck Blanko' button writes to -- webui and protocol_core are
    separate containers with no shared code, so a DB flag is the simplest bridge."""
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS mandanten (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        logo_filename VARCHAR(255) DEFAULT '',
        created_at INTEGER DEFAULT 0
    );
    """)
    cursor.execute(
        "INSERT OR IGNORE INTO mandanten (id, name, created_at) VALUES ('standard', 'Standard', ?)",
        (int(time.time() * 1000),)
    )
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS device_edit_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        protocol_id VARCHAR(50) NOT NULL,
        group_id VARCHAR(50) NOT NULL,
        technician_name VARCHAR(255),
        edited_at INTEGER NOT NULL,
        quarter VARCHAR(10) NOT NULL
    );
    """)

    for stmt in (
        "ALTER TABLE protocol_groups ADD COLUMN pdf_generated_at INTEGER DEFAULT 0",
        "ALTER TABLE protocol_groups ADD COLUMN blank_generated_at INTEGER DEFAULT 0",
        "ALTER TABLE protocol_groups ADD COLUMN blank_pdf_requested_at INTEGER DEFAULT 0",
        "ALTER TABLE protocols ADD COLUMN mandant_id VARCHAR(50) DEFAULT 'standard'",
        "ALTER TABLE technicians ADD COLUMN mandant_id VARCHAR(50) DEFAULT 'standard'",
        "ALTER TABLE mandanten ADD COLUMN company_name VARCHAR(255) DEFAULT ''",
    ):
        try:
            cursor.execute(stmt)
        except sqlite3.OperationalError:
            pass


def find_logo_path(mandant_folder):
    """Drop a logo.png/logo.jpg into <Mandant>/ on the Samba share to brand
    that Mandant's PDFs -- no rebuild needed. Each Mandant looks up its own,
    matching the WebUI's per-Mandant logo upload (server_stack/webui/app.py).
    Returns the resolved storage path (local or UNC), not a guaranteed-local
    path -- callers must read it via storage.read_bytes(), not plain open()."""
    for candidate in (
        storage.resolve(mandant_folder, "logo.png"),
        storage.resolve(mandant_folder, "logo.jpg"),
    ):
        if storage.exists(candidate):
            return candidate
    return None


def sanitize_filename(s):
    s = (s or "").strip()
    for ch in '/\\:*?"<>|':
        s = s.replace(ch, "-")
    return s or "unbenannt"


def contract_folder_name(p_info):
    return sanitize_filename(f"{p_info['contract_number']}-{p_info['name']}")


def device_filename(dev_name, dev_type, suffix=""):
    return sanitize_filename(f"{dev_name}-{dev_type}") + f"{suffix}.pdf"


def active_pdf_path(mandant_folder, p_info, dev_name, dev_type):
    return storage.resolve(mandant_folder, contract_folder_name(p_info),
                            device_filename(dev_name, dev_type))


def blank_pdf_path(mandant_folder, p_info, dev_name, dev_type):
    return storage.resolve(mandant_folder, contract_folder_name(p_info),
                            device_filename(dev_name, dev_type, "-blanko"))


def archive_pdf_path(mandant_folder, p_info, dev_name, dev_type, archived_date_str):
    year = archived_date_str[:4]
    return storage.resolve(mandant_folder, "Archiv", year, contract_folder_name(p_info),
                            device_filename(dev_name, dev_type, f"-{archived_date_str}"))


def archive_existing_device_pdf(mandant_folder, p_info, dev_name, dev_type):
    """Moves the currently active PDF for one Gerät (if any) into
    Archiv/<Jahr>/<Vertrag>/ before a fresh one replaces it."""
    active_path = active_pdf_path(mandant_folder, p_info, dev_name, dev_type)
    if not storage.exists(active_path):
        return

    date_str = datetime.now().strftime("%Y-%m-%d")
    archived_path = archive_pdf_path(mandant_folder, p_info, dev_name, dev_type, date_str)
    storage.makedirs(storage.dirname(archived_path))

    if storage.exists(archived_path):
        base, ext = os.path.splitext(archived_path)
        i = 2
        while storage.exists(f"{base}_{i}{ext}"):
            i += 1
        archived_path = f"{base}_{i}{ext}"

    print(f"[ARCHIVER] Archiving previous version to: {archived_path}")
    storage.move(active_path, archived_path)


# ── Unified per-device storage expansion (mirrors netlink/main.py's ────────────
# build_device_rows_payload -- kept in sync manually since protocol_core is a
# separate deployable that only shares the SQLite file, not code, with netlink.)

def list_devices(cursor, protocol_id):
    cursor.execute("SELECT * FROM protocol_groups WHERE protocol_id = ?", (protocol_id,))
    return cursor.fetchall()


def expand_device(cursor, protocol_id, group_id):
    """Returns (rows, max_cols, hw_rows, last_changed_at) for ONE Gerät: one row
    per Melder-Gruppe, cells keyed by column index, plus the optional Hardware-
    table rows (Zentrale/Ringkarten-Inventar, independent of the Melderliste).
    last_changed_at is the newest updated_at across the device's cells (incl.
    the '__rows__' registry cell and the '__hardware__' blob, so structural
    edits like renames also count as a change)."""
    cursor.execute(
        "SELECT slot_key, detector_type, value, updated_at FROM group_cells WHERE protocol_id = ? AND group_id = ?",
        (protocol_id, group_id)
    )
    cells = cursor.fetchall()

    registry_cell = next((c for c in cells if c["slot_key"] == "__rows__"), None)
    if not registry_cell:
        return [], 0, [], 0
    try:
        registry = json.loads(registry_cell["value"])
    except Exception:
        return [], 0, [], 0

    last_changed_at = registry_cell["updated_at"] or 0

    hw_rows = []
    hw_cell = next((c for c in cells if c["slot_key"] == "__hardware__"), None)
    if hw_cell:
        try:
            hw_rows = json.loads(hw_cell["value"]).get("rows", [])
        except Exception:
            hw_rows = []
        last_changed_at = max(last_changed_at, hw_cell["updated_at"] or 0)

    cells_by_grp = {}
    for c in cells:
        if c["slot_key"] in ("__rows__", "__hardware__") or "_" not in c["slot_key"]:
            continue
        grp_num, melder_nr = c["slot_key"].split("_", 1)
        cells_by_grp.setdefault(grp_num, {})[melder_nr] = c
        last_changed_at = max(last_changed_at, c["updated_at"] or 0)

    rows = []
    max_cols = 0
    for entry in registry:
        grp_num = str(entry[0])
        grp_name = entry[1] if len(entry) > 1 else ""
        grp_cells = cells_by_grp.get(grp_num, {})

        by_col_idx = {}
        for melder_nr, c in grp_cells.items():
            try:
                col_idx = int(melder_nr)
            except ValueError:
                continue
            by_col_idx[col_idx] = c
            max_cols = max(max_cols, col_idx)

        rows.append({"group_id": grp_num, "group_name": grp_name, "cells_by_col": by_col_idx})

    return rows, max_cols, hw_rows, last_changed_at


class FooterCanvas(pdfcanvas.Canvas):
    """Standard ReportLab two-pass trick to print 'Seite N von M' footers --
    SimpleDocTemplate only knows the current page number as it draws, not the
    eventual total, so every page's canvas state is buffered and re-drawn once
    the total is known."""
    def __init__(self, *args, **kwargs):
        pdfcanvas.Canvas.__init__(self, *args, **kwargs)
        self._saved_states = []
        self._page_width = kwargs.get("pagesize", A4)[0]

    def showPage(self):
        self._saved_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total_pages = len(self._saved_states)
        for i, state in enumerate(self._saved_states, start=1):
            self.__dict__.update(state)
            self._draw_footer(i, total_pages)
            pdfcanvas.Canvas.showPage(self)
        pdfcanvas.Canvas.save(self)

    def _draw_footer(self, page_num, total_pages):
        width = self._page_width
        self.setStrokeColor(LINE)
        self.setLineWidth(0.5)
        self.line(MARGIN, 14 * mm, width - MARGIN, 14 * mm)
        self.setFont("Courier", 7.5)
        self.setFillColor(MUTED)
        self.drawString(MARGIN, 9 * mm, getattr(self, "_footer_left", ""))
        self.drawRightString(width - MARGIN, 9 * mm, f"Seite {page_num} von {total_pages}")


def build_styles():
    return {
        "doc_kind": ParagraphStyle("DocKind", fontName="Helvetica-Bold", fontSize=9,
                                    textColor=ACCENT, alignment=TA_RIGHT, leading=11),
        "doc_title": ParagraphStyle("DocTitle", fontName="Helvetica-Bold", fontSize=14,
                                     textColor=INK, alignment=TA_RIGHT, leading=17),
        "company_name": ParagraphStyle("CompanyName", fontName="Helvetica-Bold", fontSize=12,
                                        textColor=INK, leading=14),
        "m_label": ParagraphStyle("MLabel", fontName="Helvetica-Bold", fontSize=6.5,
                                   textColor=MUTED, leading=9),
        "m_value": ParagraphStyle("MValue", fontName="Helvetica-Bold", fontSize=9.5,
                                   textColor=INK, leading=12),
        "summary_body": ParagraphStyle("SumBody", fontName="Helvetica", fontSize=9, textColor=INK, leading=13),
        "blank_notice": ParagraphStyle("BlankNotice", fontName="Helvetica-Bold", fontSize=9,
                                        textColor=ACCENT, alignment=TA_CENTER),
        "section_title": ParagraphStyle("SectionTitle", fontName="Helvetica-Bold", fontSize=8.5,
                                         textColor=INK, leading=11),
        "hw_text": ParagraphStyle("HwText", fontName="Helvetica", fontSize=7.5,
                                   textColor=INK, leading=9.5),
        "hw_label": ParagraphStyle("HwLabel", fontName="Helvetica-Bold", fontSize=7.5,
                                    textColor=INK, leading=9.5),
    }


def build_letterhead(styles, p_info, dev_name, dev_type, logo_path, company_name):
    if logo_path:
        # Image() needs a local path or file-like object -- read via storage
        # so this works whether logo_path is local or a remote UNC path.
        logo_cell = Image(io.BytesIO(storage.read_bytes(logo_path)), width=22 * mm, height=15 * mm, kind="proportional")
    else:
        logo_cell = Table(
            [[""]], colWidths=[9 * mm], rowHeights=[9 * mm],
            style=TableStyle([("BOX", (0, 0), (-1, -1), 1.2, INK)])
        )

    # Logo column needs real breathing room -- it was previously only 12mm
    # wide while the logo image itself renders up to 22mm wide, so real
    # logos overflowed straight into the company name text next to them.
    company_block = Table(
        [[logo_cell, Table(
            [[Paragraph(company_name, styles["company_name"])]],
            colWidths=[58 * mm],
            style=TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 0),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 0)])
        )]],
        colWidths=[26 * mm, 58 * mm],
        style=TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (0, 0), 0)])
    )

    title_block = Table(
        [[Paragraph("Wartungsprotokoll" + (" — BLANKOVORLAGE" if dev_type == "__blank__" else ""), styles["doc_kind"])],
         [Paragraph(dev_name, styles["doc_title"])]],
        colWidths=[100 * mm],
        style=TableStyle([("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)])
    )

    header = Table([[company_block, title_block]], colWidths=[None, None])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -1), 1.4, INK),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return header


def build_meta_grid(styles, p_info, is_blank):
    def cell(label, value):
        return [Paragraph(label, styles["m_label"]), Paragraph(str(value), styles["m_value"])]

    date_label = "LETZTE PRÜFUNG:" if not is_blank else "ERSTELLT AM"
    date_value = (p_info["last_edited_at"] or "–") if not is_blank else datetime.now().strftime("%d.%m.%Y")

    data = [
        cell("KUNDE / OBJEKT", p_info["name"]) + cell("VERTRAGS-NR.", p_info["contract_number"]),
        cell("ADRESSE", p_info["address"] or "–") + cell("INTERVALL", p_info["interval"]),
        cell("ZULETZT BEARBEITET DURCH", "–" if is_blank else (p_info["last_edited_by"] or "–")) + cell(date_label, date_value),
    ]
    t = Table(data, colWidths=[32 * mm, 55 * mm, 32 * mm, 55 * mm])
    t.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    return t


def compute_layout(rows_data, max_cols):
    """Sizes the Bezeichnung column to exactly fit its widest label, then decides
    portrait vs. landscape A4 -- portrait stays the default, landscape only kicks
    in once the melder count genuinely needs the extra width."""
    widest_label = max(
        (stringWidth(r["group_name"] or "", "Helvetica-Bold", 7.5) for r in rows_data),
        default=0
    )
    header_min = stringWidth("Bezeichnung", "Courier-Bold", 7)
    bezeichnung_width = min(max(widest_label, header_min) + 10, MAX_BEZEICHNUNG_WIDTH)

    fixed_width = GRP_COL_WIDTH + bezeichnung_width + ANZAHL_COL_WIDTH
    col_span = max(1, max_cols)

    portrait_content_width = portrait(A4)[0] - 2 * MARGIN
    landscape_content_width = landscape(A4)[0] - 2 * MARGIN

    required_min_width = fixed_width + col_span * MIN_COL_WIDTH
    if required_min_width <= portrait_content_width:
        page_size = portrait(A4)
        content_width = portrait_content_width
    else:
        page_size = landscape(A4)
        content_width = landscape_content_width

    melder_col_width = max(MIN_COL_WIDTH, (content_width - fixed_width) / col_span)
    return page_size, bezeichnung_width, melder_col_width, col_span


def build_matrix_table(rows_data, max_cols, bezeichnung_width, melder_col_width, col_span, is_blank):
    header = ["Grp.", "Bezeichnung", "Anzahl"] + [str(i) for i in range(1, col_span + 1)]
    table_data = [header]
    cell_styles = []

    for r_idx, row in enumerate(rows_data, start=1):
        active_count = sum(1 for c in row["cells_by_col"].values() if c["detector_type"] != "-")
        line = [row["group_id"], row["group_name"], str(active_count)]

        for col in range(1, col_span + 1):
            c = row["cells_by_col"].get(col)
            # Grp, Bezeichnung, Anzahl (indices 0-2) precede the melder columns,
            # so melder position N sits at table column index N+2.
            col_offset = col + 2
            if c is None or c["detector_type"] == "-":
                line.append("–")
                cell_styles.append(("bg", r_idx, col_offset, NO_MELDER_BG, False))
                cell_styles.append(("fg", r_idx, col_offset, MUTED, False))
            elif is_blank:
                line.append("")
            elif c["value"] in ("Def.", "Fehler"):
                line.append("Def.")
                cell_styles.append(("bg", r_idx, col_offset, ACCENT, True))
                cell_styles.append(("fg", r_idx, col_offset, colors.white, True))
            elif c["value"] == "":
                line.append("")
            else:
                line.append(c["value"])
                cell_styles.append(("bg", r_idx, col_offset, OK_GREEN_BG, False))
                cell_styles.append(("fg", r_idx, col_offset, OK_GREEN, False))
        table_data.append(line)

    col_widths = [GRP_COL_WIDTH, bezeichnung_width, ANZAHL_COL_WIDTH] + [melder_col_width] * col_span
    t = Table(table_data, colWidths=col_widths, repeatRows=1)

    style = [
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Courier-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 7),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("ALIGN", (1, 1), (1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ROW_ALT]),
        # Grp and Anzahl are both compact numeric/ID labels -- same monospace
        # treatment so they read as a matching pair. Bezeichnung is the one
        # column meant to be read as text. Melder cells stay uniformly
        # monospace regardless of status; only the Def. background carries
        # emphasis, so the grid doesn't look like three unrelated fonts stitched
        # together.
        ("FONTNAME", (0, 1), (0, -1), "Courier-Bold"),
        ("FONTNAME", (1, 1), (1, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 1), (2, -1), "Courier-Bold"),
        ("FONTNAME", (3, 1), (-1, -1), "Courier"),
        ("FONTSIZE", (0, 1), (-1, -1), 7.5),
        ("TEXTCOLOR", (0, 1), (0, -1), MUTED),
        ("TEXTCOLOR", (2, 1), (2, -1), MUTED),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for kind, r_idx, c_idx, color, bold in cell_styles:
        if kind == "bg":
            style.append(("BACKGROUND", (c_idx, r_idx), (c_idx, r_idx), color))
        else:
            style.append(("TEXTCOLOR", (c_idx, r_idx), (c_idx, r_idx), color))
            if bold:
                style.append(("FONTNAME", (c_idx, r_idx), (c_idx, r_idx), "Courier-Bold"))

    t.setStyle(TableStyle(style))
    return t


def build_hardware_table(hw_rows, styles, is_blank):
    """Zentrale/Ringkarten-Inventar, optional per Gerät -- independent second
    table below the Melderliste. Columns 1-3 and 6 (Hardware/Bezeichnung/Typ/
    Software Stand) are free text; 4-5 (Störung/Unterbrechung) are Auslösefelder
    using the exact color convention as the Melderliste's status cells."""
    header = ["Hardware", "Bezeichnung", "Typ", "Störung", "Unterbrechung", "Software Stand"]
    table_data = [header]
    cell_styles = []

    for r_idx, row in enumerate(hw_rows, start=1):
        line = [
            Paragraph(row.get("hardware", "") or "", styles["hw_label"]),
            Paragraph(row.get("bezeichnung", "") or "", styles["hw_text"]),
            Paragraph(row.get("typ", "") or "", styles["hw_text"]),
        ]
        for col_idx, field in ((3, "stoerung"), (4, "unterbrechung")):
            val = row.get(field, "") or ""
            if is_blank:
                line.append("")
            elif val in ("Def.", "Fehler"):
                line.append("Def.")
                cell_styles.append(("bg", r_idx, col_idx, ACCENT, True))
                cell_styles.append(("fg", r_idx, col_idx, colors.white, True))
            elif val == "":
                line.append("–")
                cell_styles.append(("fg", r_idx, col_idx, MUTED, False))
            else:
                line.append(val)
                cell_styles.append(("bg", r_idx, col_idx, OK_GREEN_BG, False))
                cell_styles.append(("fg", r_idx, col_idx, OK_GREEN, False))
        line.append(Paragraph((row.get("sw_stand", "") or "") if not is_blank else "", styles["hw_text"]))
        table_data.append(line)

    col_widths = [26 * mm, 42 * mm, 26 * mm, 24 * mm, 26 * mm, 26 * mm]
    t = Table(table_data, colWidths=col_widths, repeatRows=1)

    style = [
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Courier-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 7),
        ("ALIGN", (0, 0), (2, -1), "LEFT"),
        ("ALIGN", (3, 0), (4, -1), "CENTER"),
        ("ALIGN", (5, 0), (5, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ROW_ALT]),
        ("FONTNAME", (3, 1), (4, -1), "Courier"),
        ("FONTSIZE", (3, 1), (4, -1), 7.5),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]
    for kind, r_idx, c_idx, color, bold in cell_styles:
        if kind == "bg":
            style.append(("BACKGROUND", (c_idx, r_idx), (c_idx, r_idx), color))
        else:
            style.append(("TEXTCOLOR", (c_idx, r_idx), (c_idx, r_idx), color))
            if bold:
                style.append(("FONTNAME", (c_idx, r_idx), (c_idx, r_idx), "Courier-Bold"))

    t.setStyle(TableStyle(style))
    return t


def build_summary(styles, rows_data, hw_rows=None):
    total_groups = len(rows_data)
    active = triggered = defective = 0
    for row in rows_data:
        for c in row["cells_by_col"].values():
            if c["detector_type"] == "-":
                continue
            active += 1
            if c["value"] == "":
                continue
            elif c["value"] in ("Def.", "Fehler"):
                defective += 1
            else:
                triggered += 1

    # A Def. at the Zentrale or a Ringkarte is a defect just like a Def. melder --
    # counts toward the same "Defekt(e) festgestellt" figure, not tracked separately.
    for hw_row in (hw_rows or []):
        for field in ("stoerung", "unterbrechung"):
            if hw_row.get(field) in ("Def.", "Fehler"):
                defective += 1

    quota = f"{(triggered / active * 100):.1f}%" if active else "–"
    summary_text = (
        f"<b>Zusammenfassung:</b> {total_groups} Meldergruppen, {active} Melder aktiv, "
        f"{triggered} geprüft ({quota}). "
        f"<font color='{'#c1481f' if defective else '#3d6b52'}'><b>{defective} Defekt(e)</b></font> festgestellt."
    )
    box = Table([[Paragraph(summary_text, styles["summary_body"])]], colWidths=[None])
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("BOX", (0, 0), (-1, -1), 1, LINE),
        ("PADDING", (0, 0), (-1, -1), 8),
    ]))
    return box, defective


def get_pruefer_quarters(interval):
    """Which quarters of the current year are relevant for the 'Prüfer' history
    section, based on the device's Prüfintervall. 'Halbjährlich' checks land at
    the end of each half (Q2/Q4), 'Jährlich' at year end (Q4); anything else
    (Quartalsweise, or an unrecognized interval) shows all four."""
    interval_lower = (interval or "").lower()
    year = datetime.now().year
    if "halbjähr" in interval_lower or "halbjahr" in interval_lower:
        quarters = [2, 4]
    elif "jähr" in interval_lower or "jahr" in interval_lower:
        quarters = [4]
    else:
        quarters = [1, 2, 3, 4]
    return [f"{year}-Q{q}" for q in quarters]


def get_pruefer_rows(cursor, protocol_id, group_id, interval):
    """One row per relevant quarter: (label, technician names, last edit date)
    pulled from device_edit_history -- distinct technicians in edit order,
    dated by the most recent edit in that quarter."""
    rows = []
    for q in get_pruefer_quarters(interval):
        cursor.execute(
            "SELECT technician_name, edited_at FROM device_edit_history "
            "WHERE protocol_id = ? AND group_id = ? AND quarter = ? ORDER BY edited_at",
            (protocol_id, group_id, q)
        )
        entries = cursor.fetchall()
        q_num = q.split("-Q")[1]
        label = f"Prüfer Q{q_num}"
        if not entries:
            rows.append((label, "–", "–"))
            continue
        names = []
        for e in entries:
            name = e["technician_name"] or "–"
            if name not in names:
                names.append(name)
        last_date = datetime.fromtimestamp(entries[-1]["edited_at"] / 1000).strftime("%d.%m.%Y")
        rows.append((label, ", ".join(names), last_date))
    return rows


def build_pruefer_section(styles, pruefer_rows):
    data = [["Quartal", "Bearbeitet von", "Datum"]] + [list(r) for r in pruefer_rows]
    t = Table(data, colWidths=[28 * mm, None, 28 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Courier-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 7),
        ("FONTNAME", (0, 1), (0, -1), "Courier-Bold"),
        ("FONTNAME", (1, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 7.5),
        ("TEXTCOLOR", (0, 1), (0, -1), MUTED),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ROW_ALT]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def generate_device_pdf(mandant_folder, p_info, dev_name, dev_type, rows_data, max_cols, is_blank=False, company_name=None, pruefer_rows=None, hw_rows=None):
    """Builds one Gerät's protocol PDF (filled or blank) and writes it to the
    active path, archiving whatever was there before."""
    if not is_blank:
        archive_existing_device_pdf(mandant_folder, p_info, dev_name, dev_type)
        pdf_path = active_pdf_path(mandant_folder, p_info, dev_name, dev_type)
    else:
        pdf_path = blank_pdf_path(mandant_folder, p_info, dev_name, dev_type)

    storage.makedirs(storage.dirname(pdf_path))
    print(f"[CORE-WORKER] Generating {'Blanko-' if is_blank else ''}PDF for Gerät '{dev_name}' ({mandant_folder}) at: {pdf_path}")

    page_size, bezeichnung_width, melder_col_width, col_span = compute_layout(rows_data, max_cols)

    # Build into an in-memory buffer, then hand the finished bytes to storage --
    # ReportLab's canvas does a lot of seek()/tell() while building, which a
    # local BytesIO always supports cleanly regardless of storage backend.
    pdf_buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        pdf_buffer, pagesize=page_size,
        leftMargin=MARGIN, rightMargin=MARGIN, topMargin=12 * mm, bottomMargin=18 * mm
    )

    styles = build_styles()
    logo_path = find_logo_path(mandant_folder)

    story = [
        build_letterhead(styles, p_info, dev_name, "__blank__" if is_blank else dev_type, logo_path, company_name or COMPANY_NAME),
        Spacer(1, 5 * mm),
        build_meta_grid(styles, p_info, is_blank),
        Spacer(1, 4 * mm),
    ]
    if is_blank:
        story.append(Paragraph("Blankovorlage zur handschriftlichen Ausfüllung — keine Werte gespeichert.", styles["blank_notice"]))
        story.append(Spacer(1, 3 * mm))

    story.append(build_matrix_table(rows_data, max_cols, bezeichnung_width, melder_col_width, col_span, is_blank))
    story.append(Spacer(1, 4 * mm))

    if not is_blank:
        summary_box, defective_count = build_summary(styles, rows_data, hw_rows)
        story.append(summary_box)
    else:
        defective_count = 0

    if hw_rows:
        story.append(Spacer(1, 6 * mm))
        story.append(Paragraph("Hardware", styles["section_title"]))
        story.append(Spacer(1, 2 * mm))
        story.append(build_hardware_table(hw_rows, styles, is_blank))

    if not is_blank and pruefer_rows:
        story.append(Spacer(1, 6 * mm))
        story.append(Paragraph("Bearbeitungsverlauf", styles["section_title"]))
        story.append(Spacer(1, 2 * mm))
        story.append(build_pruefer_section(styles, pruefer_rows))

    footer_left = f"{company_name or COMPANY_NAME} · {dev_name} ({p_info['contract_number']})"

    def _make_canvas(*args, **kwargs):
        kwargs["pagesize"] = page_size
        c = FooterCanvas(*args, **kwargs)
        c._footer_left = footer_left
        return c

    doc.build(story, canvasmaker=_make_canvas)
    pdf_bytes = pdf_buffer.getvalue()
    storage.write_bytes(pdf_path, pdf_bytes)
    print(f"[CORE-WORKER] PDF built for '{dev_name}' — {len(rows_data)} Meldergruppen"
          + ("" if is_blank else f", {defective_count} Defekt(e)."))
    return pdf_bytes


# ── Internal-only HTTP API ──────────────────────────────────────────────────
# protocol_core has no published port in docker-compose.yml -- this is only
# reachable from other containers on the internal_lan Docker network (webui),
# never from outside. Used for the WebUI's "Druck Blanko" button, which needs
# the PDF back immediately to open in the browser, unlike the normal
# blank_pdf_requested_at flag the 5s poll loop picks up asynchronously.
app = Flask(__name__)


@app.route("/generate-blank/<protocol_id>/<group_id>", methods=["POST"])
def generate_blank_now(protocol_id, group_id):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        ensure_schema(cursor)
        rows_data, max_cols, hw_rows, _ = expand_device(cursor, protocol_id, group_id)
        if not rows_data:
            return jsonify({"success": False, "error": "Keine Auslöseliste für dieses Gerät gefunden."}), 404

        p_row = cursor.execute("SELECT * FROM protocols WHERE id = ?", (protocol_id,)).fetchone()
        dev = cursor.execute(
            "SELECT * FROM protocol_groups WHERE protocol_id = ? AND group_id = ?", (protocol_id, group_id)
        ).fetchone()
        if not p_row or not dev:
            return jsonify({"success": False, "error": "Vertrag oder Gerät nicht gefunden."}), 404

        p_info = dict(p_row)
        dev_name = dev["group_name"] or group_id
        dev_type = dev["anlage_type"] or dev["group_type"] or p_info["system_type"]

        mandant_row = cursor.execute(
            "SELECT name, company_name FROM mandanten WHERE id = ?", (p_info["mandant_id"] or "standard",)
        ).fetchone()
        mandant_folder = sanitize_filename(mandant_row["name"]) if mandant_row else "Standard"
        company_name = (mandant_row["company_name"] if mandant_row and mandant_row["company_name"] else None) or COMPANY_NAME

        pdf_bytes = generate_device_pdf(mandant_folder, p_info, dev_name, dev_type, rows_data, max_cols, is_blank=True, company_name=company_name, hw_rows=hw_rows)

        now_ms = int(time.time() * 1000)
        cursor.execute(
            "UPDATE protocol_groups SET blank_generated_at = ?, blank_pdf_requested_at = 0 "
            "WHERE protocol_id = ? AND group_id = ?",
            (now_ms, protocol_id, group_id)
        )
        conn.commit()
        return Response(pdf_bytes, mimetype="application/pdf")
    except Exception as e:
        print(f"[CORE-WORKER] generate-blank failed for '{protocol_id}/{group_id}': {e}", file=sys.stderr)
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()


def run_worker_cycle():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        ensure_schema(cursor)

        # Every device with an Auslöseliste is a candidate for a blank template --
        # that's independent of sync status, since a blank protocol is needed for
        # paper fill-in as soon as the Anlage + Meldergruppen structure exists, even
        # before a technician has ever synchronized real values. The filled PDF is
        # gated on status='synchronized' separately, below.
        cursor.execute("""
            SELECT pg.protocol_id, pg.group_id, pg.pdf_generated_at, pg.blank_generated_at,
                   pg.blank_pdf_requested_at, p.status AS protocol_status, p.mandant_id AS mandant_id
            FROM protocol_groups pg
            JOIN protocols p ON p.id = pg.protocol_id
            WHERE EXISTS (
                SELECT 1 FROM group_cells gc
                WHERE gc.protocol_id = pg.protocol_id AND gc.group_id = pg.group_id AND gc.slot_key = '__rows__'
              )
        """)
        candidates = cursor.fetchall()
        mandant_folder_cache = {}

        for cand in candidates:
            p_id = cand["protocol_id"]
            group_id = cand["group_id"]
            try:
                rows_data, max_cols, hw_rows, last_changed_at = expand_device(cursor, p_id, group_id)
                if not rows_data:
                    continue

                cursor.execute("SELECT * FROM protocols WHERE id = ?", (p_id,))
                p_info = dict(cursor.fetchone())
                cursor.execute("SELECT * FROM protocol_groups WHERE protocol_id = ? AND group_id = ?", (p_id, group_id))
                dev = cursor.fetchone()
                dev_name = dev["group_name"] or group_id
                dev_type = dev["anlage_type"] or dev["group_type"] or p_info["system_type"]

                mandant_id = cand["mandant_id"] or "standard"
                if mandant_id not in mandant_folder_cache:
                    cursor.execute("SELECT name, company_name FROM mandanten WHERE id = ?", (mandant_id,))
                    m_row = cursor.fetchone()
                    mandant_folder_cache[mandant_id] = (
                        sanitize_filename(m_row["name"]) if m_row else "Standard",
                        (m_row["company_name"] if m_row and m_row["company_name"] else None) or COMPANY_NAME,
                    )
                mandant_folder, company_name = mandant_folder_cache[mandant_id]

                needs_regen = cand["protocol_status"] == "synchronized" and last_changed_at > (cand["pdf_generated_at"] or 0)
                needs_blank = (
                    last_changed_at > (cand["blank_generated_at"] or 0)
                    or (cand["blank_pdf_requested_at"] or 0) > 0
                )

                now_ms = int(time.time() * 1000)

                if needs_regen:
                    pruefer_rows = get_pruefer_rows(cursor, p_id, group_id, p_info["interval"])
                    generate_device_pdf(mandant_folder, p_info, dev_name, dev_type, rows_data, max_cols, is_blank=False, company_name=company_name, pruefer_rows=pruefer_rows, hw_rows=hw_rows)
                    cursor.execute(
                        "UPDATE protocol_groups SET pdf_generated_at = ? WHERE protocol_id = ? AND group_id = ?",
                        (now_ms, p_id, group_id)
                    )

                if needs_blank:
                    generate_device_pdf(mandant_folder, p_info, dev_name, dev_type, rows_data, max_cols, is_blank=True, company_name=company_name, hw_rows=hw_rows)
                    cursor.execute(
                        "UPDATE protocol_groups SET blank_generated_at = ?, blank_pdf_requested_at = 0 "
                        "WHERE protocol_id = ? AND group_id = ?",
                        (now_ms, p_id, group_id)
                    )

                if needs_regen or needs_blank:
                    conn.commit()
            except Exception as e:
                print(f"[CORE-WORKER] Failed to generate PDF for '{p_id}/{group_id}': {e}", file=sys.stderr)

        conn.close()
    except Exception as e:
        print(f"[CORE-WORKER] SQL ERROR/CORE PIPELINE FAILURE: {str(e)}", file=sys.stderr)


def _poll_loop():
    while True:
        run_worker_cycle()
        time.sleep(5)


if __name__ == "__main__":
    print("[CORE-WORKER] ProtocolCore automated daemon started. Monitoring SQLite for sync events...")
    # Per-Mandant folders (incl. Archiv/) are created on demand by the path
    # helpers above as soon as a device belonging to that Mandant needs one.

    threading.Thread(target=_poll_loop, daemon=True).start()
    app.run(host="0.0.0.0", port=5001)
