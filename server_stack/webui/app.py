# -*- coding: utf-8 -*-
import os
import sqlite3
import json
from flask import Flask, render_template_string, request, redirect, url_for, send_file, flash

app = Flask(__name__)
app.secret_key = "office-webui-secret"

DB_PATH = os.environ.get("DB_PATH", "/shared_db/protocols.db")
SAMBA_SHARE_PATH = os.environ.get("SAMBA_SHARE_PATH", "/samba_shares")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Helper to look up file-level archives of a contract number
def get_archives_for_contract(contract_number):
    archive_dir = os.path.join(SAMBA_SHARE_PATH, "Archiv", contract_number)
    if not os.path.exists(archive_dir):
        return []
    
    archive_list = []
    # Recursively traverse Year / HalfYear folders
    for root, dirs, files in os.walk(archive_dir):
        for f in files:
            if f.endswith(".pdf"):
                full_path = os.path.join(root, f)
                # derive year/half-year from relative directory structure
                rel_path = os.path.relpath(root, archive_dir)
                parts = rel_path.split(os.sep)
                year = parts[0] if len(parts) > 0 else "Unbekannt"
                half_year = parts[1] if len(parts) > 1 else "Unbekannt"
                
                archive_list.append({
                    "filename": f,
                    "year": year,
                    "half_year": half_year,
                    "full_path": full_path,
                    "size_kb": round(os.path.getsize(full_path) / 1024, 1)
                })
    return sorted(archive_list, key=lambda x: (x["year"], x["half_year"], x["filename"]), reverse=True)

# Bootstrap-powered modern single-view templates
DASHBOARD_HTML = """
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zentral-WebUI Protokollverwaltung</title>
    <!-- Simple high-contrast Tailwind styling -->
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
    </style>
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen">
    
    <!-- Top internal header -->
    <header class="bg-[#003d9b] text-white shadow-md p-4 sticky top-0 z-50">
        <div class="max-w-7xl mx-auto flex justify-between items-center">
            <div class="flex items-center gap-3">
                <div class="bg-white text-[#003d9b] text-xs font-mono font-black px-2 py-1 rounded">INTERNAL</div>
                <h1 class="text-lg font-bold tracking-tight">Maintenance Pro - Zentral-Kundenverwaltung & Leitstelle</h1>
            </div>
            <div class="text-xs font-mono text-blue-200">
                LAN-IP: Intranet-Only
            </div>
        </div>
    </header>

    <main class="max-w-7xl mx-auto p-6 space-y-8">
        
        <!-- Statistics Section -->
        <section class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="bg-white p-4 border border-slate-200 shadow-sm rounded-lg flex flex-col justify-between">
                <span class="text-xs font-bold text-slate-500 uppercase">Kundenobjekte Gesamt</span>
                <span class="text-2xl font-black text-[#003d9b]">{{ stats.total }}</span>
            </div>
            <div class="bg-white p-4 border border-slate-200 shadow-sm rounded-lg flex flex-col justify-between">
                <span class="text-xs font-bold text-amber-600 uppercase">Ausstehend (App)</span>
                <span class="text-2xl font-black text-amber-600">{{ stats.pending }}</span>
            </div>
            <div class="bg-white p-4 border border-slate-200 shadow-sm rounded-lg flex flex-col justify-between">
                <span class="text-xs font-bold text-emerald-600 uppercase">Synchronisiert</span>
                <span class="text-2xl font-black text-emerald-600">{{ stats.synced }}</span>
            </div>
            <div class="bg-white p-4 border border-slate-200 shadow-sm rounded-lg flex flex-col justify-between">
                <span class="text-xs font-bold text-slate-600 uppercase">Samba Netzlaufwerk</span>
                <span class="text-xs font-mono text-slate-600 mt-1 truncate">\\\\samba_server\\Protokolle</span>
            </div>
        </section>

        <!-- Main Workspace: Protocols list -->
        <section class="bg-white p-6 border border-slate-200 shadow-sm rounded-lg">
            <h2 class="text-base font-bold text-slate-800 mb-4">Aktive Wartungsverträge & Prüflisten</h2>
            
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                            <th class="p-3 font-mono">ID</th>
                            <th class="p-3">Kunde / Adresse</th>
                            <th class="p-3">Vertragsnummer</th>
                            <th class="p-3">Intervall / Typ</th>
                            <th class="p-3">Status</th>
                            <th class="p-3">Letzter Abgleich (Techniker)</th>
                            <th class="p-3 text-right">Aktionen</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        {% for p in protocols %}
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="p-3 font-bold font-mono text-slate-700">#{{ p.id }}</td>
                            <td class="p-3">
                                <div class="font-bold text-slate-800">{{ p.name }}</div>
                                <div class="text-xs text-slate-500">{{ p.address }}</div>
                            </td>
                            <td class="p-3 font-mono text-xs">{{ p.contract_number }}</td>
                            <td class="p-3">
                                <span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-medium">{{ p.interval }}</span>
                                <span class="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-bold font-mono">{{ p.system_type }}</span>
                            </td>
                            <td class="p-3">
                                {% if p.status == 'synchronized' %}
                                    <span class="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">✓ Synchronisiert</span>
                                {% elif p.status == 'ready_to_download' %}
                                    <span class="bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">⏱ Ausstehend</span>
                                {% else %}
                                    <span class="bg-sky-100 text-sky-800 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">⚙ Geladen offline</span>
                                {% endif %}
                            </td>
                            <td class="p-3 text-xs text-slate-600">
                                {% if p.last_edited_by %}
                                    <strong>{{ p.last_edited_by }}</strong>
                                    <div class="text-[10px] text-slate-400 font-mono">{{ p.last_edited_at }}</div>
                                {% else %}
                                    <span class="text-slate-400 italic">Noch kein Abgleich</span>
                                {% endif %}
                            </td>
                            <td class="p-3 text-right space-x-2">
                                <a href="{{ url_for('view_details', id=p.id) }}" class="inline-block bg-[#003d9b] text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-[#003d9b]/90">Einsicht</a>
                                {% if p.status == 'synchronized' %}
                                    <a href="{{ url_for('download_pdf', contract_num=p.contract_number) }}" class="inline-block bg-emerald-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-emerald-700">PDF</a>
                                {% endif %}
                                <a href="{{ url_for('trigger_reset', id=p.id) }}" onclick="return confirm('Wartung zurücksetzen? Das aktuelle Protokoll wird bei der nächsten Synchronisation als Version ins Archiv verschoben.')" class="inline-block bg-slate-200 text-slate-700 px-3 py-1.5 rounded text-xs font-semibold hover:bg-slate-300">Neu planen</a>
                            </td>
                        </tr>
                        {% endfor %}
                    </tbody>
                </table>
            </div>
        </section>

    </main>
</body>
</html>
"""

DETAILS_HTML = """
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wartungsdetails - {{ p.name }}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
    </style>
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen">
    
    <header class="bg-[#003d9b] text-white shadow-md p-4">
        <div class="max-w-7xl mx-auto flex justify-between items-center">
            <h1 class="text-lg font-bold">Wartungsdetails: {{ p.name }}</h1>
            <a href="{{ url_for('dashboard') }}" class="bg-white/15 px-4 py-1.5 rounded text-xs font-bold hover:bg-white/25">Zurück</a>
        </div>
    </header>

    <main class="max-w-7xl mx-auto p-6 space-y-6">
        
        <!-- Grid of customer data & archvial versions -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <!-- Customer Card -->
            <div class="bg-white p-5 border border-slate-200 shadow-sm rounded-lg space-y-3 md:col-span-2">
                <h2 class="text-sm font-bold text-slate-800 border-b pb-2">Kundenstammdaten</h2>
                <div class="grid grid-cols-2 gap-4 text-xs">
                    <div>
                        <span class="text-slate-500 block">Kunde:</span>
                        <strong class="text-slate-800 text-sm">{{ p.name }}</strong>
                    </div>
                    <div>
                        <span class="text-slate-500 block">Vertragsnummer:</span>
                        <strong class="text-slate-800 font-mono text-sm">{{ p.contract_number }}</strong>
                    </div>
                    <div>
                        <span class="text-slate-500 block">Adresse:</span>
                        <span class="text-slate-800 font-semibold">{{ p.address }}</span>
                    </div>
                    <div>
                        <span class="text-slate-500 block">System / Intervall:</span>
                        <span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold font-mono text-[10px]">{{ p.system_type }}</span>
                        <span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-bold text-[10px]">{{ p.interval }}</span>
                    </div>
                </div>
            </div>

            <!-- Historical Archive Box (Point 5 of Server Requirements) -->
            <div class="bg-white p-5 border border-slate-200 shadow-sm rounded-lg space-y-2">
                <h2 class="text-sm font-bold text-slate-800 border-b pb-2">Versionisiertes Archiv (Samba)</h2>
                <p class="text-[11px] text-slate-500">Frühere Revisionsstände aus dem Ordner <code>Archiv/{{ p.contract_number }}/</code></p>
                
                <div class="space-y-2 max-h-40 overflow-y-auto pt-2">
                    {% if archives %}
                        {% for arch in archives %}
                        <div class="p-2 bg-slate-50 border border-slate-100 rounded text-xs flex justify-between items-center hover:bg-slate-100">
                            <div>
                                <span class="font-black font-mono text-slate-700 block text-[10px]">{{ arch.year }} ({{ arch.half_year }})</span>
                                <span class="text-[10px] text-slate-500 truncate block max-w-[140px]">{{ arch.filename }}</span>
                            </div>
                            <span class="text-[10px] font-mono text-slate-500">{{ arch.size_kb }} KB</span>
                        </div>
                        {% endfor %}
                    {% else %}
                        <p class="text-xs italic text-slate-400 text-center py-4">Keine älteren Versionen im Archiv.</p>
                    {% endif %}
                </div>
            </div>
            
        </div>

        <!-- Matrix table representation -->
        <section class="bg-white p-6 border border-slate-200 shadow-sm rounded-lg space-y-4">
            <h2 class="text-sm font-bold text-slate-800">Gespeichertes Melderkoppelungsgitter (Auslöseliste)</h2>
            
            <div class="overflow-x-auto border rounded border-slate-200">
                <table class="w-full text-left text-xs border-collapse font-mono">
                    <thead>
                        <tr class="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                            <th class="p-3 border-r">Gruppe ID</th>
                            <th class="p-3 border-r">Gruppe Bezeichnung</th>
                            <th class="p-3 border-r text-center">Typ</th>
                            {% for col in columns %}
                            <th class="p-2 border-r text-center">Slot {{ col }}</th>
                            {% endfor %}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        {% for row_id, r in rows.items() %}
                        <tr class="hover:bg-slate-50">
                            <td class="p-3 border-r font-bold text-[#003d9b]">{{ row_id }}</td>
                            <td class="p-3 border-r text-slate-800 font-sans font-medium">{{ r.group_name }}</td>
                            <td class="p-3 border-r text-center font-bold text-slate-500">{{ r.group_type }}</td>
                            {% for col in columns %}
                            <td class="p-2 border-r text-center">
                                {% if col in r.cells %}
                                    {% if r.cells[col].detector_type == '-' %}
                                        <span class="text-slate-300">-</span>
                                    {% else %}
                                        <div class="font-bold text-slate-600 text-[10px]">{{ r.cells[col].detector_type }}</div>
                                        {% if r.cells[col].value == 'Def.' %}
                                            <span class="inline-block bg-red-100 text-red-700 font-black px-1 py-0.5 rounded text-[9px]">DEFEKT</span>
                                        {% elif r.cells[col].value != '' %}
                                            <span class="inline-block bg-emerald-100 text-emerald-800 font-black px-1 py-0.5 rounded text-[9px]">{{ r.cells[col].value }}</span>
                                        {% else %}
                                            <span class="text-slate-400 italic">[leer]</span>
                                        {% endif %}
                                    {% endif %}
                                {% else %}
                                    <span class="text-slate-300">-</span>
                                {% endif %}
                            </td>
                            {% endfor %}
                        </tr>
                        {% endfor %}
                    </tbody>
                </table>
            </div>
        </section>

    </main>
</body>
</html>
"""

# --- ROUTINGS ---

@app.route("/")
def dashboard():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM protocols")
    records = cursor.fetchall()
    
    # Calculate simple stats
    stats = {
        "total": len(records),
        "pending": sum(1 for r in records if r["status"] == "ready_to_download"),
        "synced": sum(1 for r in records if r["status"] == "synchronized")
    }
    
    conn.close()
    return render_template_string(DASHBOARD_HTML, protocols=records, stats=stats)

@app.route("/details/<id>")
def view_details(id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM protocols WHERE id = ?", (id,))
    p = cursor.fetchone()
    if not p:
        conn.close()
        return "Not Found", 404
        
    # Columns parsing
    columns = json.loads(p["columns"])
    
    # Rows parsing
    cursor.execute("SELECT * FROM protocol_groups WHERE protocol_id = ?", (id,))
    groups = cursor.fetchall()
    
    rows_data = {}
    for g in groups:
        g_id = g["group_id"]
        cursor.execute("SELECT * FROM group_cells WHERE protocol_id = ? AND group_id = ?", (id, g_id))
        cells = cursor.fetchall()
        rows_data[g_id] = {
            "group_name": g["group_name"],
            "group_type": g["group_type"],
            "cells": {c["slot_key"]: {"detector_type": c["detector_type"], "value": c["value"]} for c in cells}
        }
        
    conn.close()
    
    # Fetch archive list
    archives = get_archives_for_contract(p["contract_number"])
    
    return render_template_string(DETAILS_HTML, p=p, columns=columns, rows=rows_data, archives=archives)

@app.route("/download_pdf/<contract_num>")
def download_pdf(contract_num):
    pdf_path = os.path.join(SAMBA_SHARE_PATH, "Protokolle", f"{contract_num}.pdf")
    if not os.path.exists(pdf_path):
        return "PDF-Protokoll wurde vom ProtocolCore-Hintergrundprozess noch nicht fertiggestellt oder archiviert.", 404
    return send_file(pdf_path, as_attachment=True, download_name=f"{contract_num}.pdf")

@app.route("/reset/<id>")
def trigger_reset(id):
    """
    Simulates planning the NEXT audit run (e.g. next quarter).
    We switch the status from 'synchronized' back to 'ready_to_download'.
    We empty all cell values ('') so the technician can test fresh, but WE KEEP the detector types in place!
    This is extremely realistic!
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # First, capture contract number & details
    cursor.execute("SELECT contract_number FROM protocols WHERE id = ?", (id,))
    p = cursor.fetchone()
    if p:
        contract_num = p["contract_number"]
        active_pdf = os.path.join(SAMBA_SHARE_PATH, "Protokolle", f"{contract_num}.pdf")
        
        # Move active PDF to archive manually if reset is forced
        if os.path.exists(active_pdf):
            year = datetime.now().strftime("%Y")
            # Archive under a simulation of the previous phase
            archive_dir = os.path.join(SAMBA_SHARE_PATH, "Archiv", contract_num, year, "H1")
            os.makedirs(archive_dir, exist_ok=True)
            
            existing_files = [f for f in os.listdir(archive_dir) if f.startswith(contract_num) and f.endswith(".pdf")]
            next_version = len(existing_files) + 1
            shutil_path = os.path.join(archive_dir, f"{contract_num}_V{next_version}.pdf")
            try:
                import shutil
                shutil.move(active_pdf, shutil_path)
            except Exception:
                pass

        # Reset cell values & protocol state
        cursor.execute("UPDATE protocols SET status = 'ready_to_download' WHERE id = ?", (id,))
        cursor.execute("UPDATE group_cells SET value = '' WHERE protocol_id = ?", (id,))
        conn.commit()
        
    conn.close()
    return redirect(url_for('dashboard'))

if __name__ == "__main__":
    print("Starting Internal WebUI dashboard server on port 8080...")
    app.run(host="0.0.0.0", port=8080, debug=False)
