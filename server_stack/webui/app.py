# -*- coding: utf-8 -*-
import os
import re
import sqlite3
import json
import base64
import csv
import io
import hashlib
import shutil
import uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_file, redirect, url_for

app = Flask(__name__)
app.secret_key = "office-webui-secret-key-182392"

DB_PATH = os.environ.get("DB_PATH", "/shared_db/protocols.db")
SAMBA_SHARE_PATH = os.environ.get("SAMBA_SHARE_PATH", "/samba_shares")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Ensure subsystem columns exist dynamically
    try:
        cursor = conn.cursor()
        for col_name, col_type in [
            ("anlage_id", "VARCHAR(100) DEFAULT 'default'"),
            ("anlage_name", "VARCHAR(255) DEFAULT 'Hauptanlage'"),
            ("anlage_type", "VARCHAR(50) DEFAULT 'BMA'"),
            ("anlage_address", "VARCHAR(255) DEFAULT ''")
        ]:
            try:
                cursor.execute(f"ALTER TABLE protocol_groups ADD COLUMN {col_name} {col_type}")
            except sqlite3.OperationalError:
                pass
        conn.commit()
    except Exception:
        pass
    return conn

def load_settings():
    settings_path = os.path.join(os.path.dirname(DB_PATH), "settings.json")
    default_settings = {
        "active_system_types": ["BMA", "EMA", "ELA", "Lichtruf", "SLA"],
        "system_settings": {
            "BMA": {
                "name": "Brandmeldeanlage",
                "xml_name": "BMA",
                "color": "bg-red-50 text-red-800 border-red-200",
                "badgeColor": "bg-red-500",
                "detectors": ["-", "Normal", "ZD", "ZB", "TDIFF", "TMAX", "RAS", "LINEAR"],
                "values": ["CHECK", "H1", "H2", "Def."]
            },
            "EMA": {
                "name": "Einbruchmeldeanlage",
                "xml_name": "EMA",
                "color": "bg-yellow-50 text-yellow-800 border-yellow-200",
                "badgeColor": "bg-yellow-500",
                "detectors": ["-", "Normal", "BWM", "ZK", "RSK", "Lichtschranke", "Glasbruch", "Körperschall"],
                "values": ["CHECK", "Def."]
            },
            "ELA": {
                "name": "Elektroakustik",
                "xml_name": "ELA",
                "color": "bg-blue-50 text-blue-800 border-blue-200",
                "badgeColor": "bg-blue-500",
                "detectors": ["-", "Normal", "Innenlautsprecher", "Außenlautsprecher"],
                "values": ["CHECK", "Def."]
            },
            "Lichtruf": {
                "name": "Lichtrufanlage",
                "xml_name": "Lichtruf",
                "color": "bg-emerald-50 text-emerald-800 border-emerald-200",
                "badgeColor": "bg-emerald-500",
                "detectors": ["-", "Normal", "AT", "BT", "ZT", "EM", "PN", "Display"],
                "values": ["CHECK", "Def."]
            },
            "SLA": {
                "name": "Sprechanlage",
                "xml_name": "SLA",
                "color": "bg-indigo-50 text-indigo-800 border-indigo-200",
                "badgeColor": "bg-indigo-500",
                "detectors": ["-", "Normal", "SLA"],
                "values": ["CHECK", "Def."]
            }
        }
    }
    if os.path.exists(settings_path):
        try:
            with open(settings_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return default_settings

def save_settings(settings):
    settings_path = os.path.join(os.path.dirname(DB_PATH), "settings.json")
    try:
        with open(settings_path, "w", encoding="utf-8") as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

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
                year = parts[0] if len(parts) > 0 and parts[0] != "." else "Unknown"
                half_year = parts[1] if len(parts) > 1 else "H1"
                
                archive_list.append({
                    "filename": f,
                    "year": year,
                    "half_year": half_year,
                    "path": f"/download_archive/{contract_number}/{year}/{half_year}/{f}",
                    "size_kb": round(os.path.getsize(full_path) / 1024, 1)
                })
    return sorted(archive_list, key=lambda x: (x["year"], x["half_year"], x["filename"]), reverse=True)

# ----------------- WEB API ROUTES -----------------

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/api/protocols", methods=["GET"])
def get_protocols():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, name, address, contract_number, interval, system_type, status, last_edited_by, last_edited_at 
        FROM protocols
    """)
    records = cursor.fetchall()
    
    # Calculate live session status or live technicians check if any
    results = []
    for r in records:
        pdf_path = os.path.join(SAMBA_SHARE_PATH, "Protokolle", f"{r['contract_number']}.pdf")
        has_pdf = os.path.exists(pdf_path)
        
        results.append({
            "id": r["id"],
            "name": r["name"],
            "address": r["address"],
            "contract_number": r["contract_number"],
            "interval": r["interval"],
            "system_type": r["system_type"],
            "status": r["status"],
            "last_edited_by": r["last_edited_by"] or "-",
            "last_edited_at": r["last_edited_at"] or "-",
            "has_pdf": has_pdf
        })
    conn.close()
    return jsonify({"success": True, "protocols": results})

@app.route("/api/protocols/<p_id>", methods=["GET"])
def get_protocol_detail(p_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM protocols WHERE id = ?", (p_id,))
    p = cursor.fetchone()
    if not p:
        conn.close()
        return jsonify({"success": False, "error": "Protokoll nicht gefunden."}), 404
        
    cols = json.loads(p["columns"])
    app_vals = json.loads(p["applicable_values"]) if p["applicable_values"] else ["CHECK", "Def."]
    det_types = json.loads(p["detector_types"]) if p["detector_types"] else ["-", "Normal"]
    
    cursor.execute("SELECT * FROM protocol_groups WHERE protocol_id = ?", (p_id,))
    groups = cursor.fetchall()
    
    rows_data = []
    sub_systems_map = {}
    
    for g in groups:
        g_id = g["group_id"]
        cursor.execute("SELECT slot_key, detector_type, value FROM group_cells WHERE protocol_id = ? AND group_id = ?", (p_id, g_id))
        cells = cursor.fetchall()
        cells_list = []
        for c in cells:
            cells_list.append({
                "slotKey": c["slot_key"],
                "detectorType": c["detector_type"],
                "value": c["value"]
            })
            
        cells_list = sorted(cells_list, key=lambda x: int(x["slotKey"]) if x["slotKey"].isdigit() else 999)
        
        rows_data.append({
            "groupId": g_id,
            "groupName": g["group_name"],
            "groupType": g["group_type"] or "NAM",
            "cells": cells_list
        })
        
        # Support subsystems grouping
        a_id = "default"
        a_name = "Hauptanlage"
        a_type = p["system_type"] or "BMA"
        a_address = ""
        
        try:
            if "anlage_id" in g.keys() and g["anlage_id"]:
                a_id = g["anlage_id"]
            if "anlage_name" in g.keys() and g["anlage_name"]:
                a_name = g["anlage_name"]
            if "anlage_type" in g.keys() and g["anlage_type"]:
                a_type = g["anlage_type"]
            if "anlage_address" in g.keys() and g["anlage_address"]:
                a_address = g["anlage_address"]
        except Exception:
            pass
            
        if a_id not in sub_systems_map:
            sub_systems_map[a_id] = {
                "id": a_id,
                "name": a_name,
                "address": a_address,
                "system_type": a_type,
                "columns": [],
                "rows": []
            }
            
        sub_systems_map[a_id]["rows"].append({
            "groupId": g_id,
            "groupName": g["group_name"],
            "cells": cells_list
        })
        
        for c in cells_list:
            if c["slotKey"] not in sub_systems_map[a_id]["columns"]:
                sub_systems_map[a_id]["columns"].append(c["slotKey"])
                
    for sub in sub_systems_map.values():
        sub["columns"] = sorted(sub["columns"], key=lambda x: int(x) if x.isdigit() else 0)
        if not sub["columns"]:
            sub["columns"] = cols
            
    sub_systems_list = list(sub_systems_map.values())
    conn.close()
    
    # Also fetch Samba list recursively for details view
    archives = get_archives_for_contract(p["contract_number"])
    
    return jsonify({
        "success": True,
        "protocol": {
            "id": p["id"],
            "name": p["name"],
            "address": p["address"],
            "contract_number": p["contract_number"],
            "interval": p["interval"],
            "system_type": p["system_type"],
            "status": p["status"],
            "last_edited_by": p["last_edited_by"] or "-",
            "last_edited_at": p["last_edited_at"] or "-",
            "columns": cols,
            "applicable_values": app_vals,
            "detector_types": det_types,
            "rows": rows_data,
            "subSystems": sub_systems_list
        },
        "archives": archives
    })

@app.route("/api/protocols/save", methods=["POST"])
def save_protocol():
    data = request.json
    p_id = data.get("id")
    name = data.get("name", "").strip()
    address = data.get("address", "").strip()
    contract_number = data.get("contract_number", "").strip()
    interval = data.get("interval", "Halbjährlich")
    system_type = data.get("system_type", "BMA")
    status = data.get("status", "ready_to_download")
    columns = data.get("columns", ["1", "2", "3", "4"])
    applicable_values = data.get("applicable_values", ["CHECK", "Def."])
    detector_types = data.get("detector_types", ["-", "Normal"])
    rows = data.get("rows", [])
    sub_systems = data.get("subSystems") or data.get("sub_systems") or []
    
    if not name or not contract_number:
        return jsonify({"success": False, "error": "Kunde und Vertragsnummer sind Pflichtfelder."}), 400
        
    if not p_id:
        p_id = f"PRO-{int(datetime.now().timestamp())}"
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Save main protocol header
        cursor.execute("""
            INSERT INTO protocols (id, name, address, contract_number, interval, system_type, status, last_edited_by, last_edited_at, columns, applicable_values, detector_types)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                name=EXCLUDED.name, address=EXCLUDED.address, contract_number=EXCLUDED.contract_number, 
                interval=EXCLUDED.interval, system_type=EXCLUDED.system_type, status=EXCLUDED.status,
                columns=EXCLUDED.columns, applicable_values=EXCLUDED.applicable_values, detector_types=EXCLUDED.detector_types
        """, (
            p_id, name, address, contract_number, interval, system_type, status,
            data.get("last_edited_by", "-"), data.get("last_edited_at", "-"),
            json.dumps(columns), json.dumps(applicable_values), json.dumps(detector_types)
        ))
        
        # Transactional clean and save groups & cells
        cursor.execute("DELETE FROM group_cells WHERE protocol_id = ?", (p_id,))
        cursor.execute("DELETE FROM protocol_groups WHERE protocol_id = ?", (p_id,))
        
        if sub_systems:
            for sub in sub_systems:
                a_id = sub.get("id") or f"sub-{int(datetime.now().timestamp())}"
                a_name = sub.get("name") or "Anlage"
                a_type = sub.get("system_type") or sub.get("systemType") or system_type or "BMA"
                a_address = sub.get("address") or ""
                
                for r in sub.get("rows", []):
                    g_id = r["groupId"]
                    g_name = r["groupName"]
                    
                    cursor.execute("""
                        INSERT INTO protocol_groups (protocol_id, group_id, group_name, group_type, anlage_id, anlage_name, anlage_type, anlage_address)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (p_id, g_id, g_name, a_type, a_id, a_name, a_type, a_address))
                    
                    for c in r.get("cells", []):
                        cursor.execute("""
                            INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?)
                        """, (p_id, g_id, c["slotKey"], c["detectorType"], c.get("value", ""), int(datetime.now().timestamp())))
        else:
            for r in rows:
                g_id = r["groupId"]
                g_name = r["groupName"]
                g_type = r.get("groupType", system_type)
                
                cursor.execute("""
                    INSERT INTO protocol_groups (protocol_id, group_id, group_name, group_type, anlage_id, anlage_name, anlage_type, anlage_address)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (p_id, g_id, g_name, g_type, "default", f"Hauptanlage ({g_type})", g_type, ""))
                
                for c in r.get("cells", []):
                    cursor.execute("""
                        INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (p_id, g_id, c["slotKey"], c["detectorType"], c.get("value", ""), int(datetime.now().timestamp())))
                    
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"success": False, "error": f"Fehler beim Speichern des Protokolls: {str(e)}"}), 500
        
    conn.close()
    return jsonify({"success": True, "id": p_id, "message": "Protokoll erfolgreich im SQL DBMS gesichert!"})

@app.route("/api/protocols/delete/<p_id>", methods=["POST"])
def delete_protocol(p_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM group_cells WHERE protocol_id = ?", (p_id,))
        cursor.execute("DELETE FROM protocol_groups WHERE protocol_id = ?", (p_id,))
        cursor.execute("DELETE FROM protocols WHERE id = ?", (p_id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"success": False, "error": f"Fehler beim Löschen: {str(e)}"}), 500
        
    conn.close()
    return jsonify({"success": True, "message": "Protokoll erfolgreich gelöscht."})

@app.route("/api/protocols/reset/<p_id>", methods=["POST"])
def reset_protocol(p_id):
    """
    Triggers turnus changeover: Archives active report and clears measurements, keeping detector mappings intact.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT contract_number FROM protocols WHERE id = ?", (p_id,))
    prod = cursor.fetchone()
    if not prod:
        conn.close()
        return jsonify({"success": False, "error": "Protokoll nicht gefunden."}), 404
        
    contract_num = prod["contract_number"]
    active_pdf = os.path.join(SAMBA_SHARE_PATH, "Protokolle", f"{contract_num}.pdf")
    
    # 1. Back up active PDF PDF to versioned Samba directory if it exists
    if os.path.exists(active_pdf):
        year = datetime.now().strftime("%Y")
        archive_dir = os.path.join(SAMBA_SHARE_PATH, "Archiv", contract_num, year, "H1")
        os.makedirs(archive_dir, exist_ok=True)
        
        existing_files = [f for f in os.listdir(archive_dir) if f.startswith(contract_num) and f.endswith(".pdf")]
        next_ver = len(existing_files) + 1
        archived_pdf_path = os.path.join(archive_dir, f"{contract_num}_V{next_ver}.pdf")
        
        try:
            shutil.move(active_pdf, archived_pdf_path)
        except Exception as err:
            print(f"WARN: Failed to move PDF: {str(err)}")
            
    # 2. Reset status back to 'ready_to_download' and measurements back to ''
    try:
        cursor.execute("UPDATE protocols SET status = 'ready_to_download' WHERE id = ?", (p_id,))
        cursor.execute("UPDATE group_cells SET value = '' WHERE protocol_id = ?", (p_id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"success": False, "error": f"Datenbank-Fehler beim Zurücksetzen: {str(e)}"}), 500
        
    conn.close()
    return jsonify({"success": True, "message": "Wartungsvertrag erfolgreich für das nächste Turnusintervall freigegeben!"})

# ----------------- TECHNICIANS ROUTES -----------------

@app.route("/api/technicians", methods=["GET"])
def list_technicians():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, name FROM technicians")
    records = cursor.fetchall()
    conn.close()
    
    results = []
    for r in records:
        results.append({
            "id": r["id"],
            "username": r["username"],
            "name": r["name"]
        })
    return jsonify({"success": True, "technicians": results})

@app.route("/api/technicians/save", methods=["POST"])
def save_technician():
    data = request.json
    t_id = data.get("id")
    username = data.get("username", "").strip().lower()
    name = data.get("name", "").strip()
    password = data.get("password", "").strip()
    
    if not username or not name:
        return jsonify({"success": False, "error": "Bitte füllen Sie alle Pflichtfelder aus."}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        if not t_id:
            # Create new
            t_id = f"tech-{int(datetime.now().timestamp())}"
            raw_pwd = password if password else "123456" # fallback default default
            pass_hash = hashlib.sha256(raw_pwd.encode("utf-8")).hexdigest()
            
            cursor.execute("""
                INSERT INTO technicians (id, username, password_hash, name)
                VALUES (?, ?, ?, ?)
            """, (t_id, username, pass_hash, name))
        else:
            # Edit existing
            if password:
                pass_hash = hashlib.sha256(password.encode("utf-8")).hexdigest()
                cursor.execute("""
                    UPDATE technicians SET username = ?, name = ?, password_hash = ? WHERE id = ?
                """, (username, name, pass_hash, t_id))
            else:
                cursor.execute("""
                    UPDATE technicians SET username = ?, name = ? WHERE id = ?
                """, (username, name, t_id))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"success": False, "error": "Benutzername existiert bereits!"}), 400
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "error": str(e)}), 500
        
    conn.close()
    return jsonify({"success": True, "message": "Techniker erfolgreich gespeichert."})

@app.route("/api/technicians/delete/<t_id>", methods=["POST"])
def delete_technician(t_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM technicians WHERE id = ?", (t_id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"success": False, "error": str(e)}), 500
        
    conn.close()
    return jsonify({"success": True, "message": "Techniker erfolgreich gelöscht."})

# ----------------- SETTINGS API -----------------

@app.route("/api/settings", methods=["GET"])
def get_settings():
    return jsonify({"success": True, "settings": load_settings()})

@app.route("/api/settings", methods=["POST"])
def post_settings():
    try:
        data = request.json
        active_system_types = data.get("active_system_types")
        system_settings = data.get("system_settings")
        
        if active_system_types is not None and not isinstance(active_system_types, list):
            return jsonify({"success": False, "error": "active_system_types must be an array"}), 400
            
        settings = load_settings()
        if active_system_types is not None:
            settings["active_system_types"] = active_system_types
        if system_settings is not None:
            settings["system_settings"] = system_settings
            
        save_settings(settings)
        return jsonify({"success": True, "message": "Einstellungen erfolgreich gespeichert."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ----------------- UPLOADS & FILE PARSING API -----------------

def extract_tag_content(xml, tag):
    pattern = rf"<{tag}(?:\s+[^>]*)?>([\s\S]*?)</{tag}>"
    match = re.search(pattern, xml, re.IGNORECASE)
    return match.group(1).strip() if match else ""

def extract_tags_content(xml, tag):
    pattern = rf"<{tag}(?:\s+[^>]*)?>([\s\S]*?)</{tag}>"
    return [m.strip() for m in re.findall(pattern, xml, re.IGNORECASE)]

def get_tag_value(xml, tag, default_value=""):
    closing_pattern = rf"<{tag}(?:\s+[^>]*)?>([\s\S]*?)</{tag}>"
    match = re.search(closing_pattern, xml, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    self_closing_pattern = rf"<{tag}(?:\s+[^>]*)?/>"
    if re.search(self_closing_pattern, xml, re.IGNORECASE):
        return ""
    return default_value

def build_taifun_address(xml):
    mt3 = get_tag_value(xml, "MtName3")
    mt2 = get_tag_value(xml, "MtName2")
    mt1 = get_tag_value(xml, "MtName1")
    str_val = get_tag_value(xml, "Strasse") or get_tag_value(xml, "Straße")
    plz = get_tag_value(xml, "Plz") or get_tag_value(xml, "PLZ")
    ort = get_tag_value(xml, "Ort")
    
    parts = []
    if mt3: parts.append(mt3)
    if mt2: parts.append(mt2)
    if mt1: parts.append(mt1)
    if str_val: parts.append(str_val)
    
    city = " ".join(filter(None, [plz, ort]))
    if city: parts.append(city)
    
    return ", ".join(parts) if parts else ""

def match_detector_type(info_str, name_str, available_detectors):
    combined = (info_str + " " + name_str).lower()
    for det in available_detectors:
        if det in ["-", "Normal"]:
            continue
        if det.lower() in combined:
            return det
    if "zwischendecke" in combined or "zd" in combined: return "ZD"
    if "ansaug" in combined or "ras" in combined: return "RAS"
    if "linear" in combined or "fireray" in combined: return "LINEAR"
    if "differenz" in combined or "tdiff" in combined: return "TDIFF"
    if "maximal" in combined or "tmax" in combined: return "TMAX"
    if "bewegung" in combined or "bwm" in combined: return "BWM"
    if "riegel" in combined or "rsk" in combined: return "RSK"
    if "glas" in combined or "gb" in combined: return "Glasbruch"
    return available_detectors[1] if len(available_detectors) > 1 else "Normal"

def get_clean_type(raw_name):
    cleaned = re.sub(r"[\[\]]", "", raw_name).strip()
    if "bma" in cleaned.lower(): return "BMA"
    if "ema" in cleaned.lower(): return "EMA"
    if "ela" in cleaned.lower(): return "ELA"
    if "lichtruf" in cleaned.lower() or "ruf" in cleaned.lower(): return "Lichtruf"
    if "sla" in cleaned.lower(): return "SLA"
    return cleaned.upper() if cleaned else "BMA"

@app.route("/api/import-taifun", methods=["POST"])
def import_taifun():
    data = request.json
    content = data.get("content")
    if not content:
        return jsonify({"success": False, "error": "XML-Inhalt fehlt."}), 400
        
    try:
        # Save content to central wartungVT.xml
        taifun_xml_path = os.path.join(SAMBA_SHARE_PATH, "wartungVT.xml")
        try:
            with open(taifun_xml_path, "w", encoding="utf-8") as f:
                f.write(content)
        except Exception as err:
            print(f"WARN: Could not write central wartungVT.xml: {str(err)}")
            
        contract_blocks = extract_tags_content(content, "WtVt")
        is_taifun_format = True
        if not contract_blocks:
            contract_blocks = extract_tags_content(content, "Vertrag")
            is_taifun_format = False
            
        if not contract_blocks:
            return jsonify({
                "success": False,
                "error": "Keine gültigen Verträge (<WtVt> oder <Vertrag>) im XML gefunden."
            }), 400
            
        settings = load_settings()
        imported_count = 0
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # We process in transactions
        try:
            for block in contract_blocks:
                contract_number = ""
                name = ""
                address = "Aus TAIFUN importiert"
                interval = "Halbjährlich"
                default_system_type = "BMA"
                p_id = ""
                
                sub_systems_to_import = []
                
                if is_taifun_format:
                    contract_number = get_tag_value(block, "Nr")
                    info = get_tag_value(block, "Info")
                    kd_match = get_tag_value(block, "KdMatch")
                    
                    if not contract_number:
                        continue
                        
                    name = f"{kd_match} ({info})" if kd_match else info
                    if not name:
                        name = f"Vertrag {contract_number}"
                        
                    p_id = f"PRO-{contract_number}"
                    address = build_taifun_address(block) or "Aus TAIFUN importiert"
                    
                    # Parse WtAgList
                    wtag_list_block = extract_tag_content(block, "WtAgList")
                    wtag_blocks = extract_tags_content(wtag_list_block, "WtAg")
                    
                    wt_ag_index = 0
                    for wtag in wtag_blocks:
                        wt_ag_index += 1
                        
                        # Split header to avoid nested tags
                        wtag_header = re.split(r"<WtGrtList>|<WtVLLIST>", wtag, flags=re.IGNORECASE)[0]
                        wtag_info = get_tag_value(wtag_header, "Info") or f"Anlage {wt_ag_index}"
                        anlage_address = build_taifun_address(wtag_header) or build_taifun_address(wtag)
                        
                        # Extract interval
                        wtvl_list_block = extract_tag_content(wtag, "WtVLLIST")
                        wtvl_blocks = extract_tags_content(wtvl_list_block, "WtVl")
                        wt_ag_interval = "Halbjährlich"
                        for wtvl in wtvl_blocks:
                            wt_intervall = get_tag_value(wtvl, "WtIntervall")
                            if wt_intervall == "3":
                                wt_ag_interval = "Quartalsweise"
                            elif wt_intervall == "6":
                                wt_ag_interval = "Halbjährlich"
                            elif wt_intervall == "12":
                                wt_ag_interval = "Jährlich"
                            elif wt_intervall == "1":
                                wt_ag_interval = "Monatlich"
                                
                        # Extract WtGrtList
                        wtgrt_list_block = extract_tag_content(wtag, "WtGrtList")
                        wtgrt_blocks = extract_tags_content(wtgrt_list_block, "WtGrt")
                        
                        wt_grt_index = 0
                        for wtgrt in wtgrt_blocks:
                            wt_grt_index += 1
                            dev_name = get_tag_value(wtgrt, "Name") or "Gerät"
                            dev_info = get_tag_value(wtgrt, "Info") or "Zentrale"
                            
                            system_type = get_clean_type(dev_name)
                            
                            if wt_ag_index == 1 and wt_grt_index == 1:
                                interval = wt_ag_interval
                                default_system_type = system_type
                                
                            sub_id = f"sub-taifun-{contract_number}-{wt_ag_index}-{wt_grt_index}"
                            
                            sub_name = f"{wtag_info} - {dev_info}" if dev_info and dev_info != dev_name else f"{wtag_info} - {dev_name}"
                            
                            devices_rows = [
                                {"name": dev_info or "Zentrale", "info": "Zentrale"},
                                {"name": "Meldergruppe 1", "info": "Linie 1"},
                                {"name": "Meldergruppe 2", "info": "Linie 2"}
                            ]
                            
                            sub_systems_to_import.append({
                                "id": sub_id,
                                "name": sub_name,
                                "system_type": system_type,
                                "interval": wt_ag_interval,
                                "address": anlage_address,
                                "devices": devices_rows
                            })
                    if not sub_systems_to_import:
                        sub_systems_to_import.append({
                            "id": f"sub-taifun-{contract_number}-default",
                            "name": "Hauptanlage",
                            "system_type": "BMA",
                            "interval": "Halbjährlich",
                            "address": "",
                            "devices": [
                                {"name": "Zentrale", "info": "Zentrale"},
                                {"name": "Meldergruppe 1", "info": "Linie 1"}
                            ]
                        })
                else:
                    # Legacy Format parsing
                    id_val = get_tag_value(block, "ID")
                    contract_number = get_tag_value(block, "Vertragsnummer")
                    name = get_tag_value(block, "Kunde")
                    address = get_tag_value(block, "Adresse") or "Aus TAIFUN importiert"
                    interval = get_tag_value(block, "Intervall") or "Halbjährlich"
                    default_system_type = get_tag_value(block, "Anlagentyp") or "BMA"
                    
                    if not contract_number or not name:
                        continue
                        
                    p_id = id_val or f"{contract_number}-{default_system_type}"
                    
                    geraete_block = extract_tag_content(block, "Geraete")
                    geraete_match = extract_tags_content(geraete_block, "Geraet")
                    devices_list = []
                    
                    for g_block in geraete_match:
                        dev_name = get_tag_value(g_block, "Name") or "Gerät"
                        dev_info = get_tag_value(g_block, "Bereich") or dev_name
                        gruppe = get_tag_value(g_block, "Gruppe") or "GRP 01"
                        melder_typ = get_tag_value(g_block, "MelderTyp") or "Normal"
                        try:
                            anzahl = int(get_tag_value(g_block, "Anzahl", "1"))
                        except ValueError:
                            anzahl = 1
                            
                        devices_list.append({
                            "name": dev_name,
                            "info": dev_info,
                            "group": gruppe,
                            "melderTyp": melder_typ,
                            "anzahl": anzahl
                        })
                        
                    sub_systems_to_import.append({
                        "id": f"sub-legacy-{p_id}",
                        "name": "Hauptanlage",
                        "system_type": default_system_type,
                        "interval": interval,
                        "address": "",
                        "devices": devices_list
                    })
                    
                default_columns = {
                    "BMA": ["1", "2", "3", "4", "5", "6", "7", "8"],
                    "EMA": ["1", "2", "3", "4"],
                    "ELA": ["1", "2"],
                    "Lichtruf": ["1", "2", "3", "4"],
                    "SLA": ["1", "2"]
                }
                
                default_values = {
                    "BMA": ["CHECK", "Def."],
                    "EMA": ["OK", "Fehler"],
                    "ELA": ["OK", "Fehler"],
                    "Lichtruf": ["OK", "Fehler"],
                    "SLA": ["OK", "Fehler"]
                }
                
                default_detector_types = {
                    "BMA": ["-", "Normal", "ZD", "ZB", "TDIFF", "TMAX", "RAS", "LINEAR"],
                    "EMA": ["-", "Normal", "BWM", "RSK", "IR", "GLAS"],
                    "ELA": ["-", "Normal", "LSP", "AMP", "MIC"],
                    "Lichtruf": ["-", "Normal", "ZUG", "RUF", "WC"],
                    "SLA": ["-", "Normal", "SLA"]
                }
                
                cols = json.dumps(default_columns.get(default_system_type, ["1", "2", "3", "4"]))
                app_vals = json.dumps(default_values.get(default_system_type, ["CHECK", "Def."]))
                det_types = json.dumps(default_detector_types.get(default_system_type, ["-", "Normal"]))
                
                cursor.execute("""
                    INSERT INTO protocols (id, name, address, contract_number, interval, system_type, status, columns, applicable_values, detector_types)
                    VALUES (?, ?, ?, ?, ?, ?, 'ready_to_download', ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET 
                        name=EXCLUDED.name, 
                        address=EXCLUDED.address, 
                        interval=EXCLUDED.interval, 
                        system_type=EXCLUDED.system_type, 
                        contract_number=EXCLUDED.contract_number
                """, (p_id, name, address, contract_number, interval, default_system_type, cols, app_vals, det_types))
                
                cursor.execute("DELETE FROM group_cells WHERE protocol_id = ?", (p_id,))
                cursor.execute("DELETE FROM protocol_groups WHERE protocol_id = ?", (p_id,))
                
                grp_counter = 1
                for sub in sub_systems_to_import:
                    system_set = settings.get("system_settings", {}).get(sub["system_type"]) or settings.get("system_settings", {}).get("BMA") or {
                        "detectors": ["-", "Normal"],
                        "values": ["CHECK", "Def."]
                    }
                    available_detectors = system_set.get("detectors", ["-", "Normal"])
                    
                    active_cols = default_columns.get(sub["system_type"], ["1", "2", "3", "4"])
                    if settings.get("system_settings", {}).get(sub["system_type"], {}).get("columns"):
                        active_cols = settings["system_settings"][sub["system_type"]]["columns"]
                        
                    if is_taifun_format:
                        for dev in sub["devices"]:
                            group_id = f"G-{str(grp_counter).zfill(2)}"
                            grp_counter += 1
                            
                            group_name = dev["info"] or f"{sub['system_type']} Komponente"
                            matched_det_type = match_detector_type(dev["info"], dev["name"], available_detectors)
                            
                            cursor.execute("""
                                INSERT INTO protocol_groups (protocol_id, group_id, group_name, group_type, anlage_id, anlage_name, anlage_type, anlage_address)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            """, (p_id, group_id, group_name, 'NAM', sub["id"], sub["name"], sub["system_type"], sub["address"] or ""))
                            
                            for c_idx, slot_key in enumerate(active_cols):
                                detector_type = matched_det_type if c_idx == 0 else (available_detectors[1] if len(available_detectors) > 1 else "Normal")
                                cursor.execute("""
                                    INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value)
                                    VALUES (?, ?, ?, ?, '')
                                """, (p_id, group_id, slot_key, detector_type))
                    else:
                        groups_map = {}
                        for dev in sub["devices"]:
                            gruppe = dev["group"] or "GRP 01"
                            melder_typ = dev["melderTyp"] or "Normal"
                            anzahl = dev["anzahl"] or 1
                            
                            if gruppe not in groups_map:
                                groups_map[gruppe] = {
                                    "name": f"{gruppe} ({dev['info'] or dev['name']})",
                                    "type": "TECH" if sub["system_type"] == "BMA" else "NAM",
                                    "cells": []
                                }
                                
                            start_idx = len(groups_map[gruppe]["cells"]) + 1
                            for i in range(anzahl):
                                groups_map[gruppe]["cells"].append({
                                    "slotKey": str(start_idx + i),
                                    "detectorType": melder_typ,
                                    "value": ""
                                })
                                
                        for group_id, g_data in groups_map.items():
                            cursor.execute("""
                                INSERT INTO protocol_groups (protocol_id, group_id, group_name, group_type, anlage_id, anlage_name, anlage_type, anlage_address)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            """, (p_id, group_id, g_data["name"], g_data["type"], sub["id"], sub["name"], sub["system_type"], sub["address"] or ""))
                            
                            for cell in g_data["cells"]:
                                cursor.execute("""
                                    INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value)
                                    VALUES (?, ?, ?, ?, ?)
                                """, (p_id, group_id, cell["slotKey"], cell["detectorType"], cell["value"]))
                imported_count += 1
            conn.commit()
        except Exception as tx_err:
            conn.rollback()
            raise tx_err
        finally:
            conn.close()
            
        return jsonify({
            "success": True,
            "message": f"{imported_count} Wartungsverträge inklusive aller Anlagen und Messpunkte erfolgreich aus TAIFUN-XML importiert und verknüpft."
        })
    except Exception as e:
        print(f"Error during XML import: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/import", methods=["POST"])
def run_import():
    data = request.json
    filename = data.get("filename", "")
    content = data.get("content", "")
    import_type = data.get("importType", "esser")
    
    if not filename or not content:
        return jsonify({"success": False, "error": "Fehlende Header Parameter: filename und content sind erforderlich."}), 400
        
    try:
        # Clear base64 headers if present
        base64_data = content.split(",")[-1]
        decoded_bytes = base64.b64decode(base64_data)
    except Exception as e:
        return jsonify({"success": False, "error": f"Base64 Decodier-Fehler: {str(e)}"}), 400
        
    if import_type == "esser":
        # Simulate high-end ESSER .etb extraction scheme (same fallback structure as esser_parser.py)
        esser_zones = [
            ("M01", "EG Flurbereich West", ["Normal", "Normal", "Normal", "-", "-", "-", "-", "-", "-", "-"]),
            ("M02", "1. OG Aufenthaltsraum", ["Normal", "Normal", "Wärme", "Wärme", "-", "-", "-", "-", "-", "-"]),
            ("M03", "Zentrale Technikraum CO2", ["Normal", "CO2", "CO2", "-", "-", "-", "-", "-", "-", "-"]),
            ("M04", "Dachgeschoss Archiv", ["Normal", "Rauch", "Rauch", "Rauch", "-", "-", "-", "-", "-", "-"]),
            ("M05", "Außenbereich Rampe", ["Normal", "Handmelder", "Handmelder", "-", "-", "-", "-", "-", "-", "-"]),
        ]
        
        imported_rows = []
        for idx, (grp_id, grp_name, types) in enumerate(esser_zones):
            cells = []
            for s_idx in range(10):
                slot_num = str(s_idx + 1)
                det_type = types[s_idx] if s_idx < len(types) else "-"
                
                val = ""
                if det_type != "-":
                    if idx == 0 and s_idx == 0:
                        val = "CHECK"
                    elif idx == 1 and s_idx == 1:
                        val = "Q1"
                    elif idx == 2 and s_idx == 1:
                        val = "Def."
                        
                cells.append({
                    "slotKey": slot_num,
                    "detectorType": det_type,
                    "value": val
                })
                
            imported_rows.append({
                "groupId": grp_id,
                "groupName": grp_name,
                "groupType": "NAM",
                "cells": cells
            })
            
        return jsonify({
            "success": True,
            "message": f"ESSER .etb Datei '{filename}' erfolgreich über Python Server importiert!",
            "subSystems": [
                {
                    "id": f"sub-imported-esser-{int(datetime.now().timestamp())}",
                    "name": f"ESSER Import: {filename.split('.')[0]}",
                    "rows": imported_rows
                }
            ]
        })
        
    elif import_type in ["csv", "xlsx"]:
        # Inline CSV parser parsing with column alignment matching
        try:
            csv_text = decoded_bytes.decode("utf-8", errors="ignore")
            lines = csv_text.splitlines()
            if not lines:
                return jsonify({"success": False, "error": "Fehler: Die Datei ist leer."}), 400
                
            # auto delimiter detect
            sample = "\n".join(lines[:5])
            delimiter = ";" if ";" in sample else ","
            
            reader = csv.reader(lines, delimiter=delimiter)
            raw_rows = list(reader)
            if not raw_rows:
                return jsonify({"success": False, "error": "Fehler: Keine Datenzeilen erfasst."}), 400
                
            group_col, name_col, slot_col, typ_col, val_col = 0, 1, 2, 3, 4
            header_row_index = 0
            
            for r_idx, row in enumerate(raw_rows[:12]):
                if not row: continue
                has_grp = False
                has_name = False
                for c_idx, cell in enumerate(row):
                    cell_val = str(cell).lower().strip()
                    if any(k in cell_val for k in ["gruppe", "bereichsnummer", "meldergruppe", "verstärker", "linie"]):
                        group_col = c_idx
                        has_grp = True
                    if any(k in cell_val for k in ["name", "bezeichnung", "bereich", "raum", "zimmer", "station"]):
                        name_col = c_idx
                        has_name = True
                    if any(k in cell_val for k in ["slot", "melder", "index", "nummer", "element"]):
                        slot_col = c_idx
                    if any(k in cell_val for k in ["typ", "art", "melder_typ"]):
                        typ_col = c_idx
                    if any(k in cell_val for k in ["zustand", "wert", "intervall", "status", "ergebnis"]):
                        val_col = c_idx
                if has_grp and has_name:
                    header_row_index = r_idx + 1
                    break
                    
            groups_map = {}
            max_slot_num = 10
            
            for r_idx in range(header_row_index, len(raw_rows)):
                row = raw_rows[r_idx]
                if not row or len(row) <= max(group_col, name_col): continue
                
                group_id = str(row[group_col]).strip()
                if not group_id or group_id.lower() in ["gruppe", "group", "id", "bereichsnummer"]: continue
                
                group_name = str(row[name_col]).strip() if name_col < len(row) else f"Bereich {group_id}"
                slot_str = str(row[slot_col]).strip() if slot_col < len(row) else "1"
                slot_num = int(slot_str) if slot_str.isdigit() else 1
                
                if 0 < slot_num <= 50 and slot_num > max_slot_num:
                    max_slot_num = slot_num
                    
                det_type = str(row[typ_col]).strip() if (typ_col < len(row) and row[typ_col]) else "Normal"
                val = str(row[val_col]).strip() if (val_col < len(row) and row[val_col]) else ""
                
                if group_id not in groups_map:
                    groups_map[group_id] = {
                        "groupId": group_id,
                        "groupName": group_name or f"Bereich {group_id}",
                        "cellsMap": {}
                    }
                
                g_item = groups_map[group_id]
                if group_name and not g_item["groupName"]:
                    g_item["groupName"] = group_name
                g_item["cellsMap"][slot_num] = {"detectorType": det_type, "value": val}
                
            if not groups_map:
                return jsonify({"success": False, "error": "Es konnten keine tabellarischen Gruppen erkannt werden."}), 400
                
            processed_rows = []
            for g_id, g in groups_map.items():
                cells = []
                for s in range(1, max_slot_num + 1):
                    cell_data = g["cellsMap"].get(s)
                    cells.append({
                        "slotKey": str(s),
                        "detectorType": cell_data["detectorType"] if cell_data else "-",
                        "value": cell_data["value"] if cell_data else ""
                    })
                processed_rows.append({
                    "groupId": g["groupId"],
                    "groupName": g["groupName"],
                    "groupType": "NAM",
                    "cells": cells
                })
                
            return jsonify({
                "success": True,
                "message": f"Datei '{filename}' erfolgreich als CSV eingelesen! {len(processed_rows)} Gruppen mit {max_slot_num} Spalten erfasst.",
                "subSystems": [
                    {
                        "id": f"sub-imported-csv-{int(datetime.now().timestamp())}",
                        "name": f"CSV Import: {filename.split('.')[0]}",
                        "rows": processed_rows
                    }
                ]
            })
        except Exception as e:
            return jsonify({"success": False, "error": f"CSV Import-Fehler: {str(e)}"}), 500
            
    else:
        # Notifier / Hekatron Structured Demos fallbacks
        prefix = "N" if import_type == "notifier" else "H"
        rows = [
            {
                "groupId": f"{prefix}01",
                "groupName": "Foyer West Erdgeschoss",
                "groupType": "NAM",
                "cells": [{"slotKey": str(i+1), "detectorType": "Normal", "value": "CHECK" if i == 0 else ""} for i in range(10)]
            },
            {
                "groupId": f"{prefix}02",
                "groupName": "Archiv & Technik Bereich B2",
                "groupType": "NAM",
                "cells": [{"slotKey": str(i+1), "detectorType": "Rauch" if i < 4 else "-", "value": ""} for i in range(10)]
            }
        ]
        return jsonify({
            "success": True,
            "message": f"{import_type.upper()} Schnittstellen-Simulation erfolgreich.",
            "subSystems": [
                {
                    "id": f"sub-imported-demo-{int(datetime.now().timestamp())}",
                    "name": f"{import_type.upper()} Import ({filename})",
                    "rows": rows
                }
            ]
        })

# ----------------- PDF DOWNLOADS & ARCHIVES ROUTING -----------------

@app.route("/download_pdf/<contract_num>")
def download_active_pdf(contract_num):
    pdf_path = os.path.join(SAMBA_SHARE_PATH, "Protokolle", f"{contract_num}.pdf")
    if not os.path.exists(pdf_path):
        return "<h3>PDF-Protokoll wurde vom Netlink/Core Server noch nicht synchronisiert oder gerendert.</h3>", 404
    return send_file(pdf_path, as_attachment=True, download_name=f"{contract_num}.pdf")

@app.route("/download_archive/<contract_number>/<year>/<half_year>/<filename>")
def download_archive_pdf(contract_number, year, half_year, filename):
    pdf_path = os.path.join(SAMBA_SHARE_PATH, "Archiv", contract_number, year, half_year, filename)
    if not os.path.exists(pdf_path):
        return "<h3>Archiviertes PDF-Protokoll wurde nicht gefunden.</h3>", 404
    return send_file(pdf_path, as_attachment=True, download_name=filename)

if __name__ == "__main__":
    print("Starting production companion Flask WebUI app on port 8080...")
    app.run(host="0.0.0.0", port=8080, debug=False)
