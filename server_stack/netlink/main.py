# -*- coding: utf-8 -*-
import os
import json
import sqlite3
import base64
import hashlib
import zipfile
import io
from datetime import datetime
from flask import Flask, request, jsonify, send_file
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

app = Flask(__name__)

# Load config from env
PORT = int(os.environ.get("PORT", 3000))
DB_PATH = os.environ.get("DB_PATH", "/shared_db/protocols.db")
SERVER_CODEWORD = os.environ.get("SERVER_CODEWORD", "77-XJ-900-PLX-22")

# --- DATABASE LOGIC ---
def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    print(f"Initializing database at: {DB_PATH}")
    db_dir = os.path.dirname(DB_PATH)
    if not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Simple inline schema init to ensure sqlite tables exist immediately
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS technicians (
        id VARCHAR(50) PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL
    );
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS protocols (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address VARCHAR(255) NOT NULL,
        contract_number VARCHAR(100) NOT NULL,
        interval VARCHAR(50) NOT NULL,
        system_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        last_edited_by VARCHAR(255),
        last_edited_at VARCHAR(100),
        columns TEXT NOT NULL,
        applicable_values TEXT NOT NULL,
        detector_types TEXT NOT NULL
    );
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS protocol_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        protocol_id VARCHAR(50) NOT NULL,
        group_id VARCHAR(50) NOT NULL,
        group_name VARCHAR(255) NOT NULL,
        group_type VARCHAR(50) DEFAULT 'NAM',
        FOREIGN KEY (protocol_id) REFERENCES protocols(id) ON DELETE CASCADE,
        UNIQUE(protocol_id, group_id)
    );
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS group_cells (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        protocol_id VARCHAR(50) NOT NULL,
        group_id VARCHAR(50) NOT NULL,
        slot_key VARCHAR(50) NOT NULL,
        detector_type VARCHAR(100) NOT NULL,
        value VARCHAR(50) NOT NULL DEFAULT '',
        FOREIGN KEY (protocol_id, group_id) REFERENCES protocol_groups(protocol_id, group_id) ON DELETE CASCADE,
        UNIQUE(protocol_id, group_id, slot_key)
    );
    """)
    
    # Populate initial values if empty
    cursor.execute("SELECT COUNT(*) as cnt FROM technicians")
    if cursor.fetchone()["cnt"] == 0:
        cursor.execute("INSERT INTO technicians (id, username, password_hash, name) VALUES ('99283-FS', 'tprantl', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', 'Thomas Prantl')")
        
        # Add sample protocol (BMA)
        cursor.execute("""
        INSERT INTO protocols (id, name, address, contract_number, interval, system_type, status, last_edited_by, last_edited_at, columns, applicable_values, detector_types)
        VALUES ('1', 'Zentral-Klinikum West', 'Klinikstraße 12, 1010 Wien', 'V-2024-99a', 'Halbjährlich', 'BMA', 'ready_to_download', 'Sophia Reiter', '15.05.2026', '["1","2","3","4"]', '["CHECK","Def."]', '["ZD","DB","RAS","TDIF"]')
        """)
        cursor.execute("INSERT INTO protocol_groups (protocol_id, group_id, group_name, group_type) VALUES ('1', 'GRP 01', 'Technikraum 2a', 'TECH')")
        cursor.execute("INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value) VALUES ('1', 'GRP 01', '1', 'ZD', '')")
        cursor.execute("INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value) VALUES ('1', 'GRP 01', '2', 'ZD', '')")
        cursor.execute("INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value) VALUES ('1', 'GRP 01', '3', 'RAS', '')")
        cursor.execute("INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value) VALUES ('1', 'GRP 01', '4', 'ZD', '')")
        
        # Add sample protocol (EMA)
        cursor.execute("""
        INSERT INTO protocols (id, name, address, contract_number, interval, system_type, status, last_edited_by, last_edited_at, columns, applicable_values, detector_types)
        VALUES ('4', 'Sparkasse Filiale Hauptplatz', 'Hauptplatz 10, 4020 Linz', 'V-2025-4412-B', 'Jährlich', 'EMA', 'ready_to_download', 'Matthias Huber', '10.05.2026', '["1","2","3","4"]', '["CHECK","Def."]', '["BWM","ZK","RSK","Lichtschranke"]')
        """)
        cursor.execute("INSERT INTO protocol_groups (protocol_id, group_id, group_name, group_type) VALUES ('4', 'GRP 01', 'Foyer & Geldausgabe', 'TECH')")
        cursor.execute("INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value) VALUES ('4', 'GRP 01', '1', 'BWM', '')")
        cursor.execute("INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value) VALUES ('4', 'GRP 01', '2', 'ZK', '')")
        cursor.execute("INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value) VALUES ('4', 'GRP 01', '3', 'RSK', '')")
        cursor.execute("INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value) VALUES ('4', 'GRP 01', '4', 'Lichtschranke', '')")

    conn.commit()
    conn.close()

# --- CRYPTOGRAPHY LAYER ---
def derive_key(codeword: str) -> bytes:
    salt = b"ENO_AUSLOESELISTE_v1"
    return hashlib.pbkdf2_hmac("sha256", codeword.encode("utf-8"), salt, 100000, 32)

def encrypt_payload(plain_text: str, codeword: str) -> str:
    key = derive_key(codeword)
    iv = AESGCM.generate_nonce(12)
    aesgcm = AESGCM(key)
    ciphertext_with_tag = aesgcm.encrypt(iv, plain_text.encode("utf-8"), None)
    return base64.b64encode(iv + ciphertext_with_tag).decode("utf-8")

def decrypt_payload(wire_b64: str, codeword: str) -> str:
    key = derive_key(codeword)
    data = base64.b64decode(wire_b64)
    if len(data) < 28:
        raise ValueError("Invalid wire format: data too short.")
    iv, ciphertext_with_tag = data[:12], data[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, ciphertext_with_tag, None).decode("utf-8")

# --- SECURE AUTHENTICATION CHECKER ---
def authenticate_request():
    auth_header = request.headers.get("X-Auth")
    if not auth_header:
        # Returns unencrypted 401 response per spec
        return False, {"error": "UNAUTHORIZED", "message": "X-Auth Header fehlt."}
    
    try:
        decrypted_auth = decrypt_payload(auth_header, SERVER_CODEWORD)
        auth_data = json.loads(decrypted_auth)
        username = auth_data.get("user")
        password = auth_data.get("pass") # Plain or simple hash representing pwd
        
        # Verify in database
        # Password in schema is simple hash of password matching the username
        pass_hash = hashlib.sha256(password.encode("utf-8")).hexdigest()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM technicians WHERE username = ? AND password_hash = ?", (username, pass_hash))
        tech = cursor.fetchone()
        conn.close()
        
        if tech:
            return True, {"id": tech["id"], "name": tech["name"]}
        else:
            return False, {"error": "INVALID_CREDENTIALS", "message": "Falscher Benutzername oder Passwort."}
    except Exception as e:
        return False, {
            "error": "DECRYPTION_FAILED",
            "message": f"Konnte X-Auth nicht entschlüsseln. Codewort evtl. falsch oder Header korrupt. Detail: {str(e)}"
        }

# --- ENDPOINTS ---

@app.route("/auth/check", methods=["POST"])
def auth_check():
    success, auth_details = authenticate_request()
    if not success:
        return jsonify(auth_details), 401
    
    # Authorized response payload
    response_data = {
        "status": "authorized",
        "technician_id": auth_details["id"],
        "name": auth_details["name"]
    }
    
    # Return AES-GCM encrypted response
    encrypted_resp = encrypt_payload(json.dumps(response_data), SERVER_CODEWORD)
    return encrypted_resp, 200

@app.route("/protocols/search", methods=["POST"])
def protocols_search():
    success, auth_details = authenticate_request()
    if not success:
        return jsonify(auth_details), 401
    
    try:
        # Decrypt search query which is wrapped in Request Body
        encrypted_body = request.data.decode("utf-8").strip()
        if encrypted_body:
            decrypted_body = decrypt_payload(encrypted_body, SERVER_CODEWORD)
            body_json = json.loads(decrypted_body)
            query = body_json.get("query", "").strip().lower()
        else:
            query = ""
    except Exception as e:
        return jsonify({"error": "DECRYPTION_FAILED", "message": f"Suche konnte nicht entschlüsselt werden. {str(e)}"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    
    if query:
        # Search via SQL like wildcard filters
        search_pattern = f"%{query}%"
        cursor.execute("""
            SELECT id, name, address, contract_number, interval, system_type, status 
            FROM protocols 
            WHERE LOWER(name) LIKE ? OR LOWER(address) LIKE ? OR LOWER(contract_number) LIKE ?
        """, (search_pattern, search_pattern, search_pattern))
    else:
        cursor.execute("SELECT id, name, address, contract_number, interval, system_type, status FROM protocols")
        
    records = cursor.fetchall()
    conn.close()
    
    results = []
    for r in records:
        results.append({
            "id": r["id"],
            "name": r["name"],
            "address": r["address"],
            "contract_number": r["contract_number"],
            "interval": r["interval"],
            "system_type": r["system_type"],
            "status": r["status"]
        })
        
    encrypted_resp = encrypt_payload(json.dumps(results), SERVER_CODEWORD)
    return encrypted_resp, 200

@app.route("/protocols/list-pending", methods=["POST"])
def list_pending():
    success, auth_details = authenticate_request()
    if not success:
        return jsonify(auth_details), 401
    
    conn = get_db_connection()
    cursor = conn.cursor()
    # Pull pending downloads
    cursor.execute("""
        SELECT id, name, address, contract_number, interval, system_type, status 
        FROM protocols 
        WHERE status IN ('ready_to_download', 'downloaded', 'upload_pending')
    """)
    records = cursor.fetchall()
    conn.close()
    
    results = []
    for r in records:
        results.append({
            "id": r["id"],
            "name": r["name"],
            "address": r["address"],
            "contract_number": r["contract_number"],
            "interval": r["interval"],
            "system_type": r["system_type"],
            "status": r["status"]
        })
        
    encrypted_resp = encrypt_payload(json.dumps(results), SERVER_CODEWORD)
    return encrypted_resp, 200

@app.route("/protocols/download/<id>", methods=["POST"])
def protocol_download(id):
    success, auth_details = authenticate_request()
    if not success:
        return jsonify(auth_details), 401
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM protocols WHERE id = ?", (id,))
    p = cursor.fetchone()
    if not p:
        conn.close()
        return jsonify({"error": "PROTOCOL_NOT_FOUND", "message": "Das gesuchte Protokoll existiert nicht."}), 404
        
    # Fetch rows
    cursor.execute("SELECT * FROM protocol_groups WHERE protocol_id = ?", (id,))
    groups = cursor.fetchall()
    
    rows_data = []
    for g in groups:
        cursor.execute("SELECT * FROM group_cells WHERE protocol_id = ? AND group_id = ?", (id, g["group_id"]))
        cells = cursor.fetchall()
        cells_list = []
        for c in cells:
            cells_list.append({
                "slot_key": c["slot_key"],
                "detector_type": c["detector_type"],
                "value": c["value"]
            })
        rows_data.append({
            "group_id": g["group_id"],
            "group_name": g["group_name"],
            "group_type": g["group_type"],
            "cells": cells_list
        })
    
    conn.close()
    
    # Form protocol.json data
    protocol_json = {
        "protocol_id": p["id"],
        "client_name": p["name"],
        "contract_number": p["contract_number"],
        "interval": p["interval"],
        "system_type": p["system_type"],
        "definition": {
            "columns": [{"key": c, "label": f"Slot {c}"} for c in json.loads(p["columns"])],
            "applicable_values": [{"value": v, "label": v, "is_defect": v == "Def."} for v in json.loads(p["applicable_values"])],
            "detector_types": json.loads(p["detector_types"])
        },
        "rows": rows_data
    }
    
    # Compile ZIP
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
        zip_file.writestr("protocol.json", json.dumps(protocol_json, indent=2, ensure_ascii=False))
        # Add basic reference documents if BMA/EMA custom assets exist under folder
        zip_file.writestr("README_IMPORTANT.txt", "Sicherheitsgeprueftes offline-faehiges Wartungsprotokoll v1.")
        
    zip_buffer.seek(0)
    
    # Encrypt raw ZIP byte stream with AESGCM
    raw_zip_bytes = zip_buffer.getvalue()
    key = derive_key(SERVER_CODEWORD)
    iv = AESGCM.generate_nonce(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, raw_zip_bytes, None)
    
    # Combine into Wire-Format and base64 string
    wire_b64 = base64.b64encode(iv + ciphertext).decode("utf-8")
    
    return wire_b64, 200, {"Content-Type": "text/plain"}

@app.route("/protocols/upload/<id>", methods=["POST"])
def protocol_upload(id):
    success, auth_details = authenticate_request()
    if not success:
        return jsonify(auth_details), 401
    
    try:
        encrypted_body = request.data.decode("utf-8").strip()
        decrypted_body = decrypt_payload(encrypted_body, SERVER_CODEWORD)
        uploaded_data = json.loads(decrypted_body)
    except Exception as e:
        return jsonify({"error": "DECRYPTION_FAILED", "message": f"Upload konnte nicht entschlüsselt werden: {str(e)}"}), 400
        
    rows = uploaded_data.get("rows", [])
    finished_at = uploaded_data.get("finished_at", datetime.utcnow().isoformat())
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Ensure protocol exists in DBMS
    cursor.execute("SELECT id FROM protocols WHERE id = ?", (id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "PROTOCOL_NOT_FOUND", "message": "Protokoll existiert nicht beim Upload."}), 404
        
    # Transactional Update of values
    try:
        # Update overall status and timestamp
        formatted_date = datetime.now().strftime("%d.%m.%Y")
        cursor.execute("""
            UPDATE protocols 
            SET status = 'synchronized', last_edited_by = ?, last_edited_at = ? 
            WHERE id = ?
        """, (auth_details["name"], formatted_date, id))
        
        # Merge updated rows and cells
        for row in rows:
            g_id = row.get("group_id")
            g_name = row.get("group_name", "")
            g_type = row.get("group_type", "NAM")
            
            cursor.execute("""
                INSERT INTO protocol_groups (protocol_id, group_id, group_name, group_type)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(protocol_id, group_id) DO UPDATE SET group_name = EXCLUDED.group_name, group_type = EXCLUDED.group_type
            """, (id, g_id, g_name, g_type))
            
            for cell in row.get("cells", []):
                slot_key = cell.get("slot_key")
                det_type = cell.get("detector_type", "-")
                val = cell.get("value", "")
                
                cursor.execute("""
                    INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(protocol_id, group_id, slot_key) DO UPDATE SET detector_type = EXCLUDED.detector_type, value = EXCLUDED.value
                """, (id, g_id, slot_key, det_type, val))
                
        conn.commit()
    except Exception as ex:
        conn.rollback()
        conn.close()
        return jsonify({"error": "DATABASE_ERROR", "message": f"Fehler beim Speichern in SQLite DBMS: {str(ex)}"}), 500
        
    conn.close()
    
    response_payload = {
        "status": "conflict_resolved_or_synced",
        "version": 2,
        "message": f"Wartung '{id}' erfolgreich auf den Python Server synchronisiert und archiviert."
    }
    
    encrypted_resp = encrypt_payload(json.dumps(response_payload), SERVER_CODEWORD)
    return encrypted_resp, 200

# --- SHUTDOWN & HEALTH CHECKS ---
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "running", "database": os.path.exists(DB_PATH)})

if __name__ == "__main__":
    init_db()
    print(f"Starting Secure Netlink Service stack Gateway on port {PORT}...")
    app.run(host="0.0.0.0", port=PORT, debug=False)
