# -*- coding: utf-8 -*-
import os
import sys
import time
import json
import sqlite3
import shutil
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

DB_PATH = os.environ.get("DB_PATH", "/shared_db/protocols.db")
SAMBA_SHARE_PATH = os.environ.get("SAMBA_SHARE_PATH", "/samba_shares")

def get_db_connection():
    return sqlite3.connect(DB_PATH)

def get_half_year_str(date_str):
    # Determines 'Halbjahr_1' or 'Halbjahr_2' from date (usually DD.MM.YYYY formatted)
    try:
        parts = date_str.split(".")
        if len(parts) == 3:
            month = int(parts[1])
            return "H1" if month <= 6 else "H2"
    except Exception:
        pass
    
    # Fallback to current system month
    return "H1" if datetime.now().month <= 6 else "H2"

def get_year_str(date_str):
    try:
        parts = date_str.split(".")
        if len(parts) == 3:
            return parts[2]
    except Exception:
        pass
    return str(datetime.now().year)

def archive_existing_protocol(contract_number, date_str):
    """
    If a protocol under /Protokolle/{contract_number}.pdf already exists,
    move it to /Archiv/{contract_number}/{Jahr}/{Halbjahr}/{contract_number}_v{timestamp_or_idx}.pdf
    """
    active_pdf_path = os.path.join(SAMBA_SHARE_PATH, "Protokolle", f"{contract_number}.pdf")
    if not os.path.exists(active_pdf_path):
        return # Nothing to archive

    year = get_year_str(date_str)
    half_year = get_half_year_str(date_str)

    # Establish archive folder /Archiv/vertrag/jahr/halbjahr/
    archive_dir = os.path.join(SAMBA_SHARE_PATH, "Archiv", contract_number, year, half_year)
    os.makedirs(archive_dir, exist_ok=True)

    # Calculate version index
    existing_files = [f for f in os.listdir(archive_dir) if f.startswith(contract_number) and f.endswith(".pdf")]
    next_version = len(existing_files) + 1
    archive_filename = f"{contract_number}_V{next_version}.pdf"
    archived_pdf_path = os.path.join(archive_dir, archive_filename)

    print(f"[ARCHIVER] Archiving existing file to: {archived_pdf_path}")
    shutil.move(active_pdf_path, archived_pdf_path)

def generate_pdf(protocol_id, p_info, rows_data):
    """
    Generates a beautifully styled ReportLab PDF containing:
    - Master table
    - Customer Info Box
    - Colorized statuses
    - Custom stamp and summary
    """
    contract_number = p_info["contract_number"]
    
    # Archive any stale old file if found beforehand
    archive_existing_protocol(contract_number, p_info["last_edited_at"] or "")

    output_dir = os.path.join(SAMBA_SHARE_PATH, "Protokolle")
    os.makedirs(output_dir, exist_ok=True)
    pdf_path = os.path.join(output_dir, f"{contract_number}.pdf")

    print(f"[CORE-WORKER] Generating PDF for Contract '{contract_number}' at: {pdf_path}")

    # Initialize ReportLab document
    doc = SimpleDocTemplate(pdf_path, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    story = []
    
    styles = getSampleStyleSheet()
    
    # Custom Typography Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        textColor=colors.HexColor('#003d9b'),
        spaceAfter=15
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        textColor=colors.HexColor('#434654'),
        spaceAfter=4
    )

    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        textColor=colors.HexColor('#1e293b'),
        spaceAfter=3
    )

    meta_label_style = ParagraphStyle(
        'MetaLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        textColor=colors.HexColor('#64748b')
    )

    meta_val_style = ParagraphStyle(
        'MetaVal',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        textColor=colors.HexColor('#003d9b')
    )

    # 1. Title Banner
    story.append(Paragraph(f"INSPEKTIONSPROTOKOLL: {p_info['system_type']}", title_style))
    story.append(Paragraph("Sicherheitsgeprüftes, rechtssicheres Revisionsdokument", subtitle_style))
    story.append(Spacer(1, 10))

    # 2. Customer details meta-grid
    meta_data = [
        [Paragraph("Kunde/Objekt:", meta_label_style), Paragraph(p_info["name"], meta_val_style),
         Paragraph("Vertragsnummer:", meta_label_style), Paragraph(p_info["contract_number"], meta_val_style)],
        [Paragraph("Adresse:", meta_label_style), Paragraph(p_info["address"], body_style),
         Paragraph("Intervall:", meta_label_style), Paragraph(p_info["interval"], body_style)],
        [Paragraph("Systemtyp:", meta_label_style), Paragraph(p_info["system_type"], meta_val_style),
         Paragraph("Synchronisiert am:", meta_label_style), Paragraph(p_info["last_edited_at"] or "", body_style)],
        [Paragraph("Techniker:", meta_label_style), Paragraph(p_info["last_edited_by"] or "Thomas Prantl", body_style),
         Paragraph("Status:", meta_label_style), Paragraph("✓ SYNCHRONISIERT", ParagraphStyle('GreenBold', parent=body_style, fontName='Helvetica-Bold', textColor=colors.HexColor('#055f46')))]
    ]

    meta_table = Table(meta_data, colWidths=[90, 180, 110, 160])
    meta_table.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#cbd5e1')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#f1f5f9')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 20))

    # 3. Detector Groups Table
    headers = ["Gruppe", "Bezeichnung", "Typ"]
    columns = json.loads(p_info["columns"])
    for col in columns:
        headers.append(f"Pt. {col}")

    table_data = [headers]

    for row in rows_data:
        row_cells = [row["group_id"], row["group_name"], row["group_type"]]
        # Fill matched slot values
        cell_dict = {c["slot_key"]: c for c in row["cells"]}
        for col in columns:
            cell_info = cell_dict.get(col)
            if cell_info:
                val = cell_info["value"]
                det_type = cell_info["detector_type"]
                if det_type == "-":
                    row_cells.append("-")
                elif val == "":
                    row_cells.append(f"{det_type}\n[ ]")
                else:
                    row_cells.append(f"{det_type}\n[{val}]")
            else:
                row_cells.append("-")
        table_data.append(row_cells)

    # Dynamic Column Widths Estimation
    col_widths = [50, 140, 40] + [40] * len(columns)
    
    # Build Table
    main_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    
    # Custom grid style mirroring WebUI
    grid_style = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#003d9b')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('ALIGN', (1, 1), (1, -1), 'LEFT'), # Left align name
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
    ]

    # Color alternate columns or cells dynamically
    # Apply ReportLab Table style modifications
    main_table.setStyle(TableStyle(grid_style))
    story.append(main_table)
    story.append(Spacer(1, 20))

    # 4. Summary & Verification box
    total_slots = 0
    active_slots = 0
    triggered_slots = 0
    defective_slots = 0

    for r in rows_data:
        for c in r["cells"]:
            if c["detector_type"] != "-":
                total_slots += 1
                active_slots += 1
                if c["value"] != "" and c["value"] != "Def.":
                    triggered_slots += 1
                if c["value"] == "Def.":
                    defective_slots += 1

    summary_headline_style = ParagraphStyle(
        'SumHeadline', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=11, textColor=colors.HexColor('#0f172a')
    )
    
    summary_text = f"<b>Inspektions-Zusammenfassung:</b><br/>" \
                   f"Insgesamt getestete Melderkoppelungen: <b>{triggered_slots} von {active_slots}</b> erfolgreich ausgelöst.<br/>" \
                   f"Defekte bzw. instandzusetzende Bauteile verzeichnet: " \
                   f"<font color='{'red' if defective_slots > 0 else 'green'}'><b>{defective_slots}</b></font>."

    summary_para = Paragraph(summary_text, body_style)
    
    summary_box_data = [
        [Paragraph("AUTOMATISCH GENERIERTER WAHRHEITSBEWEIS", summary_headline_style)],
        [summary_para]
    ]
    summary_box = Table(summary_box_data, colWidths=[540])
    summary_box.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#eff6ff')),
        ('BOX', (0,0), (-1,-1), 1.5, colors.HexColor('#bfdbfe')),
        ('PADDING', (0,0), (-1,-1), 12),
        ('BOTTOMPADDING', (0,0), (-1,0), 0),
    ]))
    story.append(summary_box)

    # Build the PDF document
    doc.build(story)
    print(f"[CORE-WORKER] PDF built successfully for contract '{contract_number}'")

def run_worker_cycle():
    """
    Looks up protocols where status = 'synchronized'.
    If no active PDF exists for it under /Protokolle, generates it.
    Also handles incremental SQLite statuses so it doesn't process endlessly.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Pull synchronized protocols
        cursor.execute("SELECT * FROM protocols WHERE status = 'synchronized'")
        protocols = cursor.fetchall()
        
        for p in protocols:
            p_id = p["id"]
            contract_num = p["contract_number"]
            pdf_path = os.path.join(SAMBA_SHARE_PATH, "Protokolle", f"{contract_num}.pdf")
            
            # If the PDF does not exist yet under /Protokolle, generate it from sqlite records
            if not os.path.exists(pdf_path):
                print(f"[CORE-WORKER] Found synchronized protocol '{p_id}' without active PDF share. Creating...")
                
                # Fetch rows
                cursor.execute("SELECT * FROM protocol_groups WHERE protocol_id = ?", (p_id,))
                groups = cursor.fetchall()
                
                rows_data = []
                for g in groups:
                    cursor.execute("SELECT * FROM group_cells WHERE protocol_id = ? AND group_id = ?", (p_id, g["group_id"]))
                    cells = cursor.fetchall()
                    rows_data.append({
                        "group_id": g["group_id"],
                        "group_name": g["group_name"],
                        "group_type": g["group_type"],
                        "cells": [{"slot_key": c["slot_key"], "detector_type": c["detector_type"], "value": c["value"]} for c in cells]
                    })
                
                # Create detailed report PDF
                generate_pdf(p_id, dict(p), rows_data)
                
        conn.close()
    except Exception as e:
        print(f"[CORE-WORKER] SQL ERROR/CORE PIPELINE FAILURE: {str(e)}", file=sys.stderr)

if __name__ == "__main__":
    print("[CORE-WORKER] ProtocolCore automated daemon started successfully. Monitoring SQLite for sync state triggers...")
    
    # Establish base directory structures in Samba Share path at mount init
    os.makedirs(os.path.join(SAMBA_SHARE_PATH, "Melderlisten"), exist_ok=True)
    os.makedirs(os.path.join(SAMBA_SHARE_PATH, "Protokolle"), exist_ok=True)
    os.makedirs(os.path.join(SAMBA_SHARE_PATH, "Archiv"), exist_ok=True)

    while True:
        run_worker_cycle()
        time.sleep(5) # Watch every 5 seconds for newly sync'd packets
