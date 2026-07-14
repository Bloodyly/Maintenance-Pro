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
import bisect
from collections import Counter

RECORD_MARKER = bytes([0x04, 0x00, 0x00, 0x00, 0x00, 0xFF])
RECORD_MARKER_V2 = bytes([0x04, 0x00, 0xFD, 0x00, 0x00, 0xFF])  # variant used in some Type-A files
RECORD_MARKERS = (RECORD_MARKER, RECORD_MARKER_V2)

VALID_TYPE_CODES = {
    0x0114, 0x0164, 0x0127, 0x0150,
    0x0160, 0x0161, 0x0180, 0x01A0, 0x0119,
}
TYPE_NAMES = {
    # 0x0114 vs 0x0164 does NOT encode detector technology (optical vs
    # thermal) — validated against a real installation's "Alle Teilnehmer"
    # ring export: a group with 2 genuine TDiff heat detectors mixed among
    # optical ones showed the two codes scattered with no clean split by
    # technology. The best-supported hypothesis is "ohne/mit eingebautem
    # Signalgeber" (plain vs sounder-base variant), but even that wasn't
    # 100% clean, and Esser's own detailed hardware type (O2T, O2T/So,
    # TDIFF, ...) isn't stored in the ETB project file at all — only in the
    # panel's live hardware inventory. Per user decision: since true thermal
    # (TDiff/Tmax) detectors are the rare exception and everything else
    # ("O", "O2T", "O2T/So", "OT/So", "O/F", "O/SoF", etc.) counts as
    # "Automatischer Melder" (AM) for Auslöselisten purposes, both codes
    # default to that label rather than risk mislabeling an optical
    # detector as thermal.
    0x0114: 'AM',
    0x0164: 'AM',
    0x0127: 'DKM',
    0x0150: 'IO',
    0x0160: 'IO',
    0x0161: 'IO',
    0x0180: 'Steu',
    0x01A0: 'MASI',
    0x0119: 'Koppler',
}

# Gruppenart (group category), read from the metadata block at mpos+54.
# This is independent of the individual detector hardware type codes above:
# e.g. a TAL group's inputs are wired via the same DKM-style module as a real
# manual call point, but the group's role is "technischer Alarm", not "Melder".
# Codes confirmed against several real ETB files (Sek Arendsee, APH am Dom
# Halberstadt, Lisa Halle, zast, Kanzlei Seumestrasse).
GROUP_CATEGORY_NAMES = {
    1: 'Automatische Melder',
    2: 'Nichtautomatische Melder',
    3: 'Koppler',
    4: 'Signalgeber',
    8: 'TAL',
    # Synthetic codes derived from the zone object's class rather than the
    # Gruppenart byte (which only exists for analog zones):
    100: 'Konventionell',
    101: 'Störung',
}

# Categories that are not physical fire detectors and can be hidden from
# Auslöselisten (trigger/alarm lists).
NON_DETECTOR_CATEGORIES = {3, 4, 8, 101}

CATEGORY_KONVENTIONELL = 100
CATEGORY_STOERUNG = 101

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


def _zone_embedded_text(data, mpos, span=220):
    """
    First non-empty text record (len | fd 00 | UTF-16 | 00 ff) inside the
    object region starting at mpos, e.g. at mpos+192 in Type A zone objects.
    Empty text records (a zero-length field can precede the designation) are
    skipped. Scanned rather than hardcoded so layout shifts between
    generations self-calibrate like the record offsets do.
    """
    n = len(data)
    for off in range(0, span, 2):
        pos = mpos + off
        if pos + 4 > n:
            break
        if data[pos+2:pos+4] == b'\xfd\x00':
            txt = _read_text_record(data, pos)
            if txt:
                return txt
    return ''


def _zone_text(data, mpos, base):
    """
    Designation text of a zone that has no detector record (conventional /
    Störung zones). It sits either embedded in the zone object itself or —
    when the zone's object pointer at mpos+4 is set — in the pointed object
    (seen on class 0x01af conventional zones).
    """
    txt = _zone_embedded_text(data, mpos)
    if txt:
        return txt
    if mpos + ZONE_PTR_OFF + 4 <= len(data):
        ptr = struct.unpack_from('<I', data, mpos + ZONE_PTR_OFF)[0]
        if ptr:
            return _zone_embedded_text(data, ptr * OID_SLOT + base)
    return ''


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


def find_metadata_blocks_type_c2(data, f1_to_f3, all_group_recs, root_entries=()):
    """
    Oldest known Type-C sub-variant (written natively by Tools 1.16 / 2010,
    e.g. classic 8000 panels): zone anchor e3 00 02 00 at mpos+20, grpnum at
    mpos+38, and the zone's own sequence number at mpos+14 which must equal
    the root table's f3 for the f1 handle at mpos+0 — that check is what
    makes the detection safe. Zones with an embedded detector record at
    mpos+158 are resolved; detached records in this generation carry no
    owner link at all (validated via controlled 1.16 save-diffs), so the
    remaining zones are reported number-only (detectors unknown).

    Conventional (Grenzwert) zones use anchor e6 00 02 00 with the same
    header layout; they have no analog detector list by nature.

    Returns dict: grpnum → {'text': str, 'subs': list|None, 'konventionell': bool}
    """
    n = len(data)
    # Per-generation field layout, keyed by the anchor's variant byte:
    # (grpnum offset, embedded-record offset). Both confirmed against
    # installer CSV exports (variant 0x02: Zentrum Nachwuchsgewinnung 2010;
    # variant 0x04: Altes Theater Magdeburg / Grundschule Peine).
    VARIANTS = {0x02: (38, 158), 0x04: (42, 184)}

    found = []  # (grpnum, mpos, f1, rec_off, konventionell)
    for anchor_byte, konv in ((0xe3, False), (0xe6, True)):
        i = 0
        seen = set()
        while i < n - 4:
            if not (data[i] == anchor_byte and data[i+1] == 0x00 and data[i+3] == 0x00):
                i += 1
                continue
            layout = VARIANTS.get(data[i+2])
            if layout is None:
                i += 1
                continue
            grp_off, rec_off = layout
            mpos = i - 20
            if mpos < 0 or mpos + grp_off + 4 > n:
                i += 1
                continue
            f1 = struct.unpack_from('<I', data, mpos)[0]
            if f1 not in f1_to_f3:
                i += 1
                continue
            if struct.unpack_from('<I', data, mpos + 14)[0] != f1_to_f3[f1]:
                i += 1
                continue
            grpnum = struct.unpack_from('<I', data, mpos + grp_off)[0]
            if not (1 <= grpnum <= 9999) or grpnum in seen:
                i += 1
                continue
            seen.add(grpnum)
            found.append((grpnum, mpos, f1, rec_off, konv))
            i += 1

    if not found:
        return {}

    # POET object addressing: the zone stores its detector list's OID at +4
    # (0 = embedded). See find_oid_pointer_groups for the derivation.
    base = _calibrate_base([(mp, f1) for _, mp, f1, _, _ in found])
    default_delta = found[0][3] - OID_SLOT
    delta = _calibrate_delta(
        data, [(mp, f1, base) for _, mp, f1, _, _ in found],
        all_group_recs.keys(), default=default_delta)

    results = {}
    for grpnum, mpos, f1, rec_off, konv in found:
        if grpnum in results:
            continue
        if konv:
            results[grpnum] = {'text': '', 'subs': None, 'konventionell': True}
            continue
        ptr = struct.unpack_from('<I', data, mpos + ZONE_PTR_OFF)[0]
        rp = (ptr * OID_SLOT + base + delta) if ptr else (mpos + rec_off)
        rec = all_group_recs.get(rp)
        if rec is not None:
            results[grpnum] = {'text': rec['text'], 'subs': rec['subs'],
                               'konventionell': False}
        else:
            results[grpnum] = {'text': '', 'subs': None, 'konventionell': False}

    # Guarantee completeness: any zone in the root table that the anchor scan
    # above did not cover (other object classes) still gets its number out.
    for z in enumerate_zones(data, root_entries, base):
        if z['grpnum'] not in results:
            results[z['grpnum']] = {
                'text': '', 'subs': None,
                'konventionell': z['cls'] in _CONVENTIONAL,
                'stoerung': z['cls'] == ZONE_CLS_STOERUNG,
            }
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

    # Remaining unmatched blocks: report the group (number, name) without
    # detectors instead of pairing leftovers by position. Positional
    # elimination can silently attach the wrong detector list to a group —
    # for a fire-safety Auslöseliste an honest gap beats a plausible guess.
    for cb in unmatched:
        resolved[cb['grpnum']] = {'text': cb['text'], 'subs': None}

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

    # Pass 2: resolve pending blocks via bus_hint. Only an unambiguous single
    # candidate is accepted — picking "the best of several" can attach a
    # wrong detector list, which is worse than an honest gap. Ambiguous
    # blocks keep their group number but no detector list (subs=None).
    for grpnum, mpos, bus_hint in pending:
        if grpnum in resolved:
            continue
        candidates = [g for g in bus_to_gpos.get(bus_hint, []) if g not in used_gpos]
        if len(candidates) == 1:
            rec = group_records[candidates[0]]
            resolved[grpnum] = {'text': rec['text'], 'subs': _get_subs(rec)}
            used_gpos.add(candidates[0])
        else:
            resolved[grpnum] = {'text': '', 'subs': None}

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
    # Positional name matching is only trustworthy when it is a perfect
    # bijection; with unequal counts a single insertion shifts every name
    # after it onto the wrong group.
    use_positional = len(zero_name_recs) == len(b2_blocks)
    for i, (mpos, grpnum, text_fallback) in enumerate(b2_blocks):
        text = zero_name_recs[i][1] if use_positional else text_fallback
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


def _is_zone_block(data, mpos, all_f1_set, f1_to_f3=None):
    """
    Validity check for a zone metadata block at mpos (anchor at +20).
    Newer generations carry flag==1 at +46; blocks written by older Tools
    versions (e.g. 1.26) have filler there, but every generation stores the
    zone's own sequence number at +14, which must equal the root table's f3
    for the zone's f1 handle.
    """
    n = len(data)
    if mpos < 0 or mpos + 48 > n:
        return False
    f1 = struct.unpack_from('<I', data, mpos)[0]
    if f1 not in all_f1_set:
        return False
    if struct.unpack_from('<H', data, mpos + 46)[0] == 1:
        return True
    if f1_to_f3 is not None:
        return struct.unpack_from('<I', data, mpos + 14)[0] == f1_to_f3.get(f1)
    return False


def find_group_categories(data, all_f1_set, f1_to_f3=None):
    """
    Scan metadata blocks (Type A) for the Gruppenart code at mpos+54 (and its
    sub-code at mpos+58). Unlike find_metadata_blocks, this does not require a
    matching detector GROUP record, so it also covers groups with zero
    physical inputs (e.g. Signalgeber groups) that would otherwise disappear
    from the output entirely.

    Returns dict: grpnum → (category_code, subcode).
    """
    n = len(data)
    results = {}
    idx = 0
    while True:
        idx = data.find(META_ANCHOR, idx)
        if idx < 0:
            break
        mpos = idx - 20
        if mpos < 0 or mpos + 60 > n:
            idx += 1
            continue
        if not _is_zone_block(data, mpos, all_f1_set, f1_to_f3):
            idx += 1
            continue
        grpnum = struct.unpack_from('<I', data, mpos + 42)[0]
        if not (1 <= grpnum <= 9999):
            idx += 1
            continue
        if grpnum not in results:
            code = struct.unpack_from('<H', data, mpos + 54)[0]
            sub = struct.unpack_from('<H', data, mpos + 58)[0]
            results[grpnum] = (code, sub)
        idx += 1
    return results


# The 4 bytes immediately preceding a GROUP record encode its owner class.
# Meldegruppen-owned records carry a per-file value (5c33ffc8, f2010100,
# 33000000, ... — varies between project files, sometimes several per file),
# so it cannot serve as a positive filter. But Steuergruppen-owned records
# (relay/output activation lists like "Sirenen KG - EG", "Notfall/Reset")
# consistently carry 01 00 00 00 across every examined file, and no correct
# Meldegruppen resolution ever used such a record (validated on 8 files,
# 3 of them against installer ground-truth exports).
STEUERGRUPPE_PREFIX = b'\x01\x00\x00\x00'


def is_steuergruppe_record(data, gpos):
    """True if the GROUP record at gpos is owned by a Steuergruppe (control
    group) rather than a Meldegruppe — such records must be excluded from
    zone resolution and from the output."""
    return gpos >= 4 and bytes(data[gpos-4:gpos]) == STEUERGRUPPE_PREFIX


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
    non_std = {}  # grpnum → (mpos, f1, val64, sec_byte, category)
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
            category = struct.unpack_from('<H', data, mpos + 54)[0] if mpos + 56 <= n else None
            non_std[grpnum] = (mpos, f1, val64, sec_byte, category)
        idx += 1

    # Remove groups already resolved via standard method
    for gpos in already_resolved_gpos:
        for grpnum, info in list(non_std.items()):
            mpos = info[0]
            if mpos + 182 == gpos or mpos + 180 == gpos:
                del non_std[grpnum]

    if not non_std:
        return {}, {}

    val64_to_grpnum = {info[2]: g for g, info in non_std.items()}
    f1_to_grpnum_ns = {info[1]: g for g, info in non_std.items()}
    sec_byte_to_grpnum = {info[3]: g for g, info in non_std.items() if info[3]}

    # Scan GROUP records not already resolved for matches
    gpos_to_matches = {}
    for gpos, rec in group_records.items():
        if gpos in already_resolved_gpos:
            continue
        # Skip Steuergruppen-owned records — their addresses colliding with
        # a zone's pointer is exactly what used to produce wrong assignments
        # (e.g. "Notfall/Reset" stealing Meldegruppe 2's slot).
        if is_steuergruppe_record(data, gpos):
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

    # Candidate pools per grpnum, per evidence tier (A strongest, C weakest).
    # Built independently for every grpnum — no shared state, no ordering.
    pools = {g: {'A': set(), 'B': set(), 'C': set()} for g in non_std}
    for gpos, matches in gpos_to_matches.items():
        for grpnum, kind in matches:
            tier = {'val64_bus': 'A', 'f1_sec': 'B', 'sec_byte': 'C'}[kind]
            pools[grpnum][tier].add(gpos)

    # Category veto at candidate level: "Automatische Melder" (category 1)
    # groups never contain DKM hardware, "Nichtautomatische Melder"
    # (category 2) never contain AM hardware — real projects don't mix them.
    # A candidate violating this is a mislinked foreign object (observed in
    # practice: a Steuergruppe's relay contact whose address coincidentally
    # collides with a Meldegruppe's expected pointer). Validated against
    # ground-truth exports from 3 buildings.
    AM_CODES = {0x0114, 0x0164}
    DKM_CODE = 0x0127

    def _category_ok(grpnum, gpos):
        category = non_std[grpnum][4]
        if category not in (1, 2):
            return True
        rec = group_records[gpos]
        det_types = set()
        for i in range(rec['count']):
            sp = rec['sub_start'] + i * 14
            if sp + 14 > n:
                break
            det_types.add(struct.unpack_from('<H', data, sp + 12)[0])
        if category == 1:
            return DKM_CODE not in det_types
        return not (det_types & AM_CODES)

    for grpnum, tiers in pools.items():
        for tier in ('A', 'B', 'C'):
            tiers[tier] = {gp for gp in tiers[tier] if _category_ok(grpnum, gp)}

    # Cascade-proof tiered resolution. Design constraint (safety-critical):
    # a single bad slot in the source file must never shift or displace other
    # groups' assignments. Therefore:
    #   - every grpnum resolves from its own evidence only, in one shot;
    #   - a grpnum uses its strongest non-empty tier; no fallback to weaker
    #     tiers when the strong tier is ambiguous or already claimed;
    #   - within a tier, all proposals are made simultaneously; if two
    #     grpnums propose the same GROUP record, BOTH stay unresolved
    #     (flagged downstream) instead of one silently winning;
    #   - no process-of-elimination for leftovers, ever.
    result = {}
    tier_info = {}  # grpnum → (tier, mpos)
    assigned = set()
    for tier in ('A', 'B', 'C'):
        proposals = {}
        for grpnum, tiers in pools.items():
            if grpnum in result:
                continue
            # strongest non-empty tier decides; skip grpnum in weaker rounds
            decisive = next((t for t in ('A', 'B', 'C') if tiers[t]), None)
            if decisive != tier:
                continue
            cands = tiers[tier] - assigned
            if len(cands) == 1:
                proposals[grpnum] = next(iter(cands))
        claim_count = {}
        for gp in proposals.values():
            claim_count[gp] = claim_count.get(gp, 0) + 1
        for grpnum, gp in proposals.items():
            if claim_count[gp] == 1:
                result[grpnum] = gp
                tier_info[grpnum] = (tier, non_std[grpnum][0])
                assigned.add(gp)

    return result, tier_info


# Fixed 4-byte marker found inside the "long" metadata block variant used for
# groups with a timed alarm reaction (e.g. Betriebsart "ALZ 10 sek."). The 14
# bytes immediately before it are a detector sub-record (bus, sec, zeros,
# type_code) — same layout as the 14-byte entries in a GROUP record — that
# reliably identifies one specific detector belonging to that metadata block.
_LONG_BLOCK_MARKER = bytes([0x97, 0xed, 0x0b, 0x18])


# ---------------------------------------------------------------------------
# POET object addressing — the authoritative link between a zone and its
# detector list, valid across every file generation seen so far.
#
# Objects are allocated in 64-byte slots. An object handle (OID) maps to a
# file offset by  offset = OID * 64 + OID_BASE.  The root pointer table's
# first handle (f1) IS the zone object's OID: f1 * 64 + 960 == zone block
# start, verified on every zone of every test file (0 exceptions).
#
# Each zone block stores, at mpos+4, the OID of the object holding its
# detector list — or 0 when the list is embedded in the zone object itself.
# Within the target object the record sits 64 bytes earlier than the
# embedded record would sit in a zone object, i.e.
#     record_pos = ptr * 64 + OID_BASE + (embedded_offset - 64)
#
# This replaces all address-collision-prone heuristics. Confirmed against
# installer CSV exports: Arendsee 60/60, Kalbe 249/249, Gymnasium 68/68,
# Nachwuchsgewinnung 136/136, Theater 53/53 — zero wrong.
OID_BASE = 960
OID_SLOT = 64
ZONE_PTR_OFF = 4


def _oid_addr(oid):
    return oid * OID_SLOT + OID_BASE


# Zone object classes, read as u16 at mpos+20. The variant (u16 at mpos+22)
# only shifts the grpnum field: the 2010-generation puts it at +38, every
# other generation at +42.
ZONE_CLS_ANALOG = 0x00e3        # analog Meldegruppe (has a detector list)
ZONE_CLS_KONVENTIONELL = 0x00e6  # conventional (Grenzwert) Meldegruppe
ZONE_CLS_KONV_ALT = 0x01af       # conventional, older/other serialization
ZONE_CLS_STOERUNG = 0x007a       # Störung / Überwachungseingang

_CONVENTIONAL = (ZONE_CLS_KONVENTIONELL, ZONE_CLS_KONV_ALT)


def enumerate_zones(data, root_entries, base=OID_BASE):
    """
    Enumerate every Meldegruppe of a panel directly from its root pointer
    table — the authoritative source, so no group can ever be missed.

    Each root entry is a handle pair (f1, f3) where f1 is the zone object's
    POET OID: its block starts at f1 * 64 + base, and the block's own
    sequence number (u32 at +14) must equal f3. That double check makes the
    enumeration self-validating; a handle that fails it is skipped rather
    than guessed at.

    Verified to yield exactly the installer's group list (no misses, no
    extras) on all five ground-truth files, spanning four file generations.

    Returns list of dicts: {grpnum, mpos, f1, cls, variant}.
    """
    n = len(data)
    zones = []
    seen = set()
    for f1, f3 in root_entries:
        mpos = f1 * OID_SLOT + base
        if not (0 <= mpos < n - 64):
            continue
        if struct.unpack_from('<I', data, mpos)[0] != f1:
            continue
        if struct.unpack_from('<I', data, mpos + 14)[0] != f3:
            continue
        cls = struct.unpack_from('<H', data, mpos + 20)[0]
        variant = struct.unpack_from('<H', data, mpos + 22)[0]
        # Only the oldest serializations of the two Meldegruppen classes put
        # the group number at +38; everything else (incl. the special classes
        # regardless of their variant byte) uses +42.
        grp_off = 38 if (cls in (ZONE_CLS_ANALOG, ZONE_CLS_KONVENTIONELL)
                         and variant in (1, 2)) else 42
        grpnum = struct.unpack_from('<I', data, mpos + grp_off)[0]
        if not (1 <= grpnum <= 9999) or grpnum in seen:
            continue
        seen.add(grpnum)
        zones.append({'grpnum': grpnum, 'mpos': mpos, 'f1': f1,
                      'cls': cls, 'variant': variant})
    return zones


def _calibrate_base(zones):
    """zones: iterable of (mpos, f1). Returns the dominant OID base."""
    counts = Counter(mpos - f1 * OID_SLOT for mpos, f1 in zones)
    return counts.most_common(1)[0][0] if counts else OID_BASE


def _calibrate_delta(data, zones, record_positions, default):
    """
    Empirically determine the record's offset inside a pointed-to object by
    majority vote, so the parser adapts if a generation shifts the layout.
    """
    rec_sorted = sorted(record_positions)
    deltas = Counter()
    for mpos, f1, base in zones:
        ptr = struct.unpack_from('<I', data, mpos + ZONE_PTR_OFF)[0]
        if not ptr:
            continue
        addr = ptr * OID_SLOT + base
        i = bisect.bisect_left(rec_sorted, addr)
        if i < len(rec_sorted) and rec_sorted[i] - addr < 600:
            deltas[rec_sorted[i] - addr] += 1
    return deltas.most_common(1)[0][0] if deltas else default


def _find_oid_base(data, root_entries):
    """Locate the OID→offset base; 960 in every file seen, but self-checked."""
    n = len(data)
    counts = Counter()
    for f1, f3 in root_entries:
        for b in (OID_BASE, 0):
            mpos = f1 * OID_SLOT + b
            if 0 <= mpos < n - 64 and struct.unpack_from('<I', data, mpos)[0] == f1 \
                    and struct.unpack_from('<I', data, mpos + 14)[0] == f3:
                counts[b] += 1
    return counts.most_common(1)[0][0] if counts else OID_BASE


def resolve_zones(data, root_entries, records):
    """
    Complete, generation-independent resolution of a panel's Meldegruppen.

    Enumerates every zone from the root table (see enumerate_zones), then
    links each analog zone to its detector record through the POET object
    pointer at mpos+4:

        ptr == 0  → record embedded inside the zone object
        ptr != 0  → record at  ptr * 64 + base + (embedded_offset - 64)

    Both the embedded offset and the resulting delta are measured from the
    file itself (majority vote over zones whose record position is
    unambiguous), so a new generation with a shifted layout self-calibrates
    instead of silently mislinking. Conventional and Störung zones have no
    analog detector list by nature and are returned with record=None.

    `records` maps a record's lookup position to its parsed record.
    Returns list of dicts: {grpnum, cls, variant, record_pos or None, mpos}.
    """
    base = _find_oid_base(data, root_entries)
    zones = enumerate_zones(data, root_entries, base)
    if not zones:
        return []

    rec_sorted = sorted(records)

    def _nearest(pos, span=400):
        i = bisect.bisect_left(rec_sorted, pos)
        if i < len(rec_sorted) and rec_sorted[i] - pos < span:
            return rec_sorted[i]
        return None

    # embedded offset: measured on zones whose pointer is 0
    emb_counts = Counter()
    for z in zones:
        if struct.unpack_from('<I', data, z['mpos'] + ZONE_PTR_OFF)[0]:
            continue
        hit = _nearest(z['mpos'])
        if hit is not None:
            emb_counts[hit - z['mpos']] += 1
    embedded = emb_counts.most_common(1)[0][0] if emb_counts else 182

    # delta: measured on zones whose pointer is set; falls back to the
    # structural relation delta == embedded - 64.
    delta_counts = Counter()
    for z in zones:
        ptr = struct.unpack_from('<I', data, z['mpos'] + ZONE_PTR_OFF)[0]
        if not ptr:
            continue
        addr = ptr * OID_SLOT + base
        hit = _nearest(addr, 600)
        if hit is not None:
            delta_counts[hit - addr] += 1
    delta = delta_counts.most_common(1)[0][0] if delta_counts else embedded - OID_SLOT

    out = []
    for z in zones:
        rp = None
        if z['cls'] == ZONE_CLS_ANALOG:
            ptr = struct.unpack_from('<I', data, z['mpos'] + ZONE_PTR_OFF)[0]
            cand = (ptr * OID_SLOT + base + delta) if ptr else (z['mpos'] + embedded)
            if cand in records:
                rp = cand
        out.append({'grpnum': z['grpnum'], 'cls': z['cls'],
                    'variant': z['variant'], 'record_pos': rp,
                    'mpos': z['mpos']})
    return out


def zone_category(cls, fallback=None):
    """Map a zone object class to the parser's category code."""
    if cls in _CONVENTIONAL:
        return CATEGORY_KONVENTIONELL
    if cls == ZONE_CLS_STOERUNG:
        return CATEGORY_STOERUNG
    return fallback


def find_oid_pointer_groups(data, f1_to_f3, all_f1_set, group_records):
    """
    Resolve zone → detector record via the POET object pointer at mpos+4
    (Type A files). Returns dict grpnum → GROUP_pos.

    A zone whose pointer is 0 carries its record embedded at mpos+182 (or
    +180 in a few blocks); those are already handled by find_metadata_blocks
    but are resolved here too so the pass can stand alone.
    """
    n = len(data)
    zones = {}
    idx = 0
    while True:
        idx = data.find(META_ANCHOR, idx)
        if idx < 0:
            break
        mpos = idx - 20
        if mpos >= 0 and mpos + 48 <= n:
            f1 = struct.unpack_from('<I', data, mpos)[0]
            if f1 in all_f1_set and _is_zone_block(data, mpos, all_f1_set, f1_to_f3):
                grpnum = struct.unpack_from('<I', data, mpos + 42)[0]
                if 1 <= grpnum <= 9999 and grpnum not in zones:
                    zones[grpnum] = (mpos, f1)
        idx += 1
    if not zones:
        return {}

    base = _calibrate_base(zones.values())
    delta = _calibrate_delta(
        data, [(mp, f1, base) for mp, f1 in zones.values()],
        group_records.keys(), default=118)

    result = {}
    for grpnum, (mpos, f1) in zones.items():
        ptr = struct.unpack_from('<I', data, mpos + ZONE_PTR_OFF)[0]
        if ptr:
            rp = ptr * OID_SLOT + base + delta
        else:
            rp = next((mpos + off for off in (182, 180) if mpos + off in group_records), None)
        if rp in group_records:
            result[grpnum] = rp
    return result


def find_seq_based_groups(data, f1_to_f3, all_f1_set, group_records):
    """
    Deterministic zone→record resolution via POET object sequence numbers.

    Discovered through controlled save-diffs of a real project: the root
    pointer table's second handle (f3) is the zone object's sequence number
    in the database's object directory, and the zone's detector-list object
    is allocated with the directly following sequence number. That list
    object's header carries [OID u32][seq u32], and its GROUP record starts
    exactly 64 bytes after the seq field. So for a zone with handle pair
    (f1, f3): find the u32 value f3+1 whose position + 64 is a valid GROUP
    record and whose preceding u32 looks like an OID — that record is the
    zone's detector list. This resolves the ordering database-side, exactly
    like Tools 8000 itself, and is immune to the address collisions that
    plague the heuristic passes (validated: 59/60 zones correct on the file
    with a corrupted slot that defeated every heuristic, 0 wrong).

    Only some file-format versions carry these per-object headers (newer
    versions embed records differently and yield no candidates — which is
    harmless). Callers must gate the result via cross-check against
    standard-resolved zones (see parse_etb_all) before trusting it.

    Returns dict: grpnum → GROUP_pos. Ambiguous or headerless zones are
    simply absent. Two zones claiming the same record are both dropped.
    """
    n = len(data)

    meta_f1 = {}  # grpnum → f1
    idx = 0
    while True:
        idx = data.find(META_ANCHOR, idx)
        if idx < 0:
            break
        mpos = idx - 20
        if mpos >= 0 and mpos + 56 <= n:
            f1 = struct.unpack_from('<I', data, mpos)[0]
            if f1 in all_f1_set and struct.unpack_from('<H', data, mpos + 46)[0] == 1:
                g = struct.unpack_from('<I', data, mpos + 42)[0]
                if 1 <= g <= 9999 and g not in meta_f1:
                    meta_f1[g] = f1
        idx += 1

    proposals = {}
    for g, f1 in meta_f1.items():
        f3 = f1_to_f3.get(f1)
        if f3 is None:
            continue
        target = struct.pack('<I', f3 + 1)
        hits = set()
        idx2 = 0
        while True:
            idx2 = data.find(target, idx2)
            if idx2 < 0:
                break
            gp_cand = idx2 + 64
            if gp_cand in group_records and idx2 >= 4:
                oid = struct.unpack_from('<I', data, idx2 - 4)[0]
                if 0 < oid < 10**6:
                    hits.add(gp_cand)
            idx2 += 1
        if len(hits) == 1:
            proposals[g] = next(iter(hits))

    # drop same-record conflicts entirely (cascade safety)
    claim = {}
    for gp in proposals.values():
        claim[gp] = claim.get(gp, 0) + 1
    return {g: gp for g, gp in proposals.items() if claim[gp] == 1}


def find_marker_based_groups(data, all_f1_set, group_records, already_resolved_gpos,
                              already_resolved_grpnums):
    """
    Resolve remaining groups via the _LONG_BLOCK_MARKER anchor (see above)
    instead of the val64==f1+1 signature used by find_nonstandard_groups.

    The extracted (bus, sec, type_code) triple is looked up against every
    detector in every not-yet-used GROUP record. Some of these triples also
    appear inside large "ring/topology" objects (a Steuergruppe-linked
    superset listing every device on a physical loop) — such an object turns
    up as a candidate for many different grpnums, whereas a genuine 1:1 match
    is specific to exactly one. Candidates matched by more than one grpnum
    are therefore dropped as untrustworthy; only grpnums left with exactly
    one surviving candidate are resolved.

    Returns dict: grpnum → GROUP_pos.
    """
    n = len(data)

    unresolved_meta = {}  # grpnum → mpos
    idx = 0
    while True:
        idx = data.find(META_ANCHOR, idx)
        if idx < 0:
            break
        mpos = idx - 20
        if mpos < 0 or mpos + 56 > n:
            idx += 1
            continue
        f1 = struct.unpack_from('<I', data, mpos)[0]
        if f1 not in all_f1_set:
            idx += 1
            continue
        if struct.unpack_from('<H', data, mpos + 46)[0] != 1:
            idx += 1
            continue
        grpnum = struct.unpack_from('<I', data, mpos + 42)[0]
        if not (1 <= grpnum <= 9999) or grpnum in already_resolved_grpnums:
            idx += 1
            continue
        if grpnum not in unresolved_meta:
            unresolved_meta[grpnum] = mpos
        idx += 1

    if not unresolved_meta:
        return {}

    triple_index = {}
    for gpos, rec in group_records.items():
        if gpos in already_resolved_gpos:
            continue
        if is_steuergruppe_record(data, gpos):
            continue
        for i in range(rec['count']):
            sp = rec['sub_start'] + i * 14
            if sp + 14 > n:
                break
            bus, sec = struct.unpack_from('<II', data, sp)
            if data[sp+8:sp+12] != bytes(4):
                continue
            tc = struct.unpack_from('<H', data, sp + 12)[0]
            if tc not in VALID_TYPE_CODES:
                continue
            triple_index.setdefault((bus, sec, tc), set()).add(gpos)

    grp_candidates = {}
    for grpnum, mpos in unresolved_meta.items():
        window = data[mpos:mpos+600]
        mi = window.find(_LONG_BLOCK_MARKER)
        if mi < 18:
            continue
        sp = mi - 18
        bus, sec = struct.unpack_from('<II', window, sp)
        if window[sp+8:sp+12] != bytes(4):
            continue
        tc = struct.unpack_from('<H', window, sp + 12)[0]
        if tc not in VALID_TYPE_CODES:
            continue
        cands = triple_index.get((bus, sec, tc))
        if cands:
            grp_candidates[grpnum] = cands

    popularity = {}
    for cands in grp_candidates.values():
        for gpos in cands:
            popularity[gpos] = popularity.get(gpos, 0) + 1

    result = {}
    for grpnum, cands in grp_candidates.items():
        trustworthy = [gpos for gpos in cands if popularity[gpos] == 1]
        if len(trustworthy) == 1:
            result[grpnum] = trustworthy[0]

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


def _build_group_dict(grpnum, text, detectors, unresolved=False, category=None, detectors_unknown=False):
    # A conventional (Grenzwert) group has no addressable detectors — the
    # whole group triggers as one. Represent it as exactly 1 Melder so
    # Auslöselisten always carry a count for it.
    if category == CATEGORY_KONVENTIONELL and not detectors:
        detectors = [{'bus_addr': None, 'sec_addr': None,
                      'type_code': None, 'type_name': 'Konventionell'}]
        detectors_unknown = False
    return {
        'grpnum': grpnum,
        'text': text,
        'detectors': detectors,
        'det_count': len(detectors),
        'unresolved': unresolved,
        'category': category,
        'category_name': GROUP_CATEGORY_NAMES.get(category) if category is not None else None,
        'hideable': category in NON_DETECTOR_CATEGORIES,
        # True when the group's metadata was found but no detector array could
        # be linked to it — det_count is 0 here for lack of data, not because
        # the group is genuinely empty. Don't treat det_count as ground truth
        # when this is set.
        'detectors_unknown': detectors_unknown,
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
            f1_to_f3_c = {f1: f3 for f1, f3 in root['entries']}
            # Try the oldest sub-variant first (anchor e3 00 02 00 with
            # seq==f3 validation); fall back to the classic C layout.
            zones_c = resolve_zones(data, root['entries'], all_group_recs)
            if zones_c:
                base_c = _find_oid_base(data, root['entries'])
                type_c = {}
                for z in zones_c:
                    rec = all_group_recs.get(z['record_pos']) if z['record_pos'] else None
                    type_c[z['grpnum']] = {
                        'text': rec['text'] if rec else _zone_text(data, z['mpos'], base_c),
                        'subs': rec['subs'] if rec else None,
                        'konventionell': z['cls'] in _CONVENTIONAL,
                        'stoerung': z['cls'] == ZONE_CLS_STOERUNG,
                    }
            else:
                type_c = find_metadata_blocks_type_c2(data, f1_to_f3_c, all_group_recs,
                                                      root['entries'])
            if len(type_c) < 3:
                type_c = find_metadata_blocks_type_c(data, all_f1_set, all_group_recs)
                for info in type_c.values():
                    info.setdefault('konventionell', False)
            used_pos = set()
            groups = []
            for grpnum, info in type_c.items():
                if info['subs'] is None:
                    if info.get('konventionell'):
                        cat = CATEGORY_KONVENTIONELL
                    elif info.get('stoerung'):
                        cat = CATEGORY_STOERUNG
                    else:
                        cat = None
                    groups.append(_build_group_dict(grpnum, info['text'], [],
                                                    category=cat, detectors_unknown=True))
                    continue
                groups.append(_build_group_dict(grpnum, info['text'], _dets_from_subs(info['subs'])))
                for lp, grec in all_group_recs.items():
                    if grec['subs'] == info['subs']:
                        used_pos.add(lp)
                        break
            if not zones_c:
                for lp, grec in all_group_recs.items():
                    if lp not in used_pos:
                        groups.append(_build_group_dict(None, grec['text'],
                                                        _dets_from_subs(grec['subs']), True))
            result.append({'name': name, 'groups': _sort_groups(groups)})
            break  # Type C is always single-panel

        elif fmt == 'B':
            # Prefer the authoritative root-table + object-pointer resolution;
            # only fall back to the old anchor heuristics if it finds nothing.
            zones = resolve_zones(data, root['entries'], group_records)
            if zones:
                base_b = _find_oid_base(data, root['entries'])
                categories = find_group_categories(
                    data, all_f1_set, {f1: f3 for f1, f3 in root['entries']})
                groups = []
                used_gpos = set()
                for z in zones:
                    cat = zone_category(z['cls'], categories.get(z['grpnum'], (None,))[0])
                    rp = z['record_pos']
                    if rp is None:
                        groups.append(_build_group_dict(z['grpnum'],
                                                        _zone_text(data, z['mpos'], base_b),
                                                        [], category=cat,
                                                        detectors_unknown=True))
                    else:
                        rec = group_records[rp]
                        used_gpos.add(rp)
                        groups.append(_build_group_dict(z['grpnum'], rec['text'],
                                                        extract_detectors(data, rec), category=cat))
            else:
                type_b, used_gpos = find_metadata_blocks_type_b(data, all_f1_set, group_records)
                groups = []
                for grpnum, info in type_b.items():
                    if info['subs'] is None:
                        groups.append(_build_group_dict(grpnum, info['text'], [], detectors_unknown=True))
                    else:
                        groups.append(_build_group_dict(grpnum, info['text'], _dets_from_subs(info['subs'])))
            if not zones:
                # Only when the root table could not be trusted do leftover
                # records get reported; with a complete zone list every
                # remaining record belongs to a Steuergruppe by definition.
                for gpos, rec in group_records.items():
                    if gpos not in used_gpos and not is_steuergruppe_record(data, gpos):
                        groups.append(_build_group_dict(None, rec['text'],
                                                        extract_detectors(data, rec), True))
            result.append({'name': name, 'groups': _sort_groups(groups)})
            break  # Type B is always single-panel

        else:
            # Type A — standard metadata + non-standard resolution
            grpnum_to_gpos = find_metadata_blocks(data, all_f1_set, group_pos_set)

            # Deterministic sequence-number resolution (database-index level,
            # same mechanism Tools 8000 uses). Gate: every zone that BOTH
            # this pass and the structural standard pass resolve must agree,
            # with at least 3 overlaps — otherwise the whole pass is
            # distrusted for this file. When trusted it takes precedence,
            # because it is immune to the address collisions that can steer
            # the heuristics below onto a wrong record.
            f1_to_f3 = {f1: f3 for f1, f3 in root['entries']}

            # Authoritative: this panel's own zones, resolved through the POET
            # object pointer. Scoped to the panel's root entries, so a
            # multi-panel (EsserNet) file resolves each panel independently.
            # It is validated by two independent structural invariants (the
            # zone's own sequence number, and the object pointer landing on a
            # parsable record), so it overrides the heuristics below rather
            # than being vetoed by them.
            zone_matches = {z['grpnum']: z['record_pos']
                            for z in resolve_zones(data, root['entries'], group_records)
                            if z['record_pos'] is not None}
            if len(zone_matches) >= 3:
                grpnum_to_gpos.update(zone_matches)

            # Legacy whole-file pointer pass, kept as a safety net.
            oid_matches = find_oid_pointer_groups(data, f1_to_f3, all_f1_set, group_records)
            oid_overlap = [g for g in oid_matches if g in grpnum_to_gpos]
            if (len(oid_overlap) >= 3
                    and all(oid_matches[g] == grpnum_to_gpos[g] for g in oid_overlap)):
                for g, gp in oid_matches.items():
                    grpnum_to_gpos.setdefault(g, gp)

            seq_matches = find_seq_based_groups(data, f1_to_f3, all_f1_set, group_records)
            overlap = [g for g in seq_matches if g in grpnum_to_gpos]
            seq_trusted = (
                len(overlap) >= 3
                and all(seq_matches[g] == grpnum_to_gpos[g] for g in overlap)
            )
            if seq_trusted:
                for g, gp in seq_matches.items():
                    grpnum_to_gpos.setdefault(g, gp)

            already = set(grpnum_to_gpos.values()) | global_used_gpos
            ns, _ns_tiers = find_nonstandard_groups(
                data, all_f1_set, group_records, already,
                skip_pass_d=True,
            )
            # heuristics only fill zones the deterministic passes left open
            for g, gp in ns.items():
                if g not in grpnum_to_gpos and gp not in grpnum_to_gpos.values():
                    grpnum_to_gpos[g] = gp
            already = set(grpnum_to_gpos.values()) | global_used_gpos

            marker_matches = find_marker_based_groups(
                data, all_f1_set, group_records, already, set(grpnum_to_gpos.keys()),
            )
            for g, gp in marker_matches.items():
                if g not in grpnum_to_gpos and gp not in grpnum_to_gpos.values():
                    grpnum_to_gpos[g] = gp
            global_used_gpos.update(grpnum_to_gpos.values())

            categories = find_group_categories(data, all_f1_set, f1_to_f3)

            groups = []
            for grpnum, gpos in grpnum_to_gpos.items():
                rec = group_records[gpos]
                cat = categories.get(grpnum, (None, None))[0]
                groups.append(_build_group_dict(grpnum, rec['text'], extract_detectors(data, rec), category=cat))

            # Every zone listed in the panel's root table must appear, even
            # when it has no analog detector list (conventional / Störung
            # zones) — the group number itself is what the Auslöseliste needs.
            base_a = _find_oid_base(data, root['entries'])
            zones_a = enumerate_zones(data, root['entries'], base_a)
            emitted = set(grpnum_to_gpos)
            for z in zones_a:
                if z['grpnum'] in emitted:
                    continue
                cat = zone_category(z['cls'], categories.get(z['grpnum'], (None,))[0])
                groups.append(_build_group_dict(z['grpnum'],
                                                _zone_text(data, z['mpos'], base_a),
                                                [], category=cat,
                                                detectors_unknown=True))
                emitted.add(z['grpnum'])

            # Fallback for any category-bearing block the root table missed.
            for grpnum, (cat, sub) in categories.items():
                if grpnum not in emitted:
                    groups.append(_build_group_dict(grpnum, '', [], category=cat, detectors_unknown=True))
                    emitted.add(grpnum)

            # With a complete zone list from the root table, any record still
            # unclaimed belongs to a Steuergruppe or another object class —
            # never to a Meldegruppe. Only report leftovers when the zone
            # enumeration failed, so nothing can silently disappear.
            if not multi and not zones_a:
                for gpos, rec in group_records.items():
                    if gpos in global_used_gpos or is_steuergruppe_record(data, gpos):
                        continue
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

    # Ring (Esserbus) cards. For a single-panel file they belong to the one
    # Anlage and get their full ring number; for a multi-panel EsserNet file
    # the per-panel assignment and the EsserNet prefix are not derivable, so
    # the cards are kept as separate mainboard groups with the 2-digit number.
    ring_panels = find_ring_cards(data)
    if len(result) == 1:
        cards = [c for pan in ring_panels for c in pan['cards']]
        result[0]['serie'] = ring_panels[0]['series'] if ring_panels else None
        result[0]['ringkarten'] = [
            {'ringnummer': c['ring'], 'bezeichnung': c['name']}
            for c in sorted(cards, key=lambda c: c['ring'] or 0)
        ]
    elif result:
        result[0]['_ring_groups'] = [
            {'serie': pan['series'],
             'ringkarten': [{'ringnummer': c['ms'], 'bezeichnung': c['name']}
                            for c in pan['cards']]}
            for pan in ring_panels
        ]

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

    lines.append(f"{'Gruppe':>6}  {'Melder':>6}  {'Typen':<40}  {'Gruppenart':<26}  {'Text'}")
    lines.append("-" * 100)
    for g in groups:
        gn = str(g['grpnum']) if g['grpnum'] is not None else "???"
        types = ', '.join(d['type_name'] for d in g['detectors']) if g['detectors'] else '—'
        cnt = '?' if g['detectors_unknown'] else str(g['det_count'])
        text = g['text'] or ''
        art = g['category_name'] or ''
        if g['hideable']:
            art += ' [ausblendbar]'
        lines.append(f"{gn:>6}  {cnt:>6}  {types:<40}  {art:<26}  {text}")
    return '\n'.join(lines)


def write_csv(groups, project_name, outpath):
    with open(outpath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f, delimiter=';')
        writer.writerow(['Gruppe', 'Gruppentext', 'Gruppenart', 'Ausblendbar', 'Melderzahl_unbekannt', 'Melder_Nr', 'Meldertyp', 'Bus', 'Sec'])
        for g in groups:
            gn = g['grpnum'] if g['grpnum'] is not None else ''
            art = g['category_name'] or ''
            ausblendbar = 'ja' if g['hideable'] else 'nein'
            unbekannt = 'ja' if g['detectors_unknown'] else 'nein'
            if not g['detectors']:
                writer.writerow([gn, g['text'], art, ausblendbar, unbekannt, '', '', '', ''])
            else:
                for i, d in enumerate(g['detectors'], 1):
                    writer.writerow([gn, g['text'], art, ausblendbar, unbekannt, i, d['type_name'], d['bus_addr'], d['sec_addr']])


def _groups_to_json(groups):
    out = []
    for g in groups:
        melder = [{'nr': i + 1, 'typ': d['type_name']} for i, d in enumerate(g['detectors'])]
        out.append({
            'gruppe': g['grpnum'],
            'name': g['text'],
            'melder': melder,
            'unresolved': g['unresolved'],
            'gruppenart': g['category_name'],
            'ausblendbar': g['hideable'],
            'melderzahl_unbekannt': g['detectors_unknown'],
        })
    return out


# Object class of an analog loop (ring) card. Verified across IQ8, FlexES
# and 8000 files. The card's own OID slot carries:
#   +4   : OID of the loop's designation text object (0 = none)
#   +20  : this class (0x0079)
#   +38  : Mainboard/Backbone-card * 10 + slot (the last two ring-number digits)
#   +56  : OID of the mainboard/backbone object this card sits on
RING_CARD_CLASS = 0x0079

# Mainboard/backbone object class → panel series. Determined by matching the
# card's +56 reference across the fleet; refine with ground truth as needed.
MAINBOARD_SERIES = {
    0x01a9: 'FlexES',
    0x0154: 'IQ8/8000',
    0x0155: 'IQ8/8000',
}


def _read_text_at_slot(data, oid, span=200):
    """Read the first text record inside object `oid`'s slot region."""
    n = len(data)
    mp = oid * OID_SLOT + OID_BASE
    if not (0 <= mp < n - 4):
        return None
    for off in range(0, span, 2):
        pos = mp + off
        if pos + 2 <= n and data[pos:pos+2] == b'\xfd\x00':
            lv = struct.unpack_from('<H', data, pos-2)[0] if pos >= 2 else 0
            if 4 <= lv <= 200:
                te = pos + 2 + (lv - 4)
                if te + 2 <= n and data[te:te+2] == b'\x00\xff':
                    try:
                        return data[pos+2:te].decode('utf-16-le').rstrip('\x00')
                    except UnicodeDecodeError:
                        return None
    return None


def find_ring_cards(data):
    """
    Enumerate the analog loop (ring / Esserbus) cards of a file.

    Ring number = EsserNet-Adresse · 100 + Mainboardkarte · 10 + Slot.
    The last two digits (Mainboard·10 + Slot) are stored at +38; the EsserNet
    prefix is per panel. For a single-panel file it is 1; for a multi-panel
    (EsserNet) file each mainboard object is one panel and cards are grouped
    by it. Cards with the placeholder value 0 at +38 (base/CPU objects) are
    skipped.

    Returns list of dicts, one per mainboard (panel):
      {'mainboard_oid': int, 'series': str|None, 'cards':
          [{'ring': int, 'name': str|None, 'ms': int}, ...]}
    """
    n = len(data)
    by_mb = {}
    for oid in range(1, (n - OID_BASE) // OID_SLOT):
        mp = oid * OID_SLOT + OID_BASE
        if mp + 64 > n:
            break
        if struct.unpack_from('<I', data, mp)[0] != oid:
            continue
        if struct.unpack_from('<H', data, mp + 20)[0] != RING_CARD_CLASS:
            continue
        ms = struct.unpack_from('<H', data, mp + 38)[0]
        if ms == 0:
            continue
        text_ptr = struct.unpack_from('<I', data, mp + 4)[0]
        mb = struct.unpack_from('<I', data, mp + 56)[0]
        name = _read_text_at_slot(data, text_ptr) if text_ptr else None
        by_mb.setdefault(mb, []).append({'ms': ms, 'name': name})

    # Ring number is reported as the two-digit Mainboardkarte*10 + Slot value
    # (stored at +38). The full Tools 8000 number also has a leading EsserNet
    # address (1 for single panels), but per user request that prefix is
    # always omitted — 'ring' == 'ms'.
    panels = []
    for mb, cards in sorted(by_mb.items()):
        mbmp = mb * OID_SLOT + OID_BASE
        series = None
        if 0 <= mbmp < n - 22:
            series = MAINBOARD_SERIES.get(struct.unpack_from('<H', data, mbmp + 20)[0])
        for c in cards:
            c['ring'] = c['ms']
        panels.append({'mainboard_oid': mb, 'series': series,
                       'cards': sorted(cards, key=lambda c: c['ms'])})
    return panels


def to_json(all_anlagen):
    """
    Serialize parse_etb_all result to a JSON-serialisable dict.

    Key order is deliberate: hardware first (Anlagentyp, Ringkarten,
    Software-Version, Module), then the Meldegruppen/Melder list — so a
    consumer reads the panel's makeup before the detector groups.
    """
    def _a(a):
        d = {'anlage': a['name']}
        if 'serie' in a:
            d['serie'] = a['serie']
        if 'ringkarten' in a:
            d['ringkarten'] = a['ringkarten']
        t = a.get('topology')
        if t:
            d['version'] = t.get('version')
            d['module'] = t.get('modules', [])
        d['gruppen'] = _groups_to_json(a['groups'])
        return d

    if len(all_anlagen) == 1:
        return _a(all_anlagen[0])
    out = {}
    groups = all_anlagen[0].get('_ring_groups') if all_anlagen else None
    if groups:
        out['ringkarten_gruppen'] = groups
    out['anlagen'] = [_a(a) for a in all_anlagen]
    return out


def main():
    parser = argparse.ArgumentParser(description='Parse Esser 8000 ETB binary files')
    parser.add_argument('etb', help='ETB file path')
    parser.add_argument('--name', help='Specific Anlage name (for --list/--out on multi-panel files)')
    parser.add_argument('--out', help='Output CSV file path')
    parser.add_argument('--json', action='store_true', help='Print JSON to stdout')
    parser.add_argument('--json-out', help='Write JSON to file')
    parser.add_argument('--list', action='store_true', help='Print summary to stdout')
    parser.add_argument('--rings', action='store_true', help='List analog loop (ring) cards')
    args = parser.parse_args()

    if args.rings:
        data = open(args.etb, 'rb').read()
        panels = find_ring_cards(data)
        for pan in panels:
            print(f"Mainboard OID {pan['mainboard_oid']}  Serie: {pan['series'] or '?'}"
                  f"  ({len(pan['cards'])} Ringkarten)")
            for c in pan['cards']:
                print(f"   Ring {c['ring']:>2}  {c['name'] or ''}")
        return

    try:
        all_anlagen = parse_etb_all(args.etb)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    # JSON is the default output (used by the web UI, which passes no flags);
    # --list / --out request the text or CSV views explicitly.
    want_json = args.json or args.json_out or not (args.list or args.out)
    if want_json:
        payload = to_json(all_anlagen)
        json_str = json.dumps(payload, ensure_ascii=False, indent=2)
        if args.json_out:
            with open(args.json_out, 'w', encoding='utf-8') as f:
                f.write(json_str)
            print(f"JSON written to {args.json_out}", file=sys.stderr)
        else:
            print(json_str)

    if args.out or args.list:
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
