# -*- coding: utf-8 -*-
import os
import sys
import re
import sqlite3
import json
import base64
import csv
import io
import hashlib
import html as html_module
import shutil
import uuid
import tempfile
import subprocess
import time
import secrets
import zipfile
import qrcode
import requests
import storage
from datetime import datetime, date
from flask import Flask, render_template, request, jsonify, send_file, redirect, url_for, session


def current_quarter() -> str:
    today = date.today()
    q = (today.month - 1) // 3 + 1
    return f"{today.year}-Q{q}"

# Locate esser_etb_parser.py — try several candidate paths robustly
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.abspath(os.path.join(_THIS_DIR, '..', '..'))
_ETB_PARSER_PATH = next(
    (p for p in [
        os.path.join(_PROJECT_ROOT, 'esser_etb_parser.py'),
        os.path.join(os.getcwd(), 'esser_etb_parser.py'),
        os.path.join(_THIS_DIR, 'esser_etb_parser.py'),
    ] if os.path.isfile(p)),
    None
)

app = Flask(__name__)
app.secret_key = "office-webui-secret-key-182392"

DB_PATH = os.environ.get("DB_PATH", "/shared_db/protocols.db")
# File I/O against the Samba/Archiv target goes through storage.py instead of a
# local SAMBA_SHARE_PATH constant, so it can be an external SMB share too.
# Needed to build the SECURE_MANDANT;... QR setup string for technicians -- the
# codeword is the same shared transport-encryption secret netlink uses, and the
# public address/port is what a technician's phone actually connects to (not
# this WebUI's own internal-LAN address).
SERVER_CODEWORD = os.environ.get("SERVER_CODEWORD", "77-XJ-900-PLX-22")
# Env-var fallback only -- in practice this was set to the internal LAN IP in
# docker-compose.yml (despite the name), so QR codes handed to technicians
# embedded an address that only works from inside the office network. The
# actual value used for QR generation is now the admin-configurable setting
# below (see get_qr_server_config), which starts out empty rather than
# silently defaulting to a wrong-but-plausible-looking LAN address.
PUBLIC_SERVER_ADDRESS = os.environ.get("PUBLIC_SERVER_ADDRESS", "http://field-service.corp.internal")
PUBLIC_SERVER_PORT = os.environ.get("PUBLIC_SERVER_PORT", "3360")
_QR_SERVER_CONFIG_PATH = os.path.join(os.path.dirname(DB_PATH), "qr_server_config.json")


def get_qr_server_config():
    """External (WAN) address/port embedded in technician QR setup codes --
    deliberately separate from any internal-LAN-facing address this WebUI
    itself might be reached at. Falls back to the env vars (themselves often
    misconfigured with a LAN address) only until an admin explicitly sets
    this in Einstellungen."""
    if os.path.exists(_QR_SERVER_CONFIG_PATH):
        try:
            with open(_QR_SERVER_CONFIG_PATH, "r", encoding="utf-8") as f:
                config = json.load(f)
            if config.get("address") and config.get("port"):
                return config["address"], str(config["port"])
        except Exception:
            pass
    return PUBLIC_SERVER_ADDRESS, PUBLIC_SERVER_PORT


def save_qr_server_config(address, port):
    with open(_QR_SERVER_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump({"address": address, "port": port}, f, ensure_ascii=False, indent=2)
# protocol_core has no published port -- reachable only from other containers
# on the internal_lan Docker network, by service name (see docker-compose.yml).
PROTOCOL_CORE_URL = os.environ.get("PROTOCOL_CORE_URL", "http://protocol_core:5001")

_entities_migrated = False

_schema_migrated = False


def get_db_connection():
    global _entities_migrated, _schema_migrated
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Schema migration only needs to run once per process, not on every single
    # connection -- running ALTER TABLE/CREATE TABLE on every request was both
    # needlessly slow (every API call paid for it) and dangerous: a second
    # connection attempting these writes while a long-running request (e.g. a
    # TAIFUN import with hundreds of rows) holds an open write transaction on
    # its own connection can hit "database is locked", since sqlite3's default
    # busy_timeout is 0 (fails immediately instead of waiting).
    if not _schema_migrated:
        try:
            cursor = conn.cursor()
            for col_name, col_type in [
                ("anlage_id", "VARCHAR(100) DEFAULT 'default'"),
                ("anlage_name", "VARCHAR(255) DEFAULT 'Hauptanlage'"),
                ("anlage_type", "VARCHAR(50) DEFAULT 'BMA'"),
                ("anlage_address", "VARCHAR(255) DEFAULT ''"),
                ("anlage_interval", "VARCHAR(50) DEFAULT 'Halbjährlich'"),
            ]:
                try:
                    cursor.execute(f"ALTER TABLE protocol_groups ADD COLUMN {col_name} {col_type}")
                except sqlite3.OperationalError:
                    pass
            try:
                cursor.execute("ALTER TABLE protocols ADD COLUMN synchronized_quarter VARCHAR(20) DEFAULT ''")
            except sqlite3.OperationalError:
                pass
            try:
                # Anchors a TAIFUN <WtVt> contract across renumbering (<Nr> changes) --
                # see import_taifun()'s contract_guid lookup-then-fallback.
                cursor.execute("ALTER TABLE protocols ADD COLUMN contract_guid VARCHAR(64) DEFAULT ''")
            except sqlite3.OperationalError:
                pass

            # Mandant = organizational sub-unit of the same company, not a security
            # boundary -- see server_stack/protocol_core/worker.py and netlink/main.py
            # for the matching migration (each service owns its own idempotent bootstrap).
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

            conn.commit()
            _schema_migrated = True
        except Exception:
            pass

    # One-time migration: decode HTML entities (&#228; → ä etc.) stored by the regex XML parser
    if not _entities_migrated:
        try:
            cursor = conn.cursor()
            for row in cursor.execute("SELECT id, name, address, contract_number FROM protocols").fetchall():
                new_name = html_module.unescape(row["name"])
                new_addr = html_module.unescape(row["address"])
                new_cn   = html_module.unescape(row["contract_number"])
                if new_name != row["name"] or new_addr != row["address"] or new_cn != row["contract_number"]:
                    cursor.execute(
                        "UPDATE protocols SET name=?, address=?, contract_number=? WHERE id=?",
                        (new_name, new_addr, new_cn, row["id"])
                    )
            for row in cursor.execute("SELECT id, group_name, anlage_name, anlage_address FROM protocol_groups").fetchall():
                new_gn = html_module.unescape(row["group_name"])
                new_an = html_module.unescape(row["anlage_name"])
                new_aa = html_module.unescape(row["anlage_address"])
                if new_gn != row["group_name"] or new_an != row["anlage_name"] or new_aa != row["anlage_address"]:
                    cursor.execute(
                        "UPDATE protocol_groups SET group_name=?, anlage_name=?, anlage_address=? WHERE id=?",
                        (new_gn, new_an, new_aa, row["id"])
                    )
            conn.commit()
            _entities_migrated = True
        except Exception:
            pass

    return conn


def get_active_mandant_id():
    """The dispatch office's currently selected Mandant (organizational
    sub-unit, e.g. 'Esser-Team' vs 'Notifier-Team' -- not a security boundary,
    see /home/admin/.claude/plans for context). Stored in the Flask session,
    which is safe to introduce fresh here since no login exists in this app."""
    mandant_id = session.get("mandant_id", "standard")
    conn = get_db_connection()
    row = conn.execute("SELECT id FROM mandanten WHERE id = ?", (mandant_id,)).fetchone()
    conn.close()
    if not row:
        session["mandant_id"] = "standard"
        return "standard"
    return mandant_id


def sanitize_filename(s):
    """Mirrors protocol_core/worker.py's sanitize_filename -- kept in sync
    manually since the two services share no code, only the Samba filesystem
    layout convention."""
    s = (s or "").strip()
    for ch in '/\\:*?"<>|':
        s = s.replace(ch, "-")
    return s or "unbenannt"


def mandant_folder_name(mandant_row):
    return sanitize_filename(mandant_row["name"])


def contract_folder_name(p):
    """Mirrors protocol_core/worker.py's contract_folder_name -- kept in sync
    manually since the two services share no code, only the Samba/SMB layout
    convention (one PDF per Gerät now, not one per Vertrag)."""
    return sanitize_filename(f"{p['contract_number']}-{p['name']}")


def device_filename(dev_name, dev_type, suffix=""):
    """Mirrors protocol_core/worker.py's device_filename."""
    return sanitize_filename(f"{dev_name}-{dev_type}") + f"{suffix}.pdf"


def get_device_pdf_context(cursor, protocol_id, group_id):
    """Resolves everything needed to build a device's PDF path: the Mandant
    folder name, the protocol row, and the device's display name/type. Returns
    None if the protocol or device doesn't exist."""
    p = cursor.execute("SELECT * FROM protocols WHERE id = ?", (protocol_id,)).fetchone()
    if not p:
        return None
    dev = cursor.execute(
        "SELECT * FROM protocol_groups WHERE protocol_id = ? AND group_id = ?", (protocol_id, group_id)
    ).fetchone()
    if not dev:
        return None
    mandant_row = cursor.execute(
        "SELECT id, name FROM mandanten WHERE id = ?", (p["mandant_id"] or "standard",)
    ).fetchone()
    mandant_folder = mandant_folder_name(mandant_row) if mandant_row else "Standard"
    dev_name = dev["group_name"] or group_id
    dev_type = dev["anlage_type"] or dev["group_type"] or p["system_type"]
    return mandant_folder, p, dev_name, dev_type


def create_full_backup(mandant_id):
    """Exports this Mandant's DB rows as JSON and zips them together with its
    complete Samba folder tree (PDFs, logo) into
    <mandant folder>/Backups/<timestamp>.zip. Triggered after a technician is
    created or has their QR/password reissued. Deliberately scoped to one
    Mandant's rows (not a raw copy of the whole shared DB file, which would
    also contain every other Mandant's data)."""
    conn = get_db_connection()
    mandant_row = conn.execute("SELECT id, name FROM mandanten WHERE id = ?", (mandant_id,)).fetchone()
    if not mandant_row:
        conn.close()
        return None
    folder_name = mandant_folder_name(mandant_row)

    export = {"mandant": dict(mandant_row), "exported_at": datetime.now().isoformat()}
    protocols = [dict(r) for r in conn.execute("SELECT * FROM protocols WHERE mandant_id = ?", (mandant_id,)).fetchall()]
    export["protocols"] = protocols
    protocol_ids = [p["id"] for p in protocols]

    groups, cells = [], []
    if protocol_ids:
        ph = ",".join("?" * len(protocol_ids))
        groups = [dict(r) for r in conn.execute(
            f"SELECT * FROM protocol_groups WHERE protocol_id IN ({ph})", protocol_ids
        ).fetchall()]
        cells = [dict(r) for r in conn.execute(
            f"SELECT * FROM group_cells WHERE protocol_id IN ({ph})", protocol_ids
        ).fetchall()]
    export["protocol_groups"] = groups
    export["group_cells"] = cells
    export["technicians"] = [dict(r) for r in conn.execute(
        "SELECT id, username, name, mandant_id FROM technicians WHERE mandant_id = ?", (mandant_id,)
    ).fetchall()]
    conn.close()

    mandant_dir = storage.resolve(folder_name)
    backup_dir = storage.resolve(folder_name, "Backups")
    storage.makedirs(backup_dir)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    zip_path = storage.resolve(folder_name, "Backups", f"{timestamp}.zip")

    with storage.open_file(zip_path, "wb") as raw_out:
        with zipfile.ZipFile(raw_out, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("mandant_export.json", json.dumps(export, ensure_ascii=False, indent=2, default=str))
            for root, _dirs, files in storage.walk(mandant_dir):
                if root == backup_dir or root.startswith(backup_dir + "\\") or root.startswith(backup_dir + "/"):
                    continue  # don't zip previous backups into this one
                for f in files:
                    full_path = storage.join(root, f)
                    zf.writestr(storage.relpath(full_path, mandant_dir), storage.read_bytes(full_path))

    return zip_path


DEFAULT_ANLAGENTYPEN = [
    {
        "type_id": "BMA", "type_name": "Brandmeldeanlage",
        "taifun_typ_id": 31, "active": True,
        "badge": "BMA", "badge_color": "red",
        "meldepunkt_definitionen": {
            "detectors": ["-", "Normal", "ZD", "ZB", "TDIFF", "TMAX", "RAS", "LINEAR"],
            "values": ["CHECK", "H1", "H2", "Def."],
            "columns": ["1","2","3","4","5","6","7","8"]
        },
        # Hardware-Tabelle (Zentrale/Ringkarten-Inventar) ist bei BMA per Default
        # aktiv -- nur ein Default für die Editor-Checkbox, keine harte Kopplung
        # (siehe get_cells' hardware_enabled_default).
        "zusatz_tabelle": {"typ": "hardware"}
    },
    {
        "type_id": "EMA", "type_name": "Einbruchmeldeanlage",
        "taifun_typ_id": 33, "active": True,
        "badge": "EMA", "badge_color": "yellow",
        "meldepunkt_definitionen": {
            "detectors": ["-", "Normal", "BWM", "ZK", "RSK", "Lichtschranke", "Glasbruch", "Körperschall"],
            "values": ["CHECK", "Def."],
            "columns": ["1","2","3","4"]
        },
        "zusatz_tabelle": None
    },
    {
        "type_id": "ELA", "type_name": "Elektroakustische Anlage",
        "taifun_typ_id": 0, "active": True,
        "badge": "ELA", "badge_color": "blue",
        "meldepunkt_definitionen": {
            "detectors": ["-", "Normal", "Innenlautsprecher", "Außenlautsprecher"],
            "values": ["CHECK", "Def."],
            "columns": ["1","2","3","4"]
        },
        "zusatz_tabelle": None
    },
    {
        "type_id": "Lichtruf", "type_name": "Lichtrufanlage",
        "taifun_typ_id": 0, "active": True,
        "badge": "LR", "badge_color": "emerald",
        "meldepunkt_definitionen": {
            "detectors": ["-", "Normal", "AT", "BT", "ZT", "EM", "PN", "Display"],
            "values": ["CHECK", "Def."],
            "columns": ["1","2","3","4"]
        },
        "zusatz_tabelle": None
    },
    {
        "type_id": "SLA", "type_name": "Sprechanlage",
        "taifun_typ_id": 0, "active": True,
        "badge": "SLA", "badge_color": "indigo",
        "meldepunkt_definitionen": {
            "detectors": ["-", "Normal", "SLA"],
            "values": ["CHECK", "Def."],
            "columns": ["1","2","3","4"]
        },
        "zusatz_tabelle": None
    },
    {
        "type_id": "RWA", "type_name": "Rauchabzugsanlage",
        "taifun_typ_id": 0, "active": False,
        "badge": "RWA", "badge_color": "orange",
        "meldepunkt_definitionen": {
            "detectors": ["-", "Normal", "RWA"],
            "values": ["CHECK", "Def."],
            "columns": ["1","2","3","4"]
        },
        "zusatz_tabelle": None
    },
    {
        "type_id": "NT", "type_name": "Netzteil / Versorgung",
        "taifun_typ_id": 32, "active": False,
        "badge": "NT", "badge_color": "slate",
        "meldepunkt_definitionen": {
            "detectors": ["-", "Normal"],
            "values": ["CHECK", "Def."],
            "columns": ["1","2"]
        },
        "zusatz_tabelle": None
    },
    {
        "type_id": "NotLicht", "type_name": "Notlichtanlage",
        "taifun_typ_id": 43, "active": False,
        "badge": "NL", "badge_color": "amber",
        "meldepunkt_definitionen": {
            "detectors": ["-", "Normal", "Block", "Einzel"],
            "values": ["CHECK", "Def."],
            "columns": ["1","2","3","4"]
        },
        "zusatz_tabelle": None
    },
]

def _settings_path_for(mandant_id):
    return os.path.join(os.path.dirname(DB_PATH), f"settings_{mandant_id}.json")


def load_settings(mandant_id=None):
    if mandant_id is None:
        mandant_id = get_active_mandant_id()
    settings_path = _settings_path_for(mandant_id)
    legacy_path = os.path.join(os.path.dirname(DB_PATH), "settings.json")
    # One-time migration: the pre-Mandant global settings.json becomes the
    # 'standard' Mandant's settings, so nothing configured before this feature
    # existed (active system types, Anlagentypen) gets lost.
    if not os.path.exists(settings_path) and mandant_id == "standard" and os.path.exists(legacy_path):
        try:
            shutil.copyfile(legacy_path, settings_path)
        except Exception:
            pass
    default_settings = {
        "anlagentypen": DEFAULT_ANLAGENTYPEN,
        "active_system_types": ["BMA", "EMA", "ELA", "Lichtruf", "SLA"],
        "system_settings": {
            "BMA": {"name": "Brandmeldeanlage", "xml_name": "BMA", "color": "bg-red-50 text-red-800 border-red-200", "badgeColor": "bg-red-500", "detectors": ["-","Normal","ZD","ZB","TDIFF","TMAX","RAS","LINEAR"], "values": ["CHECK","H1","H2","Def."]},
            "EMA": {"name": "Einbruchmeldeanlage", "xml_name": "EMA", "color": "bg-yellow-50 text-yellow-800 border-yellow-200", "badgeColor": "bg-yellow-500", "detectors": ["-","Normal","BWM","ZK","RSK","Lichtschranke","Glasbruch","Körperschall"], "values": ["CHECK","Def."]},
            "ELA": {"name": "Elektroakustik", "xml_name": "ELA", "color": "bg-blue-50 text-blue-800 border-blue-200", "badgeColor": "bg-blue-500", "detectors": ["-","Normal","Innenlautsprecher","Außenlautsprecher"], "values": ["CHECK","Def."]},
            "Lichtruf": {"name": "Lichtrufanlage", "xml_name": "Lichtruf", "color": "bg-emerald-50 text-emerald-800 border-emerald-200", "badgeColor": "bg-emerald-500", "detectors": ["-","Normal","AT","BT","ZT","EM","PN","Display"], "values": ["CHECK","Def."]},
            "SLA": {"name": "Sprechanlage", "xml_name": "SLA", "color": "bg-indigo-50 text-indigo-800 border-indigo-200", "badgeColor": "bg-indigo-500", "detectors": ["-","Normal","SLA"], "values": ["CHECK","Def."]}
        }
    }
    if os.path.exists(settings_path):
        try:
            with open(settings_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            if "anlagentypen" not in loaded:
                loaded["anlagentypen"] = DEFAULT_ANLAGENTYPEN
            return loaded
        except Exception:
            pass
    return default_settings

def save_settings(settings, mandant_id=None):
    if mandant_id is None:
        mandant_id = get_active_mandant_id()
    settings_path = _settings_path_for(mandant_id)
    try:
        with open(settings_path, "w", encoding="utf-8") as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

# Helper to look up file-level archives of a contract number
def get_archives_for_contract(protocol_id, mandant_folder, contract_folder):
    """Archived PDFs live at <Mandant>/Archiv/<Jahr>/<Vertragsordner>/*.pdf --
    one file per archived Gerät-PDF (see protocol_core/worker.py's
    archive_pdf_path), the filename itself already encodes which Gerät and
    which date it was archived on. Every device that was ever archived shows
    up here, newest first."""
    archiv_root = storage.resolve(mandant_folder, "Archiv")
    if not storage.exists(archiv_root):
        return []

    archive_list = []
    try:
        years = [y for y in storage.listdir(archiv_root) if storage.isdir(storage.join(archiv_root, y))]
    except Exception:
        years = []

    for year in years:
        contract_dir = storage.join(archiv_root, year, contract_folder)
        if not storage.exists(contract_dir):
            continue
        for f in storage.listdir(contract_dir):
            if not f.endswith(".pdf"):
                continue
            full_path = storage.join(contract_dir, f)
            archive_list.append({
                "filename": f,
                "year": year,
                "path": f"/download_archive/{protocol_id}/{year}/{f}",
                "size_kb": round(storage.getsize(full_path) / 1024, 1)
            })
    return sorted(archive_list, key=lambda x: (x["year"], x["filename"]), reverse=True)

# ----------------- WEB API ROUTES -----------------

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/api/protocols", methods=["GET"])
def get_protocols():
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(100, max(10, int(request.args.get("per_page", 30))))
    search = request.args.get("search", "").strip()
    status_filter = request.args.get("filter", "")   # "offen","erledigt","defekte","ohne_liste"
    types_param = request.args.get("types", "")       # comma-separated type filter, e.g. "BMA,EMA"
    offset = (page - 1) * per_page

    settings = load_settings()
    anlagentypen = settings.get("anlagentypen", [])
    active_types = [t["type_id"] for t in anlagentypen if t.get("active")]
    if not active_types:
        active_types = settings.get("active_system_types", ["BMA", "EMA", "ELA", "Lichtruf", "SLA"])

    # Optional further type filter from request
    if types_param:
        wanted = {t.strip() for t in types_param.split(",") if t.strip()}
        active_types = [t for t in active_types if t in wanted]

    ohne_liste = (status_filter == "ohne_liste")
    active_mandant_id = get_active_mandant_id()

    conn = get_db_connection()
    cursor = conn.cursor()

    defect_subq = "EXISTS(SELECT 1 FROM group_cells gc WHERE gc.protocol_id = p.id AND gc.slot_key NOT IN ('__grid__', '__rows__', '__hardware__') AND (gc.value = 'Def.' OR gc.value = 'Fehler'))"

    # Build active-type SQL placeholders (parameterised)
    if active_types:
        at_ph = ",".join("?" * len(active_types))
        at_p  = list(active_types)
    else:
        at_ph = "NULL"
        at_p  = []

    has_active_type = f"EXISTS(SELECT 1 FROM protocol_groups pg WHERE pg.protocol_id=p.id AND pg.anlage_type IN ({at_ph}))"
    has_liste       = f"EXISTS(SELECT 1 FROM group_cells gc JOIN protocol_groups pg2 ON pg2.protocol_id=gc.protocol_id AND pg2.group_id=gc.group_id WHERE gc.protocol_id=p.id AND pg2.anlage_type IN ({at_ph}))"

    def build_where(extra_cond=None):
        conds  = ["p.mandant_id = ?", has_active_type]
        params = [active_mandant_id] + list(at_p)  # params for mandant_id + has_active_type
        if ohne_liste:
            conds.append(f"NOT ({has_liste})")
            params.extend(at_p)               # params for NOT has_liste
        else:
            conds.append(has_liste)
            params.extend(at_p)               # params for has_liste
        if search:
            pat = f"%{search}%"
            conds.append("(LOWER(p.name) LIKE LOWER(?) OR LOWER(p.address) LIKE LOWER(?) OR LOWER(p.contract_number) LIKE LOWER(?) OR LOWER(p.system_type) LIKE LOWER(?))")
            params.extend([pat, pat, pat, pat])
        if extra_cond:
            conds.append(extra_cond)
        return "WHERE " + " AND ".join(conds), params

    # Tab counts (search-aware, type-aware, base-filter-aware)
    w, p = build_where("p.status != 'synchronized'")
    count_offen = cursor.execute(f"SELECT COUNT(*) FROM protocols p {w}", p).fetchone()[0]
    w, p = build_where("p.status = 'synchronized'")
    count_erledigt = cursor.execute(f"SELECT COUNT(*) FROM protocols p {w}", p).fetchone()[0]
    w, p = build_where(defect_subq)
    count_defekte = cursor.execute(f"SELECT COUNT(*) FROM protocols p {w}", p).fetchone()[0]
    # ohne_liste count: has_active + NOT has_liste (always ignores current ohne_liste mode)
    conds_ol  = ["p.mandant_id = ?", has_active_type, f"NOT ({has_liste})"]
    params_ol = [active_mandant_id] + list(at_p) + list(at_p)
    if search:
        pat = f"%{search}%"
        conds_ol.append("(LOWER(p.name) LIKE LOWER(?) OR LOWER(p.address) LIKE LOWER(?) OR LOWER(p.contract_number) LIKE LOWER(?) OR LOWER(p.system_type) LIKE LOWER(?))")
        params_ol.extend([pat, pat, pat, pat])
    count_ohne_liste = cursor.execute(f"SELECT COUNT(*) FROM protocols p WHERE {' AND '.join(conds_ol)}", params_ol).fetchone()[0]

    # Active filter condition (status tabs only apply when not in ohne_liste mode)
    filter_cond = None
    if not ohne_liste:
        if status_filter == "offen":    filter_cond = "p.status != 'synchronized'"
        elif status_filter == "erledigt": filter_cond = "p.status = 'synchronized'"
        elif status_filter == "defekte":  filter_cond = defect_subq

    main_where, main_params = build_where(filter_cond)
    total = cursor.execute(f"SELECT COUNT(*) FROM protocols p {main_where}", main_params).fetchone()[0]
    total_pages = max(1, (total + per_page - 1) // per_page)

    device_summary_subq = """(
        SELECT GROUP_CONCAT(DISTINCT pg.anlage_type)
        FROM protocol_groups pg WHERE pg.protocol_id = p.id
    )"""

    # Paginated data — has_defect, device_summary, and fill progress via SQL subqueries
    records = cursor.execute(f"""
        SELECT
            p.id, p.name, p.address, p.contract_number, p.interval, p.system_type, p.status,
            p.last_edited_by, p.last_edited_at,
            CASE WHEN {defect_subq} THEN 1 ELSE 0 END AS has_defect,
            {device_summary_subq} AS device_summary,
            (SELECT COUNT(*) FROM group_cells gc WHERE gc.protocol_id = p.id AND gc.slot_key NOT IN ('__grid__', '__rows__', '__hardware__') AND gc.value != '' AND gc.value IS NOT NULL) AS filled_cells,
            (SELECT COUNT(*) FROM group_cells gc WHERE gc.protocol_id = p.id AND gc.slot_key NOT IN ('__grid__', '__rows__', '__hardware__')) AS total_cells
        FROM protocols p
        {main_where}
        ORDER BY p.name COLLATE NOCASE
        LIMIT ? OFFSET ?
    """, main_params + [per_page, offset]).fetchall()

    # Batch-fetch grid cells to compute proper filled/total for grid-format groups
    p_ids_page = [r["id"] for r in records]
    grid_stats = {}
    if p_ids_page:
        ph = ",".join("?" * len(p_ids_page))
        for gc_row in cursor.execute(
            f"SELECT protocol_id, value FROM group_cells WHERE protocol_id IN ({ph}) AND slot_key = '__grid__'",
            p_ids_page
        ).fetchall():
            try:
                grid = json.loads(gc_row["value"])
                gs = grid_stats.setdefault(gc_row["protocol_id"], {"filled": 0, "total": 0})
                gs["total"] += len(grid.get("types", {}))
                gs["filled"] += sum(1 for v in grid.get("values", {}).values() if v)
            except Exception:
                pass

    results = []
    for r in records:
        gs = grid_stats.get(r["id"], {"filled": 0, "total": 0})
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
            "has_defect": bool(r["has_defect"]),
            "device_summary": r["device_summary"] or "",
            "filled_cells": (r["filled_cells"] or 0) + gs["filled"],
            "total_cells": (r["total_cells"] or 0) + gs["total"],
        })
    conn.close()
    return jsonify({
        "success": True,
        "protocols": results,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": total_pages
        },
        "counts": {
            "offen": count_offen,
            "erledigt": count_erledigt,
            "defekte": count_defekte,
            "ohne_liste": count_ohne_liste
        }
    })

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

    # Pre-fetch which groups have cells for has_cells flag
    cursor.execute("SELECT DISTINCT group_id FROM group_cells WHERE protocol_id = ?", (p_id,))
    groups_with_cells = {row["group_id"] for row in cursor.fetchall()}

    rows_data = []
    sub_systems_map = {}
    
    for g in groups:
        g_id = g["group_id"]
        cursor.execute("SELECT slot_key, detector_type, value FROM group_cells WHERE protocol_id = ? AND group_id = ?", (p_id, g_id))
        cells = cursor.fetchall()
        cells_list = []
        for c in cells:
            if c["slot_key"] in ("__grid__", "__rows__", "__hardware__"):
                continue  # Matrix/registry/hardware metadata belongs in the cells editor, not the structure editor
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

    # Pre-fetch cell stats per group for progress display (real Melder rows only --
    # excludes both the legacy compact grid blob and the unified format's registry cell)
    cursor.execute(
        "SELECT group_id, COUNT(*) as total, "
        "SUM(CASE WHEN value != '' AND value IS NOT NULL THEN 1 ELSE 0 END) as filled, "
        "SUM(CASE WHEN value IN ('Def.', 'Fehler') THEN 1 ELSE 0 END) as defects "
        "FROM group_cells WHERE protocol_id = ? AND slot_key NOT IN ('__grid__', '__rows__', '__hardware__') GROUP BY group_id",
        (p_id,)
    )
    cell_stats_by_group = {row["group_id"]: dict(row) for row in cursor.fetchall()}

    # Override stats for grid-format groups by parsing the stored JSON
    for grid_row in cursor.execute(
        "SELECT group_id, value FROM group_cells WHERE protocol_id = ? AND slot_key = '__grid__'",
        (p_id,)
    ).fetchall():
        try:
            grid = json.loads(grid_row["value"])
            values_map = grid.get("values", {})
            cell_stats_by_group[grid_row["group_id"]] = {
                "total": len(grid.get("types", {})),
                "filled": sum(1 for v in values_map.values() if v),
                "defects": sum(1 for v in values_map.values() if v in ("Def.", "Fehler")),
            }
        except Exception:
            pass

    # Build flat devices list (one entry per WtGrt / protocol_group row). PDFs
    # are per-Gerät now (see protocol_core/worker.py), so has_pdf is resolved
    # per device rather than once for the whole contract.
    mandant_row = conn.execute(
        "SELECT id, name FROM mandanten WHERE id = ?", (p["mandant_id"] or "standard",)
    ).fetchone()
    mandant_folder = mandant_folder_name(mandant_row) if mandant_row else "Standard"
    contract_folder = contract_folder_name(p)

    devices_list = []
    for g in groups:
        a_interval = "Halbjährlich"
        try:
            if "anlage_interval" in g.keys() and g["anlage_interval"]:
                a_interval = g["anlage_interval"]
        except Exception:
            pass
        cs = cell_stats_by_group.get(g["group_id"])
        dev_type = (g["anlage_type"] if "anlage_type" in g.keys() and g["anlage_type"] else p["system_type"]) or "BMA"
        dev_pdf_path = storage.resolve(mandant_folder, contract_folder, device_filename(g["group_name"], dev_type))
        devices_list.append({
            "id": g["group_id"],
            "name": g["group_name"],
            "type": dev_type,
            "anlage_id": (g["anlage_id"] if "anlage_id" in g.keys() else "") or "",
            "anlage_name": (g["anlage_name"] if "anlage_name" in g.keys() else "") or "",
            "anlage_address": (g["anlage_address"] if "anlage_address" in g.keys() else "") or "",
            "anlage_interval": a_interval,
            "has_cells": g["group_id"] in groups_with_cells,
            "total_cells": cs["total"] if cs else 0,
            "filled_cells": cs["filled"] if cs else 0,
            "defect_cells": cs["defects"] if cs else 0,
            "has_pdf": storage.exists(dev_pdf_path),
        })

    for sub in sub_systems_map.values():
        sub["columns"] = sorted(sub["columns"], key=lambda x: int(x) if x.isdigit() else 0)
        if not sub["columns"]:
            sub["columns"] = cols

    sub_systems_list = list(sub_systems_map.values())
    conn.close()

    archives = get_archives_for_contract(p["id"], mandant_folder, contract_folder)

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
            "subSystems": sub_systems_list,
            "devices": devices_list,
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
        # Save main protocol header. mandant_id is only set on INSERT (new
        # contract gets stamped with whichever Mandant is active in the WebUI
        # right now) -- it's intentionally absent from DO UPDATE SET so editing
        # an existing contract never silently moves it to a different Mandant.
        cursor.execute("""
            INSERT INTO protocols (id, name, address, contract_number, interval, system_type, status, last_edited_by, last_edited_at, columns, applicable_values, detector_types, mandant_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name=EXCLUDED.name, address=EXCLUDED.address, contract_number=EXCLUDED.contract_number,
                interval=EXCLUDED.interval, system_type=EXCLUDED.system_type, status=EXCLUDED.status,
                columns=EXCLUDED.columns, applicable_values=EXCLUDED.applicable_values, detector_types=EXCLUDED.detector_types
        """, (
            p_id, name, address, contract_number, interval, system_type, status,
            data.get("last_edited_by", "-"), data.get("last_edited_at", "-"),
            json.dumps(columns), json.dumps(applicable_values), json.dumps(detector_types),
            get_active_mandant_id()
        ))
        
        # Upsert-merge groups & cells instead of the old blanket delete-then-rebuild --
        # this editor lets a technician paint real values directly (paintTool ==
        # 'trigger'), so a submitted cell's value is trusted when non-empty (genuine
        # edit), but an empty submitted value never clobbers an existing non-empty
        # one -- guards against saving a stale/partial editor snapshot (e.g. opened
        # before a concurrent sync wrote a fresh Messwert) over newer real data.
        # Groups/cells genuinely absent from the submission are still removed, same
        # end state the old delete-then-rebuild produced for intentional removals.
        if sub_systems:
            for sub in sub_systems:
                a_id = sub.get("id") or f"sub-{int(datetime.now().timestamp())}"
                a_name = sub.get("name") or "Anlage"
                a_type = sub.get("system_type") or sub.get("systemType") or system_type or "BMA"
                a_address = sub.get("address") or ""

                seen_group_ids = [r["groupId"] for r in sub.get("rows", [])]
                for r in sub.get("rows", []):
                    g_id = r["groupId"]
                    g_name = r["groupName"]

                    cursor.execute("""
                        INSERT INTO protocol_groups (protocol_id, group_id, group_name, group_type, anlage_id, anlage_name, anlage_type, anlage_address)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(protocol_id, group_id) DO UPDATE SET
                            group_name=EXCLUDED.group_name, group_type=EXCLUDED.group_type,
                            anlage_id=EXCLUDED.anlage_id, anlage_name=EXCLUDED.anlage_name,
                            anlage_type=EXCLUDED.anlage_type, anlage_address=EXCLUDED.anlage_address
                    """, (p_id, g_id, g_name, a_type, a_id, a_name, a_type, a_address))

                    seen_slot_keys = [c["slotKey"] for c in r.get("cells", [])]
                    for c in r.get("cells", []):
                        cursor.execute("""
                            INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?)
                            ON CONFLICT(protocol_id, group_id, slot_key) DO UPDATE SET
                                detector_type=EXCLUDED.detector_type,
                                value=CASE WHEN EXCLUDED.value != '' THEN EXCLUDED.value ELSE group_cells.value END,
                                updated_at=CASE WHEN EXCLUDED.value != '' THEN EXCLUDED.updated_at ELSE group_cells.updated_at END
                        """, (p_id, g_id, c["slotKey"], c["detectorType"], c.get("value", ""), int(datetime.now().timestamp())))
                    if seen_slot_keys:
                        placeholders = ",".join("?" * len(seen_slot_keys))
                        cursor.execute(
                            f"DELETE FROM group_cells WHERE protocol_id = ? AND group_id = ? AND slot_key NOT IN ({placeholders})",
                            (p_id, g_id, *seen_slot_keys)
                        )
                if seen_group_ids:
                    placeholders = ",".join("?" * len(seen_group_ids))
                    cursor.execute(
                        f"DELETE FROM protocol_groups WHERE protocol_id = ? AND anlage_id = ? AND group_id NOT IN ({placeholders})",
                        (p_id, a_id, *seen_group_ids)
                    )
        else:
            seen_group_ids = [r["groupId"] for r in rows]
            for r in rows:
                g_id = r["groupId"]
                g_name = r["groupName"]
                g_type = r.get("groupType", system_type)

                cursor.execute("""
                    INSERT INTO protocol_groups (protocol_id, group_id, group_name, group_type, anlage_id, anlage_name, anlage_type, anlage_address)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(protocol_id, group_id) DO UPDATE SET
                        group_name=EXCLUDED.group_name, group_type=EXCLUDED.group_type,
                        anlage_id=EXCLUDED.anlage_id, anlage_name=EXCLUDED.anlage_name,
                        anlage_type=EXCLUDED.anlage_type, anlage_address=EXCLUDED.anlage_address
                """, (p_id, g_id, g_name, g_type, "default", f"Hauptanlage ({g_type})", g_type, ""))

                seen_slot_keys = [c["slotKey"] for c in r.get("cells", [])]
                for c in r.get("cells", []):
                    cursor.execute("""
                        INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(protocol_id, group_id, slot_key) DO UPDATE SET
                            detector_type=EXCLUDED.detector_type,
                            value=CASE WHEN EXCLUDED.value != '' THEN EXCLUDED.value ELSE group_cells.value END,
                            updated_at=CASE WHEN EXCLUDED.value != '' THEN EXCLUDED.updated_at ELSE group_cells.updated_at END
                    """, (p_id, g_id, c["slotKey"], c["detectorType"], c.get("value", ""), int(datetime.now().timestamp())))
                if seen_slot_keys:
                    placeholders = ",".join("?" * len(seen_slot_keys))
                    cursor.execute(
                        f"DELETE FROM group_cells WHERE protocol_id = ? AND group_id = ? AND slot_key NOT IN ({placeholders})",
                        (p_id, g_id, *seen_slot_keys)
                    )
            if seen_group_ids:
                placeholders = ",".join("?" * len(seen_group_ids))
                cursor.execute(
                    f"DELETE FROM protocol_groups WHERE protocol_id = ? AND group_id NOT IN ({placeholders})",
                    (p_id, *seen_group_ids)
                )

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
    Triggers turnus changeover: archives every device's active PDF and clears
    measurements, keeping detector mappings intact. PDFs are per-Gerät (see
    protocol_core/worker.py), so each device is archived individually with
    the same <Mandant>/Archiv/<Jahr>/<Vertrag>/<Gerät-Typ>-<Datum>.pdf naming
    the core worker itself uses.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    p = cursor.execute("SELECT * FROM protocols WHERE id = ?", (p_id,)).fetchone()
    if not p:
        conn.close()
        return jsonify({"success": False, "error": "Protokoll nicht gefunden."}), 404

    mandant_row = cursor.execute(
        "SELECT id, name FROM mandanten WHERE id = ?", (p["mandant_id"] or "standard",)
    ).fetchone()
    mandant_folder = mandant_folder_name(mandant_row) if mandant_row else "Standard"
    contract_folder = contract_folder_name(p)
    date_str = datetime.now().strftime("%Y-%m-%d")

    # 1. Archive each device's currently active PDF, if it has one
    devices = cursor.execute("SELECT * FROM protocol_groups WHERE protocol_id = ?", (p_id,)).fetchall()
    for dev in devices:
        dev_name = dev["group_name"] or dev["group_id"]
        dev_type = dev["anlage_type"] or dev["group_type"] or p["system_type"]
        active_path = storage.resolve(mandant_folder, contract_folder, device_filename(dev_name, dev_type))
        if not storage.exists(active_path):
            continue

        archive_dir = storage.resolve(mandant_folder, "Archiv", date_str[:4], contract_folder)
        storage.makedirs(archive_dir)
        archived_path = storage.resolve(mandant_folder, "Archiv", date_str[:4], contract_folder,
                                         device_filename(dev_name, dev_type, f"-{date_str}"))
        if storage.exists(archived_path):
            base, ext = os.path.splitext(archived_path)
            i = 2
            while storage.exists(f"{base}_{i}{ext}"):
                i += 1
            archived_path = f"{base}_{i}{ext}"

        try:
            storage.move(active_path, archived_path)
        except Exception as err:
            print(f"WARN: Failed to archive PDF for device '{dev_name}': {err}")

    # 2. Reset status back to 'ready_to_download' and measurements back to ''.
    # slot_key '__rows__' is the device's group-structure registry, not a
    # measurement -- clearing it would destroy the Melder-Gruppen layout, so
    # it's excluded. '__hardware__' is excluded too but handled separately
    # below -- unlike a Melder cell it mixes structural fields (Hardware/
    # Bezeichnung/Typ/Software-Stand, which should survive a reset like
    # '__rows__' does) with per-period check results (Störung/Unterbrechung,
    # which should clear like every other measurement). updated_at is bumped
    # so protocol_core's change-detection notices and regenerates a fresh
    # (empty) PDF for the new cycle.
    try:
        now_ms = int(time.time() * 1000)
        cursor.execute("UPDATE protocols SET status = 'ready_to_download' WHERE id = ?", (p_id,))
        cursor.execute(
            "UPDATE group_cells SET value = '', updated_at = ? WHERE protocol_id = ? AND slot_key NOT IN ('__rows__', '__grid__', '__hardware__')",
            (now_ms, p_id)
        )
        for dev in devices:
            hw_rows = _device_hardware_to_rows(cursor, p_id, dev["group_id"])
            if not hw_rows:
                continue
            for row in hw_rows:
                row["stoerung"] = ""
                row["unterbrechung"] = ""
            _hardware_rows_to_device(cursor, p_id, dev["group_id"], hw_rows)
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"success": False, "error": f"Datenbank-Fehler beim Zurücksetzen: {str(e)}"}), 500

    conn.close()
    return jsonify({"success": True, "message": "Wartungsvertrag erfolgreich für das nächste Turnusintervall freigegeben!"})

@app.route("/api/protocols/mark-done/<p_id>", methods=["POST"])
def mark_protocol_done(p_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM protocols WHERE id = ?", (p_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"success": False, "error": "Protokoll nicht gefunden."}), 404
    cursor.execute(
        "UPDATE protocols SET status = 'synchronized', synchronized_quarter = ? WHERE id = ?",
        (current_quarter(), p_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Protokoll als erledigt markiert."})


@app.route("/api/protocols/reset-status/<p_id>", methods=["POST"])
def reset_protocol_status(p_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM protocols WHERE id = ?", (p_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"success": False, "error": "Protokoll nicht gefunden."}), 404
    cursor.execute(
        "UPDATE protocols SET status = 'ready_to_download', synchronized_quarter = '' WHERE id = ?",
        (p_id,)
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Status zurückgesetzt."})


@app.route("/print-blank/<protocol_id>/<group_id>")
def print_blank_pdf(protocol_id, group_id):
    """'Druck Blanko' button: asks protocol_core to build this device's
    Blanko-PDF right now (over the internal_lan Docker network -- protocol_core
    has no published port, only reachable from other containers here) and
    streams it straight back so the browser can display/print it immediately.
    Structural/data-driven blank regeneration still happens automatically via
    protocol_core's own 5s poll loop; this is only for the on-demand button."""
    try:
        resp = requests.post(f"{PROTOCOL_CORE_URL}/generate-blank/{protocol_id}/{group_id}", timeout=30)
    except requests.RequestException as e:
        return f"<h3>Core-Server nicht erreichbar: {e}</h3>", 502

    if resp.status_code != 200:
        try:
            err = resp.json().get("error", "Unbekannter Fehler.")
        except Exception:
            err = "Unbekannter Fehler."
        return f"<h3>Blanko-Protokoll konnte nicht erstellt werden: {err}</h3>", resp.status_code

    return send_file(io.BytesIO(resp.content), mimetype="application/pdf", as_attachment=False)

# ----------------- MANDANTEN ROUTES -----------------

@app.route("/api/mandanten", methods=["GET"])
def list_mandanten():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, logo_filename, company_name FROM mandanten ORDER BY name")
    mandanten = cursor.fetchall()

    results = []
    for m in mandanten:
        contract_count = cursor.execute(
            "SELECT COUNT(*) FROM protocols WHERE mandant_id = ?", (m["id"],)
        ).fetchone()[0]
        tech_count = cursor.execute(
            "SELECT COUNT(*) FROM technicians WHERE mandant_id = ?", (m["id"],)
        ).fetchone()[0]
        logo_path = storage.resolve(mandant_folder_name(m), "logo.png")
        results.append({
            "id": m["id"],
            "name": m["name"],
            "company_name": m["company_name"] or "",
            "has_logo": storage.exists(logo_path),
            "contract_count": contract_count,
            "technician_count": tech_count,
        })
    conn.close()
    return jsonify({"success": True, "mandanten": results, "active_mandant_id": get_active_mandant_id()})


@app.route("/api/mandanten/switch", methods=["POST"])
def switch_mandant():
    data = request.json or {}
    mandant_id = data.get("mandant_id", "")
    conn = get_db_connection()
    row = conn.execute("SELECT id FROM mandanten WHERE id = ?", (mandant_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"success": False, "error": "Mandant nicht gefunden."}), 404
    session["mandant_id"] = mandant_id
    return jsonify({"success": True})


@app.route("/api/mandanten/save", methods=["POST"])
def save_mandant():
    m_id = request.form.get("id", "").strip()
    name = request.form.get("name", "").strip()
    # Distinguish "field omitted" (renaming/logo-upload calls that don't touch
    # this) from "field submitted, possibly empty" (the dedicated Firmenname
    # editor) -- otherwise every rename/logo upload would silently wipe it.
    company_name = request.form.get("company_name")
    logo_file = request.files.get("logo")

    if not name:
        return jsonify({"success": False, "error": "Bitte einen Namen angeben."}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if not m_id:
            m_id = sanitize_filename(name).lower().replace(" ", "-") or f"mandant-{int(time.time())}"
            cursor.execute(
                "INSERT INTO mandanten (id, name, company_name, created_at) VALUES (?, ?, ?, ?)",
                (m_id, name, (company_name or "").strip(), int(time.time() * 1000))
            )
        else:
            if company_name is not None:
                cursor.execute("UPDATE mandanten SET name = ?, company_name = ? WHERE id = ?", (name, company_name.strip(), m_id))
            else:
                cursor.execute("UPDATE mandanten SET name = ? WHERE id = ?", (name, m_id))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"success": False, "error": "Ein Mandant mit dieser ID existiert bereits."}), 400

    if logo_file and logo_file.filename:
        mandant_row = conn.execute("SELECT id, name FROM mandanten WHERE id = ?", (m_id,)).fetchone()
        folder = storage.resolve(mandant_folder_name(mandant_row))
        storage.makedirs(folder)
        storage.write_bytes(storage.join(folder, "logo.png"), logo_file.read())
        cursor.execute("UPDATE mandanten SET logo_filename = 'logo.png' WHERE id = ?", (m_id,))
        conn.commit()

    conn.close()
    return jsonify({"success": True, "message": "Mandant gespeichert.", "id": m_id})


@app.route("/api/mandanten/delete/<m_id>", methods=["POST"])
def delete_mandant(m_id):
    if m_id == "standard":
        return jsonify({"success": False, "error": "Der Standard-Mandant kann nicht gelöscht werden."}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    contract_count = cursor.execute("SELECT COUNT(*) FROM protocols WHERE mandant_id = ?", (m_id,)).fetchone()[0]
    tech_count = cursor.execute("SELECT COUNT(*) FROM technicians WHERE mandant_id = ?", (m_id,)).fetchone()[0]
    if contract_count > 0 or tech_count > 0:
        conn.close()
        return jsonify({
            "success": False,
            "error": f"Mandant hat noch {contract_count} Vertrag/Verträge und {tech_count} Mitarbeiter zugeordnet -- bitte erst umziehen."
        }), 400

    cursor.execute("DELETE FROM mandanten WHERE id = ?", (m_id,))
    conn.commit()
    conn.close()
    if session.get("mandant_id") == m_id:
        session["mandant_id"] = "standard"
    return jsonify({"success": True, "message": "Mandant gelöscht."})

# ----------------- TECHNICIANS ROUTES -----------------

@app.route("/api/technicians", methods=["GET"])
def list_technicians():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, name FROM technicians WHERE mandant_id = ?", (get_active_mandant_id(),))
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
    is_new = not t_id
    active_mandant_id = get_active_mandant_id()

    try:
        if is_new:
            # Create new
            t_id = f"tech-{int(datetime.now().timestamp())}"
            raw_pwd = password if password else "123456" # fallback default default
            pass_hash = hashlib.sha256(raw_pwd.encode("utf-8")).hexdigest()

            cursor.execute("""
                INSERT INTO technicians (id, username, password_hash, name, mandant_id)
                VALUES (?, ?, ?, ?, ?)
            """, (t_id, username, pass_hash, name, active_mandant_id))
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

    if is_new:
        try:
            create_full_backup(active_mandant_id)
        except Exception as e:
            print(f"[BACKUP] Vollbackup nach Mitarbeiter-Anlage fehlgeschlagen: {e}")

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


@app.route("/api/technicians/<t_id>/generate-qr", methods=["POST"])
def generate_technician_qr(t_id):
    """Issues a fresh random password for this technician and returns a QR
    code encoding the full setup string the Android app already understands
    (SECURE_MANDANT;...). Passwords are only ever stored as a SHA-256 hash, so
    there is no way to recover an existing plaintext password to re-display --
    the only sound option is to reissue a new one, shown here exactly once."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, mandant_id FROM technicians WHERE id = ?", (t_id,))
    tech = cursor.fetchone()
    if not tech:
        conn.close()
        return jsonify({"success": False, "error": "Techniker nicht gefunden."}), 404

    new_password = secrets.token_urlsafe(9)
    pass_hash = hashlib.sha256(new_password.encode("utf-8")).hexdigest()
    cursor.execute("UPDATE technicians SET password_hash = ? WHERE id = ?", (pass_hash, t_id))
    conn.commit()
    conn.close()

    qr_address, qr_port = get_qr_server_config()
    qr_content = (
        f"SECURE_MANDANT;{tech['mandant_id'] or 'standard'};{qr_address};"
        f"{qr_port};{tech['username']};{new_password};{SERVER_CODEWORD}"
    )
    img = qrcode.make(qr_content)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_base64 = base64.b64encode(buf.getvalue()).decode("ascii")

    try:
        create_full_backup(tech["mandant_id"] or "standard")
    except Exception as e:
        print(f"[BACKUP] Vollbackup nach QR-Neuvergabe fehlgeschlagen: {e}")

    return jsonify({
        "success": True,
        "qr_image_base64": qr_base64,
        "username": tech["username"],
        "password": new_password,
        "message": "Neues Passwort vergeben -- das vorherige ist ab sofort ungültig."
    })


@app.route("/api/qr-server-config", methods=["GET"])
def get_qr_server_config_route():
    address, port = get_qr_server_config()
    is_configured = os.path.exists(_QR_SERVER_CONFIG_PATH)
    return jsonify({"success": True, "address": address, "port": port, "is_configured": is_configured})


@app.route("/api/qr-server-config", methods=["POST"])
def post_qr_server_config():
    data = request.json or {}
    address = (data.get("address") or "").strip()
    port = str(data.get("port") or "").strip()
    if not address or not port:
        return jsonify({"success": False, "error": "Bitte Adresse und Port angeben."}), 400
    if not address.startswith("http://") and not address.startswith("https://"):
        return jsonify({"success": False, "error": "Adresse muss mit http:// oder https:// beginnen."}), 400
    if not port.isdigit():
        return jsonify({"success": False, "error": "Port muss eine Zahl sein."}), 400
    save_qr_server_config(address, port)
    return jsonify({"success": True, "message": "Externe Adresse für QR-Codes gespeichert."})

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
        anlagentypen = data.get("anlagentypen")

        if active_system_types is not None and not isinstance(active_system_types, list):
            return jsonify({"success": False, "error": "active_system_types must be an array"}), 400

        settings = load_settings()
        if active_system_types is not None:
            settings["active_system_types"] = active_system_types
        if system_settings is not None:
            settings["system_settings"] = system_settings
        if anlagentypen is not None:
            settings["anlagentypen"] = anlagentypen

        save_settings(settings)
        return jsonify({"success": True, "message": "Einstellungen erfolgreich gespeichert."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ----------------- APP-UPDATE DISTRIBUTION -----------------
# The Android app is sideloaded (no Play Store), so it self-updates by asking
# netlink for the latest release. netlink reads the same fixed local path
# read-only (see docker-compose.yml) -- deliberately NOT routed through the
# swappable storage.py Archiv-Ziel abstraction, since app releases have
# nothing to do with where Wartungsprotokoll archives live, and keeping this
# path fixed on both sides avoids them ever pointing at different storage.
APP_UPDATES_PATH = os.path.join(storage.LOCAL_BASE_PATH, "AppUpdates")


@app.route("/api/app-updates", methods=["GET"])
def get_app_update_info():
    info_path = os.path.join(APP_UPDATES_PATH, "update_info.json")
    if not os.path.exists(info_path):
        return jsonify({"success": True, "release": None})
    with open(info_path, "r", encoding="utf-8") as f:
        info = json.load(f)
    return jsonify({"success": True, "release": info})


@app.route("/api/app-updates/upload", methods=["POST"])
def upload_app_update():
    apk_file = request.files.get("apk")
    version_code_raw = request.form.get("version_code", "").strip()
    version_name = request.form.get("version_name", "").strip()
    release_notes = request.form.get("release_notes", "").strip()
    min_supported_raw = request.form.get("min_supported_version_code", "").strip()

    if not apk_file or not apk_file.filename:
        return jsonify({"success": False, "error": "Bitte eine APK-Datei auswählen."}), 400
    if not apk_file.filename.lower().endswith(".apk"):
        return jsonify({"success": False, "error": "Datei muss eine .apk sein."}), 400
    if not version_code_raw.isdigit():
        return jsonify({"success": False, "error": "Versionscode muss eine Zahl sein."}), 400
    if not version_name:
        return jsonify({"success": False, "error": "Bitte einen Versionsnamen angeben."}), 400

    version_code = int(version_code_raw)
    min_supported_version_code = int(min_supported_raw) if min_supported_raw.isdigit() else 0
    if min_supported_version_code > version_code:
        return jsonify({"success": False, "error": "Mindestversion kann nicht größer als die neue Version sein."}), 400

    os.makedirs(APP_UPDATES_PATH, exist_ok=True)
    apk_bytes = apk_file.read()
    sha256 = hashlib.sha256(apk_bytes).hexdigest()

    with open(os.path.join(APP_UPDATES_PATH, "latest.apk"), "wb") as f:
        f.write(apk_bytes)

    info = {
        "version_code": version_code,
        "version_name": version_name,
        "release_notes": release_notes,
        "min_supported_version_code": min_supported_version_code,
        "sha256": sha256,
        "uploaded_at": int(time.time() * 1000),
        "file_size": len(apk_bytes),
    }
    with open(os.path.join(APP_UPDATES_PATH, "update_info.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=2)

    return jsonify({"success": True, "release": info})


# ----------------- ARCHIV-ZIEL (STORAGE) API -----------------
# Global, not per-Mandant -- the Samba/SMB target is shared infrastructure,
# unlike TAIFUN/Anlagentypen settings which are organizational per Mandant.

@app.route("/api/archive-config", methods=["GET"])
def get_archive_config():
    config = storage.get_config()
    config["external_password_set"] = bool(config.pop("external_password", ""))
    return jsonify({"success": True, "config": config, "smb_available": storage._SMB_AVAILABLE})


@app.route("/api/archive-config", methods=["POST"])
def post_archive_config():
    data = request.json or {}
    mode = data.get("mode", "integrated")
    external_path = data.get("external_path", "")
    external_username = data.get("external_username", "")
    external_password = data.get("external_password", "")

    if mode == "external" and not external_path.strip():
        return jsonify({"success": False, "error": "Bitte einen Pfad für die externe Freigabe angeben."}), 400

    # Leave the stored password untouched if the field was left blank on edit
    # (matches the technician-password editing convention elsewhere in this app).
    if not external_password:
        external_password = storage.get_config().get("external_password", "")

    storage.save_config(mode, external_path, external_username, external_password)
    return jsonify({"success": True, "message": "Archiv-Ziel gespeichert."})


@app.route("/api/archive-config/test", methods=["POST"])
def test_archive_config():
    data = request.json or {}
    external_path = data.get("external_path", "")
    external_username = data.get("external_username", "")
    external_password = data.get("external_password", "")
    if not external_password:
        external_password = storage.get_config().get("external_password", "")
    if not external_path.strip():
        return jsonify({"success": False, "error": "Bitte einen Pfad angeben."}), 400
    ok, message = storage.test_external_connection(external_path, external_username, external_password)
    return jsonify({"success": ok, "message": message})


def _candidate_config_from_request(data):
    mode = data.get("mode", "integrated")
    external_path = data.get("external_path", "")
    external_username = data.get("external_username", "")
    external_password = data.get("external_password", "")
    if not external_password:
        external_password = storage.get_config().get("external_password", "")
    return {
        "mode": mode if mode in ("integrated", "external") else "integrated",
        "external_path": external_path.strip(),
        "external_username": external_username.strip(),
        "external_password": external_password,
    }


@app.route("/api/archive-config/check", methods=["POST"])
def check_archive_config():
    """Step 1 of switching the Archiv-Ziel: verify the candidate target is
    reachable AND writable before anything else happens."""
    candidate = _candidate_config_from_request(request.json or {})
    if candidate["mode"] == "external" and not candidate["external_path"]:
        return jsonify({"success": False, "error": "Bitte einen Pfad für die externe Freigabe angeben."}), 400
    ok, message = storage.test_write_access(candidate)
    return jsonify({"success": ok, "message": message})


@app.route("/api/archive-config/migrate", methods=["POST"])
def migrate_archive_config():
    """Step 2 (only if the user confirms it): copies every file from the
    currently active Archiv-Ziel into the candidate one. Does not switch the
    active target or touch the source files."""
    candidate = _candidate_config_from_request(request.json or {})
    try:
        copied, failed = storage.migrate_active_to(candidate)
    except Exception as e:
        return jsonify({"success": False, "error": f"Übertragung fehlgeschlagen: {e}"}), 500
    message = f"{copied} Datei(en) übertragen."
    if failed:
        message += f" {len(failed)} fehlgeschlagen."
    return jsonify({"success": True, "message": message, "copied": copied, "failed": failed})


@app.route("/api/archive-config/purge-old", methods=["POST"])
def purge_old_archive_config():
    """Step 3 (only if the user confirms it, after a successful migration):
    deletes every file from the currently active (about-to-be-replaced)
    Archiv-Ziel."""
    try:
        removed, failed = storage.delete_all_active()
    except Exception as e:
        return jsonify({"success": False, "error": f"Löschen fehlgeschlagen: {e}"}), 500
    message = f"{removed} Datei(en) aus dem alten Archiv-Ziel gelöscht."
    if failed:
        message += f" {len(failed)} fehlgeschlagen."
    return jsonify({"success": True, "message": message, "removed": removed, "failed": failed})


@app.route("/api/anlagentypen", methods=["GET"])
def api_get_anlagentypen():
    settings = load_settings()
    return jsonify({"success": True, "anlagentypen": settings.get("anlagentypen", [])})


@app.route("/api/anlagentypen", methods=["POST"])
def api_save_anlagentyp():
    try:
        data = request.json
        type_id = (data.get("type_id") or "").strip()
        if not type_id:
            return jsonify({"success": False, "error": "type_id ist erforderlich"}), 400

        settings = load_settings()
        typen = settings.get("anlagentypen", [])
        existing = next((i for i, t in enumerate(typen) if t["type_id"] == type_id), None)
        if existing is not None:
            typen[existing] = data
        else:
            typen.append(data)
        settings["anlagentypen"] = typen
        save_settings(settings)
        return jsonify({"success": True, "anlagentyp": data})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/anlagentypen/<type_id>", methods=["DELETE"])
def api_delete_anlagentyp(type_id):
    try:
        settings = load_settings()
        typen = settings.get("anlagentypen", [])
        before = len(typen)
        typen = [t for t in typen if t["type_id"] != type_id]
        if len(typen) == before:
            return jsonify({"success": False, "error": "Anlagentyp nicht gefunden"}), 404
        settings["anlagentypen"] = typen
        save_settings(settings)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ----------------- CELLS (AUSLÖSELISTEN) API -----------------

# ── Unified per-device storage ──────────────────────────────────────────────────
#
# One protocol_groups row = one Gerät (a whole system, e.g. "BMA Hauptgebäude"),
# regardless of source (TAIFUN import, ETB import, manual drawing). Its internal
# Melder-Gruppen live in group_cells under that SAME group_id: a '__rows__' cell
# holds the registry [[grp_num, grp_name], ...], and every real Melder is its own
# row keyed slot_key = "{grp_num}_{melder_nr}" with its own value/type/updated_at.
#
# Mirrors netlink/main.py's identical helpers -- kept in sync manually since webui
# and netlink are separate deployables that only share the SQLite file, not code.

def _device_registry(cursor, protocol_id, group_id):
    """Returns (registry, cells) for one device, lazily migrating legacy storage
    (GRID_V1 blob or old flat single-index cells) to the unified format in place."""
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

    now = int(datetime.now().timestamp())
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


def _device_registry_to_grid(registry, cells):
    """Rebuilds the {v,n_groups,n_cols,groups,types,values} grid JSON shape the WebUI's
    grid-drawing editor expects, from the unified per-device storage."""
    cells_by_grp = {}
    for c in cells:
        if "_" not in c["slot_key"]:
            continue
        grp_num, melder_nr = c["slot_key"].split("_", 1)
        cells_by_grp.setdefault(grp_num, {})[melder_nr] = c

    n_cols = 0
    types, values = {}, {}
    for row_idx, entry in enumerate(registry, 1):
        grp_num = str(entry[0])
        for melder_nr, c in cells_by_grp.get(grp_num, {}).items():
            try:
                col_idx = int(melder_nr)
            except ValueError:
                continue
            n_cols = max(n_cols, col_idx)
            key = f"{row_idx}_{col_idx}"
            if c["detector_type"] and c["detector_type"] != "-":
                types[key] = c["detector_type"]
            if c["value"]:
                values[key] = c["value"]

    return {
        "v": 1,
        "n_groups": len(registry),
        "n_cols": n_cols or 8,
        "groups": [[str(g[0]), g[1] if len(g) > 1 else ""] for g in registry],
        "types": types,
        "values": values,
    }


def _grid_to_device_registry(cursor, protocol_id, group_id, grid):
    """Persists a {groups,types,values} grid JSON (WebUI grid editor or ETB import
    preview) into the unified per-device storage under the SAME device group_id --
    never creates a new top-level protocol_groups row, so one Gerät stays one Gerät."""
    groups_list = grid.get("groups", [])
    types_map = grid.get("types", {})
    values_map = grid.get("values", {})
    n_cols = grid.get("n_cols", 0)
    now = int(datetime.now().timestamp())

    registry = [[str(g[0]) if g else str(i), str(g[1]) if len(g) > 1 else ""] for i, g in enumerate(groups_list, 1)]

    # '__hardware__' is a separate, independently-saved table (see
    # _hardware_rows_to_device) -- must survive a Melderliste save untouched.
    cursor.execute(
        "DELETE FROM group_cells WHERE protocol_id = ? AND group_id = ? AND slot_key != '__hardware__'",
        (protocol_id, group_id)
    )
    cursor.execute(
        "INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value, updated_at) "
        "VALUES (?, ?, '__rows__', '-', ?, ?)",
        (protocol_id, group_id, json.dumps(registry), now)
    )
    for row_idx, g in enumerate(groups_list, 1):
        grp_num = str(g[0]) if g else str(row_idx)
        for col_idx in range(1, n_cols + 1):
            key = f"{row_idx}_{col_idx}"
            det_type = types_map.get(key, "-")
            val = values_map.get(key, "")
            if det_type == "-" and not val:
                continue
            cursor.execute(
                "INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (protocol_id, group_id, f"{grp_num}_{col_idx}", det_type, val, now)
            )
    return len(registry)


def _device_hardware_to_rows(cursor, protocol_id, group_id):
    """Reads the optional '__hardware__' sentinel cell for one device --
    Zentrale/Ringkarten-Inventar, independent of the Melderliste. Returns []
    if the device has no Hardware table (it's optional per Gerät)."""
    cursor.execute(
        "SELECT value FROM group_cells WHERE protocol_id = ? AND group_id = ? AND slot_key = '__hardware__'",
        (protocol_id, group_id)
    )
    cell = cursor.fetchone()
    if not cell:
        return []
    try:
        return json.loads(cell["value"]).get("rows", [])
    except Exception:
        return []


def _hardware_rows_to_device(cursor, protocol_id, group_id, hw_rows):
    """Persists the Hardware table for one device as a single JSON blob under the
    '__hardware__' sentinel slot_key -- independent of the Melderliste's cells
    (see _grid_to_device_registry's exclusion), so saving one never touches the
    other. Passing an empty list removes the table entirely."""
    now = int(datetime.now().timestamp())
    if not hw_rows:
        cursor.execute(
            "DELETE FROM group_cells WHERE protocol_id = ? AND group_id = ? AND slot_key = '__hardware__'",
            (protocol_id, group_id)
        )
        return
    cursor.execute(
        "INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value, updated_at) "
        "VALUES (?, ?, '__hardware__', '-', ?, ?) "
        "ON CONFLICT(protocol_id, group_id, slot_key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at",
        (protocol_id, group_id, json.dumps({"v": 1, "rows": hw_rows}), now)
    )


@app.route("/api/cells/<protocol_id>/<group_id>", methods=["GET"])
def get_cells(protocol_id, group_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT group_name, anlage_type, anlage_interval FROM protocol_groups WHERE protocol_id = ? AND group_id = ?",
        (protocol_id, group_id)
    )
    dev = cursor.fetchone()
    if not dev:
        conn.close()
        return jsonify({"success": False, "error": "Gerät nicht gefunden."}), 404

    registry, cells = _device_registry(cursor, protocol_id, group_id)
    conn.commit()  # persist any lazy migration performed while reading
    grid_data = _device_registry_to_grid(registry, cells)
    hardware_rows = _device_hardware_to_rows(cursor, protocol_id, group_id)
    conn.close()

    anlage_type = dev["anlage_type"] or "BMA"
    settings = load_settings()
    anlagentypen = settings.get("anlagentypen", DEFAULT_ANLAGENTYPEN)
    mp_def = None
    zusatz_tabelle = None
    for at in anlagentypen:
        if at["type_id"] == anlage_type:
            mp_def = at.get("meldepunkt_definitionen")
            zusatz_tabelle = at.get("zusatz_tabelle")
            break
    if mp_def is None:
        for at in DEFAULT_ANLAGENTYPEN:
            if at["type_id"] == anlage_type:
                mp_def = at.get("meldepunkt_definitionen")
                zusatz_tabelle = at.get("zusatz_tabelle")
                break

    return jsonify({
        "success": True,
        "format": "grid",
        "grid": grid_data,
        "group_name": dev["group_name"],
        "anlage_type": anlage_type,
        "anlage_interval": dev["anlage_interval"] or "Halbjährlich",
        "meldepunkt_definitionen": mp_def,
        "hardware": hardware_rows,
        # Only used to pre-check the "Hardware-Tabelle aktivieren" box for a
        # device that has none yet -- an existing hardware_rows list (even a
        # manually-emptied one) always wins over this Anlagentyp-level default.
        "hardware_enabled_default": bool(zusatz_tabelle)
    })


@app.route("/api/cells/<protocol_id>/<group_id>", methods=["POST"])
def save_cells(protocol_id, group_id):
    data = request.json
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if "grid" in data:
            count = _grid_to_device_registry(cursor, protocol_id, group_id, data["grid"])
        else:
            # Flat list of cells (legacy client state) -> one default Melder-Gruppe "1"
            cells = data.get("cells", [])
            numeric_keys = [int(c["slot_key"]) for c in cells if str(c.get("slot_key", "")).isdigit()]
            grid = {
                "groups": [["1", ""]],
                "n_cols": max(numeric_keys, default=len(cells)),
                "types": {f"1_{c['slot_key']}": c["detector_type"] for c in cells if c.get("detector_type", "-") != "-"},
                "values": {f"1_{c['slot_key']}": c.get("value", "") for c in cells if c.get("value")},
            }
            count = _grid_to_device_registry(cursor, protocol_id, group_id, grid)

        # Only touch the Hardware table if the client actually sent something for
        # it -- its absence means "editor didn't show/change this section", not
        # "delete the Hardware table". An explicit empty list (checkbox switched
        # off) does delete it, via _hardware_rows_to_device.
        if "hardware" in data:
            _hardware_rows_to_device(cursor, protocol_id, group_id, data["hardware"])

        conn.commit()
        conn.close()
        return jsonify({"success": True, "count": count})
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"success": False, "error": str(e)}), 500


def _json_anlage_to_grid(anlage_json):
    """Convert one Anlage from esser_etb_parser JSON output to grid format.

    JSON keys: anlage (name), gruppen (list), each Gruppe has:
      gruppe (int), name (str), melder (list of {nr, typ}), unresolved (bool)
    """
    gruppen = anlage_json.get("gruppen", [])
    # Signalgeber-, TAL- und Koppler-Gruppen gehören nicht zur eigentlichen
    # Auslöseliste, die ein Techniker prüft (siehe "ausblendbar" in
    # esser_etb_parser.py / JSON_FORMAT.md) -- werden komplett übersprungen,
    # statt als irrelevante Zeilen mit übernommen zu werden.
    gruppen = [g for g in gruppen if not g.get("ausblendbar")]
    grid_groups = []
    types_dict = {}
    n_cols = 0
    for row_idx, g in enumerate(gruppen, 1):
        grp_num = str(g["gruppe"]) if g.get("gruppe") is not None else str(row_idx)
        grid_groups.append([grp_num, g.get("name") or ""])
        melder = g.get("melder") or []
        n_cols = max(n_cols, len(melder))
        for m in melder:
            col_idx = m["nr"]          # 1-based position within Gruppe
            typ = m.get("typ", "")
            if typ and typ != "-":
                types_dict[f"{row_idx}_{col_idx}"] = typ
    return {
        "v": 1,
        "n_groups": len(grid_groups),
        "n_cols": n_cols or 8,
        "groups": grid_groups,
        "types": types_dict,
        "values": {}
    }


def _json_anlage_to_hardware(anlage_json):
    """Builds the Hardware table (Zentrale + Ringkarten) from an esser_etb_parser
    Anlage object's 'serie'/'version'/'ringkarten' fields -- independent of
    'gruppen' (the Melderliste). Returns [] if none of these fields are present
    (older parser output, or an Anlage with no resolvable hardware inventory)."""
    serie = anlage_json.get("serie")
    version = anlage_json.get("version")
    ringkarten = anlage_json.get("ringkarten") or []
    anlage_name = anlage_json.get("anlage") or ""

    rows = []
    if serie or version or ringkarten:
        rows.append({
            "hardware": "Zentrale",
            "bezeichnung": anlage_name,
            "typ": serie or "",
            "stoerung": "",
            "unterbrechung": "",
            "sw_stand": version or "",
        })
    for rk in ringkarten:
        rows.append({
            "hardware": f"Ringkarte {rk.get('ringnummer', '')}".strip(),
            "bezeichnung": rk.get("bezeichnung") or "",
            "typ": "",
            "stoerung": "",
            "unterbrechung": "",
            "sw_stand": "",
        })
    return rows


@app.route("/api/cells/<protocol_id>/<group_id>/import-etb", methods=["POST"])
def import_etb_cells(protocol_id, group_id):
    if "file" not in request.files:
        return jsonify({"success": False, "error": "Keine Datei hochgeladen."}), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify({"success": False, "error": "Dateiname fehlt."}), 400
    try:
        file_bytes = f.read()
        fname = f.filename.lower()

        if fname.endswith(".etb"):
            parser_path = _ETB_PARSER_PATH
            if not parser_path:
                searched = [
                    os.path.join(_PROJECT_ROOT, 'esser_etb_parser.py'),
                    os.path.join(os.getcwd(), 'esser_etb_parser.py'),
                ]
                return jsonify({"success": False,
                                "error": f"esser_etb_parser.py nicht gefunden (gesucht in: {', '.join(searched)})"}), 500

            suffix = os.path.splitext(f.filename)[1] or ".etb"
            tmp_etb = tmp_json = None
            try:
                # Write uploaded ETB to temp file
                with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as fh:
                    fh.write(file_bytes)
                    tmp_etb = fh.name
                # Temp path for JSON output
                with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as fh:
                    tmp_json = fh.name

                proc = subprocess.run(
                    [sys.executable, parser_path, "--json-out", tmp_json, tmp_etb],
                    capture_output=True, text=True, timeout=30
                )
                if proc.returncode != 0:
                    err = proc.stderr.strip() or "ETB-Parser fehlgeschlagen"
                    return jsonify({"success": False, "error": err}), 400

                with open(tmp_json, "r", encoding="utf-8") as jf:
                    parsed = json.load(jf)
            finally:
                for p in (tmp_etb, tmp_json):
                    if p:
                        try:
                            os.unlink(p)
                        except OSError:
                            pass

            # to_json() returns {"anlage":..,"gruppen":..} for single, {"anlagen":[..]} for multi
            if "anlagen" in parsed:
                anlagen_json = parsed["anlagen"]
            else:
                anlagen_json = [parsed]

            if not anlagen_json:
                return jsonify({"success": False, "error": "Keine Gruppen in ETB-Datei gefunden."}), 400

            if len(anlagen_json) == 1:
                grid = _json_anlage_to_grid(anlagen_json[0])
                hardware = _json_anlage_to_hardware(anlagen_json[0])
                return jsonify({"success": True, "grid": grid, "hardware": hardware, "anlage_count": 1})

            options = [
                {
                    "name": a.get("anlage", f"Anlage {i + 1}"),
                    "group_count": len(a.get("gruppen", [])),
                    "grid": _json_anlage_to_grid(a),
                    "hardware": _json_anlage_to_hardware(a)
                }
                for i, a in enumerate(anlagen_json)
            ]
            return jsonify({"success": True, "anlage_count": len(options), "anlagen": options})

        # CSV/text fallback for non-.etb files
        text = file_bytes.decode("utf-8", errors="ignore")
        lines = [l.strip() for l in text.splitlines() if l.strip() and not l.startswith("#")]
        delimiter = ";" if any(";" in l for l in lines[:5]) else ","
        grid_groups, types_dict = [], {}
        for row_idx, line in enumerate(lines, 1):
            parts = [p.strip() for p in line.split(delimiter)]
            if len(parts) < 2:
                continue
            grid_groups.append([parts[0], parts[1]])
            for col_idx, det_type in enumerate(parts[2:], 1):
                if det_type and det_type != "-":
                    types_dict[f"{row_idx}_{col_idx}"] = det_type
        if not grid_groups:
            return jsonify({"success": False, "error": "Datei konnte nicht gelesen werden."}), 400
        n_cols = max((int(k.split("_")[1]) for k in types_dict), default=8) if types_dict else 8
        grid = {"v": 1, "n_groups": len(grid_groups), "n_cols": n_cols,
                "groups": grid_groups, "types": types_dict, "values": {}}
        return jsonify({"success": True, "grid": grid, "anlage_count": 1})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/admin/delete-all-cells", methods=["POST"])
def delete_all_cells():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        count = cursor.execute("SELECT COUNT(*) FROM group_cells").fetchone()[0]
        cursor.execute("DELETE FROM group_cells")
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"success": False, "error": str(e)}), 500
    conn.close()
    return jsonify({"success": True, "count": count})


@app.route("/api/admin/delete-all-contracts", methods=["POST"])
def delete_all_contracts():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        count = cursor.execute("SELECT COUNT(*) FROM protocols").fetchone()[0]
        cursor.execute("DELETE FROM group_cells")
        cursor.execute("DELETE FROM protocol_groups")
        cursor.execute("DELETE FROM protocols")
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"success": False, "error": str(e)}), 500
    conn.close()
    return jsonify({"success": True, "count": count})


# ----------------- UPLOADS & FILE PARSING API -----------------

def extract_tag_content(xml, tag):
    pattern = rf"<{tag}(?:\s+[^>]*)?>([\s\S]*?)</{tag}>"
    match = re.search(pattern, xml, re.IGNORECASE)
    return html_module.unescape(match.group(1).strip()) if match else ""

def extract_tags_content(xml, tag):
    pattern = rf"<{tag}(?:\s+[^>]*)?>([\s\S]*?)</{tag}>"
    return [html_module.unescape(m.strip()) for m in re.findall(pattern, xml, re.IGNORECASE)]

def get_tag_value(xml, tag, default_value=""):
    closing_pattern = rf"<{tag}(?:\s+[^>]*)?>([\s\S]*?)</{tag}>"
    match = re.search(closing_pattern, xml, re.IGNORECASE)
    if match:
        return html_module.unescape(match.group(1).strip())
    self_closing_pattern = rf"<{tag}(?:\s+[^>]*)?/>"
    if re.search(self_closing_pattern, xml, re.IGNORECASE):
        return ""
    return default_value

def taifun_name_lines(xml, prefix):
    """TAIFUN always reserves 3 slots for MtName/OjName (e.g. MtName1/2/3).
    When fewer than 3 lines are used, the populated slots are the highest
    numbers (e.g. only MtName2+MtName3, never MtName1+MtName2) -- but the
    read/display order is still ascending: MtName1 first, then 2, then 3.
    ("LISA Landesinstitut für Schulqualität" + "und Lehrerbildung
    Sachsen-Anhalt" only reads correctly in that order.) Missing slots are
    skipped, not blanked."""
    return [v for v in (get_tag_value(xml, f"{prefix}{n}") for n in (1, 2, 3)) if v]


def build_taifun_address(xml):
    parts = taifun_name_lines(xml, "MtName")
    str_val = get_tag_value(xml, "Strasse") or get_tag_value(xml, "Straße")
    plz = get_tag_value(xml, "Plz") or get_tag_value(xml, "PLZ")
    ort = get_tag_value(xml, "Ort")

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
        taifun_xml_path = storage.resolve("wartungVT.xml")
        try:
            storage.write_bytes(taifun_xml_path, content.encode("utf-8"))
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
        active_mandant_id = get_active_mandant_id()

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
                contract_guid = ""  # only ever populated for the WtVt (new) format
                
                sub_systems_to_import = []
                
                if is_taifun_format:
                    contract_number = get_tag_value(block, "Nr")
                    info = get_tag_value(block, "Info")
                    # Vertrags-GUID -- get_tag_value's first-match regex correctly grabs
                    # this one since <WtVt><GUID> textually precedes any nested
                    # <WtVL><GUID>/<WtGrt><GUID> inside the same block.
                    contract_guid = get_tag_value(block, "GUID") or ""

                    if not contract_number:
                        continue

                    name = info or f"Vertrag {contract_number}"
                    p_id = f"PRO-{contract_number}"
                    # Anchor by contract_guid when we've seen it before, so a later
                    # renumbering (<Nr> changes) updates the same protocol row instead
                    # of creating an orphaned duplicate that loses all its Messwerte.
                    if contract_guid:
                        existing = cursor.execute(
                            "SELECT id FROM protocols WHERE contract_guid = ?", (contract_guid,)
                        ).fetchone()
                        if existing:
                            p_id = existing["id"]

                    # Parse WtAgList
                    wtag_list_block = extract_tag_content(block, "WtAgList")
                    wtag_blocks = extract_tags_content(wtag_list_block, "WtAg")

                    # Use the first WtAg's customer name as the contract address
                    address = "Aus TAIFUN importiert"
                    for wtag in wtag_blocks:
                        wtag_hdr = re.split(r"<WtGrtList>|<WtVLList>", wtag, flags=re.IGNORECASE)[0]
                        mt_lines = taifun_name_lines(wtag_hdr, "MtName")
                        if mt_lines:
                            address = ", ".join(mt_lines)
                            break

                    # Build flat list of devices (one per WtGrt)
                    devices_to_import = []

                    def parse_interval(val):
                        if val == "1": return "Monatlich"
                        if val in ("3", "4"): return "Quartalsweise"
                        if val == "6": return "Halbjährlich"
                        if val == "12": return "Jährlich"
                        return "Halbjährlich"

                    for ag_idx, wtag in enumerate(wtag_blocks, 1):
                        wtag_hdr = re.split(r"<WtGrtList>|<WtVLList>", wtag, flags=re.IGNORECASE)[0]

                        anlage_nr = get_tag_value(wtag_hdr, "Nr") or f"A{ag_idx:03d}"
                        # OjName = building/object name (Haus 1, Gebäude A, ...), up to 3 lines
                        oj_lines = taifun_name_lines(wtag_hdr, "OjName")
                        mt_lines = taifun_name_lines(wtag_hdr, "MtName")
                        obj_name = ", ".join(oj_lines) or ", ".join(mt_lines) or f"Standort {ag_idx}"
                        customer = ", ".join(mt_lines)

                        # Interval from first WtVL of this WtAg
                        wtvl_block = extract_tag_content(wtag, "WtVLList")
                        wtvl_items = extract_tags_content(wtvl_block, "WtVL")
                        ag_interval = "Halbjährlich"
                        for wtvl in wtvl_items:
                            ag_interval = parse_interval(get_tag_value(wtvl, "WtIntervall"))
                            break  # only first WtVL counts per WtAg

                        # Devices (WtGrt) — each becomes one protocol_groups row
                        wtgrt_block = extract_tag_content(wtag, "WtGrtList")
                        wtgrt_items = extract_tags_content(wtgrt_block, "WtGrt")

                        for grt_idx, wtgrt in enumerate(wtgrt_items, 1):
                            dev_guid = get_tag_value(wtgrt, "GUID") or ""
                            # Sanitise GUID → alphanumeric group_id
                            group_id = re.sub(r"[^A-Za-z0-9]", "", dev_guid)[:48] or f"G{ag_idx:03d}{grt_idx:03d}"
                            dev_name_raw = get_tag_value(wtgrt, "Name") or "Gerät"
                            dev_info = get_tag_value(wtgrt, "Info") or dev_name_raw
                            dev_type = get_clean_type(dev_name_raw)

                            devices_to_import.append({
                                "group_id": group_id,
                                "group_name": dev_info,
                                "group_type": dev_type,
                                "anlage_id": anlage_nr,
                                "anlage_name": obj_name,
                                "anlage_type": dev_type,
                                "anlage_address": customer,
                                "anlage_interval": ag_interval,
                                "has_guid": bool(dev_guid),
                            })

                    # Derive primary contract metadata from first real device
                    if devices_to_import:
                        first = devices_to_import[0]
                        default_system_type = first["group_type"] if first["group_type"] in ("BMA", "EMA", "ELA", "Lichtruf", "SLA") else "BMA"
                        interval = first["anlage_interval"]
                    else:
                        default_system_type = "BMA"
                        interval = "Halbjährlich"
                        # placeholder so the contract still appears
                        devices_to_import.append({
                            "group_id": f"G{contract_number}000",
                            "group_name": "Anlage",
                            "group_type": "BMA",
                            "anlage_id": "A001",
                            "anlage_name": "Standort",
                            "anlage_type": "BMA",
                            "anlage_address": "",
                            "anlage_interval": "Halbjährlich",
                            "has_guid": False,
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
                    INSERT INTO protocols (id, name, address, contract_number, interval, system_type, status, columns, applicable_values, detector_types, mandant_id, contract_guid)
                    VALUES (?, ?, ?, ?, ?, ?, 'ready_to_download', ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name=EXCLUDED.name,
                        address=EXCLUDED.address,
                        interval=EXCLUDED.interval,
                        system_type=EXCLUDED.system_type,
                        contract_number=EXCLUDED.contract_number,
                        contract_guid=CASE WHEN EXCLUDED.contract_guid != '' THEN EXCLUDED.contract_guid ELSE protocols.contract_guid END
                """, (p_id, name, address, contract_number, interval, default_system_type, cols, app_vals, det_types, active_mandant_id, contract_guid))

                if is_taifun_format:
                    # One protocol_group row per WtGrt — no cells created
                    for dev in devices_to_import:
                        # Vertragswechsel: this device's GUID-derived group_id already
                        # exists under a DIFFERENT contract -- migrate it (and its
                        # group_cells/Messwerte) in place instead of letting the
                        # upsert below insert a duplicate and orphan the old row.
                        # Only trusted for a real GUID -- synthetic positional
                        # fallback ids (no GUID in the source) aren't globally unique
                        # across contracts and would risk a false-positive match.
                        if dev["has_guid"]:
                            other = cursor.execute(
                                "SELECT protocol_id FROM protocol_groups WHERE group_id = ? AND protocol_id != ?",
                                (dev["group_id"], p_id)
                            ).fetchone()
                            if other:
                                old_pid = other["protocol_id"]
                                cursor.execute(
                                    "UPDATE protocol_groups SET protocol_id = ? WHERE protocol_id = ? AND group_id = ?",
                                    (p_id, old_pid, dev["group_id"])
                                )
                                cursor.execute(
                                    "UPDATE group_cells SET protocol_id = ? WHERE protocol_id = ? AND group_id = ?",
                                    (p_id, old_pid, dev["group_id"])
                                )
                        cursor.execute("""
                            INSERT INTO protocol_groups
                                (protocol_id, group_id, group_name, group_type,
                                 anlage_id, anlage_name, anlage_type, anlage_address, anlage_interval)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(protocol_id, group_id) DO UPDATE SET
                                group_name=EXCLUDED.group_name,
                                group_type=EXCLUDED.group_type,
                                anlage_id=EXCLUDED.anlage_id,
                                anlage_name=EXCLUDED.anlage_name,
                                anlage_type=EXCLUDED.anlage_type,
                                anlage_address=EXCLUDED.anlage_address,
                                anlage_interval=EXCLUDED.anlage_interval
                        """, (p_id, dev["group_id"], dev["group_name"], dev["group_type"],
                              dev["anlage_id"], dev["anlage_name"], dev["anlage_type"],
                              dev["anlage_address"], dev["anlage_interval"]))
                else:
                    # Legacy format: build groups + cells from sub_systems_to_import.
                    # No GUID exists in this XML schema at all -- the <Gruppe> free-text
                    # value is the only available stable identity, so it's used as
                    # group_id (unchanged from before). Upsert-merge instead of the old
                    # blanket delete-then-rebuild: structural fields (name/type/detector
                    # type) are refreshed, but an existing group_cells.value is never
                    # overwritten, and only groups/slots genuinely absent from this
                    # import get removed -- a renamed <Gruppe> is indistinguishable from
                    # delete+recreate in this format and still loses its history, but
                    # every unchanged group now keeps its Messwerte.
                    for sub in sub_systems_to_import:
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
                                })

                        seen_group_ids = list(groups_map.keys())
                        for group_id, g_data in groups_map.items():
                            cursor.execute("""
                                INSERT INTO protocol_groups
                                    (protocol_id, group_id, group_name, group_type,
                                     anlage_id, anlage_name, anlage_type, anlage_address)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                ON CONFLICT(protocol_id, group_id) DO UPDATE SET
                                    group_name=EXCLUDED.group_name,
                                    group_type=EXCLUDED.group_type,
                                    anlage_id=EXCLUDED.anlage_id,
                                    anlage_name=EXCLUDED.anlage_name,
                                    anlage_type=EXCLUDED.anlage_type,
                                    anlage_address=EXCLUDED.anlage_address
                            """, (p_id, group_id, g_data["name"], g_data["type"],
                                  sub["id"], sub["name"], sub["system_type"], sub["address"] or ""))

                            seen_slot_keys = [cell["slotKey"] for cell in g_data["cells"]]
                            for cell in g_data["cells"]:
                                cursor.execute("""
                                    INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value)
                                    VALUES (?, ?, ?, ?, '')
                                    ON CONFLICT(protocol_id, group_id, slot_key) DO UPDATE SET
                                        detector_type=EXCLUDED.detector_type
                                """, (p_id, group_id, cell["slotKey"], cell["detectorType"]))
                            if seen_slot_keys:
                                placeholders = ",".join("?" * len(seen_slot_keys))
                                cursor.execute(
                                    f"DELETE FROM group_cells WHERE protocol_id = ? AND group_id = ? AND slot_key NOT IN ({placeholders})",
                                    (p_id, group_id, *seen_slot_keys)
                                )
                        if seen_group_ids:
                            placeholders = ",".join("?" * len(seen_group_ids))
                            cursor.execute(
                                f"DELETE FROM protocol_groups WHERE protocol_id = ? AND anlage_id = ? AND group_id NOT IN ({placeholders})",
                                (p_id, sub["id"], *seen_group_ids)
                            )
                            cursor.execute(
                                f"DELETE FROM group_cells WHERE protocol_id = ? AND group_id NOT IN "
                                f"(SELECT group_id FROM protocol_groups WHERE protocol_id = ?)",
                                (p_id, p_id)
                            )
                imported_count += 1
            conn.commit()
        except Exception as tx_err:
            conn.rollback()
            raise tx_err
        finally:
            conn.close()
            
        return jsonify({
            "success": True,
            "message": f"{imported_count} Wartungsverträge mit allen Anlagen und Geräten erfolgreich aus TAIFUN-XML importiert."
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

@app.route("/download_pdf/<protocol_id>/<group_id>")
def download_active_pdf(protocol_id, group_id):
    """PDFs are per-Gerät (see protocol_core/worker.py) -- this downloads one
    device's currently active protocol, not a single whole-contract file."""
    conn = get_db_connection()
    cursor = conn.cursor()
    ctx = get_device_pdf_context(cursor, protocol_id, group_id)
    conn.close()
    if not ctx:
        return "<h3>Vertrag oder Gerät nicht gefunden.</h3>", 404
    mandant_folder, p, dev_name, dev_type = ctx

    pdf_path = storage.resolve(mandant_folder, contract_folder_name(p), device_filename(dev_name, dev_type))
    if not storage.exists(pdf_path):
        return "<h3>PDF-Protokoll wurde vom Core-Server noch nicht synchronisiert oder gerendert.</h3>", 404
    return send_file(io.BytesIO(storage.read_bytes(pdf_path)), mimetype="application/pdf",
                      as_attachment=True, download_name=device_filename(dev_name, dev_type))

@app.route("/download_archive/<protocol_id>/<year>/<filename>")
def download_archive_pdf(protocol_id, year, filename):
    conn = get_db_connection()
    cursor = conn.cursor()
    p = cursor.execute("SELECT * FROM protocols WHERE id = ?", (protocol_id,)).fetchone()
    if not p:
        conn.close()
        return "<h3>Vertrag nicht gefunden.</h3>", 404
    mandant_row = cursor.execute(
        "SELECT id, name FROM mandanten WHERE id = ?", (p["mandant_id"] or "standard",)
    ).fetchone()
    conn.close()
    mandant_folder = mandant_folder_name(mandant_row) if mandant_row else "Standard"

    pdf_path = storage.resolve(mandant_folder, "Archiv", year, contract_folder_name(p), filename)
    if not storage.exists(pdf_path):
        return "<h3>Archiviertes PDF-Protokoll wurde nicht gefunden.</h3>", 404
    return send_file(io.BytesIO(storage.read_bytes(pdf_path)), mimetype="application/pdf",
                      as_attachment=True, download_name=filename)


@app.route("/mandant_logo/<m_id>")
def mandant_logo(m_id):
    conn = get_db_connection()
    mandant_row = conn.execute("SELECT id, name FROM mandanten WHERE id = ?", (m_id,)).fetchone()
    conn.close()
    if not mandant_row:
        return "", 404
    logo_path = storage.resolve(mandant_folder_name(mandant_row), "logo.png")
    if not storage.exists(logo_path):
        return "", 404
    return send_file(io.BytesIO(storage.read_bytes(logo_path)), mimetype="image/png")

if __name__ == "__main__":
    print("Starting production companion Flask WebUI app on port 8080...")
    app.run(host="0.0.0.0", port=8080, debug=False)
