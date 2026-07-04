# -*- coding: utf-8 -*-
import os
import sys
import time
import json
import sqlite3
import shutil
from datetime import datetime

from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.pdfgen import canvas as pdfcanvas

DB_PATH = os.environ.get("DB_PATH", "/shared_db/protocols.db")
SAMBA_SHARE_PATH = os.environ.get("SAMBA_SHARE_PATH", "/samba_shares")
# Drop a logo.png/logo.jpg into the Samba share to brand the PDFs -- no rebuild needed.
LOGO_PATH_CANDIDATES = [
    os.environ.get("LOGO_PATH", ""),
    os.path.join(SAMBA_SHARE_PATH, "logo.png"),
    os.path.join(SAMBA_SHARE_PATH, "logo.jpg"),
]
COMPANY_NAME = os.environ.get("COMPANY_NAME", "Firmenname GmbH")
COMPANY_SUBTITLE = os.environ.get("COMPANY_SUBTITLE", "Brandschutz & Sicherheitstechnik")

# ── Palette (matches the approved "Raster-Matrix" mockup) ───────────────────────
INK = colors.HexColor("#1c2530")
ACCENT = colors.HexColor("#c1481f")   # defects only
OK_GREEN = colors.HexColor("#3d6b52")  # geprüft / i.O.
MUTED = colors.HexColor("#736b5c")
LINE = colors.HexColor("#dbd6c9")
PAPER = colors.HexColor("#f7f5f0")
ROW_ALT = colors.HexColor("#f1efe8")


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_schema(cursor):
    """Tracks when a protocol was last turned into a PDF, so re-synchronizations
    (a new quarter, a corrected value) reliably trigger a fresh document instead of
    the previous 'skip if a file already exists' check, which could never re-fire."""
    try:
        cursor.execute("ALTER TABLE protocols ADD COLUMN pdf_generated_at INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass


def find_logo_path():
    for candidate in LOGO_PATH_CANDIDATES:
        if candidate and os.path.exists(candidate):
            return candidate
    return None


# ── Unified per-device storage expansion (mirrors netlink/main.py's ────────────
# build_device_rows_payload -- kept in sync manually since protocol_core is a
# separate deployable that only shares the SQLite file, not code, with netlink.)

def device_rows(cursor, protocol_id):
    """One protocol_groups row is one Gerät; its Melder-Gruppen live in group_cells
    via a '__rows__' registry cell plus real per-Melder rows keyed
    slot_key="{grp_num}_{melder_nr}". Returns (rows, max_cols) with one row per
    Melder-Gruppe across ALL devices of the protocol, ready for the matrix table."""
    cursor.execute("SELECT * FROM protocol_groups WHERE protocol_id = ?", (protocol_id,))
    devices = cursor.fetchall()

    rows = []
    max_cols = 0

    for dev in devices:
        cursor.execute(
            "SELECT slot_key, detector_type, value FROM group_cells WHERE protocol_id = ? AND group_id = ?",
            (protocol_id, dev["group_id"])
        )
        cells = cursor.fetchall()

        registry_cell = next((c for c in cells if c["slot_key"] == "__rows__"), None)
        if not registry_cell:
            continue  # device shell without an Auslöseliste yet -- nothing to print
        try:
            registry = json.loads(registry_cell["value"])
        except Exception:
            continue

        cells_by_grp = {}
        for c in cells:
            if c["slot_key"] == "__rows__" or "_" not in c["slot_key"]:
                continue
            grp_num, melder_nr = c["slot_key"].split("_", 1)
            cells_by_grp.setdefault(grp_num, {})[melder_nr] = c

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

            rows.append({
                "group_id": grp_num,
                "group_name": grp_name,
                "group_type": dev["group_type"] or "NAM",
                "cells_by_col": by_col_idx,
            })

    return rows, max_cols


def get_year_half_year():
    now = datetime.now()
    return str(now.year), ("H1" if now.month <= 6 else "H2")


def archive_existing_protocol(contract_number):
    """Moves the currently active PDF (if any) to Archiv/<Vertrag>/<Jahr>/<H1|H2>/
    before a new one takes its place under Protokolle/."""
    active_pdf_path = os.path.join(SAMBA_SHARE_PATH, "Protokolle", f"{contract_number}.pdf")
    if not os.path.exists(active_pdf_path):
        return

    year, half_year = get_year_half_year()
    archive_dir = os.path.join(SAMBA_SHARE_PATH, "Archiv", contract_number, year, half_year)
    os.makedirs(archive_dir, exist_ok=True)

    existing_files = [f for f in os.listdir(archive_dir) if f.startswith(contract_number) and f.endswith(".pdf")]
    next_version = len(existing_files) + 1
    archived_pdf_path = os.path.join(archive_dir, f"{contract_number}_V{next_version}.pdf")

    print(f"[ARCHIVER] Archiving previous version to: {archived_pdf_path}")
    shutil.move(active_pdf_path, archived_pdf_path)


class FooterCanvas(pdfcanvas.Canvas):
    """Standard ReportLab two-pass trick to print 'Seite N von M' footers --
    SimpleDocTemplate only knows the current page number as it draws, not the
    eventual total, so every page's canvas state is buffered and re-drawn once
    the total is known."""
    def __init__(self, *args, **kwargs):
        pdfcanvas.Canvas.__init__(self, *args, **kwargs)
        self._saved_states = []
        self._footer_text = kwargs.pop("footer_text", "")

    def showPage(self):
        # Buffer this page's state and reset for the next one WITHOUT emitting it yet
        # (that's what the real showPage() would do) -- otherwise save() below would
        # flush every page a second time, doubling the page count.
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
        width, _ = landscape(A4)
        self.setStrokeColor(LINE)
        self.setLineWidth(0.5)
        self.line(20 * mm, 14 * mm, width - 20 * mm, 14 * mm)
        self.setFont("Courier", 7.5)
        self.setFillColor(MUTED)
        self.drawString(20 * mm, 9 * mm, getattr(self, "_footer_left", ""))
        self.drawRightString(width - 20 * mm, 9 * mm, f"Seite {page_num} von {total_pages}")


def build_styles():
    return {
        "doc_kind": ParagraphStyle("DocKind", fontName="Helvetica-Bold", fontSize=9,
                                    textColor=ACCENT, alignment=TA_RIGHT, leading=11),
        "doc_title": ParagraphStyle("DocTitle", fontName="Helvetica-Bold", fontSize=15,
                                     textColor=INK, alignment=TA_RIGHT, leading=18),
        "company_name": ParagraphStyle("CompanyName", fontName="Helvetica-Bold", fontSize=13,
                                        textColor=INK, leading=15),
        "company_sub": ParagraphStyle("CompanySub", fontName="Helvetica", fontSize=7.5,
                                       textColor=MUTED, leading=10),
        "m_label": ParagraphStyle("MLabel", fontName="Helvetica-Bold", fontSize=6.5,
                                   textColor=MUTED, leading=9),
        "m_value": ParagraphStyle("MValue", fontName="Helvetica-Bold", fontSize=10,
                                   textColor=INK, leading=13),
        "summary_head": ParagraphStyle("SumHead", fontName="Helvetica-Bold", fontSize=10, textColor=INK),
        "summary_body": ParagraphStyle("SumBody", fontName="Helvetica", fontSize=9.5, textColor=INK, leading=14),
    }


def build_letterhead(styles, p_info, logo_path):
    if logo_path:
        logo_cell = Image(logo_path, width=26 * mm, height=18 * mm, kind="proportional")
    else:
        logo_cell = Table(
            [[""]], colWidths=[10 * mm], rowHeights=[10 * mm],
            style=TableStyle([
                ("BOX", (0, 0), (-1, -1), 1.4, INK),
                ("LINEBELOW", (0, 0), (-1, -1), 0, INK),
            ])
        )

    company_block = Table(
        [[logo_cell, Table(
            [[Paragraph(COMPANY_NAME, styles["company_name"])],
             [Paragraph(COMPANY_SUBTITLE, styles["company_sub"])]],
            colWidths=[70 * mm], style=TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 6),
                                                     ("TOPPADDING", (0, 0), (-1, -1), 0),
                                                     ("BOTTOMPADDING", (0, 0), (-1, -1), 0)])
        )]],
        colWidths=[14 * mm, 74 * mm],
        style=TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (0, 0), 0)])
    )

    title_block = Table(
        [[Paragraph("Wartungsprotokoll", styles["doc_kind"])],
         [Paragraph(f"{p_info['system_type']}-Anlage", styles["doc_title"])]],
        colWidths=[110 * mm],
        style=TableStyle([("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)])
    )

    header = Table([[company_block, title_block]], colWidths=[None, None])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -1), 1.4, INK),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return header


def build_meta_grid(styles, p_info):
    def cell(label, value):
        return [Paragraph(label, styles["m_label"]), Paragraph(str(value), styles["m_value"])]

    data = [
        cell("KUNDE / OBJEKT", p_info["name"]) + cell("VERTRAGS-NR.", p_info["contract_number"]),
        cell("ADRESSE", p_info["address"] or "–") + cell("INTERVALL", p_info["interval"]),
        cell("TECHNIKER", p_info["last_edited_by"] or "–") + cell("PRÜFDATUM", p_info["last_edited_at"] or "–"),
    ]
    t = Table(data, colWidths=[38 * mm, 60 * mm, 38 * mm, 60 * mm])
    t.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def build_matrix_table(rows_data, max_cols):
    col_span = max(1, max_cols)
    header = ["Grp.", "Bezeichnung"] + [str(i) for i in range(1, col_span + 1)]
    table_data = [header]
    cell_styles = []  # list of (row_idx, col_idx, color) overrides, applied after table build

    for r_idx, row in enumerate(rows_data, start=1):
        line = [row["group_id"], row["group_name"]]
        for col in range(1, col_span + 1):
            c = row["cells_by_col"].get(col)
            if c is None:
                line.append("")
                continue
            if c["detector_type"] == "-":
                line.append("–")
            elif c["value"] == "":
                line.append("?")
                cell_styles.append((r_idx, col + 1, MUTED, None))
            elif c["value"] in ("Def.", "Fehler"):
                line.append("Def.")
                cell_styles.append((r_idx, col + 1, ACCENT, colors.white))
            else:
                line.append(c["value"])
                cell_styles.append((r_idx, col + 1, OK_GREEN, None))
        table_data.append(line)

    col_widths = [11 * mm, 44 * mm] + [max(7 * mm, (218 * mm - 55 * mm) / col_span)] * col_span
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
        ("FONTNAME", (0, 1), (0, -1), "Courier-Bold"),
        ("FONTNAME", (1, 1), (1, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 1), (-1, -1), "Courier"),
        ("FONTSIZE", (0, 1), (-1, -1), 7.5),
        ("TEXTCOLOR", (0, 1), (0, -1), MUTED),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for r_idx, c_idx, fg, bg in cell_styles:
        style.append(("TEXTCOLOR", (c_idx, r_idx), (c_idx, r_idx), fg))
        style.append(("FONTNAME", (c_idx, r_idx), (c_idx, r_idx), "Helvetica-Bold"))
        if bg is not None:
            style.append(("BACKGROUND", (c_idx, r_idx), (c_idx, r_idx), fg))
            style.append(("TEXTCOLOR", (c_idx, r_idx), (c_idx, r_idx), bg))

    t.setStyle(TableStyle(style))
    return t


def build_summary(styles, rows_data):
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

    quota = f"{(triggered / active * 100):.1f}%" if active else "–"
    summary_text = (
        f"<b>Zusammenfassung:</b> {total_groups} Meldergruppen, {active} Melder aktiv, "
        f"{triggered} geprüft ({quota}). "
        f"<font color='{'#c1481f' if defective else '#3d6b52'}'><b>{defective} Defekt(e)</b></font> festgestellt."
    )
    box = Table([[Paragraph(summary_text, styles["summary_body"])]], colWidths=[218 * mm])
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("BOX", (0, 0), (-1, -1), 1, LINE),
        ("PADDING", (0, 0), (-1, -1), 8),
    ]))
    return box, defective


def build_signature_block():
    t = Table(
        [["", ""], ["Techniker", "Auftraggeber (Gegenzeichnung)"]],
        colWidths=[109 * mm, 109 * mm], rowHeights=[14 * mm, 5 * mm]
    )
    t.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (0, 0), 0, colors.white),
        ("LINEBELOW", (0, 0), (0, 0), 0.8, INK),
        ("LINEBELOW", (1, 0), (1, 0), 0.8, INK),
        ("FONTNAME", (0, 1), (-1, 1), "Courier"),
        ("FONTSIZE", (0, 1), (-1, 1), 7),
        ("TEXTCOLOR", (0, 1), (-1, 1), MUTED),
        ("TOPPADDING", (0, 1), (-1, 1), 3),
    ]))
    return t


def generate_pdf(p_info, rows_data, max_cols):
    contract_number = p_info["contract_number"]
    archive_existing_protocol(contract_number)

    output_dir = os.path.join(SAMBA_SHARE_PATH, "Protokolle")
    os.makedirs(output_dir, exist_ok=True)
    pdf_path = os.path.join(output_dir, f"{contract_number}.pdf")

    print(f"[CORE-WORKER] Generating PDF for Vertrag '{contract_number}' at: {pdf_path}")

    page_size = landscape(A4)
    doc = SimpleDocTemplate(
        pdf_path, pagesize=page_size,
        leftMargin=20 * mm, rightMargin=20 * mm, topMargin=14 * mm, bottomMargin=18 * mm
    )

    styles = build_styles()
    logo_path = find_logo_path()

    story = [
        build_letterhead(styles, p_info, logo_path),
        Spacer(1, 6 * mm),
        build_meta_grid(styles, p_info),
        Spacer(1, 5 * mm),
        build_matrix_table(rows_data, max_cols),
        Spacer(1, 5 * mm),
    ]
    summary_box, defective_count = build_summary(styles, rows_data)
    story.append(summary_box)
    story.append(Spacer(1, 8 * mm))
    story.append(build_signature_block())

    footer_left = f"{COMPANY_NAME} · Prüfbericht Nr. {contract_number}-{p_info['last_edited_at'] or ''}"

    def _make_canvas(*args, **kwargs):
        c = FooterCanvas(*args, **kwargs)
        c._footer_left = footer_left
        return c

    doc.build(story, canvasmaker=_make_canvas)
    print(f"[CORE-WORKER] PDF built for '{contract_number}' — {len(rows_data)} Meldergruppen, {defective_count} Defekt(e).")


def run_worker_cycle():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        ensure_schema(cursor)

        # A protocol needs a (re-)generated PDF whenever it's synchronized AND has
        # changed since the last PDF was built -- not just "no file exists yet",
        # which could never re-fire after a quarter reset or a corrected value.
        cursor.execute("""
            SELECT * FROM protocols
            WHERE status = 'synchronized'
              AND updated_at > COALESCE(pdf_generated_at, 0)
              AND EXISTS (SELECT 1 FROM group_cells gc WHERE gc.protocol_id = protocols.id)
        """)
        protocols = cursor.fetchall()

        for p in protocols:
            p_id = p["id"]
            try:
                rows_data, max_cols = device_rows(cursor, p_id)
                if not rows_data:
                    continue  # synchronized but no Auslöseliste content to print yet
                generate_pdf(dict(p), rows_data, max_cols)
                cursor.execute(
                    "UPDATE protocols SET pdf_generated_at = ? WHERE id = ?",
                    (int(datetime.utcnow().timestamp() * 1000), p_id)
                )
                conn.commit()
            except Exception as e:
                print(f"[CORE-WORKER] Failed to generate PDF for '{p_id}': {e}", file=sys.stderr)

        conn.close()
    except Exception as e:
        print(f"[CORE-WORKER] SQL ERROR/CORE PIPELINE FAILURE: {str(e)}", file=sys.stderr)


if __name__ == "__main__":
    print("[CORE-WORKER] ProtocolCore automated daemon started. Monitoring SQLite for sync events...")

    os.makedirs(os.path.join(SAMBA_SHARE_PATH, "Melderlisten"), exist_ok=True)
    os.makedirs(os.path.join(SAMBA_SHARE_PATH, "Protokolle"), exist_ok=True)
    os.makedirs(os.path.join(SAMBA_SHARE_PATH, "Archiv"), exist_ok=True)

    while True:
        run_worker_cycle()
        time.sleep(5)
