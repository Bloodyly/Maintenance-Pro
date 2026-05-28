import React, { useState, useMemo } from "react";
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
  AlertCircle
} from "lucide-react";

// Mirroring App types
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
  const [pdfModalId, setPdfModalId] = useState<string | null>(null);
  const [selectedArchiveForPdf, setSelectedArchiveForPdf] = useState<WebUIArchive | null>(null);

  // New features modal states
  const [isDefectModalOpen, setIsDefectModalOpen] = useState(false);
  const [isAddContractModalOpen, setIsAddContractModalOpen] = useState(false);

  // Add contract wizard form states
  const [newContractName, setNewContractName] = useState("");
  const [newContractAddress, setNewContractAddress] = useState("");
  const [newContractNumber, setNewContractNumber] = useState("");
  const [newContractInterval, setNewContractInterval] = useState<"Jährlich" | "Halbjährlich" | "Vierteljährlich">("Jährlich");
  const [newContractSystemType, setNewContractSystemType] = useState("BMA");
  const [newContractSetupMethod, setNewContractSetupMethod] = useState<"import" | "manual">("import");
  
  // Simulated CSV/Excel raw parsed data list
  const [importedFileName, setImportedFileName] = useState("");
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
  const [deleteConfirmTenantId, setDeleteConfirmTenantId] = useState<string | null>(null);

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

  // Helper to start adjusting a specific protocol
  const startAdjustProtocol = (p: ProtocolItem) => {
    setAdjustProtocolId(p.id);
    setAdjustName(p.name);
    setAdjustAddress(p.address || "");
    setAdjustContractNumber(p.contractNumber);
    setAdjustInterval(p.interval);
    setAdjustStatus(p.status);
    setAdjustSystemType(p.systemType);
    
    // Deep clone rows
    const clonedRows = p.rows.map(r => ({
      groupId: r.groupId,
      groupName: r.groupName,
      groupType: r.groupType || "",
      cells: r.cells.map(c => ({
        slotKey: c.slotKey,
        detectorType: c.detectorType,
        value: c.value
      }))
    }));
    setAdjustRows(clonedRows);
    setShowConfirmDeleteAdjust(false);
    setIsAdjustProtocolModalOpen(true);
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
      rows: calculatedRows
    };

    setProtocols(prev => [...prev, newProtocolItem]);
    triggerToast(`Wartungsvertrag ${newContractName} (${newContractSystemType}) wurde erfolgreich eingepflegt!`, "success");
    setIsAddContractModalOpen(false);
  };

  const handleSimulateFileImport = () => {
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
                  setNewContractName("");
                  setNewContractAddress("");
                  setNewContractNumber(`V-2026-${Math.floor(1000 + Math.random() * 9000)}-Z`);
                  setNewContractInterval("Jährlich");
                  setNewContractSystemType("BMA");
                  setNewContractSetupMethod("import");
                  setImportedFileName("");
                  setImportedDetectors([]);
                  setManualGroups([
                    {
                      groupId: "GRP_01",
                      groupName: "Gruppe 01 (EG Hauptbereich)",
                      slots: [
                        { slotKey: "1", detectorType: "Normal" },
                        { slotKey: "2", detectorType: "Normal" },
                        { slotKey: "3", detectorType: "ZD" },
                        { slotKey: "4", detectorType: "DKM" }
                      ]
                    },
                    {
                      groupId: "GRP_02",
                      groupName: "Gruppe 02 (1.OG Büro West)",
                      slots: [
                        { slotKey: "1", detectorType: "Normal" },
                        { slotKey: "2", detectorType: "Normal" },
                        { slotKey: "3", detectorType: "TDIFF" },
                        { slotKey: "4", detectorType: "RAS" }
                      ]
                    }
                  ]);
                  setIsAddContractModalOpen(true);
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
                      // Calc rows filled details
                      let cellsTotal = 0;
                      let cellsFilled = 0;
                      let cellsDef = 0;
                      
                      p.rows.forEach(r => {
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
                            <div className="font-bold text-slate-800 flex flex-wrap items-center gap-1.5">
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
                            <div className="text-[10px] font-mono text-slate-500 mt-0.5 max-w-[280px] truncate">
                              Vertrag: <strong className="text-indigo-950">{p.contractNumber}</strong> | {p.address}
                            </div>
                          </td>
                          <td className="px-3 py-3.5">
                            <span className="bg-[#003d9b]/10 text-[#003d9b] font-mono font-bold px-1.5 py-0.5 rounded text-[10px]">
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

          {/* Users Table / Grid */}
          <div className="bg-white border-2 border-slate-200 rounded-lg shadow-sm overflow-hidden flex flex-col">
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
                        {/* Rename Action */}
                        <button
                          onClick={() => {
                            setRenameTenantId(t.id);
                            setRenameTenantInput(t.name);
                            setIsRenameTenantModalOpen(true);
                          }}
                          className="px-2.5 py-1.5 text-[10px] font-bold bg-white border border-slate-300 hover:bg-slate-50 rounded text-slate-700 cursor-pointer"
                        >
                          Umbenennen
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
                  
                  {/* Stamp top corner draft logo */}
                  <div className="absolute top-12 right-12 border-4 border-emerald-600/50 text-emerald-700 font-mono text-[9px] font-black tracking-widest px-2.5 py-1.5 rounded-md uppercase transform rotate-6 select-none bg-emerald-50">
                    {item_p.status === "synchronized" ? "✓ SYNC OK" : "⚡ ENTWURF UNVOLLSTÄNDIG"}
                  </div>

                  {/* Header */}
                  <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start font-sans">
                    <div>
                      <h2 className="text-xl font-black uppercase tracking-tight">Inspektionsprotokoll Baugruppe {item_p.systemType}</h2>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">ReportLab Automatic PDF Exporter Engine v2.4.0</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">System ID: {item_p.contractNumber}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold font-mono px-2 py-0.5 bg-slate-100 rounded text-slate-750">INT_NET_VLAN_10</p>
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
                      <span>VERIFIKATIONSMATRIX DER EINZELNEN DETEKTORSCHLEIFEN</span>
                      <span className="font-mono text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">Abschlussgrad: {verifiedPercent}%</span>
                    </h3>

                    <div className="space-y-3">
                      {item_p.rows.map((row, rIdx) => (
                        <div key={rIdx} className="border border-slate-200 rounded">
                          <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 font-bold flex justify-between text-[11px] text-slate-700">
                            <span>{row.groupName} ({row.groupId})</span>
                            <span className="text-[10px] font-mono text-slate-400 font-normal">Soll-Spalten ({item_p.columns.length})</span>
                          </div>

                          <div className="p-2 overflow-x-auto">
                            <table className="w-full text-center text-[10px] font-mono border-collapse">
                              <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500">
                                  <th className="py-1 px-1">Wert</th>
                                  {row.cells.map((cell, idx) => (
                                    <th key={idx} className="py-1 px-1 border-l border-slate-100 font-bold">Slot {cell.slotKey}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-b border-slate-100">
                                  <td className="py-1.5 px-1 font-bold text-slate-600 text-left bg-slate-50/20">Typ</td>
                                  {row.cells.map((cell, idx) => (
                                    <td key={idx} className="py-1.5 px-1 border-l border-indigo-50/50 bg-slate-50/10 font-medium text-slate-700">{cell.detectorType || "-"}</td>
                                  ))}
                                </tr>
                                <tr>
                                  <td className="py-1.5 px-1 font-bold text-slate-600 text-left bg-slate-50/20">Prüfung</td>
                                  {row.cells.map((cell, idx) => (
                                    <td key={idx} className={`py-1.5 px-1 border-l border-slate-100 font-bold ${
                                      cell.value === "Def." ? "text-red-600 bg-red-50/40" : 
                                      cell.value !== "" ? "text-emerald-700 bg-emerald-50/20" : "text-slate-350"
                                    }`}>
                                      {cell.value || "•"}
                                    </td>
                                  ))}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
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

            <div className="flex-1 overflow-auto p-6 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded p-4 text-xs grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <span className="text-slate-500 font-bold block">Vertrag / ID</span>
                  <span className="font-semibold font-mono">{inspectedProtocol.contractNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block">Anlagentyp</span>
                  <span className="font-semibold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px] font-mono">{inspectedProtocol.systemType}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block">Wartungsturnus</span>
                  <span className="font-semibold">{inspectedProtocol.interval}</span>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-mono border-b border-slate-250">
                      <th className="p-2.5 font-bold border-r border-slate-200">GRP</th>
                      <th className="p-2.5 font-bold border-r border-slate-200 text-slate-700 min-w-[120px]">Bereich / Name</th>
                      {inspectedProtocol.columns.map(col => (
                        <th key={col} className="p-2 border-r border-slate-200 text-center min-w-[50px]">Slot {col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inspectedProtocol.rows.map(row => (
                      <tr key={row.groupId} className="hover:bg-slate-50 border-b border-slate-100">
                        <td className="p-2.5 font-mono border-r border-slate-200 bg-slate-50 text-indigo-900 font-bold">{row.groupId}</td>
                        <td className="p-2.5 border-r border-slate-200">
                          <p className="font-bold">{row.groupName}</p>
                          <p className="text-[9px] text-slate-400 font-mono italic">{row.groupType || "NAM"}</p>
                        </td>
                        {row.cells.map(cell => {
                          const isDisabled = cell.detectorType === "-";
                          const isDefect = cell.value === "Def.";
                          return (
                            <td 
                              key={cell.slotKey} 
                              className={`p-1 border-r border-slate-200 text-center text-[10px] ${
                                isDisabled ? "bg-slate-105 text-slate-400" : 
                                isDefect ? "bg-red-50 text-red-700 font-bold border border-red-200" : 
                                cell.value ? "bg-blue-50 text-blue-700 font-bold border border-blue-200" : ""
                              }`}
                            >
                              {isDisabled ? "-" : (
                                <div className="flex flex-col items-center justify-center">
                                  <span className="font-bold">{cell.value || "•"}</span>
                                  <span className="text-[8px] text-slate-400 font-mono">{cell.detectorType}</span>
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
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded p-4 text-center">
                    <p className="text-xs text-slate-500 mb-2">Simulieren Sie den Dateiimport aus einer Export-Datei des Kunden für diesen Anlagentyp.</p>
                    <button 
                      type="button"
                      onClick={handleSimulateFileImport}
                      className="bg-slate-800 text-white font-bold text-xs px-3.5 py-2 hover:bg-slate-700 transition"
                    >
                      Letzten Export simulativ parsen
                    </button>
                    {importedFileName && (
                      <div className="mt-3 text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 p-2 rounded">
                        <p><strong>Eingelesene Datei:</strong> {importedFileName}</p>
                        <p className="mt-1">Gefundene Testpunkte: {importedDetectors.length} (Aufgeteilt auf {Array.from(new Set(importedDetectors.map(d => d.group))).length} Sektionen)</p>
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

      {/* Tenant Rename Modal (iframe-safe React state popup overlay) */}
      {isRenameTenantModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg shadow-xl w-full max-w-md overflow-hidden font-sans">
            <div className="p-4 bg-slate-50 border-b border-rose-100 flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <Settings2 className="text-[#003d9b]" size={16} />
                Mandant umbenennen
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
              <p className="text-[10px] text-slate-400 leading-normal">
                Der geänderte Name wird sofort systemweit für diesen Mandanten angewendet.
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
                      return { ...t, name: renameTenantInput.trim() };
                    }
                    return t;
                  }));
                  triggerToast("Mandant erfolgreich umbenannt!", "success");
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

      {/* Adjust Protocol / Contract Dialog (iframe-safe React state editor overlay) */}
      {isAdjustProtocolModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden font-sans">
            
            {/* Header */}
            <div className="p-4 bg-slate-50 border-b border-indigo-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                  <Wrench className="text-amber-500" size={16} />
                  Wartungsvertrag anpassen
                </h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                  ID: {adjustProtocolId} • Typ: {adjustSystemType}
                </p>
              </div>
              <button 
                onClick={() => setIsAdjustProtocolModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 p-1 cursor-pointer transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              
              {/* Grid 1: Base settings */}
              <div>
                <h4 className="text-[10px] font-bold text-[#003d9b] uppercase tracking-wider mb-2 font-mono">1. Allgemeine Vertragsdaten</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
                  
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase font-mono tracking-wider">Objektbezeichnung (Name) *</label>
                    <input 
                      type="text"
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded font-bold text-slate-800 bg-white"
                      value={adjustName}
                      onChange={(e) => setAdjustName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase font-mono tracking-wider">Vertragsnummer / VN Nummer *</label>
                    <input 
                      type="text"
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded font-bold text-slate-800 bg-white font-mono"
                      value={adjustContractNumber}
                      onChange={(e) => setAdjustContractNumber(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase font-mono tracking-wider">Standortadresse (Optional)</label>
                    <input 
                      type="text"
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded font-medium text-slate-800 bg-white"
                      value={adjustAddress}
                      onChange={(e) => setAdjustAddress(e.target.value)}
                      placeholder="Keine Adresse hinterlegt"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase font-mono tracking-wider">Wartungs-Intervall</label>
                      <select 
                        className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded font-semibold text-slate-800 bg-white"
                        value={adjustInterval}
                        onChange={(e: any) => setAdjustInterval(e.target.value)}
                      >
                        <option value="Jährlich">Jährlich</option>
                        <option value="Halbjährlich">Halbjährlich</option>
                        <option value="Vierteljährlich">Vierteljährlich</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase font-mono tracking-wider">Feld-Status (Manuell)</label>
                      <select 
                        className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded font-bold text-slate-800 bg-white"
                        value={adjustStatus}
                        onChange={(e: any) => setAdjustStatus(e.target.value)}
                      >
                        <option value="ready_to_download">⏱ Ausstehend (bereit)</option>
                        <option value="downloaded">⚙ Beim Techniker (geladen)</option>
                        <option value="upload_pending">⬆ Messdaten erfasst (Sync-bereit)</option>
                        <option value="synchronized">✔️ Drunter synchronisiert</option>
                      </select>
                    </div>
                  </div>

                </div>
              </div>

              {/* Grid 2: Groups & Detectors Adjustment */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-[10px] font-bold text-[#003d9b] uppercase tracking-wider font-mono">
                    2. Gruppen & Melder anpassen (Kein Einfluss auf Auslösungswerte)
                  </h4>
                  <button
                    onClick={() => {
                      const nextId = `GRP-${Date.now()}`;
                      setAdjustRows(prev => [
                        ...prev,
                        {
                          groupId: nextId,
                          groupName: `Gruppe ${prev.length + 1}`,
                          groupType: "NAM",
                          cells: [
                            { slotKey: "1", detectorType: "Normal", value: "" },
                            { slotKey: "2", detectorType: "Normal", value: "" }
                          ]
                        }
                      ]);
                      triggerToast("Neue Gruppe angelegt!", "info");
                    }}
                    className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-bold text-[10px] rounded inline-flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Plus size={11} /> Gruppe hinzufügen
                  </button>
                </div>

                <div className="space-y-4">
                  {adjustRows.length > 0 ? (
                    adjustRows.map((r, rIdx) => (
                      <div key={r.groupId} className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-xs">
                        {/* Group Header */}
                        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center">
                          <div className="flex items-center gap-2 w-full max-w-md">
                            <span className="font-mono text-[10px] font-bold text-slate-400">#{rIdx + 1}</span>
                            <input 
                              type="text"
                              value={r.groupName}
                              onChange={(e) => {
                                const val = e.target.value;
                                setAdjustRows(prev => prev.map((item, idx) => {
                                  if (idx === rIdx) {
                                    return { ...item, groupName: val };
                                  }
                                  return item;
                                }));
                              }}
                              className="px-2 py-1 border border-slate-250 rounded font-bold text-xs text-slate-800 bg-white max-w-xs focus:outline-none focus:border-[#003d9b]"
                              placeholder="z.B. Kellergeschoss..."
                            />
                            <span className="text-[9px] text-slate-400 font-mono">({r.groupId})</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setAdjustRows(prev => prev.map((item, idx) => {
                                  if (idx === rIdx) {
                                    const nextKey = (item.cells.length + 1).toString();
                                    const defaultType = systemTypeSettings[adjustSystemType]?.[0] || "-";
                                    return {
                                      ...item,
                                      cells: [...item.cells, { slotKey: nextKey, detectorType: defaultType === "-" ? "Normal" : defaultType, value: "" }]
                                    };
                                  }
                                  return item;
                                }));
                                triggerToast("Melderplatz hinzugefügt", "info");
                              }}
                              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[9px] rounded inline-flex items-center gap-0.5"
                            >
                              <Plus size={10} /> +1 Melder
                            </button>
                            
                            <button
                              onClick={() => {
                                setAdjustRows(prev => prev.filter((_, idx) => idx !== rIdx));
                                triggerToast("Gruppe gelöscht", "warning");
                              }}
                              className="p-1 text-red-650 hover:bg-red-50 rounded"
                              title="Diese Gruppe inklusive Melder löschen"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* List of Detectors in Group */}
                        <div className="p-4 bg-slate-50/40">
                          {r.cells.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                              {r.cells.map((c: any, cIdx: number) => {
                                const currentOpts = systemTypeSettings[adjustSystemType] || ["-", "Normal"];
                                return (
                                  <div key={cIdx} className="bg-white border border-slate-200 rounded p-2 text-center relative flex flex-col justify-between">
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="text-[9px] font-mono font-bold text-slate-400">M {c.slotKey}</span>
                                      <button 
                                        onClick={() => {
                                          setAdjustRows(prev => prev.map((item, idx) => {
                                            if (idx === rIdx) {
                                              return {
                                                ...item,
                                                cells: item.cells.filter((_: any, cellIdx: number) => cellIdx !== cIdx).map((cell: any, i: number) => ({
                                                  ...cell,
                                                  slotKey: (i + 1).toString()
                                                }))
                                              };
                                            }
                                            return item;
                                          }));
                                        }}
                                        className="text-slate-300 hover:text-red-600 font-bold pointer"
                                        title="Entfernen"
                                      >
                                        <X size={10} />
                                      </button>
                                    </div>

                                    {/* Detector Type Select Dropdown */}
                                    <select
                                      value={c.detectorType}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setAdjustRows(prev => prev.map((item, idx) => {
                                          if (idx === rIdx) {
                                            return {
                                              ...item,
                                              cells: item.cells.map((cell: any, cellIdx: number) => {
                                                if (cellIdx === cIdx) {
                                                  return { ...cell, detectorType: val };
                                                }
                                                return cell;
                                              })
                                            };
                                          }
                                          return item;
                                        }));
                                      }}
                                      className="w-full text-[10px] bg-slate-50 hover:bg-slate-100 border border-slate-250 py-0.5 px-1 rounded font-serif-semibold text-slate-700"
                                    >
                                      {currentOpts.map(t => (
                                        <option key={t} value={t}>{t}</option>
                                      ))}
                                    </select>

                                    {/* Measurement indicator */}
                                    <div className="mt-1.5 flex items-center justify-center">
                                      {c.value ? (
                                        <span className={`text-[8px] font-mono px-1 rounded font-bold ${
                                          c.value === "Def." || c.value?.toLowerCase() === "def"
                                            ? "bg-red-100 text-red-700"
                                            : "bg-emerald-100 text-emerald-800"
                                        }`}>
                                          Wert: {c.value}
                                        </span>
                                      ) : (
                                        <span className="text-[8px] font-mono text-slate-300">
                                          ungeprüft
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-400 text-center py-2 font-mono">Keine Melderplätze in dieser Gruppe. Nutzen Sie "+1 Melder" oben.</p>
                          )}
                        </div>

                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 border-2 border-dashed border-slate-200 text-slate-400 text-xs rounded-lg">
                      Keine Gruppen/Sektionen definiert. Nutzen Sie "Gruppe hinzufügen" oben, um Sektionen anzulegen!
                    </div>
                  )}
                </div>
              </div>

              {/* Danger Zone: deletion */}
              <div className="border border-red-200 rounded-lg p-5 bg-red-50/50 space-y-3">
                <h5 className="text-[10px] font-black text-red-850 uppercase tracking-tight font-mono flex items-center gap-1">
                  <AlertOctagon size={13} className="text-red-650" />
                  Gefahrenbereich: Datensatz löschen
                </h5>
                <p className="text-[10.5px] text-red-800 leading-normal">
                  Durch das Löschen wird dieser Wartungsvertrag mitsamt allen historischen Auslöse- und Messwerten vollständig aus der SQLite-Datenbank dieses Mandanten entfernt.
                </p>

                {showConfirmDeleteAdjust ? (
                  <div className="bg-white border-2 border-red-200 rounded-lg p-4 space-y-3 animate-fadeIn">
                    <p className="text-xs font-bold text-red-900 font-mono">
                      ⚠️ SIND SIE SICH ABSOLUT SICHER? Diese Aktion ist unwiderruflich!
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDeleteProtocol(adjustProtocolId!)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded transition-colors"
                      >
                        Ja, diesen Vertrag unwiderruflich löschen
                      </button>
                      <button
                        onClick={() => setShowConfirmDeleteAdjust(false)}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded transition-colors"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowConfirmDeleteAdjust(true)}
                    className="px-4 py-2 bg-red-50 border border-red-200 hover:bg-red-150 text-red-700 hover:text-red-800 font-extrabold text-xs rounded transition-all inline-flex items-center gap-1"
                  >
                    <Trash2 size={13} /> Wartungsvertrag vollständig löschen
                  </button>
                )}
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-150 flex justify-end gap-2 shrink-0">
              <button
                onClick={() => setIsAdjustProtocolModalOpen(false)}
                className="px-4 py-2 border border-slate-350 hover:bg-slate-100 text-slate-650 rounded font-bold text-xs transition-colors cursor-pointer"
              >
                Schließen ohne Speichern
              </button>
              
              <button
                onClick={handleSaveAdjustedProtocol}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded shadow inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                Änderungen speichern
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
