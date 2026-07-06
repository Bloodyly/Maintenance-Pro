# -*- coding: utf-8 -*-
"""File storage abstraction for the 'Archiv-Ziel' setting: either the
integrated Samba share (the local Docker-mounted path this service already
used everywhere) or a real external SMB share reached over the network via
smbprotocol's smbclient module. Every call site that used to touch
SAMBA_SHARE_PATH with plain os/shutil calls goes through here instead, so the
mode can be swapped from the WebUI without redeploying.

Duplicated in server_stack/protocol_core/ -- the two services share no code,
only this Samba filesystem and the SQLite file, matching the rest of this
codebase's convention of independent per-service copies of shared logic.
"""
import os
import json
import shutil

try:
    import smbclient
    import smbclient.path as smbclient_path
    _SMB_AVAILABLE = True
except ImportError:
    _SMB_AVAILABLE = False

DB_PATH = os.environ.get("DB_PATH", "/shared_db/protocols.db")
LOCAL_BASE_PATH = os.environ.get("SAMBA_SHARE_PATH", "/samba_shares")
_CONFIG_PATH = os.path.join(os.path.dirname(DB_PATH), "archive_config.json")

_DEFAULT_CONFIG = {
    "mode": "integrated",  # "integrated" | "external"
    "external_path": "",   # UNC path, e.g. //192.168.1.50/Archiv or \\192.168.1.50\Archiv
    "external_username": "",
    "external_password": "",
}
_config = dict(_DEFAULT_CONFIG)
_session_registered_for = None


def _load():
    global _config
    if os.path.exists(_CONFIG_PATH):
        try:
            with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            _config = {**_DEFAULT_CONFIG, **loaded}
        except Exception:
            pass
    _ensure_session()


def get_config():
    return dict(_config)


def save_config(mode, external_path="", external_username="", external_password=""):
    global _config
    _config = {
        "mode": mode if mode in ("integrated", "external") else "integrated",
        "external_path": external_path.strip(),
        "external_username": external_username.strip(),
        "external_password": external_password,
    }
    with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(_config, f, ensure_ascii=False, indent=2)
    _ensure_session(force=True)


def _server_from_unc(unc_path):
    return unc_path.replace("/", "\\").lstrip("\\").split("\\")[0]


def _ensure_session(force=False):
    global _session_registered_for
    if _config["mode"] != "external" or not _SMB_AVAILABLE or not _config["external_path"]:
        return
    server = _server_from_unc(_config["external_path"])
    if not server:
        return
    if force or _session_registered_for != server:
        try:
            smbclient.register_session(
                server, username=_config["external_username"] or None,
                password=_config["external_password"] or None
            )
            _session_registered_for = server
        except Exception as e:
            print(f"[STORAGE] SMB session registration failed for '{server}': {e}")


def test_external_connection(external_path, external_username, external_password):
    """Used by the WebUI's 'Verbindung testen' button -- doesn't change the
    active config, just verifies the given credentials/path work."""
    if not _SMB_AVAILABLE:
        return False, "smbprotocol ist auf diesem Server nicht installiert."
    server = _server_from_unc(external_path)
    if not server:
        return False, "Ungültiger UNC-Pfad (erwartet z.B. //server/freigabe/ordner)."
    try:
        smbclient.register_session(server, username=external_username or None, password=external_password or None)
        unc = external_path.replace("/", "\\")
        smbclient_path.exists(unc)
        return True, "Verbindung erfolgreich."
    except Exception as e:
        return False, f"Verbindung fehlgeschlagen: {e}"


def _backend_ops(config):
    """A small namespace of file operations bound to an ARBITRARY config dict,
    not necessarily the globally active one -- needed to migrate between two
    storage targets (read from one, write to the other) at the same time."""
    use_smb = config["mode"] == "external" and _SMB_AVAILABLE and bool(config.get("external_path"))

    if use_smb:
        server = _server_from_unc(config["external_path"])
        if not server:
            raise ValueError("Ungültiger UNC-Pfad (erwartet z.B. //server/freigabe/ordner).")
        smbclient.register_session(
            server, username=config.get("external_username") or None,
            password=config.get("external_password") or None
        )
        root = config["external_path"].rstrip("/\\").replace("/", "\\")

        return {
            "root": root,
            "exists": smbclient_path.exists,
            "isdir": smbclient_path.isdir,
            "makedirs": lambda p: smbclient.makedirs(p, exist_ok=True),
            "listdir": smbclient.listdir,
            "read": lambda p: smbclient.open_file(p, mode="rb").read(),
            "write": lambda p, data: smbclient.open_file(p, mode="wb").write(data),
            "remove": smbclient.remove,
            "join": lambda base, name: base.rstrip("\\/") + "\\" + name,
        }
    else:
        root = LOCAL_BASE_PATH
        return {
            "root": root,
            "exists": os.path.exists,
            "isdir": os.path.isdir,
            "makedirs": lambda p: os.makedirs(p, exist_ok=True),
            "listdir": os.listdir,
            "read": lambda p: open(p, "rb").read(),
            "write": lambda p, data: open(p, "wb").write(data),
            "remove": os.remove,
            "join": lambda base, name: os.path.join(base, name),
        }


def test_write_access(config):
    """Verifies both reachability and write permission on an arbitrary
    candidate config by creating and then removing a small probe file at its
    root -- used before switching the Archiv-Ziel, per the WebUI's
    check -> migrate -> cleanup flow."""
    try:
        ops = _backend_ops(config)
        ops["makedirs"](ops["root"])
        probe_path = ops["join"](ops["root"], ".maintenance_pro_write_test.tmp")
        ops["write"](probe_path, b"probe")
        ops["remove"](probe_path)
        return True, "Verbindung und Schreibrechte erfolgreich geprüft."
    except Exception as e:
        return False, f"Prüfung fehlgeschlagen: {e}"


def _walk_all_files(ops, path, rel_prefix=""):
    """Yields (relative_posix_path, full_path) for every file under `path`."""
    if not ops["exists"](path):
        return
    for name in ops["listdir"](path):
        child = ops["join"](path, name)
        rel_child = f"{rel_prefix}/{name}" if rel_prefix else name
        if ops["isdir"](child):
            yield from _walk_all_files(ops, child, rel_child)
        else:
            yield rel_child, child


def migrate_active_to(new_config):
    """Copies every file from the CURRENTLY ACTIVE storage target into
    new_config's, preserving relative paths. Does not change the active
    config or touch the source files -- purely a copy."""
    old_ops = _backend_ops(_config)
    new_ops = _backend_ops(new_config)

    copied = 0
    failed = []
    for rel_path, full_old_path in _walk_all_files(old_ops, old_ops["root"]):
        try:
            data = old_ops["read"](full_old_path)
            parts = rel_path.split("/")
            dest_dir = new_ops["root"]
            for part in parts[:-1]:
                dest_dir = new_ops["join"](dest_dir, part)
                new_ops["makedirs"](dest_dir)
            dest_path = new_ops["join"](dest_dir, parts[-1])
            new_ops["write"](dest_path, data)
            copied += 1
        except Exception as e:
            failed.append({"path": rel_path, "error": str(e)})
    return copied, failed


def delete_all_active():
    """Deletes every file under the CURRENTLY ACTIVE storage target -- used
    after a confirmed migration to clean up the old target. Leaves empty
    directories behind (harmless, and directory removal over SMB has more
    edge cases than it's worth here)."""
    ops = _backend_ops(_config)
    removed = 0
    failed = []
    for rel_path, full_path in _walk_all_files(ops, ops["root"]):
        try:
            ops["remove"](full_path)
            removed += 1
        except Exception as e:
            failed.append({"path": rel_path, "error": str(e)})
    return removed, failed


def _use_smb():
    return _config["mode"] == "external" and _SMB_AVAILABLE and bool(_config["external_path"])


def join(base, *parts):
    """Appends more segments onto an already-resolved path (local or UNC),
    using whichever separator that path already uses."""
    sep = "\\" if "\\" in base else "/"
    result = base.rstrip("/\\")
    for p in parts:
        result += sep + str(p).replace("\\", sep).replace("/", sep).strip("/\\")
    return result


def resolve(*parts):
    """Builds a path to hand to the functions below -- a local filesystem path
    when integrated, a UNC path when external."""
    if _use_smb():
        base = _config["external_path"].rstrip("/\\").replace("/", "\\")
        for p in parts:
            base += "\\" + str(p).replace("/", "\\").strip("\\")
        return base
    return os.path.join(LOCAL_BASE_PATH, *[str(p) for p in parts])


def makedirs(path):
    if _use_smb():
        try:
            smbclient.makedirs(path, exist_ok=True)
        except FileExistsError:
            pass
    else:
        os.makedirs(path, exist_ok=True)


def exists(path):
    if _use_smb():
        return smbclient_path.exists(path)
    return os.path.exists(path)


def isdir(path):
    if _use_smb():
        return smbclient_path.isdir(path)
    return os.path.isdir(path)


def open_file(path, mode="rb"):
    if _use_smb():
        return smbclient.open_file(path, mode=mode)
    return open(path, mode)


def read_bytes(path):
    with open_file(path, mode="rb") as f:
        return f.read()


def write_bytes(path, data):
    with open_file(path, mode="wb") as f:
        f.write(data)


def move(src, dst):
    if _use_smb():
        smbclient.rename(src, dst)
    else:
        shutil.move(src, dst)


def remove(path):
    if _use_smb():
        smbclient.remove(path)
    else:
        os.remove(path)


def walk(path):
    if not exists(path):
        return
    if _use_smb():
        for root, dirs, files in smbclient.walk(path):
            yield root, dirs, files
    else:
        for root, dirs, files in os.walk(path):
            yield root, dirs, files


def listdir(path):
    if _use_smb():
        return smbclient.listdir(path)
    return os.listdir(path)


def getsize(path):
    if _use_smb():
        return smbclient_path.getsize(path)
    return os.path.getsize(path)


def relpath(path, start):
    return os.path.relpath(path.replace("\\", "/"), start.replace("\\", "/"))


def dirname(path):
    """os.path.dirname() assumes '/' -- wrong for UNC paths, which this module
    always builds with backslashes."""
    sep = "\\" if "\\" in path else "/"
    return path.rsplit(sep, 1)[0]


_load()
