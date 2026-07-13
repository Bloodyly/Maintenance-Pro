# -*- coding: utf-8 -*-
import os
import json
import sqlite3
import base64
import hashlib
import zipfile
import io
import time
from datetime import datetime, date, timezone
from flask import Flask, request, jsonify, send_file
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def current_quarter() -> str:
    today = date.today()
    q = (today.month - 1) // 3 + 1
    return f"{today.year}-Q{q}"


def record_device_edit(cursor, protocol_id, group_id, technician_name):
    """One row per device sync -- feeds the PDF's 'Prüfer Q1-Q4' section.
    Called once per distinct device actually touched by an upload, not once
    per Melder-Gruppe row within it."""
    cursor.execute(
        "INSERT INTO device_edit_history (protocol_id, group_id, technician_name, edited_at, quarter) VALUES (?, ?, ?, ?, ?)",
        (protocol_id, group_id, technician_name, int(datetime.now(timezone.utc).timestamp() * 1000), current_quarter())
    )


# ── Unified per-device storage ──────────────────────────────────────────────────
#
# One protocol_groups row = one "Gerät" (a whole system, e.g. "BMA Hauptgebäude"),
# regardless of where it came from (TAIFUN import, ETB import, manual entry). Its
# internal Melder-Gruppen live entirely inside group_cells under that SAME group_id:
#   - a '__rows__' cell holds the registry [[grp_num, grp_name], ...]
#   - every real Melder is its own row: slot_key = f"{grp_num}_{melder_nr}",
#     each with its own detector_type/value/updated_at for correct delta-sync.
#
# On the wire (download/sync to the app), each Melder-Gruppe still appears as its own
# row for the app's grid UI, with group_id namespaced as "{device_group_id}::{grp_num}"
# so an upload can be routed back to the exact device+group deterministically, with no
# guessing/scanning needed.

def _device_registry(cursor, protocol_id, group_id):
    """Returns (registry: [[grp_num, grp_name], ...], other_cells: [Row]) for one device,
    lazily migrating legacy storage (GRID_V1 blob or old flat single-index cells) to the
    unified format in place the first time it's touched."""
    cursor.execute(
        "SELECT slot_key, detector_type, value, updated_at FROM group_cells WHERE protocol_id = ? AND group_id = ?",
        (protocol_id, group_id)
    )
    cells = cursor.fetchall()
    if not cells:
        return [], []

    registry_cell = next((c for c in cells if c["slot_key"] == "__rows__"), None)
    if registry_cell:
        try:
            registry = json.loads(registry_cell["value"])
        except Exception:
            registry = []
        return registry, [c for c in cells if c["slot_key"] != "__rows__"]

    # Not yet unified -- migrate lazily, once, in place.
    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    grid_cell = next((c for c in cells if c["slot_key"] == "__grid__" and c["detector_type"] == "GRID_V1"), None)

    if grid_cell:
        try:
            gd = json.loads(grid_cell["value"])
        except Exception:
            return [], []
        groups_list = gd.get("groups", [])
        types_map = gd.get("types", {})
        values_map = gd.get("values", {})
        n_cols = gd.get("n_cols", 0)

        registry = [[str(g[0]) if g else str(i), str(g[1]) if len(g) > 1 else ""] for i, g in enumerate(groups_list, 1)]
        for row_idx, g in enumerate(groups_list, 1):
            grp_num = str(g[0]) if g else str(row_idx)
            for col_idx in range(1, n_cols + 1):
                key = f"{row_idx}_{col_idx}"
                det_type = types_map.get(key, "-")
                val = values_map.get(key, "")
                if det_type == "-" and not val:
                    continue
                cursor.execute("""
                    INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(protocol_id, group_id, slot_key) DO NOTHING
                """, (protocol_id, group_id, f"{grp_num}_{col_idx}", det_type, val, now))
        cursor.execute(
            "DELETE FROM group_cells WHERE protocol_id = ? AND group_id = ? AND slot_key = '__grid__'",
            (protocol_id, group_id)
        )
    else:
        # Legacy flat device: a single row of simple-indexed cells becomes Melder-Gruppe "1".
        registry = [["1", ""]]
        old_slot_keys = [c["slot_key"] for c in cells]
        for c in cells:
            cursor.execute("""
                INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(protocol_id, group_id, slot_key) DO NOTHING
            """, (protocol_id, group_id, f"1_{c['slot_key']}", c["detector_type"], c["value"], c["updated_at"] or now))
        for old_key in old_slot_keys:
            cursor.execute(
                "DELETE FROM group_cells WHERE protocol_id = ? AND group_id = ? AND slot_key = ?",
                (protocol_id, group_id, old_key)
            )

    cursor.execute(
        "INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value, updated_at) "
        "VALUES (?, ?, '__rows__', '-', ?, ?) "
        "ON CONFLICT(protocol_id, group_id, slot_key) DO UPDATE SET value = EXCLUDED.value",
        (protocol_id, group_id, json.dumps(registry), now)
    )
    cursor.execute(
        "SELECT slot_key, detector_type, value, updated_at FROM group_cells WHERE protocol_id = ? AND group_id = ?",
        (protocol_id, group_id)
    )
    cells = cursor.fetchall()
    return registry, [c for c in cells if c["slot_key"] != "__rows__"]


def build_device_rows_payload(cursor, protocol_id):
    """Expands every device of a protocol into wire-format rows (one per Melder-Gruppe),
    namespacing group_id as '{device_group_id}::{grp_num}'. Returns (rows_data, max_cols)."""
    cursor.execute("SELECT * FROM protocol_groups WHERE protocol_id = ?", (protocol_id,))
    devices = cursor.fetchall()

    rows_data = []
    max_cols = 0

    for dev in devices:
        registry, cells = _device_registry(cursor, protocol_id, dev["group_id"])
        if not registry:
            continue  # empty shell (e.g. TAIFUN-created device with no Auslöseliste yet)

        cells_by_grp = {}
        for c in cells:
            if "_" not in c["slot_key"]:
                continue
            grp_num, melder_nr = c["slot_key"].split("_", 1)
            cells_by_grp.setdefault(grp_num, []).append((melder_nr, c))

        for grp_num, grp_name in registry:
            grp_num = str(grp_num)
            row_cells = []
            for melder_nr, c in cells_by_grp.get(grp_num, []):
                row_cells.append({
                    "slot_key": melder_nr,
                    "detector_type": c["detector_type"],
                    "value": c["value"],
                    "updated_at": c["updated_at"] or 0
                })
            max_cols = max(max_cols, len(row_cells))
            rows_data.append({
                "group_id": f"{dev['group_id']}::{grp_num}",
                "group_name": grp_name,
                "group_type": (dev["group_type"] if "group_type" in dev.keys() else "") or "NAM",
                "anlage_id": (dev["anlage_id"] if "anlage_id" in dev.keys() else "") or "",
                "anlage_name": (dev["anlage_name"] if "anlage_name" in dev.keys() else "") or "",
                "anlage_type": (dev["anlage_type"] if "anlage_type" in dev.keys() else "") or "",
                "anlage_interval": (dev["anlage_interval"] if "anlage_interval" in dev.keys() else "") or "",
                "cells": row_cells
            })

    return rows_data, max_cols


def build_device_hardware_payload(cursor, protocol_id):
    """One entry per device that has a '__hardware__' inventory blob (Zentrale +
    Ringkarten, optional per Gerät). Deliberately separate from
    build_device_rows_payload -- Hardware is scoped to the whole device, not a
    single Melder-Gruppe, so it can't be expressed as one more 'row' there
    without smuggling a fake Melder-Gruppe through the wire protocol. Devices
    without a Hardware table simply don't appear in the result."""
    cursor.execute("SELECT * FROM protocol_groups WHERE protocol_id = ?", (protocol_id,))
    devices = cursor.fetchall()

    hardware_data = []
    for dev in devices:
        cursor.execute(
            "SELECT value, updated_at FROM group_cells WHERE protocol_id = ? AND group_id = ? AND slot_key = '__hardware__'",
            (protocol_id, dev["group_id"])
        )
        hw_cell = cursor.fetchone()
        if not hw_cell:
            continue
        try:
            hw_json = json.loads(hw_cell["value"])
        except Exception:
            continue
        hardware_data.append({
            "group_id": dev["group_id"],
            "updated_at": hw_cell["updated_at"] or 0,
            "rows": hw_json.get("rows", [])
        })
    return hardware_data


def apply_wire_hardware_to_device(cursor, protocol_id, device_group_id, hw_rows, updated_at=None):
    """Writes/overwrites one device's '__hardware__' inventory blob. Whole-blob
    last-write-wins (compares against the stored updated_at), mirroring the
    per-cell LWW check in sync_upload_cells -- hardware edits are infrequent
    and small enough that field-level merging isn't worth the complexity."""
    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    ts = updated_at if updated_at else now
    cursor.execute(
        "SELECT updated_at FROM group_cells WHERE protocol_id = ? AND group_id = ? AND slot_key = '__hardware__'",
        (protocol_id, device_group_id)
    )
    existing = cursor.fetchone()
    if existing is not None and (existing["updated_at"] or 0) > ts:
        return False  # a newer value already stored -- last-write-wins keeps it
    value = json.dumps({"v": 1, "rows": hw_rows})
    cursor.execute(
        "INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value, updated_at) "
        "VALUES (?, ?, '__hardware__', '-', ?, ?) "
        "ON CONFLICT(protocol_id, group_id, slot_key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at",
        (protocol_id, device_group_id, value, ts)
    )
    return True


def apply_wire_row_to_device(cursor, protocol_id, wire_group_id, cells, group_name=None):
    """
    Writes an uploaded wire-row's cells back into the owning device's unified storage.
    `wire_group_id` is "{device_group_id}::{grp_num}" as produced by
    build_device_rows_payload -- no scanning/guessing needed to find the owner.
    `cells` is a list of dicts with slot_key/detector_type/value(/updated_at).
    Returns True if applied, False if wire_group_id wasn't in the expected shape.
    """
    if "::" not in str(wire_group_id):
        return False
    device_group_id, grp_num = str(wire_group_id).split("::", 1)

    registry, _ = _device_registry(cursor, protocol_id, device_group_id)
    existing = next((g for g in registry if str(g[0]) == grp_num), None)
    registry_changed = False
    if existing is None:
        registry.append([grp_num, group_name or ""])
        registry_changed = True
    elif group_name is not None and existing[1] != group_name:
        existing[1] = group_name
        registry_changed = True

    if registry_changed:
        # Device may not have any cells yet at all (e.g. a brand-new TAIFUN device
        # with no Auslöseliste) -- upsert rather than UPDATE so the registry cell
        # is created if it's missing, not just updated if present.
        cursor.execute("""
            INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value, updated_at)
            VALUES (?, ?, '__rows__', '-', ?, ?)
            ON CONFLICT(protocol_id, group_id, slot_key) DO UPDATE SET value = EXCLUDED.value
        """, (protocol_id, device_group_id, json.dumps(registry), int(datetime.now(timezone.utc).timestamp() * 1000)))

    for cell in cells:
        slot_key = f"{grp_num}_{cell.get('slot_key')}"
        det_type = cell.get("detector_type", "-")
        val = cell.get("value", "")
        # The full-upload ("Abschließen") path sends updated_at=0 for every cell
        # (an Android DTO default, not a real timestamp) -- writing that through
        # verbatim used to permanently defeat protocol_core's needs_regen gate
        # (last_changed_at > pdf_generated_at), so a re-edited, re-uploaded
        # protocol silently never got a new PDF or archive entry. Stamp with the
        # server clock whenever the wire value is missing/zero instead of
        # trusting it; sync_upload_cells's own last-write-wins values are always
        # real timestamps already, so this is a no-op for that path.
        ts = cell.get("updated_at") or int(datetime.now(timezone.utc).timestamp() * 1000)
        cursor.execute("""
            INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(protocol_id, group_id, slot_key)
            DO UPDATE SET detector_type = EXCLUDED.detector_type, value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
        """, (protocol_id, device_group_id, slot_key, det_type, val, ts))
    return True


app = Flask(__name__)

SERVER_VERSION = "1.3.0"
SERVER_START_TIME = datetime.utcnow()

# Load config from env
PORT = int(os.environ.get("PORT", 3000))
DB_PATH = os.environ.get(
    "DB_PATH",
    os.path.join(os.path.dirname(__file__), "..", "protocol_db", "protocols.db")
)
SERVER_CODEWORD = os.environ.get("SERVER_CODEWORD", "77-XJ-900-PLX-22")

# --- LIVE SESSION TRACKING ---
active_live_sessions = {}

def is_protocol_live(protocol_id) -> bool:
    if protocol_id not in active_live_sessions:
        return False
    last_act = active_live_sessions[protocol_id]
    # Keep active status live if checked within 30 seconds
    if (datetime.utcnow() - last_act).total_seconds() < 30:
        return True
    return False

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
        anlage_id VARCHAR(100) DEFAULT 'default',
        anlage_name VARCHAR(255) DEFAULT 'Hauptanlage',
        anlage_type VARCHAR(50) DEFAULT 'BMA',
        anlage_address VARCHAR(255) DEFAULT '',
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
        updated_at INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (protocol_id, group_id) REFERENCES protocol_groups(protocol_id, group_id) ON DELETE CASCADE,
        UNIQUE(protocol_id, group_id, slot_key)
    );
    """)
    try:
        cursor.execute("ALTER TABLE group_cells ADD COLUMN updated_at INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute("ALTER TABLE protocols ADD COLUMN updated_at INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute("ALTER TABLE protocol_groups ADD COLUMN anlage_interval VARCHAR(50) DEFAULT 'Halbjährlich'")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE protocol_groups ADD COLUMN anlage_id VARCHAR(100) DEFAULT 'default'")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE protocol_groups ADD COLUMN anlage_name VARCHAR(255) DEFAULT 'Hauptanlage'")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE protocol_groups ADD COLUMN anlage_type VARCHAR(50) DEFAULT 'BMA'")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE protocol_groups ADD COLUMN anlage_address VARCHAR(255) DEFAULT ''")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE protocols ADD COLUMN synchronized_quarter VARCHAR(20) DEFAULT ''")
    except sqlite3.OperationalError:
        pass

    # Mandant = organizational sub-unit of the same company (e.g. "Esser-Team" vs
    # "Notifier-Team"), NOT a security boundary -- every technician still syncs
    # everything, mandant_id is only used client-side for the default "show my own
    # contracts first" filter. See mandant_id usage in authenticate_request() and
    # the sync payload builders below.
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
    try:
        cursor.execute("ALTER TABLE protocols ADD COLUMN mandant_id VARCHAR(50) DEFAULT 'standard'")
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute("ALTER TABLE technicians ADD COLUMN mandant_id VARCHAR(50) DEFAULT 'standard'")
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute("ALTER TABLE mandanten ADD COLUMN company_name VARCHAR(255) DEFAULT ''")
    except sqlite3.OperationalError:
        pass

    # One row per device sync, so the PDF's "Prüfer Q1-Q4" section can list who
    # actually worked on a device's Auslöseliste and when -- protocols.last_edited_by
    # only ever holds the single most recent editor, overwritten on every sync.
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
    iv = os.urandom(12)
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
        cursor.execute("SELECT id, name, mandant_id FROM technicians WHERE username = ? AND password_hash = ?", (username, pass_hash))
        tech = cursor.fetchone()
        conn.close()

        if tech:
            return True, {"id": tech["id"], "name": tech["name"], "mandant_id": tech["mandant_id"] or "standard"}
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

    try:
        response_data = {
            "status": "authorized",
            "technician_id": auth_details["id"],
            "name": auth_details["name"],
            "mandant_id": auth_details["mandant_id"]
        }
        encrypted_resp = encrypt_payload(json.dumps(response_data), SERVER_CODEWORD)
        return encrypted_resp, 200
    except Exception as e:
        return jsonify({"error": "RESPONSE_ENCRYPT_FAILED", "message": str(e)}), 500

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

    # Auto-reset protocols whose synchronized_quarter is outdated
    cq = current_quarter()
    cursor.execute("""
        UPDATE protocols SET status = 'ready_to_download', synchronized_quarter = ''
        WHERE status = 'synchronized' AND synchronized_quarter != '' AND synchronized_quarter != ?
    """, (cq,))
    conn.commit()

    has_cells_subq = "EXISTS(SELECT 1 FROM group_cells gc WHERE gc.protocol_id = protocols.id)"
    if query:
        search_pattern = f"%{query}%"
        cursor.execute(f"""
            SELECT id, name, address, contract_number, interval, system_type, status, mandant_id,
                   ({has_cells_subq}) AS has_cells
            FROM protocols
            WHERE LOWER(name) LIKE ? OR LOWER(address) LIKE ? OR LOWER(contract_number) LIKE ?
        """, (search_pattern, search_pattern, search_pattern))
    else:
        cursor.execute(f"""
            SELECT id, name, address, contract_number, interval, system_type, status, mandant_id,
                   ({has_cells_subq}) AS has_cells
            FROM protocols
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
            "status": r["status"],
            "mandant_id": r["mandant_id"] or "standard",
            "is_live": is_protocol_live(r["id"]),
            "has_cells": bool(r["has_cells"])
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
        SELECT id, name, address, contract_number, interval, system_type, status, mandant_id
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
            "status": r["status"],
            "mandant_id": r["mandant_id"] or "standard",
            "is_live": is_protocol_live(r["id"])
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
        
    # Every device (Gerät) expands into one wire-row per Melder-Gruppe; storage is
    # unified regardless of source (TAIFUN/ETB/manual) -- see build_device_rows_payload.
    rows_data, max_cols = build_device_rows_payload(cursor, id)
    hardware_data = build_device_hardware_payload(cursor, id)
    conn.commit()  # persist any lazy migration performed while reading
    conn.close()

    # Build column definitions: for matrix-style devices use max_cols, otherwise DB columns
    if max_cols > 0:
        col_keys = [str(i) for i in range(1, max_cols + 1)]
    else:
        try:
            col_keys = json.loads(p["columns"])
        except Exception:
            col_keys = []

    protocol_json = {
        "protocol_id": p["id"],
        "client_name": p["name"],
        "contract_number": p["contract_number"],
        "interval": p["interval"],
        "system_type": p["system_type"],
        "mandant_id": (p["mandant_id"] if "mandant_id" in p.keys() else "") or "standard",
        "definition": {
            "columns": [{"key": c, "label": str(c)} for c in col_keys],
            "applicable_values": [{"value": v, "label": v, "is_defect": v == "Def."} for v in json.loads(p["applicable_values"])],
            "detector_types": json.loads(p["detector_types"])
        },
        "rows": rows_data,
        "hardware": hardware_data
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
    iv = os.urandom(12)
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
    hardware = uploaded_data.get("hardware", [])
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
        # Update overall status and timestamp. updated_at is what protocol_core polls
        # against pdf_generated_at to know a fresh PDF is due -- without it, completions
        # via this endpoint (the app's "Abschließen" button) would never trigger one.
        formatted_date = datetime.now().strftime("%d.%m.%Y")
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        cursor.execute("""
            UPDATE protocols
            SET status = 'synchronized', last_edited_by = ?, last_edited_at = ?, updated_at = ?
            WHERE id = ?
        """, (auth_details["name"], formatted_date, now_ms, id))

        # Each uploaded row's group_id is namespaced "{device_group_id}::{grp_num}"
        # (see build_device_rows_payload) so it routes straight back to the exact
        # device + Melder-Gruppe it belongs to -- never creates a new top-level device.
        touched_devices = set()
        for row in rows:
            wire_group_id = row.get("group_id")
            applied = apply_wire_row_to_device(
                cursor, id, wire_group_id, row.get("cells", []), group_name=row.get("group_name")
            )
            if not applied:
                # Not a recognized namespaced id (shouldn't normally happen) -- ignore rather
                # than silently fragmenting a new top-level device out of a malformed upload.
                continue
            touched_devices.add(str(wire_group_id).split("::", 1)[0])

        # Hardware is device-scoped (not a Melder-Gruppe), so it's a sibling
        # array to 'rows' rather than another namespaced row -- see
        # build_device_hardware_payload / apply_wire_hardware_to_device.
        for hw_entry in hardware:
            device_group_id = hw_entry.get("group_id")
            if not device_group_id:
                continue
            apply_wire_hardware_to_device(
                cursor, id, device_group_id, hw_entry.get("rows", []), hw_entry.get("updated_at")
            )
            touched_devices.add(device_group_id)

        for device_group_id in touched_devices:
            record_device_edit(cursor, id, device_group_id, auth_details["name"])

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

@app.route("/protocols/live-sync/<id>", methods=["POST"])
def protocols_live_sync(id):
    success, auth_details = authenticate_request()
    if not success:
        return jsonify(auth_details), 401
    
    try:
        encrypted_body = request.data.decode("utf-8").strip()
        decrypted_body = decrypt_payload(encrypted_body, SERVER_CODEWORD)
        uploaded_data = json.loads(decrypted_body)
    except Exception as e:
        return jsonify({"error": "DECRYPTION_FAILED", "message": f"Live Sync konnte nicht entschlüsselt werden. {str(e)}"}), 400
        
    # Mark/Renew active live session session
    active_live_sessions[id] = datetime.utcnow()
    
    payload_json_str = uploaded_data.get("payload_json", "{}")
    client_payload = json.loads(payload_json_str)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verify protocol exists in DBMS
    cursor.execute("SELECT id, columns, applicable_values, detector_types FROM protocols WHERE id = ?", (id,))
    p_row = cursor.fetchone()
    if not p_row:
        conn.close()
        return jsonify({"error": "PROTOCOL_NOT_FOUND", "message": "Protokoll existiert nicht beim Live-Sync."}), 404
        
    # 1. Merge columns definitions if the client sent the newest structure definitions
    client_def = client_payload.get("definition", {})
    client_cols = client_def.get("columns", [])
    if client_cols:
        client_keys = [c.get("key") for c in client_cols if c.get("key")]
        existing_cols = json.loads(p_row["columns"])
        merged_cols = existing_cols[:]
        for ck in client_keys:
            if ck not in merged_cols:
                merged_cols.append(ck)
        cursor.execute("UPDATE protocols SET columns = ? WHERE id = ?", (json.dumps(merged_cols), id))
        
    # 2. Merge cells on-the-fly. Each row's group_id is namespaced
    # "{device_group_id}::{grp_num}" (see build_device_rows_payload) so it routes
    # straight back to the exact device + Melder-Gruppe -- never creates a new
    # top-level device. Last-write-wins per cell, same semantics as before.
    rows = client_payload.get("rows", [])
    for row in rows:
        g_id = row.get("group_id")
        if "::" not in str(g_id):
            continue
        device_group_id, grp_num = str(g_id).split("::", 1)

        cells_to_apply = []
        for cell in row.get("cells", []):
            slot_key = cell.get("slot_key")
            det_type = cell.get("detector_type", "-")
            val = cell.get("value", "")
            up_at = cell.get("updated_at", 0)

            cursor.execute(
                "SELECT value, updated_at FROM group_cells WHERE protocol_id = ? AND group_id = ? AND slot_key = ?",
                (id, device_group_id, f"{grp_num}_{slot_key}")
            )
            existing_c = cursor.fetchone()
            should_update = existing_c is None
            if existing_c is not None:
                db_up_at = existing_c["updated_at"] or 0
                db_val = existing_c["value"] or ""
                if up_at > db_up_at or (up_at == db_up_at and val != db_val):
                    should_update = True
            if should_update:
                cells_to_apply.append(cell)

        if cells_to_apply:
            apply_wire_row_to_device(cursor, id, g_id, cells_to_apply, group_name=row.get("group_name"))

    # 2b. Merge Hardware blobs on-the-fly -- device-scoped, not Melder-Gruppe-scoped,
    # so it's a sibling of 'rows' rather than another namespaced row within it.
    for hw_entry in client_payload.get("hardware", []):
        device_group_id = hw_entry.get("group_id")
        if not device_group_id:
            continue
        apply_wire_hardware_to_device(
            cursor, id, device_group_id, hw_entry.get("rows", []), hw_entry.get("updated_at")
        )

    conn.commit()

    # 3. Pull newest fresh state out of DBMS
    cursor.execute("SELECT * FROM protocols WHERE id = ?", (id,))
    p = cursor.fetchone()

    rows_data, _ = build_device_rows_payload(cursor, id)
    hardware_data = build_device_hardware_payload(cursor, id)
    conn.commit()  # persist any lazy migration performed while rebuilding

    conn.close()

    response_json = {
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
        "rows": rows_data,
        "hardware": hardware_data
    }
    
    response_payload = {
        "protocol_id": id,
        "payload_json": json.dumps(response_json)
    }
    
    encrypted_resp = encrypt_payload(json.dumps(response_payload), SERVER_CODEWORD)
    return encrypted_resp, 200

# --- SYNC ENDPOINTS ---

def _build_protocol_sync_payload(cursor, p):
    """Shared helper: build the full sync payload dict for a protocol row."""
    p_id = p["id"]

    # Every device (Gerät) expands into one wire-row per Melder-Gruppe; storage is
    # unified regardless of source (TAIFUN/ETB/manual) -- see build_device_rows_payload.
    # (May lazily migrate legacy storage in place -- caller must conn.commit() afterward.)
    rows_data, sync_n_cols = build_device_rows_payload(cursor, p_id)
    hardware_data = build_device_hardware_payload(cursor, p_id)

    try:
        if sync_n_cols > 0:
            col_keys = [str(i) for i in range(1, sync_n_cols + 1)]
        else:
            col_keys = json.loads(p["columns"])
        cols = [{"key": c, "label": str(c)} for c in col_keys]
        app_vals = [{"value": v, "label": v, "is_defect": v == "Def."} for v in json.loads(p["applicable_values"])]
        det_types = json.loads(p["detector_types"])
    except Exception:
        cols, app_vals, det_types = [], [], []

    return {
        "id": p["id"],
        "name": p["name"],
        "address": p["address"],
        "contract_number": p["contract_number"],
        "interval": p["interval"],
        "system_type": p["system_type"],
        "status": p["status"],
        "updated_at": (p["updated_at"] if "updated_at" in p.keys() else 0) or 0,
        "mandant_id": (p["mandant_id"] if "mandant_id" in p.keys() else "") or "standard",
        "definition": {"columns": cols, "applicable_values": app_vals, "detector_types": det_types},
        "rows": rows_data,
        "hardware": hardware_data,
    }


@app.route("/protocols/sync/full", methods=["POST"])
def sync_full():
    """Bulk download: all protocols that have at least one group_cell."""
    success, auth_details = authenticate_request()
    if not success:
        return jsonify(auth_details), 401

    sync_version = int(datetime.now(timezone.utc).timestamp() * 1000)
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT DISTINCT p.* FROM protocols p
        WHERE EXISTS (SELECT 1 FROM group_cells gc WHERE gc.protocol_id = p.id)
    """)
    protocols = cursor.fetchall()

    result = []
    for p in protocols:
        payload = _build_protocol_sync_payload(cursor, p)
        if payload:
            result.append(payload)

    conn.commit()  # persist any lazy migration performed while reading
    conn.close()

    encrypted_resp = encrypt_payload(json.dumps({"sync_version": sync_version, "protocols": result}), SERVER_CODEWORD)
    return encrypted_resp, 200


@app.route("/protocols/sync/delta", methods=["POST"])
def sync_delta():
    """Delta download: only protocols/cells changed since the given timestamp."""
    success, auth_details = authenticate_request()
    if not success:
        return jsonify(auth_details), 401

    try:
        encrypted_body = request.data.decode("utf-8").strip()
        body_json = json.loads(decrypt_payload(encrypted_body, SERVER_CODEWORD)) if encrypted_body else {}
        since = int(body_json.get("since", 0))
    except Exception as e:
        return jsonify({"error": "DECRYPTION_FAILED", "message": str(e)}), 400

    sync_version = int(datetime.now(timezone.utc).timestamp() * 1000)
    conn = get_db_connection()
    cursor = conn.cursor()

    # Protocols where the protocol itself OR any of its cells changed since 'since'
    cursor.execute("""
        SELECT DISTINCT p.* FROM protocols p
        WHERE (
            (p.updated_at IS NOT NULL AND p.updated_at > ?) OR
            EXISTS (SELECT 1 FROM group_cells gc WHERE gc.protocol_id = p.id AND gc.updated_at > ?)
        ) AND EXISTS (SELECT 1 FROM group_cells gc2 WHERE gc2.protocol_id = p.id)
    """, (since, since))
    protocols = cursor.fetchall()

    result = []
    for p in protocols:
        p_id = p["id"]
        # Build the full unified payload (also lazily migrates legacy storage), then
        # keep only cells that actually changed since 'since', dropping empty rows.
        full_rows, _ = build_device_rows_payload(cursor, p_id)
        rows_data = []
        for row in full_rows:
            changed_cells = [c for c in row["cells"] if (c.get("updated_at") or 0) > since]
            if changed_cells:
                rows_data.append({**row, "cells": changed_cells})

        hardware_data = [
            hw for hw in build_device_hardware_payload(cursor, p_id)
            if (hw.get("updated_at") or 0) > since
        ]

        result.append({
            "id": p["id"], "name": p["name"], "address": p["address"],
            "contract_number": p["contract_number"], "interval": p["interval"],
            "system_type": p["system_type"], "status": p["status"],
            "updated_at": (p["updated_at"] if "updated_at" in p.keys() else 0) or 0,
            "mandant_id": (p["mandant_id"] if "mandant_id" in p.keys() else "") or "standard",
            "rows": rows_data,
            "hardware": hardware_data,
        })

    conn.commit()  # persist any lazy migration performed while reading
    conn.close()
    encrypted_resp = encrypt_payload(json.dumps({"sync_version": sync_version, "protocols": result}), SERVER_CODEWORD)
    return encrypted_resp, 200


@app.route("/protocols/sync/upload-cells", methods=["POST"])
def sync_upload_cells():
    """Delta upload: apply individual cell changes (last-write-wins by updated_at)."""
    success, auth_details = authenticate_request()
    if not success:
        return jsonify(auth_details), 401

    try:
        encrypted_body = request.data.decode("utf-8").strip()
        body_json = json.loads(decrypt_payload(encrypted_body, SERVER_CODEWORD))
        changes = body_json.get("changes", [])
        hardware_changes = body_json.get("hardware_changes", [])
    except Exception as e:
        return jsonify({"error": "DECRYPTION_FAILED", "message": str(e)}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    applied = 0
    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    updated_devices = set()  # (protocol_id, device_group_id) tuples

    # Each change's group_id is namespaced "{device_group_id}::{grp_num}" (see
    # build_device_rows_payload), so it routes straight back to the owning device's
    # Melder-Gruppe -- last-write-wins per cell is enforced inside apply_wire_row_to_device
    # via the same ON CONFLICT ... DO UPDATE semantics used elsewhere, keyed by updated_at.
    for change in changes:
        p_id = change.get("protocol_id")
        g_id = change.get("group_id")
        slot = change.get("slot_key")
        det_type = change.get("detector_type", "-")
        val = change.get("value", "")
        ts = int(change.get("updated_at", now))

        if "::" not in str(g_id):
            continue
        device_group_id, grp_num = str(g_id).split("::", 1)
        composite_slot = f"{grp_num}_{slot}"

        cursor.execute(
            "SELECT updated_at FROM group_cells WHERE protocol_id=? AND group_id=? AND slot_key=?",
            (p_id, device_group_id, composite_slot)
        )
        existing = cursor.fetchone()
        if existing is not None and (existing["updated_at"] or 0) > ts:
            continue  # a newer value already stored -- last-write-wins keeps it

        applied += apply_wire_row_to_device(
            cursor, p_id, g_id, [{"slot_key": slot, "detector_type": det_type, "value": val, "updated_at": ts}]
        )
        updated_devices.add((p_id, device_group_id))

    # Hardware changes are whole-device-blob, not per-cell -- own LWW check
    # inside apply_wire_hardware_to_device (compares against the stored
    # updated_at), same semantics as the per-cell loop above.
    for hw_change in hardware_changes:
        p_id = hw_change.get("protocol_id")
        device_group_id = hw_change.get("group_id")
        if not p_id or not device_group_id:
            continue
        ts = int(hw_change.get("updated_at", now))
        if apply_wire_hardware_to_device(cursor, p_id, device_group_id, hw_change.get("rows", []), ts):
            applied += 1
            updated_devices.add((p_id, device_group_id))

    formatted_date = datetime.now().strftime("%d.%m.%Y")
    cq = current_quarter()
    updated_protocols = {p_id for p_id, _ in updated_devices}
    for p_id in updated_protocols:
        cursor.execute(
            "UPDATE protocols SET status='synchronized', synchronized_quarter=?, last_edited_by=?, last_edited_at=?, updated_at=? WHERE id=?",
            (cq, auth_details["name"], formatted_date, now, p_id)
        )
    for p_id, device_group_id in updated_devices:
        record_device_edit(cursor, p_id, device_group_id, auth_details["name"])

    conn.commit()
    conn.close()

    encrypted_resp = encrypt_payload(
        json.dumps({"status": "ok", "applied": applied, "sync_version": now}), SERVER_CODEWORD
    )
    return encrypted_resp, 200


@app.route("/protocols/reset-status/<id>", methods=["POST"])
def reset_protocol_status(id):
    success, auth_details = authenticate_request()
    if not success:
        return jsonify(auth_details), 401
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE protocols SET status='ready_to_download', synchronized_quarter='' WHERE id=?",
            (id,)
        )
        conn.commit()
        conn.close()
        encrypted_resp = encrypt_payload(json.dumps({"status": "ok", "message": "Status zurückgesetzt"}), SERVER_CODEWORD)
        return encrypted_resp, 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- SHUTDOWN & HEALTH CHECKS ---

@app.route("/init", methods=["GET"])
def init_status():
    uptime_seconds = int((datetime.utcnow() - SERVER_START_TIME).total_seconds())
    uptime_str = f"{uptime_seconds // 3600}h {(uptime_seconds % 3600) // 60}m {uptime_seconds % 60}s"

    db_ok = os.path.exists(DB_PATH)
    protocol_count = 0
    technician_count = 0
    if db_ok:
        try:
            conn = get_db_connection()
            protocol_count = conn.execute("SELECT COUNT(*) FROM protocols").fetchone()[0]
            technician_count = conn.execute("SELECT COUNT(*) FROM technicians").fetchone()[0]
            conn.close()
        except Exception:
            db_ok = False

    return jsonify({
        "service": "Maintenance Pro — Netlink Gateway",
        "version": SERVER_VERSION,
        "status": "online",
        "uptime": uptime_str,
        "timestamp_utc": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "database": {
            "connected": db_ok,
            "protocols": protocol_count,
            "technicians": technician_count,
        },
        "active_live_sessions": len(active_live_sessions),
    })

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "running", "database": os.path.exists(DB_PATH)})


# ── App-Update distribution ──────────────────────────────────────────────────
# The app is sideloaded (no Play Store), so it self-updates by asking netlink
# for the latest release. Deliberately unauthenticated and outside the AES-GCM
# envelope used everywhere else -- it's just a version number and a public
# binary, not user data, and the app needs to be able to check/download this
# even with stale or not-yet-configured credentials. Always reads from the
# fixed local samba_shares mount (see docker-compose.yml), independent of the
# webui/protocol_core "Archiv-Ziel" swappable-storage setting -- app releases
# have nothing to do with where Wartungsprotokoll archives are kept, and
# keeping this path fixed avoids the two ever getting out of sync.
APP_UPDATES_PATH = os.environ.get("APP_UPDATES_PATH", "/samba_shares/AppUpdates")


@app.route("/app/update-info", methods=["GET"])
def app_update_info():
    info_path = os.path.join(APP_UPDATES_PATH, "update_info.json")
    if not os.path.exists(info_path):
        return jsonify({"available": False})
    try:
        with open(info_path, "r", encoding="utf-8") as f:
            info = json.load(f)
    except Exception as e:
        return jsonify({"available": False, "error": str(e)}), 500
    return jsonify({
        "available": True,
        "version_code": info.get("version_code", 0),
        "version_name": info.get("version_name", ""),
        "release_notes": info.get("release_notes", ""),
        "min_supported_version_code": info.get("min_supported_version_code", 0),
        "sha256": info.get("sha256", ""),
        "download_url": "/app/download",
    })


@app.route("/app/download", methods=["GET"])
def app_download():
    apk_path = os.path.join(APP_UPDATES_PATH, "latest.apk")
    if not os.path.exists(apk_path):
        return jsonify({"error": "NO_RELEASE_AVAILABLE"}), 404
    return send_file(
        apk_path,
        mimetype="application/vnd.android.package-archive",
        as_attachment=True,
        download_name="MaintenancePro-update.apk",
    )


if __name__ == "__main__":
    init_db()
    print(f"Starting Secure Netlink Service stack Gateway on port {PORT}...")
    app.run(host="0.0.0.0", port=PORT, debug=False)
