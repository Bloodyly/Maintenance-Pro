-- SQL Database Schema for Maintenance Pro (SQLite compatible)

-- 1. Technicians
CREATE TABLE IF NOT EXISTS technicians (
    id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL
);

-- 2. Maintenance Protocols
CREATE TABLE IF NOT EXISTS protocols (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(255) NOT NULL,
    contract_number VARCHAR(100) NOT NULL,
    interval VARCHAR(50) NOT NULL,
    system_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'ready_to_download', 'downloaded', 'upload_pending', 'synchronized'
    last_edited_by VARCHAR(255),
    last_edited_at VARCHAR(100),
    columns TEXT NOT NULL, -- JSON array of column labels e.g. ["1","2","3","4"]
    applicable_values TEXT NOT NULL, -- JSON array e.g. ["CHECK","Def."]
    detector_types TEXT NOT NULL -- JSON array e.g. ["ZD","DB","RAS"]
);

-- 3. Groups in a Protocol
CREATE TABLE IF NOT EXISTS protocol_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    protocol_id VARCHAR(50) NOT NULL,
    group_id VARCHAR(50) NOT NULL, -- e.g. "GRP 01"
    group_name VARCHAR(255) NOT NULL,
    group_type VARCHAR(50) DEFAULT 'NAM', -- 'NAM' / 'VS' / 'TECH'
    anlage_id VARCHAR(100) DEFAULT 'default',
    anlage_name VARCHAR(255) DEFAULT 'Hauptanlage',
    anlage_type VARCHAR(50) DEFAULT 'BMA',
    anlage_address VARCHAR(255) DEFAULT '',
    FOREIGN KEY (protocol_id) REFERENCES protocols(id) ON DELETE CASCADE,
    UNIQUE(protocol_id, group_id)
);

-- 4. Cells / Detector Slots inside Groups
CREATE TABLE IF NOT EXISTS group_cells (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    protocol_id VARCHAR(50) NOT NULL,
    group_id VARCHAR(50) NOT NULL,
    slot_key VARCHAR(50) NOT NULL, -- e.g. "1", "2"
    detector_type VARCHAR(100) NOT NULL, -- e.g. "ZD", "Normal", "BWM"
    value VARCHAR(50) NOT NULL DEFAULT '', -- e.g. "CHECK", "Def.", ""
    FOREIGN KEY (protocol_id, group_id) REFERENCES protocol_groups(protocol_id, group_id) ON DELETE CASCADE,
    UNIQUE(protocol_id, group_id, slot_key)
);

-- Insert Sample Metadata
INSERT OR IGNORE INTO technicians (id, username, password_hash, name) 
VALUES ('99283-FS', 'tprantl', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', 'Thomas Prantl');

INSERT OR IGNORE INTO protocols (id, name, address, contract_number, interval, system_type, status, last_edited_by, last_edited_at, columns, applicable_values, detector_types)
VALUES (
    '1', 
    'Zentral-Klinikum West', 
    'Klinikstraße 12, 1010 Wien', 
    'V-2024-99a', 
    'Halbjährlich', 
    'BMA', 
    'ready_to_download', 
    'Sophia Reiter', 
    '15.05.2026', 
    '["1","2","3","4","5","6","7","8"]', 
    '["CHECK","Def."]', 
    '["ZD","DB","RAS","TDIF"]'
);

INSERT OR IGNORE INTO protocol_groups (protocol_id, group_id, group_name, group_type)
VALUES ('1', 'GRP 01', 'Technikraum 2a', 'TECH');

INSERT OR IGNORE INTO group_cells (protocol_id, group_id, slot_key, detector_type, value)
VALUES 
('1', 'GRP 01', '1', 'ZD', ''),
('1', 'GRP 01', '2', 'ZD', ''),
('1', 'GRP 01', '3', 'RAS', ''),
('1', 'GRP 01', '4', 'ZD', '');
