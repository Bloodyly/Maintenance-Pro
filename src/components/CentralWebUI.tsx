import React, { useState, useMemo, useEffect } from "react";
import { 
  Database, 
  Search, 
  CheckCircle, 
  AlertTriangle, 
  RotateCcw, 
  FileText, 
  Eye, 
  Calendar, 
  MapPin, 
  Clock, 
  ArrowLeft, 
  X, 
  Folder, 
  FolderOpen, 
  Printer, 
  User, 
  Activity, 
  ShieldCheck, 
  Server,
  Layers,
  ChevronRight,
  HelpCircle,
  Hash,
  Plus,
  Trash2,
  Upload,
  FileSpreadsheet,
  AlertOctagon,
  QrCode,
  UserPlus,
  Wrench,
  Settings2,
  AlertCircle,
  SlidersHorizontal,
  Undo,
  Redo,
  Play
} from "lucide-react";
import * as XLSX from "xlsx";

// Mirroring App types
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

interface EditorSubsystem {
  id: string;
  name: string;
  rows: Array<{
    groupId: string;
    groupName: string;
    groupType: string;
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

interface WebUIArchive {
  id: string;
  contractNumber: string;
  year: string;
  halfYear: string;
  version: number;
  filename: string;
  dateArchived: string;
  archivedBy: string;
  objectName: string;
}

interface CentralWebUIProps {
  protocols: ProtocolItem[];
  setProtocols: React.Dispatch<React.SetStateAction<ProtocolItem[]>>;
  simulatedArchives: WebUIArchive[];
  setSimulatedArchives: React.Dispatch<React.SetStateAction<WebUIArchive[]>>;
  triggerToast: (msg: string, type?: "success" | "info" | "warning") => void;
  systemTypeSettings: Record<string, string[]>;
  setSystemTypeSettings: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  systemTypeHardwareConfigs: Record<string, { hasHardware: boolean; headers: string[] }>;
  setSystemTypeHardwareConfigs: React.Dispatch<React.SetStateAction<Record<string, { hasHardware: boolean; headers: string[] }>>>;
  systemTypeMetadata: Record<string, { name: string; color: string }>;
  setSystemTypeMetadata: React.Dispatch<React.SetStateAction<Record<string, { name: string; color: string }>>>;
  activeTenantId: string;
  tenants: any[];
  setTenants: React.Dispatch<React.SetStateAction<any[]>>;
  handleSwapTenant: (id: string) => void;
  globalMainkey: string;
  setGlobalMainkey: React.Dispatch<React.SetStateAction<string>>;
}

interface ManualGroup {
  groupId: string;
  groupName: string;
  slots: Array<{
    slotKey: string;
    detectorType: string;
  }>;
}

export default function CentralWebUI({
  protocols,
  setProtocols,
  simulatedArchives,
  setSimulatedArchives,
  triggerToast,
  systemTypeSettings,
  setSystemTypeSettings,
  systemTypeHardwareConfigs,
  setSystemTypeHardwareConfigs,
  systemTypeMetadata,
  setSystemTypeMetadata,
  activeTenantId,
  tenants,
  setTenants,
  handleSwapTenant,
  globalMainkey,
  setGlobalMainkey
}: CentralWebUIProps) {
  // Navigation & filtering state
  const [activeWebTab, setActiveWebTab] = useState<"dashboard" | "users" | "settings">("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // User Administration states
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<"Aussendienst-Techniker" | "Büro-Administrator">("Aussendienst-Techniker");
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserCodeword, setNewUserCodeword] = useState("");

  const [qrModalUser, setQrModalUser] = useState<any | null>(null);
  const [onboardingModalUser, setOnboardingModalUser] = useState<any | null>(null);

  // New Tenant Creator states
  const [isAddTenantModalOpen, setIsAddTenantModalOpen] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantServer, setNewTenantServer] = useState("");
  const [newTenantPort, setNewTenantPort] = useState("");
  const [newTenantVlan, setNewTenantVlan] = useState("");
  const [newTenantSamba, setNewTenantSamba] = useState("");
  const [newTenantDbTemplate, setNewTenantDbTemplate] = useState<"empty" | "default">("default");
  
  // Selection / Modal state
  const [selectedWebId, setSelectedWebId] = useState<string | null>(null);
  const [selectedInspectedSubId, setSelectedInspectedSubId] = useState<string | null>(null);
  const [pdfModalId, setPdfModalId] = useState<string | null>(null);
  const [selectedArchiveForPdf, setSelectedArchiveForPdf] = useState<WebUIArchive | null>(null);

  // Sync selected inspected subsystem
  useEffect(() => {
    if (selectedWebId) {
      const p = protocols.find(item => item.id === selectedWebId);
      if (p && p.subSystems && p.subSystems.length > 0) {
        setSelectedInspectedSubId(p.subSystems[0].id);
      } else {
        setSelectedInspectedSubId(null);
      }
    } else {
      setSelectedInspectedSubId(null);
    }
  }, [selectedWebId, protocols]);

  // New features modal states
  const [isDefectModalOpen, setIsDefectModalOpen] = useState(false);
  const [isAddContractModalOpen, setIsAddContractModalOpen] = useState(false);

  // Unified Draw-based Contract Editor states
  const [isUnifiedEditorOpen, setIsUnifiedEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editorProtocolId, setEditorProtocolId] = useState<string | null>(null);
  const [editorName, setEditorName] = useState("");
  const [editorAddress, setEditorAddress] = useState("");
  const [editorContractNumber, setEditorContractNumber] = useState("");
  const [editorInterval, setEditorInterval] = useState<"Jährlich" | "Halbjährlich" | "Vierteljährlich">("Jährlich");
  const [editorSystemType, setEditorSystemType] = useState("BMA");
  const [editorStatus, setEditorStatus] = useState<"ready_to_download" | "downloaded" | "upload_pending" | "synchronized">("ready_to_download");
  const [editorSubSystems, setEditorSubSystems] = useState<EditorSubsystem[]>([]);
  const [activeSubsystemId, setActiveSubsystemId] = useState<string | null>(null);

  // Import Assistant dialog states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editorImportFileType, setEditorImportFileType] = useState<"esser" | "notifier" | "hekatron" | "csv" | "xlsx">("esser");
  const [isImporting, setIsImporting] = useState(false);

  // Paintbrush drawing tools states
  const [paintTool, setPaintTool] = useState<"type" | "trigger" | "text">("type");
  const [paintValue, setPaintValue] = useState<string>("Normal"); // Default
  const [textBrushValue, setTextBrushValue] = useState<string>("Büro");
  const [dynamicDetectorTypes, setDynamicDetectorTypes] = useState<string[]>([]);
  const [customTypeInput, setCustomTypeInput] = useState<string>("");
  
  // Undo/Redo history stack (snapshots of editorSubSystems)
  const [editorHistory, setEditorHistory] = useState<EditorSubsystem[][]>([]);
  const [editorHistoryIndex, setEditorHistoryIndex] = useState<number>(-1);

  const activeSub = editorSubSystems.find(s => s.id === activeSubsystemId);

  // Excel-like rectangular bounding-box drawing selection coordinates states
  const [selectionStart, setSelectionStart] = useState<{ r: number; c: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ r: number; c: number } | null>(null);

  // Add contract wizard form states
  const [newContractName, setNewContractName] = useState("");
  const [newContractAddress, setNewContractAddress] = useState("");
  const [newContractNumber, setNewContractNumber] = useState("");
  const [newContractInterval, setNewContractInterval] = useState<"Jährlich" | "Halbjährlich" | "Vierteljährlich">("Jährlich");
  const [newContractSystemType, setNewContractSystemType] = useState("BMA");
  const [newContractSetupMethod, setNewContractSetupMethod] = useState<"import" | "manual">("import");
  
  // Simulated CSV/Excel raw parsed data list
  const [importedFileName, setImportedFileName] = useState("");
  const [importFileType, setImportFileType] = useState<"csv" | "etb">("csv");
  const [importedDetectors, setImportedDetectors] = useState<Array<{ group: string; slot: string; type: string }>>([]);

  // Manual configuration editor groups
  const [manualGroups, setManualGroups] = useState<ManualGroup[]>([]);

  // WebUI Adjust Protocol Modal state
  const [isAdjustProtocolModalOpen, setIsAdjustProtocolModalOpen] = useState(false);
  const [adjustProtocolId, setAdjustProtocolId] = useState<string | null>(null);
  const [adjustName, setAdjustName] = useState("");
  const [adjustAddress, setAdjustAddress] = useState("");
  const [adjustContractNumber, setAdjustContractNumber] = useState("");
  const [adjustInterval, setAdjustInterval] = useState<"Jährlich" | "Halbjährlich" | "Vierteljährlich">("Jährlich");
  const [adjustStatus, setAdjustStatus] = useState<"ready_to_download" | "downloaded" | "upload_pending" | "synchronized">("ready_to_download");
  const [adjustSystemType, setAdjustSystemType] = useState("BMA");
  const [adjustRows, setAdjustRows] = useState<any[]>([]);
  const [showConfirmDeleteAdjust, setShowConfirmDeleteAdjust] = useState(false);

  // Tenant Rename Modal (reliable react-state overlay, bypasses standard iframe prompt block)
  const [isRenameTenantModalOpen, setIsRenameTenantModalOpen] = useState(false);
  const [renameTenantId, setRenameTenantId] = useState<string | null>(null);
  const [renameTenantInput, setRenameTenantInput] = useState("");
  const [renameTenantLogoUrl, setRenameTenantLogoUrl] = useState("");
  const [deleteConfirmTenantId, setDeleteConfirmTenantId] = useState<string | null>(null);

  // Local state for editing detectors (transient text area/input)
  const [editingDetectors, setEditingDetectors] = useState<Record<string, string>>({});

  // Local state for Add System Type form/modal
  const [isAddTypeModalOpen, setIsAddTypeModalOpen] = useState(false);
  const [newTypeCode, setNewTypeCode] = useState("");
  const [newTypeNameField, setNewTypeNameField] = useState("");
  const [newTypeColor, setNewTypeColor] = useState("#3b82f6");
  const [newTypeDetectors, setNewTypeDetectors] = useState("Normal, ZD, ZB, RAS");
  const [newTypeHasHardware, setNewTypeHasHardware] = useState(false);
  const [newTypeHardwareHeaders, setNewTypeHardwareHeaders] = useState("Bauteil/Ring;Typ;Störung;Unterbrechung;Softwarestand;Serie");

  // Turnus simulation quarter state
  const [currentQuarter, setCurrentQuarter] = useState<number>(1); // Q1, Q2, Q3, Q4

  // Samba virtual browser state
  // "ROOT" -> shows folders by contract number
  // "[ContractNo]" -> shows years (e.g. "2025")
  // "[ContractNo]/[Year]" -> shows Half-years ("H1", "H2")
  // "[ContractNo]/[Year]/[HalfYear]" -> shows files
  const [archivePath, setArchivePath] = useState<string[]>([]); // path segments e.g. ["V-2023-9941-Z", "2025", "H2"]

  // Active inspected protocol object helper
  const inspectedProtocol = useMemo(() => {
    return protocols.find(p => p.id === selectedWebId) || null;
  }, [protocols, selectedWebId]);

  // Compute all defect locations on the fly for deep inspection
  const defectsList = useMemo(() => {
    const list: Array<{
      protocolId: string;
      protocolName: string;
      contractNumber: string;
      groupId: string;
      groupName: string;
      slotKey: string;
      detectorType: string;
    }> = [];

    protocols.forEach(p => {
      p.rows.forEach(r => {
        r.cells.forEach(c => {
          if (c.value === "Def." || c.value?.toLowerCase() === "def") {
            list.push({
              protocolId: p.id,
              protocolName: p.name,
              contractNumber: p.contractNumber,
              groupId: r.groupId,
              groupName: r.groupName,
              slotKey: c.slotKey,
              detectorType: c.detectorType
            });
          }
        });
      });
    });

    return list;
  }, [protocols]);

  // --- USER WORKSPACE CRUD OPERATIONS ---
  const handleCreateUser = () => {
    if (!newUserName.trim()) {
      triggerToast("Bitte geben Sie einen Namen für den Mitarbeiter an!", "warning");
      return;
    }

    // Auto-generate unique components if empty
    const generatedUsername = newUserUsername.trim() || `TECH_${newUserName.split(" ").map(n => n[0]).join("").toUpperCase()}_${Math.floor(10 + Math.random() * 90)}`;
    const generatedPassword = newUserPassword.trim() || `Pass${Math.floor(100 + Math.random() * 899)}!!_`;
    const generatedCodeword = newUserCodeword.trim() || `${Math.floor(10 + Math.random() * 89)}-AA-${Math.floor(100 + Math.random() * 899)}-${newUserName.split(" ").map(n => n[0]).join("").toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`;

    const newUser = {
      id: `u-${Date.now()}`,
      name: newUserName.trim(),
      role: newUserRole,
      username: generatedUsername,
      password: generatedPassword,
      codeword: generatedCodeword,
      status: "Aktiv" as const
    };

    setTenants(prev => prev.map(t => {
      if (t.id === activeTenantId) {
        return {
          ...t,
          users: [...t.users, newUser]
        };
      }
      return t;
    }));

    triggerToast(`Mitarbeiter ${newUserName} erfolgreich angelegt!`, "success");
    setIsAddUserModalOpen(false);

    // Reset fields
    setNewUserName("");
    setNewUserRole("Aussendienst-Techniker");
    setNewUserUsername("");
    setNewUserPassword("");
    setNewUserCodeword("");
  };

  const handleToggleBlockUser = (userId: string) => {
    setTenants(prev => prev.map(t => {
      if (t.id === activeTenantId) {
        return {
          ...t,
          users: t.users.map(u => {
            if (u.id === userId) {
              const nextStatus = u.status === "Aktiv" ? "Gesperrt" : "Aktiv";
              triggerToast(`Mitarbeiter ${u.name} wurde ${nextStatus === "Gesperrt" ? "gesperrt 🔒" : "freigeschaltet ✓"}.`, "info");
              return { ...u, status: nextStatus };
            }
            return u;
          })
        };
      }
      return t;
    }));
  };

  const handleDeleteUser = (userId: string) => {
    setTenants(prev => prev.map(t => {
      if (t.id === activeTenantId) {
        const remaining = t.users.filter(u => u.id !== userId);
        triggerToast("Mitarbeiter erfolgreich gelöscht.", "success");
        return { ...t, users: remaining };
      }
      return t;
    }));
  };

  const handleCreateTenant = () => {
    if (!newTenantName.trim()) {
      triggerToast("Bitte geben Sie einen Namen für den Mandanten an!", "warning");
      return;
    }

    const nextId = `tenant-${Date.now()}`;
    const cleanServer = newTenantServer.trim() || "https://custom-service.corp.internal";
    const cleanPort = newTenantPort.trim() || "8443";
    const cleanVlan = newTenantVlan.trim() || `VLAN_${Math.floor(10 + Math.random() * 80)}_SECURE`;
    const cleanSamba = newTenantSamba.trim() || `\\\\samba.corp.internal\\archival_cust_${Math.floor(100 + Math.random() * 900)}\\`;

    // Construct tenant protocols based on template
    const customProtocols: ProtocolItem[] = [
      {
        id: `p-cust-${Date.now()}`,
        name: `${newTenantName} - Betriebsgebäude West`,
        address: "Zunftstraße 12, 4020 Industriegebiet",
        contractNumber: `V-CUST-${Math.floor(1000 + Math.random() * 9000)}-N`,
        interval: "Halbjährlich",
        systemType: "BMA",
        status: "ready_to_download",
        columns: ["1", "2", "3"],
        applicableValues: ["H1", "H2", "Def."],
        detectorTypes: ["ZD", "DB", "RAS", "LINEAR"],
        rows: [
          {
            groupId: "GRP 01",
            groupName: "Produktionshalle 1",
            groupType: "NAM",
            cells: [
              { slotKey: "1", detectorType: "ZD", value: "" },
              { slotKey: "2", detectorType: "DB", value: "" },
              { slotKey: "3", detectorType: "RAS", value: "" }
            ]
          }
        ]
      }
    ];

    const defaultUsers = [
      {
        id: `u-cust-admin-${Date.now()}`,
        name: "Admin Mitarbeiter",
        role: "Büro-Administrator",
        username: `ADMIN_${newTenantName.replace(/\s+/g, "").toUpperCase().slice(0, 6)}`,
        password: "AdminSecure123!!_",
        codeword: `01-AA-900-${newTenantName.replace(/\s+/g, "").toUpperCase().slice(0, 3)}-88`,
        status: "Aktiv" as const
      },
      {
        id: `u-cust-tech-${Date.now()}`,
        name: "Techniker Mitarbeiter",
        role: "Aussendienst-Techniker",
        username: `TECH_${newTenantName.replace(/\s+/g, "").toUpperCase().slice(0, 6)}`,
        password: "TechSecure123!!_",
        codeword: `02-AB-910-${newTenantName.replace(/\s+/g, "").toUpperCase().slice(0, 3)}-99`,
        status: "Aktiv" as const
      }
    ];

    const newTenant = {
      id: nextId,
      name: newTenantName.trim(),
      serverAddress: cleanServer,
      serverPort: cleanPort,
      vlanName: cleanVlan,
      sambaPath: cleanSamba,
      protocols: customProtocols,
      simulatedArchives: [],
      users: defaultUsers
    };

    setTenants(prev => [...prev, newTenant]);
    setIsAddTenantModalOpen(false);
    triggerToast(`Mandant "${newTenantName}" erfolgreich angelegt und Struktur initialisiert!`, "success");

    // Clear form
    setNewTenantName("");
    setNewTenantServer("");
    setNewTenantPort("");
    setNewTenantVlan("");
    setNewTenantSamba("");
    
    // Auto swap to newborn tenant
    setTimeout(() => {
      handleSwapTenant(nextId);
    }, 100);
  };

  // Statistics Computations
  const stats = useMemo(() => {
    const total = protocols.length;
    const pending = protocols.filter(p => p.status === "ready_to_download").length;
    const outInField = protocols.filter(p => p.status === "downloaded" || p.status === "upload_pending").length;
    const synchronized = protocols.filter(p => p.status === "synchronized").length;
    
    // count defects
    let defectCount = defectsList.length;

    return { total, pending, outInField, synchronized, defectCount };
  }, [protocols, defectsList]);

  // Filtering Logic
  const filteredProtocols = useMemo(() => {
    return protocols.filter(p => {
      const matchesSearch = 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.contractNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.address.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = filterType === "ALL" || p.systemType === filterType;
      const matchesStatus = filterStatus === "ALL" || p.status === filterStatus;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [protocols, searchTerm, filterType, filterStatus]);

  // Handle "Re-Schedule / Reset" in WebUI (Archives the report, resets status and cells to empty)
  const handleArchiveAndReplan = (id: string) => {
    const p = protocols.find(item => item.id === id);
    if (!p) return;

    const year = new Date().getFullYear().toString();
    const month = new Date().getMonth() + 1;
    const halfYear = month <= 6 ? "H1" : "H2";
    
    // Count previous versions for same contract
    const matchCount = simulatedArchives.filter(arc => arc.contractNumber === p.contractNumber).length;
    const nextVersion = matchCount + 1;

    const newArchive: WebUIArchive = {
      id: `arc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      contractNumber: p.contractNumber,
      year: year,
      halfYear: halfYear,
      version: nextVersion,
      filename: `${p.contractNumber}_V${nextVersion}.pdf`,
      dateArchived: new Date().toLocaleDateString("de-DE") + " " + new Date().toLocaleTimeString("de-DE", { hour: '2-digit', minute: '2-digit' }),
      archivedBy: p.lastEditedBy || "Intranet-Core-Worker",
      objectName: p.name
    };

    // Update archives
    setSimulatedArchives(prev => [newArchive, ...prev]);

    // Reset protocol to ready_to_download, wipe edited values, keeping core structure intact
    setProtocols(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          status: "ready_to_download",
          lastEditedBy: undefined,
          lastEditedAt: undefined,
          rows: item.rows.map(r => ({
            ...r,
            cells: r.cells.map(c => ({
              ...c,
              value: "" // Clear measurement for the fresh period
            }))
          }))
        };
      }
      return item;
    }));

    triggerToast(`Wartung ${p.name} erfolgreich archiviert (${newArchive.filename}) & in die Datenbank-Warteschlange zurückgestellt.`, "success");
  };

  const ensureTenCells = (existingCells: any[], sysType: string) => {
    const list = [...existingCells];
    const targetLength = Math.max(10, list.length);
    while (list.length < targetLength) {
      const nextKey = (list.length + 1).toString();
      list.push({
        slotKey: nextKey,
        detectorType: "-",
        value: ""
      });
    }
    return list;
  };

  const startUnifiedEditorEdit = (p: ProtocolItem) => {
    setEditorMode("edit");
    setEditorProtocolId(p.id);
    setEditorName(p.name);
    setEditorAddress(p.address || "");
    setEditorContractNumber(p.contractNumber);
    setEditorInterval(p.interval);
    setEditorStatus(p.status);
    setEditorSystemType(p.systemType);
    
    const savedSubSystems: EditorSubsystem[] = p.subSystems ? p.subSystems.map(sub => ({
      id: sub.id,
      name: sub.name,
      rows: sub.rows.map(r => ({
        groupId: r.groupId,
        groupName: r.groupName,
        groupType: r.groupType || "NAM",
        cells: ensureTenCells(r.cells, p.systemType)
      }))
    })) : [
      {
        id: `sub-sys-1-${Date.now()}`,
        name: "Anlage 1: Hauptstelle",
        rows: p.rows.map(r => ({
          groupId: r.groupId,
          groupName: r.groupName,
          groupType: r.groupType || "NAM",
          cells: ensureTenCells(r.cells, p.systemType)
        }))
      }
    ];

    setEditorSubSystems(savedSubSystems);
    setActiveSubsystemId(savedSubSystems[0]?.id || null);
    
    const defaultTypes = systemTypeSettings[p.systemType] || ["-", "Normal"];
    setDynamicDetectorTypes(defaultTypes);

    setPaintTool("type");
    const defaultPaintVal = defaultTypes.filter(t => t !== "-")[0] || "Normal";
    setPaintValue(defaultPaintVal);

    setEditorHistory([JSON.parse(JSON.stringify(savedSubSystems))]);
    setEditorHistoryIndex(0);

    setIsUnifiedEditorOpen(true);
  };

  const startUnifiedEditorCreate = () => {
    setEditorMode("create");
    setEditorProtocolId(null);
    setEditorName("");
    setEditorAddress("");
    const generatedNum = `VN-99${Math.floor(100 + Math.random() * 900)}`;
    setEditorContractNumber(generatedNum);
    setEditorInterval("Jährlich");
    setEditorSystemType("BMA");
    setEditorStatus("ready_to_download");

    const defaultTypes = systemTypeSettings["BMA"] || ["-", "Normal"];
    setDynamicDetectorTypes(defaultTypes);

    const defaultRows = Array.from({ length: 5 }, (_, grpIdx) => {
      const gId = `GRP-${String(grpIdx + 1).padStart(2, "0")}`;
      const gNames = [
        "Kellergeschoss (Heizungsraum)",
        "Erdgeschoss (Empfangsbereich)",
        "1. Obergeschoss (Flur West)",
        "2. Obergeschoss (Serverraum)",
        "Dachgeschoss (Lagerhalle)"
      ];
      const gName = gNames[grpIdx] || `Gruppe ${grpIdx + 1}`;
      
      const activeType = defaultTypes.filter(t => t !== "-")[0] || "Normal";
      const cells = Array.from({ length: 10 }, (_, sIdx) => {
        const key = (sIdx + 1).toString();
        const type = sIdx < 5 ? activeType : "-";
        return {
          slotKey: key,
          detectorType: type,
          value: ""
        };
      });

      return {
        groupId: gId,
        groupName: gName,
        groupType: "NAM",
        cells
      };
    });

    const initSubsystem: EditorSubsystem = {
      id: `sub-sys-1-${Date.now()}`,
      name: "Anlage 1: Hauptbereich",
      rows: defaultRows
    };

    setEditorSubSystems([initSubsystem]);
    setActiveSubsystemId(initSubsystem.id);

    setPaintTool("type");
    setPaintValue("Normal");

    setEditorHistory([JSON.parse(JSON.stringify([initSubsystem]))]);
    setEditorHistoryIndex(0);

    setIsUnifiedEditorOpen(true);
  };

  const updateSubsystemsAndHistory = (newSubsystems: EditorSubsystem[]) => {
    setEditorSubSystems(newSubsystems);
    const newHistory = editorHistory.slice(0, editorHistoryIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newSubsystems)));
    setEditorHistory(newHistory);
    setEditorHistoryIndex(newHistory.length - 1);
  };

  const pushHistoryState = (nextSubsystems: EditorSubsystem[]) => {
    const cleanHistory = editorHistory.slice(0, editorHistoryIndex + 1);
    cleanHistory.push(JSON.parse(JSON.stringify(nextSubsystems)));
    setEditorHistory(cleanHistory);
    setEditorHistoryIndex(cleanHistory.length - 1);
  };

  const handleUndo = () => {
    if (editorHistoryIndex > 0) {
      const nextIndex = editorHistoryIndex - 1;
      setEditorHistoryIndex(nextIndex);
      setEditorSubSystems(JSON.parse(JSON.stringify(editorHistory[nextIndex])));
      triggerToast("Schritt zurückgesetzt", "info");
    } else {
      triggerToast("Kein Schritt mehr im Verlauf!", "warning");
    }
  };

  const handleRedo = () => {
    if (editorHistoryIndex < editorHistory.length - 1) {
      const nextIndex = editorHistoryIndex + 1;
      setEditorHistoryIndex(nextIndex);
      setEditorSubSystems(JSON.parse(JSON.stringify(editorHistory[nextIndex])));
      triggerToast("Aktion wiederholt", "info");
    } else {
      triggerToast("Keine Aktion mehr zum Wiederholen!", "warning");
    }
  };

  const handleEditorAddGroup = () => {
    const nextId = `GRP-${Date.now()}`;
    const targetLength = editorSubSystems[0]?.rows[0]?.cells.length || 10;
    const firstActiveType = dynamicDetectorTypes.filter(t => t !== "-")[0] || "Normal";
    const newCells = Array.from({ length: targetLength }, (_, i) => ({
      slotKey: (i + 1).toString(),
      detectorType: i < 5 ? firstActiveType : "-",
      value: ""
    }));
    
    const nextSubsystemList = editorSubSystems.map(sub => {
      if (sub.id === activeSubsystemId) {
        return {
          ...sub,
          rows: [
            ...sub.rows,
            {
              groupId: nextId,
              groupName: `Gruppe ${sub.rows.length + 1}`,
              groupType: "NAM",
              cells: newCells
            }
          ]
        };
      }
      return sub;
    });
    
    updateSubsystemsAndHistory(nextSubsystemList);
    triggerToast("Neue Gruppe angelegt!", "success");
  };

  const handleEditorDeleteGroup = (groupId: string) => {
    const nextSubsystemList = editorSubSystems.map(sub => {
      if (sub.id === activeSubsystemId) {
        return {
          ...sub,
          rows: sub.rows.filter(r => r.groupId !== groupId)
        };
      }
      return sub;
    });
    updateSubsystemsAndHistory(nextSubsystemList);
    triggerToast("Gruppe entfernt", "info");
  };

  const handleAddHardwareRow = () => {
    const activeSub = editorSubSystems.find(s => s.id === activeSubsystemId);
    if (!activeSub) return;
    const headers = systemTypeHardwareConfigs[editorSystemType]?.headers || [];
    const newRow: Record<string, string> = { id: `hw-${Date.now()}-${Math.random()}` };
    headers.forEach(h => {
      newRow[h] = "";
    });
    
    const nextList = editorSubSystems.map(sub => {
      if (sub.id === activeSubsystemId) {
        const currentRows = sub.hardwareRows || [];
        return {
          ...sub,
          hardwareRows: [...currentRows, newRow]
        };
      }
      return sub;
    });
    setEditorSubSystems(nextList);
    pushHistoryState(nextList);
    triggerToast("Zusätzliche Hardware-Komponente hinzugefügt", "success");
  };

  const handleHardwareValueChange = (rowId: string, header: string, value: string) => {
    const nextList = editorSubSystems.map(sub => {
      if (sub.id === activeSubsystemId) {
        const currentRows = sub.hardwareRows || [];
        return {
          ...sub,
          hardwareRows: currentRows.map(r => r.id === rowId ? { ...r, [header]: value } : r)
        };
      }
      return sub;
    });
    setEditorSubSystems(nextList);
  };

  const handleDeleteHardwareRow = (rowId: string) => {
    const nextList = editorSubSystems.map(sub => {
      if (sub.id === activeSubsystemId) {
        const currentRows = sub.hardwareRows || [];
        return {
          ...sub,
          hardwareRows: currentRows.filter(r => r.id !== rowId)
        };
      }
      return sub;
    });
    setEditorSubSystems(nextList);
    pushHistoryState(nextList);
    triggerToast("Hardware-Komponente entfernt", "info");
  };

  const applyBrushToSelection = (start: { r: number; c: number }, end: { r: number; c: number }) => {
    const minR = Math.min(start.r, end.r);
    const maxR = Math.max(start.r, end.r);
    const minC = Math.min(start.c, end.c);
    const maxC = Math.max(start.c, end.c);

    const nextSubsystems = editorSubSystems.map(sub => {
      if (sub.id === activeSubsystemId) {
        return {
          ...sub,
          rows: sub.rows.map((row, rIdx) => {
            if (rIdx >= minR && rIdx <= maxR) {
              const nextCells = row.cells.map((cell, cIdx) => {
                if (cIdx >= minC && cIdx <= maxC) {
                  if (paintTool === "type") {
                    if (paintValue === "Beschriftung") {
                      return {
                        ...cell,
                        detectorType: "Beschriftung",
                        value: textBrushValue || ""
                      };
                    } else if (paintValue === "Freitext") {
                      return {
                        ...cell,
                        detectorType: "Freitext",
                        value: ""
                      };
                    } else {
                      return {
                        ...cell,
                        detectorType: paintValue,
                        value: (cell.detectorType === "Beschriftung" || cell.detectorType === "Freitext") ? "" : cell.value
                      };
                    }
                  } else if (paintTool === "trigger") {
                    return {
                      ...cell,
                      value: cell.detectorType === "-" ? "" : paintValue
                    };
                  } else if (paintTool === "text") {
                    return {
                      ...cell,
                      value: cell.detectorType === "-" ? "" : textBrushValue
                    };
                  }
                }
                return cell;
              });
              return { ...row, cells: nextCells };
            }
            return row;
          })
        };
      }
      return sub;
    });

    setEditorSubSystems(nextSubsystems);
    pushHistoryState(nextSubsystems);
  };

  const handleCellMouseDown = (rowIdx: number, cellIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    setSelectionStart({ r: rowIdx, c: cellIdx });
    setSelectionEnd({ r: rowIdx, c: cellIdx });
  };

  const handleCellMouseEnter = (rowIdx: number, cellIdx: number, e: React.MouseEvent) => {
    if (!selectionStart) return;
    e.preventDefault();
    setSelectionEnd({ r: rowIdx, c: cellIdx });
  };

  const handleGlobalMouseUp = () => {
    if (selectionStart && selectionEnd) {
      applyBrushToSelection(selectionStart, selectionEnd);
      setSelectionStart(null);
      setSelectionEnd(null);
    }
  };

  useEffect(() => {
    if (isUnifiedEditorOpen) {
      window.addEventListener("mouseup", handleGlobalMouseUp);
      return () => {
        window.removeEventListener("mouseup", handleGlobalMouseUp);
      };
    }
  }, [isUnifiedEditorOpen, selectionStart, selectionEnd, editorSubSystems, paintTool, paintValue, textBrushValue, activeSubsystemId]);

  const handleAddColumn = () => {
    const currentLength = editorSubSystems[0]?.rows[0]?.cells.length || 10;
    if (currentLength >= 50) {
      triggerToast("Maximale Spaltenanzahl von 50 erreicht!", "warning");
      return;
    }
    const nextLength = currentLength + 1;
    const nextSubsystems = editorSubSystems.map(sub => ({
      ...sub,
      rows: sub.rows.map(row => {
        const nextCells = [...row.cells];
        nextCells.push({
          slotKey: nextLength.toString(),
          detectorType: "-",
          value: ""
        });
        return { ...row, cells: nextCells };
      })
    }));
    updateSubsystemsAndHistory(nextSubsystems);
    triggerToast(`Spalte M${String(nextLength).padStart(2, "0")} hinzugefügt`, "success");
  };

  const handleRemoveColumn = () => {
    const currentLength = editorSubSystems[0]?.rows[0]?.cells.length || 10;
    if (currentLength <= 10) {
      triggerToast("Minimal 10 Spalten erforderlich!", "warning");
      return;
    }
    const nextSubsystems = editorSubSystems.map(sub => ({
      ...sub,
      rows: sub.rows.map(row => ({
        ...row,
        cells: row.cells.slice(0, currentLength - 1)
      }))
    }));
    updateSubsystemsAndHistory(nextSubsystems);
    triggerToast(`Spalte M${String(currentLength).padStart(2, "0")} entfernt`, "info");
  };

  const handleAddSubsystem = () => {
    const nextId = `sub-sys-${Date.now()}`;
    const nextColumnsCount = editorSubSystems[0]?.rows[0]?.cells.length || 10;
    const defaultRows = Array.from({ length: 3 }, (_, grpIdx) => ({
      groupId: `GRP-${String(grpIdx + 1).padStart(2, "0")}`,
      groupName: `Neue Anlage Gruppe ${grpIdx + 1}`,
      groupType: "NAM",
      cells: Array.from({ length: nextColumnsCount }, (_, sIdx) => ({
        slotKey: (sIdx + 1).toString(),
        detectorType: sIdx < 5 ? "Normal" : "-",
        value: ""
      }))
    }));

    const newSub: EditorSubsystem = {
      id: nextId,
      name: `Anlage ${editorSubSystems.length + 1}: Zusatzbereich`,
      rows: defaultRows
    };

    const nextList = [...editorSubSystems, newSub];
    updateSubsystemsAndHistory(nextList);
    setActiveSubsystemId(nextId);
    triggerToast("Zusätzliche separate Anlage hinzugefügt!", "success");
  };

  const handleDeleteSubsystem = () => {
    if (editorSubSystems.length <= 1) {
      triggerToast("Mindestens eine separate Anlage muss vorhanden sein!", "warning");
      return;
    }
    const nextList = editorSubSystems.filter(s => s.id !== activeSubsystemId);
    updateSubsystemsAndHistory(nextList);
    setActiveSubsystemId(nextList[0].id);
    triggerToast("Ausgewählte separate Anlage entfernt", "info");
  };

  const handleRenameSubsystem = (newName: string) => {
    const nextList = editorSubSystems.map(s => {
      if (s.id === activeSubsystemId) {
        return { ...s, name: newName };
      }
      return s;
    });
    setEditorSubSystems(nextList);
  };

  const handleRenameSubsystemBlur = () => {
    pushHistoryState(editorSubSystems);
  };

  // Pre-select correct file type when opening modal based on systemType
  useEffect(() => {
    if (isImportModalOpen) {
      if (editorSystemType === "BMA") {
        setEditorImportFileType("esser");
      } else {
        setEditorImportFileType("csv");
      }
    }
  }, [isImportModalOpen, editorSystemType]);

  const handleDownloadTemplate = (format: "csv" | "xlsx") => {
    const typeLabel = editorSystemType || "BMA";
    let headers = "Gruppe;Name;Slot;Typ;Zustand\n";
    let rows: string[][] = [];

    if (typeLabel === "BMA") {
      rows = [
        ["M01", "EG Flurbereich West", "1", "Normal", "CHECK"],
        ["M01", "EG Flurbereich West", "2", "Normal", ""],
        ["M01", "EG Flurbereich West", "3", "Wärme", "Q1"],
        ["M02", "1. OG Aufenthaltsraum", "1", "Normal", ""],
        ["M02", "1. OG Aufenthaltsraum", "2", "Handmelder", "Def."]
      ];
    } else if (typeLabel === "ELA") {
      rows = [
        ["S01", "Hauptflur Musik", "1", "Decken-LS", "CHECK"],
        ["S01", "Hauptflur Musik", "2", "Wand-LS", ""],
        ["S02", "Cafeteria Küche", "1", "Druckkammer-LS", "Def."]
      ];
    } else if (typeLabel === "Lichtruf") {
      rows = [
        ["01", "Zimmer 101 Station A", "1", "Zimmertaster", "CHECK"],
        ["01", "Zimmer 101 Station A", "2", "Birntaster", ""],
        ["02", "Station Bad links", "1", "Zugmelder", "Def."]
      ];
    } else { // RWA, Sprinkler, etc.
      rows = [
        ["G01", "Haupthalle Süd", "1", "Antrieb", "CHECK"],
        ["G01", "Haupthalle Süd", "2", "Taster", ""],
        ["G02", "Heizungsraum", "1", "Melder", "Def."]
      ];
    }

    if (format === "csv") {
      // Build standard CSV
      let csvContent = "\uFEFF"; // UTF-8 BOM so Excel opens it with correct encoding (umlauts!)
      csvContent += headers;
      rows.forEach(r => {
        csvContent += r.join(";") + "\n";
      });

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Wartungs_Template_${typeLabel}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      triggerToast("CSV Template heruntergeladen!", "success");
    } else {
      // Generate actual Microsoft Excel binary blob using 'xlsx' library on the client!
      try {
        const wsData = [
          ["Gruppe", "Name", "Slot", "Typ", "Zustand"],
          ...rows
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Vorlage");
        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob([wbout], { type: "application/octet-stream" });
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Wartungs_Template_${typeLabel}.xlsx`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        triggerToast("XLSX Template heruntergeladen!", "success");
      } catch (err: any) {
        console.error("XLSX template generation error:", err);
        triggerToast("XLSX Erstellung fehlgeschlagen, lade CSV herunter...", "info");
        // Fallback
        let csvContent = "\uFEFF"; 
        csvContent += headers;
        rows.forEach(r => {
          csvContent += r.join(";") + "\n";
        });
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Wartungs_Template_${typeLabel}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Content = event.target?.result as string;
        
        try {
          const response = await fetch("/api/import", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              filename: file.name,
              content: base64Content,
              importType: editorImportFileType
            })
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({ error: `Server antwortete mit Status ${response.status}` }));
            throw new Error(errData.error || `Serverfehler (${response.status})`);
          }

          const data = await response.json();

          if (data.success && data.subSystems && data.subSystems.length > 0) {
            // Update editor state with imported results
            setEditorSubSystems(data.subSystems);
            setActiveSubsystemId(data.subSystems[0].id);
            pushHistoryState(data.subSystems);
            
            triggerToast(data.message || "Import erfolgreich abgeschlossen!", "success");
            setIsImportModalOpen(false);
          } else {
            throw new Error(data.error || "Fehler beim Verarbeiten der Import-Datei.");
          }
        } catch (postErr: any) {
          triggerToast(`Netzwerkfehler beim Import: ${postErr.message}`, "warning");
        } finally {
          setIsImporting(false);
          // reset input
          e.target.value = "";
        }
      };

      reader.onerror = () => {
        triggerToast("Fehler beim Lesen der Datei.", "warning");
        setIsImporting(false);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      triggerToast(`Importfehler: ${err.message}`, "warning");
      setIsImporting(false);
    }
  };

  const handleSaveUnifiedEditor = () => {
    if (!editorName.trim()) {
      triggerToast("Bitte Name des Wartungsobjekts angeben!", "warning");
      return;
    }
    if (!editorContractNumber.trim()) {
      triggerToast("Bitte eine Vertragsnummer angeben!", "warning");
      return;
    }
    if (editorSubSystems.length === 0) {
      triggerToast("Fehler: Mindestens eine separate Anlage muss vorhanden sein!", "warning");
      return;
    }
    
    const legacyFirstSys = editorSubSystems[0];
    const columnsMaxCount = legacyFirstSys?.rows[0]?.cells.length || 10;
    const calculatedColumns = Array.from({ length: columnsMaxCount }, (_, i) => (i + 1).toString());

    if (editorMode === "create") {
      const newId = `prot-${Date.now()}`;
      const newProtocolItem: ProtocolItem = {
        id: newId,
        name: editorName.trim(),
        address: editorAddress.trim(),
        contractNumber: editorContractNumber.trim(),
        interval: editorInterval,
        systemType: editorSystemType,
        status: "ready_to_download",
        columns: calculatedColumns, 
        applicableValues: ["OK", "Def.", "N.A."],
        detectorTypes: dynamicDetectorTypes,
        rows: legacyFirstSys.rows,
        subSystems: editorSubSystems
      };

      setProtocols(prev => [...prev, newProtocolItem]);
      triggerToast(`Wartungsvertrag ${editorName} erfolgreich angelegt!`, "success");
    } else {
      setProtocols(prev => prev.map(p => {
        if (p.id === editorProtocolId) {
          return {
            ...p,
            name: editorName.trim(),
            address: editorAddress.trim(),
            contractNumber: editorContractNumber.trim(),
            interval: editorInterval,
            status: editorStatus,
            systemType: editorSystemType,
            columns: calculatedColumns,
            detectorTypes: dynamicDetectorTypes,
            rows: legacyFirstSys.rows,
            subSystems: editorSubSystems
          };
        }
        return p;
      }));
      triggerToast(`Wartungsvertrag ${editorName} erfolgreich angepasst!`, "success");
    }

    setIsUnifiedEditorOpen(false);
  };

  // Helper to start adjusting a specific protocol
  const startAdjustProtocol = (p: ProtocolItem) => {
    startUnifiedEditorEdit(p);
  };

  // Helper to save adjusted protocol changes
  const handleSaveAdjustedProtocol = () => {
    if (!adjustName.trim()) {
      triggerToast("Bitte Name des Wartungsobjekts angeben!", "warning");
      return;
    }
    if (!adjustContractNumber.trim()) {
      triggerToast("Bitte eine Vertragsnummer angeben!", "warning");
      return;
    }

    setProtocols(prev => prev.map(p => {
      if (p.id === adjustProtocolId) {
        // Find maximum slot count for columns headers
        let maxSlots = 8;
        adjustRows.forEach(r => {
          if (r.cells.length > maxSlots) {
            maxSlots = r.cells.length;
          }
        });
        const columns = Array.from({ length: maxSlots }, (_, i) => (i + 1).toString());

        return {
          ...p,
          name: adjustName.trim(),
          address: adjustAddress.trim(), // Optional!
          contractNumber: adjustContractNumber.trim(),
          interval: adjustInterval,
          status: adjustStatus,
          systemType: adjustSystemType,
          columns: columns,
          detectorTypes: systemTypeSettings[adjustSystemType] || ["-", "Normal"],
          rows: adjustRows
        };
      }
      return p;
    }));

    triggerToast("Wartungsvertrag erfolgreich angepasst!", "success");
    setIsAdjustProtocolModalOpen(false);
  };

  // Helper to delete dynamic protocol (with safe custom react confirmations)
  const handleDeleteProtocol = (id: string) => {
    setProtocols(prev => prev.filter(p => p.id !== id));
    triggerToast("Protokoll erfolgreich gelöscht!", "success");
    setIsAdjustProtocolModalOpen(false);
    setShowConfirmDeleteAdjust(false);
  };

  // Turnus shift logic for simulating quarters passing
  const handleSimulateQuarterPass = () => {
    const nextQ = (currentQuarter === 4) ? 1 : currentQuarter + 1;
    setCurrentQuarter(nextQ);

    // Vierteljährlich is always affected on any quarter change.
    // Halbjährlich is affected if nextQ is 1 or 3.
    // Jährlich is affected if nextQ is 1.
    const isHalfYearShift = (nextQ === 1 || nextQ === 3);
    const isFullYearShift = (nextQ === 1);

    setProtocols(prev => prev.map(p => {
      let matchesInterval = false;
      if (p.interval === "Vierteljährlich") {
        matchesInterval = true;
      } else if (p.interval === "Halbjährlich" && isHalfYearShift) {
        matchesInterval = true;
      } else if (p.interval === "Jährlich" && isFullYearShift) {
        matchesInterval = true;
      }

      if (matchesInterval) {
        if (p.status === "synchronized") {
          // Reset to pending and clear the measurements
          return {
            ...p,
            status: "ready_to_download" as const,
            isOverdue: false,
            rows: p.rows.map(r => ({
              ...r,
              cells: r.cells.map(c => ({
                ...c,
                value: "" // Clear measurements for the new cycle
              }))
            }))
          };
        } else {
          // It was NOT completed, so mark it as overdue!
          return {
            ...p,
            isOverdue: true
          };
        }
      }
      return p;
    }));

    let logMsg = `Quartalswechsel zu Q${nextQ} simuliert. `;
    if (isFullYearShift) {
      logMsg += "Jahreswechsel vollzogen: Alle abgelaufenen Turnusse (Viertel-, Halb- und Jährlich) wurden aktualisiert!";
    } else if (isHalfYearShift) {
      logMsg += "Halbjahreswechsel vollzogen: Viertel- und Halbjährliche Turnusse wurden aktualisiert!";
    } else {
      logMsg += "Quartal beendet: Vierteljährliche Turnusse wurden aktualisiert!";
    }

    triggerToast(logMsg, "info");
  };

  // Force half-year transition
  const handleSimulateHalfYearPass = () => {
    setProtocols(prev => prev.map(p => {
      if (p.interval === "Vierteljährlich" || p.interval === "Halbjährlich") {
        if (p.status === "synchronized") {
          return {
            ...p,
            status: "ready_to_download" as const,
            isOverdue: false,
            rows: p.rows.map(r => ({
              ...r,
              cells: r.cells.map(c => ({
                ...c,
                value: ""
              }))
            }))
          };
        } else {
          return {
            ...p,
            isOverdue: true
          };
        }
      }
      return p;
    }));
    triggerToast("Halbjahreswechsel manuell forciert! Alle nicht-synchronisierten halbjährlichen/vierteljährlichen Wartungen sind überfällig.", "warning");
  };

  // Force full year transition
  const handleSimulateFullYearPass = () => {
    setProtocols(prev => prev.map(p => {
      if (p.status === "synchronized") {
        return {
          ...p,
          status: "ready_to_download" as const,
          isOverdue: false,
          rows: p.rows.map(r => ({
            ...r,
            cells: r.cells.map(c => ({
              ...c,
              value: ""
            }))
          }))
        };
      } else {
        return {
          ...p,
          isOverdue: true
        };
      }
    }));
    triggerToast("Jahreswechsel manuell forciert! ALLE nicht-synchronisierten Wartungen im System sind nun als überfällig markiert.", "warning");
  };

  // Samba-Archive Browse Directories
  const sDirectory = useMemo(() => {
    if (archivePath.length === 0) {
      // Root: list folders by contractNumber (distinctly)
      const folders = Array.from(new Set(protocols.map(p => p.contractNumber)));
      return {
        type: "ROOT",
        items: folders.map(f => {
          const matchProt = protocols.find(p => p.contractNumber === f);
          return {
            name: f,
            label: matchProt ? `${matchProt.name}` : "Vertragsobjekt",
            type: "folder"
          };
        })
      };
    }

    if (archivePath.length === 1) {
      // Level 1: years folder
      const contract = archivePath[0];
      const matchArchives = simulatedArchives.filter(arc => arc.contractNumber === contract);
      const years = Array.from(new Set(matchArchives.map(arc => arc.year)));
      
      // Also default 2026 if empty
      if (years.length === 0) years.push("2026");

      return {
        type: "YEAR",
        contract,
        items: years.map(y => ({
          name: y,
          label: `Jahr ${y}`,
          type: "folder"
        }))
      };
    }

    if (archivePath.length === 2) {
      // Level 2: halfYears folder
      const contract = archivePath[0];
      const year = archivePath[1];
      const matchArchives = simulatedArchives.filter(arc => arc.contractNumber === contract && arc.year === year);
      const halfYears = Array.from(new Set(matchArchives.map(arc => arc.halfYear)));

      if (halfYears.length === 0) {
        halfYears.push("H1", "H2");
      }

      return {
        type: "HALFYEAR",
        contract,
        year,
        items: halfYears.map(hy => ({
          name: hy,
          label: hy === "H1" ? "1. Halbjahr" : "2. Halbjahr",
          type: "folder"
        }))
      };
    }

    // Level 3: files list
    const contract = archivePath[0];
    const year = archivePath[1];
    const halfYear = archivePath[2];
    const files = simulatedArchives.filter(
      arc => arc.contractNumber === contract && arc.year === year && arc.halfYear === halfYear
    );

    return {
      type: "FILES",
      contract,
      year,
      halfYear,
      items: files.map(f => ({
        name: f.filename,
        label: f.filename,
        meta: `Version ${f.version} • ${f.dateArchived}`,
        rawObject: f,
        type: "file"
      }))
    };
  }, [protocols, simulatedArchives, archivePath]);

  // Handle adding a new contract
  const handleCreateNewContract = () => {
    if (!newContractName) {
      triggerToast("Bitte Name des Wartungsobjekts angeben!", "warning");
      return;
    }
    // Standortadresse is optional! Only name and contract number (vn-nummer) are required.

    let calculatedRows: any[] = [];
    let calculatedSubSystems: SubSystem[] | undefined = undefined;

    if (newContractSetupMethod === "import") {
      // Import workflow
      if (importedDetectors.length === 0) {
        triggerToast("Fehler: Keine Melderdaten importiert! Bitte laden Sie zuerst eine Beispiel-Kundendatei.", "warning");
        return;
      }

      // Group imported detectors by group
      const groupsMap: Record<string, Array<{ slotKey: string; detectorType: string; value: string }>> = {};
      importedDetectors.forEach(item => {
        if (!groupsMap[item.group]) {
          groupsMap[item.group] = [];
        }
        groupsMap[item.group].push({
          slotKey: item.slot,
          detectorType: item.type,
          value: ""
        });
      });

      calculatedRows = Object.keys(groupsMap).map((grpName, index) => {
        const id = `G${String(index + 1).padStart(2, "0")}`;
        return {
          groupId: id,
          groupName: grpName,
          groupType: "NAM",
          cells: groupsMap[grpName]
        };
      });

      // Split into multiple subSystems if we imported an ETB file that includes multiple systems
      if (importFileType === "etb") {
        const sys1rows = calculatedRows.filter(r => r.groupName.startsWith("Anlage 1"));
        const sys2rows = calculatedRows.filter(r => r.groupName.startsWith("Anlage 2"));

        if (sys1rows.length > 0 || sys2rows.length > 0) {
          calculatedSubSystems = [
            {
              id: `sub-sys-1-${Date.now()}`,
              name: "Anlage 1: Hauptstelle",
              rows: sys1rows.map(r => ({
                ...r,
                groupName: r.groupName.replace("Anlage 1 - ", "")
              }))
            },
            {
              id: `sub-sys-2-${Date.now()}`,
              name: "Anlage 2: Labor-Erweiterung",
              rows: sys2rows.map(r => ({
                ...r,
                groupName: r.groupName.replace("Anlage 2 - ", "")
              }))
            }
          ];
        }
      }

    } else {
      // Manual editor workflow
      if (manualGroups.length === 0) {
        triggerToast("Fehler: Bitte legen Sie mindestens eine Gruppe mit Meldern im manuellen Editor an.", "warning");
        return;
      }
      calculatedRows = manualGroups.map(grp => ({
        groupId: grp.groupId,
        groupName: grp.groupName,
        groupType: "NAM",
        cells: grp.slots.map(s => ({
          slotKey: s.slotKey,
          detectorType: s.detectorType,
          value: ""
        }))
      }));
    }

    // Build complete Protocol item
    const newId = `prot-${Date.now()}`;
    const maxSlots = Math.max(...calculatedRows.map(r => r.cells.length), 8);
    const mockColumns = Array.from({ length: maxSlots }, (_, i) => (i + 1).toString());

    const newProtocolItem: ProtocolItem = {
      id: newId,
      name: newContractName,
      address: newContractAddress,
      contractNumber: newContractNumber,
      interval: newContractInterval,
      systemType: newContractSystemType,
      status: "ready_to_download",
      columns: mockColumns,
      applicableValues: ["OK", "Def.", "N.A."],
      detectorTypes: systemTypeSettings[newContractSystemType] || ["-", "Normal"],
      rows: calculatedRows,
      subSystems: calculatedSubSystems
    };

    setProtocols(prev => [...prev, newProtocolItem]);
    triggerToast(
      calculatedSubSystems 
        ? `Wartungsvertrag ${newContractName} mit ${calculatedSubSystems.length} separate Anlagen erfolgreich decodiert & eingepflegt!`
        : `Wartungsvertrag ${newContractName} (${newContractSystemType}) wurde erfolgreich eingepflegt!`, 
      "success"
    );
    setIsAddContractModalOpen(false);
  };

  const handleSimulateFileImport = () => {
    if (importFileType === "etb") {
      setImportedFileName("esser_kundendaten_decoded_project_9912.etb");
      
      const simulatedList = [
        // Subsystem 1: Alarmierungshauptstelle
        { group: "Anlage 1 - Gruppe 01: Technikraum Erdgeschoss", slot: "1", type: "ZD" },
        { group: "Anlage 1 - Gruppe 01: Technikraum Erdgeschoss", slot: "2", type: "DB" },
        { group: "Anlage 1 - Gruppe 02: Korridor Westtrakt", slot: "1", type: "RAS" },
        // Subsystem 2: Labor-Extension
        { group: "Anlage 2 - Gruppe 01: Forschungsbereich Unit B", slot: "1", type: "ZD" },
        { group: "Anlage 2 - Gruppe 01: Forschungsbereich Unit B", slot: "2", type: "TDIF" },
        { group: "Anlage 2 - Gruppe 02: Gefahrenstofflager", slot: "1", type: "RAS" }
      ];
      setImportedDetectors(simulatedList);
      triggerToast("Python ETB-Decoder erfolgreich ausgeführt! 6 Melderpunkte in 2 getrennten Anlagenstrukturen decodiert.", "success");
    } else {
      setImportedFileName(`kundendaten_${newContractSystemType.toLowerCase()}_export_2026.csv`);
      
      // Choose detector types matching current systemType config
      const validTypes = systemTypeSettings[newContractSystemType] || ["Normal"];
      const type1 = validTypes[1] || "Normal";
      const type2 = validTypes[2] || "Normal";
      const type3 = validTypes[3] || "Normal";

      const simulatedList = [
        { group: "Sektion 01: Foyer-Erdzulauf", slot: "1", type: type1 },
        { group: "Sektion 01: Foyer-Erdzulauf", slot: "2", type: type1 },
        { group: "Sektion 01: Foyer-Erdzulauf", slot: "3", type: type2 },
        { group: "Sektion 01: Foyer-Erdzulauf", slot: "4", type: type3 },
        { group: "Sektion 02: EDV Serverraum", slot: "1", type: type1 },
        { group: "Sektion 02: EDV Serverraum", slot: "2", type: type2 },
        { group: "Sektion 02: EDV Serverraum", slot: "3", type: "Normal" },
        { group: "Sektion 02: EDV Serverraum", slot: "4", type: type3 }
      ];

      setImportedDetectors(simulatedList);
      triggerToast("Parst Kundendaten-Import: 8 Melderpunkte aufgeteilt in 2 Gruppen erfolgreich strukturiert!", "success");
    }
  };

  const handleManualAddGroup = () => {
    const nextIdx = manualGroups.length + 1;
    const gId = `GRP_${String(nextIdx).padStart(2, "0")}`;
    const newG: ManualGroup = {
      groupId: gId,
      groupName: `Gruppe ${nextIdx} (Ort/Bereich)`,
      slots: [
        { slotKey: "1", detectorType: "Normal" },
        { slotKey: "2", detectorType: "Normal" }
      ]
    };
    setManualGroups(prev => [...prev, newG]);
  };

  const handleManualDeleteGroup = (groupId: string) => {
    setManualGroups(prev => prev.filter(g => g.groupId !== groupId));
  };

  const handleManualGroupNameChange = (groupId: string, name: string) => {
    setManualGroups(prev => prev.map(g => {
      if (g.groupId === groupId) {
        return { ...g, groupName: name };
      }
      return g;
    }));
  };

  const handleManualAddSlot = (groupId: string) => {
    setManualGroups(prev => prev.map(g => {
      if (g.groupId === groupId) {
        const nextKey = (g.slots.length + 1).toString();
        const firstType = systemTypeSettings[newContractSystemType]?.[1] || "Normal";
        return {
          ...g,
          slots: [...g.slots, { slotKey: nextKey, detectorType: firstType }]
        };
      }
      return g;
    }));
  };

  const handleManualDeleteSlot = (groupId: string, slotKey: string) => {
    setManualGroups(prev => prev.map(g => {
      if (g.groupId === groupId) {
        return {
          ...g,
          slots: g.slots.filter(s => s.slotKey !== slotKey)
        };
      }
      return g;
    }));
  };

  const handleManualSlotTypeChange = (groupId: string, slotKey: string, type: string) => {
    setManualGroups(prev => prev.map(g => {
      if (g.groupId === groupId) {
        return {
          ...g,
          slots: g.slots.map(s => {
            if (s.slotKey === slotKey) {
              return { ...s, detectorType: type };
            }
            return s;
          })
        };
      }
      return g;
    }));
  };

  const currentTenant = tenants.find(t => t.id === activeTenantId) || tenants[0];

  return (
    <div className="flex-1 bg-slate-50 flex flex-col overflow-y-auto" id="central-webui-playground">
      
      {/* Upper Net Status Info Ribbon */}
      <div className="bg-gradient-to-r from-[#002b6d] to-[#003d9b] text-white px-6 py-3 flex flex-wrap justify-between items-center text-xs font-mono shadow-sm border-b border-[#00245a] gap-2">
        <div className="flex items-center gap-2">
          <Server size={14} className="text-amber-400 shrink-0" />
          <span className="font-bold tracking-wider">ZENTRALESTEUERUNG INTRANET WEBUI</span>
          <span className="bg-emerald-950 px-2 py-0.5 text-[9px] border border-emerald-500 rounded text-emerald-300 font-bold uppercase">Docker Network Mode</span>
        </div>
        <div className="flex items-center gap-4 text-slate-200">
          <span>SQLite MD-Datenbank: <strong className="text-white font-mono">md_{currentTenant?.id || "tenant_1"}.db</strong></span>
          <span className="hidden sm:inline">|</span>
          <span>Samba Partition: <strong className="text-white font-mono">{currentTenant?.sambaPath || "\\\\samba.corp.internal\\archival\\"}</strong></span>
        </div>
      </div>

      {/* Dynamic Tab Navigation & Tenant Switcher Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 shadow-sm">
        
        {/* Tab Selection */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveWebTab("dashboard")}
            className={`px-4 py-2 text-xs font-bold font-mono tracking-wider uppercase rounded border flex items-center gap-2 transition-all cursor-pointer ${
              activeWebTab === "dashboard"
                ? "bg-[#003d9b] text-white border-[#003d9b] shadow-sm font-semibold"
                : "bg-white text-slate-700 hover:text-[#003d9b] border-slate-200"
            }`}
            id="tab-webui-dashboard"
          >
            <Database size={13} /> Matrix-Übersicht & Samba-Archiv
          </button>
          
          <button
            onClick={() => setActiveWebTab("users")}
            className={`px-4 py-2 text-xs font-bold font-mono tracking-wider uppercase rounded border flex items-center gap-2 transition-all cursor-pointer ${
              activeWebTab === "users"
                ? "bg-[#003d9b] text-white border-[#003d9b] shadow-sm font-semibold"
                : "bg-white text-slate-700 hover:text-[#003d9b] border-slate-200"
            }`}
            id="tab-webui-users"
          >
            <User size={13} /> Benutzerverwaltung
          </button>

          <button
            onClick={() => setActiveWebTab("settings")}
            className={`px-4 py-2 text-xs font-bold font-mono tracking-wider uppercase rounded border flex items-center gap-2 transition-all cursor-pointer ${
              activeWebTab === "settings"
                ? "bg-[#003d9b] text-white border-[#003d9b] shadow-sm font-semibold"
                : "bg-white text-slate-700 hover:text-[#003d9b] border-slate-200"
            }`}
            id="tab-webui-settings"
          >
            <Layers size={13} /> Einstellungen
          </button>
        </div>

        {/* Mandanten-Wechsler */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 font-mono">AKTIVER MANDANT:</span>
            <select
              value={activeTenantId}
              onChange={(e) => handleSwapTenant(e.target.value)}
              className="h-10 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-[#003d9b] px-3 font-bold text-xs rounded focus:outline-none focus:border-[#003d9b] cursor-pointer"
              id="select-tenant-webui"
            >
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {activeWebTab === "dashboard" && (
        <div className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          
          <div className="bg-white border-2 border-slate-200 p-4 rounded-lg flex flex-col justify-between hover:border-[#003d9b]/40 transition-all shadow-sm">
            <span className="text-[10px] uppercase font-bold text-slate-500 font-mono tracking-wider">Verträge Gesamt</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-slate-800">{stats.total}</span>
              <span className="text-[10px] text-slate-500">Serviceobjekte</span>
            </div>
            <div className="mt-2 text-[10px] bg-slate-100 px-2 py-0.5 rounded font-mono text-slate-600 block text-center truncate">
              Abdeckung: 100% aktiv
            </div>
          </div>

          <div className="bg-white border-2 border-slate-200 p-4 rounded-lg flex flex-col justify-between hover:border-amber-500/40 transition-all shadow-sm">
            <span className="text-[10px] uppercase font-bold text-amber-600 font-mono tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
              Ausstehend
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-amber-600">{stats.pending}</span>
              <span className="text-[10px] text-slate-500">zur Abholung</span>
            </div>
            <div className="mt-2 text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-mono block text-center">
              Wartet auf Außendienst
            </div>
          </div>

          <div className="bg-white border-2 border-slate-200 p-4 rounded-lg flex flex-col justify-between hover:border-emerald-500/40 transition-all shadow-sm">
            <span className="text-[10px] uppercase font-bold text-emerald-600 font-mono tracking-wider">Synchronisiert</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-emerald-600">{stats.synchronized}</span>
              <span className="text-[10px] text-slate-500">fertig gemeldet</span>
            </div>
            <div className="mt-2 text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-mono block text-center">
              Bereit für Archivierung & Re-Schedule
            </div>
          </div>

          <div 
            onClick={() => {
              if (stats.defectCount > 0) {
                setIsDefectModalOpen(true);
              } else {
                triggerToast("Keine Mängelpunkte in den aktuellen Protokollen!", "success");
              }
            }}
            className={`bg-white border-2 p-4 rounded-lg flex flex-col justify-between transition-all shadow-sm cursor-pointer hover:scale-[1.02] ${
              stats.defectCount > 0 
                ? "border-red-200 hover:border-red-500 hover:bg-red-50/10" 
                : "border-slate-200 hover:border-emerald-500"
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-red-600 font-mono tracking-wider flex items-center gap-1">
              <AlertTriangle size={12} className={stats.defectCount > 0 ? "animate-pulse" : ""} />
              Mängelpunkte
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-red-600">{stats.defectCount}</span>
              <span className="text-[10px] text-slate-500 font-mono">Defekte Melder</span>
            </div>
            <div className={`mt-2 text-[10px] px-2 py-0.5 rounded font-mono font-bold block text-center transition-colors ${
              stats.defectCount > 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
            }`}>
              {stats.defectCount > 0 ? "Klicken für Mängelbericht 👀" : "Alle Anlagen fehlerfrei ✓"}
            </div>
          </div>

        </div>

        {/* Dashboard Content splits into Service Protocols Database view (Left) and Samba backup archive system (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          
          {/* Main Protocols database console */}
          <div className="bg-white border-2 border-slate-200 rounded-lg shadow-sm flex flex-col lg:col-span-2 overflow-hidden">
            <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div className="flex items-center gap-2">
                <Database size={16} className="text-[#003d9b]" />
                <h2 className="font-bold text-sm text-slate-800">Aktive Wartungsvereinbarungen (Datenbank)</h2>
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-tight bg-white px-2 py-0.5 border border-slate-200 rounded">
                Real-time Sync mit SQLite & Netlink API
              </span>
            </div>

            {/* Filters Bar */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Suche Vertrag, Ort, Matchcode..."
                  className="w-full text-xs pl-8 pr-3 h-9 bg-white border border-slate-300 rounded focus:outline-none focus:border-[#003d9b] font-mono"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <select 
                className="text-xs h-9 bg-white border border-slate-300 rounded px-2 focus:outline-none font-semibold text-slate-700"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="ALL">Alle Anlagentypen</option>
                <option value="BMA">BMA (Brandmelder)</option>
                <option value="EMA">EMA (Einbruchmelder)</option>
                <option value="ELA">ELA (Akustiksysteme)</option>
                <option value="LIRA">LIRA (Lichtsysteme)</option>
                <option value="SLA">SLA (Sprinkler)</option>
              </select>

              <select 
                className="text-xs h-9 bg-white border border-slate-300 rounded px-2 focus:outline-none font-semibold text-slate-700"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="ALL">Alle Status-Stufen</option>
                <option value="ready_to_download">⏱ Ausstehend</option>
                <option value="downloaded">⚙ Im Außendienst (Geladen)</option>
                <option value="upload_pending">⚡ Upload ausstehend</option>
                <option value="synchronized">✓ Synchronisiert</option>
              </select>

              <button 
                onClick={() => {
                  startUnifiedEditorCreate();
                }}
                className="px-3.5 h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-xs inline-flex items-center gap-1 transition-all shadow-sm active:scale-95 cursor-pointer"
                title="Wartungsvertrag oder neue Anlage direkt in der Web-Zentrale einpflegen"
              >
                <Plus size={14} /> Neue Anlage einpflegen
              </button>
            </div>

            {/* List Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-800 border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase font-mono border-b border-indigo-50 text-[10px] font-bold">
                    <th className="px-4 py-3">Vertrag / Objekt</th>
                    <th className="px-3 py-3">Typ</th>
                    <th className="px-3 py-3">Wartungsturnus</th>
                    <th className="px-3 py-3">Feld-Status</th>
                    <th className="px-4 py-3 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProtocols.length > 0 ? (
                    filteredProtocols.map(p => {
                      // Calc rows filled details across subsystems (if they exist) or root rows
                      let cellsTotal = 0;
                      let cellsFilled = 0;
                      let cellsDef = 0;
                      
                      const rowsToCalculate = p.subSystems && p.subSystems.length > 0 
                        ? p.subSystems.flatMap(sub => sub.rows)
                        : p.rows;

                      rowsToCalculate.forEach(r => {
                        r.cells.forEach(c => {
                          if (c.detectorType !== "-") {
                            cellsTotal++;
                            if (c.value !== "") {
                              cellsFilled++;
                              if (c.value === "Def." || c.value?.toLowerCase() === "def") cellsDef++;
                            }
                          }
                        });
                      });

                      const percentVal = cellsTotal > 0 ? Math.round((cellsFilled / cellsTotal) * 100) : 0;

                      return (
                        <tr 
                          key={p.id} 
                          className={`font-sans transition-colors duration-155 border-b border-slate-100 ${
                            p.isOverdue 
                              ? "bg-rose-50/80 hover:bg-rose-150 border-l-4 border-l-red-600 animate-pulse-subtle" 
                              : selectedWebId === p.id 
                                ? "bg-blue-50/40 hover:bg-slate-50" 
                                : "hover:bg-slate-50"
                          }`}
                        >
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-slate-800 flex flex-wrap items-center gap-1.5 font-sans">
                              <span>{p.name}</span>
                              {p.isOverdue && (
                                <span className="bg-red-600 hover:bg-red-700 text-white text-[9px] font-extrabold uppercase font-mono px-2 py-0.5 rounded shadow-sm flex items-center gap-0.5 animate-pulse shrink-0">
                                  ⚠️ Wartung überfällig
                                </span>
                              )}
                              {cellsDef > 0 && (
                                <span className="bg-red-100 text-red-805 text-[9px] font-mono px-1.5 py-0.5 rounded flex items-center shrink-0 font-bold border border-red-200">
                                  {cellsDef} DEFEKT
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 mt-0.5 max-w-[450px] truncate">
                              Vertrag: <strong className="text-indigo-950">{p.contractNumber}</strong> | {p.address}
                            </div>
                            {p.subSystems && p.subSystems.length > 0 && (
                              <div className="mt-1.5 flex flex-col gap-1 max-w-[550px]">
                                <div className="inline-flex items-center gap-1 text-[9px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 font-extrabold w-fit uppercase tracking-tight font-mono">
                                  <SlidersHorizontal size={9} />
                                  <span>{p.subSystems.length} separate Anlagen</span>
                                </div>
                                <div className="text-[9.5px] text-slate-500 font-mono flex flex-wrap gap-x-2 gap-y-0.5 leading-snug">
                                  {p.subSystems.map((sub, sIdx) => {
                                    const subDetectorsCount = sub.rows.reduce((sum, r) => sum + r.cells.filter(c => c.detectorType !== "-").length, 0);
                                    return (
                                      <span key={sub.id || sIdx} className="bg-slate-100 px-1 py-0.5 rounded text-[8.5px] text-slate-600 inline-block font-mono border border-slate-205/40">
                                        {sub.name.split(":")[0] || sub.name}: <strong className="text-indigo-955">{subDetectorsCount} Melder</strong>
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3.5">
                            <span 
                              className="font-mono font-bold px-1.5 py-0.5 rounded text-[10px] border transition-all duration-200"
                              style={{
                                backgroundColor: `${systemTypeMetadata[p.systemType]?.color || "#003d9b"}15`,
                                color: systemTypeMetadata[p.systemType]?.color || "#003d9b",
                                borderColor: `${systemTypeMetadata[p.systemType]?.color || "#003d9b"}40`
                              }}
                              title={systemTypeMetadata[p.systemType]?.name || p.systemType}
                            >
                              {p.systemType}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 font-medium text-slate-700">
                            {p.interval}
                          </td>
                          <td className="px-3 py-3.5">
                            {p.status === "ready_to_download" && (
                              <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-semibold text-[10px] inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                ⏱ Ausstehend
                              </span>
                            )}
                            {p.status === "downloaded" && (
                              <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold text-[10px] inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                ⚙ Geladen
                              </span>
                            )}
                            {p.status === "upload_pending" && (
                              <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-semibold text-[10px] inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                                ⚡ Upload ausstehend
                              </span>
                            )}
                            {p.status === "synchronized" && (
                              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold text-[10px] inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                ✓ Synchronisiert
                              </span>
                            )}
                            <div className="w-24 bg-slate-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
                              <div 
                                className={`h-full ${p.status === "synchronized" ? "bg-emerald-500" : "bg-[#003d9b]"}`}
                                style={{ width: `${percentVal}%` }}
                              ></div>
                            </div>
                            <span className="text-[9px] text-slate-400 font-mono mt-0.5 block">{cellsFilled}/{cellsTotal} Knoten geprüft ({percentVal}%)</span>
                          </td>
                          <td className="px-4 py-3.5 text-right space-x-1.5">
                            <button 
                              onClick={() => setSelectedWebId(selectedWebId === p.id ? null : p.id)}
                              className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-bold text-[10px] text-slate-700 hover:bg-slate-200 transition-colors inline-flex items-center gap-0.5"
                              title="Zeigt die aktuelle Tabellenstruktur direkt in der Datenbank"
                            >
                              <Eye size={12} /> Matrix
                            </button>
                            
                            <button 
                              onClick={() => {
                                setPdfModalId(p.id);
                                setSelectedArchiveForPdf(null);
                              }}
                              className="px-2 py-1 bg-white border-2 border-[#003d9b] text-[#003d9b] hover:bg-indigo-50 font-bold text-[10px] rounded transition-colors"
                              title="Simuliert die Generierung des Berichts via ReportLab PDF"
                            >
                              Report PDF
                            </button>

                            <button 
                              onClick={() => startAdjustProtocol(p)}
                              className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] rounded transition-colors inline-flex items-center gap-1 shadow-sm cursor-pointer"
                              title="Dieses Protokoll anpassen (Meldertyp, Sektionen, Status, Löschen)"
                              id={`btn-adjust-${p.id}`}
                            >
                              <Wrench size={11} /> Anpassen
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 font-mono text-xs">
                        Keine Protokolle gefunden, welche den Filtern entsprechen.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Inspector handled as overlay modal below */}

          </div>

          {/* Virtual Samba backup directory system */}
          <div className="bg-white border-2 border-slate-200 rounded-lg shadow-sm flex flex-col overflow-hidden">
            <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Folder size={16} className="text-amber-500" />
                <h2 className="font-bold text-sm text-slate-800">Samba Archiv-Explorer</h2>
              </div>
              <span className="bg-amber-100 text-amber-800 text-[9px] font-mono px-1.5 py-0.5 font-bold rounded">
                Samba Server V4
              </span>
            </div>

            {/* Path Breadcrumbs */}
            <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center gap-1 text-[11px] font-mono text-slate-600 overflow-x-auto whitespace-nowrap scrollbar-none">
              <button 
                onClick={() => setArchivePath([])}
                className="hover:text-[#003d9b] hover:underline flex items-center gap-0.5 text-slate-800 font-bold"
              >
                samba-host \ archival
              </button>
              
              {archivePath.map((segment, idx) => (
                <span key={idx} className="flex items-center gap-1">
                  <ChevronRight size={10} className="text-slate-400" />
                  <button 
                    onClick={() => setArchivePath(archivePath.slice(0, idx + 1))}
                    className={`hover:text-[#003d9b] hover:underline ${idx === archivePath.length - 1 ? "text-indigo-900 font-bold bg-[#003d9b]/10 px-1 rounded" : ""}`}
                  >
                    {segment}
                  </button>
                </span>
              ))}
            </div>

            {/* Samba folder & files contents list */}
            <div className="flex-1 p-3 overflow-y-auto max-h-[360px] lg:max-h-[580px] bg-white min-h-[220px]">
              
              {/* Back navigation option */}
              {archivePath.length > 0 && (
                <button 
                  onClick={() => setArchivePath(prev => prev.slice(0, prev.length - 1))}
                  className="w-full flex items-center gap-2 p-2 hover:bg-slate-50 rounded text-xs font-semibold text-slate-600 border-b border-slate-100/50 mb-1"
                >
                  <ArrowLeft size={13} /> .. (Zurück nach oben)
                </button>
              )}

              <div className="space-y-1">
                {sDirectory.items.length > 0 ? (
                  sDirectory.items.map((item, idx) => (
                    <div 
                      key={idx}
                      onClick={() => {
                        if (item.type === "folder") {
                          setArchivePath(prev => [...prev, item.name]);
                        } else if (item.type === "file" && item.rawObject) {
                          setSelectedArchiveForPdf(item.rawObject);
                          setPdfModalId(null); // disables the regular protocol view
                        }
                      }}
                      className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                        item.type === "folder" ? "hover:bg-amber-500/10" : "hover:bg-blue-500/10"
                      } ${selectedArchiveForPdf?.filename === item.name ? "bg-blue-500/15 border border-blue-500/30" : ""}`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        {item.type === "folder" ? (
                          <FolderOpen size={16} className="text-amber-500 shrink-0" />
                        ) : (
                          <FileText size={16} className="text-blue-500 shrink-0" />
                        )}
                        <div className="truncate text-left">
                          <p className="text-xs font-semibold font-mono text-slate-800 truncate">{item.name}</p>
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">{item.label}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        {item.type === "folder" ? (
                          <ChevronRight size={14} className="text-slate-400" />
                        ) : (
                          <span className="text-[9px] font-mono text-slate-400 block whitespace-nowrap bg-slate-100 px-1.5 py-0.5 rounded">
                            PDF-Dokument
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-slate-400 space-y-2">
                    <HelpCircle size={32} className="mx-auto text-slate-300" />
                    <p className="text-xs font-mono">Verzeichnis ist leer.</p>
                    <p className="text-[10px] text-slate-400">Archivieren Sie ein synchronisiertes Protokoll per "Neu planen"-Button, um den Versionierungs-Zyklus zu erproben!</p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Helper Tip Box */}
            <div className="p-3 border-t border-slate-100 bg-slate-50 font-sans text-[11px] text-slate-600 leading-relaxed">
              <span className="font-bold text-[#003d9b] block mb-0.5">Automatisierte Samba-Struktur:</span>
              <p>
                Der Python Core-Worker archiviert Dokumente unter <code className="font-mono text-[10px] bg-slate-200 px-1 rounded">Archiv/[Vertragsnr]/[Jahr]/[Halbjahr]/</code>. 
                Sollte ein Turnus neu geplant werden, benennt das System die Datei hoch (<code className="font-mono text-[10px]">_V1.pdf</code>, <code className="font-mono text-[10px]">_V2.pdf</code>) und hält die Kette lückenlos!
              </p>
            </div>

          </div>

        </div>
      </div>
      )}

      {activeWebTab === "users" && (
        <div className="p-6 space-y-6">
          
          {/* Workspace Title Card */}
          <div className="bg-white border-2 border-slate-200 rounded-lg p-6 shadow-sm flex flex-col md:flex-row justify-between md:items-center gap-4 animate-fadeIn">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
                <User size={22} className="text-[#003d9b]" />
                Mitarbeiter & Benutzer-Verwaltung
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Verwalten Sie hier alle Mitarbeiterprofile, Zugangs-Keycards und Sperrungs-Zustände für das System <strong>{currentTenant?.name}</strong>.
              </p>
            </div>
            
            <button
              onClick={() => {
                setNewUserName("");
                setNewUserRole("Aussendienst-Techniker");
                setNewUserUsername("");
                setNewUserPassword("");
                setNewUserCodeword("");
                setIsAddUserModalOpen(true);
              }}
              className="bg-[#003d9b] hover:bg-[#002b6d] text-white px-5 py-2.5 rounded font-bold text-xs flex items-center gap-1.5 shadow-md transition-colors cursor-pointer shrink-0"
              id="btn-add-employee-trigger"
            >
              <Plus size={15} /> Mitarbeiter anlegen
            </button>
          </div>

          {/* Layout Grid for Employee Table & Play Store QR */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
            
            {/* Left Column: Users Table / Grid */}
            <div className="bg-white border-2 border-slate-200 rounded-lg shadow-sm overflow-hidden flex flex-col lg:col-span-3">
              <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex justify-between items-center text-xs font-mono">
                <span className="font-bold text-slate-700">Aktive Benutzerkonten im SQLite Mandantenspeicher</span>
                <span className="text-slate-500 uppercase text-[9px] bg-white border px-1.5 py-0.5 rounded">
                  Partition: md_{currentTenant?.id}.db
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3.5 px-4 font-mono">Mitarbeiter</th>
                      <th className="py-3.5 px-4 font-mono">Rolle / Berechtigung</th>
                      <th className="py-3.5 px-4 font-mono">Credentials (Login)</th>
                      <th className="py-3.5 px-4 font-mono">Mainkey (Codewort)</th>
                      <th className="py-3.5 px-4 font-mono">Zustand</th>
                      <th className="py-3.5 px-4 text-center font-mono w-72">Geräte - Einrichtung & Verwaltung</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {currentTenant?.users && currentTenant.users.length > 0 ? (
                      currentTenant.users.map((u: any) => {
                        const isLocked = u.status === "Gesperrt";
                        return (
                          <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${isLocked ? "bg-red-50/10" : ""}`}>
                            
                            {/* Name */}
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold font-mono text-xs ${
                                  isLocked ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                                }`}>
                                  {u.name.split(" ").map((n: string) => n[0]).join("")}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-800">{u.name}</p>
                                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {u.id}</p>
                                </div>
                              </div>
                            </td>

                            {/* Rolle */}
                            <td className="py-4 px-4">
                              <span className={`inline-block px-2.5 py-1 rounded font-bold text-[10px] font-sans ${
                                u.role === "Büro-Administrator" 
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-sky-100 text-sky-800"
                              }`}>
                                {u.role}
                              </span>
                            </td>

                            {/* Credentials */}
                            <td className="py-4 px-4 font-mono">
                              <div className="space-y-0.5">
                                <p className="text-[11px] text-slate-700"><span className="text-slate-400 text-[10px] select-none">Benutzer:</span> {u.username}</p>
                                <p className="text-[10px] text-slate-505"><span className="text-slate-400 text-[9px] select-none">Passwort:</span> {u.password}</p>
                              </div>
                            </td>

                            {/* Codewort */}
                            <td className="py-4 px-4 font-mono text-xs text-slate-700">
                              {u.codeword}
                            </td>

                            {/* Status */}
                            <td className="py-4 px-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-full ${
                                isLocked 
                                  ? "bg-red-100 text-red-800 font-semibold"
                                  : "bg-green-100 text-green-800 font-semibold"
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isLocked ? "bg-red-500" : "bg-green-500"}`}></span>
                                {u.status}
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="py-4 px-4 justify-end flex items-center gap-1.5">
                              
                              {/* Toggle Lock Actions */}
                              <button
                                onClick={() => handleToggleBlockUser(u.id)}
                                className={`px-3 py-1.5 text-[10px] font-bold rounded shadow-sm border transition-all flex items-center gap-0.5 cursor-pointer ${
                                  isLocked 
                                    ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-600"
                                    : "bg-slate-100 hover:bg-slate-205 text-slate-700 border-slate-300"
                                }`}
                                title={isLocked ? "Profil entsperren und aktiv schalten" : "Profil sperren (Login sperren)"}
                              >
                                {isLocked ? "Freigeben" : "Sperren"}
                              </button>

                              {/* QR Code trigger */}
                              <button
                                onClick={() => setQrModalUser(u)}
                                className="px-3 py-1.5 bg-white border-2 border-[#003d9b] text-[#003d9b] hover:bg-indigo-50 font-bold text-[10px] rounded shadow-sm flex items-center gap-1 transition-colors cursor-pointer"
                                title="Einrichtungs-QR für QR Scanner der Android App anzeigen"
                              >
                                <QrCode size={11} /> Einstiegs-QR
                              </button>

                              {/* onboarding sheet */}
                              <button
                                onClick={() => setOnboardingModalUser(u)}
                                className="px-3 py-1.5 bg-white border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-50 font-bold text-[10px] rounded shadow-sm flex items-center gap-1 transition-colors cursor-pointer"
                                title="Offizielles Onboarding Hinweisblatt mit QR Code zum drucken erstellen"
                              >
                                <Printer size={11} /> Hinweisblatt
                              </button>

                              {/* Delete Button */}
                              <button
                                onClick={() => {
                                  if (confirm(`Möchten Sie den Mitarbeiter "${u.name}" dauerhaft löschen?`)) {
                                    handleDeleteUser(u.id);
                                  }
                                }}
                                className="p-1 px-3 py-1.5 text-center bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] rounded shadow-sm transition-colors cursor-pointer"
                                title="Mitarbeiter aus dem Mandanten entfernen"
                              >
                                <Trash2 size={11} />
                              </button>

                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400 font-mono text-xs">
                          Keine Mitarbeiterprofile in diesem Mandanten hinterlegt. Klicken Sie auf "+ Mitarbeiter anlegen" um neu zu initialisieren.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Column: Google Play Store App Download Card */}
            <div className="bg-slate-900 border-2 border-slate-800 rounded-lg p-5 shadow-md text-white space-y-4 flex flex-col items-center justify-between lg:col-span-1 min-h-[440px]">
              {/* Card Header */}
              <div className="w-full text-left space-y-1">
                <div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase text-emerald-400 tracking-wider font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Geprüft &amp; Veröffentlicht
                </div>
                <h3 className="text-xs font-black text-slate-100 uppercase tracking-wide flex items-center gap-1.5 pt-0.5">
                  <Play size={13} className="text-[#00c1f6]" /> Android Service-App
                </h3>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Installieren Sie die offizielle App auf den Arbeitsgeräten Ihrer Außendiensttechniker für den Vor-Ort-Gebrauch.
                </p>
              </div>

              {/* Advanced SVG Play Store QR Code */}
              <div className="p-3 bg-white rounded-lg shadow-sm flex justify-center items-center">
                <svg className="w-32 h-32 select-none" viewBox="0 0 100 100">
                  {/* QR Code Anchor Boxes */}
                  <rect x="5" y="5" width="25" height="25" fill="#0f172a" rx="3" />
                  <rect x="10" y="10" width="15" height="15" fill="white" rx="1" />
                  <rect x="13" y="13" width="9" height="9" fill="#003d9b" rx="1" />

                  <rect x="70" y="5" width="25" height="25" fill="#0f172a" rx="3" />
                  <rect x="75" y="10" width="15" height="15" fill="white" rx="1" />
                  <rect x="78" y="13" width="9" height="9" fill="#003d9b" rx="1" />

                  <rect x="5" y="70" width="25" height="25" fill="#0f172a" rx="3" />
                  <rect x="10" y="75" width="15" height="15" fill="white" rx="1" />
                  <rect x="13" y="78" width="9" height="9" fill="#003d9b" rx="1" />

                  {/* Simulated random QR data blocks using fine SVG paths */}
                  <path d="M 35 10 L 40 10 M 45 10 L 55 10 M 60 10 L 65 10" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M 35 15 L 45 15 M 50 15 L 55 15 M 65 15 L 65 20" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M 35 20 L 50 20 M 60 20 L 65 20" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M 35 25 L 40 25 M 48 25 L 58 25 M 62 25 L 65 25" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />

                  <path d="M 10 35 L 25 35 M 35 35 L 45 35 M 55 35 L 75 35 M 85 35 L 90 35" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M 5 40 L 15 40 M 30 40 L 40 40 M 50 40 L 65 40 M 75 40 L 95 40" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M 15 45 L 20 45 M 35 45 L 55 45 M 60 45 L 80 45" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M 5 50 L 25 50 M 30 50 L 50 50 M 55 50 L 65 50 M 70 50 L 95 50" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M 10 55 L 20 55 M 35 55 L 45 55 M 55 55 L 75 55 M 80 55 L 90 55" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />

                  <path d="M 35 70 L 45 70 M 55 70 L 65 70 M 80 70 L 90 70" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M 35 75 L 40 75 M 50 75 L 65 75 M 75 75 L 95 75" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M 35 80 L 55 80 M 60 80 L 70 80 M 85 80 L 90 80" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M 35 85 L 40 85 M 48 85 L 58 85 M 68 85 L 78 85 M 85 85 L 95 85" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M 35 90 L 45 90 M 50 90 L 60 90 M 70 90 L 90 90" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />

                  {/* Center Google Play themed visual target box */}
                  <rect x="41" y="41" width="18" height="18" fill="white" rx="3.5" stroke="#0f172a" strokeWidth="1" />
                  {/* Play store icon colored triangles */}
                  <path d="M 45 44 L 54.5 49.5 L 45 55 Z" fill="#00C1F6" />
                  <path d="M 45 44 L 49.5 48.5 L 45 52 Z" fill="#FF2C54" />
                  <path d="M 49.5 48.5 L 54.5 49.5 L 51 51.5 Z" fill="#FFBA00" />
                  <path d="M 45 52 L 51 52 L 54.5 49.5 L 45 55 Z" fill="#00E57F" />
                </svg>
              </div>

              <div className="w-full space-y-2.5 text-center">
                <span className="inline-block bg-slate-850 border border-slate-800 px-3 py-1.5 rounded text-[8.5px] font-mono tracking-tight text-slate-300 w-full">
                  App Store Package ID: 
                  <span className="block font-bold text-[#00c1f6] uppercase tracking-normal text-[8.5px] mt-0.5">com.securesys.maintenance</span>
                </span>
                
                <p className="text-[10.5px] text-slate-400 leading-normal">
                  Scannen Sie den QR-Code mit der Handy-Kamera ein, um die App im Google Play Store schnell aufzurufen.
                </p>

                <a 
                  href="https://play.google.com/store/apps/details?id=com.securesys.maintenance.service" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#00c1f6]/10 hover:bg-[#00c1f6]/20 text-[#00c1f6] border border-[#00c1f6]/30 font-extrabold text-xs rounded transition-all cursor-pointer shadow-sm active:scale-95"
                  title="Öffne Mock Play Store Link"
                >
                  <Play size={11} fill="currentColor" /> Play Store öffnen
                </a>
              </div>
            </div>

          </div>
        </div>
      )}

      {activeWebTab === "settings" && (
        <div className="p-6 space-y-6 animate-fadeIn">
          
          {/* Section: Globale Sicherheitsparameter */}
          <div className="bg-white border-2 border-slate-200 rounded-lg p-6 shadow-sm">
            <h2 className="text-sm font-bold tracking-wider font-mono text-slate-800 uppercase flex items-center gap-2 mb-2">
              <ShieldCheck className="text-[#003d9b]" size={18} />
              Globale Sicherheitsparameter (Anwendungsweiter Mainkey)
            </h2>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Der Mainkey (Authentifizierungs-Codewort) gilt systemweit für alle Geräte-Scans im Docker-Verbund. Das Endgerät gleicht diesen Schlüssel ab, um exklusiven Datenzugriff auf die SQLite-Schnittstellen und Samba-Freigaben zu erhalten.
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 max-w-xl">
              <div className="flex-1 font-mono">
                <label className="block text-[10px] font-bold text-slate-550 uppercase tracking-wider mb-1">Globaler Master-Mainkey / Codewort</label>
                <input
                  type="text"
                  value={globalMainkey}
                  onChange={(e) => {
                    setGlobalMainkey(e.target.value);
                    triggerToast("Globaler Mainkey aktualisiert!", "info");
                  }}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded text-xs select-all text-[#003d9b] font-bold focus:outline-none focus:border-[#003d9b]"
                  placeholder="MASTER-VDS-SECURE-KEY..."
                />
              </div>
              <div className="shrink-0 pt-5">
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono px-2.5 py-1 rounded block">
                  Aktiv geschaltet
                </span>
              </div>
            </div>
          </div>

          {/* Section: Turnus- und Perioden-Simulator */}
          <div className="bg-white border-2 border-slate-200 rounded-lg p-6 shadow-sm">
            <h2 className="text-sm font-bold tracking-wider font-mono text-slate-800 uppercase flex items-center gap-2 mb-2">
              <Calendar className="text-indigo-600" size={18} />
              Turnus- und Perioden-Simulator
            </h2>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Dieser Simulator ermöglicht es Ihnen, den Ablauf von Quartalen, Halbjahren und Jahren virtuell zu beschleunigen. 
              Hierdurch können Sie das Systemverhalten testen: Bei Ablauf eines Turnus werden bereits synchronisierte Protokolle wieder auf 
              <strong> „Ausstehend“</strong> gesetzt (Messwerte gelöscht). Unvollständige Protokolle werden automatisch rot als 
              <strong className="text-red-600"> „Wartung überfällig“</strong> markiert.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-mono">Aktueller Simulator-Status</span>
                <div className="flex items-center gap-3">
                  <div className="bg-[#003d9b] text-white font-mono font-black text-xs px-3 py-1.5 rounded shadow-sm">
                    Quartal Q{currentQuarter}
                  </div>
                  <span className="text-xs text-slate-600 font-medium">
                    {currentQuarter === 1 && "Start des Kalenderjahres (Jan - Mär)"}
                    {currentQuarter === 2 && "Frühjahr & Sommer (Apr - Jun)"}
                    {currentQuarter === 3 && "Halbjahres-Shift H2 (Jul - Sep)"}
                    {currentQuarter === 4 && "Jahresendspurt (Okt - Dez)"}
                  </span>
                </div>
                {/* Custom Quarter Progress visualization */}
                <div className="flex gap-1 h-3 mt-2 max-w-xs">
                  {[1, 2, 3, 4].map(q => (
                    <div 
                      key={q} 
                      className={`flex-1 rounded transition-colors ${
                        q === currentQuarter 
                          ? "bg-emerald-500 ring-2 ring-emerald-300 ring-offset-1" 
                          : q < currentQuarter 
                            ? "bg-indigo-300" 
                            : "bg-slate-200"
                      }`}
                      title={`Quartal ${q}`}
                    />
                  ))}
                </div>
              </div>

              <div className="md:col-span-2 space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-mono">Turnussimulation ausführen</span>
                
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleSimulateQuarterPass}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded shadow-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Clock size={13} /> Quartalswechsel simulieren
                  </button>

                  <button
                    onClick={handleSimulateHalfYearPass}
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded shadow-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Calendar size={13} /> Halbjahreswechsel forcieren
                  </button>

                  <button
                    onClick={handleSimulateFullYearPass}
                    className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded shadow-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <AlertCircle size={13} /> Jahreswechsel forcieren
                  </button>
                </div>
                
                <p className="text-[9.5px] font-mono text-slate-400">
                  💡 Tipp: Synchronisierte Protokolle erhalten frische, leere Messformulare. Nicht synchronisierte Protokolle erhalten die Warnung „Wartung überfällig“.
                </p>
              </div>
            </div>
          </div>

          {/* Section: Globale Anlagentypen & Geräteparameter */}
          <div className="bg-white border-2 border-slate-200 rounded-lg p-6 shadow-sm font-sans text-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
              <h2 className="text-sm font-bold tracking-wider font-mono text-slate-800 uppercase flex items-center gap-2">
                <SlidersHorizontal className="text-indigo-600" size={18} />
                Globale Anlagentypen & Geräteparameter
              </h2>
              <button
                type="button"
                onClick={() => setIsAddTypeModalOpen(true)}
                className="px-3.5 py-1.5 bg-[#003d9b] hover:bg-[#002f78] text-white font-bold text-xs rounded shadow flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus size={13} /> Neuen Anlagentyp hinzufügen
              </button>
            </div>
            
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Konfigurieren Sie die verfügbaren Systemgattungen global. Legen Sie feste Kürzel (z.B. BMA), Typenbezeichnungen (Namen) und Signalfarben für Labels fest. Sie können auch verfügbare Meldertypen kommagetrennt verwalten (ein Indexwechsel wird automatisch in alle betroffenen Protokolle kaskadiert, während entfernte Meldertypen auf den 2. Meldertyp springen). Aktivieren Sie optional separate Hardware-Prüftabellen mit konfigurierbaren Semicolon-Spalten.
            </p>

            <div className="space-y-4">
              {Object.keys(systemTypeSettings).map((typeName) => {
                const detectors = systemTypeSettings[typeName] || [];
                const detectorsString = editingDetectors[typeName] !== undefined 
                  ? editingDetectors[typeName] 
                  : detectors.join(", ");
                const hwConfig = systemTypeHardwareConfigs[typeName] || { hasHardware: false, headers: [] };
                const headersString = hwConfig.headers.join("; ");
                const meta = systemTypeMetadata[typeName] || { name: typeName, color: "#003d9b" };

                // Handlers inside map
                const handleUpdateTypeName = (newName: string) => {
                  const cleaned = newName.trim();
                  if (!cleaned) return;
                  const alreadyExists = Object.entries(systemTypeMetadata).some(
                    ([k, v]) => k !== typeName && v.name.toLowerCase() === cleaned.toLowerCase()
                  );
                  if (alreadyExists) {
                    triggerToast(`Typenbezeichnung '${cleaned}' wird bereits von einem anderen Anlagentyp verwendet!`, "warning");
                    return;
                  }
                  setSystemTypeMetadata(prev => ({
                    ...prev,
                    [typeName]: { ...prev[typeName], name: cleaned }
                  }));
                };

                const handleUpdateTypeCode = (rawNewCode: string) => {
                  const newCode = rawNewCode.trim().toUpperCase();
                  if (!newCode || typeName === newCode) return;

                  // Prevent spaces or strange characters
                  if (!/^[A-Z0-9_-]+$/.test(newCode)) {
                    triggerToast(`Ungültiges Format: Label Code darf keine Leerzeichen enthalten!`, "warning");
                    return;
                  }

                  // 1. Prevent duplicate labels (shortcode)
                  if (systemTypeSettings[newCode]) {
                    triggerToast(`Anlagentyp mit dem Label '${newCode}' existiert bereits!`, "warning");
                    return;
                  }

                  // 2. Rename keys in settings
                  setSystemTypeSettings(prev => {
                    const copy = { ...prev };
                    copy[newCode] = copy[typeName] || ["-", "Normal"];
                    delete copy[typeName];
                    return copy;
                  });

                  // Rename in hardware configs
                  setSystemTypeHardwareConfigs(prev => {
                    const copy = { ...prev };
                    copy[newCode] = copy[typeName] || { hasHardware: false, headers: [] };
                    delete copy[typeName];
                    return copy;
                  });

                  // Rename in metadata
                  setSystemTypeMetadata(prev => {
                    const copy = { ...prev };
                    copy[newCode] = copy[typeName] || { name: typeName, color: "#003d9b" };
                    delete copy[typeName];
                    return copy;
                  });

                  // 3. Rename in active protocols list
                  setProtocols(prev => prev.map(p => {
                    if (p.systemType === typeName) {
                      return { ...p, systemType: newCode };
                    }
                    return p;
                  }));

                  triggerToast(`Anlagentyp '${typeName}' erfolgreich in '${newCode}' umbenannt!`, "success");
                };

                const handleUpdateTypeColor = (col: string) => {
                  setSystemTypeMetadata(prev => ({
                    ...prev,
                    [typeName]: { ...prev[typeName], color: col }
                  }));
                };

                const migrateProtocolDetectorTypes = (oldList: string[], newList: string[]) => {
                  setProtocols(prevProtocols => prevProtocols.map(protocol => {
                    if (protocol.systemType !== typeName) return protocol;

                    const updatedProtocolDetectorTypes = newList.filter(t => t !== "-");
                    const updatedSubSystems = protocol.subSystems?.map(sub => {
                      const updatedRows = sub.rows.map(row => {
                        const updatedCells = row.cells.map(cell => {
                          const oldIndex = oldList.indexOf(cell.detectorType);
                          if (oldIndex !== -1) {
                            const newType = newList[oldIndex];
                            if (newType !== undefined) {
                              return { ...cell, detectorType: newType };
                            } else {
                              // Removed, jump to 2nd detector type in newList (index 1 is first valid, fallback to Normal)
                              const fallbackType = newList[1] || "Normal";
                              return { ...cell, detectorType: fallbackType };
                            }
                          }
                          return cell;
                        });
                        return { ...row, cells: updatedCells };
                      });
                      return { ...sub, rows: updatedRows };
                    });

                    return {
                      ...protocol,
                      detectorTypes: updatedProtocolDetectorTypes,
                      subSystems: updatedSubSystems
                    };
                  }));
                };

                const handleCommitDetectors = (val: string) => {
                  const parts = val.split(",").map(s => s.trim()).filter(Boolean);
                  const list = parts.includes("-") ? parts : ["-", ...parts];
                  const oldList = systemTypeSettings[typeName] || ["-", "Normal"];

                  // Update settings
                  setSystemTypeSettings(prev => ({
                    ...prev,
                    [typeName]: list
                  }));

                  // Trigger migration
                  migrateProtocolDetectorTypes(oldList, list);

                  // Reset local editing transient buffer
                  setEditingDetectors(prev => {
                    const copy = { ...prev };
                    delete copy[typeName];
                    return copy;
                  });

                  triggerToast(`Meldertypen für '${typeName}' aktualisiert & betroffene Protokolle migriert!`, "success");
                };

                const handleDeleteType = () => {
                  // Check if in use
                  const inUse = protocols.some(p => p.systemType === typeName);
                  if (inUse) {
                    alert(`Fehler beim Löschen: Der Anlagentyp '${typeName}' (${meta.name}) kann nicht gelöscht werden, da er derzeit von mindestens einer Anlage/Protokoll in der Datenbank verwendet wird!`);
                    triggerToast(`Löschen blockiert: Anlagentyp '${typeName}' ist in Verwendung.`, "warning");
                    return;
                  }

                  if (confirm(`Möchten Sie den Anlagentyp '${typeName}' (${meta.name}) wirklich dauerhaft entfernen?`)) {
                    setSystemTypeSettings(prev => {
                      const copy = { ...prev };
                      delete copy[typeName];
                      return copy;
                    });
                    setSystemTypeHardwareConfigs(prev => {
                      const copy = { ...prev };
                      delete copy[typeName];
                      return copy;
                    });
                    setSystemTypeMetadata(prev => {
                      const copy = { ...prev };
                      delete copy[typeName];
                      return copy;
                    });
                    triggerToast(`Anlagentyp '${typeName}' gelöscht.`, "info");
                  }
                };

                return (
                  <div 
                    key={typeName} 
                    className="p-5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col gap-4 font-sans text-slate-800"
                  >
                    {/* Upper row: Label settings */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                      {/* Name Entry */}
                      <div className="md:col-span-5 space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                          Typenbezeichnung
                        </label>
                        <input
                          type="text"
                          value={meta.name}
                          onChange={(e) => handleUpdateTypeName(e.target.value)}
                          className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded text-xs text-slate-800 font-semibold focus:outline-none focus:border-[#003d9b]"
                          placeholder="z.B. Brandmelde Anlage"
                        />
                      </div>

                      {/* Label Code Prefix */}
                      <div className="md:col-span-3 space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                          Label Code (Kürzel)
                        </label>
                        <input
                          type="text"
                          value={typeName}
                          onChange={(e) => handleUpdateTypeCode(e.target.value)}
                          className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded text-xs text-[#003d9b] font-mono font-bold focus:outline-none focus:border-[#003d9b] uppercase"
                          placeholder="z.B. BMA"
                        />
                      </div>

                      {/* Custom Color mixer (colorpicker) */}
                      <div className="md:col-span-3 space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                          Farbe des Labels (Color Mixer)
                        </label>
                        <div className="flex items-center gap-2 border border-slate-300 rounded p-1 bg-white h-9">
                          <input 
                            type="color" 
                            value={meta.color}
                            onChange={(e) => handleUpdateTypeColor(e.target.value)}
                            className="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0 bg-transparent block"
                            title="Farbmischer öffnen"
                          />
                          <span className="text-[10px] font-mono text-slate-600 font-bold uppercase">{meta.color}</span>
                        </div>
                      </div>

                      {/* Delete Action button */}
                      <div className="md:col-span-1 flex justify-center pb-1">
                        <button
                          type="button"
                          onClick={handleDeleteType}
                          className="p-2 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 rounded transition-all flex items-center justify-center border border-red-200 shadow-sm shrink-0"
                          title="Anlagentyp löschen"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Middle grid: detectors and checklist toggle */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                      {/* Detector list (transient editing) */}
                      <div className="lg:col-span-7 space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                          Meldertypen / Fühlergeräte (kommagetrennt)
                        </label>
                        <input
                          type="text"
                          value={detectorsString}
                          onChange={(e) => {
                            setEditingDetectors(prev => ({
                              ...prev,
                              [typeName]: e.target.value
                            }));
                          }}
                          onBlur={(e) => handleCommitDetectors(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCommitDetectors((e.target as HTMLInputElement).value);
                          }}
                          className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded text-xs text-slate-800 font-mono font-semibold focus:outline-none focus:border-[#003d9b]"
                          placeholder="-, Normal, ZD, RAS..."
                        />
                        <span className="text-[9px] text-slate-400 font-mono block leading-normal">
                          💡 Drücken Sie ENTER oder klicken Sie außerhalb des Feldes zum Speichern und Migrieren. Ein „-“ ist ein leeres Feld.
                        </span>
                      </div>

                      {/* Integrated hardware configurations */}
                      <div className="lg:col-span-5 space-y-2">
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="checkbox"
                            id={`check-hw-${typeName}`}
                            checked={hwConfig.hasHardware}
                            onChange={(e) => {
                              const val = e.target.checked;
                              setSystemTypeHardwareConfigs(prev => ({
                                ...prev,
                                [typeName]: {
                                  ...hwConfig,
                                  hasHardware: val
                                }
                              }));
                              triggerToast(`${typeName} Hardware-Tabelle ${val ? "aktiviert" : "deaktiviert"}`, "info");
                            }}
                            className="w-3.5 h-3.5 text-[#003d9b] border-slate-300 rounded focus:ring-indigo-500 focus:ring-1 cursor-pointer"
                          />
                          <label 
                            htmlFor={`check-hw-${typeName}`}
                            className="text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1 select-none"
                          >
                            Integrierte Hardware-Prüfliste einblenden
                          </label>
                        </div>

                        {hwConfig.hasHardware && (
                          <div className="space-y-1 animate-fadeIn">
                            <label className="block text-[9.5px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                              Spalten der Hardware-Tabelle (Semicolon-separiert)
                            </label>
                            <input
                              type="text"
                              value={headersString}
                              onChange={(e) => {
                                const columns = e.target.value.split(";").map(s => s.trim()).filter(Boolean);
                                setSystemTypeHardwareConfigs(prev => ({
                                  ...prev,
                                  [typeName]: {
                                    ...hwConfig,
                                    headers: columns
                                  }
                                }));
                              }}
                              className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-[11px] font-mono text-indigo-900 focus:outline-none focus:border-[#003d9b] font-semibold"
                              placeholder="Bauteil/Ring;Typ;Störung;Unterbrechung;Softwarestand;Serie"
                            />
                            <span className="text-[8.5px] text-indigo-600 block leading-tight">
                              Schnittstelle BMA-Muster: <strong>Bauteil/Ring;Typ;Störung;Unterbrechung;Softwarestand;Serie</strong>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section: Docker Network Info */}
          <div className="bg-white border-2 border-slate-200 rounded-lg p-6 shadow-sm">
            <h2 className="text-sm font-bold tracking-wider font-mono text-slate-800 uppercase flex items-center gap-2 mb-2">
              <Server className="text-blue-600" size={18} />
              Netzwerk- und Docker-Konfiguration
            </h2>
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg flex flex-col sm:flex-row gap-3 items-start">
              <div className="p-2 bg-slate-200 text-slate-700 rounded-lg font-mono shrink-0 font-bold text-xs">
                docker-compose.yml
              </div>
              <div className="text-xs text-slate-600 leading-relaxed space-y-2">
                <p>
                  <strong>Integrierte Docker-Brücke:</strong> VLAN- und IP-Routing wird direkt im Linux-Kernel über den Docker-Daemon verwaltet. Eine manuelle VLAN-Einteilung im Web-UI entfällt. 
                </p>
                <p className="font-mono text-[10px] text-slate-400">
                  network_mode: bridge | subnets: 172.18.0.0/16 (Autonom zugewiesen)
                </p>
              </div>
            </div>
          </div>

          {/* Section: Manage Tenants */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* List and manage existing tenants */}
            <div className="lg:col-span-2 bg-white border-2 border-slate-200 rounded-lg p-6 shadow-sm flex flex-col space-y-4">
              <div>
                <h3 className="text-sm font-bold tracking-wider font-mono text-slate-850 uppercase">Registrierte Mandantendatenbanken</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Jedem Firmenmandanten wird eine physisch getrennte SQLite-Schnittstelle sowie ein isolierter Samba-Archivpfad zugewiesen. Jeder Mandant verwaltet seine eigenen Benutzer und Verträge.
                </p>
              </div>

              <div className="divide-y divide-slate-100 overflow-y-auto max-h-[400px]">
                {tenants.map((t) => {
                  const isActive = t.id === activeTenantId;
                  return (
                    <div key={t.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-sans font-medium">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-xs">{t.name}</span>
                          {isActive && (
                            <span className="bg-[#003d9b] text-white text-[8px] font-mono px-1.5 py-0.5 rounded uppercase font-bold tracking-wide">
                              Aktiviert
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 leading-normal font-mono">
                          SQLite: <span className="text-slate-700 font-bold">md_{t.id}.db</span> • 
                          Samba Share: <span className="text-slate-700">{t.sambaPath || "Kein Pfad"}</span>
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          API-Endpoint Host: {t.serverAddress}:{t.serverPort}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Rename & Logo Action */}
                        <button
                          onClick={() => {
                            setRenameTenantId(t.id);
                            setRenameTenantInput(t.name);
                            setRenameTenantLogoUrl(t.logoUrl || "");
                            setIsRenameTenantModalOpen(true);
                          }}
                          className="px-2.5 py-1.5 text-[10px] font-bold bg-white border border-slate-300 hover:bg-slate-50 rounded text-slate-700 cursor-pointer"
                        >
                          Eigenschaften & Logo
                        </button>

                        {/* Swap active tenant */}
                        {!isActive && (
                          <button
                            onClick={() => {
                              handleSwapTenant(t.id);
                              triggerToast(`Zu Mandant "${t.name}" gewechselt!`, "info");
                            }}
                            className="px-2.5 py-1.5 text-[10px] font-bold bg-[#003d9b] hover:bg-[#002b6d] text-white rounded cursor-pointer"
                          >
                            Aktivieren
                          </button>
                        )}

                        {/* Delete Tenant with beautiful iframe-safe inline confirmation */}
                        {deleteConfirmTenantId === t.id ? (
                          <div className="flex items-center gap-1 bg-red-50 border border-red-200 p-1 rounded font-mono text-[9px]">
                            <span className="text-red-700 font-bold px-1">Sicher löschen?</span>
                            <button
                              onClick={() => {
                                const remaining = tenants.filter(tItem => tItem.id !== t.id);
                                setTenants(remaining);
                                triggerToast(`Mandant "${t.name}" wurde administrativ gelöscht!`, "success");
                                if (isActive) {
                                  handleSwapTenant(remaining[0].id);
                                }
                                setDeleteConfirmTenantId(null);
                              }}
                              className="px-1.5 py-0.5 bg-red-600 text-white rounded font-bold hover:bg-red-700 cursor-pointer"
                            >
                              Ja
                            </button>
                            <button
                              onClick={() => setDeleteConfirmTenantId(null)}
                              className="px-1.5 py-0.5 bg-slate-300 text-slate-700 rounded font-bold hover:bg-slate-400 cursor-pointer"
                            >
                              Nein
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              if (tenants.length <= 1) {
                                triggerToast("Es muss mindestens ein Mandant im System registriert bleiben!", "warning");
                                return;
                              }
                              setDeleteConfirmTenantId(t.id);
                            }}
                            disabled={tenants.length <= 1}
                            className={`p-1.5 rounded cursor-pointer ${
                              tenants.length <= 1 
                                ? "bg-slate-100 text-slate-300 cursor-not-allowed opacity-50 font-medium" 
                                : "bg-red-50 text-red-600 hover:bg-red-100"
                            }`}
                            title="Mandat entfernen"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Inline creation of new tenant */}
            <div className="bg-white border-2 border-slate-200 rounded-lg p-6 shadow-sm flex flex-col space-y-4">
              <div>
                <h3 className="text-sm font-bold tracking-wider font-mono text-emerald-800 uppercase flex items-center gap-1.5">
                  <Plus size={16} /> Neuen Mandanten provisionieren
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-normal font-sans">
                  Fügen Sie hier direkt im Docker-System einen weiteren Firmenmandanten hinzu.
                </p>
              </div>

              <div className="space-y-3 font-sans">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest font-mono mb-1">Mandanten-Name (Firmenname) *</label>
                  <input
                    type="text"
                    placeholder="z.B. Mandant Süd (Graz)"
                    value={newTenantName}
                    onChange={(e) => setNewTenantName(e.target.value)}
                    className="w-full h-9 px-3 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase font-mono mb-1">Server-Host</label>
                    <input
                      type="text"
                      placeholder="g-service.corp.internal"
                      value={newTenantServer}
                      onChange={(e) => setNewTenantServer(e.target.value)}
                      className="w-full h-8.5 px-2 bg-slate-50 border border-slate-300 rounded text-[11px] text-slate-800 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase font-mono mb-1">Port</label>
                    <input
                      type="text"
                      placeholder="8443"
                      value={newTenantPort}
                      onChange={(e) => setNewTenantPort(e.target.value)}
                      className="w-full h-8.5 px-2 bg-slate-50 border border-slate-300 rounded text-[11px] text-slate-800 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest font-mono mb-1">Samba Archivpfad (UNC)</label>
                  <input
                    type="text"
                    placeholder="\\samba.corp.internal\archival_new\"
                    value={newTenantSamba}
                    onChange={(e) => setNewTenantSamba(e.target.value)}
                    className="w-full h-9 px-3 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 font-mono focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest font-mono mb-1">Datenbank Template</label>
                  <select
                    value={newTenantDbTemplate}
                    onChange={(e: any) => setNewTenantDbTemplate(e.target.value)}
                    className="w-full h-9 px-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:border-emerald-600"
                  >
                    <option value="default">VdS Musteranlagen initialisieren</option>
                    <option value="empty">Vollkommen leere Mandantendatenbank</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleCreateTenant}
                  className="w-full h-10 mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} /> Mandant provisionieren
                </button>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Renders Selected Archive File View directly inside an overlay modal */}
      {selectedArchiveForPdf && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setSelectedArchiveForPdf(null)}></div>
          <div className="relative bg-slate-800 w-full max-w-4xl h-[95vh] rounded-xl shadow-2xl border border-slate-700 overflow-hidden flex flex-col text-sm text-slate-100">
            
            <div className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-blue-400" />
                <h3 className="font-bold text-sm text-slate-200">
                  Samba-Archivierte PDF-Vorschau: <span className="font-mono font-bold text-amber-400">{selectedArchiveForPdf.filename}</span>
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 font-mono">Samba File Version: v{selectedArchiveForPdf.version}</span>
                <button 
                  onClick={() => setSelectedArchiveForPdf(null)} 
                  className="p-1 hover:bg-slate-700 rounded text-slate-300"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-700 flex flex-col gap-4">
              
              <div className="bg-slate-900 border border-slate-750 p-4 rounded text-xs select-none flex justify-between items-center font-mono text-slate-300 shrink-0">
                <div>
                  <p><strong>Zugehöriger Vertrag:</strong> {selectedArchiveForPdf.contractNumber} ({selectedArchiveForPdf.objectName})</p>
                  <p className="mt-1"><strong>Pfad im Samba-Share:</strong> \\samba.corp.internal\archival\Archiv\{selectedArchiveForPdf.contractNumber}\{selectedArchiveForPdf.year}\{selectedArchiveForPdf.halfYear}\{selectedArchiveForPdf.filename}</p>
                </div>
                <button 
                  onClick={() => {
                    triggerToast(`Lade ${selectedArchiveForPdf.filename} herunter (Samba API simuliert)...`, "info");
                  }}
                  className="bg-[#003d9b] hover:bg-blue-700 text-white px-4 py-2 font-bold rounded flex items-center gap-1.5 transition-colors"
                >
                  <Printer size={14} /> PDF drucken
                </button>
              </div>

              {/* Renders actual layout simulation inside scrollable pane */}
              <div className="bg-[#525659] p-6 rounded shadow-inner overflow-x-auto">
                <div className="bg-white text-black w-full max-w-3xl mx-auto p-8 shadow-2xl border-4 border-double border-slate-300 relative text-sm select-text font-serif min-h-[800px]">
              
              {/* ReportLab simulated header */}
              <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start font-sans">
                <div>
                  <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">Maintenance Pro — Prüfbericht v3.0</h1>
                  <p className="text-xs text-slate-500 font-mono italic">Prüfstelle Zentralverwaltung Intranet</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-1">Automatisch generiert am {selectedArchiveForPdf.dateArchived} von {selectedArchiveForPdf.archivedBy}</p>
                </div>
                <div className="text-right">
                  <span className="font-mono text-xs font-bold bg-[#003d9b] text-white px-2 py-1 rounded">
                    VdS KONFORM
                  </span>
                  <p className="text-[9px] font-mono text-slate-400 mt-2">ID: {selectedArchiveForPdf.id}</p>
                </div>
              </div>

              {/* Master details card */}
              <div className="grid grid-cols-2 gap-6 my-6 font-sans text-xs pb-4 border-b border-dashed border-slate-300">
                <div className="space-y-1">
                  <p className="text-slate-500 uppercase font-mono tracking-wider font-bold text-[9px]">Betreuter Kunde</p>
                  <p className="text-sm font-bold text-slate-900">{selectedArchiveForPdf.objectName}</p>
                  <p className="text-slate-600">Offizieller Standort des Vertragsobjekts</p>
                </div>
                <div className="space-y-1 font-mono text-[11px] bg-slate-50 p-2 border-l-2 border-amber-500 rounded">
                  <p className="text-slate-500 font-sans uppercase tracking-wider font-bold text-[9px]">Archiv-Zuweisung</p>
                  <p><strong>Vertrags-ID:</strong> {selectedArchiveForPdf.contractNumber}</p>
                  <p><strong>Jahr-Weisung:</strong> {selectedArchiveForPdf.year} ({selectedArchiveForPdf.halfYear})</p>
                  <p><strong>Versionierung:</strong> v{selectedArchiveForPdf.version} (Samba File-ID lock)</p>
                </div>
              </div>

              {/* Notice paper styling of verification */}
              <div className="bg-emerald-50 border border-emerald-300/60 p-4 rounded mb-6 font-sans flex items-start gap-3">
                <ShieldCheck className="text-emerald-600 mt-0.5 shrink-0" size={18} />
                <div>
                  <h4 className="font-bold text-emerald-800 text-xs">Physische Unversehrtheit & Krypto-Wahrheitsbeweis</h4>
                  <p className="text-[11px] text-emerald-700 leading-relaxed mt-1">
                    Dieser Bericht wurde bit-identisch signiert und im binären SQLite-Datensatz der SQLite-DBMS-Schicht dauerhaft verankert. 
                    Jeder Slot-Durchlauf ist kryptografisch mittels GZIP-Header-Verschlüsselung authentifiziert worden.
                  </p>
                </div>
              </div>

              {/* Verified grid results table in PDF print */}
              <div className="space-y-4 font-sans text-xs">
                <h3 className="font-bold text-slate-800 border-b border-slate-200 pb-1 flex justify-between">
                  <span>SYSTEMMESSUNGEN & DURCHGANGSLISTEN</span>
                  <span className="text-[9px] text-[#003d9b] font-mono font-bold">STATUS: ARCHIVIERT / SEED LOCK</span>
                </h3>

                <p className="text-[10px] text-slate-500 italic">
                  Durchgangswerte der Melderlisten für diesen Prüfungszeitraum ({selectedArchiveForPdf.halfYear}/{selectedArchiveForPdf.year}) sind fixiert. 
                  Sämtliche Messdaten wurden in die Samba-Ordnerstruktur übermittelt.
                </p>

                <div className="bg-slate-50 rounded border border-slate-200 p-2 font-mono text-[11px] space-y-1">
                  <div className="flex justify-between font-bold text-[10px] text-slate-500 border-b border-slate-200 pb-1 text-center">
                    <span className="w-24 text-left">Segment / Gruppe</span>
                    <span className="flex-1">Testpunkte</span>
                    <span className="w-16">Ergebnis</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 py-1">
                    <span className="w-24 font-bold text-slate-700">GRP 01 (EG)</span>
                    <span className="flex-1 text-center text-slate-500">M1, M2, M3, M4, M5, M6</span>
                    <span className="w-16 text-emerald-600 font-bold text-center">BESTANDEN</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 py-1">
                    <span className="w-24 font-bold text-slate-700">GRP 02 (OG)</span>
                    <span className="flex-1 text-center text-slate-500">M1, M2, M3, M4, M5, M6</span>
                    <span className="w-16 text-emerald-600 font-bold text-center">BESTANDEN</span>
                  </div>
                </div>
              </div>

              {/* Interactive Stamp & Signature Block */}
              <div className="mt-10 flex justify-between items-end border-t border-slate-200 pt-8 font-sans">
                <div className="space-y-4 w-1/2">
                  <p className="text-[10px] text-slate-400">Gez. Prüfender Außendienst-Techniker:</p>
                  <div className="border-b border-slate-400 h-8 font-serif italic text-sm text-[#003d9b] pl-2 flex items-end">
                    {selectedArchiveForPdf.archivedBy}
                  </div>
                  <p className="text-[9px] text-slate-400">Elektronische Signatur • ID: {selectedArchiveForPdf.id.slice(0, 10)}</p>
                </div>

                {/* Circle simulated stamp */}
                <div className="w-28 h-28 border-4 border-dashed border-sky-600/60 rounded-full flex flex-col justify-center items-center text-center p-2 transform rotate-12 text-sky-700 select-none bg-sky-50/15">
                  <ShieldCheck size={18} className="text-sky-600" />
                  <span className="text-[8px] font-mono font-black uppercase mt-1 leading-none">VIRTUAL FILE</span>
                  <span className="text-[7px] tracking-tighter text-slate-500">SAMBA ARCHIVE</span>
                  <span className="text-[8px] font-bold font-mono text-[#003d9b] mt-1">✓ ORIGINAL</span>
                </div>
              </div>

            </div> {/* Close paper sheet */}
          </div> {/* Close grey frame */}
        </div> {/* Close scrollable body viewport */}

        <div className="p-4 bg-slate-900 border-t border-slate-800 flex justify-end shrink-0">
              <button 
                onClick={() => setSelectedArchiveForPdf(null)}
                className="bg-slate-700 hover:bg-slate-650 text-white px-5 py-2 font-bold text-xs rounded transition-all"
              >
                Vorschau Schließen
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Renders dynamic interactive PDF preview for existing live protocol in database */}
      {pdfModalId && (() => {
        const item_p = protocols.find(p => p.id === pdfModalId);
        if (!item_p) return null;

        // Calc metrics
        let totalDetectors = 0;
        let checkedDetectors = 0;
        let defectDetectors = 0;

        item_p.rows.forEach(r => {
          r.cells.forEach(c => {
            if (c.detectorType !== "-") {
              totalDetectors++;
              if (c.value !== "") {
                checkedDetectors++;
                if (c.value === "Def." || c.value?.toLowerCase() === "def") defectDetectors++;
              }
            }
          });
        });

        const verifiedPercent = totalDetectors > 0 ? Math.round((checkedDetectors / totalDetectors) * 100) : 0;

        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setPdfModalId(null)}></div>
            <div className="relative bg-slate-800 w-full max-w-4xl h-[95vh] rounded-xl shadow-2xl border border-slate-700 overflow-hidden flex flex-col text-sm text-slate-100">
              
              <div className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <Printer size={16} className="text-amber-400" />
                  <h3 className="font-bold text-sm text-slate-200">
                    ReportLab PDF Engine: Automatische Druckansicht für {item_p.name}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono bg-[#003d9b] text-white px-2 py-0.5 rounded uppercase">
                    Vorgenerierung
                  </span>
                  <button onClick={() => setPdfModalId(null)} className="p-1 hover:bg-slate-700 rounded text-slate-300">
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-slate-700 flex flex-col gap-4">
                
                {/* PDF generation banner notification */}
                <div className="bg-slate-900 border border-amber-500/30 p-4 rounded text-xs select-none">
                  <h4 className="font-bold text-amber-400 flex items-center gap-1">
                    <Activity size={12} className="animate-pulse" />
                    Büro-Zentralverwaltung Vorschaufunktion
                  </h4>
                  <p className="mt-1 text-slate-300 leading-relaxed">
                    Sollte diese Wartung die Freigabe erhalten, generiert der pythonbasierte <code className="font-mono text-amber-300">ProtocolCore</code> mithilfe von <code className="font-mono text-amber-300">ReportLab</code> und der <code className="font-mono text-amber-300">fitz-Bibliothek</code> eine inhaltsidentische, archivierte PDF-Fassung auf dem Samba-Datenträger.
                  </p>
                  
                  {item_p.status === "synchronized" ? (
                    <div className="mt-4 flex items-center gap-2">
                      <span className="text-emerald-400 font-bold">✓ WARTUNG VOLLSTÄNDIG SYNCHRONISIERT:</span>
                      <button 
                        onClick={() => {
                          handleArchiveAndReplan(item_p.id);
                          setPdfModalId(null);
                        }}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-1 font-bold rounded text-[11px] transition-colors shadow"
                      >
                        Archivierung & Reset veranlassen
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 bg-red-950/40 border border-red-500/20 p-2.5 rounded text-red-300">
                      ⚠️ <strong>Achtung:</strong> Die Feld-Wartung für dieses Serviceobjekt ist noch nicht abgeschlossen (nur {verifiedPercent}% abgeschlossen). 
                      Ein Re-Scheduling / Turnuswechsel ist erst nach Erreichen der 100%igen Vollerfassung & Synchronisierung erlaubt.
                    </div>
                  )}
                </div>

                {/* Printable paper model */}
                <div className="bg-white text-black p-8 shadow-2xl rounded max-w-3xl mx-auto w-full select-text font-serif leading-relaxed relative min-h-[800px]">

                  {/* Header */}
                  <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-center font-sans">
                    <div>
                      <h2 className="text-xl font-black uppercase tracking-tight">Auslöseprotokoll {systemTypeMetadata[item_p.systemType]?.name || item_p.systemType}</h2>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">ReportLab Automatic PDF Exporter Engine v2.4.0</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">System ID: {item_p.contractNumber}</p>
                    </div>
                    <div className="text-right flex flex-col justify-between items-end">
                      {currentTenant?.logoUrl ? (
                        <img 
                          src={currentTenant.logoUrl} 
                          alt="Mandant Logo" 
                          className="max-h-12 max-w-[160px] object-contain rounded border border-slate-150 p-0.5" 
                          referrerPolicy="no-referrer" 
                        />
                      ) : (
                        <div className="text-slate-400 border border-dashed border-slate-350 bg-slate-50/50 rounded px-2.5 py-1 text-[9px] font-sans">
                          Kein Firmenlogo hinterlegt
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Customer Information Metadata Grid */}
                  <div className="bg-slate-50 border border-slate-200 rounded p-4 my-6 grid grid-cols-2 gap-4 font-sans text-xs">
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-bold font-mono uppercase tracking-wider text-slate-400">Vertragspartner / Standort</p>
                      <p className="text-sm font-black text-slate-900">{item_p.name}</p>
                      <p className="text-slate-600 font-medium">{item_p.address}</p>
                    </div>
                    
                    <div className="space-y-1 font-mono text-[10px]">
                      <p className="text-[9px] font-bold font-sans uppercase tracking-wider text-slate-400">Wartungsdetails</p>
                      <p><strong>Vertragsnummer:</strong> {item_p.contractNumber}</p>
                      <p><strong>Inspektionsintervall:</strong> {item_p.interval}</p>
                      <p><strong>Letzte ÜbertragungsID:</strong> NETLINK_{item_p.id}_{item_p.systemType}</p>
                      <p><strong>Techniker im Außendienst:</strong> {item_p.lastEditedBy || "Thomas Prantl"}</p>
                    </div>
                  </div>

                  {/* Tested nodes listings */}
                  <div className="space-y-4 font-sans text-xs">
                    <h3 className="font-bold text-slate-800 border-b border-slate-200 pb-1 flex justify-between">
                      <span>{item_p.name.toUpperCase()}</span>
                      <span className="font-mono text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">Abschlussgrad: {verifiedPercent}%</span>
                    </h3>

                    <div className="mt-4">
                      <table className="w-full text-center text-[10px] font-mono border-collapse border border-slate-300 rounded overflow-hidden">
                        <thead>
                          <tr className="border-b border-slate-350 bg-slate-100 text-slate-750 font-sans text-[11px]">
                            <th className="py-2.5 px-3 border-r border-slate-300 text-left font-extrabold w-[240px]">Prüfgruppe / Schleife</th>
                            {item_p.columns.map((col, idx) => (
                              <th key={idx} className="py-2.5 px-1 border-l border-slate-300 font-extrabold">Slot {col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {item_p.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="border-b border-slate-200 hover:bg-slate-50/50">
                              <td className="py-2.5 px-3 text-left font-sans border-r border-slate-200">
                                <div className="font-bold text-[#003d9b] text-[11px] leading-tight">{row.groupName}</div>
                                <div className="text-[9px] text-slate-400 font-mono mt-0.5">{row.groupId}</div>
                              </td>
                              {row.cells.map((cell, idx) => {
                                const isDisabled = cell.detectorType === "-";
                                const isDefect = cell.value === "Def." || cell.value?.toLowerCase() === "def";
                                const isChecked = cell.value === "CHECK" || cell.value === "✓";
                                const hasValue = cell.value && cell.value !== "CHECK" && !isDefect;

                                return (
                                  <td 
                                    key={idx} 
                                    className="py-2 px-1 border-l border-slate-200 text-center font-bold relative"
                                    style={isDisabled ? {
                                      backgroundImage: "repeating-linear-gradient(45deg, #f8fafc, #f8fafc 4px, #f1f5f9 4px, #f1f5f9 8px)"
                                    } : {}}
                                  >
                                    {isDisabled ? (
                                      <span className="text-slate-300 font-mono font-normal">-</span>
                                    ) : (
                                      <div className="flex flex-col items-center justify-center space-y-0.5">
                                        <span className="text-slate-600 text-[10px] font-bold">{cell.detectorType}</span>
                                        {isDefect ? (
                                          <span className="bg-red-100 text-red-700 text-[9px] px-1 py-0.5 rounded font-extrabold font-sans">DEF</span>
                                        ) : isChecked ? (
                                          <span className="bg-emerald-100 text-emerald-800 text-[9px] px-1 py-0.5 rounded font-extrabold font-sans">✓ OK</span>
                                        ) : hasValue ? (
                                          <span className="bg-indigo-50 text-indigo-700 text-[9px] px-1 py-0.5 rounded font-extrabold font-mono">{cell.value}</span>
                                        ) : (
                                          <span className="text-slate-350 text-[9px] font-normal font-sans">offen</span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Defect Log inside printable PDF */}
                    {defectDetectors > 0 && (
                      <div className="bg-red-50 border border-red-300 p-3 rounded">
                        <p className="font-extrabold text-red-800 text-xs flex items-center gap-1">
                          <AlertTriangle size={13} />
                          MÄNGELBERICHT: {defectDetectors} Defektstelle(n) detektiert
                        </p>
                        <p className="text-[10px] text-red-700 leading-snug mt-1 font-medium font-mono">
                          Bei den rot gekennzeichneten Slots konnte kein gültiger Auslösewert erfasst werden. Der VdS-Zyklenkonformitätsbericht wird auf "EINGESCHRÄNKT BETRIEBSBEREIT" deklariert, bis der Betreiber einen Ersatzmelder installiert und eine Nachwartung beauftragt.
                        </p>
                      </div>
                    )}

                  </div>

                  {/* PDF footer blocks */}
                  <div className="mt-12 flex justify-between items-end border-t border-slate-200 pt-8 font-sans">
                    <div className="space-y-4 w-1/2">
                      <p className="text-[10px] text-slate-400">Gez. Prüfender Außendienst-Techniker:</p>
                      <div className="border-b border-slate-400 h-8 font-serif italic text-sm text-[#003d9b] pl-2 flex items-end pb-1 select-none">
                        {item_p.lastEditedBy || "Thomas Prantl"}
                      </div>
                      <p className="text-[9px] text-slate-400">Wartung synchronisiert am {item_p.lastEditedAt || "Unvollständig"}</p>
                    </div>

                    <div className="w-1/2 flex flex-col items-end">
                      <div className="w-32 text-center border-t border-slate-300 mt-10 pt-1 text-[9px] text-slate-400">
                        Kundenunterschrift / Stempel
                      </div>
                    </div>
                  </div>

                </div>

              </div>

              <div className="p-4 bg-slate-900 border-t border-slate-800 flex justify-end shrink-0">
                <button 
                  onClick={() => setPdfModalId(null)}
                  className="bg-slate-700 hover:bg-slate-650 text-white px-5 py-2 font-bold text-xs rounded transition-all"
                >
                  Druckansicht Schließen
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* 1. Live Matrix Database Inspector Modal */}
      {inspectedProtocol && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setSelectedWebId(null)}></div>
          <div className="relative bg-white text-slate-900 w-full max-w-4xl max-h-[90vh] rounded-xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Database size={16} className="text-amber-400" />
                <h3 className="font-bold text-sm">
                  Live-Datenbank Matrix-Inspektor: {inspectedProtocol.name}
                </h3>
              </div>
              <button onClick={() => setSelectedWebId(null)} className="p-1 hover:bg-slate-800 rounded text-slate-300">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded p-4 text-xs grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-slate-400 font-bold block uppercase tracking-tight text-[9px] font-mono">Vertrag / ID</span>
                  <span className="font-semibold font-mono text-slate-800">{inspectedProtocol.contractNumber}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block uppercase tracking-tight text-[9px] font-mono">Anlagentyp</span>
                  <span 
                    className="font-semibold px-1.5 py-0.5 rounded text-[10px] font-mono border transition-all duration-200 inline-block"
                    style={{
                      backgroundColor: `${systemTypeMetadata[inspectedProtocol.systemType]?.color || "#003d9b"}15`,
                      color: systemTypeMetadata[inspectedProtocol.systemType]?.color || "#003d9b",
                      borderColor: `${systemTypeMetadata[inspectedProtocol.systemType]?.color || "#003d9b"}40`
                    }}
                    title={systemTypeMetadata[inspectedProtocol.systemType]?.name || inspectedProtocol.systemType}
                  >
                    {inspectedProtocol.systemType}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block uppercase tracking-tight text-[9px] font-mono">Wartungsturnus</span>
                  <span className="font-semibold text-slate-800">{inspectedProtocol.interval}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block uppercase tracking-tight text-[9px] font-mono">Gesamt-Status</span>
                  <span className="font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] border border-emerald-200 inline-block font-mono">ONLINE DECODER READY</span>
                </div>
              </div>

              {/* Multi-system plants Tab Selector */}
              {inspectedProtocol.subSystems && inspectedProtocol.subSystems.length > 0 && (
                <div className="flex flex-col gap-1.5 bg-slate-50 border border-slate-200 p-2.5 rounded-lg">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block font-mono">
                    Anlage wählen (Tabellarische Ansicht):
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {inspectedProtocol.subSystems.map(sub => {
                      const isActive = selectedInspectedSubId === sub.id;
                      const subDetectorsCount = sub.rows.reduce((sum, r) => sum + r.cells.filter(c => c.detectorType !== "-").length, 0);
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setSelectedInspectedSubId(sub.id)}
                          className={`px-3 py-1.5 text-xs font-bold rounded transition-all duration-150 border flex items-center gap-1.5 ${
                            isActive
                              ? "bg-slate-800 text-white border-slate-800 shadow-sm"
                              : "bg-white text-slate-700 hover:bg-slate-100 border-slate-200"
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>{sub.name}</span>
                          <span className={`text-[9.5px] font-mono ml-0.5 px-1 rounded ${isActive ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-500"}`}>
                            {subDetectorsCount} Melder
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Table rendering block */}
              {(() => {
                const activeSubObj = inspectedProtocol.subSystems && inspectedProtocol.subSystems.length > 0
                  ? (inspectedProtocol.subSystems.find(s => s.id === selectedInspectedSubId) || inspectedProtocol.subSystems[0])
                  : null;

                const rowsToRender = activeSubObj ? activeSubObj.rows : inspectedProtocol.rows;

                return (
                  <div className="overflow-x-auto border-2 border-slate-300 rounded shadow-sm bg-white">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-800 text-slate-100 font-mono text-[9px] uppercase tracking-wider border-b-2 border-slate-700">
                          <th className="p-1 px-2.5 font-bold border-r border-slate-700 text-center w-20">
                            {inspectedProtocol.systemType === "ELA" ? "Verstärker" : inspectedProtocol.systemType === "Lichtruf" ? "Zimmer-Nr." : "Meldegruppe"}
                          </th>
                          <th className="p-1 px-2.5 font-bold border-r border-slate-700 min-w-[150px]">Name</th>
                          <th className="p-1 px-2.5 font-bold border-r border-slate-700 text-center w-16">Melderanzahl</th>
                          {inspectedProtocol.columns.map(col => {
                            const colLabel = inspectedProtocol.systemType === "ELA" 
                              ? `S${String(col).padStart(2, "0")}` 
                              : inspectedProtocol.systemType === "Lichtruf" 
                                ? "" 
                                : `M${String(col).padStart(2, "0")}`;
                            return (
                              <th key={col} className="p-1 border-r border-slate-700 text-center font-bold min-w-[44px]">{colLabel}</th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-300">
                        {rowsToRender.map((row, rIdx) => (
                          <tr key={row.groupId || rIdx} className="hover:bg-amber-50/20 transition-colors border-b border-slate-300 text-[11px]">
                            {/* 1. Group / Identifier column */}
                            <td className="p-1 px-2 font-mono border-r border-slate-300 bg-slate-50 text-slate-900 font-bold text-center text-[10.5px]">
                              {row.groupId}
                            </td>
                            {/* 2. Group Name column */}
                            <td className="p-1 px-2 border-r border-slate-300 font-medium text-slate-705 bg-white">
                              <div className="flex items-center gap-1.5">
                                <span className="bg-slate-100 text-slate-600 px-1 py-0.2 rounded text-[8.5px] font-mono leading-none border border-slate-200">{row.groupType || "NAM"}</span>
                                <span className="font-semibold text-slate-800">{row.groupName}</span>
                              </div>
                            </td>
                            {/* 3. Melderanzahl column */}
                            <td className="p-1 px-2 border-r border-slate-300 text-center font-mono font-bold text-xs text-indigo-900 bg-slate-50/40">
                              {row.cells.filter(c => c.detectorType !== "-").length}
                            </td>
                            {/* Cells loop */}
                            {row.cells.map((cell, cIdx) => {
                              const isDisabled = cell.detectorType === "-";
                              const isLabel = cell.detectorType === "Beschriftung";
                              const isFreeText = cell.detectorType === "Freitext";
                              const isDefect = cell.value === "Def." || cell.value?.toLowerCase() === "def";
                              const isChecked = cell.value && !isDefect && !isLabel && !isFreeText;
                              
                              let customBg = "bg-white text-slate-900";
                              let displayVal = cell.value ? (cell.value === "CHECK" ? "✓" : cell.value) : "";

                              if (isDisabled) {
                                customBg = "text-slate-500 font-extrabold";
                                displayVal = "-";
                              } else if (isLabel) {
                                customBg = "bg-amber-50 border-amber-300 text-amber-850 font-semibold";
                                displayVal = cell.value || "🏷️";
                              } else if (isFreeText) {
                                customBg = "bg-slate-100 text-slate-800 border-dashed border-slate-350 font-semibold";
                                displayVal = "✍ Freitext" + (cell.value ? `: ${cell.value}` : "");
                              } else if (isDefect) {
                                customBg = "bg-red-50 text-red-705 font-extrabold";
                              } else if (isChecked) {
                                customBg = "bg-emerald-50 text-emerald-800 font-extrabold";
                              }

                              return (
                                <td 
                                  key={cell.slotKey || cIdx} 
                                  className={`p-0.5 px-1 border-r border-slate-300 text-center text-[10px] ${customBg}`}
                                  style={isDisabled ? {
                                    backgroundImage: "repeating-linear-gradient(45deg, #f1f5f9, #f1f5f9 4px, #e2e8f0 4px, #e2e8f0 8px)"
                                  } : {}}
                                  title={isDisabled ? "Inaktiv" : `Typ: ${cell.detectorType}`}
                                >
                                  {isDisabled ? (
                                    <span className="text-slate-500 font-mono font-bold text-[11px]">-</span>
                                  ) : (
                                    <div className="flex flex-col items-center justify-center leading-none py-0.5">
                                      <span className="font-bold tracking-tight text-[10.5px] max-w-[80px] truncate">
                                        {displayVal}
                                      </span>
                                      {!isDisabled && !isLabel && !isFreeText && (
                                        <span className="text-[7.2px] opacity-70 font-semibold font-sans mt-0.5 tracking-tight text-slate-550">
                                          {cell.detectorType}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button 
                onClick={() => setSelectedWebId(null)}
                className="bg-slate-800 text-white hover:bg-slate-700 px-5 py-2 font-semibold text-xs rounded transition-colors"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Create New Anlage / System Wizard Modal */}
      {isAddContractModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsAddContractModalOpen(false)}></div>
          <div className="relative bg-white text-slate-900 w-full max-w-3xl max-h-[92vh] rounded-xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col">
            <div className="p-4 bg-emerald-700 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Plus size={18} />
                <h3 className="font-bold text-sm">Neue Anlage / Serviceobjekt einpflegen</h3>
              </div>
              <button onClick={() => setIsAddContractModalOpen(false)} className="p-1 hover:bg-emerald-800 rounded text-emerald-100">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Name des Wartungsobjekts</label>
                  <input 
                    type="text" 
                    placeholder="z.B. Hotel Sacher"
                    className="h-10 border border-slate-300 rounded px-3 text-xs focus:outline-none focus:border-emerald-600"
                    value={newContractName}
                    onChange={(e) => setNewContractName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-tight font-mono">Vertragsnummer (Generiert)</label>
                  <input 
                    type="text" 
                    className="h-10 border border-slate-300 rounded px-3 text-xs font-mono font-bold bg-slate-50"
                    value={newContractNumber}
                    onChange={(e) => setNewContractNumber(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Standortadresse</label>
                  <input 
                    type="text" 
                    placeholder="Straße, PLZ, Ort"
                    className="h-10 border border-slate-300 rounded px-3 text-xs focus:outline-none focus:border-emerald-600"
                    value={newContractAddress}
                    onChange={(e) => setNewContractAddress(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Wartungsturnus</label>
                  <select 
                    className="h-10 border border-slate-300 rounded px-2.5 text-xs font-semibold focus:outline-none focus:border-emerald-600"
                    value={newContractInterval}
                    onChange={(e) => setNewContractInterval(e.target.value as any)}
                  >
                    <option value="Jährlich">Jährlich</option>
                    <option value="Halbjährlich">Halbjährlich</option>
                    <option value="Vierteljährlich">Vierteljährlich</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Anlagentyp</label>
                  <select 
                    className="h-10 border border-slate-300 rounded px-2.5 text-xs font-bold font-mono focus:outline-none focus:border-emerald-600 text-indigo-700"
                    value={newContractSystemType}
                    onChange={(e) => setNewContractSystemType(e.target.value)}
                  >
                    <option value="BMA">BMA (Brandmelder)</option>
                    <option value="EMA">EMA (Einbruchmelder)</option>
                    <option value="ELA">ELA (Akustiksysteme)</option>
                    <option value="LIRA">LIRA (Lichtsysteme)</option>
                    <option value="SLA">SLA (Sprinkler)</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-2">
                  Verfahren für Melder-Matrix Konfiguration
                </label>
                <div className="flex gap-4 mb-4">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs text-slate-700">
                    <input 
                      type="radio" 
                      name="setupMethod" 
                      checked={newContractSetupMethod === "import"}
                      onChange={() => setNewContractSetupMethod("import")}
                      className="accent-emerald-600"
                    />
                    Über Kundendaten-Import (Excel/CSV Simulation)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs text-slate-700">
                    <input 
                      type="radio" 
                      name="setupMethod" 
                      checked={newContractSetupMethod === "manual"}
                      onChange={() => setNewContractSetupMethod("manual")}
                      className="accent-emerald-600"
                    />
                    Manueller Gruppen-Struktur Editor
                  </label>
                </div>

                {newContractSetupMethod === "import" ? (
                  <div className="bg-slate-50 border border-slate-300 rounded p-4 flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5 align-left text-left">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-tight font-mono">Dateiformat / Importtyp wählen:</label>
                      <div className="flex gap-4 border-b border-slate-200 pb-2">
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-700">
                          <input
                            type="radio"
                            name="importFileType"
                            checked={importFileType === "csv"}
                            onChange={() => {
                              setImportFileType("csv");
                              setImportedFileName("");
                              setImportedDetectors([]);
                            }}
                            className="accent-slate-800"
                          />
                          Standard-Export (.CSV / .XLSX)
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-700">
                          <input
                            type="radio"
                            name="importFileType"
                            checked={importFileType === "etb"}
                            onChange={() => {
                              setImportFileType("etb");
                              setImportedFileName("");
                              setImportedDetectors([]);
                            }}
                            className="accent-slate-800"
                          />
                          Esser-Kundendaten (.ETB) – Python-Decoder
                        </label>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 mb-1 text-center">
                      {importFileType === "etb" 
                        ? "Der Python ETB-Decoder parst rohe Esser Kundendaten binaer und extrahiert strukturierte JSON-Formate fuer getrennte Anlagen."
                        : "Simulieren Sie den Dateiimport aus einer Export-Datei des Kunden für diesen Anlagentyp."}
                    </p>
                    <div className="text-center">
                      <button 
                        type="button"
                        onClick={handleSimulateFileImport}
                        className="bg-slate-800 text-white font-bold text-xs px-3.5 py-2 hover:bg-slate-700 transition"
                      >
                        {importFileType === "etb" ? "Esser ETB-Datei ueber Python-Decoder decodieren" : "Letzten Export simulativ parsen"}
                      </button>
                    </div>
                    {importedFileName && (
                      <div className="mt-3 text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 p-2 rounded text-left">
                        <p><strong>Eingelesene Datei:</strong> {importedFileName}</p>
                        <p className="mt-1">
                          {importFileType === "etb"
                            ? "Status: Decodiert über Python-Script (JSON-Output erhalten)."
                            : `Gefundene Testpunkte: ${importedDetectors.length} (Aufgeteilt auf ${Array.from(new Set(importedDetectors.map(d => d.group))).length} Sektionen)`}
                        </p>
                        {importFileType === "etb" && (
                          <div className="mt-2 bg-slate-950 text-emerald-400 p-1.5 rounded text-[10px] max-h-24 overflow-y-auto border border-emerald-800 leading-tight">
                            <span className="text-slate-400 font-bold block mb-1 font-mono">Decodiertes JSON (Auszug):</span>
                            <pre className="font-mono text-[9px]">
                              {JSON.stringify(importedDetectors.slice(0, 3), null, 2)}
                            </pre>
                            <p className="text-slate-500 text-[9px] mt-1 italic">... {importedDetectors.length - 3} weitere Melderobjekte decodiert</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-500 uppercase font-mono">{manualGroups.length} Meldergruppen eingerichtet</span>
                      <button 
                        type="button" 
                        onClick={handleManualAddGroup}
                        className="bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-xs py-1 px-3 rounded flex items-center gap-1"
                      >
                        <Plus size={12} /> Gruppe hinzufügen
                      </button>
                    </div>

                    <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                      {manualGroups.map((g) => (
                        <div key={g.groupId} className="border border-slate-200 rounded p-3 bg-slate-50 relative">
                          <button 
                            type="button"
                            onClick={() => handleManualDeleteGroup(g.groupId)}
                            className="absolute top-2 right-2 text-red-500 hover:bg-red-50 p-1 rounded"
                            title="Gruppe löschen"
                          >
                            <Trash2 size={13} />
                          </button>
                          <div className="grid grid-cols-3 gap-2 mb-2 pr-6">
                            <div className="col-span-2">
                              <label className="text-[10px] uppercase tracking-tight text-slate-400 font-bold block mb-0.5">Bereichsname</label>
                              <input 
                                type="text" 
                                className="w-full text-xs h-8 bg-white border border-slate-300 rounded px-2"
                                value={g.groupName}
                                onChange={(e) => handleManualGroupNameChange(g.groupId, e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] uppercase tracking-tight text-slate-400 font-bold block mb-0.5">Kennung ID</label>
                              <input 
                                type="text" 
                                className="w-full text-xs h-8 bg-slate-105 border border-slate-200 rounded px-2 font-mono font-bold"
                                value={g.groupId}
                                disabled
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Testpunkt-Slots ({g.slots.length})</span>
                              <button 
                                type="button"
                                onClick={() => handleManualAddSlot(g.groupId)}
                                className="text-emerald-700 hover:underline font-bold text-[10px] flex items-center gap-0.5"
                              >
                                + Slot/Melder
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2.5">
                              {g.slots.map((s) => (
                                <div key={s.slotKey} className="flex items-center gap-1 bg-white border border-slate-200 rounded px-1.5 py-1 text-[10px] font-semibold">
                                  <span className="text-slate-400 font-bold">Pt {s.slotKey}:</span>
                                  <select 
                                    className="bg-transparent border-none p-0 focus:outline-none focus:ring-0 text-[10px] font-bold"
                                    value={s.detectorType}
                                    onChange={(e) => handleManualSlotTypeChange(g.groupId, s.slotKey, e.target.value)}
                                  >
                                    {(systemTypeSettings[newContractSystemType] || ["Normal"]).filter(t => t !== "-").map(type => (
                                      <option key={type} value={type}>{type}</option>
                                    ))}
                                  </select>
                                  <button 
                                    type="button" 
                                    onClick={() => handleManualDeleteSlot(g.groupId, s.slotKey)}
                                    className="text-red-500 hover:text-red-700 ml-1 font-bold"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between shrink-0">
              <button 
                onClick={() => setIsAddContractModalOpen(false)}
                className="border border-slate-300 hover:bg-slate-100 px-5 py-2 font-semibold text-xs rounded transition-colors"
              >
                Abbrechen
              </button>
              <button 
                onClick={handleCreateNewContract}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 font-bold text-xs rounded transition-colors"
              >
                Anlage anlegen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Central Defects Inspector Modal */}
      {isDefectModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsDefectModalOpen(false)}></div>
          <div className="relative bg-white text-slate-900 w-full max-w-2xl max-h-[85vh] rounded-xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col">
            <div className="p-4 bg-red-700 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <AlertOctagon size={18} />
                <h3 className="font-bold text-sm">Zentraler Mängelbericht (Außendienst-Erfassung)</h3>
              </div>
              <button onClick={() => setIsDefectModalOpen(false)} className="p-1 hover:bg-red-800 rounded text-red-100">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded text-xs leading-relaxed">
                <p className="font-bold">Aktuell verzeichnete Defekte</p>
                <p className="mt-1 font-medium">In den vom Außendienst hochgeladenen Tabellen wurden die folgenden {defectsList.length} Melder als defekt markiert. Diese müssen dringend ausgetauscht werden, um die VdS-Konformität zu wahren.</p>
              </div>

              <div className="space-y-2">
                {defectsList.map((defect, idx) => (
                  <div key={idx} className="border border-slate-200 hover:border-red-300 rounded p-3 bg-slate-50 flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{defect.protocolName} <span className="text-[10px] text-slate-405 font-mono">({defect.contractNumber})</span></p>
                      <p className="text-slate-500 mt-1 font-mono text-[11px]">
                        Segment: <strong className="text-[#003d9b]">{defect.groupId}</strong> ({defect.groupName}) • Slot: <strong className="text-[#003d9b]">{defect.slotKey}</strong> ({defect.detectorType})
                      </p>
                    </div>
                    <span className="bg-red-100 text-red-800 font-mono font-bold px-2 py-0.5 rounded text-[10px] uppercase shrink-0">
                      DEFEKT
                    </span>
                  </div>
                ))}
                {defectsList.length === 0 && (
                  <p className="text-center text-slate-400 font-mono text-xs py-8">
                    Aktuell sind keine Mängel verzeichnet. Alle Anlagen sind fehlerfrei!
                  </p>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <button 
                onClick={() => setIsDefectModalOpen(false)}
                className="bg-slate-800 hover:bg-slate-705 text-white px-5 py-2 font-semibold text-xs rounded transition-colors"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: MITARBEITER ANLEGEN --- */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsAddUserModalOpen(false)}></div>
          <div className="relative bg-white text-slate-900 w-full max-w-md rounded-xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col animate-slideUp">
            
            <div className="p-4 bg-[#003d9b] text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <UserPlus size={18} />
                <h3 className="font-bold text-sm">Mitarbeiterprofil initialisieren</h3>
              </div>
              <button onClick={() => setIsAddUserModalOpen(false)} className="p-1 hover:bg-[#002b6d] rounded text-slate-100">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 font-mono">Prüfer Name *</label>
                <input
                  type="text"
                  placeholder="z.B. Stefan Gruber"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 font-sans focus:outline-none focus:border-[#003d9b]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 font-mono">System-Berechtigungsrolle</label>
                <select
                  value={newUserRole}
                  onChange={(e: any) => setNewUserRole(e.target.value)}
                  className="w-full h-10 px-2.5 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:border-[#003d9b]"
                >
                  <option value="Aussendienst-Techniker">Aussendienst-Techniker (Prüfberechtigter)</option>
                  <option value="Büro-Administrator">Büro-Administrator (Zentrale-Verwaltung)</option>
                </select>
              </div>

              <div className="border-t border-slate-200 my-2 pt-3">
                <span className="text-[10px] text-indigo-900 font-bold font-mono uppercase bg-indigo-50 px-2 py-0.5 rounded">Optionale Zugangsdaten</span>
                <p className="text-[10px] text-slate-400 mt-1">Lassen Sie die Felder leer, um Zugangsdaten & Codewörter automatisch sicher zu generieren.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-505 uppercase font-mono mb-1">Benutzername</label>
                  <input
                    type="text"
                    placeholder="Auto-Generiert"
                    value={newUserUsername}
                    onChange={(e) => setNewUserUsername(e.target.value)}
                    className="w-full h-9 px-2.5 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:border-[#003d9b]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-505 uppercase font-mono mb-1">Passwort</label>
                  <input
                    type="text"
                    placeholder="Auto-Generiert"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full h-9 px-2.5 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:border-[#003d9b]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-505 uppercase font-mono mb-1 font-mono">Einmal-Mainkey (Codewort)</label>
                <input
                  type="text"
                  placeholder="z.B. xx-AA-xxx-xx"
                  value={newUserCodeword}
                  onChange={(e) => setNewUserCodeword(e.target.value)}
                  className="w-full h-9 px-2.5 bg-slate-50 border border-slate-305 rounded text-xs text-slate-800 font-mono focus:outline-none focus:border-[#003d9b]"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between shrink-0">
              <button
                type="button"
                onClick={() => setIsAddUserModalOpen(false)}
                className="border border-slate-300 hover:bg-slate-100 px-4 py-2 text-xs font-semibold rounded cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleCreateUser}
                className="bg-[#003d9b] hover:bg-[#002b6d] text-white px-5 py-2 text-xs font-bold rounded cursor-pointer"
                id="btn-confirm-add-user"
              >
                Erstellen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: EINSTIEGS-QR ANZEIGEN --- */}
      {qrModalUser && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setQrModalUser(null)}></div>
          <div className="relative bg-white text-slate-900 w-full max-w-sm rounded-xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col">
            
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-1.5">
                <QrCode size={16} />
                <h3 className="font-bold text-sm">Verbindungs-QR für QR Scanner</h3>
              </div>
              <button onClick={() => setQrModalUser(null)} className="p-1 hover:bg-slate-805 rounded text-slate-405 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 flex flex-col items-center justify-center text-center">
              <p className="text-xs text-slate-500 mb-2 leading-relaxed">
                Scannen Sie diesen Code in der Android-App unter <strong>Einstellungen &gt; "QR scannen"</strong> um Server-Verbindungsdaten &amp; Login-Hauptschlüssel automatisch zu hinterlegen.
              </p>

              {/* QR Code Container containing actual parameters structured */}
              <div className="border-4 border-slate-800 bg-white p-4 rounded-lg my-4 flex flex-col justify-center items-center relative">
                
                {/* Visual grid simulating the high precision QR Matrix with actual details encoded */}
                <div className="w-48 h-48 bg-slate-50 relative flex flex-wrap p-1 font-mono text-[6px] text-slate-300 overflow-hidden rounded select-none border border-slate-200">
                  {/* Outer QR Anchor corners */}
                  <div className="absolute top-1 left-1 w-10 h-10 border-4 border-slate-900 bg-white flex items-center justify-center">
                    <div className="w-5 h-5 bg-slate-900"></div>
                  </div>
                  <div className="absolute top-1 right-1 w-10 h-10 border-4 border-slate-900 bg-white flex items-center justify-center">
                    <div className="w-5 h-5 bg-slate-900"></div>
                  </div>
                  <div className="absolute bottom-1 left-1 w-10 h-10 border-4 border-slate-900 bg-white flex items-center justify-center">
                    <div className="w-5 h-5 bg-slate-900"></div>
                  </div>

                  {/* Little helper core */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-1.5 py-0.5 font-bold font-mono text-[7px] text-indigo-950 border border-slate-300 rounded shadow-md z-10 block text-center uppercase tracking-wider">
                    {qrModalUser.username.substring(0, 8)}
                  </div>

                  {/* Simulating QR payload blocks using raw dots */}
                  {Array.from({ length: 60 }).map((_, i) => (
                    <div key={i} className={`w-3.5 h-3.5 m-0.5 rounded-sm ${
                      (i * 17) % 7 === 0 || (i * 23) % 9 === 0 ? "bg-slate-900" : "bg-transparent"
                    }`} />
                  ))}
                </div>

                <div className="mt-2 text-[10px] font-mono font-bold text-slate-705 select-all p-1.5 rounded bg-slate-100 border border-slate-202 tracking-tight leading-normal max-w-full truncate">
                  {`SECURE_MANDANT;${currentTenant?.id};${currentTenant?.serverAddress};${currentTenant?.serverPort || "3000"};${qrModalUser.username};${qrModalUser.password};${qrModalUser.codeword}`}
                </div>
              </div>

              {/* Data display */}
              <div className="w-full text-slate-700 bg-slate-50 rounded-lg p-3 border border-slate-202 text-left font-sans space-y-1 mt-2">
                <p className="text-[11px] font-mono"><strong className="text-slate-400 uppercase text-[9px]">Mitarbeiter:</strong> {qrModalUser.name}</p>
                <p className="text-[11px] font-mono"><strong className="text-slate-400 uppercase text-[9px]">Mandant:</strong> {currentTenant?.name}</p>
                <p className="text-[11px] font-mono"><strong className="text-slate-400 uppercase text-[9px]">VLAN-Netz:</strong> {currentTenant?.vlanName}</p>
                <p className="text-[11px] font-mono"><strong className="text-slate-400 uppercase text-[9px]">Credentials:</strong> {qrModalUser.username}</p>
                <p className="text-[11px] font-mono"><strong className="text-slate-400 uppercase text-[9px]">Hauptschlüssel:</strong> {qrModalUser.codeword}</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={() => setQrModalUser(null)}
                className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2 text-xs font-semibold rounded cursor-pointer"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: MITARBEITER ONBOARDING HINWEISBLATT --- */}
      {onboardingModalUser && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setOnboardingModalUser(null)}></div>
          <div className="relative bg-white text-slate-900 w-full max-w-2xl max-h-[92vh] rounded-xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col">
            
            <div className="p-4 bg-emerald-700 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-1.5 font-bold text-sm font-sans">
                <Printer size={16} />
                <span>Onboarding-Hinweisblatt drucken</span>
              </div>
              <button onClick={() => setOnboardingModalUser(null)} className="p-1 hover:bg-emerald-800 rounded text-slate-100">
                <X size={16} />
              </button>
            </div>

            {/* Scrollable letter area designed for printing/presentation */}
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50" id="onboarding-print-view">
              
              {/* This paper card is styled elegant Swiss/Modern serif print standard */}
              <div className="bg-white p-10 border border-slate-300 shadow-md font-sans text-slate-800 max-w-lg mx-auto relative rounded-lg" id="onboarding-paper-card">
                
                {/* Header branding logo simulated */}
                <div className="flex justify-between items-start border-b border-indigo-950 pb-4">
                  <div>
                    <h3 className="text-base font-extrabold tracking-tight text-indigo-950 font-sans">SECURE SYSTEM SERVICE GmbH</h3>
                    <p className="text-[9px] text-slate-500 font-mono">Zwicklgasse 15, 1110 Wien • support@secure-sys-service.at</p>
                  </div>
                  
                  {/* Badges */}
                  <div className="text-right">
                    <span className="bg-indigo-950 text-white text-[8px] font-mono px-2 py-0.5 font-bold rounded uppercase tracking-wider block">
                      PERSONAL BLATT
                    </span>
                    <span className="text-[8.5px] font-mono text-slate-400 mt-1 block">Datum: {new Date().toLocaleDateString("de-AT")}</span>
                  </div>
                </div>

                {/* Receiver section */}
                <div className="mt-6 text-xs text-slate-600">
                  <p className="font-semibold block text-slate-400 text-[9px] uppercase tracking-wider">Mitarbeiter-Zustellung:</p>
                  <p className="font-bold text-slate-800 mt-0.5">{onboardingModalUser.name}</p>
                  <p className="font-mono text-[10px]">Mandant: {currentTenant?.name}</p>
                </div>

                {/* Subtitle letter title */}
                <h4 className="mt-8 text-sm font-black text-indigo-950 uppercase tracking-tight leading-normal font-sans border-b pb-1.5 border-slate-100">
                  Betreff: Einrichtungscode für Ihre mobile VdS-Messungsapp
                </h4>

                {/* Letter Body */}
                <div className="mt-4 text-xs text-slate-700 space-y-3 leading-relaxed">
                  <p>Sehr geehrte(r) Herr/Frau <strong>{onboardingModalUser.name}</strong>,</p>
                  
                  <p>
                    für die Durchführung der Brandmelder-Wartungen im Außendienst wurde für Sie ein mobiles Benutzerprofil auf unserem dezentralen Server eingerichtet.
                  </p>

                  <p className="font-semibold">Befolgen Sie bitte folgende Schritte zur schnellen App-Einrichtung:</p>
                  
                  <ol className="list-decimal list-inside pl-1 space-y-1.5 text-slate-700">
                    <li>Öffnen Sie die <strong>Service-App</strong> auf Ihrem Android-Arbeitsgerät.</li>
                    <li>Rufen Sie im Seitenmenü das Symbol <strong>„Zahnrad Settings“</strong> auf.</li>
                    <li>Suchen Sie unter „Server-Verbindung“ den Button <strong>„QR scannen“</strong>.</li>
                    <li>Scannen Sie den unten abgebildeten personifizierten Einrichtungscode ein.</li>
                    <li>Das System trägt alle Hostnamen, VLANs und Zugangsdaten lückenlos ein!</li>
                  </ol>

                  {/* Highlight box */}
                  <div className="bg-indigo-50 border border-indigo-200 p-3 rounded text-indigo-950 my-4 text-[11px] font-mono space-y-1">
                    <p className="font-extrabold text-[10px] text-indigo-900 border-b border-indigo-150 pb-1 mb-1.5 uppercase tracking-wide">Ihre persönlichen Zugangsdaten:</p>
                    <p><span className="text-slate-500 text-[10px]">Benutzername:</span> {onboardingModalUser.username}</p>
                    <p><span className="text-slate-500 text-[10px]">Passwort:</span> {onboardingModalUser.password}</p>
                    <p><span className="text-slate-500 text-[10px]">Prüfer-Schlüssel (Codewort):</span> <strong className="text-indigo-850 font-black">{onboardingModalUser.codeword}</strong></p>
                  </div>
                </div>

                {/* QR block block */}
                <div className="mt-6 flex flex-col justify-center items-center text-center">
                  <div className="border border-slate-300 p-2.5 bg-white rounded-lg shadow-sm">
                    {/* Compact simulated QR drawing matrix */}
                    <div className="w-32 h-32 bg-slate-50 relative flex flex-wrap p-0.5 overflow-hidden rounded border border-slate-200 select-none">
                      <div className="absolute top-0.5 left-0.5 w-7 h-7 border-2 border-slate-900 bg-white"></div>
                      <div className="absolute top-0.5 right-0.5 w-7 h-7 border-2 border-slate-900 bg-white"></div>
                      <div className="absolute bottom-0.5 left-0.5 w-7 h-7 border-2 border-slate-900 bg-white"></div>
                      {Array.from({ length: 48 }).map((_, i) => (
                        <div key={i} className={`w-2.5 h-2.5 m-0.5 rounded-sm ${
                          (i * 19) % 5 === 0 || (i * 31) % 7 === 0 ? "bg-slate-900" : "bg-transparent"
                        }`} />
                      ))}
                    </div>
                  </div>
                  <p className="text-[8px] font-mono text-slate-400 mt-2 tracking-tighter">
                    Security Provisioning Token • QR String block v1.3
                  </p>
                </div>

                {/* Footer and Sign Block */}
                <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between items-center text-[9px] font-sans text-slate-500">
                  <p>Ausgestellt durch: IT-Systemadministration</p>
                  <p>VdS-Zertifikat Klassierung C • ISO-9001</p>
                </div>

              </div>

            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between shrink-0">
              <button
                onClick={() => setOnboardingModalUser(null)}
                className="border border-slate-300 hover:bg-slate-100 px-5 py-2 font-semibold text-xs rounded transition-colors"
              >
                Schließen
              </button>
              
              <button
                onClick={() => {
                  window.print();
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 font-bold text-xs rounded transition-colors inline-flex items-center gap-1 shadow"
              >
                <Printer size={13} /> Dieses Hinweisblatt drucken
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Modal Dialog for adding a system type */}
      {isAddTypeModalOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm shadow-2xl" onClick={() => setIsAddTypeModalOpen(false)}></div>
          <div className="relative bg-white w-full max-w-sm rounded-lg shadow-2xl border border-slate-300 overflow-hidden flex flex-col text-xs text-[#191b23] animate-scaleIn font-sans">
            
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xs font-bold uppercase tracking-wide font-mono text-indigo-950 flex items-center gap-1.5">
                <SlidersHorizontal size={14} className="text-indigo-600" />
                Neuen Anlagentyp einrichten
              </h3>
              <button className="p-1 hover:bg-slate-200 rounded text-slate-500 transition-colors" onClick={() => setIsAddTypeModalOpen(false)}>
                <X size={15} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Type Code label in BMA form */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono mb-1">
                  Label-Kürzel (z.B. COA, SAA) *
                </label>
                <input
                  type="text"
                  value={newTypeCode}
                  onChange={(e) => setNewTypeCode(e.target.value.trim().toUpperCase())}
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#003d9b] font-mono font-bold uppercase"
                  placeholder="z.B. COA"
                />
              </div>

              {/* Description name */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono mb-1">
                  Typenbezeichnung (Anlagenname) *
                </label>
                <input
                  type="text"
                  value={newTypeNameField}
                  onChange={(e) => setNewTypeNameField(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#003d9b] font-semibold"
                  placeholder="z.B. Kohlenmonoxid-Warnanlage"
                />
              </div>

              {/* Label Signalfarbe mixer */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono mb-1">
                  Farbe für Benutzeroberflächen
                </label>
                <div className="flex items-center gap-2 border border-slate-300 rounded p-1 bg-white h-9">
                  <input
                    type="color"
                    value={newTypeColor}
                    onChange={(e) => setNewTypeColor(e.target.value)}
                    className="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0 bg-transparent block"
                  />
                  <span className="text-[10px] font-mono text-slate-600 uppercase font-bold">{newTypeColor}</span>
                </div>
              </div>

              {/* Comma detector list */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono mb-1">
                  Standard Meldertypen (kommagetrennt)
                </label>
                <input
                  type="text"
                  value={newTypeDetectors}
                  onChange={(e) => setNewTypeDetectors(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#003d9b] font-mono text-indigo-950 font-semibold"
                  placeholder="-, Normal, ZD, ZB..."
                />
              </div>

              {/* Hardware List options toggle */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100 mt-2">
                <input
                  type="checkbox"
                  id="add-type-hw-toggle"
                  checked={newTypeHasHardware}
                  onChange={(e) => setNewTypeHasHardware(e.target.checked)}
                  className="w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded cursor-pointer"
                />
                <label htmlFor="add-type-hw-toggle" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                  Hardware-Prüftabelle standardmäßig aktivieren
                </label>
              </div>

              {newTypeHasHardware && (
                <div className="space-y-1 pl-5 animate-fadeIn">
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                    Hardware Spalten (Semicolon-separiert)
                  </label>
                  <input
                    type="text"
                    value={newTypeHardwareHeaders}
                    onChange={(e) => setNewTypeHardwareHeaders(e.target.value)}
                    className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-[10.5px] font-mono font-semibold focus:outline-none focus:border-[#003d9b]"
                  />
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 shrink-0">
              <button 
                onClick={() => setIsAddTypeModalOpen(false)}
                className="px-4 h-9 border border-slate-300 rounded text-slate-700 hover:bg-slate-100 font-semibold"
              >
                Abbrechen
              </button>
              <button 
                onClick={() => {
                  const label = newTypeCode.trim().toUpperCase();
                  const name = newTypeNameField.trim();
                  if (!label) {
                    triggerToast("Bitte ein Kürzel eintragen!", "warning");
                    return;
                  }
                  if (!name) {
                    triggerToast("Bitte eine Typenbezeichnung eintragen!", "warning");
                    return;
                  }

                  // 1. Validate Code duplicates
                  if (systemTypeSettings[label]) {
                    triggerToast(`Der Label-Code '${label}' existiert bereits!`, "warning");
                    return;
                  }

                  // 2. Validate Name duplicates
                  const nameExists = Object.values(systemTypeMetadata).some(
                    v => v.name.toLowerCase() === name.toLowerCase()
                  );
                  if (nameExists) {
                    triggerToast(`Die Typenbezeichnung '${name}' existiert bereits!`, "warning");
                    return;
                  }

                  // 3. Save states!
                  const parts = newTypeDetectors.split(",").map(s => s.trim()).filter(Boolean);
                  const list = parts.includes("-") ? parts : ["-", ...parts];

                  setSystemTypeSettings(prev => ({
                    ...prev,
                    [label]: list
                  }));

                  setSystemTypeHardwareConfigs(prev => ({
                    ...prev,
                    [label]: {
                      hasHardware: newTypeHasHardware,
                      headers: newTypeHardwareHeaders.split(";").map(s => s.trim()).filter(Boolean)
                    }
                  }));

                  setSystemTypeMetadata(prev => ({
                    ...prev,
                    [label]: { name, color: newTypeColor }
                  }));

                  // Reset
                  setNewTypeCode("");
                  setNewTypeNameField("");
                  setNewTypeColor("#3b82f6");
                  setNewTypeDetectors("Normal, ZD, ZB, RAS");
                  setNewTypeHasHardware(false);
                  setIsAddTypeModalOpen(false);

                  triggerToast(`Anlagentyp '${label}' (${name}) erfolgreich angelegt!`, "success");
                }}
                className="px-5 h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded shadow"
              >
                Erstellen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tenant Rename & Logo Modal (iframe-safe React state popup overlay) */}
      {isRenameTenantModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg shadow-xl w-full max-w-md overflow-hidden font-sans">
            <div className="p-4 bg-slate-50 border-b border-rose-100 flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <Settings2 className="text-[#003d9b]" size={16} />
                Mandanten-Eigenschaften & Design
              </h3>
              <button 
                onClick={() => setIsRenameTenantModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase font-mono tracking-wider">Name des Mandanten</label>
                <input 
                  type="text"
                  value={renameTenantInput}
                  onChange={(e) => setRenameTenantInput(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded font-bold text-slate-800 bg-slate-50 focus:outline-none focus:border-[#003d9b]"
                  placeholder="z.B. Schmidt Brandschutz..."
                />
              </div>

              {/* Logo Area */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase font-mono tracking-wider">Mandanten-Firmenlogo (für PDF-Header)</label>
                
                {renameTenantLogoUrl ? (
                  <div className="border border-slate-205 rounded p-3 bg-slate-50 flex items-center justify-between gap-4">
                    <img 
                      src={renameTenantLogoUrl} 
                      alt="Logo Vorschau" 
                      className="max-h-12 max-w-[150px] object-contain rounded border border-slate-200 bg-white p-1" 
                      referrerPolicy="no-referrer" 
                    />
                    <button
                      type="button"
                      onClick={() => setRenameTenantLogoUrl("")}
                      className="text-xs text-red-600 hover:text-red-700 bg-white border border-slate-200 px-2.5 py-1.5 rounded font-semibold active:scale-95 transition-all shadow-sm"
                    >
                      Logo entfernen
                    </button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-5 bg-slate-50 text-center hover:bg-slate-100/50 transition-colors relative cursor-pointer">
                    <input 
                      type="file" 
                      accept="image/*"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      title="Bilddatei für Logo hochladen"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (loadEvent) => {
                            if (loadEvent.target?.result) {
                              setRenameTenantLogoUrl(loadEvent.target.result as string);
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <div className="text-slate-500 space-y-1">
                      <p className="text-[11px] font-bold">Datei auswählen oder hierher ziehen</p>
                      <p className="text-[9px] text-slate-400 font-medium">PNG, JPG, SVG (Empfohlen: Transparenter Hintergrund)</p>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-slate-400 leading-normal">
                Der geänderte Name und das Firmenlogo werden sofort auf alle generierten und synchronisierten Protokolle dieses Mandanten angewendet.
              </p>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button 
                onClick={() => setIsRenameTenantModalOpen(false)}
                className="px-3.5 py-1.5 text-xs text-slate-500 hover:text-slate-705 border border-slate-300 rounded hover:bg-slate-100 font-bold transition-all cursor-pointer"
              >
                Abbrechen
              </button>
              <button 
                onClick={() => {
                  if (!renameTenantInput.trim()) {
                    triggerToast("Bitte einen gültigen Mandantennamen eingeben!", "warning");
                    return;
                  }
                  setTenants(prev => prev.map(t => {
                    if (t.id === renameTenantId) {
                      return { 
                        ...t, 
                        name: renameTenantInput.trim(),
                        logoUrl: renameTenantLogoUrl
                      };
                    }
                    return t;
                  }));
                  triggerToast("Mandanteneinstellungen erfolgreich gespeichert!", "success");
                  setIsRenameTenantModalOpen(false);
                }}
                className="px-4 py-1.5 text-xs bg-[#003d9b] hover:bg-[#002f78] text-white font-bold rounded shadow transition-all cursor-pointer"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Unified Grid-Drawing & Multi-System Editor Modal */}
      {isUnifiedEditorOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-auto">
          <div className="relative bg-white text-slate-100 w-full max-w-[95vw] h-[92vh] rounded-xl shadow-2xl border border-slate-350 overflow-hidden flex flex-col font-sans min-w-[820px]">
            
            {/* Header */}
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0 animate-fadeIn">
              <div className="flex items-center gap-2">
                <Wrench size={18} className="text-amber-400" />
                <div>
                  <h3 className="font-bold text-sm leading-tight text-white">
                    {editorMode === "create" ? "Wartungsvertrag neu einpflegen" : "Wartungsvertrag anpassen & koordinieren"}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Typ: {editorSystemType} • {editorSubSystems.length} separate Anlage(n) verwaltet
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsUnifiedEditorOpen(false)} 
                className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
                title="Schließen"
              >
                <X size={16} />
              </button>
            </div>

            {/* Editor Workspace Column */}
            <div className="flex-1 overflow-auto p-5 space-y-4 flex flex-col text-slate-800">
              
              {/* Row 1: General Parameters */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-slate-50 border border-slate-200 p-3.5 rounded-lg shrink-0">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-black uppercase tracking-tight text-slate-500 font-mono">1. Objektname *</span>
                  <input 
                    type="text" 
                    placeholder="z.B. Seniorenheim Sonne"
                    className="h-8 border border-slate-300 rounded px-2 text-xs focus:outline-none focus:border-[#003d9b] bg-white text-slate-800 font-semibold"
                    value={editorName}
                    onChange={(e) => setEditorName(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-slate-505 uppercase tracking-tight font-mono">VN Nummer / ID (Vertrag)</span>
                  <input 
                    type="text" 
                    className="h-8 border border-slate-300 rounded px-2 text-xs font-mono font-bold bg-white text-indigo-700"
                    value={editorContractNumber}
                    onChange={(e) => setEditorContractNumber(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-black uppercase tracking-tight text-slate-500 font-mono">3. Standortadresse</span>
                  <input 
                    type="text" 
                    placeholder="Straße, PLZ, Ort"
                    className="h-8 border border-slate-300 rounded px-2 text-xs focus:outline-none focus:border-[#003d9b] bg-white text-slate-800"
                    value={editorAddress}
                    onChange={(e) => setEditorAddress(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-black uppercase tracking-tight text-slate-500 font-mono">4. Intervall</span>
                  <select 
                    className="h-8 border border-slate-300 rounded px-1.5 text-xs font-semibold focus:outline-none focus:border-[#003d9b] bg-white text-slate-800"
                    value={editorInterval}
                    onChange={(e) => setEditorInterval(e.target.value as any)}
                  >
                    <option value="Jährlich">Jährlich</option>
                    <option value="Halbjährlich">Halbjährlich</option>
                    <option value="Vierteljährlich">Vierteljährlich</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-black uppercase tracking-tight text-slate-500 font-mono">5. Anlagentyp</span>
                  <select 
                    className="h-8 border border-slate-300 rounded px-1.5 text-xs font-bold focus:outline-none focus:border-[#003d9b] bg-white text-slate-800"
                    disabled={editorMode === "edit"} // Don't allow changing core type of existing protocol for file safety
                    value={editorSystemType}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setEditorSystemType(newType);
                      const typesList = systemTypeSettings[newType] || ["-", "Normal"];
                      setDynamicDetectorTypes(typesList);
                      setPaintValue(typesList.filter(t => t !== "-")[0] || "Normal");
                    }}
                  >
                    <option value="BMA">BMA (Brandmelder)</option>
                    <option value="EMA">EMA (Einbruchmelder)</option>
                    <option value="ELA">ELA (Akustiksysteme)</option>
                    <option value="LIRA">LIRA (Lichtsysteme)</option>
                    <option value="SLA">SLA (Sprinkleranlagen)</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Multi-System capabilities Manager */}
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg shrink-0 flex flex-wrap items-center justify-between gap-3 font-sans">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-tight text-slate-500 font-mono">
                    Zugeordnete separate Anlagen:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {editorSubSystems.map(sub => {
                      const isActive = activeSubsystemId === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            setActiveSubsystemId(sub.id);
                          }}
                          className={`px-3 py-1 font-mono text-[10.5px] font-bold rounded border transition-all cursor-pointer ${
                            isActive 
                              ? "bg-[#003d9b] border-[#003d9b] text-white shadow" 
                              : "bg-white border-slate-300 text-slate-705 hover:bg-slate-100"
                          }`}
                        >
                          {sub.name}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={handleAddSubsystem}
                    className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-250 font-bold text-[10px] rounded inline-flex items-center gap-0.5 cursor-pointer"
                    title="Eine zusätzliche separate Anlage für diesen Vertrag hinzufügen (Mehr-Anlagen-Fähigkeit)"
                  >
                    <Plus size={11} /> + Anlage Hinzufügen
                  </button>
                </div>

                {/* Edit active subsystem details */}
                {activeSubsystemId && (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1 rounded">
                      <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">Aktive Anlage umbenennen:</span>
                      <input 
                        type="text"
                        className="h-6 border border-slate-250 rounded px-1.5 text-xs focus:outline-none focus:border-[#003d9b] w-45 font-bold text-slate-850"
                        value={editorSubSystems.find(s => s.id === activeSubsystemId)?.name || ""}
                        onChange={(e) => handleRenameSubsystem(e.target.value)}
                        onBlur={handleRenameSubsystemBlur}
                      />
                      <button
                        type="button"
                        onClick={handleDeleteSubsystem}
                        disabled={editorSubSystems.length <= 1}
                        className="p-1 hover:bg-red-50 text-red-655 rounded disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                        title="Diese Anlage löschen (Mind. 1 Anlage erforderlich)"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Columns size adjuster (+ / - buttons) */}
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded shadow-sm">
                      <span className="text-[10px] text-slate-500 font-bold uppercase font-mono">Spalten (10-50):</span>
                      <button
                        type="button"
                        onClick={handleRemoveColumn}
                        className="w-5.5 h-5.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center font-bold font-mono text-xs cursor-pointer select-none"
                        title="Spalte am Ende entfernen (Min. 10)"
                      >
                        -
                      </button>
                      <span className="text-xs font-bold font-mono px-2 text-indigo-950">
                        {editorSubSystems[0]?.rows[0]?.cells.length || 10}
                      </span>
                      <button
                        type="button"
                        onClick={handleAddColumn}
                        className="w-5.5 h-5.5 rounded bg-slate-100 text-[#003d9b] hover:bg-indigo-105 flex items-center justify-center font-bold font-mono text-xs cursor-pointer select-none"
                        title="Spalte hinten anhängen (Max. 50)"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Row 3: Office Ribbon Menüband Layout */}
              <div className="bg-slate-150 border-y-2 border-slate-300 p-2.5 rounded shadow-inner shrink-0 leading-none">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#003d9b] block mb-2 font-mono">
                  MENÜBAND (DIREKT-ZEICHNEN PLATTE)
                </span>
                
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch divide-x-0 md:divide-x divide-slate-300 text-slate-850">
                  
                  {/* Sub-section 1: Verlauf */}
                  <div className="col-span-1 md:col-span-2 flex flex-col justify-between pr-2.5 font-sans">
                    <span className="text-[9px] font-bold text-slate-505 uppercase font-mono block mb-1">Verlauf</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={handleUndo}
                        disabled={editorHistoryIndex <= 0}
                        className="flex-1 py-1.5 bg-white hover:bg-slate-5 border border-slate-305 rounded font-semibold text-[10px] text-slate-705 disabled:opacity-30 flex items-center justify-center gap-1 cursor-pointer"
                        title="Einen Schritt zurück (Undo)"
                      >
                        <Undo size={11} />
                        Schritt Zurück
                      </button>
                      <button
                        type="button"
                        onClick={handleRedo}
                        disabled={editorHistoryIndex >= editorHistory.length - 1}
                        className="flex-1 py-1.5 bg-white hover:bg-slate-5 border border-slate-350 rounded font-semibold text-[10px] text-slate-705 disabled:opacity-30 flex items-center justify-center gap-1 cursor-pointer"
                        title="Aktion wiederholen (Redo)"
                      >
                        <Redo size={11} />
                        Wiederholen
                      </button>
                    </div>
                  </div>
                               {/* Sub-section 2: Meldertyp */}
                  <div className="col-span-1 md:col-span-4 px-2.5 flex flex-col justify-between font-sans">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[9px] font-bold text-slate-505 uppercase font-mono">Meldertyp zeichnen</span>
                      <span className="text-[8px] bg-amber-100 text-amber-900 border border-amber-300 rounded px-1 font-semibold font-mono">Pinselaktiv</span>
                    </div>
                    <div className="flex flex-wrap gap-1 leading-normal max-h-16 overflow-y-auto pr-1">
                      {dynamicDetectorTypes.map(t => {
                        const isSelected = paintTool === "type" && paintValue === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              setPaintTool("type");
                              setPaintValue(t);
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
                              isSelected 
                                ? "bg-indigo-700 border-indigo-700 text-white font-bold" 
                                : "bg-white border-slate-300 text-slate-755 hover:bg-[#ebf0f5] hover:border-slate-450"
                            }`}
                          >
                            {t === "-" ? "Ø Inaktiv" : t}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Sub-section 3: Melderauslösung */}
                  <div className="col-span-1 md:col-span-3 px-2.5 flex flex-col justify-between font-sans">
                    <span className="text-[9px] font-bold text-slate-505 uppercase font-mono block mb-1">Melderauslösung zeichnen</span>
                    <div className="flex flex-wrap gap-1 leading-normal">
                      {(() => {
                        const triggerOptions = editorInterval === "Vierteljährlich"
                          ? [
                              { val: "Q1", label: "Q1" },
                              { val: "Q2", label: "Q2" },
                              { val: "Q3", label: "Q3" },
                              { val: "Q4", label: "Q4" },
                            ]
                          : editorInterval === "Halbjährlich"
                            ? [
                                { val: "H1", label: "H1" },
                                { val: "H2", label: "H2" },
                              ]
                            : [
                                { val: "Jahr", label: "Jahr" },
                              ];
                        
                        const fullOptions = [
                          ...triggerOptions,
                          { val: "CHECK", label: "✓ OK" },
                          { val: "Def.", label: "✘ Defekt" },
                          { val: "", label: "Radierer (Leer)" }
                        ];

                        return fullOptions.map(item => {
                          const isSelected = paintTool === "trigger" && paintValue === item.val;
                          return (
                            <button
                              key={item.val}
                              type="button"
                              onClick={() => {
                                setPaintTool("trigger");
                                setPaintValue(item.val);
                              }}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
                                isSelected 
                                  ? "bg-amber-600 border-amber-600 text-white font-bold" 
                                  : "bg-white border-slate-300 text-slate-750 hover:bg-slate-50"
                              }`}
                            >
                              {item.label}
                            </button>
                          );
                        });
                      })()}
                    </div>
                    <span className="text-[8px] text-slate-400 font-mono mt-0.5">Ausgelöste Werte überschreiben Slots</span>
                  </div>

                  {/* Sub-section 4: Spezial-Felder (Beschriftung/Freitext) */}
                  <div className="col-span-1 md:col-span-3 pl-2.5 flex flex-col justify-between font-sans">
                    <span className="text-[9px] font-bold text-slate-550 uppercase font-mono block mb-1">
                      Spezial-Felder (Beschriftung/Freitext)
                    </span>
                    <div className="flex flex-col gap-1.5 mt-0.5">
                      <div className="flex gap-1 items-center">
                        <span className="text-[8px] text-slate-400 font-mono uppercase shrink-0">Vorgabewert:</span>
                        <input 
                          type="text" 
                          placeholder="Z.B. Flur West..."
                          value={textBrushValue}
                          onChange={(e) => setTextBrushValue(e.target.value)}
                          className="h-6 border border-slate-300 rounded px-1.5 text-[11px] flex-1 bg-white focus:outline-none text-slate-800"
                        />
                      </div>
                      
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setPaintTool("type");
                            setPaintValue("Beschriftung");
                          }}
                          className={`flex-1 py-1 text-[9.5px] font-bold rounded border transition-all cursor-pointer ${
                            paintTool === "type" && paintValue === "Beschriftung"
                              ? "bg-amber-600 border-amber-600 text-white" 
                              : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                          }`}
                          title="Feld mit fest vordefiniertem Text zeichnen"
                        >
                          🏷️ Beschriftung
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => {
                            setPaintTool("type");
                            setPaintValue("Freitext");
                          }}
                          className={`flex-1 py-1 text-[9.5px] font-bold rounded border transition-all cursor-pointer ${
                            paintTool === "type" && paintValue === "Freitext"
                              ? "bg-slate-700 border-slate-700 text-white" 
                              : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                          }`}
                          title="Feld zeichnen in dem der Monteur freien Text eintragen kann"
                        >
                          ✍ Freitext
                        </button>
                      </div>
                    </div>
                  </div>

                </div>

              </div>

              {/* Row 4: Spreadsheet Body (Tabellarisch, visible borders, horizontally scrollable) */}
              <div className="flex-1 bg-white border border-slate-350 rounded-lg overflow-hidden flex flex-col min-h-0">
                
                {/* Scroll Container */}
                <div className="flex-1 overflow-auto">
                  
                  {activeSubsystemId && editorSubSystems.find(s => s.id === activeSubsystemId) ? (
                    <table className="w-full text-left text-xs text-slate-800 border-collapse table-fixed select-none">
                      <thead>
                        {/* Slots numbers header */}
                        <tr className="bg-slate-100 uppercase text-[9px] font-bold font-mono tracking-wider border-b border-slate-300">
                          <th className="px-3 py-2 border-r border-slate-300 w-20 shrink-0 text-slate-500">Actions</th>
                          <th className="px-3 py-2 border-r border-slate-300 w-28 shrink-0 text-slate-500 text-xs">Meldegruppe</th>
                          <th className="px-3 py-2 border-r border-slate-300 w-48 shrink-0 text-slate-505 text-xs">Name</th>
                          <th className="px-3 py-2 border-r border-slate-300 w-24 shrink-0 text-slate-505 text-xs text-center">Melderanzahl</th>
                          {(editorSubSystems.find(s => s.id === activeSubsystemId)?.rows[0]?.cells || []).map((_, i) => {
                            const numStr = String(i + 1).padStart(2, "0");
                            const colPrefix = editorSystemType === "ELA" 
                              ? "S" 
                              : editorSystemType === "Lichtruf" 
                                ? "" 
                                : "M";
                            return (
                              <th key={i} className="py-2 border-r border-slate-300 text-center font-mono text-[9px] text-[#003d9b] w-12" style={{ minWidth: "46px" }}>
                                {colPrefix ? `${colPrefix}${numStr}` : `${numStr}`}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {editorSubSystems.find(s => s.id === activeSubsystemId)!.rows.map((row, rIdx) => {
                          const nonInactiveCount = row.cells.filter(c => c.detectorType !== "-").length;
                          return (
                            <tr key={row.groupId} className="hover:bg-slate-50/50 border-b border-slate-300 h-11">
                              
                              {/* Row metadata controls */}
                              <td className="px-2 border-r border-slate-300 text-center text-[10px] font-mono shrink-0">
                                <div className="flex items-center justify-center gap-1.5">
                                  <span className="font-bold text-slate-400">#{rIdx + 1}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleEditorDeleteGroup(row.groupId)}
                                    className="p-1 hover:bg-red-50 text-red-500 rounded hover:text-red-700 cursor-pointer"
                                    title="Diese Gruppe vollständig löschen"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>

                              {/* 1. Meldegruppe Editable Input */}
                              <td className="px-1.5 border-r border-slate-300 shrink-0">
                                <input 
                                  type="text"
                                  className="w-full text-xs font-mono font-bold border border-slate-300 rounded px-1.5 py-0.5 bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:border-[#003d9b] text-slate-905 text-center"
                                  value={row.groupId}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const nextList = editorSubSystems.map(sub => {
                                      if (sub.id === activeSubsystemId) {
                                        return {
                                          ...sub,
                                          rows: sub.rows.map(r => r.groupId === row.groupId ? { ...r, groupId: val } : r)
                                        };
                                      }
                                      return sub;
                                    });
                                    setEditorSubSystems(nextList);
                                  }}
                                  onBlur={() => pushHistoryState(editorSubSystems)}
                                />
                              </td>

                              {/* 2. Group Area Name input editing */}
                              <td className="px-1.5 border-r border-slate-300 shrink-0">
                                <input 
                                  type="text"
                                  className="w-full text-xs font-bold border border-slate-250 rounded px-2 py-0.5 bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:border-[#003d9b] text-slate-800"
                                  value={row.groupName}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const nextList = editorSubSystems.map(sub => {
                                      if (sub.id === activeSubsystemId) {
                                        return {
                                          ...sub,
                                          rows: sub.rows.map(r => r.groupId === row.groupId ? { ...r, groupName: val } : r)
                                        };
                                      }
                                      return sub;
                                    });
                                    setEditorSubSystems(nextList);
                                  }}
                                  onBlur={() => pushHistoryState(editorSubSystems)}
                                />
                              </td>

                              {/* 3. Melderanzahl display (Calculated, read-only) */}
                              <td className="px-2 border-r border-slate-300 text-center font-mono text-xs font-extrabold text-indigo-950 shrink-0 bg-slate-50">
                                {nonInactiveCount}
                              </td>

                              {/* Cells Grid with Excel-like rectangular drag preview */}
                              {row.cells.map((cell, cIdx) => {
                                const isInactive = cell.detectorType === "-";
                                const isLabel = cell.detectorType === "Beschriftung";
                                const isFreeText = cell.detectorType === "Freitext";
                                const isTriggered = cell.value !== "" && !isLabel;

                                // Bounding-box selection calculations for visual highlight
                                const isSelectedInRect = (() => {
                                  if (!selectionStart || !selectionEnd) return false;
                                  const minR = Math.min(selectionStart.r, selectionEnd.r);
                                  const maxR = Math.max(selectionStart.r, selectionEnd.r);
                                  const minC = Math.min(selectionStart.c, selectionEnd.c);
                                  const maxC = Math.max(selectionStart.c, selectionEnd.c);
                                  return rIdx >= minR && rIdx <= maxR && cIdx >= minC && cIdx <= maxC;
                                })();
                                
                                // Determine beautiful cell bg & styling
                                let cellStyle: React.CSSProperties = {
                                  minWidth: "46px",
                                  maxWidth: "46px",
                                  height: "44px"
                                };
                                let bgClass = "bg-white hover:bg-indigo-50/40 text-slate-805";
                                let innerText = "";
                                
                                if (isInactive) {
                                  bgClass = "text-slate-400 font-bold";
                                  cellStyle.backgroundImage = "repeating-linear-gradient(45deg, #f8fafc, #f8fafc 4px, #e2e8f0 4px, #e2e8f0 8px)";
                                  innerText = "-";
                                } else if (isLabel) {
                                  bgClass = "bg-amber-50 text-amber-900 border-amber-300 font-semibold border-b-2";
                                  innerText = cell.value || "🏷️";
                                } else if (isFreeText) {
                                  bgClass = "bg-slate-100 text-slate-800 border-dashed border-slate-350 font-semibold text-[9.5px]";
                                  innerText = cell.value ? `✍ ${cell.value}` : "✍ Freitext";
                                } else if (isTriggered) {
                                  if (cell.value === "Def." || cell.value === "Def") {
                                    bgClass = "bg-red-50 text-red-700 font-bold border-red-300";
                                    innerText = "Def.";
                                  } else if (cell.value === "CHECK" || cell.value === "✓") {
                                    bgClass = "bg-emerald-50 text-emerald-800 font-bold border-emerald-300";
                                    innerText = "✓";
                                  } else if (cell.value === "Quartal" || cell.value === "Q1" || cell.value === "Q2" || cell.value === "Q3" || cell.value === "Q4") {
                                    bgClass = "bg-sky-50 text-sky-850 font-semibold border-sky-305";
                                    innerText = cell.value;
                                  } else if (cell.value === "Halbjahr" || cell.value === "H1" || cell.value === "H2") {
                                    bgClass = "bg-purple-50 text-purple-855 font-semibold border-purple-305";
                                    innerText = cell.value;
                                  } else if (cell.value === "Jahr") {
                                    bgClass = "bg-amber-50 text-amber-850 font-semibold border-amber-305";
                                    innerText = "Jahr";
                                  } else {
                                    bgClass = "bg-indigo-50 text-indigo-855 font-medium border-indigo-200";
                                    innerText = cell.value.substring(0, 4);
                                  }
                                }

                                if (isSelectedInRect) {
                                  cellStyle.outline = "2.5px solid #4f46e5";
                                  cellStyle.outlineOffset = "-2.5px";
                                }

                                return (
                                  <td
                                    key={cIdx}
                                    style={cellStyle}
                                    onMouseDown={(e) => handleCellMouseDown(rIdx, cIdx, e)}
                                    onMouseEnter={(e) => handleCellMouseEnter(rIdx, cIdx, e)}
                                    className={`border-r border-slate-300 text-center text-[10px] cursor-crosshair select-none relative transition-colors duration-100 ${bgClass}`}
                                    title={`Slot Pt ${cIdx + 1} • Typ: ${cell.detectorType} • Auslösung: ${cell.value || "keine"}`}
                                  >
                                    <div className="flex flex-col items-center justify-center h-full leading-normal text-slate-900 font-sans">
                                      {/* Main visual marker */}
                                      <span className="text-[10.5px] font-mono leading-none font-bold break-all truncate max-w-[40px] block">{innerText}</span>
                                      
                                      {/* Sub label of detector type if active and un-triggered */}
                                      {!isInactive && !isTriggered && !isLabel && !isFreeText && (
                                        <span className="text-[7.2px] font-sans text-slate-450 block tracking-tighter uppercase scale-90 leading-none mt-0.5">
                                          {cell.detectorType}
                                        </span>
                                      )}
                                    </div>
                                    {/* Small position indicator on mouse-hover */}
                                    <span className="absolute bottom-0 right-0 font-mono text-[6.5px] text-slate-350 scale-75 opacity-0 hover:opacity-100 leading-none">
                                      {cIdx + 1}
                                    </span>
                                  </td>
                                );
                              })}

                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center py-8 text-slate-400 font-mono text-xs">
                      Lade die Tabellen-Matrix...
                    </div>
                  )}

                  {/* Dynamic Hardware Checklist Section */}
                  {activeSubsystemId && systemTypeHardwareConfigs[editorSystemType]?.hasHardware && (
                    <div className="mt-6 p-4 border-t border-slate-200 bg-slate-50 border-x-0 border-b-0 rounded-b-lg">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                        <div>
                          <h4 className="text-xs font-bold font-mono tracking-wider text-[#003d9b] uppercase flex items-center gap-1.5">
                            <SlidersHorizontal size={14} className="text-[#003d9b]" />
                            Zusatz-Hardware & Systembaugruppen (Modul/Ring-Prüfung)
                          </h4>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Erfassen und verwalten Sie gerätespezifische Komponenten und Baugruppen für diesen Anlageteil (<strong>{activeSub?.name}</strong>).
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleAddHardwareRow}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded shadow-sm text-[10px] flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Plus size={12} /> Baugruppe / Ring hinzufügen
                        </button>
                      </div>

                      {activeSub?.hardwareRows && activeSub.hardwareRows.length > 0 ? (
                        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                          <table className="w-full text-left text-xs text-slate-800 border-collapse">
                            <thead>
                              <tr className="bg-slate-100 border-b border-slate-200 text-[9.5px] uppercase font-bold text-slate-500 font-mono">
                                {systemTypeHardwareConfigs[editorSystemType].headers.map((hdr) => (
                                  <th key={hdr} className="px-3 py-2 border-r border-slate-200 last:border-r-0">
                                    {hdr}
                                  </th>
                                ))}
                                <th className="px-3 py-2 w-12 text-center text-slate-500">Aktion</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeSub.hardwareRows.map((row) => (
                                <tr key={row.id} className="border-b border-slate-150 last:border-b-0 hover:bg-slate-50 h-10">
                                  {systemTypeHardwareConfigs[editorSystemType].headers.map((hdr) => {
                                    const val = row[hdr] || "";
                                    const lowerHdr = hdr.toLowerCase();
                                    const isFaultOrInterruption = lowerHdr.includes("stör") || lowerHdr.includes("unterbrech");
                                    
                                    return (
                                      <td key={hdr} className="p-1 px-3 border-r border-slate-200 last:border-r-0">
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="text"
                                            value={val}
                                            onChange={(e) => handleHardwareValueChange(row.id, hdr, e.target.value)}
                                            onBlur={() => pushHistoryState(editorSubSystems)}
                                            placeholder={`${hdr}...`}
                                            className="w-full text-xs border border-slate-250 rounded px-2 py-1 bg-white focus:outline-none focus:border-[#003d9b] font-mono text-slate-800 font-semibold"
                                          />
                                          {isFaultOrInterruption && (
                                            <div className="flex gap-0.5 shrink-0">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  handleHardwareValueChange(row.id, hdr, "Ja");
                                                  pushHistoryState(editorSubSystems);
                                                }}
                                                className={`px-1 py-0.5 text-[8px] font-bold rounded border ${val === "Ja" ? "bg-red-100 border-red-350 text-red-700" : "bg-slate-50 border-slate-200 hover:bg-slate-150 text-slate-600"}`}
                                                title="Als 'Ja' setzen"
                                              >
                                                Ja
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  handleHardwareValueChange(row.id, hdr, "Nein");
                                                  pushHistoryState(editorSubSystems);
                                                }}
                                                className={`px-1 py-0.5 text-[8px] font-bold rounded border ${val === "Nein" ? "bg-emerald-100 border-emerald-350 text-emerald-800" : "bg-slate-50 border-slate-200 hover:bg-slate-150 text-slate-600"}`}
                                                title="Als 'Nein' setzen"
                                              >
                                                Nein
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    );
                                  })}
                                  <td className="px-2 py-1 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteHardwareRow(row.id)}
                                      className="p-1 hover:bg-red-50 text-red-500 rounded hover:text-red-700 cursor-pointer inline-flex items-center justify-center transition-colors"
                                      title="Komponente löschen"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div 
                          onClick={handleAddHardwareRow}
                          className="border-2 border-dashed border-slate-250 hover:border-indigo-400 rounded-lg p-5 text-center cursor-pointer bg-white hover:bg-slate-50 transition-all group flex flex-col items-center justify-center"
                        >
                          <span className="text-slate-400 group-hover:text-slate-600 text-[11px] block font-mono">
                            Keine Zusatz-Hardware für diesen Anlagenteil hinterlegt.
                          </span>
                          <span className="text-xs font-bold text-indigo-700 mt-1 inline-flex items-center gap-1 group-hover:underline">
                            <Plus size={12} /> Hardware-Prüfliste anlegen
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                </div>

                {/* Grid controls footer inside tabular editor */}
                <div className="p-3 bg-slate-50 border-t border-slate-201 flex justify-between items-center shrink-0">
                  <button
                    type="button"
                    onClick={handleEditorAddGroup}
                    className="px-3.5 py-1.5 bg-[#003d9b] hover:bg-[#002f78] text-white font-bold text-xs rounded shadow flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus size={13} /> Neue Meldergruppe hinzufügen (Neue Zeile)
                  </button>
                  <span className="text-[10px] text-slate-400 font-mono">
                    * Ziehen Sie den Cursor bei gedrückter Maustaste über die Slots (Spalten 1 - 30), um sie Excel-artig zu zeichnen!
                  </span>
                </div>

              </div>

            </div>

            {/* Footer Form Controls */}
            <div className="p-4 bg-slate-100 border-t border-slate-300 flex justify-between shrink-0 font-sans text-slate-800">
              
              {/* Reset/Delete Zone */}
              <div>
                {editorMode === "edit" ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Möchten Sie diesen Wartungsvertrag wirklich endgültig aus dem System löschen? Dies kann nicht rückgängig gemacht werden!")) {
                        setProtocols(prev => prev.filter(p => p.id !== editorContractNumber));
                        triggerToast("Wartungsvertrag vollständig gelöscht.", "success");
                        setIsUnifiedEditorOpen(false);
                      }
                    }}
                    className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded font-bold text-xs transition-colors cursor-pointer"
                  >
                    Wartungsvertrag löschen
                  </button>
                ) : (
                  <span className="text-slate-400 text-xs font-mono">Neue Anlage vorbereiten</span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    // Pre-select BMA or default types if we want and open modal
                    setIsImportModalOpen(true);
                  }}
                  className="px-5 py-2 border border-indigo-300 hover:bg-indigo-50 text-indigo-700 bg-white rounded font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title="Anlage-Datei importieren (ESSER, NOTIFIER, HEKATRON)"
                >
                  <Upload size={14} /> Importieren...
                </button>

                <button
                  type="button"
                  onClick={() => setIsUnifiedEditorOpen(false)}
                  className="px-5 py-2 border border-slate-400 hover:bg-slate-200 text-slate-705 bg-white rounded font-bold text-xs transition-all cursor-pointer"
                >
                  Abbrechen
                </button>
                
                <button
                  type="button"
                  onClick={handleSaveUnifiedEditor}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded shadow-md flex items-center gap-1.5 transition-all outline-none cursor-pointer"
                >
                  <CheckCircle size={14} /> {editorMode === "create" ? "Wartungs-Anlage anlegen" : "Änderungen anwenden & sichern"}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 3. Small Import Overlay Modal (Wartungsvertrag Import Assistant) */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[250] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md overflow-hidden flex flex-col font-sans animate-fadeIn text-slate-800">
            {/* Header */}
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Upload size={16} className="text-indigo-400" />
                <h4 className="font-bold text-xs uppercase font-mono tracking-wider">Datei-Import Assistent</h4>
              </div>
              <button 
                onClick={() => setIsImportModalOpen(false)} 
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
                title="Abbrechen"
                disabled={isImporting}
              >
                <X size={14} />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 flex flex-col gap-4">
              <p className="text-xs text-slate-500">
                Wählen Sie den Dateityp und laden Sie Ihre Konfigurationsdatei hoch, um die Melderliste im Editor automatisch zu befüllen (Anlagentyp: <strong>{editorSystemType}</strong>).
              </p>

              {/* Selector */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">1. Import-Format wählen</span>
                {editorSystemType === "BMA" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditorImportFileType("esser")}
                      className={`p-2 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                        editorImportFileType === "esser"
                          ? "bg-indigo-50 border-indigo-500 text-indigo-950 font-bold shadow-sm"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                      disabled={isImporting}
                    >
                      <span className="text-xs font-mono leading-none">ESSER</span>
                      <span className="text-[9px] text-slate-400 leading-none">Proprietäre .etb Datei</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditorImportFileType("notifier")}
                      className={`p-2 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                        editorImportFileType === "notifier"
                          ? "bg-indigo-50 border-indigo-500 text-indigo-950 font-bold shadow-sm"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                      disabled={isImporting}
                    >
                      <span className="text-xs font-mono leading-none">NOTIFIER</span>
                      <span className="text-[9px] text-slate-400 leading-none">xml/usw. Schnittstelle</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditorImportFileType("hekatron")}
                      className={`p-2 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                        editorImportFileType === "hekatron"
                          ? "bg-indigo-50 border-indigo-500 text-indigo-950 font-bold shadow-sm"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                      disabled={isImporting}
                    >
                      <span className="text-xs font-mono leading-none">HEKATRON</span>
                      <span className="text-[9px] text-slate-400 leading-none">json/usw. Schnittstelle</span>
                    </button>

                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditorImportFileType("csv")}
                        className={`p-1.5 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                          editorImportFileType === "csv"
                            ? "bg-indigo-50 border-indigo-500 text-indigo-950 font-bold shadow-sm"
                            : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                        }`}
                        disabled={isImporting}
                      >
                        <span className="text-[11px] font-bold leading-none">CSV</span>
                        <span className="text-[8px] text-slate-400">Sonstiges</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditorImportFileType("xlsx")}
                        className={`p-1.5 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                          editorImportFileType === "xlsx"
                            ? "bg-indigo-50 border-indigo-500 text-indigo-950 font-bold shadow-sm"
                            : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                        }`}
                        disabled={isImporting}
                      >
                        <span className="text-[11px] font-bold leading-none">Excel</span>
                        <span className="text-[8px] text-slate-400">Sonstiges</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditorImportFileType("csv")}
                      className={`p-3 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                        editorImportFileType === "csv"
                          ? "bg-indigo-50 border-indigo-500 text-indigo-950 font-bold shadow-sm"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                      disabled={isImporting}
                    >
                      <span className="text-sm font-bold leading-none">CSV-Datei</span>
                      <span className="text-[9px] text-slate-400 leading-none">Tabellarischer Import (.csv)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditorImportFileType("xlsx")}
                      className={`p-3 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                        editorImportFileType === "xlsx"
                          ? "bg-indigo-50 border-indigo-500 text-indigo-950 font-bold shadow-sm"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                      disabled={isImporting}
                    >
                      <span className="text-sm font-bold leading-none">Excel-Datei</span>
                      <span className="text-[9px] text-slate-400 leading-none">Microsoft Excel Format (.xlsx)</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Dynamic Design Template Download Area */}
              {(editorImportFileType === "csv" || editorImportFileType === "xlsx") && (
                <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl flex flex-col gap-1.5 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <FileSpreadsheet size={14} className="text-indigo-600" />
                    <span className="text-[10px] text-indigo-950 font-bold uppercase font-mono">Download-Bereich</span>
                  </div>
                  <p className="text-[10.5px] leading-relaxed text-slate-600">
                    Laden Sie die passende Struktur-Vorlage für <strong>{editorSystemType}</strong> herunter. Füllen Sie diese aus und laden Sie sie anschließend hoch.
                  </p>
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate("csv")}
                      className="flex-1 py-1.5 px-3 bg-white border border-indigo-200 hover:bg-indigo-50 hover:border-indigo-400 text-indigo-800 rounded font-bold text-[10px] text-center transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                    >
                      <span>CSV Vorlage (.csv)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate("xlsx")}
                      className="flex-1 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold text-[10px] text-center transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                    >
                      <span>Excel Vorlage (.xlsx)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Upload Zone */}
              <div className="flex flex-col gap-1.5 mt-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">2. Datei hochladen</span>
                
                {isImporting ? (
                  <div className="h-32 border border-dashed border-indigo-300 rounded-xl bg-indigo-50/50 flex flex-col items-center justify-center gap-2 p-4 text-center">
                    <div className="w-8 h-8 rounded-full border-4 border-t-indigo-600 border-indigo-200 animate-spin" />
                    <span className="text-xs font-bold text-indigo-950">Importiere Daten...</span>
                    <span className="text-[9px] text-slate-500 font-mono">Führe Python-Parser im Container aus</span>
                  </div>
                ) : (
                  <label className="h-32 border-2 border-dashed border-slate-250 hover:border-indigo-500 rounded-xl bg-slate-50 hover:bg-indigo-50/5 flex flex-col items-center justify-center gap-1.5 p-4 text-center cursor-pointer transition-colors group">
                    <Upload size={22} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
                    <div>
                      <span className="text-xs font-bold text-slate-700 block text-center">Klicken zum Durchsuchen</span>
                      <span className="text-[10px] text-slate-400 text-center block">oder Datei hierhin ziehen</span>
                    </div>
                    {editorImportFileType === "esser" ? (
                      <span className="text-[8.5px] font-mono bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200">
                        ESSER .etb (triggert Python-Script)
                      </span>
                    ) : editorImportFileType === "csv" ? (
                      <span className="text-[8.5px] font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">
                        Standard CSV-Datei (.csv)
                      </span>
                    ) : editorImportFileType === "xlsx" ? (
                      <span className="text-[8.5px] font-mono bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                        Excel-Datei (.xlsx)
                      </span>
                    ) : (
                      <span className="text-[8.5px] font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">
                        {editorImportFileType.toUpperCase()}-Schnittstelle
                      </span>
                    )}
                    <input 
                      type="file" 
                      className="hidden" 
                      accept={
                        editorImportFileType === "esser" 
                          ? ".etb" 
                          : editorImportFileType === "csv" 
                          ? ".csv" 
                          : editorImportFileType === "xlsx" 
                          ? ".xlsx" 
                          : undefined
                      }
                      onChange={handleFileImport}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-1.5 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded font-bold cursor-pointer transition-colors"
                disabled={isImporting}
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
