"""
Esser 8000 ETB binary file parser.
Extracts group numbers, detector counts, and detector types directly from the ETB.
No TXT/CSV/K8M export files required.

Usage:
    python esser_etb_parser.py <file.etb> [--out output.csv]
    python esser_etb_parser.py <file.etb> --list
"""

import struct
import sys
import os
import csv
import json
import re
import argparse

RECORD_MARKER = bytes([0x04, 0x00, 0x00, 0x00, 0x00, 0xFF])
RECORD_MARKER_V2 = bytes([0x04, 0x00, 0xFD, 0x00, 0x00, 0xFF])  # variant used in some Type-A files
RECORD_MARKERS = (RECORD_MARKER, RECORD_MARKER_V2)

VALID_TYPE_CODES = {
    0x0114, 0x0164, 0x0127, 0x0150,
    0x0160, 0x0161, 0x0180, 0x01A0, 0x0119,
}
TYPE_NAMES = {
    0x0114: 'AM',
    0x0164: 'Wärme',
    0x0127: 'DKM',
    0x0150: 'IO',
    0x0160: 'IO',
    0x0161: 'IO',
    0x0180: 'Steu',
    0x01A0: 'MASI',
    0x0119: 'Koppler',
}

_VERSION_RE = re.compile(r'^\d{1,2}\.\d{2}\.\d{3}$')

# Structural anchors at fixed offsets within metadata blocks
META_ANCHOR = b'\xe3\x00\x05\x00'    # Type A (Lisa Halle): anchor at mpos+20
META_ANCHOR_B = b'\xe3\x00\x23\x00'  # Type B (Flugplatz): anchor at mpos+12
META_ANCHOR_C = b'\xe3\x00\x01\x00'  # Type C (VG Eilsleben): anchor at mpos+20


def detect_format(data):
    """
    Detect ETB format variant.
    Returns 'A' (Lisa Halle), 'B' (Flugplatz), or 'C' (VG Eilsleben).

    Primary distinguisher is the metadata anchor byte, not RECORD_MARKER presence
    (RECORD_MARKER can appear incidentally in Type C files).
    """
    if META_ANCHOR in data:    # e3 00 05 00 → Lisa Halle
        return 'A'
    if META_ANCHOR_B in data:  # e3 00 23 00 → Flugplatz
        return 'B'
    if META_ANCHOR_C in data:  # e3 00 01 00 → VG Eilsleben
        return 'C'
    return 'A'  # fallback


def _parse_one_group_record(data, lv_pos):
    """
    Parse a GROUP record (detector list) at len_val position lv_pos.
    Returns (text, subs) where subs = [(bus, sec, type_code), ...], or None.
    """
    n = len(data)
    if lv_pos + 6 > n:
        return None
    lv = struct.unpack_from('<H', data, lv_pos)[0]
    if lv < 4 or lv > 800:
        return None
    if data[lv_pos+2:lv_pos+4] != b'\xfd\x00':
        return None
    tb = lv - 4
    te = lv_pos + 4 + tb
    if te + 6 > n or data[te:te+2] != b'\x00\xff':
        return None
    cnt = struct.unpack_from('<I', data, te+2)[0]
    if cnt < 1 or cnt > 20:
        return None
    subs = []
    for j in range(cnt):
        sp = te + 6 + j * 14
        if sp + 14 > n:
            return None
        typ = struct.unpack_from('<H', data, sp+12)[0]
        if typ not in VALID_TYPE_CODES:
            return None
        bus = struct.unpack_from('<I', data, sp)[0]
        sec = struct.unpack_from('<I', data, sp+4)[0]
        subs.append((bus, sec, typ))
    txt = data[lv_pos+4:te].decode('utf-16-le', errors='replace').rstrip('\x00') if tb > 0 else ''
    return txt, subs


def _read_text_record(data, lv_pos):
    """
    Read text from a text-only record (no count/sub-records expected).
    Returns the text string or None if not a valid text record.
    """
    n = len(data)
    if lv_pos + 6 > n:
        return None
    lv = struct.unpack_from('<H', data, lv_pos)[0]
    if lv < 4 or lv > 800:
        return None
    if data[lv_pos+2:lv_pos+4] != b'\xfd\x00':
        return None
    tb = lv - 4
    te = lv_pos + 4 + tb
    if te + 2 > n or data[te:te+2] != b'\x00\xff':
        return None
    return data[lv_pos+4:te].decode('utf-16-le', errors='replace').rstrip('\x00') if tb > 0 else ''


def find_all_group_records_no_marker(data):
    """
    Scan for GROUP records in ETB files that do NOT use RECORD_MARKER (Type C).
    Returns dict: lv_pos → {'pos': lv_pos, 'text': str, 'subs': list}.
    """
    n = len(data)
    results = {}
    i = 2
    while i < n - 6:
        if data[i:i+2] == b'\xfd\x00':
            result = _parse_one_group_record(data, i - 2)
            if result:
                lv_pos = i - 2
                if lv_pos not in results:
                    txt, subs = result
                    results[lv_pos] = {'pos': lv_pos, 'text': txt, 'subs': subs}
        i += 1
    return results


def find_metadata_blocks_type_c(data, all_f1_set, all_group_recs):
    """
    Type C format (VG Eilsleben): anchor META_ANCHOR_C at mpos+20.
    - Group number at mpos+38 (4 bytes LE).
    - Simple blocks: GROUP record embedded at mpos+140 (len_val position).
    - Complex blocks: group name text at mpos+158, GROUP record matched by
      sec_byte at mpos+78 (must be one of the GROUP record's bus addresses).

    Returns dict: grpnum → {'text': str, 'subs': [(bus, sec, type_code), ...]}.
    """
    n = len(data)
    anchor = META_ANCHOR_C

    # Collect unique metadata blocks
    meta = {}  # mpos → info
    i = 0
    while i < n - 4:
        if data[i:i+4] == anchor:
            mpos = i - 20
            if mpos >= 0 and mpos not in meta:
                f1 = struct.unpack_from('<H', data, mpos)[0]
                if f1 in all_f1_set:
                    grpnum = struct.unpack_from('<I', data, mpos+38)[0]
                    sec_byte = struct.unpack_from('<H', data, mpos+78)[0] if mpos+80 <= n else 0
                    if 1 <= grpnum <= 9999:
                        meta[mpos] = {'f1': f1, 'grpnum': grpnum, 'sec_byte': sec_byte}
        i += 1

    resolved = {}         # grpnum → {'text': str, 'subs': list}
    complex_blocks = []   # blocks without embedded GROUP record
    used_positions = set()

    for mpos, mb in meta.items():
        grpnum = mb['grpnum']
        lv_pos = mpos + 140
        result = _parse_one_group_record(data, lv_pos)
        if result:
            txt, subs = result
            resolved[grpnum] = {'text': txt, 'subs': subs}
            used_positions.add(lv_pos)
        else:
            grp_name = _read_text_record(data, mpos + 158) or ''
            complex_blocks.append({'grpnum': grpnum, 'sec_byte': mb['sec_byte'], 'text': grp_name})

    # Remaining GROUP records not yet assigned
    unused = [g for pos, g in all_group_recs.items() if pos not in used_positions]

    # Pass 1: match by sec_byte containment (sec_byte is one of the GROUP's bus addresses)
    unmatched = []
    for cb in complex_blocks:
        matched = None
        for g in unused:
            if cb['sec_byte'] in {bus for bus, sec, typ in g['subs']}:
                matched = g
                break
        if matched:
            resolved[cb['grpnum']] = {'text': cb['text'], 'subs': matched['subs']}
            unused.remove(matched)
        else:
            unmatched.append(cb)

    # Pass 2: process of elimination for remaining unmatched pairs
    for cb, g in zip(unmatched, unused):
        resolved[cb['grpnum']] = {'text': cb['text'], 'subs': g['subs']}

    return resolved


def find_metadata_blocks_type_b(data, all_f1_set, group_records):
    """
    Type B format (Flugplatz): identified by META_ANCHOR_B zone blocks.

    Two metadata block types:
    - e3 00 04 00 at mpos+20: grpnum at mpos+42, GROUP record at mpos+178.
      If no GROUP at mpos+178, link via bus_hint at mpos+150 (prefer highest count match).
    - e3 00 10 00 at mpos+12: logic group, grpnum at mpos+38, text from
      RECORD_MARKER at mpos+88, no detector sub-records.

    Returns (resolved dict, used_gpos set).
    resolved: grpnum → {'text': str, 'subs': [(bus, sec, type_code), ...]}.
    """
    n = len(data)
    ANCHOR_04 = b'\xe3\x00\x04\x00'  # at mpos+20, grpnum at mpos+42, GROUP at mpos+178
    ANCHOR_10 = b'\xe3\x00\x10\x00'  # at mpos+12, grpnum at mpos+38, logic group

    def _get_subs(rec):
        subs = []
        for j in range(rec['count']):
            sp = rec['sub_start'] + j * 14
            if sp + 14 > n:
                break
            bus = struct.unpack_from('<I', data, sp)[0]
            sec = struct.unpack_from('<I', data, sp + 4)[0]
            tc = struct.unpack_from('<H', data, sp + 12)[0]
            subs.append((bus, sec, tc))
        return subs

    # bus_addr → list of gpos for secondary matching
    bus_to_gpos = {}
    for gpos, rec in group_records.items():
        for bus, sec, tc in _get_subs(rec):
            bus_to_gpos.setdefault(bus, []).append(gpos)

    resolved = {}
    used_gpos = set()
    pending = []  # (grpnum, mpos, bus_hint) for blocks without embedded GROUP

    # Pass 1: e3 00 04 00 blocks — standard Meldegruppen
    idx = 0
    while True:
        idx = data.find(ANCHOR_04, idx)
        if idx < 0:
            break
        mpos = idx - 20
        if mpos < 0:
            idx += 1
            continue
        f1 = struct.unpack_from('<I', data, mpos)[0]
        if f1 not in all_f1_set:
            idx += 1
            continue
        grpnum = struct.unpack_from('<I', data, mpos + 42)[0] if mpos + 46 <= n else 0
        if not (1 <= grpnum <= 9999) or grpnum in resolved:
            idx += 1
            continue

        gpos = mpos + 178
        if gpos in group_records:
            rec = group_records[gpos]
            resolved[grpnum] = {'text': rec['text'], 'subs': _get_subs(rec)}
            used_gpos.add(gpos)
        else:
            # No embedded GROUP; save bus_hint at mpos+150 for secondary matching
            bus_hint = struct.unpack_from('<I', data, mpos + 150)[0] if mpos + 154 <= n else 0
            pending.append((grpnum, mpos, bus_hint))
        idx += 1

    # Pass 2: resolve pending blocks via bus_hint — prefer GROUP with most sub-records
    for grpnum, mpos, bus_hint in pending:
        if grpnum in resolved:
            continue
        candidates = [g for g in bus_to_gpos.get(bus_hint, []) if g not in used_gpos]
        if not candidates:
            continue
        best = max(candidates, key=lambda g: group_records[g]['count'])
        rec = group_records[best]
        resolved[grpnum] = {'text': rec['text'], 'subs': _get_subs(rec)}
        used_gpos.add(best)

    # Pass 3: e3 00 10 00 blocks — logic groups (no physical detectors).
    # Group names come from count=0 GROUP records (e.g. "Fireray"), matched
    # sequentially by file position.  Fall back to the text at mpos+88 when no
    # such records exist.
    zero_name_recs = []
    j = 0
    while j < n - 6:
        if data[j:j + 6] in RECORD_MARKERS:
            lv = struct.unpack_from('<H', data, j + 6)[0]
            if 4 <= lv <= 800 and data[j + 8:j + 10] == b'\xfd\x00':
                tb = lv - 4
                ts = j + 10
                te = ts + tb
                if te + 6 <= n and data[te:te + 2] == b'\x00\xff':
                    cnt = struct.unpack_from('<I', data, te + 2)[0]
                    if cnt == 0:
                        try:
                            t = data[ts:te].decode('utf-16-le').rstrip('\x00')
                            if t:
                                zero_name_recs.append((j, t))
                        except UnicodeDecodeError:
                            pass
        j += 1

    b2_blocks = []
    idx = 0
    while True:
        idx = data.find(ANCHOR_10, idx)
        if idx < 0:
            break
        mpos = idx - 12
        if mpos < 0:
            idx += 1
            continue
        f1 = struct.unpack_from('<I', data, mpos)[0]
        if f1 not in all_f1_set:
            idx += 1
            continue
        grpnum = struct.unpack_from('<I', data, mpos + 38)[0] if mpos + 42 <= n else 0
        if not (1 <= grpnum <= 9999) or grpnum in resolved:
            idx += 1
            continue

        text_fallback = ''
        text_rec = mpos + 88
        if text_rec + 6 <= n and data[text_rec:text_rec + 6] in RECORD_MARKERS:
            lv_pos = text_rec + 6
            lv = struct.unpack_from('<H', data, lv_pos)[0]
            if 4 <= lv <= 800 and data[lv_pos + 2:lv_pos + 4] == b'\xfd\x00':
                tb = lv - 4
                te = lv_pos + 4 + tb
                if te + 2 <= n and data[te:te + 2] == b'\x00\xff' and tb > 0:
                    text_fallback = data[lv_pos + 4:te].decode('utf-16-le', errors='replace').rstrip('\x00')

        b2_blocks.append((mpos, grpnum, text_fallback))
        idx += 1

    b2_blocks.sort(key=lambda x: x[0])
    zero_name_recs.sort(key=lambda x: x[0])
    for i, (mpos, grpnum, text_fallback) in enumerate(b2_blocks):
        text = zero_name_recs[i][1] if i < len(zero_name_recs) else text_fallback
        resolved[grpnum] = {'text': text, 'subs': []}

    return resolved, used_gpos


def find_all_records(data):
    """Scan data for all records matching the Esser record format."""
    records = []
    i = 0
    n = len(data)
    while i < n - 6:
        if data[i:i+6] not in RECORD_MARKERS:
            i += 1
            continue
        off = i + 6
        len_val = int.from_bytes(data[off:off+2], 'little')
        if len_val < 4 or len_val > 800:
            i += 1
            continue
        if data[off+2:off+4] != b'\xfd\x00':
            i += 1
            continue
        text_len = len_val - 4
        text_start = off + 4
        text_end = text_start + text_len
        if text_end + 2 > n or data[text_end:text_end+2] != b'\x00\xff':
            i += 1
            continue
        try:
            text = data[text_start:text_end].decode('utf-16-le').rstrip('\x00')
        except UnicodeDecodeError:
            i += 1
            continue
        count = int.from_bytes(data[text_end+2:text_end+6], 'little')
        sub_start = text_end + 6

        # Classify as GROUP record: has valid 14-byte detector sub-records
        is_group = False
        if 0 < count <= 100 and sub_start + 14 <= n:
            zeros = data[sub_start+8:sub_start+12]
            tc = int.from_bytes(data[sub_start+12:sub_start+14], 'little')
            if zeros == bytes(4) and tc in VALID_TYPE_CODES:
                is_group = True

        records.append({
            'pos': i,
            'text': text,
            'count': count,
            'is_group': is_group,
            'sub_start': sub_start,
        })
        i += 1
    return records


def find_project_name(data):
    """
    Auto-detect the project name by locating the root record.
    The root record structure: [fd 00][text UTF-16-LE][00 ff][count 4b][31 32 33 00 ff][n_groups 4b]
    We search for the separator "31 32 33 00 ff" and read the text backwards.
    """
    SEP = b'\x31\x32\x33\x00\xff'
    idx = 0
    candidates = []

    while True:
        idx = data.find(SEP, idx)
        if idx < 0:
            break

        # Validate: n_groups at idx+5 should be reasonable (1–999)
        n = int.from_bytes(data[idx+5:idx+9], 'little')
        if not (1 <= n <= 999):
            idx += 1
            continue

        # count (4b) is right before SEP; text ends with 00 ff 2 bytes before count
        count_pos = idx - 4
        if count_pos < 6:
            idx += 1
            continue
        text_end_pos = count_pos - 2  # position of "00 ff"
        if data[text_end_pos:text_end_pos+2] != b'\x00\xff':
            idx += 1
            continue

        # len_val is 2 bytes before "fd 00" which is 2 bytes before the text start
        # text_end_pos is after the text, text_start = text_end_pos - text_len
        # We need to find "fd 00" which precedes the text; len_val precedes "fd 00"
        # Scan backwards from text_end_pos to find a plausible len_val
        # len_val = text_len + 4; text_len must be even (UTF-16-LE)
        found_text = None
        for text_len in range(2, 160, 2):
            text_start = text_end_pos - text_len
            if text_start < 4:
                break
            if data[text_start-2:text_start] != b'\xfd\x00':
                continue
            len_val_pos = text_start - 4
            len_val = int.from_bytes(data[len_val_pos:len_val_pos+2], 'little')
            if len_val != text_len + 4:
                continue
            try:
                text = data[text_start:text_end_pos].decode('utf-16-le').rstrip('\x00')
                if text:
                    found_text = text
                    break
            except UnicodeDecodeError:
                continue

        if found_text:
            candidates.append((n, found_text))

        idx += 1

    if not candidates:
        return None
    # Return the text from the root record with the most groups
    candidates.sort(reverse=True)
    return candidates[0][1]


def find_all_root_records(data):
    """
    Scan the entire ETB for all valid root records.
    Handles both single-panel and multi-panel (EsserNet) files.

    Returns list of dicts (one per unique project name, best copy selected):
        {'name': str, 'sep': int, 'entries': [(f1, f3), ...]}

    Entries with f1=0 are filtered out (empty slots in EsserNet tables).
    The list is ordered by sep position (file order).
    """
    SEP = b'\x31\x32\x33\x00\xff'
    n = len(data)
    best = {}  # name → record with most non-zero f1 entries

    idx = 0
    while True:
        idx = data.find(SEP, idx)
        if idx < 0:
            break
        n_pos = idx + 5
        n_val = struct.unpack_from('<I', data, n_pos)[0]
        if not (1 <= n_val <= 999):
            idx += 1
            continue
        count_pos = idx - 4
        text_end_pos = count_pos - 2
        if text_end_pos < 0 or data[text_end_pos:text_end_pos + 2] != b'\x00\xff':
            idx += 1
            continue
        name = None
        for text_len in range(2, 200, 2):
            text_start = text_end_pos - text_len
            if text_start < 4:
                break
            if data[text_start - 2:text_start] != b'\xfd\x00':
                continue
            lv = struct.unpack_from('<H', data, text_start - 4)[0]
            if lv != text_len + 4:
                continue
            try:
                name = data[text_start:text_end_pos].decode('utf-16-le').rstrip('\x00')
                break
            except UnicodeDecodeError:
                continue
        if not name:
            idx += 1
            continue
        entries_start = n_pos + 4
        entries = []
        for i in range(n_val):
            p = entries_start + i * 14
            if p + 14 > n:
                break
            f1 = struct.unpack_from('<I', data, p)[0]
            f3 = struct.unpack_from('<I', data, p + 4)[0]
            if f1 != 0:
                entries.append((f1, f3))
        nonzero = len(entries)
        if nonzero == 0:
            idx += 1
            continue
        cur = best.get(name)
        if cur is None or nonzero > cur['nonzero']:
            best[name] = {'name': name, 'sep': idx, 'entries': entries, 'nonzero': nonzero}
        idx += 1

    return sorted(best.values(), key=lambda r: r['sep'])


def parse_root_pointer_table(data, project_name):
    """Legacy wrapper — returns (f1, f3) entries for the named project."""
    records = find_all_root_records(data)
    for r in records:
        if r['name'] == project_name:
            return r['entries']
    # Fallback: return entries from the record with the most groups
    if records:
        return max(records, key=lambda r: r['nonzero'])['entries']
    return []


def find_metadata_blocks(data, all_f1_set, group_pos_set):
    """
    Scan for group metadata blocks using the structural anchor at offset 20.
    Only returns blocks where a valid GROUP record exists at mpos+182 or mpos+180.
    Returns dict: grpnum → GROUP_pos.
    """
    results = {}  # grpnum → gpos
    idx = 0

    while True:
        idx = data.find(META_ANCHOR, idx)
        if idx < 0:
            break

        mpos = idx - 20
        if mpos < 0:
            idx += 1
            continue

        # f1 at mpos must be a known root entry handle
        f1 = int.from_bytes(data[mpos:mpos+4], 'little')
        if f1 not in all_f1_set:
            idx += 1
            continue

        # grpnum at offset 42 must be in [1, 9999]
        grpnum = int.from_bytes(data[mpos+42:mpos+46], 'little')
        if not (1 <= grpnum <= 9999):
            idx += 1
            continue

        # GROUP record must exist at mpos+182 or mpos+180
        gpos = None
        for offset in (182, 180):
            candidate = mpos + offset
            if candidate in group_pos_set:
                gpos = candidate
                break

        if gpos is None:
            idx += 1
            continue

        # Keep the first found (file-order scan finds nearest block first)
        if grpnum not in results:
            results[grpnum] = gpos

        idx += 1

    return results


def find_nonstandard_groups(data, all_f1_set, group_records, already_resolved_gpos,
                            skip_pass_d=False):
    """
    Resolve non-standard groups whose GROUP records are not at mpos+182/180.
    These have data[mpos+64:mpos+68] == f1+1 (val64 signature).

    Matching strategy (in order of priority):
    Pass A: val64 appears as bus_addr in a GROUP record (EsserNet panels)
    Pass B: f1 appears as sec_addr in a GROUP record (fallback for pass A)
    Pass C: sec_byte at mpos+78 appears as bus_addr or sec_addr (single-loop panels)
    Pass D: process of elimination for remaining unmatched pairs

    Returns dict: grpnum → GROUP_pos.
    """
    n = len(data)

    # Collect non-standard metadata blocks: val64 = f1+1
    non_std = {}  # grpnum → (mpos, f1, val64, sec_byte)
    idx = 0
    while True:
        idx = data.find(META_ANCHOR, idx)
        if idx < 0:
            break
        mpos = idx - 20
        if mpos < 0:
            idx += 1
            continue
        f1 = int.from_bytes(data[mpos:mpos+4], 'little')
        if f1 not in all_f1_set:
            idx += 1
            continue
        grpnum = int.from_bytes(data[mpos+42:mpos+46], 'little')
        if not (1 <= grpnum <= 9999):
            idx += 1
            continue
        val64 = int.from_bytes(data[mpos+64:mpos+68], 'little')
        if val64 == f1 + 1:
            sec_byte = int.from_bytes(data[mpos+78:mpos+80], 'little') if mpos + 80 <= n else 0
            non_std[grpnum] = (mpos, f1, val64, sec_byte)
        idx += 1

    # Remove groups already resolved via standard method
    for gpos in already_resolved_gpos:
        for grpnum, info in list(non_std.items()):
            mpos = info[0]
            if mpos + 182 == gpos or mpos + 180 == gpos:
                del non_std[grpnum]

    if not non_std:
        return {}

    val64_to_grpnum = {info[2]: g for g, info in non_std.items()}
    f1_to_grpnum_ns = {info[1]: g for g, info in non_std.items()}
    sec_byte_to_grpnum = {info[3]: g for g, info in non_std.items() if info[3]}

    # Scan GROUP records not already resolved for matches
    gpos_to_matches = {}
    for gpos, rec in group_records.items():
        if gpos in already_resolved_gpos:
            continue
        count = rec['count']
        sub_start = rec['sub_start']
        matches = []
        for i in range(count):
            sp = sub_start + i * 14
            bus = int.from_bytes(data[sp:sp+4], 'little')
            sec = int.from_bytes(data[sp+4:sp+8], 'little')
            if bus in val64_to_grpnum:
                matches.append((val64_to_grpnum[bus], 'val64_bus'))
            if sec in f1_to_grpnum_ns:
                matches.append((f1_to_grpnum_ns[sec], 'f1_sec'))
            if bus in sec_byte_to_grpnum:
                matches.append((sec_byte_to_grpnum[bus], 'sec_byte'))
            if sec in sec_byte_to_grpnum:
                matches.append((sec_byte_to_grpnum[sec], 'sec_byte'))
        if matches:
            gpos_to_matches[gpos] = matches

    result = {}  # grpnum → gpos

    # Iterative resolution: keep assigning until stable
    changed = True
    while changed:
        changed = False

        # Pass A: val64_bus matches (EsserNet style)
        for gpos, matches in gpos_to_matches.items():
            if any(r == gpos for r in result.values()):
                continue
            bus_matches = [m[0] for m in matches if m[1] == 'val64_bus' and m[0] not in result]
            unique_bus = list(dict.fromkeys(bus_matches))
            if len(unique_bus) == 1:
                result[unique_bus[0]] = gpos
                changed = True

        # Pass B: f1_sec matches (no val64_bus match in this record)
        for gpos, matches in gpos_to_matches.items():
            if any(r == gpos for r in result.values()):
                continue
            has_bus = any(m[1] == 'val64_bus' for m in matches)
            if has_bus:
                continue
            sec_matches = [m[0] for m in matches if m[1] == 'f1_sec' and m[0] not in result]
            unique_sec = list(dict.fromkeys(sec_matches))
            if len(unique_sec) == 1:
                result[unique_sec[0]] = gpos
                changed = True

        # Pass C: sec_byte matches (single-loop panels where bus=0)
        for gpos, matches in gpos_to_matches.items():
            if any(r == gpos for r in result.values()):
                continue
            has_bus = any(m[1] in ('val64_bus', 'f1_sec') for m in matches)
            if has_bus:
                continue
            sb_matches = [m[0] for m in matches if m[1] == 'sec_byte' and m[0] not in result]
            unique_sb = list(dict.fromkeys(sb_matches))
            if len(unique_sb) == 1:
                result[unique_sb[0]] = gpos
                changed = True

    # Pass D: process of elimination — disabled for multi-panel to avoid cross-Anlage matches
    if not skip_pass_d:
        unmatched_grpnums = [g for g in non_std if g not in result]
        unmatched_gpos = [gpos for gpos in group_records
                          if gpos not in already_resolved_gpos and gpos not in result.values()]
        for grpnum, gpos in zip(unmatched_grpnums, unmatched_gpos):
            result[grpnum] = gpos

    return result




def find_panel_topology(data, panel_sep, next_sep, panel_f1_set, all_resolved_grpnums):
    """
    Extract hardware topology for one Type-A panel.

    panel_sep:              file position of this panel's root SEP marker
    next_sep:               file position of the next panel's root SEP, or len(data)
    panel_f1_set:           f1 handles from this panel's detection-group root table
    all_resolved_grpnums:   grpnums resolved as detection groups across ALL panels

    Returns {'version': str|None, 'modules': [{'slot': int, 'type': str}, ...]}

    Version is the panel software version string (e.g. '3.12.001').
    Modules are hardware ring/bus cards: metadata blocks in this panel's file region
    with val64==f1+1 (Esserbus Plus) whose grpnum was not resolved as any detection
    group. EsserNet cards are not reported here (they map to resolved detection groups).
    """
    n = len(data)
    version = None

    # Scan up to 4 KB after the panel SEP for a version text record
    win_end = min(panel_sep + 4096, next_sep, n)
    pos = panel_sep
    while pos < win_end - 4:
        if data[pos:pos+2] == b'\xfd\x00':
            lv_pos = pos - 2
            if lv_pos >= 0:
                lv = struct.unpack_from('<H', data, lv_pos)[0]
                if 12 <= lv <= 28:
                    tb = lv - 4
                    if tb > 0 and tb % 2 == 0:
                        te = lv_pos + 4 + tb
                        if te + 2 <= n and data[te:te+2] == b'\x00\xff':
                            try:
                                txt = data[lv_pos+4:te].decode('utf-16-le').rstrip('\x00')
                                if _VERSION_RE.match(txt):
                                    version = txt
                                    break
                            except UnicodeDecodeError:
                                pass
        pos += 1

    # Scan panel file region for Esserbus Plus hardware ring cards.
    # These are val64==f1+1 metadata blocks that were not resolved as any
    # detection group, meaning they carry no detector GROUP record of their own.
    modules = []
    seen_slots = set()
    region_end = min(next_sep, n)
    idx = panel_sep
    while idx < region_end:
        anchor_pos = data.find(META_ANCHOR, idx, region_end)
        if anchor_pos < 0:
            break
        mpos = anchor_pos - 20
        if mpos >= 0 and mpos + 68 <= n:
            f1 = struct.unpack_from('<I', data, mpos)[0]
            grpnum = struct.unpack_from('<I', data, mpos+42)[0]
            val64 = struct.unpack_from('<I', data, mpos+64)[0]
            if (f1 != 0
                    and f1 not in panel_f1_set
                    and 100 <= grpnum <= 500
                    and grpnum not in seen_slots
                    and grpnum not in all_resolved_grpnums
                    and val64 == f1 + 1):
                modules.append({'slot': grpnum, 'type': 'Esserbus Plus'})
                seen_slots.add(grpnum)
        idx = anchor_pos + 1

    modules.sort(key=lambda m: m['slot'])
    return {'version': version, 'modules': modules}


def extract_detectors(data, group_rec):
    """Extract detector info from a GROUP record's sub-records."""
    detectors = []
    count = group_rec['count']
    sub_start = group_rec['sub_start']
    for i in range(count):
        sp = sub_start + i * 14
        if sp + 14 > len(data):
            break
        bus_addr = int.from_bytes(data[sp:sp+4], 'little')
        sec_addr = int.from_bytes(data[sp+4:sp+8], 'little')
        zeros = data[sp+8:sp+12]
        tc = int.from_bytes(data[sp+12:sp+14], 'little')
        if zeros != bytes(4) or tc not in VALID_TYPE_CODES:
            continue
        detectors.append({
            'bus_addr': bus_addr,
            'sec_addr': sec_addr,
            'type_code': tc,
            'type_name': TYPE_NAMES.get(tc, f'0x{tc:04x}'),
        })
    return detectors


def _build_group_dict(grpnum, text, detectors, unresolved=False):
    return {
        'grpnum': grpnum,
        'text': text,
        'detectors': detectors,
        'det_count': len(detectors),
        'unresolved': unresolved,
    }


def _dets_from_subs(subs):
    return [
        {'bus_addr': b, 'sec_addr': s, 'type_code': t,
         'type_name': TYPE_NAMES.get(t, f'0x{t:04x}')}
        for b, s, t in subs
    ]


def parse_etb_all(filepath):
    """
    Parse a single- or multi-panel Esser 8000 ETB file.

    Returns list of dicts, one per Anlage (control panel):
        {'name': str, 'groups': [group_dict, ...]}

    For single-panel files the list has exactly one element.
    Groups within each Anlage are sorted by grpnum; unresolved entries follow.
    """
    with open(filepath, 'rb') as f:
        data = f.read()

    root_records = find_all_root_records(data)
    if not root_records:
        raise ValueError("Keine gültigen Root-Records in ETB-Datei gefunden.")

    fmt = detect_format(data)
    multi = len(root_records) > 1

    # For Type A/B: scan ALL GROUP records once, share across Anlagen
    if fmt in ('A', 'B'):
        all_records = find_all_records(data)
        group_records = {r['pos']: r for r in all_records if r['is_group']}
        group_pos_set = set(group_records.keys())

    # Panel region boundaries for topology extraction (Type A only)
    sep_positions = [r['sep'] for r in root_records] + [len(data)]

    global_used_gpos = set()
    result = []

    for idx_r, root in enumerate(root_records):
        name = root['name']
        all_f1_set = {f1 for f1, f3 in root['entries']}

        if fmt == 'C':
            all_group_recs = find_all_group_records_no_marker(data)
            type_c = find_metadata_blocks_type_c(data, all_f1_set, all_group_recs)
            used_pos = set()
            groups = []
            for grpnum, info in type_c.items():
                groups.append(_build_group_dict(grpnum, info['text'], _dets_from_subs(info['subs'])))
                for lp, grec in all_group_recs.items():
                    if grec['subs'] == info['subs']:
                        used_pos.add(lp)
                        break
            for lp, grec in all_group_recs.items():
                if lp not in used_pos:
                    groups.append(_build_group_dict(None, grec['text'], _dets_from_subs(grec['subs']), True))
            result.append({'name': name, 'groups': _sort_groups(groups)})
            break  # Type C is always single-panel

        elif fmt == 'B':
            type_b, used_gpos = find_metadata_blocks_type_b(data, all_f1_set, group_records)
            groups = []
            for grpnum, info in type_b.items():
                groups.append(_build_group_dict(grpnum, info['text'], _dets_from_subs(info['subs'])))
            for gpos, rec in group_records.items():
                if gpos not in used_gpos:
                    groups.append(_build_group_dict(None, rec['text'], extract_detectors(data, rec), True))
            result.append({'name': name, 'groups': _sort_groups(groups)})
            break  # Type B is always single-panel

        else:
            # Type A — standard metadata + non-standard resolution
            grpnum_to_gpos = find_metadata_blocks(data, all_f1_set, group_pos_set)
            already = set(grpnum_to_gpos.values()) | global_used_gpos
            ns = find_nonstandard_groups(
                data, all_f1_set, group_records, already,
                skip_pass_d=True,
            )
            grpnum_to_gpos.update(ns)
            global_used_gpos.update(grpnum_to_gpos.values())

            groups = []
            for grpnum, gpos in grpnum_to_gpos.items():
                rec = group_records[gpos]
                groups.append(_build_group_dict(grpnum, rec['text'], extract_detectors(data, rec)))

            if not multi:
                for gpos, rec in group_records.items():
                    if gpos not in global_used_gpos:
                        groups.append(_build_group_dict(None, rec['text'], extract_detectors(data, rec), True))

            result.append({'name': name, 'groups': _sort_groups(groups)})

    # For Type A: add topology after the main loop so all_resolved_grpnums is complete
    if fmt == 'A':
        all_resolved_grpnums = {
            g['grpnum'] for a in result for g in a['groups'] if g['grpnum'] is not None
        }
        for idx_r, (root, anlage) in enumerate(zip(root_records, result)):
            f1_set = {f1 for f1, f3 in root['entries']}
            topology = find_panel_topology(
                data, root['sep'], sep_positions[idx_r + 1], f1_set, all_resolved_grpnums)
            anlage['topology'] = topology

    return result


def _sort_groups(groups):
    return sorted(groups, key=lambda g: (g['grpnum'] is None, g['grpnum'] or 0))


def parse_etb(filepath, project_name=None):
    """
    Parse a single-panel ETB file. Returns (groups, project_name).
    For multi-panel files, returns the Anlage matching project_name,
    or the one with the most resolved groups if project_name is None.
    """
    all_anlagen = parse_etb_all(filepath)
    if not all_anlagen:
        raise ValueError("Keine Gruppen gefunden.")
    if project_name:
        for a in all_anlagen:
            if a['name'] == project_name:
                return a['groups'], a['name']
    # Pick the Anlage with the most resolved groups
    best = max(all_anlagen, key=lambda a: sum(1 for g in a['groups'] if not g['unresolved']))
    return best['groups'], best['name']


def format_summary(groups, project_name, topology=None):
    lines = [f"Project: {project_name}"]
    if topology:
        ver = topology.get('version')
        if ver:
            lines.append(f"  Softwareversion: {ver}")
        mods = topology.get('modules', [])
        if mods:
            lines.append("  Hardware-Module:")
            for m in mods:
                lines.append(f"    Slot {m['slot']:>3}: {m['type']}")
    resolved = [g for g in groups if not g['unresolved']]
    unresolved = [g for g in groups if g['unresolved']]
    lines.append(f"Resolved groups: {len(resolved)}, Unresolved: {len(unresolved)}")
    lines.append("")

    lines.append(f"{'Gruppe':>6}  {'Melder':>6}  {'Typen':<40}  {'Text'}")
    lines.append("-" * 80)
    for g in groups:
        gn = str(g['grpnum']) if g['grpnum'] is not None else "???"
        types = ', '.join(d['type_name'] for d in g['detectors']) if g['detectors'] else '—'
        cnt = g['det_count']
        text = g['text'] or ''
        lines.append(f"{gn:>6}  {cnt:>6}  {types:<40}  {text}")
    return '\n'.join(lines)


def write_csv(groups, project_name, outpath):
    with open(outpath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f, delimiter=';')
        writer.writerow(['Gruppe', 'Gruppentext', 'Melder_Nr', 'Meldertyp', 'Bus', 'Sec'])
        for g in groups:
            gn = g['grpnum'] if g['grpnum'] is not None else ''
            if not g['detectors']:
                writer.writerow([gn, g['text'], '', '', '', ''])
            else:
                for i, d in enumerate(g['detectors'], 1):
                    writer.writerow([gn, g['text'], i, d['type_name'], d['bus_addr'], d['sec_addr']])


def _groups_to_json(groups):
    out = []
    for g in groups:
        melder = [{'nr': i + 1, 'typ': d['type_name']} for i, d in enumerate(g['detectors'])]
        out.append({
            'gruppe': g['grpnum'],
            'name': g['text'],
            'melder': melder,
            'unresolved': g['unresolved'],
        })
    return out


def to_json(all_anlagen):
    """Serialize parse_etb_all result to a JSON-serialisable dict."""
    def _a(a):
        d = {'anlage': a['name'], 'gruppen': _groups_to_json(a['groups'])}
        t = a.get('topology')
        if t:
            d['version'] = t.get('version')
            d['module'] = t.get('modules', [])
        return d

    if len(all_anlagen) == 1:
        return _a(all_anlagen[0])
    return {'anlagen': [_a(a) for a in all_anlagen]}


def main():
    parser = argparse.ArgumentParser(description='Parse Esser 8000 ETB binary files')
    parser.add_argument('etb', help='ETB file path')
    parser.add_argument('--name', help='Specific Anlage name (for --list/--out on multi-panel files)')
    parser.add_argument('--out', help='Output CSV file path')
    parser.add_argument('--json', action='store_true', help='Print JSON to stdout')
    parser.add_argument('--json-out', help='Write JSON to file')
    parser.add_argument('--list', action='store_true', help='Print summary to stdout')
    args = parser.parse_args()

    try:
        all_anlagen = parse_etb_all(args.etb)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    if args.json or args.json_out:
        payload = to_json(all_anlagen)
        json_str = json.dumps(payload, ensure_ascii=False, indent=2)
        if args.json:
            print(json_str)
        if args.json_out:
            with open(args.json_out, 'w', encoding='utf-8') as f:
                f.write(json_str)
            print(f"JSON written to {args.json_out}", file=sys.stderr)

    if args.out or args.list or not (args.json or args.json_out):
        # For text/CSV output: use single Anlage (--name selects, else pick largest)
        if args.name:
            selected = next((a for a in all_anlagen if a['name'] == args.name), None)
            if not selected:
                print(f"Error: Anlage '{args.name}' not found.", file=sys.stderr)
                sys.exit(1)
            display = [selected]
        else:
            display = all_anlagen

        for anlage in display:
            groups, name = anlage['groups'], anlage['name']
            topology = anlage.get('topology')
            if args.out:
                write_csv(groups, name, args.out)
                print(f"Written to {args.out}", file=sys.stderr)
            if args.list or not args.out:
                print(format_summary(groups, name, topology))


if __name__ == '__main__':
    main()
