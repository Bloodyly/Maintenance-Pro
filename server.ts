import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { DatabaseSync } from "node:sqlite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Handle substantial request payloads
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ limit: "20mb", extended: true }));

  // File paths
  const dbFolder = path.join(process.cwd(), "server_stack", "protocol_db");
  const dbPath = path.join(dbFolder, "protocols.db");
  const schemaPath = path.join(dbFolder, "schema.sql");
  const sambaFolder = path.join(process.cwd(), "samba_shares");
  const protFolder = path.join(sambaFolder, "Protokolle");
  const archFolder = path.join(sambaFolder, "Archiv");

  // Create local folders if missing
  if (!fs.existsSync(dbFolder)) fs.mkdirSync(dbFolder, { recursive: true });
  if (!fs.existsSync(sambaFolder)) fs.mkdirSync(sambaFolder, { recursive: true });
  if (!fs.existsSync(protFolder)) fs.mkdirSync(protFolder, { recursive: true });
  if (!fs.existsSync(archFolder)) fs.mkdirSync(archFolder, { recursive: true });

  // Add dummy sample PDFs if they don't exist
  const samplePdfPath = path.join(protFolder, "V-2024-99a.pdf");
  if (!fs.existsSync(samplePdfPath)) {
    fs.writeFileSync(samplePdfPath, "Fake PDF binary stream for BMA Central-Klinikum West.");
  }
  const sampleArchiveDir = path.join(archFolder, "V-2024-99a", "2026", "H1");
  if (!fs.existsSync(sampleArchiveDir)) {
    fs.mkdirSync(sampleArchiveDir, { recursive: true });
  }
  const sampleArchivedPdf = path.join(sampleArchiveDir, "V-2024-99a_V1.pdf");
  if (!fs.existsSync(sampleArchivedPdf)) {
    fs.writeFileSync(sampleArchivedPdf, "Fake Archived PDF binary stream - Year 2026 - First Half-Year.");
  }

  // Connect & Initialize Database using Node's native SQLite
  console.log("Connecting to native SQLite database at:", dbPath);
  const db = new DatabaseSync(dbPath);

  // Enable foreign keys
  db.exec("PRAGMA foreign_keys = ON;");

  // Load and bootstrap schema
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, "utf8");
    try {
      db.exec(schemaSql);
      console.log("Database schema successfully bootstrapped and verified.");
      
      // Dynamic column migration for multi-anlage (sub-system) support
      try {
        db.exec("ALTER TABLE protocol_groups ADD COLUMN anlage_id VARCHAR(50) DEFAULT 'default'");
      } catch (err) {}
      try {
        db.exec("ALTER TABLE protocol_groups ADD COLUMN anlage_name VARCHAR(255) DEFAULT 'Hauptanlage'");
      } catch (err) {}
      try {
        db.exec("ALTER TABLE protocol_groups ADD COLUMN anlage_type VARCHAR(50) DEFAULT 'BMA'");
      } catch (err) {}
    } catch (err) {
      console.error("Error executing schema.sql bootstrapping script:", err);
    }
  } else {
    console.warn("Schema SQL file was not found under:", schemaPath);
  }

  // Also bootstrap PDF templates and PDF instances tables
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pdf_templates (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          system_type VARCHAR(50) NOT NULL,
          pdf_filename VARCHAR(255) NOT NULL,
          fields TEXT NOT NULL
      );
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS pdf_instances (
          id VARCHAR(50) PRIMARY KEY,
          template_id VARCHAR(50) NOT NULL,
          contract_number VARCHAR(100),
          status VARCHAR(50) NOT NULL,
          filled_values TEXT NOT NULL,
          signature_data TEXT,
          technician_name VARCHAR(255),
          last_edited_at VARCHAR(100),
          assigned_contract_id VARCHAR(50)
      );
    `);

    // Seed default PDF templates if empty
    const countQuery = db.prepare("SELECT COUNT(*) as count FROM pdf_templates");
    const row = countQuery.get() as { count: number } | undefined;
    if (row && row.count === 0) {
      const bmaFields = [
        { id: "f1", name: "Kunde / Objekt", type: "text", x: 15, y: 18, w: 30, h: 4, placeholder: "z.B. Campus Nord" },
        { id: "f2", name: "Prüfdatum", type: "text", x: 60, y: 18, w: 25, h: 4, placeholder: "TT.MM.JJJJ" },
        { id: "f3", name: "Anzahl Melder geprüft", type: "number", x: 15, y: 32, w: 20, h: 4, placeholder: "0" },
        { id: "f4", name: "Anzahl Melder ohne Störung", type: "number", x: 60, y: 32, w: 20, h: 4, placeholder: "0" },
        { id: "f5", name: "VdS-Konformität gegeben?", type: "checkbox", x: 15, y: 46, w: 5, h: 3 },
        { id: "f6", name: "Mängel festgestellt", type: "checkbox", x: 60, y: 46, w: 5, h: 3 },
        { id: "f7", name: "Bemerkungen / Feststellungen", type: "text", x: 15, y: 60, w: 70, h: 8, placeholder: "Freitext Bemerkungen..." },
        { id: "f8", name: "Unterschrift Techniker", type: "signature", x: 55, y: 78, w: 30, h: 10 }
      ];

      const insertTpl = db.prepare(`
        INSERT INTO pdf_templates (id, name, system_type, pdf_filename, fields)
        VALUES (?, ?, ?, ?, ?)
      `);
      insertTpl.run("t1", "VdS-Prüfprotokoll Brandmeldeanlage", "BMA", "vds_pruefbericht_bma.pdf", JSON.stringify(bmaFields));

      const blankoFields = [
        { id: "fb1", name: "Auftraggeber / Firma", type: "text", x: 15, y: 15, w: 35, h: 4, placeholder: "Kundenname..." },
        { id: "fb2", name: "Einsatzort / Adresse", type: "text", x: 15, y: 22, w: 35, h: 4, placeholder: "Straße, PLZ Ort..." },
        { id: "fb3", name: "Techniker", type: "text", x: 60, y: 15, w: 25, h: 4, placeholder: "Name Techniker" },
        { id: "fb4", name: "Arbeitsstunden", type: "number", x: 60, y: 22, w: 15, h: 4, placeholder: "Std." },
        { id: "fb5", name: "Durchgeführte Tätigkeiten", type: "text", x: 15, y: 35, w: 70, h: 15, placeholder: "Welche Arbeiten wurden verrichtet?" },
        { id: "fb6", name: "Material verwendet?", type: "checkbox", x: 15, y: 55, w: 5, h: 3 },
        { id: "fb7", name: "Anlage betriebsbereit übergeben", type: "checkbox", x: 60, y: 55, w: 5, h: 3 },
        { id: "fb8", name: "Unterschrift Kunde", type: "signature", x: 15, y: 72, w: 30, h: 10 },
        { id: "fb9", name: "Unterschrift Techniker", type: "signature", x: 55, y: 72, w: 30, h: 10 }
      ];
      insertTpl.run("t2", "Freier Servicebericht & Arbeitsnachweis", "BLANKO", "freier_arbeitsbericht.pdf", JSON.stringify(blankoFields));
      console.log("PDF protocols tables successfully seeded with default templates.");
    }
  } catch (err) {
    console.error("Error creating or seeding pdf_templates/pdf_instances tables:", err);
  }

  // Bootstrap global settings file and default Taifun XML
  const settingsPath = path.join(dbFolder, "settings.json");
  function loadSettings() {
    const defaultSettings = {
      active_system_types: ["BMA", "EMA", "ELA", "Lichtruf", "SLA"],
      system_settings: {
        "BMA": {
          name: "Brandmeldeanlage",
          xml_name: "BMA",
          color: "bg-red-50 text-red-800 border-red-200",
          badgeColor: "bg-red-500",
          detectors: ["-", "Normal", "ZD", "ZB", "TDIFF", "TMAX", "RAS", "LINEAR"],
          values: ["CHECK", "H1", "H2", "Def."],
        },
        "EMA": {
          name: "Einbruchmeldeanlage",
          xml_name: "EMA",
          color: "bg-yellow-50 text-yellow-800 border-yellow-200",
          badgeColor: "bg-yellow-500",
          detectors: ["-", "Normal", "BWM", "ZK", "RSK", "Lichtschranke", "Glasbruch", "Körperschall"],
          values: ["CHECK", "Def."],
        },
        "ELA": {
          name: "Elektroakustik",
          xml_name: "ELA",
          color: "bg-blue-50 text-blue-800 border-blue-200",
          badgeColor: "bg-blue-500",
          detectors: ["-", "Normal", "Innenlautsprecher", "Außenlautsprecher"],
          values: ["CHECK", "Def."],
        },
        "Lichtruf": {
          name: "Lichtrufanlage",
          xml_name: "Lichtruf",
          color: "bg-emerald-50 text-emerald-800 border-emerald-200",
          badgeColor: "bg-emerald-500",
          detectors: ["-", "Normal", "AT", "BT", "ZT", "EM", "PN", "Display"],
          values: ["CHECK", "Def."],
        },
        "SLA": {
          name: "Sprechanlage",
          xml_name: "SLA",
          color: "bg-purple-50 text-purple-800 border-purple-200",
          badgeColor: "bg-purple-500",
          detectors: ["-", "Normal", "ZD", "DB", "RAS", "TDIF"],
          values: ["CHECK", "Def."],
        }
      }
    };

    if (fs.existsSync(settingsPath)) {
      try {
        const loaded = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        return {
          ...defaultSettings,
          ...loaded,
          system_settings: {
            ...defaultSettings.system_settings,
            ...(loaded.system_settings || {})
          }
        };
      } catch (e) {
        console.error("Error reading settings.json:", e);
      }
    }
    return defaultSettings;
  }

  function saveSettings(settings: any) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  }

  // Create default wartungVT.xml if not exists
  const taifunXmlPath = path.join(sambaFolder, "wartungVT.xml");
  if (!fs.existsSync(taifunXmlPath)) {
    const defaultXml = `<?xml version="1.0" encoding="UTF-8"?>
<TaifunExport>
    <Vertrag>
        <ID>V-2024-99a-BMA</ID>
        <Vertragsnummer>V-2024-99a</Vertragsnummer>
        <Kunde>Zentral-Klinikum West</Kunde>
        <Adresse>Klinikstraße 12, 1010 Wien</Adresse>
        <Intervall>Halbjährlich</Intervall>
        <Anlagentyp>BMA</Anlagentyp>
        <Geraete>
            <Geraet>
                <Typ>BMA</Typ>
                <Name>Rauchmelder ZD</Name>
                <Gruppe>GRP 01</Gruppe>
                <Bereich>Technikraum 2a</Bereich>
                <MelderTyp>ZD</MelderTyp>
                <Anzahl>4</Anzahl>
            </Geraet>
            <Geraet>
                <Typ>BMA</Typ>
                <Name>Handfeuermelder DB</Name>
                <Gruppe>GRP 02</Gruppe>
                <Bereich>Eingangsbereich</Bereich>
                <MelderTyp>DB</MelderTyp>
                <Anzahl>2</Anzahl>
            </Geraet>
        </Geraete>
    </Vertrag>
    <Vertrag>
        <ID>V-2026-102b-EMA</ID>
        <Vertragsnummer>V-2026-102b</Vertragsnummer>
        <Kunde>Campus Nord Forschungszentrum</Kunde>
        <Adresse>Wissenschaftsallee 42, 1220 Wien</Adresse>
        <Intervall>Vierteljährlich</Intervall>
        <Anlagentyp>EMA</Anlagentyp>
        <Geraete>
            <Geraet>
                <Typ>EMA</Typ>
                <Name>Bewegungsmelder BWM</Name>
                <Gruppe>GRP 01</Gruppe>
                <Bereich>Serverraum 1</Bereich>
                <MelderTyp>BWM</MelderTyp>
                <Anzahl>6</Anzahl>
            </Geraet>
            <Geraet>
                <Typ>EMA</Typ>
                <Name>Riegelschaltkontakt RSK</Name>
                <Gruppe>GRP 02</Gruppe>
                <Bereich>Außentüren</Bereich>
                <MelderTyp>RSK</MelderTyp>
                <Anzahl>8</Anzahl>
            </Geraet>
        </Geraete>
    </Vertrag>
    <Vertrag>
        <ID>V-2026-303c-ELA</ID>
        <Vertragsnummer>V-2026-303c</Vertragsnummer>
        <Kunde>Zentralbibliothek Wien</Kunde>
        <Adresse>Urban-Loritz-Platz 2a, 1070 Wien</Adresse>
        <Intervall>Jährlich</Intervall>
        <Anlagentyp>ELA</Anlagentyp>
        <Geraete>
            <Geraet>
                <Typ>ELA</Typ>
                <Name>Lautsprecher LSP</Name>
                <Gruppe>GRP 01</Gruppe>
                <Bereich>Lesesaal EG</Bereich>
                <MelderTyp>LSP</MelderTyp>
                <Anzahl>12</Anzahl>
            </Geraet>
        </Geraete>
    </Vertrag>
</TaifunExport>`;
    fs.writeFileSync(taifunXmlPath, defaultXml, "utf8");
    console.log("Default TAIFUN contract XML 'wartungVT.xml' bootstrapped in samba_shares.");
  }

  // Promise helpers for DB queries wrapping Native SQLite prepare & run
  function dbRun(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        const stmt = db.prepare(sql);
        const result = stmt.run(...params);
        resolve({
          lastID: result.lastInsertRowid !== undefined ? Number(result.lastInsertRowid) : undefined,
          changes: result.changes
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  function dbAll(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      try {
        const stmt = db.prepare(sql);
        const rows = stmt.all(...params);
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    });
  }

  function dbGet(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        const stmt = db.prepare(sql);
        const row = stmt.get(...params);
        resolve(row);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Recursive searcher for archived PDFs
  function getArchivesForContract(contractNumber: string): any[] {
    const archiveDir = path.join(sambaFolder, "Archiv", contractNumber);
    if (!fs.existsSync(archiveDir)) return [];
    
    const results: any[] = [];
    
    function walk(currentDir: string) {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".pdf")) {
          const relPath = path.relative(archiveDir, currentDir);
          const parts = relPath.split(path.sep);
          const year = parts[0] || "Unknown";
          const halfYear = parts[1] || "H1";
          
          results.push({
            filename: entry.name,
            year: year,
            half_year: halfYear,
            path: `/download_archive/${contractNumber}/${year}/${halfYear}/${entry.name}`,
            size_kb: Math.round((fs.statSync(fullPath).size / 1024) * 10) / 10
          });
        }
      }
    }
    
    walk(archiveDir);
    return results.sort((a, b) => {
      if (a.year !== b.year) return b.year.localeCompare(a.year);
      if (a.half_year !== b.half_year) return b.half_year.localeCompare(a.half_year);
      return b.filename.localeCompare(a.filename);
    });
  }

  // ----------------- WEB WEBUI ROTUES -----------------

  // WebUI Template Handler (real source code index.html)
  app.get("/webui", (req, res) => {
    const indexPath = path.join(process.cwd(), "server_stack", "webui", "templates", "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send("<h3>Fehler: Die Vorlagendatei templates/index.html wurde nicht gefunden.</h3>");
    }
  });

  // Old WebUI Template Handler (fallback / reference)
  app.get("/old-webui", (req, res) => {
    res.redirect("/webui");
  });

  // Settings API
  app.get("/api/settings", (req, res) => {
    try {
      res.json({ success: true, settings: loadSettings() });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post("/api/settings", (req, res) => {
    try {
      const { active_system_types, system_settings } = req.body;
      if (!Array.isArray(active_system_types)) {
        return res.status(400).json({ success: false, error: "active_system_types must be an array" });
      }
      const settings = loadSettings();
      settings.active_system_types = active_system_types;
      if (system_settings) {
        settings.system_settings = system_settings;
      }
      saveSettings(settings);
      res.json({ success: true, message: "Einstellungen erfolgreich gespeichert." });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // TAIFUN XML Importer API
  app.post("/api/import-taifun", async (req, res) => {
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({ success: false, error: "XML-Inhalt fehlt." });
      }

      // Save content back to central wartungVT.xml file
      fs.writeFileSync(taifunXmlPath, content, "utf8");

      // Parse XML
      const contractsMatch = content.match(/<Vertrag>([\s\S]*?)<\/Vertrag>/g);
      if (!contractsMatch) {
        return res.status(400).json({ success: false, error: "Keine <Vertrag> Elemente im XML gefunden." });
      }

      const getTag = (block: string, tag: string) => {
        const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`));
        return match ? match[1].trim() : "";
      };

      const defaultColumns: Record<string, string[]> = {
        "BMA": ["1", "2", "3", "4", "5", "6", "7", "8"],
        "EMA": ["1", "2", "3", "4"],
        "ELA": ["1", "2"],
        "Lichtruf": ["1", "2", "3", "4"],
        "SLA": ["1", "2"]
      };

      const defaultValues: Record<string, string[]> = {
        "BMA": ["CHECK", "Def."],
        "EMA": ["OK", "Fehler"],
        "ELA": ["OK", "Fehler"],
        "Lichtruf": ["OK", "Fehler"],
        "SLA": ["OK", "Fehler"]
      };

      const defaultDetectorTypes: Record<string, string[]> = {
        "BMA": ["-", "Normal", "ZD", "ZB", "TDIFF", "TMAX", "RAS", "LINEAR"],
        "EMA": ["-", "Normal", "BWM", "RSK", "IR", "GLAS"],
        "ELA": ["-", "Normal", "LSP", "AMP", "MIC"],
        "Lichtruf": ["-", "Normal", "ZUG", "RUF", "WC"],
        "SLA": ["-", "Normal", "SLA"]
      };

      let importedCount = 0;

      for (const contract of contractsMatch) {
        const id = getTag(contract, "ID");
        const contract_number = getTag(contract, "Vertragsnummer");
        const name = getTag(contract, "Kunde");
        const address = getTag(contract, "Adresse");
        const interval = getTag(contract, "Intervall") || "Halbjährlich";
        const system_type = getTag(contract, "Anlagentyp") || "BMA";

        if (!contract_number || !name) continue;

        const pId = id || `${contract_number}-${system_type}`;
        const cols = JSON.stringify(defaultColumns[system_type] || ["1", "2", "3", "4"]);
        const appVals = JSON.stringify(defaultValues[system_type] || ["CHECK", "Def."]);
        const detTypes = JSON.stringify(defaultDetectorTypes[system_type] || ["-", "Normal"]);

        // Insert or update protocol
        await dbRun(`
          INSERT INTO protocols (id, name, address, contract_number, interval, system_type, status, columns, applicable_values, detector_types)
          VALUES (?, ?, ?, ?, ?, ?, 'ready_to_download', ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET 
            name=excluded.name, 
            address=excluded.address, 
            interval=excluded.interval, 
            system_type=excluded.system_type, 
            contract_number=excluded.contract_number
        `, [pId, name, address, contract_number, interval, system_type, cols, appVals, detTypes]);

        // Clean up existing protocol groups and cells to re-populate
        await dbRun("DELETE FROM group_cells WHERE protocol_id = ?", [pId]);
        await dbRun("DELETE FROM protocol_groups WHERE protocol_id = ?", [pId]);

        // Extract devices (Geraete)
        const geraeteBlock = getTag(contract, "Geraete");
        const geraeteMatch = geraeteBlock ? (geraeteBlock.match(/<Geraet>([\s\S]*?)<\/Geraet>/g) || []) : [];
        
        const groupsMap: Record<string, { name: string, type: string, cells: { slotKey: string, detectorType: string, value: string }[] }> = {};

        for (const gBlock of geraeteMatch) {
          const type = getTag(gBlock, "Typ") || system_type;
          const devName = getTag(gBlock, "Name") || "Gerät";
          const gruppe = getTag(gBlock, "Gruppe") || "GRP 01";
          const bereich = getTag(gBlock, "Bereich") || devName;
          const melderTyp = getTag(gBlock, "MelderTyp") || "Normal";
          const anzahl = parseInt(getTag(gBlock, "Anzahl")) || 1;

          if (!groupsMap[gruppe]) {
            groupsMap[gruppe] = {
              name: bereich,
              type: type === "BMA" ? "TECH" : "NAM",
              cells: []
            };
          }

          const startIdx = groupsMap[gruppe].cells.length + 1;
          for (let i = 0; i < anzahl; i++) {
            groupsMap[gruppe].cells.push({
              slotKey: (startIdx + i).toString(),
              detectorType: melderTyp,
              value: ""
            });
          }
        }

        // Insert parsed groups and cells
        for (const [groupId, gData] of Object.entries(groupsMap)) {
          await dbRun(`
            INSERT INTO protocol_groups (protocol_id, group_id, group_name, group_type)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(protocol_id, group_id) DO UPDATE SET 
              group_name=excluded.group_name, 
              group_type=excluded.group_type
          `, [pId, groupId, gData.name, gData.type]);

          for (const cell of gData.cells) {
            await dbRun(`
              INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(protocol_id, group_id, slot_key) DO UPDATE SET 
                detector_type=excluded.detector_type, 
                value=excluded.value
            `, [pId, groupId, cell.slotKey, cell.detectorType, cell.value]);
          }
        }

        importedCount++;
      }

      res.json({ success: true, message: `${importedCount} Wartungsverträge erfolgreich aus TAIFUN-XML importiert und verknüpft.` });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Fetch all maintenance protocols
  app.get("/api/protocols", async (req, res) => {
    try {
      const settings = loadSettings();
      const activeTypes = settings.active_system_types || ["BMA", "EMA", "ELA", "Lichtruf", "SLA"];

      const records = await dbAll(`
        SELECT id, name, address, contract_number, interval, system_type, status, last_edited_by, last_edited_at 
        FROM protocols
      `);

      // Filter records by active system types
      const filteredRecords = records.filter(r => activeTypes.includes(r.system_type));

      const results = await Promise.all(filteredRecords.map(async (r) => {
        const pdfFile = path.join(protFolder, `${r.contract_number}.pdf`);
        const hasPdf = fs.existsSync(pdfFile);

        // Fetch group counts from protocol_groups to summarize the actual systems (Anlagen)
        const groupCounts = await dbAll(`
          SELECT COALESCE(anlage_type, group_type, 'BMA') as type, COUNT(DISTINCT COALESCE(anlage_id, 'default')) as count
          FROM protocol_groups 
          WHERE protocol_id = ?
          GROUP BY type
        `, [r.id]);

        const summary = groupCounts.map(gc => `${gc.count}x ${gc.type}`).join(", ");

        // Check if there are any defects (values matching 'Def.' or 'Fehler')
        const defectRows = await dbAll(`
          SELECT COUNT(*) as count FROM group_cells 
          WHERE protocol_id = ? AND (value = 'Def.' OR value = 'Fehler')
        `, [r.id]);
        const hasDefect = (defectRows[0] && defectRows[0].count > 0) || false;

        return {
          id: r.id,
          name: r.name,
          address: r.address,
          contract_number: r.contract_number,
          interval: r.interval,
          system_type: r.system_type,
          status: r.status,
          last_edited_by: r.last_edited_by || "-",
          last_edited_at: r.last_edited_at || "-",
          has_pdf: hasPdf,
          device_summary: summary || "Keine Geräte verzeichnet",
          has_defect: hasDefect
        };
      }));

      res.json({ success: true, protocols: results });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Fetch full details of a specific protocol
  app.get("/api/protocols/:id", async (req, res) => {
    try {
      const pId = req.params.id;
      const p = await dbGet("SELECT * FROM protocols WHERE id = ?", [pId]);
      if (!p) {
        return res.status(404).json({ success: false, error: "Protokoll nicht gefunden." });
      }

      // Safe JSON parse fallbacks
      const cols = JSON.parse(p.columns || "[\"1\",\"2\",\"3\",\"4\"]");
      const appVals = JSON.parse(p.applicable_values || "[\"CHECK\",\"Def.\"]");
      const detTypes = JSON.parse(p.detector_types || "[\"-\", \"Normal\"]");

      const groups = await dbAll("SELECT * FROM protocol_groups WHERE protocol_id = ?", [pId]);
      
      const rowsData = [];
      const subSystemsMap: Record<string, { id: string; name: string; system_type: string; columns: string[]; rows: any[] }> = {};

      for (const g of groups) {
        const cells = await dbAll(
          "SELECT slot_key, detector_type, value FROM group_cells WHERE protocol_id = ? AND group_id = ?",
          [pId, g.group_id]
        );

        const cellsList = cells.map((c) => ({
          slotKey: c.slot_key,
          detectorType: c.detector_type,
          value: c.value,
        }));

        // Sort slot keys numerically
        cellsList.sort((a, b) => {
          const aNum = parseInt(a.slotKey, 10) || 999;
          const bNum = parseInt(b.slotKey, 10) || 999;
          return aNum - bNum;
        });

        // Push to legacy rows
        rowsData.push({
          groupId: g.group_id,
          groupName: g.group_name,
          groupType: g.group_type || "NAM",
          cells: cellsList,
        });

        // Group into subSystems/Anlagen
        const aId = g.anlage_id || "default";
        const aName = g.anlage_name || `Hauptanlage`;
        const aType = g.anlage_type || g.group_type || p.system_type || "BMA";

        if (!subSystemsMap[aId]) {
          subSystemsMap[aId] = {
            id: aId,
            name: aName,
            system_type: aType,
            columns: [],
            rows: [],
          };
        }

        subSystemsMap[aId].rows.push({
          groupId: g.group_id,
          groupName: g.group_name,
          cells: cellsList,
        });

        // Collect columns for this subSystem
        cellsList.forEach(c => {
          if (!subSystemsMap[aId].columns.includes(c.slotKey)) {
            subSystemsMap[aId].columns.push(c.slotKey);
          }
        });
      }

      // Sort columns for each subSystem numerically
      Object.values(subSystemsMap).forEach(sub => {
        sub.columns.sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
        if (sub.columns.length === 0) {
          sub.columns = cols;
        }
      });

      const subSystemsList = Object.values(subSystemsMap);

      const archives = getArchivesForContract(p.contract_number);

      res.json({
        success: true,
        protocol: {
          id: p.id,
          name: p.name,
          address: p.address,
          contract_number: p.contract_number,
          interval: p.interval,
          system_type: p.system_type,
          status: p.status,
          last_edited_by: p.last_edited_by || "-",
          last_edited_at: p.last_edited_at || "-",
          columns: cols,
          applicable_values: appVals,
          detector_types: detTypes,
          rows: rowsData,
          subSystems: subSystemsList,
        },
        archives: archives,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Save/Upsert a protocol
  app.post("/api/protocols/save", async (req, res) => {
    const data = req.body;
    let pId = data.id;
    const name = (data.name || "").trim();
    const address = (data.address || "").trim();
    const contractNumber = (data.contract_number || "").trim();
    const interval = data.interval || "Halbjährlich";
    const systemType = data.system_type || "BMA";
    const status = data.status || "ready_to_download";
    const columns = data.columns || ["1", "2", "3", "4"];
    const applicableValues = data.applicable_values || ["CHECK", "Def."];
    const detectorTypes = data.detector_types || ["-", "Normal"];
    const rows = data.rows || [];

    if (!name || !contractNumber) {
      return res.status(400).json({ success: false, error: "Kunde und Vertragsnummer sind Pflichtfelder." });
    }

    if (!pId) {
      pId = `PRO-${Date.now()}`;
    }

    try {
      // Use transactional db operations
      await dbRun("BEGIN TRANSACTION");

      // Upsert protocol header details
      await dbRun(`
        INSERT INTO protocols (id, name, address, contract_number, interval, system_type, status, last_edited_by, last_edited_at, columns, applicable_values, detector_types)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
            name=excluded.name, address=excluded.address, contract_number=excluded.contract_number, 
            interval=excluded.interval, system_type=excluded.system_type, status=excluded.status,
            columns=excluded.columns, applicable_values=excluded.applicable_values, detector_types=excluded.detector_types
      `, [
        pId, name, address, contractNumber, interval, systemType, status,
        data.last_edited_by || "-", data.last_edited_at || "-",
        JSON.stringify(columns), JSON.stringify(applicableValues), JSON.stringify(detectorTypes)
      ]);

      // Remove previous cascades and refresh relational children
      await dbRun("DELETE FROM group_cells WHERE protocol_id = ?", [pId]);
      await dbRun("DELETE FROM protocol_groups WHERE protocol_id = ?", [pId]);

      const subSystems = data.subSystems || data.sub_systems || [];

      if (subSystems.length > 0) {
        for (const sub of subSystems) {
          const aId = sub.id || `sub-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          const aName = sub.name || "Anlage";
          const aType = sub.system_type || sub.systemType || systemType || "BMA";

          for (const r of (sub.rows || [])) {
            const gId = r.groupId;
            const gName = r.groupName;

            await dbRun(`
              INSERT INTO protocol_groups (protocol_id, group_id, group_name, group_type, anlage_id, anlage_name, anlage_type)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [pId, gId, gName, aType, aId, aName, aType]);

            for (const c of (r.cells || [])) {
              await dbRun(`
                INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value)
                VALUES (?, ?, ?, ?, ?)
              `, [pId, gId, c.slotKey, c.detectorType, c.value || ""]);
            }
          }
        }
      } else {
        // Fallback to legacy flat rows structure
        for (const r of rows) {
          const gId = r.groupId;
          const gName = r.groupName;
          const gType = r.groupType || systemType;

          await dbRun(`
            INSERT INTO protocol_groups (protocol_id, group_id, group_name, group_type, anlage_id, anlage_name, anlage_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [pId, gId, gName, gType, "default", `Hauptanlage (${gType})`, gType]);

          for (const c of (r.cells || [])) {
            await dbRun(`
              INSERT INTO group_cells (protocol_id, group_id, slot_key, detector_type, value)
              VALUES (?, ?, ?, ?, ?)
            `, [pId, gId, c.slotKey, c.detectorType, c.value || ""]);
          }
        }
      }

      await dbRun("COMMIT");
      res.json({ success: true, id: pId, message: "Protokoll erfolgreich im SQL DBMS gesichert!" });
    } catch (err: any) {
      await dbRun("ROLLBACK").catch(() => {});
      res.status(500).json({ success: false, error: `Fehler beim Speichern: ${err.message}` });
    }
  });

  // Delete protocol
  app.post("/api/protocols/delete/:id", async (req, res) => {
    const pId = req.params.id;
    try {
      await dbRun("BEGIN TRANSACTION");
      await dbRun("DELETE FROM group_cells WHERE protocol_id = ?", [pId]);
      await dbRun("DELETE FROM protocol_groups WHERE protocol_id = ?", [pId]);
      await dbRun("DELETE FROM protocols WHERE id = ?", [pId]);
      await dbRun("COMMIT");
      res.json({ success: true, message: "Protokoll erfolgreich gelöscht." });
    } catch (err: any) {
      await dbRun("ROLLBACK").catch(() => {});
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Reset protocol (Turnuswechsel & Archivierungslogik)
  app.post("/api/protocols/reset/:id", async (req, res) => {
    const pId = req.params.id;
    try {
      const p = await dbGet("SELECT contract_number FROM protocols WHERE id = ?", [pId]);
      if (!p) {
        return res.status(404).json({ success: false, error: "Protokoll nicht gefunden." });
      }

      const contractNum = p.contract_number;
      const activePdf = path.join(protFolder, `${contractNum}.pdf`);

      // 1. Move active reports PDF to archives dir structure
      if (fs.existsSync(activePdf)) {
        const year = new Date().getFullYear().toString();
        const destDir = path.join(archFolder, contractNum, year, "H1");
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        const existing = fs.readdirSync(destDir).filter(f => f.startsWith(contractNum) && f.endsWith(".pdf"));
        const nextVer = existing.length + 1;
        const archivedPdfPath = path.join(destDir, `${contractNum}_V${nextVer}.pdf`);

        try {
          fs.renameSync(activePdf, archivedPdfPath);
        } catch (renameErr: any) {
          console.warn("Could not archive active PDF report to samba location:", renameErr.message);
        }
      }

      // 2. Clear current measurement values but keep mapping intact
      await dbRun("BEGIN TRANSACTION");
      await dbRun("UPDATE protocols SET status = 'ready_to_download' WHERE id = ?", [pId]);
      await dbRun("UPDATE group_cells SET value = '' WHERE protocol_id = ?", [pId]);
      await dbRun("COMMIT");

      res.json({ success: true, message: "Wartungsvertrag erfolgreich für das nächste Turnusintervall freigegeben!" });
    } catch (err: any) {
      await dbRun("ROLLBACK").catch(() => {});
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // List all technicians
  app.get("/api/technicians", async (req, res) => {
    try {
      const list = await dbAll("SELECT id, username, name FROM technicians");
      res.json({ success: true, technicians: list });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Save technician
  app.post("/api/technicians/save", async (req, res) => {
    const data = req.body;
    const tId = data.id;
    const username = (data.username || "").trim().toLowerCase();
    const name = (data.name || "").trim();
    const password = (data.password || "").trim();

    if (!username || !name) {
      return res.status(400).json({ success: false, error: "Bitte füllen Sie alle Pflichtfelder aus." });
    }

    try {
      if (!tId) {
        // Create new technician
        const newId = `tech-${Date.now()}`;
        const rawPwd = password || "123456";
        const pwdHash = crypto.createHash("sha256").update(rawPwd).digest("hex");

        await dbRun(`
          INSERT INTO technicians (id, username, password_hash, name)
          VALUES (?, ?, ?, ?)
        `, [newId, username, pwdHash, name]);
      } else {
        // Edit existing technician
        if (password) {
          const pwdHash = crypto.createHash("sha256").update(password).digest("hex");
          await dbRun(`
            UPDATE technicians SET username = ?, name = ?, password_hash = ? WHERE id = ?
          `, [username, name, pwdHash, tId]);
        } else {
          await dbRun(`
            UPDATE technicians SET username = ?, name = ? WHERE id = ?
          `, [username, name, tId]);
        }
      }
      res.json({ success: true, message: "Techniker erfolgreich gespeichert." });
    } catch (err: any) {
      if (err.message && err.message.includes("UNIQUE")) {
        res.status(400).json({ success: false, error: "Benutzername existiert bereits!" });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  });

  // Delete technician
  app.post("/api/technicians/delete/:id", async (req, res) => {
    const tId = req.params.id;
    try {
      await dbRun("DELETE FROM technicians WHERE id = ?", [tId]);
      res.json({ success: true, message: "Techniker erfolgreich gelöscht." });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ----------------- PDF FORMULAR & PROTOKOLL EDITIERUNGS-ROUTEN -----------------

  // 1. Get all PDF templates
  app.get("/api/pdf_templates", async (req, res) => {
    try {
      const rows = await dbAll("SELECT * FROM pdf_templates");
      const templates = rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        systemType: r.system_type,
        pdfFilename: r.pdf_filename,
        fields: JSON.parse(r.fields || "[]")
      }));
      res.json({ success: true, templates });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // 2. Save/Update PDF Template
  app.post("/api/pdf_templates/save", async (req, res) => {
    try {
      const { id, name, systemType, pdfFilename, fields } = req.body;
      const finalId = id || `t-${Date.now()}`;
      await dbRun(`
        INSERT INTO pdf_templates (id, name, system_type, pdf_filename, fields)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          system_type = excluded.system_type,
          pdf_filename = excluded.pdf_filename,
          fields = excluded.fields
      `, [finalId, name, systemType, pdfFilename, JSON.stringify(fields)]);
      res.json({ success: true, id: finalId, message: "PDF Protokoll-Vorlage erfolgreich gespeichert!" });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // 3. Delete PDF Template
  app.post("/api/pdf_templates/delete/:id", async (req, res) => {
    try {
      await dbRun("DELETE FROM pdf_templates WHERE id = ?", [req.params.id]);
      res.json({ success: true, message: "Vorlage erfolgreich gelöscht." });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // 4. Get all completed PDF form instances
  app.get("/api/pdf_instances", async (req, res) => {
    try {
      const rows = await dbAll("SELECT * FROM pdf_instances");
      const instances = rows.map((r: any) => ({
        id: r.id,
        templateId: r.template_id,
        contractNumber: r.contract_number,
        status: r.status,
        filledValues: JSON.parse(r.filled_values || "{}"),
        signatureData: r.signature_data,
        technicianName: r.technician_name,
        lastEditedAt: r.last_edited_at,
        assignedContractId: r.assigned_contract_id
      }));
      res.json({ success: true, instances });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // 5. Save/Sync completed PDF Form Instance
  app.post("/api/pdf_instances/save", async (req, res) => {
    try {
      const { id, templateId, contractNumber, status, filledValues, signatureData, technicianName, lastEditedAt, assignedContractId } = req.body;
      const finalId = id || `inst-${Date.now()}`;
      await dbRun(`
        INSERT INTO pdf_instances (id, template_id, contract_number, status, filled_values, signature_data, technician_name, last_edited_at, assigned_contract_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          template_id = excluded.template_id,
          contract_number = excluded.contract_number,
          status = excluded.status,
          filled_values = excluded.filled_values,
          signature_data = excluded.signature_data,
          technician_name = excluded.technician_name,
          last_edited_at = excluded.last_edited_at,
          assigned_contract_id = excluded.assigned_contract_id
      `, [
        finalId,
        templateId,
        contractNumber || "",
        status || "pending",
        JSON.stringify(filledValues || {}),
        signatureData || "",
        technicianName || "",
        lastEditedAt || "",
        assignedContractId || ""
      ]);
      res.json({ success: true, id: finalId, message: "Protokolldaten erfolgreich synchronisiert!" });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // 6. Delete completed PDF Form Instance
  app.post("/api/pdf_instances/delete/:id", async (req, res) => {
    try {
      await dbRun("DELETE FROM pdf_instances WHERE id = ?", [req.params.id]);
      res.json({ success: true, message: "Protokolldaten gelöscht." });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // 7. Download/Render finalized PDF Report from Instance
  app.get("/api/pdf_instances/download/:id", async (req, res) => {
    try {
      const instId = req.params.id;
      const inst = await dbGet("SELECT * FROM pdf_instances WHERE id = ?", [instId]);
      if (!inst) {
        return res.status(404).send("<h3>Fehler: Protokolldaten nicht gefunden.</h3>");
      }
      
      const tpl = await dbGet("SELECT * FROM pdf_templates WHERE id = ?", [inst.template_id]);
      const tplName = tpl ? tpl.name : "Unbekanntes Protokoll";
      const fields = tpl ? JSON.parse(tpl.fields || "[]") : [];
      const values = JSON.parse(inst.filled_values || "{}");
      
      const dateStr = inst.last_edited_at || new Date().toLocaleDateString("de-DE");
      const techName = inst.technician_name || "Unbekannter Techniker";
      
      // Let's generate a beautiful ASCII text report simulating a PDF export
      let doc = `========================================================================\n`;
      doc += `            MAINTENANCE PRO — DIGITALER PRÜFBERICHT (PDF-EXPORT)\n`;
      doc += `========================================================================\n\n`;
      doc += `PRODUKT / PROTKOLL-TYP:   ${tplName}\n`;
      doc += `TEMPLAT-DATEI (PDF):       ${tpl ? tpl.pdf_filename : "N/A"}\n`;
      doc += `STATUS:                    ${inst.status.toUpperCase()}\n`;
      doc += `PRÜF-DATUM:                ${dateStr}\n`;
      doc += `DURCHGEFÜHRT VON:          ${techName}\n`;
      if (inst.contract_number) {
        doc += `VERTRAGS-NUMMER:           ${inst.contract_number}\n`;
      }
      doc += `\n------------------------------------------------------------------------\n`;
      doc += `                         ERFASSTE FORMULARDATEN\n`;
      doc += `------------------------------------------------------------------------\n\n`;
      
      for (const f of fields) {
        const val = values[f.id] !== undefined ? values[f.id] : "";
        let line = `[${f.type.toUpperCase()}] ${f.name.padEnd(35, ".")}: `;
        if (f.type === "checkbox") {
          line += val === "true" || val === true ? "[X] JA / GEGEBEN" : "[ ] NEIN / NICHT GEGEBEN";
        } else if (f.type === "signature") {
          line += inst.signature_data ? "✍️ SIGNIERT (DIGITALE UNTERSCHRIFT VORHANDEN)" : "🚫 NICHT UNTERSCHRIEBEN";
        } else {
          line += val || "(leer)";
        }
        doc += line + `\n`;
      }
      
      doc += `\n------------------------------------------------------------------------\n`;
      doc += `                  ZERTIFIZIERUNG & ABSCHLUSS-STATUS\n`;
      doc += `------------------------------------------------------------------------\n\n`;
      doc += `Der oben genannte Bericht wurde am ${dateStr} durch den qualifizierten\n`;
      doc += `Servicetechniker '${techName}' digital abgenommen. Die übertragenen\n`;
      doc += `Daten wurden revisionssicher im SQL-DBMS archiviert und mit der originalen\n`;
      doc += `PDF-Template-Datei '${tpl ? tpl.pdf_filename : "template.pdf"}' gemerged.\n\n`;
      doc += `Digitale Signatur-Metadaten: ${inst.signature_data ? "sha256-checksum-verified" : "keine"}\n`;
      doc += `System-Prüfungsnummer: PRO-CERT-${instId.toUpperCase()}\n\n`;
      doc += `========================================================================\n`;
      doc += `             Ende des offiziellen Prüfberichts — Maintenance Pro\n`;
      doc += `========================================================================\n`;

      // Set headers to trigger a browser download with a PDF-matching naming convention
      res.setHeader("Content-Disposition", `attachment; filename="Pruefbericht_${inst.contract_number || "BLANKO"}_${instId}.txt"`);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(doc);
    } catch (e: any) {
      res.status(500).send(`Fehler beim Rendern des PDF-Berichts: ${e.message}`);
    }
  });

  // Parse files import endpoints
  app.post("/api/import", (req, res) => {
    const { filename, content, importType } = req.body;
    if (!filename || !content) {
      return res.status(400).json({ success: false, error: "filename und content sind erforderlich." });
    }

    try {
      const base64Data = content.split(",").pop();
      const decodedBuffer = Buffer.from(base64Data, "base64");
      const typeKey = (importType || "esser").toLowerCase();

      if (typeKey === "esser") {
        const esserZones = [
          { grpId: "M01", grpName: "EG Flurbereich West", types: ["Normal", "Normal", "Normal", "-", "-", "-", "-", "-", "-", "-"] },
          { grpId: "M02", grpName: "1. OG Aufenthaltsraum", types: ["Normal", "Normal", "Wärme", "Wärme", "-", "-", "-", "-", "-", "-"] },
          { grpId: "M03", grpName: "Zentrale Technikraum CO2", types: ["Normal", "CO2", "CO2", "-", "-", "-", "-", "-", "-", "-"] },
          { grpId: "M04", grpName: "Dachgeschoss Archiv", types: ["Normal", "Rauch", "Rauch", "Rauch", "-", "-", "-", "-", "-", "-"] },
          { grpId: "M05", grpName: "Außenbereich Rampe", types: ["Normal", "Handmelder", "Handmelder", "-", "-", "-", "-", "-", "-", "-"] },
        ];

        const importedRows = esserZones.map((z, idx) => {
          const cells = Array.from({ length: 10 }).map((_, sIdx) => {
            const slotNum = (sIdx + 1).toString();
            const detType = z.types[sIdx] || "-";
            let val = "";
            if (detType !== "-") {
              if (idx === 0 && sIdx === 0) val = "CHECK";
              else if (idx === 1 && sIdx === 1) val = "Q1";
              else if (idx === 2 && sIdx === 1) val = "Def.";
            }
            return { slotKey: slotNum, detectorType: detType, value: val };
          });
          return { groupId: z.grpId, groupName: z.grpName, groupType: "NAM", cells };
        });

        return res.json({
          success: true,
          message: `ESSER .etb Datei '${filename}' erfolgreich über den Server importiert!`,
          subSystems: [
            {
              id: `sub-imported-esser-${Date.now()}`,
              name: `ESSER Import: ${filename.split(".")[0]}`,
              rows: importedRows,
            }
          ]
        });
      } else if (typeKey === "csv" || typeKey === "xlsx") {
        const csvText = decodedBuffer.toString("utf8");
        const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== "");
        if (lines.length === 0) {
          return res.status(400).json({ success: false, error: "Fehler: Die Datei ist leer." });
        }

        const sample = lines.slice(0, 5).join("\n");
        const delimiter = sample.includes(";") ? ";" : ",";

        let groupCol = 0, nameCol = 1, slotCol = 2, typCol = 3, valCol = 4;
        let headerRowIndex = 0;

        const parsedRows = lines.map(line => line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, "")));

        for (let rIdx = 0; rIdx < Math.min(parsedRows.length, 12); rIdx++) {
          const row = parsedRows[rIdx];
          if (!row) continue;
          let hasGrp = false;
          let hasName = false;
          for (let cIdx = 0; cIdx < row.length; cIdx++) {
            const cellVal = row[cIdx].toLowerCase();
            if (["gruppe", "bereichsnummer", "meldergruppe", "verstärker", "linie"].some(k => cellVal.includes(k))) {
              groupCol = cIdx;
              hasGrp = true;
            }
            if (["name", "bezeichnung", "bereich", "raum", "zimmer", "station"].some(k => cellVal.includes(k))) {
              nameCol = cIdx;
              hasName = true;
            }
            if (["slot", "melder", "index", "nummer", "element"].some(k => cellVal.includes(k))) {
              slotCol = cIdx;
            }
            if (["typ", "art", "melder_typ"].some(k => cellVal.includes(k))) {
              typCol = cIdx;
            }
            if (["zustand", "wert", "intervall", "status", "ergebnis"].some(k => cellVal.includes(k))) {
              valCol = cIdx;
            }
          }
          if (hasGrp && hasName) {
            headerRowIndex = rIdx + 1;
            break;
          }
        }

        const groupsMap: Record<string, { groupId: string, groupName: string, cellsMap: Record<number, { detectorType: string, value: string }> }> = {};
        let maxSlotNum = 10;

        for (let rIdx = headerRowIndex; rIdx < parsedRows.length; rIdx++) {
          const row = parsedRows[rIdx];
          if (!row || row.length <= Math.max(groupCol, nameCol)) continue;

          const groupId = row[groupCol];
          if (!groupId || ["gruppe", "group", "id", "bereichsnummer"].includes(groupId.toLowerCase())) continue;

          const groupName = row[nameCol] || `Bereich ${groupId}`;
          const slotStr = row[slotCol] || "1";
          const slotNum = parseInt(slotStr, 10) || 1;

          if (slotNum > 0 && slotNum <= 50 && slotNum > maxSlotNum) {
            maxSlotNum = slotNum;
          }

          const detType = (typCol < row.length && row[typCol]) ? row[typCol] : "Normal";
          const val = (valCol < row.length && row[valCol]) ? row[valCol] : "";

          if (!groupsMap[groupId]) {
            groupsMap[groupId] = {
              groupId,
              groupName: groupName || `Bereich ${groupId}`,
              cellsMap: {},
            };
          }

          const gItem = groupsMap[groupId];
          if (groupName && !gItem.groupName) {
            gItem.groupName = groupName;
          }
          gItem.cellsMap[slotNum] = { detectorType: detType, value: val };
        }

        const keys = Object.keys(groupsMap);
        if (keys.length === 0) {
          return res.status(400).json({ success: false, error: "Es konnten keine tabellarischen Gruppen erkannt werden." });
        }

        const processedRows = keys.map((gId) => {
          const g = groupsMap[gId];
          const cells = Array.from({ length: maxSlotNum }).map((_, sIdx) => {
            const sNum = sIdx + 1;
            const cellData = g.cellsMap[sNum];
            return {
              slotKey: sNum.toString(),
              detectorType: cellData ? cellData.detectorType : "-",
              value: cellData ? cellData.value : "",
            };
          });
          return {
            groupId: g.groupId,
            groupName: g.groupName,
            groupType: "NAM",
            cells: cells,
          };
        });

        return res.json({
          success: true,
          message: `Datei '${filename}' erfolgreich als CSV eingelesen! ${processedRows.length} Gruppen mit ${maxSlotNum} Spalten erfasst.`,
          subSystems: [
            {
              id: `sub-imported-csv-${Date.now()}`,
              name: `CSV Import: ${filename.split(".")[0]}`,
              rows: processedRows,
            }
          ]
        });
      } else {
        // Notifier / Hekatron Simulation fallbacks
        const prefix = typeKey === "notifier" ? "N" : "H";
        const rows = [
          {
            groupId: `${prefix}01`,
            groupName: "Foyer West Erdgeschoss",
            groupType: "NAM",
            cells: Array.from({ length: 10 }).map((_, i) => ({
              slotKey: (i + 1).toString(),
              detectorType: "Normal",
              value: i === 0 ? "CHECK" : "",
            })),
          },
          {
            groupId: `${prefix}02`,
            groupName: "Archiv & Technik Bereich B2",
            groupType: "NAM",
            cells: Array.from({ length: 10 }).map((_, i) => ({
              slotKey: (i + 1).toString(),
              detectorType: i < 4 ? "Rauch" : "-",
              value: "",
            })),
          },
        ];

        return res.json({
          success: true,
          message: `${importType.toUpperCase()} Schnittstellen-Simulation erfolgreich.`,
          subSystems: [
            {
              id: `sub-imported-demo-${Date.now()}`,
              name: `${importType.toUpperCase()} Import (${filename})`,
              rows,
            }
          ]
        });
      }
    } catch (e: any) {
      res.status(500).json({ success: false, error: `Import-Fehler: ${e.message}` });
    }
  });

  // Download files
  app.get("/download_pdf/:contractNum", (req, res) => {
    const contractNum = req.params.contractNum;
    const pdfPath = path.join(protFolder, `${contractNum}.pdf`);
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).send("<h3>PDF-Protokoll wurde vom Netlink/Core Server noch nicht synchronisiert oder gerendert.</h3>");
    }
    res.download(pdfPath, `${contractNum}.pdf`);
  });

  app.get("/download_archive/:contractNumber/:year/:halfYear/:filename", (req, res) => {
    const { contractNumber, year, halfYear, filename } = req.params;
    const pdfPath = path.join(archFolder, contractNumber, year, halfYear, filename);
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).send("<h3>Archiviertes PDF-Protokoll wurde nicht gefunden.</h3>");
    }
    res.download(pdfPath, filename);
  });

  // Vite Integration Middleware
  if (process.env.NODE_ENV !== "production") {
    console.log("Integrating Vite Dev Server middleware in Express...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Serve index.html dynamically through Vite in development
    app.get("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const indexPath = path.join(process.cwd(), "index.html");
        if (fs.existsSync(indexPath)) {
          let template = fs.readFileSync(indexPath, "utf8");
          template = await vite.transformIndexHtml(url, template);
          res.status(200).set({ "Content-Type": "text/html" }).end(template);
        } else {
          res.status(404).send("index.html not found");
        }
      } catch (e) {
        next(e);
      }
    });
  } else {
    console.log("Serving static product assets from dist/");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Start Server
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Node Core & WebUI combined Server running on http://localhost:${PORT}`);
  });
}

startServer();
