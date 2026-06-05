import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Smartphone, 
  Tablet, 
  Settings, 
  Search, 
  Clock, 
  Database, 
  CheckCircle, 
  AlertTriangle, 
  Network, 
  Download, 
  Trash2, 
  Save, 
  Upload, 
  X, 
  Edit3, 
  FileText, 
  Plus, 
  Check, 
  RefreshCw, 
  Info, 
  QrCode, 
  ShieldAlert, 
  Lock, 
  Maximize2, 
  Terminal,
  Grid,
  SlidersHorizontal,
  Eye,
  Archive,
  RotateCcw
} from "lucide-react";
import CentralWebUI from "./components/CentralWebUI";

// Types for Simulator data structure
interface SubSystem {
  id: string;
  name: string;
  rows: Array<{
    groupId: string;
    groupName: string;
    groupType?: string;
    cells: Array<{
      slotKey: string;
      detectorType: string;
      value: string;
    }>;
  }>;
  hardwareRows?: Array<Record<string, string>>;
}

interface ProtocolItem {
  id: string;
  name: string;
  address: string;
  contractNumber: string;
  interval: "Jährlich" | "Halbjährlich" | "Vierteljährlich";
  systemType: string;
  status: "ready_to_download" | "downloaded" | "upload_pending" | "synchronized";
  isArchived?: boolean;
  columns: string[];
  applicableValues: string[];
  detectorTypes: string[];
  lastEditedBy?: string;
  lastEditedAt?: string;
  subSystems?: SubSystem[];
  rows: Array<{
    groupId: string;
    groupName: string;
    groupType?: string;
    cells: Array<{
      slotKey: string;
      detectorType: string;
      value: string;
    }>;
  }>;
}

const INITIAL_PROTOCOLS: ProtocolItem[] = [
  {
    id: "1",
    name: "Siemens AG - Campus Nord",
    address: "Gürtelstraße 14-16, 1210 Wien",
    contractNumber: "V-2023-9941-Z",
    interval: "Jährlich",
    systemType: "BMA",
    status: "ready_to_download",
    isArchived: false,
    columns: ["1", "2", "3", "4", "5", "6", "7", "8"],
    applicableValues: ["CHECK", "Def."],
    detectorTypes: ["ZD", "DB", "RAS", "TDIF"],
    lastEditedBy: "Thomas Prantl",
    lastEditedAt: "24.05.2026",
    subSystems: [
      {
        id: "sys-1",
        name: "Anlage 1: Haupthaus",
        rows: [
          {
            groupId: "GRP 01",
            groupName: "Meldergruppe Erdgeschoss",
            groupType: "NAM",
            cells: [
              { slotKey: "1", detectorType: "RAS", value: "" },
              { slotKey: "2", detectorType: "RAS", value: "" },
              { slotKey: "3", detectorType: "ZD", value: "" },
              { slotKey: "4", detectorType: "ZD", value: "" },
              { slotKey: "5", detectorType: "ZD", value: "" },
              { slotKey: "6", detectorType: "DB", value: "" },
              { slotKey: "7", detectorType: "DB", value: "" },
              { slotKey: "8", detectorType: "TDIF", value: "" }
            ]
          }
        ]
      },
      {
        id: "sys-2",
        name: "Anlage 2: Rechenzentrum (EDV)",
        rows: [
          {
            groupId: "GRP 02",
            groupName: "Meldergruppe Serverraum",
            groupType: "TECH",
            cells: [
              { slotKey: "1", detectorType: "ZD", value: "" },
              { slotKey: "2", detectorType: "ZD", value: "CHECK" },
              { slotKey: "3", detectorType: "DB", value: "" },
              { slotKey: "4", detectorType: "DB", value: "" },
              { slotKey: "5", detectorType: "RAS", value: "" },
              { slotKey: "6", detectorType: "RAS", value: "" },
              { slotKey: "7", detectorType: "TDIF", value: "" },
              { slotKey: "8", detectorType: "TDIF", value: "Def." }
            ]
          }
        ]
      }
    ],
    rows: [
      {
        groupId: "GRP 01",
        groupName: "Meldergruppe Erdgeschoss",
        groupType: "NAM",
        cells: [
          { slotKey: "1", detectorType: "RAS", value: "" },
          { slotKey: "2", detectorType: "RAS", value: "" },
          { slotKey: "3", detectorType: "ZD", value: "" },
          { slotKey: "4", detectorType: "ZD", value: "" },
          { slotKey: "5", detectorType: "ZD", value: "" },
          { slotKey: "6", detectorType: "DB", value: "" },
          { slotKey: "7", detectorType: "DB", value: "" },
          { slotKey: "8", detectorType: "TDIF", value: "" }
        ]
      },
      {
        groupId: "GRP 02",
        groupName: "Meldergruppe Serverraum",
        groupType: "TECH",
        cells: [
          { slotKey: "1", detectorType: "ZD", value: "" },
          { slotKey: "2", detectorType: "ZD", value: "" },
          { slotKey: "3", detectorType: "DB", value: "" },
          { slotKey: "4", detectorType: "DB", value: "" },
          { slotKey: "5", detectorType: "-", value: "" },
          { slotKey: "6", detectorType: "-", value: "" },
          { slotKey: "7", detectorType: "RAS", value: "" },
          { slotKey: "8", detectorType: "RAS", value: "" }
        ]
      }
    ]
  },
  {
    id: "2",
    name: "Logistikzentrum West - Bau B",
    address: "Industriestraße 1, 5020 Salzburg",
    contractNumber: "V-2022-1025-X",
    interval: "Vierteljährlich",
    systemType: "SLA",
    status: "downloaded",
    isArchived: false,
    columns: ["1", "2", "3", "4", "5", "6", "7", "8"],
    applicableValues: ["Q1", "Q2", "Q3", "Q4", "Def."],
    detectorTypes: ["ZD", "DB", "RAS", "TDIF"],
    lastEditedBy: "Thomas Prantl",
    lastEditedAt: "26.05.2026",
    rows: [
      {
        groupId: "GRP 01",
        groupName: "Fassadenmelder",
        groupType: "AM",
        cells: [
          { slotKey: "1", detectorType: "RAS", value: "Q1" },
          { slotKey: "2", detectorType: "RAS", value: "Q1" },
          { slotKey: "3", detectorType: "ZD", value: "" },
          { slotKey: "4", detectorType: "ZD", value: "" },
          { slotKey: "5", detectorType: "-", value: "" },
          { slotKey: "6", detectorType: "ZD", value: "" },
          { slotKey: "7", detectorType: "ZD", value: "" },
          { slotKey: "8", detectorType: "TDIF", value: "" }
        ]
      },
      {
        groupId: "GRP 02",
        groupName: "Dachlinie West",
        groupType: "NAM",
        cells: [
          { slotKey: "1", detectorType: "ZD", value: "" },
          { slotKey: "2", detectorType: "-", value: "" },
          { slotKey: "3", detectorType: "TDIF", value: "Def." },
          { slotKey: "4", detectorType: "-", value: "" },
          { slotKey: "5", detectorType: "DB", value: "" },
          { slotKey: "6", detectorType: "DB", value: "" },
          { slotKey: "7", detectorType: "RAS", value: "" },
          { slotKey: "8", detectorType: "RAS", value: "" }
        ]
      }
    ]
  },
  {
    id: "3",
    name: "Wohnpark Am Graben",
    address: "Am Graben 42, 8010 Graz",
    contractNumber: "V-2024-0012-A",
    interval: "Halbjährlich",
    systemType: "ELA",
    status: "synchronized",
    isArchived: false,
    columns: ["1", "2", "3", "4", "5", "6", "7", "8"],
    applicableValues: ["H1", "H2", "Def."],
    detectorTypes: ["ZD", "DB", "RAS", "TDIF"],
    lastEditedBy: "Thomas Prantl",
    lastEditedAt: "27.05.2026",
    rows: [
      {
        groupId: "GRP 01",
        groupName: "Zentraltreppenhaus",
        groupType: "AM",
        cells: [
          { slotKey: "1", detectorType: "RAS", value: "H1" },
          { slotKey: "2", detectorType: "RAS", value: "H1" },
          { slotKey: "3", detectorType: "ZD", value: "H2" },
          { slotKey: "4", detectorType: "ZD", value: "H2" },
          { slotKey: "5", detectorType: "ZD", value: "Def." },
          { slotKey: "6", detectorType: "DB", value: "H1" },
          { slotKey: "7", detectorType: "DB", value: "H1" },
          { slotKey: "8", detectorType: "TDIF", value: "H2" }
        ]
      }
    ]
  },
  {
    id: "4",
    name: "Sparkasse Filiale Hauptplatz",
    address: "Hauptplatz 10, 4020 Linz",
    contractNumber: "V-2025-4412-B",
    interval: "Jährlich",
    systemType: "EMA",
    status: "ready_to_download",
    isArchived: false,
    columns: ["1", "2", "3", "4"],
    applicableValues: ["CHECK", "Def."],
    detectorTypes: ["BWM", "ZK", "RSK", "Lichtschranke"],
    lastEditedBy: "Matthias Huber",
    lastEditedAt: "10.05.2026",
    rows: [
      {
        groupId: "GRP 01",
        groupName: "Foyer & Geldausgabe",
        groupType: "TECH",
        cells: [
          { slotKey: "1", detectorType: "BWM", value: "" },
          { slotKey: "2", detectorType: "ZK", value: "" },
          { slotKey: "3", detectorType: "RSK", value: "" },
          { slotKey: "4", detectorType: "Lichtschranke", value: "" }
        ]
      }
    ]
  },
  {
    id: "5",
    name: "Landesklinikum St. Pölten",
    address: "Klinikstraße 3, 3100 St. Pölten",
    contractNumber: "V-2026-0815-L",
    interval: "Halbjährlich",
    systemType: "LIRA",
    status: "ready_to_download",
    isArchived: false,
    columns: ["1", "2", "3", "4"],
    applicableValues: ["H1", "H2", "Def."],
    detectorTypes: ["AT", "BT", "ZT", "EM"],
    lastEditedBy: "Sophia Reiter",
    lastEditedAt: "18.05.2026",
    rows: [
      {
        groupId: "GRP 01",
        groupName: "Station 4A (Geriatrie)",
        groupType: "VS",
        cells: [
          { slotKey: "1", detectorType: "AT", value: "" },
          { slotKey: "2", detectorType: "BT", value: "" },
          { slotKey: "3", detectorType: "ZT", value: "" },
          { slotKey: "4", detectorType: "EM", value: "" }
        ]
      }
    ]
  },
  {
    id: "6",
    name: "Zentralstelle für Asylsuchende (ZAST) - Magdeburg",
    address: "Halberstädter Str. 40, 39112 Magdeburg",
    contractNumber: "V-ESSER-5524-K",
    interval: "Halbjährlich",
    systemType: "BMA",
    status: "ready_to_download",
    isArchived: false,
    columns: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
    applicableValues: ["CHECK", "Def."],
    detectorTypes: ["AM", "DKM", "Wärme", "IO", "Koppler"],
    lastEditedBy: "Thomas Prantl",
    lastEditedAt: "03.06.2026",
    subSystems: [
      {
        id: "zast-sys-1",
        name: "Anlage 1: ZAST Küche",
        rows: [
          {
            groupId: "MG 401",
            groupName: "ATM Küche BMZ",
            groupType: "AM",
            cells: [
              { slotKey: "1", detectorType: "AM", value: "" },
              { slotKey: "2", detectorType: "-", value: "" },
              { slotKey: "3", detectorType: "-", value: "" },
              { slotKey: "4", detectorType: "-", value: "" },
              { slotKey: "5", detectorType: "-", value: "" },
              { slotKey: "6", detectorType: "-", value: "" },
              { slotKey: "7", detectorType: "-", value: "" },
              { slotKey: "8", detectorType: "-", value: "" },
              { slotKey: "9", detectorType: "-", value: "" },
              { slotKey: "10", detectorType: "-", value: "" }
            ]
          },
          {
            groupId: "MG 402",
            groupName: "Dkm Küche R115",
            groupType: "DKM",
            cells: [
              { slotKey: "1", detectorType: "DKM", value: "" },
              { slotKey: "2", detectorType: "DKM", value: "" },
              { slotKey: "3", detectorType: "-", value: "" },
              { slotKey: "4", detectorType: "-", value: "" },
              { slotKey: "5", detectorType: "-", value: "" },
              { slotKey: "6", detectorType: "-", value: "" },
              { slotKey: "7", detectorType: "-", value: "" },
              { slotKey: "8", detectorType: "-", value: "" },
              { slotKey: "9", detectorType: "-", value: "" },
              { slotKey: "10", detectorType: "-", value: "" }
            ]
          },
          {
            groupId: "MG 406",
            groupName: "Dkm Küche R119",
            groupType: "DKM",
            cells: [
              { slotKey: "1", detectorType: "DKM", value: "" },
              { slotKey: "2", detectorType: "DKM", value: "" },
              { slotKey: "3", detectorType: "-", value: "" },
              { slotKey: "4", detectorType: "-", value: "" },
              { slotKey: "5", detectorType: "-", value: "" },
              { slotKey: "6", detectorType: "-", value: "" },
              { slotKey: "7", detectorType: "-", value: "" },
              { slotKey: "8", detectorType: "-", value: "" },
              { slotKey: "9", detectorType: "-", value: "" },
              { slotKey: "10", detectorType: "-", value: "" }
            ]
          },
          {
            groupId: "MG 407",
            groupName: "Atm Küche R121",
            groupType: "Wärme",
            cells: [
              { slotKey: "1", detectorType: "Wärme", value: "" },
              { slotKey: "2", detectorType: "-", value: "" },
              { slotKey: "3", detectorType: "-", value: "" },
              { slotKey: "4", detectorType: "-", value: "" },
              { slotKey: "5", detectorType: "-", value: "" },
              { slotKey: "6", detectorType: "-", value: "" },
              { slotKey: "7", detectorType: "-", value: "" },
              { slotKey: "8", detectorType: "-", value: "" },
              { slotKey: "9", detectorType: "-", value: "" },
              { slotKey: "10", detectorType: "-", value: "" }
            ]
          },
          {
            groupId: "MG 408",
            groupName: "Atm Küche R116-118",
            groupType: "Wärme",
            cells: [
              { slotKey: "1", detectorType: "Wärme", value: "" },
              { slotKey: "2", detectorType: "AM", value: "" },
              { slotKey: "3", detectorType: "-", value: "" },
              { slotKey: "4", detectorType: "-", value: "" },
              { slotKey: "5", detectorType: "-", value: "" },
              { slotKey: "6", detectorType: "-", value: "" },
              { slotKey: "7", detectorType: "-", value: "" },
              { slotKey: "8", detectorType: "-", value: "" },
              { slotKey: "9", detectorType: "-", value: "" },
              { slotKey: "10", detectorType: "-", value: "" }
            ]
          }
        ]
      },
      {
        id: "zast-sys-2",
        name: "Anlage 2: ZAST HBS-Wache",
        rows: [
          {
            groupId: "MG 001",
            groupName: "Atm Wache Flur ZD R35,43",
            groupType: "AM",
            cells: [
              { slotKey: "1", detectorType: "AM", value: "CHECK" },
              { slotKey: "2", detectorType: "AM", value: "CHECK" },
              { slotKey: "3", detectorType: "AM", value: "" },
              { slotKey: "4", detectorType: "-", value: "" },
              { slotKey: "5", detectorType: "-", value: "" },
              { slotKey: "6", detectorType: "-", value: "" },
              { slotKey: "7", detectorType: "-", value: "" },
              { slotKey: "8", detectorType: "-", value: "" },
              { slotKey: "9", detectorType: "-", value: "" },
              { slotKey: "10", detectorType: "-", value: "" }
            ]
          },
          {
            groupId: "MG 003",
            groupName: "Sirenen Block B-EG",
            groupType: "Wärme",
            cells: [
              { slotKey: "1", detectorType: "Wärme", value: "" },
              { slotKey: "2", detectorType: "Wärme", value: "" },
              { slotKey: "3", detectorType: "Wärme", value: "" },
              { slotKey: "4", detectorType: "Wärme", value: "" },
              { slotKey: "5", detectorType: "-", value: "" },
              { slotKey: "6", detectorType: "-", value: "" },
              { slotKey: "7", detectorType: "-", value: "" },
              { slotKey: "8", detectorType: "-", value: "" },
              { slotKey: "9", detectorType: "-", value: "" },
              { slotKey: "10", detectorType: "-", value: "" }
            ]
          }
        ]
      },
      {
        id: "zast-sys-3",
        name: "Anlage 3: ZAST Sporthalle",
        rows: [
          {
            groupId: "MG 737",
            groupName: "Winterbau W6",
            groupType: "Wärme",
            cells: [
              { slotKey: "1", detectorType: "Wärme", value: "" },
              { slotKey: "2", detectorType: "Wärme", value: "" },
              { slotKey: "3", detectorType: "Wärme", value: "" },
              { slotKey: "4", detectorType: "Wärme", value: "" },
              { slotKey: "5", detectorType: "Wärme", value: "CHECK" },
              { slotKey: "6", detectorType: "-", value: "" },
              { slotKey: "7", detectorType: "-", value: "" },
              { slotKey: "8", detectorType: "-", value: "" },
              { slotKey: "9", detectorType: "-", value: "" },
              { slotKey: "10", detectorType: "-", value: "" }
            ]
          },
          {
            groupId: "MG 738",
            groupName: "Winterbau W4",
            groupType: "Wärme",
            cells: [
              { slotKey: "1", detectorType: "Wärme", value: "" },
              { slotKey: "2", detectorType: "Wärme", value: "" },
              { slotKey: "3", detectorType: "Wärme", value: "" },
              { slotKey: "4", detectorType: "Wärme", value: "" },
              { slotKey: "5", detectorType: "Wärme", value: "" },
              { slotKey: "6", detectorType: "Wärme", value: "" },
              { slotKey: "7", detectorType: "Wärme", value: "" },
              { slotKey: "8", detectorType: "Wärme", value: "" },
              { slotKey: "9", detectorType: "Wärme", value: "" },
              { slotKey: "10", detectorType: "AM", value: "" }
            ]
          }
        ]
      },
      {
        id: "zast-sys-4",
        name: "Anlage 4: ZAST HBS Block B",
        rows: [
          {
            groupId: "MG 203",
            groupName: "DKM Block B-EG TH1",
            groupType: "DKM",
            cells: [
              { slotKey: "1", detectorType: "DKM", value: "" },
              { slotKey: "2", detectorType: "-", value: "" },
              { slotKey: "3", detectorType: "-", value: "" },
              { slotKey: "4", detectorType: "-", value: "" },
              { slotKey: "5", detectorType: "-", value: "" },
              { slotKey: "6", detectorType: "-", value: "" },
              { slotKey: "7", detectorType: "-", value: "" },
              { slotKey: "8", detectorType: "-", value: "" },
              { slotKey: "9", detectorType: "-", value: "" },
              { slotKey: "10", detectorType: "-", value: "" }
            ]
          }
        ]
      },
      {
        id: "zast-sys-5",
        name: "Anlage 5: ZAST Block C",
        rows: [
          {
            groupId: "MG 302",
            groupName: "DKM Block C EG",
            groupType: "DKM",
            cells: [
              { slotKey: "1", detectorType: "DKM", value: "" },
              { slotKey: "2", detectorType: "-", value: "" },
              { slotKey: "3", detectorType: "-", value: "" },
              { slotKey: "4", detectorType: "-", value: "" },
              { slotKey: "5", detectorType: "-", value: "" },
              { slotKey: "6", detectorType: "-", value: "" },
              { slotKey: "7", detectorType: "-", value: "" },
              { slotKey: "8", detectorType: "-", value: "" },
              { slotKey: "9", detectorType: "-", value: "" },
              { slotKey: "10", detectorType: "-", value: "" }
            ]
          }
        ]
      },
      {
        id: "zast-sys-6",
        name: "Anlage 6: ZAST HBS Block A + Container",
        rows: [
          {
            groupId: "MG 101",
            groupName: "ATM Block A-EG Flur ZD",
            groupType: "AM",
            cells: [
              { slotKey: "1", detectorType: "AM", value: "" },
              { slotKey: "2", detectorType: "AM", value: "" },
              { slotKey: "3", detectorType: "AM", value: "" },
              { slotKey: "4", detectorType: "AM", value: "" },
              { slotKey: "5", detectorType: "-", value: "" },
              { slotKey: "6", detectorType: "-", value: "" },
              { slotKey: "7", detectorType: "-", value: "" },
              { slotKey: "8", detectorType: "-", value: "" },
              { slotKey: "9", detectorType: "-", value: "" },
              { slotKey: "10", detectorType: "-", value: "" }
            ]
          }
        ]
      }
    ],
    rows: [
      {
        groupId: "MG 401",
        groupName: "ATM Küche BMZ",
        groupType: "AM",
        cells: [
          { slotKey: "1", detectorType: "AM", value: "" },
          { slotKey: "2", detectorType: "-", value: "" },
          { slotKey: "3", detectorType: "-", value: "" },
          { slotKey: "4", detectorType: "-", value: "" },
          { slotKey: "5", detectorType: "-", value: "" },
          { slotKey: "6", detectorType: "-", value: "" },
          { slotKey: "7", detectorType: "-", value: "" },
          { slotKey: "8", detectorType: "-", value: "" },
          { slotKey: "9", detectorType: "-", value: "" },
          { slotKey: "10", detectorType: "-", value: "" }
        ]
      },
      {
        groupId: "MG 402",
        groupName: "Dkm Küche R115",
        groupType: "DKM",
        cells: [
          { slotKey: "1", detectorType: "DKM", value: "" },
          { slotKey: "2", detectorType: "DKM", value: "" },
          { slotKey: "3", detectorType: "-", value: "" },
          { slotKey: "4", detectorType: "-", value: "" },
          { slotKey: "5", detectorType: "-", value: "" },
          { slotKey: "6", detectorType: "-", value: "" },
          { slotKey: "7", detectorType: "-", value: "" },
          { slotKey: "8", detectorType: "-", value: "" },
          { slotKey: "9", detectorType: "-", value: "" },
          { slotKey: "10", detectorType: "-", value: "" }
        ]
      }
    ]
  }
];

export interface UserItem {
  id: string;
  name: string;
  role: string;
  username: string;
  password: string;
  codeword: string;
  status: "Aktiv" | "Gesperrt";
}

export interface Tenant {
  id: string;
  name: string;
  serverAddress: string;
  serverPort: string;
  vlanName: string;
  sambaPath: string;
  protocols: ProtocolItem[];
  simulatedArchives: any[];
  users: UserItem[];
  logoUrl?: string;
}

export default function App() {
  // Device Emulator State
  const [deviceMode, setDeviceMode] = useState<"phone" | "tablet">("phone");
  const [activePerspective, setActivePerspective] = useState<"technician" | "webui">("technician");
  const [isAndroidScannerOpen, setIsAndroidScannerOpen] = useState(false);

  // Tenancy State
  const [activeTenantId, setActiveTenantId] = useState<string>("tenant-1");
  const [tenants, setTenants] = useState<Tenant[]>([
    {
      id: "tenant-1",
      name: "Hauptmandant (Wien)",
      serverAddress: "https://field-service.corp.internal",
      serverPort: "8443",
      vlanName: "VLAN_10_SECURE",
      sambaPath: "\\\\samba.corp.internal\\archival\\",
      protocols: INITIAL_PROTOCOLS,
      simulatedArchives: [
        {
          id: "arc-1",
          contractNumber: "V-2023-9941-Z",
          year: "2025",
          halfYear: "H2",
          version: 1,
          filename: "V-2023-9941-Z_V1.pdf",
          dateArchived: "15.11.2025 14:02",
          archivedBy: "Thomas Prantl",
          objectName: "Siemens AG - Campus Nord"
        },
        {
          id: "arc-2",
          contractNumber: "V-2024-0012-A",
          year: "2025",
          halfYear: "H1",
          version: 1,
          filename: "V-2024-0012-A_V1.pdf",
          dateArchived: "10.05.2025 09:12",
          archivedBy: "Sophia Reiter",
          objectName: "Wohnpark Am Graben"
        },
        {
          id: "arc-3",
          contractNumber: "V-2024-0012-A",
          year: "2025",
          halfYear: "H2",
          version: 2,
          filename: "V-2024-0012-A_V2.pdf",
          dateArchived: "15.11.2025 15:30",
          archivedBy: "Sophia Reiter",
          objectName: "Wohnpark Am Graben"
        }
      ],
      users: [
        { id: "u-1", name: "Thomas Prantl", role: "Aussendienst-Techniker", username: "TECH_UNIT_99283", password: "MusterPass183!!", codeword: "77-XJ-900-PLX-22", status: "Aktiv" },
        { id: "u-2", name: "Sophia Reiter", role: "Aussendienst-Techniker", username: "TECH_SR_12", password: "SophiaSafe456!", codeword: "12-AA-441-SOP-99", status: "Aktiv" },
        { id: "u-3", name: "Matthias Huber", role: "Büro-Administrator", username: "TECH_MH_33", password: "HuberPass789!_", codeword: "33-BB-552-MAT-88", status: "Aktiv" }
      ]
    },
    {
      id: "tenant-2",
      name: "Mandant West (Innsbruck)",
      serverAddress: "https://west-service.corp.internal",
      serverPort: "8080",
      vlanName: "VLAN_12_INNSBRUCK",
      sambaPath: "\\\\samba.corp.internal\\archival_west\\",
      protocols: [
        {
          id: "w-1",
          name: "Alpen-Congress-Center-West",
          address: "Rennweg 3, 6020 Innsbruck",
          contractNumber: "V-2024-INNS-A",
          interval: "Halbjährlich",
          systemType: "BMA",
          status: "ready_to_download",
          columns: ["1", "2", "3", "4"],
          applicableValues: ["H1", "H2", "Def."],
          detectorTypes: ["ZD", "DB", "RAS", "LINEAR"],
          rows: [
            {
              groupId: "GRP 01",
              groupName: "Hauptsaal & Bühne",
              groupType: "NAM",
              cells: [
                { slotKey: "1", detectorType: "RAS", value: "" },
                { slotKey: "2", detectorType: "ZD", value: "" },
                { slotKey: "3", detectorType: "DB", value: "" },
                { slotKey: "4", detectorType: "-", value: "" }
              ]
            }
          ]
        }
      ],
      simulatedArchives: [
        {
          id: "arc-w1",
          contractNumber: "V-2024-INNS-A",
          year: "2025",
          halfYear: "H2",
          version: 1,
          filename: "V-2024-INNS-A_V1.pdf",
          dateArchived: "12.11.2025 11:45",
          archivedBy: "Sophia Reiter",
          objectName: "Alpen-Congress-Center-West"
        }
      ],
      users: [
        { id: "u-4", name: "Andreas Hofer", role: "Aussendienst-Techniker", username: "TECH_WEST_11", password: "HoferPass991!_", codeword: "66-YJ-200-HOF-11", status: "Aktiv" },
        { id: "u-5", name: "Sophia Reiter", role: "Aussendienst-Techniker", username: "TECH_SR_12", password: "SophiaSafe456!", codeword: "12-AA-441-SOP-99", status: "Aktiv" }
      ]
    }
  ]);

  const [protocols, setProtocols] = useState<ProtocolItem[]>(tenants[0].protocols);
  const [simulatedArchives, setSimulatedArchives] = useState<any[]>(tenants[0].simulatedArchives);

  // App Config form inputs matching Stitch screen 1
  const [serverAddress, setServerAddress] = useState("https://field-service.corp.internal");
  const [serverPort, setServerPort] = useState("8443");
  const [username, setUsername] = useState("TECH_UNIT_99283");
  const [password, setPassword] = useState("MusterPass183!!");
  const [globalMainkey, setGlobalMainkey] = useState("MASTER-77-VDS-SECURE-KEY");
  const [codeword, setCodeword] = useState("MASTER-77-VDS-SECURE-KEY");

  // Synchronise state changes back to tenants structure
  useEffect(() => {
    setTenants(prev => prev.map(t => {
      if (t.id === activeTenantId) {
        return {
          ...t,
          protocols: protocols,
          simulatedArchives: simulatedArchives,
          serverAddress: serverAddress,
          serverPort: serverPort
        };
      }
      return t;
    }));
  }, [protocols, simulatedArchives, activeTenantId, serverAddress, serverPort]);

  const handleSwapTenant = (newId: string) => {
    const oldId = activeTenantId;
    
    // Save current active credentials to old tenant
    setTenants(prev => prev.map(t => {
      if (t.id === oldId) {
        return {
          ...t,
          protocols: protocols,
          simulatedArchives: simulatedArchives,
          serverAddress: serverAddress,
          serverPort: serverPort
        };
      }
      return t;
    }));

    const target = tenants.find(t => t.id === newId);
    if (target) {
      setActiveTenantId(newId);
      setProtocols(target.protocols);
      setSimulatedArchives(target.simulatedArchives);
      setServerAddress(target.serverAddress);
      setServerPort(target.serverPort);
      // Auto fill settings fields with first active user of the new company
      const activeTech = target.users.find(u => u.status === "Aktiv" && u.role === "Aussendienst-Techniker") || target.users[0];
      if (activeTech) {
        setUsername(activeTech.username);
        setPassword(activeTech.password);
        setCodeword(globalMainkey);
      }
    }
  };

  const [currentScreen, setCurrentScreen] = useState<string>("settings"); // settings, search, downloaded, inspection, editor, archive
  const [deviceOffline, setDeviceOffline] = useState(false);
  const [deviceLiveModus, setDeviceLiveModus] = useState(false);
  const [showConfigToast, setShowConfigToast] = useState(false);

  // Dynamic system type definitions mapping to available detector types
  const [systemTypeSettings, setSystemTypeSettings] = useState<Record<string, string[]>>(() => {
    try {
      const stored = localStorage.getItem("systemTypeSettings");
      if (stored) return JSON.parse(stored);
    } catch (_) {}
    return {
      BMA: ["-", "Normal", "ZD", "ZB", "TDIFF", "TMAX", "RAS", "LINEAR"],
      EMA: ["-", "Normal", "BWM", "ZK", "RSK", "Lichtschranke", "Glasbruch", "Körperschall"],
      ELA: ["-", "Normal", "Innenlautsprecher", "Außenlautsprecher"],
      LIRA: ["-", "Normal", "AT", "BT", "ZT", "EM", "PN", "Display"],
      SLA: ["-", "Normal", "ZD", "DB", "RAS", "TDIF"] // Sprinkler SLA original fallback
    };
  });

  const [systemTypeHardwareConfigs, setSystemTypeHardwareConfigs] = useState<Record<string, { hasHardware: boolean; headers: string[] }>>(() => {
    try {
      const stored = localStorage.getItem("systemTypeHardwareConfigs");
      if (stored) return JSON.parse(stored);
    } catch (_) {}
    return {
      BMA: {
        hasHardware: true,
        headers: ["Bauteil/Ring", "Typ", "Störung", "Unterbrechung", "Softwarestand", "Serie"]
      },
      EMA: {
        hasHardware: false,
        headers: ["Bauteil/Melderlinie", "Typ/Zustand", "Sabotage", "Verkabelung", "Serie"]
      },
      ELA: {
        hasHardware: false,
        headers: ["Verstärkerstufe", "Lautsprechergruppe", "Störungskompensiert", "Ersatzweg", "Serie"]
      },
      LIRA: {
        hasHardware: false,
        headers: ["Zimmerterminal", "Tastertyp", "Funktionsprüfung", "Quittungston", "Serie"]
      },
      SLA: {
        hasHardware: false,
        headers: ["Drucküberwachung", "Kompressoransteuerung", "Sperrventil", "Serie"]
      }
    };
  });

  const [systemTypeMetadata, setSystemTypeMetadata] = useState<Record<string, { name: string; color: string }>>(() => {
    try {
      const stored = localStorage.getItem("systemTypeMetadata");
      if (stored) return JSON.parse(stored);
    } catch (_) {}
    return {
      BMA: { name: "Brandmelde Anlage", color: "#003d9b" },
      EMA: { name: "Einbruchmelde Anlage", color: "#e11d48" },
      ELA: { name: "Elektroakustische Lautsprecheranlage", color: "#0d9488" },
      LIRA: { name: "Lichtrufanlage", color: "#4f46e5" },
      SLA: { name: "Sprinklerlöschanlage", color: "#ea580c" }
    };
  });

  // Save to localStorage effects
  useEffect(() => {
    localStorage.setItem("systemTypeSettings", JSON.stringify(systemTypeSettings));
  }, [systemTypeSettings]);

  useEffect(() => {
    localStorage.setItem("systemTypeHardwareConfigs", JSON.stringify(systemTypeHardwareConfigs));
  }, [systemTypeHardwareConfigs]);

  useEffect(() => {
    localStorage.setItem("systemTypeMetadata", JSON.stringify(systemTypeMetadata));
  }, [systemTypeMetadata]);

  const renderSystemTypeBadge = (type: string) => {
    const meta = systemTypeMetadata[type] || { name: type, color: "#64748b" };
    return (
      <span 
        className="text-[10px] font-mono px-2 py-0.5 rounded font-bold border transition-all duration-200 uppercase tracking-wide"
        style={{
          backgroundColor: `${meta.color}15`,
          color: meta.color,
          borderColor: `${meta.color}40`
        }}
        title={meta.name}
      >
        {type}
      </span>
    );
  };

  const [isFetchingDefinitions, setIsFetchingDefinitions] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const handleManualSyncAll = () => {
    if (isSyncingAll) return;
    setIsSyncingAll(true);
    triggerToast("Synchronisierung mit Server gestartet...", "info");

    setTimeout(() => {
      setProtocols(prev => prev.map(p => {
        // any pending upload protocols get synced back
        if (p.status === "upload_pending") {
          return { ...p, status: "synchronized" };
        }
        return p;
      }));
      setIsSyncingAll(false);
      setPullDistance(0);
      triggerToast("SQLite-Datenbank erfolgreich abgeglichen: Alle Protokolle auf dem neuesten Stand!", "success");
    }, 1800);
  };

  // Unified Toast System state
  const [toast, setToast] = useState<{ show: boolean; message: string; type: "success" | "info" | "warning" }>({
    show: false,
    message: "",
    type: "success"
  });

  const triggerToast = (message: string, type: "success" | "info" | "warning" = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 3500);
  };
  
  // Real App lists (protocols state is defined dynamically with tenant selection above)
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProtocolId, setSelectedProtocolId] = useState<string>("2");
  
  // Active Inspection screen state
  const [activeSelectVal, setActiveSelectVal] = useState("Q1");
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [selectedGroupsForBulk, setSelectedGroupsForBulk] = useState<string[]>([]);
  const [selectedSubSystemId, setSelectedSubSystemId] = useState<string | null>(null);
  
  // Object Details modal
  const [activeModalProtocol, setActiveModalProtocol] = useState<ProtocolItem | null>(null);

  // Krypto-Playground State
  const [playCode, setPlayCode] = useState("MeinGeheimesCodewort123!");
  const [playText, setPlayText] = useState('{"user":"tech","pass":"123"}');
  const [playIv, setPlayIv] = useState("000000000000000000000000"); // 12-byte Hex (24 characters)
  const [playResKey, setPlayResKey] = useState("");
  const [playResPayload, setPlayResPayload] = useState("");
  const [copiedVect, setCopiedVect] = useState(false);

  // Synchronise Active selection variables automatically
  useEffect(() => {
    const activeProt = protocols.find(p => p.id === selectedProtocolId);
    if (activeProt) {
      if (activeProt.interval === "Halbjährlich") {
        setActiveSelectVal("H1");
      } else if (activeProt.interval === "Vierteljährlich") {
        setActiveSelectVal("Q1");
      } else {
        setActiveSelectVal("CHECK");
      }
      if (activeProt.subSystems && activeProt.subSystems.length > 0) {
        setSelectedSubSystemId(activeProt.subSystems[0].id);
      } else {
        setSelectedSubSystemId(null);
      }
    }
  }, [selectedProtocolId, protocols]);

  // Deep linking helper (queries URL params & hash on mount and hash changed)
  useEffect(() => {
    const handleDeepLink = () => {
      const params = new URLSearchParams(window.location.search);
      let targetId = params.get("id") || params.get("protocol");

      const hash = window.location.hash;
      if (!targetId && hash) {
        if (hash.startsWith("#id=")) {
          targetId = hash.slice(4);
        } else if (hash.startsWith("#download/")) {
          targetId = hash.slice(10);
        } else if (hash.includes("id=")) {
          const match = hash.match(/id=([^&]+)/);
          if (match) targetId = match[1];
        } else if (hash.length > 1) {
          // generic fallback is just the hash itself (e.g. #lira_schwabing)
          targetId = hash.slice(1);
        }
      }

      if (targetId) {
        // Clean targetId of any potential query slashes
        const cleanedId = targetId.trim().replace(/^#/, "");
        const found = protocols.find(p => p.id.toLowerCase() === cleanedId.toLowerCase() || p.contractNumber.toLowerCase() === cleanedId.toLowerCase());
        
        if (found) {
          // If not downloaded, download it automatically
          setProtocols(prev => prev.map(p => 
            p.id === found.id && p.status === "ready_to_download"
              ? { ...p, status: "synchronized" }
              : p
          ));
          setSelectedProtocolId(found.id);
          setCurrentScreen("inspection");
          triggerToast(`Deep-Link erkannt: Protokoll "${found.name}" geladen und geöffnet!`, "success");
        }
      }
    };

    // run once at startup
    handleDeepLink();

    window.addEventListener("hashchange", handleDeepLink);
    return () => window.removeEventListener("hashchange", handleDeepLink);
  }, [protocols]);

  // NEW Sorting and Filtering State for Search, Geladen & Archiv
  const [filterSystemType, setFilterSystemType] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "address" | "matchcode" | "contractNumber">("name");
  const [showSortFilterMenu, setShowSortFilterMenu] = useState(false);

  // Tracks active swipe direction per list item so opposite backdrops are hidden
  const [dragDirections, setDragDirections] = useState<Record<string, "left" | "right" | "none">>({});

  // NEW Swipe Actions Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    isDestructive?: boolean;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    confirmLabel: "Bestätigen",
    isDestructive: false
  });

  // Handle local mock search query filters, sorting, and screen assignment
  const filteredProtocols = useMemo(() => {
    let list = protocols.filter(p => {
      if (currentScreen === "downloaded") {
        // Geladen lists all downloaded or synchronised local items that are NOT manually archived yet!
        return p.status !== "ready_to_download" && !p.isArchived;
      }
      if (currentScreen === "archive") {
        // Archiv lists exclusively the files moved to archive by the user
        return p.isArchived;
      }
      // Search screen lists the whole database
      return true;
    });

    // Filter by searchQuery (Name, Address, matchcode/id, contractNumber)
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      list = list.filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.address.toLowerCase().includes(query) ||
        p.contractNumber.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query) ||
        p.systemType.toLowerCase().includes(query)
      );
    }

    // Filter by Anlagentyp (BMA, SLA, ELA)
    if (filterSystemType !== "all") {
      list = list.filter(p => p.systemType === filterSystemType);
    }

    // Sort by selected parameter
    list.sort((a, b) => {
      let fieldA = "";
      let fieldB = "";

      if (sortBy === "name") {
        fieldA = a.name;
        fieldB = b.name;
      } else if (sortBy === "address") {
        fieldA = a.address;
        fieldB = b.address;
      } else if (sortBy === "contractNumber") {
        fieldA = a.contractNumber;
        fieldB = b.contractNumber;
      } else if (sortBy === "matchcode") {
        // matchcode is a technical abbreviation key: systemType + ID + Name
        fieldA = `${a.systemType}-${a.id}-${a.name}`;
        fieldB = `${b.systemType}-${b.id}-${b.name}`;
      }

      return fieldA.localeCompare(fieldB, "de", { sensitivity: "base" });
    });

    return list;
  }, [protocols, currentScreen, searchQuery, filterSystemType, sortBy]);

  // Simulate downloading of a dynamic lists
  const handleDownload = (id: string) => {
    setProtocols(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, status: "downloaded", isArchived: false };
      }
      return p;
    }));
  };

  const handleClearCache = () => {
    setConfirmModal({
      isOpen: true,
      title: "Cache löschen?",
      message: "Möchten Sie den gesamten lokalen SQLite-Datenbank-Speicher leeren? Alle lokalen Änderungen werden auf Werkseinstellungen zurückgesetzt.",
      confirmLabel: "Ja, Cache löschen",
      isDestructive: true,
      onConfirm: () => {
        setProtocols(INITIAL_PROTOCOLS);
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Advanced Editor mutations for Group Name, ID, Gruppentyp and Cell Dropdowns
  const handleUpdateGroupId = (groupId: string, newId: string) => {
    setProtocols(prev => prev.map(p => {
      if (p.id === selectedProtocolId) {
        let updatedSubSystems = p.subSystems;
        let updatedRows = p.rows;

        if (selectedSubSystemId && updatedSubSystems) {
          updatedSubSystems = updatedSubSystems.map(sub => {
            if (sub.id === selectedSubSystemId) {
              return {
                ...sub,
                rows: sub.rows.map(r => r.groupId === groupId ? { ...r, groupId: newId } : r)
              };
            }
            return sub;
          });
        } else {
          updatedRows = p.rows.map(r => r.groupId === groupId ? { ...r, groupId: newId } : r);
        }

        return {
          ...p,
          status: "upload_pending",
          rows: updatedRows,
          subSystems: updatedSubSystems
        };
      }
      return p;
    }));
  };

  const handleUpdateGroupName = (groupId: string, newName: string) => {
    setProtocols(prev => prev.map(p => {
      if (p.id === selectedProtocolId) {
        let updatedSubSystems = p.subSystems;
        let updatedRows = p.rows;

        if (selectedSubSystemId && updatedSubSystems) {
          updatedSubSystems = updatedSubSystems.map(sub => {
            if (sub.id === selectedSubSystemId) {
              return {
                ...sub,
                rows: sub.rows.map(r => r.groupId === groupId ? { ...r, groupName: newName } : r)
              };
            }
            return sub;
          });
        } else {
          updatedRows = p.rows.map(r => r.groupId === groupId ? { ...r, groupName: newName } : r);
        }

        return {
          ...p,
          status: "upload_pending",
          rows: updatedRows,
          subSystems: updatedSubSystems
        };
      }
      return p;
    }));
  };

  const handleUpdateGroupType = (groupId: string, newType: string) => {
    setProtocols(prev => prev.map(p => {
      if (p.id === selectedProtocolId) {
        let updatedSubSystems = p.subSystems;
        let updatedRows = p.rows;

        if (selectedSubSystemId && updatedSubSystems) {
          updatedSubSystems = updatedSubSystems.map(sub => {
            if (sub.id === selectedSubSystemId) {
              return {
                ...sub,
                rows: sub.rows.map(r => r.groupId === groupId ? { ...r, groupType: newType } : r)
              };
            }
            return sub;
          });
        } else {
          updatedRows = p.rows.map(r => r.groupId === groupId ? { ...r, groupType: newType } : r);
        }

        return {
          ...p,
          status: "upload_pending",
          rows: updatedRows,
          subSystems: updatedSubSystems
        };
      }
      return p;
    }));
  };

  const handleUpdateCellDetectorType = (groupId: string, slotKey: string, newDetectorType: string) => {
    setProtocols(prev => prev.map(p => {
      if (p.id === selectedProtocolId) {
        let updatedSubSystems = p.subSystems;
        let updatedRows = p.rows;

        if (selectedSubSystemId && updatedSubSystems) {
          updatedSubSystems = updatedSubSystems.map(sub => {
            if (sub.id === selectedSubSystemId) {
              return {
                ...sub,
                rows: sub.rows.map(r => {
                  if (r.groupId === groupId) {
                    return {
                      ...r,
                      cells: r.cells.map(c => c.slotKey === slotKey ? { ...c, detectorType: newDetectorType, value: newDetectorType === "-" ? "" : c.value } : c)
                    };
                  }
                  return r;
                })
              };
            }
            return sub;
          });
        } else {
          updatedRows = p.rows.map(r => {
            if (r.groupId === groupId) {
              return {
                ...r,
                cells: r.cells.map(c => c.slotKey === slotKey ? { ...c, detectorType: newDetectorType, value: newDetectorType === "-" ? "" : c.value } : c)
              };
            }
            return r;
          });
        }

        return {
          ...p,
          status: "upload_pending",
          rows: updatedRows,
          subSystems: updatedSubSystems
        };
      }
      return p;
    }));
  };

  const handleDeleteRow = (groupId: string) => {
    setProtocols(prev => prev.map(p => {
      if (p.id === selectedProtocolId) {
        let updatedSubSystems = p.subSystems;
        let updatedRows = p.rows;

        if (selectedSubSystemId && updatedSubSystems) {
          updatedSubSystems = updatedSubSystems.map(sub => {
            if (sub.id === selectedSubSystemId) {
              return {
                ...sub,
                rows: sub.rows.filter(r => r.groupId !== groupId)
              };
            }
            return sub;
          });
        } else {
          updatedRows = p.rows.filter(r => r.groupId !== groupId);
        }

        return {
          ...p,
          status: "upload_pending",
          rows: updatedRows,
          subSystems: updatedSubSystems
        };
      }
      return p;
    }));
  };

  // Generate real symmetric AES GCM and PBKDF2 simulated representation values
  useEffect(() => {
    // Generate simulated Hex output based on code
    // PBKDF2 hash representation for playCode
    let hash = 0;
    for (let i = 0; i < playCode.length; i++) {
        hash = (hash << 5) - hash + playCode.charCodeAt(i);
        hash |= 0;
    }
    const fakeKeyHex = "d6bf2c4cdd20" + Math.abs(hash).toString(16).padStart(12, "0") + "487bf5948f95c80ef467645cf4595e0c656360c7";
    setPlayResKey(fakeKeyHex.slice(0, 64));

    // AES simulated representation (same as test vectors if code match)
    if (playCode === "MeinGeheimesCodewort123!" && playText === '{"user":"tech","pass":"123"}' && playIv === "000000000000000000000000") {
      setPlayResPayload("base64( iv[12] + cipher + tag ) -> AAAAAAAAAAAAAAAAAAAAAGV3E9Xatqscun3hAet3V6qE9R6DToM6A41g3gXb8+H0bA==");
    } else {
      // General mock base64 for other values
      const base64Str = btoa(unescape(encodeURIComponent(playText)));
      const cleanIv = playIv.padEnd(24, "0").slice(0, 24);
      setPlayResPayload(`base64_wire(${cleanIv.slice(0, 6)}... || ${base64Str.slice(0, 16)}...)`);
    }
  }, [playCode, playText, playIv]);

  // QR trigger to auto fill
  const handleApplyQrCode = () => {
    setServerAddress("https://field-service-qr.corp.local");
    setServerPort("9090");
    setUsername("TECH_QR_SCANNER");
    setPassword("ScannedPassword918!!_");
    setCodeword("99-AB-123-KLA-11");
    setShowConfigToast(true);
    setTimeout(() => setShowConfigToast(false), 4500);
  };

  // App Matrix cell edits
  const handleCellEdit = (prodId: string, groupIdx: string, slotKey: string, newValue: string) => {
    setProtocols(prev => prev.map(p => {
      if (p.id === prodId) {
        let updatedSubSystems = p.subSystems;
        let updatedRows = p.rows;

        if (selectedSubSystemId && updatedSubSystems) {
          updatedSubSystems = updatedSubSystems.map(sub => {
            if (sub.id === selectedSubSystemId) {
              return {
                ...sub,
                rows: sub.rows.map(r => {
                  if (r.groupId === groupIdx) {
                    return {
                      ...r,
                      cells: r.cells.map(c => {
                        if (c.slotKey === slotKey) {
                          return { ...c, value: c.value === newValue ? "" : newValue };
                        }
                        return c;
                      })
                    };
                  }
                  return r;
                })
              };
            }
            return sub;
          });
        } else {
          updatedRows = p.rows.map(r => {
            if (r.groupId === groupIdx) {
              return {
                ...r,
                cells: r.cells.map(c => {
                  if (c.slotKey === slotKey) {
                    return { ...c, value: c.value === newValue ? "" : newValue };
                  }
                  return c;
                })
              };
            }
            return r;
          });
        }

        return {
          ...p,
          status: "upload_pending", // mark dirty as pending sync
          lastEditedBy: "Thomas Prantl",
          lastEditedAt: new Date().toLocaleDateString("de-DE"),
          rows: updatedRows,
          subSystems: updatedSubSystems
        };
      }
      return p;
    }));
  };

  // Bulk Apply Matrix
  const handleBulkApply = (val: string) => {
    setProtocols(prev => prev.map(p => {
      if (p.id === selectedProtocolId) {
        let updatedSubSystems = p.subSystems;
        let updatedRows = p.rows;

        if (selectedSubSystemId && updatedSubSystems) {
          updatedSubSystems = updatedSubSystems.map(sub => {
            if (sub.id === selectedSubSystemId) {
              return {
                ...sub,
                rows: sub.rows.map(r => {
                  if (selectedGroupsForBulk.includes(r.groupId)) {
                    return {
                      ...r,
                      cells: r.cells.map(c => {
                        if (c.detectorType !== "-") {
                          return { ...c, value: val };
                        }
                        return c;
                      })
                    };
                  }
                  return r;
                })
              };
            }
            return sub;
          });
        } else {
          updatedRows = p.rows.map(r => {
            if (selectedGroupsForBulk.includes(r.groupId)) {
              return {
                ...r,
                cells: r.cells.map(c => {
                  if (c.detectorType !== "-") {
                    return { ...c, value: val };
                  }
                  return c;
                })
              };
            }
            return r;
          });
        }

        return {
          ...p,
          status: "upload_pending",
          lastEditedBy: "Thomas Prantl",
          lastEditedAt: new Date().toLocaleDateString("de-DE"),
          rows: updatedRows,
          subSystems: updatedSubSystems
        };
      }
      return p;
    }));
    setSelectedGroupsForBulk([]);
  };

  const handleBulkReset = () => {
    setProtocols(prev => prev.map(p => {
      if (p.id === selectedProtocolId) {
        let updatedSubSystems = p.subSystems;
        let updatedRows = p.rows;

        if (selectedSubSystemId && updatedSubSystems) {
          updatedSubSystems = updatedSubSystems.map(sub => {
            if (sub.id === selectedSubSystemId) {
              return {
                ...sub,
                rows: sub.rows.map(r => {
                  if (selectedGroupsForBulk.includes(r.groupId)) {
                    return {
                      ...r,
                      cells: r.cells.map(c => {
                        return { ...c, value: "" };
                      })
                    };
                  }
                  return r;
                })
              };
            }
            return sub;
          });
        } else {
          updatedRows = p.rows.map(r => {
            if (selectedGroupsForBulk.includes(r.groupId)) {
              return {
                ...r,
                cells: r.cells.map(c => {
                  return { ...c, value: "" };
                })
              };
            }
            return r;
          });
        }

        return {
          ...p,
          status: "upload_pending",
          lastEditedBy: "Thomas Prantl",
          lastEditedAt: new Date().toLocaleDateString("de-DE"),
          rows: updatedRows,
          subSystems: updatedSubSystems
        };
      }
      return p;
    }));
    setSelectedGroupsForBulk([]);
  };

  // Edit structure adding slot or group
  const handleAddGroupMatrix = () => {
    setProtocols(prev => prev.map(p => {
      if (p.id === selectedProtocolId) {
        let updatedSubSystems = p.subSystems;
        let updatedRows = p.rows;
        const defaultDetectorType = systemTypeSettings[p.systemType]?.[0] || "-";

        if (selectedSubSystemId && updatedSubSystems) {
          updatedSubSystems = updatedSubSystems.map(sub => {
            if (sub.id === selectedSubSystemId) {
              const nextId = sub.rows.length + 1;
              const groupNumStr = nextId.toString().padStart(2, "0");
              return {
                ...sub,
                rows: [
                  ...sub.rows,
                  {
                    groupId: `GRP ${groupNumStr}`,
                    groupName: "Hinzugefügtes Segment",
                    groupType: "NAM",
                    cells: p.columns.map(col => ({
                      slotKey: col,
                      detectorType: defaultDetectorType,
                      value: ""
                    }))
                  }
                ]
              };
            }
            return sub;
          });
        } else {
          const nextId = p.rows.length + 1;
          const groupNumStr = nextId.toString().padStart(2, "0");
          updatedRows = [
            ...p.rows,
            {
              groupId: `GRP ${groupNumStr}`,
              groupName: "Hinzugefügtes Segment",
              groupType: "NAM",
              cells: p.columns.map(col => ({
                slotKey: col,
                detectorType: defaultDetectorType,
                value: ""
              }))
            }
          ];
        }

        return {
          ...p,
          rows: updatedRows,
          subSystems: updatedSubSystems
        };
      }
      return p;
    }));
  };

  const handleAddSlotColumnMatrix = () => {
    setProtocols(prev => prev.map(p => {
      if (p.id === selectedProtocolId) {
        const nextCol = (p.columns.length + 1).toString();
        const defaultDetectorType = systemTypeSettings[p.systemType]?.[0] || "-";

        let updatedSubSystems = p.subSystems;
        let updatedRows = p.rows;

        if (updatedSubSystems) {
          updatedSubSystems = updatedSubSystems.map(sub => ({
            ...sub,
            rows: sub.rows.map(r => ({
              ...r,
              cells: [
                ...r.cells,
                { slotKey: nextCol, detectorType: defaultDetectorType, value: "" }
              ]
            }))
          }));
        }

        updatedRows = p.rows.map(r => ({
          ...r,
          cells: [
            ...r.cells,
            { slotKey: nextCol, detectorType: defaultDetectorType, value: "" }
          ]
        }));

        return {
          ...p,
          columns: [...p.columns, nextCol],
          rows: updatedRows,
          subSystems: updatedSubSystems
        };
      }
      return p;
    }));
  };

  const activeProtocolObj = protocols.find(p => p.id === selectedProtocolId) || protocols[1];

  const activeRows = useMemo(() => {
    if (selectedSubSystemId && activeProtocolObj.subSystems) {
      return activeProtocolObj.subSystems.find(s => s.id === selectedSubSystemId)?.rows || activeProtocolObj.rows;
    }
    return activeProtocolObj.rows;
  }, [selectedSubSystemId, activeProtocolObj]);

  return (
    <div className="min-h-screen bg-[#faf8ff] text-[#191b23] font-sans flex flex-col">
      {/* Upper header */}
      <header className="bg-white border-b border-[#c3c6d6] px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0 font-sans">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#003d9b] flex items-center justify-center text-white font-bold">
            MP
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#003d9b]">Maintenance Pro — Emulator & Playground</h1>
            <p className="text-xs text-[#434654] font-mono">Android Studio 1:1 Kotlin Blueprint Simulator v2.4.0</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {activePerspective === "technician" ? (
            <>
              <button 
                onClick={() => setDeviceMode("phone")}
                className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${deviceMode === "phone" ? "bg-[#003d9b] text-white" : "bg-white border border-[#c3c6d6] hover:bg-[#ededf8]"}`}
              >
                <Smartphone size={14} /> Smartphone-Shell
              </button>
              <button 
                onClick={() => setDeviceMode("tablet")}
                className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${deviceMode === "tablet" ? "bg-[#003d9b] text-white" : "bg-white border border-[#c3c6d6] hover:bg-[#ededf8]"}`}
              >
                <Tablet size={14} /> Tablet-Shell
              </button>
              <button 
                onClick={handleApplyQrCode}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-[#fd8b00] text-[#603100] hover:bg-[#fd8b00]/90 flex items-center gap-1.5 transition-all shadow-sm"
                title="Simuliert das unkomplizierte Aufsetzen der gesamten App per QR-Code Scanning"
              >
                <QrCode size={14} /> Scan Test QR-Code
              </button>
            </>
          ) : (
            <span className="text-xs bg-emerald-50 text-emerald-800 font-mono font-bold border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Zentrale verbunden
            </span>
          )}
        </div>
      </header>

      {/* Sandbox Controller Switch Bar */}
      <div className="bg-slate-900 border-b border-slate-800 text-white px-6 py-3.5 flex flex-col md:flex-row justify-between items-center shrink-0 gap-3 z-30">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">Netzwerk-Umgebung Steuerung:</span>
        </div>
        <div className="flex bg-slate-800 rounded p-1 shadow-inner">
          <button 
            onClick={() => setActivePerspective("technician")}
            className={`px-3 py-1.5 rounded text-xs font-bold font-mono uppercase tracking-wide flex items-center gap-1.5 transition-all ${activePerspective === "technician" ? "bg-[#003d9b] text-white shadow-md shadow-black/20" : "text-slate-400 hover:text-slate-200"}`}
          >
            <Smartphone size={14} /> Techniker-Perspektive (Android Emulator)
          </button>
          <button 
            onClick={() => setActivePerspective("webui")}
            className={`px-3 py-1.5 rounded text-xs font-bold font-mono uppercase tracking-wide flex items-center gap-1.5 transition-all ${activePerspective === "webui" ? "bg-[#003d9b] text-white shadow-md shadow-black/20" : "text-slate-400 hover:text-slate-200"}`}
            id="btn-switch-webui"
          >
            <Database size={14} /> Büro-Leitstelle (Intranet WebUI & PDF Archiv)
          </button>
        </div>
      </div>

      {/* Main Sandbox Layout split in Android Shell (Left) and specifications details / live crypto vector comparison (Right) */}
      {activePerspective === "technician" ? (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Side: Android Device Shell Wrapper */}
        <section className="flex-1 bg-[#f3f3fd] p-4 flex items-center justify-center overflow-y-auto border-r border-[#c3c6d6]">
          
          {/* Animated Emulator Shell */}
          <div 
            className={`bg-slate-950 rounded-[40px] border-[12px] border-slate-900 shadow-2xl relative transition-all duration-300 ${
              deviceMode === "phone" ? "w-[410px] h-[840px]" : "w-[720px] h-[880px]"
            } flex flex-col overflow-hidden max-w-full`}
          >
            {/* Speaker Camera notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-5 w-40 bg-slate-900 rounded-b-xl z-[90] flex items-center justify-center">
              <div className="w-16 h-1 bg-slate-800 rounded"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-slate-800 ml-3"></div>
            </div>

            {/* Android Content Inside Shell */}
            <div className="flex-1 bg-[#faf8ff] flex flex-col overflow-hidden text-[#191b23] relative text-sm select-none">
              
              {/* TOP STATUS BAR SIMULATION */}
              <div className="bg-white px-5 pt-6 pb-2 flex justify-between items-center text-xs font-mono text-[#434654] border-b border-[#ededf8] shrink-0">
                <span className="font-bold">14:28</span>
                <div className="flex items-center gap-2">
                  {/* Offline/Online simulation button */}
                  <div 
                    onClick={() => {
                      const nextOffline = !deviceOffline;
                      setDeviceOffline(nextOffline);
                      if (nextOffline) {
                        setDeviceLiveModus(false);
                      }
                    }}
                    className={`flex items-center gap-1 cursor-pointer select-none px-2 py-0.5 rounded transition-all hover:opacity-80 active:scale-95 ${
                      deviceOffline ? "bg-red-100 text-red-700 border border-red-200" : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    }`}
                    title="Klicken, um Netzverbindung zu simulieren (Online / Offline)"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${deviceOffline ? "bg-red-500" : "bg-[#22c55e]"}`}></span>
                    <span className="font-bold text-[9px] tracking-wider">{deviceOffline ? "OFFLINE" : "ONLINE"}</span>
                  </div>

                  {/* Live-Modus simulation button */}
                  {!deviceOffline && (
                    <div 
                      onClick={() => setDeviceLiveModus(!deviceLiveModus)}
                      className={`flex items-center gap-1 cursor-pointer select-none px-2 py-0.5 rounded transition-all border hover:opacity-80 active:scale-95 ${
                        deviceLiveModus 
                          ? "bg-teal-100 text-teal-800 border-teal-300 animate-pulse" 
                          : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}
                      title="Klicken, um Live-Modus (Multiplayer) zu simulieren"
                    >
                      <span className={`w-1 h-1 rounded-full ${deviceLiveModus ? "bg-teal-500 animate-ping" : "bg-slate-400"}`}></span>
                      <span className="font-bold text-[9px] tracking-wider">{deviceLiveModus ? "LIVE-MODUS: EIN" : "LIVE-MODUS: AUS"}</span>
                    </div>
                  )}
                  <span className="opacity-60 text-[10px]">91%</span>
                </div>
              </div>

              {/* ACTIVE TOAST NOTIFICATION BLOCK (Unified Adaptive System Toast) */}
              {toast.show && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-[#2e3038] text-white px-5 py-3 rounded-md shadow-xl flex items-center gap-3 z-[250] animate-bounce w-[320px] border-l-4 border-[#fd8b00]">
                  <CheckCircle size={18} className="text-[#fd8b00] shrink-0" />
                  <span className="text-[11px] font-mono font-bold tracking-wider uppercase leading-snug">{toast.message}</span>
                </div>
              )}

              {/* ANDROID DEVICE CAMERA SCANNER SIMULATOR */}
              {isAndroidScannerOpen && (
                <div className="absolute inset-0 bg-slate-950 z-[120] flex flex-col justify-between">
                  
                  {/* Scanner Header */}
                  <div className="p-4 bg-slate-900 border-b border-slate-800 text-white flex justify-between items-center">
                    <span className="font-bold text-xs font-mono text-emerald-400 flex items-center gap-1.5 animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      QR-Kamera Scanner
                    </span>
                    <button 
                      onClick={() => setIsAndroidScannerOpen(false)}
                      className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {/* Viewfinder simulation */}
                  <div className="flex-1 flex flex-col p-4 items-center justify-center relative bg-slate-900 overflow-hidden">
                    <div className="relative w-44 h-44 border-2 border-emerald-400 rounded-lg flex items-center justify-center bg-black/40 shadow-inner">
                      
                      {/* Laser Animation Line */}
                      <div className="absolute left-0 right-0 h-0.5 bg-red-500 shadow-md shadow-red-500 animate-pulse top-1/2"></div>
                      
                      {/* Viewfinder Corners */}
                      <span className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-emerald-400" />
                      <span className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-emerald-400 font-bold" />
                      <span className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-emerald-400" />
                      <span className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-emerald-400" />
                      
                      <QrCode size={44} className="text-slate-705 animate-bounce" />
                    </div>
                    
                    <p className="text-[11px] text-slate-400 text-center font-mono mt-4 max-w-[260px] leading-relaxed">
                      Kamera wird fokussiert... Halten Sie das Einrichtungsblatt mit dem QR-Code vor das Gerät.
                    </p>
                  </div>

                  {/* Simulated users select payload */}
                  <div className="p-4 bg-slate-900 border-t border-slate-800 flex flex-col gap-2 shrink-0">
                    <span className="text-[10px] text-emerald-400 font-mono font-bold uppercase block tracking-wider">QR-Codes des aktuellen Mandanten scannen:</span>
                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                      {tenants.find(t => t.id === activeTenantId)?.users.map(u => {
                        const isLocked = u.status === "Gesperrt";
                        return (
                          <button
                            key={u.id}
                            disabled={isLocked}
                            onClick={() => {
                              if (isLocked) {
                                triggerToast(`Mitarbeiter ist gesperrt und kann sich nicht anmelden!`, "warning");
                                return;
                              }
                              // Apply credentials
                              const currentTenant = tenants.find(t => t.id === activeTenantId);
                              setServerAddress(currentTenant?.serverAddress || "https://field-service.corp.internal");
                              setServerPort(currentTenant?.serverPort || "8443");
                              setUsername(u.username);
                              setPassword(u.password);
                              setCodeword(globalMainkey);
                              setIsAndroidScannerOpen(false);
                              triggerToast(`QR gescannt: Einstellungen von ${u.name} übernommen!`, "success");
                            }}
                            className={`w-full text-left p-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-white rounded font-medium border transition-all flex justify-between items-center ${
                              isLocked ? "border-red-900 opacity-50 cursor-not-allowed" : "border-slate-700 hover:border-emerald-500"
                            }`}
                          >
                            <div>
                              <p className="font-bold text-slate-200">{u.name}</p>
                              <p className="text-[9px] text-slate-400 font-mono mt-0.5">Rolle: {u.role} • ID: {u.username}</p>
                            </div>
                            {isLocked ? (
                              <span className="bg-red-950 text-red-400 text-[8px] font-mono px-1 border border-red-800 rounded">GESPERRT</span>
                            ) : (
                              <span className="text-emerald-400 text-[10px] font-bold">Auswählen ▼</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* DYNAMIC SCREEN CONTENT DISPLAY */}
              <div className="flex-1 overflow-y-auto pb-4 relative">
                
                {/* 1. SCREEN: SETTINGS (Systemkonfiguration) */}
                {currentScreen === "settings" && (
                  <div className="p-4 flex flex-col gap-5">
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight text-[#191b23]">Systemkonfiguration</h2>
                      <p className="text-xs text-[#434654] mt-1">Verwalten Sie Ihre Serververbindungen und Authentifizierungsdaten für den Feldeinsatz.</p>
                    </div>

                                     {/* Connection Form Card */}
                      <div className="bg-white border-2 border-[#c3c6d6] p-4 flex flex-col gap-4">
                        <div className="flex justify-between items-center text-[#003d9b] border-b border-slate-100 pb-2">
                          <div className="flex items-center gap-2">
                            <Network size={18} />
                            <h3 className="font-bold text-base">Server-Verbindung</h3>
                          </div>
                          
                          {/* Scan QR Code Button */}
                          <button 
                            type="button"
                            onClick={() => setIsAndroidScannerOpen(true)}
                            className="bg-[#003d9b] hover:bg-[#002b6d] text-white text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1 transition-all shadow-sm cursor-pointer"
                            id="btn-scan-qr-android"
                          >
                            <QrCode size={13} /> QR scannen
                          </button>
                        </div>

                        {/* Mandant Picker inside settings */}
                        <div className="bg-[#f0f2fd]/60 border border-slate-200 p-2.5 rounded flex flex-col gap-1">
                          <label className="text-[10px] uppercase font-mono font-bold text-slate-500">Aktiver Mandant (Firma)</label>
                          <select 
                            value={activeTenantId}
                            onChange={(e) => handleSwapTenant(e.target.value)}
                            className="w-full text-xs h-9 bg-white border border-slate-300 rounded font-bold px-2 text-[#003d9b] focus:outline-none"
                            id="select-tenant-android"
                          >
                            {tenants.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                          <p className="text-[9px] text-[#434654] italic">Wechselt Datenbank-Partition, Samba-Pfade und Mitarbeiterdaten.</p>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                          <div className="col-span-3 flex flex-col gap-1">
                            <label className="text-[10px] uppercase font-mono font-bold text-[#434654] px-1">Server Address</label>
                            <input 
                              type="text" 
                              className="h-11 bg-[#f3f3fd] border border-[#c3c6d6] px-3 font-mono text-xs focus:outline-none focus:border-[#fd8b00]"
                              value={serverAddress}
                              onChange={(e) => setServerAddress(e.target.value)}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase font-mono font-bold text-[#434654] px-1">Port</label>
                            <input 
                              type="number" 
                              className="h-11 bg-[#f3f3fd] border border-[#c3c6d6] px-2 font-mono text-xs focus:outline-none focus:border-[#fd8b00]"
                              value={serverPort}
                              onChange={(e) => setServerPort(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] uppercase font-mono font-bold text-[#434654] px-1">Username</label>
                          <input 
                            type="text" 
                            className="h-11 bg-[#f3f3fd] border border-[#c3c6d6] px-3 font-mono text-xs focus:outline-none focus:border-[#fd8b00]"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] uppercase font-mono font-bold text-[#434654] px-1">Password</label>
                          <input 
                            type="password" 
                            className="h-11 bg-[#f3f3fd] border border-[#c3c6d6] px-3 font-mono text-xs focus:outline-none focus:border-[#fd8b00]"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] uppercase font-mono font-bold text-[#434654] px-1">Mainkey (Codewort)</label>
                          <input 
                            type="text" 
                            className="h-11 bg-[#f3f3fd] border border-[#c3c6d6] px-3 font-mono text-xs focus:outline-none focus:border-[#fd8b00]"
                            value={codeword}
                            onChange={(e) => setCodeword(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Diagnostic status block */}
                      <div className="bg-[#e7e7f2] border border-[#c3c6d6] p-4 flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-[#003d9b] text-white flex items-center justify-center font-bold text-lg">
                            MP
                          </div>
                          <div>
                            <p className="font-bold leading-none">Maintenance Pro</p>
                            <p className="text-xs text-[#434654] font-mono mt-1">ID: 99283-FS</p>
                          </div>
                        </div>

                        <div className="border-t border-[#c3c6d6] pt-3 flex flex-col gap-2 font-mono text-xs">
                          <div className="flex justify-between items-center">
                            <span>Device Status</span>
                            <span className="bg-[#22c55e] text-white text-[10px] px-2 py-0.5 font-bold flex items-center gap-1">
                              ONLINE
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>App Version</span>
                            <span className="font-bold">V.2.4.0</span>
                          </div>
                        </div>
                      </div>

                      {/* Warning advisory block */}
                      <div className="bg-amber-50 border-l-4 border-[#fd8b00] p-4 flex gap-3">
                        <Info size={18} className="text-[#904d00] shrink-0" />
                        <p className="text-xs text-[#603100]">Änderungen an der Server-Konfiguration erfordern einen Neustart der App für die vollständige Synchronisierung.</p>
                      </div>

                      {/* Server definitions fetcher */}
                      <div className="bg-[#ededf8] border-2 border-[#c3c6d6] p-4 flex flex-col gap-3">
                        <div>
                          <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wide font-mono">Server-Anlagendefinitionen</h4>
                          <p className="text-[11px] text-[#434654] mt-1">
                            Aktualisieren Sie die zulässigen Meldertypen (BMA, EMA, ELA, LIRA) direkt vom Zentral-Server.
                          </p>
                        </div>
                        <button
                          disabled={isFetchingDefinitions}
                          onClick={() => {
                            setIsFetchingDefinitions(true);
                            setTimeout(() => {
                              setIsFetchingDefinitions(false);
                              const typeKeys = Object.keys(systemTypeSettings).join(", ");
                              triggerToast(`Anlagendefinitionen erfolgreich bezogen (${typeKeys})!`, "success");
                            }, 1200);
                          }}
                          className="h-10 bg-[#003d9b] text-white hover:bg-[#003d9b]/90 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm rounded disabled:opacity-50"
                        >
                          <RefreshCw size={14} className={isFetchingDefinitions ? "animate-spin" : ""} />
                          {isFetchingDefinitions ? "Lade vom Server..." : "Anlagentypen neu laden"}
                        </button>
                      </div>

                      {/* Main screen settings actions */}
                      <div className="flex justify-between items-center pt-2">
                        <button 
                          onClick={handleClearCache}
                          className="h-11 px-4 border border-[#ba1a1a] text-[#ba1a1a] hover:bg-[#ffdad6] font-semibold text-xs flex items-center gap-1.5 transition-colors"
                        >
                          <Trash2 size={14} /> Cache löschen
                        </button>

                        <button 
                          onClick={() => {
                            triggerToast("Systemkonfiguration erfolgreich gespeichert!", "success");
                          }}
                          className="h-11 px-8 bg-[#fd8b00] text-[#603100] font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                        >
                          <Save size={14} /> Speichern
                        </button>
                      </div>

                    </div>
                )}

                {/* UNIFIED SEARCH AND FILTER HEADER helper */}
                {((() => {
                  if (currentScreen !== "search" && currentScreen !== "downloaded" && currentScreen !== "archive") return null;
                  return (
                    <div className="bg-[#f3f3fd] border-b border-[#c3c6d6] p-3 sticky top-0 z-40 flex flex-col gap-2 shrink-0">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#737685]" />
                          <input 
                            type="text" 
                            placeholder="Suche (Name, Adresse, Vertrag, Typ...)"
                            className="w-full h-11 pl-10 pr-4 bg-white border border-[#c3c6d6] focus:border-[#003d9b] focus:outline-none rounded text-xs transition-colors"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                        </div>
                        <button 
                          onClick={() => setShowSortFilterMenu(!showSortFilterMenu)}
                          className={`h-11 w-11 flex items-center justify-center rounded border transition-colors ${
                            showSortFilterMenu ? "bg-[#003d9b] border-[#003d9b] text-white" : "bg-white border-[#c3c6d6] text-[#191b23] hover:bg-[#ededf8]"
                          }`}
                          title="Sortieren und Filtern"
                        >
                          <SlidersHorizontal size={16} />
                        </button>
                      </div>

                      {showSortFilterMenu && (
                        <motion.div 
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-white border border-[#c3c6d6] rounded p-3 flex flex-col gap-2.5 shadow-md text-xs"
                        >
                          <div>
                            <div className="text-[10px] uppercase font-bold tracking-wider text-[#434654] mb-1 font-mono">Filtern nach Anlagentyp</div>
                            <div className="flex gap-1">
                              {(["all", "BMA", "SLA", "ELA"] as const).map((type) => (
                                <button
                                  key={type}
                                  onClick={() => setFilterSystemType(type)}
                                  className={`flex-1 py-1 px-2 text-[10px] font-bold font-mono border rounded transition-all ${
                                    filterSystemType === type
                                      ? "bg-[#003d9b] border-[#003d9b] text-white"
                                      : "bg-gray-50 border-gray-200 text-slate-700 hover:bg-slate-100"
                                  }`}
                                >
                                  {type === "all" ? "ALLE" : type}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <div className="text-[10px] uppercase font-bold tracking-wider text-[#434654] mb-1 font-mono">Sortieren nach</div>
                            <div className="grid grid-cols-2 gap-1.5 font-sans">
                              {[
                                { label: "Name", key: "name" as const },
                                { label: "Adresse", key: "address" as const },
                                { label: "Matchcode (ID)", key: "matchcode" as const },
                                { label: "Vertragsnummer", key: "contractNumber" as const },
                              ].map((opt) => (
                                <button
                                  key={opt.key}
                                  onClick={() => setSortBy(opt.key)}
                                  className={`py-1.5 px-2.5 text-left flex justify-between items-center rounded border text-[11px] transition-all ${
                                    sortBy === opt.key
                                      ? "bg-amber-50 border-amber-300 text-amber-900 font-bold"
                                      : "bg-white border-gray-200 text-slate-700 hover:bg-slate-50"
                                  }`}
                                >
                                  <span>{opt.label}</span>
                                  {sortBy === opt.key && <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>}
                                </button>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  );
                })())}

                {/* 2. SCREEN: SEARCH (Auslöselisten Online-Suche) */}
                {currentScreen === "search" && (
                  <div>
                    <div className="p-4 flex flex-col gap-4">
                      <div className="text-xs text-[#434654] font-mono flex justify-between items-center">
                        <span>Suchergebnisse im Netzwerkspeicher</span>
                        <button 
                          onClick={() => setDeviceOffline(!deviceOffline)}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold ${deviceOffline ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"}`}
                        >
                          {deviceOffline ? "SIMULIERE OFFLINE" : "SIMULIERE ONLINE"}
                        </button>
                      </div>

                      {/* Loop filter list results */}
                      <div className="flex flex-col gap-4">
                        {filteredProtocols.map(p => (
                          <div 
                            key={p.id} 
                            className="bg-white border-2 border-[#c3c6d6] p-4 flex flex-col gap-3 relative overflow-hidden shadow-sm"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h3 className="font-bold text-base leading-tight text-[#191b23]">{p.name}</h3>
                                <p className="text-xs font-mono text-[#737685] mt-0.5">{p.address}</p>
                              </div>
                              {renderSystemTypeBadge(p.systemType)}
                            </div>

                            <div className="grid grid-cols-2 gap-2 py-2 border-y border-[#c3c6d6] border-dashed font-mono text-xs">
                              <div>
                                <p className="text-[9px] uppercase tracking-wider text-[#737685]">VERTRAGSNUMMER</p>
                                <p className="font-bold text-[#191b23]">{p.contractNumber}</p>
                              </div>
                              <div>
                                <p className="text-[9px] uppercase tracking-wider text-[#737685]">WARTUNGSINTERVALL</p>
                                <p className="font-bold text-[#191b23]">{p.interval}</p>
                              </div>
                            </div>

                            {/* Colleague live editing simulation notification */}
                            {deviceLiveModus && p.id === "1" && (
                              <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5 rounded flex items-center gap-2 font-medium">
                                <AlertTriangle size={15} className="text-red-500 animate-pulse shrink-0" />
                                <span>Dieses Protokoll wird gerade live von einem Kollegen bearbeitet!</span>
                              </div>
                            )}

                            <div className="flex items-center justify-between mt-1">
                              {p.status === "ready_to_download" ? (
                                <>
                                  <div className="flex items-center gap-1.5 text-[#737685] text-xs font-sans">
                                    <Clock size={14} /> Bereit zum Download
                                  </div>
                                  <button 
                                    onClick={() => handleDownload(p.id)}
                                    className="h-10 px-5 bg-[#003d9b] hover:opacity-90 text-white font-bold text-xs flex items-center gap-1.5 rounded transition-all"
                                  >
                                    <Download size={14} /> Laden
                                  </button>
                                </>
                              ) : (
                                <>
                                  <div className="flex items-center gap-1.5 text-[#003d9b] bg-[#e7e7f2] border border-[#c3c6d6] px-2 py-1 rounded text-xs font-bold font-mono">
                                    <CheckCircle size={14} /> Geladen {p.isArchived && "(Archiv)"}
                                  </div>
                                  <div className="flex gap-1.5">
                                    <button 
                                      onClick={() => setActiveModalProtocol(p)}
                                      className="h-10 w-10 border border-[#c3c6d6] rounded flex items-center justify-center bg-white hover:bg-[#f3f3fd] text-[#191b23]"
                                      title="Details anzeigen"
                                    >
                                      <Info size={14} />
                                    </button>
                                    {!p.isArchived ? (
                                      <button 
                                        onClick={() => {
                                          setSelectedProtocolId(p.id);
                                          setCurrentScreen("inspection");
                                        }}
                                        className="h-10 w-10 bg-[#003d9b] text-white rounded flex items-center justify-center hover:opacity-90"
                                        title="Bearbeiten"
                                      >
                                        <Edit3 size={14} />
                                      </button>
                                    ) : (
                                      <button 
                                        onClick={() => {
                                          setSelectedProtocolId(p.id);
                                          setCurrentScreen("inspection");
                                        }}
                                        className="h-10 w-10 bg-slate-500 text-white rounded flex items-center justify-center hover:bg-slate-600"
                                        title="Ansehen (Nur Lesezugriff)"
                                      >
                                        <Eye size={14} />
                                      </button>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Search empty placeholder */}
                      {filteredProtocols.length === 0 && (
                        <div className="border border-dashed border-[#c3c6d6] p-8 text-center flex flex-col items-center gap-3">
                          <AlertTriangle size={36} className="text-[#737685]" />
                          <p className="font-bold text-base">Keine weiteren Ergebnisse</p>
                          <p className="text-xs text-[#737685]">Verfeinern Sie Ihre Suche.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. SCREEN: INSIGHT LOCAL COPIES (Geladen Offline view) */}
                {currentScreen === "downloaded" && (
                  <div className="relative bg-slate-50 min-h-full overflow-hidden">
                    
                    {/* Pull-To-Refresh indicators bar */}
                    <div 
                      className="absolute left-0 right-0 top-0 flex items-center justify-center gap-2 text-xs font-mono text-[#003d9b] bg-blue-50/80 border-b border-blue-100 transition-all z-20 overflow-hidden"
                      style={{ 
                        height: isSyncingAll ? "50px" : `${Math.min(pullDistance, 80)}px`,
                        opacity: isSyncingAll || pullDistance > 10 ? 1 : 0
                      }}
                    >
                      <RefreshCw size={14} className={isSyncingAll ? "animate-spin" : ""} style={{ transform: isSyncingAll ? undefined : `rotate(${pullDistance * 3.5}deg)` }} />
                      <span className="font-bold">
                        {isSyncingAll 
                          ? "Datenbank abgleichen..." 
                          : pullDistance > 65 
                            ? "Loslassen zum Synchronisieren" 
                            : "Herunterziehen für Sync..."}
                      </span>
                    </div>

                    <motion.div 
                      drag="y"
                      dragConstraints={{ top: 0, bottom: 0 }}
                      dragElastic={{ top: 0.6, bottom: 0 }}
                      onDrag={(e, info) => {
                        if (!isSyncingAll) {
                          setPullDistance(Math.max(0, info.offset.y));
                        }
                      }}
                      onDragEnd={(e, info) => {
                        if (!isSyncingAll && info.offset.y > 65) {
                          handleManualSyncAll();
                        }
                        setPullDistance(0);
                      }}
                      animate={{ y: isSyncingAll ? 50 : pullDistance }}
                      transition={{ type: "spring", damping: 30, stiffness: 300 }}
                      className="p-4 bg-slate-50 min-h-[calc(100vh-8rem)] touch-pan-x"
                    >
                    <div className="mb-4">
                      <h2 className="text-xl font-bold text-[#003d9b]">Lokale Arbeitskopien</h2>
                      <p className="text-xs text-[#434654] mt-1">
                        SQLite-Speicher (Room). Wischen Sie Karten nach <span className="text-red-600 font-bold font-mono">LINKS</span> zum Löschen oder nach <span className="text-emerald-700 font-bold font-mono">RECHTS</span> zum Archivieren.
                      </p>
                    </div>

                    <div className="flex flex-col gap-4">
                      {filteredProtocols.map(p => {
                        let badgeLabel = "Offline-Bereit";
                        let badgeStyle = "text-blue-700 bg-blue-50 border-blue-200";

                        if (p.status === "synchronized") {
                          badgeLabel = "Synchronisiert";
                          badgeStyle = "text-emerald-700 bg-emerald-50 border-emerald-200";
                        } else if (p.status === "upload_pending") {
                          badgeLabel = "Warte auf Sync (Geändert)";
                          badgeStyle = "text-amber-700 bg-amber-50 border-amber-200";
                        }

                        return (
                          <div key={p.id} className="relative rounded-lg overflow-hidden border border-slate-200 shadow-sm bg-transparent">
                            {/* Drag action backdrop background */}
                            <div className="absolute inset-0 flex justify-between items-center rounded-lg text-white font-mono text-xs select-none pointer-events-none">
                              {/* Left background -> exposing on drag right -> green archive */}
                              <div className={`absolute inset-y-0 left-0 bg-emerald-600 w-1/2 flex items-center pl-6 gap-2 transition-opacity duration-150 ${(dragDirections[p.id] || "none") === "right" ? "opacity-100" : "opacity-0"}`}>
                                <Archive size={16} className="animate-pulse" />
                                <span className="font-bold uppercase tracking-wider">Archivieren</span>
                              </div>
                              {/* Right background -> exposing on drag left -> red delete */}
                              <div className={`absolute inset-y-0 right-0 bg-red-600 w-1/2 flex items-center justify-end pr-6 gap-2 transition-opacity duration-150 ${(dragDirections[p.id] || "none") === "left" ? "opacity-100" : "opacity-0"}`}>
                                <span className="font-bold uppercase tracking-wider">Löschen</span>
                                <Trash2 size={16} className="animate-pulse" />
                              </div>
                            </div>

                            {/* Actual Draggable Motion container */}
                            <motion.div
                              drag="x"
                              dragConstraints={{ left: -140, right: 140 }}
                              dragElastic={0.5}
                              dragSnapToOrigin
                              onDrag={(event, info) => {
                                const dir = info.offset.x > 8 ? "right" : info.offset.x < -8 ? "left" : "none";
                                if (dragDirections[p.id] !== dir) {
                                  setDragDirections(prev => ({ ...prev, [p.id]: dir }));
                                }
                              }}
                              onDragEnd={(event, info) => {
                                setDragDirections(prev => ({ ...prev, [p.id]: "none" }));
                                const threshold = 85;
                                if (info.offset.x < -threshold) {
                                  // Swiped Left -> Löschen (Confirm)
                                  setConfirmModal({
                                    isOpen: true,
                                    title: "Vom Mobilgerät entfernen?",
                                    message: `Möchten Sie das Protokoll "${p.name}" wirklich von diesem Gerät entladen? Ungespeicherte Änderungen gehen dauerhaft verloren.`,
                                    confirmLabel: "Protokoll löschen",
                                    isDestructive: true,
                                    onConfirm: () => {
                                      setProtocols(prev => prev.map(item => item.id === p.id ? { ...item, status: "ready_to_download", isArchived: false } : item));
                                      setConfirmModal(prev => ({ ...prev, isOpen: false }));
                                    }
                                  });
                                } else if (info.offset.x > threshold) {
                                  // Swiped Right -> Archivieren (Confirm)
                                  setConfirmModal({
                                    isOpen: true,
                                    title: "In das Archiv verschieben?",
                                    message: `Möchten Sie das Protokoll "${p.name}" manuell ins Archiv verschieben? Die Bearbeitung wird danach gesperrt.`,
                                    confirmLabel: "Archivieren",
                                    isDestructive: false,
                                    onConfirm: () => {
                                      setProtocols(prev => prev.map(item => item.id === p.id ? { ...item, isArchived: true } : item));
                                      setConfirmModal(prev => ({ ...prev, isOpen: false }));
                                    }
                                  });
                                }
                              }}
                              className="relative bg-white p-4 flex flex-col gap-3 cursor-grab active:cursor-grabbing border-b border-slate-100 touch-pan-y"
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <h3 className="font-bold text-slate-900 leading-tight">{p.name}</h3>
                                  <p className="text-xs font-mono text-slate-500 mt-0.5">{p.address}</p>
                                </div>
                                {renderSystemTypeBadge(p.systemType)}
                              </div>

                              <div className="flex justify-between items-center border-t border-[#ededf8] pt-3 mt-1">
                                <div className={`text-[11px] font-mono font-bold flex items-center gap-1 px-2.5 py-1.5 rounded border ${badgeStyle}`}>
                                  <Database size={12} /> {badgeLabel}
                                </div>

                                <div className="flex gap-1.5">
                                  <button 
                                    onClick={() => setActiveModalProtocol(p)}
                                    className="h-10 w-10 border border-[#c3c6d6] rounded flex items-center justify-center bg-white hover:bg-[#f3f3fd] text-[#191b23]"
                                    title="Details anzeigen"
                                  >
                                    <Info size={16} />
                                  </button>
                                  <button 
                                    onClick={() => {
                                      setSelectedProtocolId(p.id);
                                      setCurrentScreen("inspection");
                                    }}
                                    className="h-10 w-10 bg-[#003d9b] text-white rounded flex items-center justify-center hover:bg-[#003d9b]/90"
                                    title="Bearbeiten"
                                  >
                                    <Edit3 size={16} />
                                  </button>
                                </div>
                              </div>

                              {/* Manual Helper Info Lines */}
                              <div className="flex justify-between text-[9px] font-semibold font-mono text-slate-400 mt-1 border-t border-dotted border-slate-100 pt-1 select-none pointer-events-none">
                                <span>← Links: Löschen</span>
                                <span>Rechts: Archivieren →</span>
                              </div>
                            </motion.div>
                          </div>
                        );
                      })}

                      {filteredProtocols.length === 0 && (
                        <div className="p-8 border border-dashed border-[#c3c6d6] text-center bg-white flex flex-col items-center gap-3">
                          <AlertTriangle size={24} className="text-slate-400" />
                          <p className="text-xs text-[#737685] font-mono">Keine passenden lokalen Protokolle geladen.</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </div>
              )}

                {/* 4. SCREEN: ARCHIVE SCREEN */}
                {currentScreen === "archive" && (
                  <div className="p-4 bg-slate-50 min-h-full">
                    <div className="mb-4">
                      <h2 className="text-xl font-bold text-slate-800">Archiv-Protokolle</h2>
                      <p className="text-xs text-[#434654] mt-1">
                        Historie gesicherter Protokolle. Wischen Sie Karten nach <span className="text-sky-700 font-bold font-mono">LINKS</span> zum Wiederherstellen oder nach <span className="text-red-600 font-bold font-mono">RECHTS</span> zur endgültigen SQLite-Löschung.
                      </p>
                    </div>

                    <div className="flex flex-col gap-4">
                      {filteredProtocols.map(p => (
                        <div key={p.id} className="relative rounded-lg overflow-hidden border border-slate-200 bg-transparent shadow-sm">
                          {/* Drag action backdrop background */}
                          <div className="absolute inset-0 flex justify-between items-center rounded-lg text-white font-mono text-xs select-none pointer-events-none">
                            {/* Left backdrop -> exposing on drag right -> red permanent delete */}
                            <div className={`absolute inset-y-0 left-0 bg-red-600 w-1/2 flex items-center pl-6 gap-2 transition-opacity duration-150 ${(dragDirections[p.id] || "none") === "right" ? "opacity-100" : "opacity-0"}`}>
                              <Trash2 size={16} className="animate-pulse" />
                              <span className="font-bold uppercase tracking-wider">Aus SQLite löschen</span>
                            </div>
                            {/* Right backdrop -> exposing on drag left -> blue restore */}
                            <div className={`absolute inset-y-0 right-0 bg-sky-700 w-1/2 flex items-center justify-end pr-6 gap-2 transition-opacity duration-150 ${(dragDirections[p.id] || "none") === "left" ? "opacity-100" : "opacity-0"}`}>
                              <span className="font-bold uppercase tracking-wider">Wiederherstellen</span>
                              <RotateCcw size={16} className="animate-pulse" />
                            </div>
                          </div>

                          {/* Draggable Motion container */}
                          <motion.div
                            drag="x"
                            dragConstraints={{ left: -140, right: 140 }}
                            dragElastic={0.5}
                            dragSnapToOrigin
                            onDrag={(event, info) => {
                              const dir = info.offset.x > 8 ? "right" : info.offset.x < -8 ? "left" : "none";
                              if (dragDirections[p.id] !== dir) {
                                setDragDirections(prev => ({ ...prev, [p.id]: dir }));
                              }
                            }}
                            onDragEnd={(event, info) => {
                              setDragDirections(prev => ({ ...prev, [p.id]: "none" }));
                              const threshold = 85;
                              if (info.offset.x < -threshold) {
                                // Swiped Left -> Restore/Wiederherstellen (Confirm)
                                setConfirmModal({
                                  isOpen: true,
                                  title: "In Arbeitsbereich verschieben?",
                                  message: `Möchten Sie das Protokoll "${p.name}" wieder zurück in den geladenen Bereich für aktive Protokolle verschieben?`,
                                  confirmLabel: "Wiederherstellen",
                                  isDestructive: false,
                                  onConfirm: () => {
                                    setProtocols(prev => prev.map(item => item.id === p.id ? { ...item, isArchived: false } : item));
                                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                                  }
                                });
                              } else if (info.offset.x > threshold) {
                                // Swiped Right -> Endgültig löschen (Confirm)
                                setConfirmModal({
                                  isOpen: true,
                                  title: "Vollständig entfernen?",
                                  message: `Möchten Sie das archivierte Protokoll "${p.name}" endgültig aus Ihrem lokalen SQLite-Speicher entfernen?`,
                                  confirmLabel: "Dauerhaft löschen",
                                  isDestructive: true,
                                  onConfirm: () => {
                                    setProtocols(prev => prev.map(item => item.id === p.id ? { ...item, status: "ready_to_download", isArchived: false } : item));
                                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                                  }
                                });
                              }
                            }}
                            className="relative bg-[#ededf8] p-4 flex flex-col gap-3 cursor-grab active:cursor-grabbing border-b border-slate-200 touch-pan-y"
                          >
                            <div className="flex justify-between items-start opacity-70">
                              <div>
                                <h3 className="font-bold text-slate-800 leading-tight">{p.name}</h3>
                                <p className="text-xs font-mono text-slate-500 mt-0.5">{p.address}</p>
                              </div>
                              {renderSystemTypeBadge(p.systemType)}
                            </div>

                            <div className="flex justify-between items-center border-t border-slate-200 pt-3 mt-1">
                              <span className="text-xs font-mono text-slate-500 font-semibold flex items-center gap-1 bg-slate-200 border border-slate-300 px-2 py-1 rounded">
                                <Archive size={12} /> Nur Ansicht (Archiv)
                              </span>

                              <div className="flex gap-1.5">
                                <button 
                                  onClick={() => setActiveModalProtocol(p)}
                                  className="h-10 w-10 border border-[#c3c6d6] rounded flex items-center justify-center bg-white hover:bg-[#f3f3fd] text-[#191b23]"
                                  title="Details anzeigen"
                                >
                                  <Info size={16} />
                                </button>
                                <button 
                                  onClick={() => {
                                    setSelectedProtocolId(p.id);
                                    setCurrentScreen("inspection");
                                  }}
                                  className="h-10 w-10 bg-slate-500 text-white rounded flex items-center justify-center hover:bg-slate-600"
                                  title="Ansehen (Nur Lesezugriff)"
                                >
                                  <Eye size={16} />
                                </button>
                              </div>
                            </div>

                            {/* Manual Swipe Helper lines */}
                            <div className="flex justify-between text-[9px] font-semibold font-mono text-slate-400 mt-1 border-t border-dotted border-slate-200 pt-1 select-none pointer-events-none">
                              <span>← Links: Wiederherstellen</span>
                              <span>Dauerhaft löschen →</span>
                            </div>
                          </motion.div>
                        </div>
                      ))}

                      {filteredProtocols.length === 0 && (
                        <div className="p-8 border border-dashed border-[#c3c6d6] text-center bg-white flex flex-col items-center gap-3">
                          <Archive size={24} className="text-slate-400" />
                          <p className="text-xs text-[#737685] font-mono">Keine archivierten Protokolle vorhanden.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 5. SCREEN: DYNAMIC INSPECTIONS ACTIVE GRID (Auslöselisten Matrix View) */}
                {currentScreen === "inspection" && (
                  <div className="flex flex-col h-full bg-white relative">
                    {/* Header bar area */}
                    <div className="bg-[#f3f3fd] p-4 border-b border-[#c3c6d6] flex flex-col gap-2 shrink-0">
                      <div className="flex justify-between items-center">
                        <div>
                          <h2 className="text-lg font-bold leading-none">{activeProtocolObj.name}</h2>
                          <p className="text-xs text-[#737685] mt-1 font-mono">Vertrag: {activeProtocolObj.contractNumber} • Typ: {activeProtocolObj.systemType}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setCurrentScreen("editor")}
                            className="bg-white border border-[#c3c6d6] p-2 hover:bg-[#e1e2ec]"
                            title="Editor-Modus starten"
                          >
                            <Edit3 size={16} className="text-[#003d9b]" />
                          </button>
                          <button 
                            onClick={() => {
                              // Execute Sync queue and redirect
                              setProtocols(prev => prev.map(p => {
                                if (p.id === activeProtocolObj.id) return { ...p, status: "synchronized" };
                                return p;
                              }));
                              triggerToast("Synchronisierung erfolgreich abgeschlossen!", "success");
                              setCurrentScreen("downloaded");
                            }}
                            className="bg-[#fd8b00] text-[#603100] px-4 py-2 font-semibold text-xs flex items-center gap-1 hover:bg-[#fd8b00]/95"
                          >
                            <Upload size={14} /> Sync
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* SUB-SYSTEM TAB NAVIGATION (ANLAGENAUSWAHL) */}
                    {activeProtocolObj.subSystems && activeProtocolObj.subSystems.length > 0 && (
                      <div className="bg-[#ededf8] border-b border-[#c3c6d6] px-4 py-2 flex flex-col gap-1 shrink-0">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider font-mono block">
                          Anlagen im Wartungsvertrag ({activeProtocolObj.subSystems.length})
                        </label>
                        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
                          {activeProtocolObj.subSystems.map(sub => {
                            const isActive = selectedSubSystemId === sub.id;
                            // Check diagnostic counts for this sub-system
                            const totalMelder = sub.rows.reduce((acc, r) => acc + r.cells.filter(c => c.detectorType !== "-").length, 0);
                            const checkedMelder = sub.rows.reduce((acc, r) => acc + r.cells.filter(c => c.detectorType !== "-" && c.value !== "").length, 0);
                            const hasSubDefect = sub.rows.some(r => r.cells.some(c => c.value === "Def."));

                            return (
                              <button
                                key={sub.id}
                                onClick={() => {
                                  setSelectedSubSystemId(sub.id);
                                  setSelectedGroupsForBulk([]); // clear bulk selection when swapping sub-systems
                                }}
                                className={`px-2.5 py-1.5 text-[11px] font-bold rounded flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                                  isActive
                                    ? "bg-[#003d9b] text-white shadow-xs"
                                    : "bg-white text-slate-700 hover:bg-[#e1e2ec] border border-[#c3c6d6]"
                                }`}
                              >
                                {hasSubDefect && <AlertTriangle size={11} className="text-red-500 animate-pulse" />}
                                <span>{sub.name}</span>
                                <span className={`text-[8.5px] font-mono px-1 rounded ${
                                  isActive ? "bg-[#002f78] text-white" : "bg-slate-100 text-slate-500"
                                }`}>
                                  {checkedMelder}/{totalMelder}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* BULK ACTION BAR OVERLAY */}
                    {selectedGroupsForBulk.length > 0 && (
                      <div className="absolute top-18 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-3 z-50 animate-bounce text-xs">
                        <span className="font-bold text-amber-400 font-mono">{selectedGroupsForBulk.length} Segmente gewählt</span>
                        <div className="flex gap-1">
                          {activeProtocolObj.applicableValues.filter(o => o !== "Def.").map(ov => (
                            <button 
                              key={ov} 
                              onClick={() => handleBulkApply(ov)}
                              className="bg-[#fd8b00] text-[#2f1500] px-2 py-0.5 rounded font-bold hover:opacity-90"
                            >
                              {ov}
                            </button>
                          ))}
                          <button 
                            onClick={handleBulkReset}
                            className="bg-slate-700 text-slate-200 px-2.5 py-0.5 rounded font-semibold hover:bg-slate-600"
                          >
                            Leeren
                          </button>
                        </div>
                        <button onClick={() => setSelectedGroupsForBulk([])}>
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    {/* Dynamisch render Matrix Grid View */}
                    <div className="flex-1 overflow-auto bg-white p-2">
                      <table className="w-full text-left border-collapse text-xs">
                        {/* Table head */}
                        <thead>
                          <tr className="bg-[#e7e7f2] font-mono text-[#434654] border-b border-[#c3c6d6]">
                            <th className="p-3 sticky left-0 bg-[#e7e7f2] font-bold border-r border-[#c3c6d6] min-w-[72px] z-30">GRP</th>
                            <th className="p-3 bg-[#e7e7f2] font-semibold border-r border-[#c3c6d6] min-w-[140px] text-slate-700">Gruppe / Segment</th>
                            {activeProtocolObj.columns.map(col => (
                              <th key={col} className="p-2 border-r border-[#c3c6d6] text-center min-w-[62px]">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>

                        {/* Table body */}
                        <tbody>
                          {activeRows.map(row => {
                            const relevantCells = row.cells.filter(c => c.detectorType !== "-");
                            const hasDefect = row.cells.some(c => c.value === "Def.");
                            const hasAtLeastOneDetector = relevantCells.length > 0;
                            const allTriggered = hasAtLeastOneDetector && relevantCells.every(c => c.value !== "" && c.value !== "Def.");

                            let grpBgClass = "bg-white text-[#003d9b]";
                            if (selectedGroupsForBulk.includes(row.groupId)) {
                              grpBgClass = "bg-[#c4d2ff] text-[#001848] border-b-2 border-slate-400";
                            } else if (hasDefect) {
                              grpBgClass = "bg-red-500/10 text-[#ba1a1a] border-l-4 border-red-600 font-bold shadow-sm";
                            } else if (allTriggered) {
                              grpBgClass = "bg-emerald-500/10 text-[#065f46] border-l-4 border-emerald-600 font-bold shadow-sm";
                            }

                            return (
                              <tr key={row.groupId} className="hover:bg-slate-50 border-b border-[#ededf8]">
                                
                                {/* Frozen first column GRP row picker */}
                                <td 
                                  onClick={() => {
                                    if (activeProtocolObj.isArchived) return; // read-only check in archive
                                    setSelectedGroupsForBulk(prev => 
                                      prev.includes(row.groupId) 
                                        ? prev.filter(g => g !== row.groupId) 
                                        : [...prev, row.groupId]
                                    );
                                  }}
                                  className={`p-3 font-mono border-r border-[#c3c6d6] cursor-pointer sticky left-0 z-10 transition-colors ${grpBgClass}`}
                                >
                                  {row.groupId}
                                </td>

                              {/* NEW GROUP COGNITIVE LABELS UNDERNEATH TYPING SECTOR (Point 3 & 5) */}
                              <td className="p-2 border-r border-[#c3c6d6] bg-white text-slate-800">
                                <p className="font-bold leading-tight">{row.groupName}</p>
                                <p className="text-[10px] text-[#003d9b] font-mono font-bold mt-0.5 uppercase tracking-wider">
                                  {row.groupType || "NAM"}
                                </p>
                              </td>

                              {/* Matrix Cell Elements */}
                              {row.cells.map(cell => {
                                const isDisabled = cell.detectorType === "-";
                                const isDefect = cell.value === "Def.";
                                return (
                                  <td 
                                    key={cell.slotKey} 
                                    onClick={() => {
                                      if (activeProtocolObj.isArchived) return; // block edit in archive
                                      if (!isDisabled) {
                                        handleCellEdit(activeProtocolObj.id, row.groupId, cell.slotKey, activeSelectVal);
                                      }
                                    }}
                                    className={`p-1 border-r border-b border-[#cbd5e1] text-center cursor-pointer select-none transition-all ${
                                      isDisabled ? "cursor-not-allowed text-slate-500 font-bold" : 
                                      isDefect ? "bg-red-100 font-bold" : 
                                      cell.value ? "bg-[#dae2ff] font-bold" : "hover:bg-[#fcf8f0]"
                                    }`}
                                    style={{
                                      height: "54px",
                                      minWidth: "62px",
                                      ...(isDisabled ? {
                                        backgroundImage: "repeating-linear-gradient(45deg, #f1f5f9, #f1f5f9 4px, #e2e8f0 4px, #e2e8f0 8px)"
                                      } : {})
                                    }}
                                  >
                                    {isDisabled ? (
                                      <span className="text-slate-500 font-bold font-mono text-sm">-</span>
                                    ) : cell.value ? (
                                      <div className="flex flex-col items-center justify-center">
                                        <span className={`text-[11px] ${isDefect ? "text-red-700" : "text-[#001848] font-black"}`}>
                                          {cell.value === "CHECK" ? "✓" : cell.value}
                                        </span>
                                        <span className="text-[9px] text-[#737685] font-mono leading-none">{cell.detectorType}</span>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-center justify-center">
                                        <span className="text-[9px] text-slate-400 font-mono mt-2 tracking-tight leading-none">{cell.detectorType}</span>
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                      </table>
                    </div>

                    {/* DYNAMIC SUB FAB POPUP SELECTION (Stitch representation) */}
                    <div className="absolute bottom-6 right-6 flex flex-col items-end gap-2 z-40">
                      <AnimatePresence>
                        {isFabOpen && !activeProtocolObj.isArchived && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.92, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.92, y: 12 }}
                            transition={{ duration: 0.12, ease: "easeOut" }}
                            className="bg-white border-2 border-[#fd8b00] rounded-lg p-2.5 shadow-xl flex flex-col gap-1 w-28 text-center origin-bottom"
                          >
                            <p className="text-[9px] font-mono text-[#737685] mb-1">OBJEKTPORTAL</p>
                            {activeProtocolObj.applicableValues.map(ov => (
                              <button 
                                key={ov}
                                onClick={() => {
                                  setActiveSelectVal(ov);
                                  setIsFabOpen(false);
                                }}
                                className={`py-1 text-xs font-bold rounded transition-all ${
                                  activeSelectVal === ov ? "bg-[#fd8b00] text-[#2f1500]" : "hover:bg-[#ededf8]"
                                }`}
                              >
                                {ov}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {!activeProtocolObj.isArchived && (
                        <button 
                          onClick={() => setIsFabOpen(!isFabOpen)}
                          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg border-2 border-white transition-all active:scale-95 ${
                            activeSelectVal === "Def." ? "bg-[#ba1a1a] text-white" : "bg-[#fd8b00] text-[#2f1500]"
                          }`}
                        >
                          <span className="font-bold text-base">{activeSelectVal}</span>
                        </button>
                      )}
                    </div>

                  </div>
                )}

                {/* 6. SCREEN: EDITOR MODE MATRIX CONFIGURATION (Stitch Screen 5 1:1) */}
                {currentScreen === "editor" && (
                  <div className="flex flex-col h-full bg-[#fdf2e9] text-[#191b23]">
                    {/* Active secondary orange header block */}
                    <div className="bg-[#fd8b00] text-[#2f1500] px-4 py-3 flex justify-between items-center border-b border-[#904d00] shrink-0">
                      <div className="flex items-center gap-2">
                        <Edit3 size={18} className="text-[#2f1500]" />
                        <h2 className="font-bold tracking-tight text-white uppercase text-xs">Dynamic Editor Modus</h2>
                      </div>
                      <div className="flex gap-1.5 text-xs">
                        <button 
                          onClick={() => setCurrentScreen("inspection")}
                          className="bg-white/20 px-3 py-1.5 font-bold text-slate-950 rounded hover:bg-white/30"
                        >
                          Zurück
                        </button>
                      </div>
                    </div>

                    <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1">
                      {/* Structure Warning advisory */}
                      <div className="bg-orange-50 border-l-4 border-[#fd8b00] p-3 flex gap-2.5 rounded-r">
                        <AlertTriangle size={18} className="text-[#904d00] shrink-0" />
                        <div>
                          <p className="font-bold text-xs text-[#904d00]">Schema-Zuweisung aktiv</p>
                          <p className="text-[11px] text-[#603100] mt-0.5">Sie bearbeiten hier die logische Struktur der SQLite-Anlagendefinition. Neue Spalten und Bezeichnungen werden für alle Endpunkte übernommen.</p>
                        </div>
                      </div>

                      <div className="flex gap-2.5">
                        <button 
                          onClick={handleAddGroupMatrix}
                          className="flex-1 bg-[#003d9b] text-white py-2.5 text-xs font-bold rounded flex items-center justify-center gap-1 hover:opacity-90 transition-all font-mono shadow-sm"
                        >
                          <Plus size={15} /> SEGM. HINZUFÜGEN
                        </button>
                        <button 
                          onClick={handleAddSlotColumnMatrix}
                          className="flex-1 border border-[#003d9b] text-[#003d9b] bg-white py-2.5 text-xs font-bold rounded flex items-center justify-center gap-1 hover:bg-slate-50 transition-all font-mono shadow-sm"
                        >
                          <Grid size={15} /> SLOT HINZUFÜGEN
                        </button>
                      </div>

                      {/* Editor Subsystem Tabs Selector */}
                      {activeProtocolObj.subSystems && activeProtocolObj.subSystems.length > 0 && (
                        <div className="bg-orange-100/60 p-2.5 rounded-lg border border-orange-200 flex flex-col gap-1.5 shrink-0">
                          <label className="text-[9px] font-black text-amber-800 uppercase tracking-wider font-mono">
                            Aktive Anlage für Tabellenbemaßung wählen:
                          </label>
                          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
                            {activeProtocolObj.subSystems.map(sub => (
                              <button
                                key={sub.id}
                                onClick={() => setSelectedSubSystemId(sub.id)}
                                className={`px-2.5 py-1.5 text-[10.5px] font-bold rounded shrink-0 transition-all cursor-pointer ${
                                  selectedSubSystemId === sub.id
                                    ? "bg-[#fd8b00] text-white shadow-xs"
                                    : "bg-white text-slate-700 hover:bg-orange-50 border border-orange-200"
                                }`}
                              >
                                {sub.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Current List configuration */}
                      <div className="flex justify-between items-center border-b border-orange-200 pb-1.5">
                        <h3 className="font-bold text-xs text-[#434654] font-mono tracking-wider uppercase">Anlagenzeilen & Segmente</h3>
                        <span className="font-mono text-[10px] bg-amber-200 text-[#4d2800] px-1.5 py-0.5 font-bold rounded">
                          {activeRows.length} Zeilen
                        </span>
                      </div>

                      <div className="flex flex-col gap-3 pb-8">
                        {activeRows.map((row) => (
                          <div 
                            key={row.groupId} 
                            className="bg-white border border-[#c3c6d6] rounded-lg p-3 shadow-sm flex flex-col gap-3"
                          >
                            {/* Segment Heading row */}
                            <div className="flex justify-between items-center border-b border-dashed border-slate-200 pb-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">Index-Kennung</span>
                                <input 
                                  type="text"
                                  value={row.groupId}
                                  onChange={(e) => handleUpdateGroupId(row.groupId, e.target.value)}
                                  className="w-20 bg-slate-100 border border-slate-300 font-mono font-bold text-xs px-1 py-0.5 rounded focus:outline-none focus:border-[#003d9b] text-[#003d9b]"
                                />
                              </div>

                              <button
                                onClick={() => handleDeleteRow(row.groupId)}
                                className="text-red-600 hover:bg-red-50 p-1.5 rounded"
                                title="Dieses Segment löschen"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>

                            {/* Text inputs & Type select dropdowns */}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase font-mono tracking-tight text-slate-500 font-bold">Name (Auslösegruppe)</label>
                                <input 
                                  type="text"
                                  value={row.groupName}
                                  onChange={(e) => handleUpdateGroupName(row.groupId, e.target.value)}
                                  className="h-9 bg-slate-50 border border-slate-300 rounded px-2.5 text-xs text-slate-900 focus:outline-[#003d9b] font-medium"
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase font-mono tracking-tight text-slate-500 font-bold">Gruppentyp (Typisierung)</label>
                                <select 
                                  value={row.groupType || "NAM"}
                                  onChange={(e) => handleUpdateGroupType(row.groupId, e.target.value)}
                                  className="h-9 bg-slate-50 border border-slate-300 rounded px-2 text-xs text-slate-900 font-bold font-mono focus:outline-[#003d9b]"
                                >
                                  <option value="NAM">NAM (Normalauslösung)</option>
                                  <option value="AM">AM (Alarmmelder)</option>
                                  <option value="TECH">TECH (Technische Störung)</option>
                                  <option value="HLK">HLK (Heizung-Lüftung-Klima)</option>
                                  <option value="GLT">GLT (Gebäudeleittechnik)</option>
                                  <option value="VS">VS (Verschlusssteuerung)</option>
                                </select>
                              </div>
                            </div>

                            {/* Adaptable cell columns types (individual cell detector dropdowns) */}
                            <div>
                              <div className="text-[10px] uppercase font-mono tracking-tight text-slate-500 font-bold mb-1.5">
                                Slot Spalten-Meldertyp steuern
                              </div>
                              <div className="grid grid-cols-4 gap-1.5">
                                {row.cells.map((cell) => (
                                  <div key={cell.slotKey} className="flex flex-col bg-slate-50 border border-slate-200 rounded p-1 text-center">
                                    <span className="text-[9px] font-mono font-bold text-slate-400">Col {cell.slotKey}</span>
                                    <select
                                      value={cell.detectorType}
                                      onChange={(e) => handleUpdateCellDetectorType(row.groupId, cell.slotKey, e.target.value)}
                                      className="text-[10px] font-bold font-mono bg-white border border-slate-300 rounded py-0.5 px-1 mt-0.5 focus:outline-none focus:border-[#003d9b] w-full"
                                    >
                                      {(systemTypeSettings[activeProtocolObj.systemType] || ["-", "Normal", "ZD", "ZB", "TDIFF", "TMAX", "RAS", "LINEAR"]).map(type => (
                                        <option key={type} value={type}>
                                          {type === "-" ? "- Leer" : type}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* BOTTOM NAVIGATION CHROME BAR SIMULATION */}
              <nav className="bg-white border-t-2 border-[#c3c6d6] h-16 flex justify-around items-center shrink-0 z-50">
                <button 
                  onClick={() => {
                    setSearchQuery("");
                    setCurrentScreen("search");
                  }}
                  className={`flex flex-col items-center justify-center w-16 transition-all ${
                    currentScreen === "search" ? "text-[#003d9b] font-bold scale-105" : "text-[#434654] hover:text-[#003d9b]"
                  }`}
                >
                  <Search size={22} />
                  <span className="text-[9.5px] font-mono uppercase tracking-tight mt-0.5">Suche</span>
                </button>

                <button 
                  onClick={() => {
                    setSearchQuery("");
                    setCurrentScreen("downloaded");
                  }}
                  className={`flex flex-col items-center justify-center w-16 transition-all ${
                    currentScreen === "downloaded" ? "text-[#003d9b] font-bold scale-105" : "text-[#434654] hover:text-[#003d9b]"
                  }`}
                >
                  <CheckCircle size={22} />
                  <span className="text-[9.5px] font-mono uppercase tracking-tight mt-0.5">Geladen</span>
                </button>

                <button 
                  onClick={() => {
                    setSearchQuery("");
                    setCurrentScreen("archive");
                  }}
                  className={`flex flex-col items-center justify-center w-16 transition-all ${
                    currentScreen === "archive" ? "text-[#003d9b] font-bold scale-105" : "text-[#434654] hover:text-[#003d9b]"
                  }`}
                >
                  <FileText size={22} />
                  <span className="text-[9.5px] font-mono uppercase tracking-tight mt-0.5">Archiv</span>
                </button>

                <button 
                  onClick={() => setCurrentScreen("settings")}
                  className={`flex flex-col items-center justify-center w-16 transition-all ${
                    currentScreen === "settings" ? "text-[#003d9b] font-bold" : "text-[#434654] hover:text-[#003d9b]"
                  }`}
                >
                  <Settings size={22} />
                  <span className="text-[9.5px] font-mono uppercase tracking-tight mt-0.5">Settings</span>
                </button>
              </nav>

            </div>
          </div>
        </section>

        {/* Right Side: Specification Companion Panel, Krypto Tester, and Verification Vector */}
        <section className="w-full lg:w-[480px] bg-slate-900 text-slate-100 flex flex-col overflow-y-auto shrink-0 border-l border-slate-800 p-6">
          
          <div className="space-y-6">
            
            {/* Spec Panel intro */}
            <div>
              <h2 className="text-lg font-bold tracking-tight text-amber-400 flex items-center gap-1.5 border-b border-slate-800 pb-3">
                <Terminal size={18} /> Spezifikations-Playground
              </h2>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Nutzen Sie dieses Panel, um die bit-identischen kryptografischen Verschlüsselungs-Verfahren und den dynamic Schema-Workflow mit dem Python-Backend im Verbund abzugleichen. Der Emulator links interagiert mit diesen Logiken.
              </p>
            </div>

            {/* Test Vector Verification Box */}
            <div className="bg-slate-950 p-4 border border-slate-800 rounded">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400 flex justify-between items-center">
                <span>Verification Test Vector</span>
                <button 
                  onClick={() => {
                    setPlayCode("MeinGeheimesCodewort123!");
                    setPlayText('{"user":"tech","pass":"123"}');
                    setPlayIv("000000000000000000000000");
                    setCopiedVect(true);
                    setTimeout(() => setCopiedVect(false), 2000);
                  }}
                  className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded hover:bg-amber-500/30 transition-colors"
                >
                  {copiedVect ? "Geladen!" : "Testvektor Laden"}
                </button>
              </h3>
              
              <div className="mt-3 space-y-3 font-mono text-[11px] leading-relaxed select-all">
                <div>
                  <span className="text-slate-500">Codewort:</span>
                  <div className="bg-slate-900 border border-slate-800 p-1.5 rounded mt-0.5 font-bold text-slate-200">
                    MeinGeheimesCodewort123!
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Klartext:</span>
                  <div className="bg-slate-900 border border-slate-800 p-1.5 rounded mt-0.5 text-emerald-400">
                    {`{"user":"tech","pass":"123"}`}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Erwarteter Key (PBKDF2 SHA256):</span>
                  <div className="bg-slate-900 border border-slate-800 p-1.5 rounded mt-0.5 text-blue-400 font-bold break-all">
                    d6bf2c4cdd201fe9738f6bca487bf5948f95c80ef467645cf4595e0c656360c7
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Erwarteter Ciphertext (Base64-Format mit all-zero IV):</span>
                  <div className="bg-slate-900 border border-slate-800 p-1.5 rounded mt-0.5 text-purple-400 font-bold break-all">
                    AAAAAAAAAAAAAAAAAAAAAGV3E9Xatqscun3hAet3V6qE9R6DToM6A41g3gXb8+H0bA==
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic Krypto Testing Sandbox */}
            <div className="bg-slate-950 p-4 border border-slate-800 rounded space-y-4">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1">
                <Lock size={14} /> Krypto-Tester & Verifizierer
              </h3>

              <div className="space-y-3 font-mono text-[11px]">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-400">1. Codewort eingeben:</label>
                  <input 
                    type="text" 
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-slate-200 text-xs font-bold"
                    value={playCode}
                    onChange={(e) => setPlayCode(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-400">2. IV (12 Bytes Hex - 24 Zeichen):</label>
                  <input 
                    type="text" 
                    maxLength={24}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-slate-200 text-xs"
                    value={playIv}
                    onChange={(e) => setPlayIv(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-400">3. JSON-Klartext payload:</label>
                  <textarea 
                    rows={3}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-emerald-400 text-xs"
                    value={playText}
                    onChange={(e) => setPlayText(e.target.value)}
                  />
                </div>

                <div className="border-t border-slate-800 pt-3 space-y-2">
                  <div>
                    <span className="text-blue-400 font-bold">Ergebnis Key:</span>
                    <div className="bg-slate-900 p-2 border border-slate-800 rounded text-slate-300 select-all font-bold break-all">
                      {playResKey}
                    </div>
                  </div>
                  <div>
                    <span className="text-purple-400 font-bold">Ergebnis Ciphertext:</span>
                    <div className="bg-slate-900 p-2 border border-slate-800 rounded text-slate-300 select-all break-all">
                      {playResPayload}
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Spezifikations Endpunkte Quicklist */}
            <div className="p-4 border border-slate-800 rounded space-y-3 bg-slate-950/50">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                Spezifizierte REST-Endpoints (POST)
              </h3>
              
              <ul className="space-y-2 text-[11px] font-mono text-slate-400 leading-relaxed">
                <li>
                  <span className="text-[#fd8b00] font-bold">/auth/check</span> 
                  <p className="pl-3 py-0.5">Prüft Credentials (verschlüsselter Header X-Auth)</p>
                </li>
                <li>
                  <span className="text-[#fd8b00] font-bold">/protocols/search</span> 
                  <p className="pl-3 py-0.5">Suche nach MATCHCODE, Adresse etc.</p>
                </li>
                <li>
                  <span className="text-[#fd8b00] font-bold">/protocols/download/{"{id}"}</span> 
                  <p className="pl-3 py-0.5">Liefert verschlüsselte GZIP dynamic protocol JSON</p>
                </li>
                <li>
                  <span className="text-[#fd8b00] font-bold">/protocols/upload/{"{id}"}</span> 
                  <p className="pl-3 py-0.5">Sendet ausgefüllte Auslöseliste zurück</p>
                </li>
                <li>
                  <span className="text-[#fd8b00] font-bold">/protocols/list-pending</span> 
                  <p className="pl-3 py-0.5">Liste offener Wartungsaufträge für diesen Techniker</p>
                </li>
              </ul>
            </div>

          </div>

        </section>

      </div>
      ) : (
        <CentralWebUI 
          protocols={protocols}
          setProtocols={setProtocols}
          simulatedArchives={simulatedArchives}
          setSimulatedArchives={setSimulatedArchives}
          triggerToast={triggerToast}
          systemTypeSettings={systemTypeSettings}
          setSystemTypeSettings={setSystemTypeSettings}
          systemTypeHardwareConfigs={systemTypeHardwareConfigs}
          setSystemTypeHardwareConfigs={setSystemTypeHardwareConfigs}
          systemTypeMetadata={systemTypeMetadata}
          setSystemTypeMetadata={setSystemTypeMetadata}
          activeTenantId={activeTenantId}
          tenants={tenants}
          setTenants={setTenants}
          handleSwapTenant={handleSwapTenant}
          globalMainkey={globalMainkey}
          setGlobalMainkey={setGlobalMainkey}
        />
      )}

      {/* Object details modal popup representation */}
      {activeModalProtocol && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setActiveModalProtocol(null)}></div>
          <div className="relative bg-white w-full max-w-md rounded-lg shadow-2xl border border-[#c3c6d6] overflow-hidden flex flex-col text-sm text-[#191b23]">
            
            <div className="p-4 border-b border-[#ededf8] flex justify-between items-center bg-[#f3f3fd]">
              <h3 className="text-base font-bold text-[#191b23]">Objektdetails</h3>
              <button className="p-1 hover:bg-[#e1e2ec] rounded" onClick={() => setActiveModalProtocol(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] uppercase font-bold text-[#737685]">Bezeichnung</p>
                  <p className="font-semibold">{activeModalProtocol.name}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-[#737685]">Anlagentyp</p>
                  <p className="flex items-center gap-1.5">
                    {renderSystemTypeBadge(activeModalProtocol.systemType)}
                    <span className="text-xs text-slate-500">
                      ({systemTypeMetadata[activeModalProtocol.systemType]?.name || activeModalProtocol.systemType})
                    </span>
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] uppercase font-bold text-[#737685]">Adresse</p>
                  <p>{activeModalProtocol.address}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-[#737685]">Vertragsnummer</p>
                  <p className="font-mono text-xs font-bold text-[#003d9b]">{activeModalProtocol.contractNumber}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-[#737685]">Wartungsintervall</p>
                  <p>{activeModalProtocol.interval}</p>
                </div>
                <div className="col-span-2 h-px bg-[#c3c6d6] border-dashed border-b"></div>
                {(() => {
                  let activeDetectorsCount = 0;
                  let triggeredDetectorsCount = 0;
                  const defectiveDetectors: Array<{ groupName: string; groupId: string; slotKey: string; type: string }> = [];

                  activeModalProtocol.rows.forEach(row => {
                    row.cells.forEach(cell => {
                      if (cell.detectorType !== "-") {
                        activeDetectorsCount++;
                        if (cell.value !== "" && cell.value !== "Def.") {
                          triggeredDetectorsCount++;
                        }
                        if (cell.value === "Def.") {
                          defectiveDetectors.push({
                            groupId: row.groupId,
                            groupName: row.groupName,
                            slotKey: cell.slotKey,
                            type: cell.detectorType
                          });
                        }
                      }
                    });
                  });

                  return (
                    <>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#737685]">Zuletzt bearbeitet durch</p>
                        <p className="font-semibold">{activeModalProtocol.lastEditedBy || "Thomas Prantl"}</p>
                        <p className="text-[11px] text-slate-500 font-mono italic">{activeModalProtocol.lastEditedAt || "Unbearbeitet"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#737685]">Melder (Ausgelöst/Gesamt)</p>
                        <p className="font-bold text-[#003d9b] text-base">{triggeredDetectorsCount} / {activeDetectorsCount}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-[10px] uppercase font-bold text-red-600 mb-1.5">Defekte Melder ({defectiveDetectors.length})</p>
                        {defectiveDetectors.length > 0 ? (
                          <div className="max-h-24 overflow-y-auto bg-red-50 border border-red-200 p-2.5 font-mono text-[10px] text-red-700 space-y-1 rounded">
                            {defectiveDetectors.map((def, idx) => (
                              <div key={idx} className="flex justify-between border-b border-red-100/50 pb-1 last:border-b-0 last:pb-0">
                                <span className="truncate max-w-[240px]">{def.groupName} • {def.groupId} (Slot {def.slotKey}) - {def.type}</span>
                                <span className="font-bold shrink-0 bg-red-200 px-1 rounded text-[9px]">DEFEKT</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-[#737685] italic">Keine defekten Melder verzeichnet.</p>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="p-4 bg-[#f3f3fd] border-t border-[#ededf8] flex justify-end">
              <button 
                onClick={() => setActiveModalProtocol(null)}
                className="bg-[#003d9b] text-white px-5 py-2 font-semibold text-xs"
              >
                Schließen
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
