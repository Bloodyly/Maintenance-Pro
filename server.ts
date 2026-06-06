import express from "express";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { createServer as createViteServer } from "vite";
import * as XLSX from "xlsx";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for file transfers
  app.use(express.json({ limit: "20mb" }));

  // API Route for importing files
  app.post("/api/import", (req: express.Request, res: express.Response): any => {
    const { filename, content, importType } = req.body;

    if (!filename || !content || !importType) {
      return res.status(400).json({
        success: false,
        error: "Fehlende Parameter: filename, content und importType sind erforderlich."
      });
    }

    try {
      // Decode base64 file content
      const base64Data = content.replace(/^data:.*;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      
      // Separate temporary directory and file
      const tempDir = path.join(process.cwd(), "temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
      }
      
      const tempFilePath = path.join(tempDir, `upload_${Date.now()}_${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`);
      fs.writeFileSync(tempFilePath, buffer);

      if (importType === "esser") {
        // Run the python parser
        const scriptPath = path.join(process.cwd(), "esser_parser.py");
        
        execFile("python3", [scriptPath, tempFilePath], (error, stdout, stderr) => {
          // Clean up temp file
          try {
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
          } catch (unlinkErr) {
            console.error("Fehler beim Löschen der temporären Datei:", unlinkErr);
          }

          if (stderr) {
            console.warn("Python Debug/Stderr:", stderr);
          }

          if (error) {
            console.error("Exec Fehler:", error);
            return res.status(500).json({
              success: false,
              error: `Python Parse-Fehler: ${error.message}. Ist Python3 im Container installiert?`,
              stderr: stderr
            });
          }

          try {
            const parsedResult = JSON.parse(stdout);
            return res.json(parsedResult);
          } catch (parseErr: any) {
            return res.status(500).json({
              success: false,
              error: `Fehler beim Parsen der in Python erzeugten JSON-Ausgabe: ${parseErr.message}`,
              stdout: stdout
            });
          }
        });
      } else if (importType === "csv" || importType === "xlsx") {
        // Parse CSV or XLSX using SheetJS (XLSX can also parse CSV natively)
        try {
          const workbook = XLSX.read(buffer, { type: "buffer" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

          // Clean up temp file
          try {
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
          } catch (unlinkErr) {
            console.error("Fehler beim Löschen der temporären Datei:", unlinkErr);
          }

          if (!rawRows || rawRows.length === 0) {
            return res.status(400).json({
              success: false,
              error: "Die hochgeladene Datei enthält keine Daten oder ist leer."
            });
          }

          // Search header to bind columns
          let groupCol = 0;
          let nameCol = 1;
          let slotCol = 2;
          let typCol = 3;
          let valCol = 4;
          let headerRowIndex = 0;

          for (let r = 0; r < Math.min(rawRows.length, 12); r++) {
            const row = rawRows[r];
            if (!row || !Array.isArray(row)) continue;
            let hasGruppe = false;
            let hasName = false;
            for (let c = 0; c < row.length; c++) {
              const cellVal = String(row[c] || "").toLowerCase().trim();
              if (cellVal.includes("gruppe") || cellVal.includes("bereichsnummer") || cellVal.includes("meldergruppe") || cellVal.includes("verstärker") || cellVal.includes("linie")) {
                groupCol = c;
                hasGruppe = true;
              }
              if (cellVal.includes("name") || cellVal.includes("bezeichnung") || cellVal.includes("bereich") || cellVal.includes("raum") || cellVal.includes("zimmer") || cellVal.includes("station")) {
                nameCol = c;
                hasName = true;
              }
              if (cellVal.includes("slot") || cellVal.includes("melder") || cellVal.includes("index") || cellVal.includes("nummer") || cellVal.includes("element")) {
                slotCol = c;
              }
              if (cellVal.includes("typ") || cellVal.includes("art") || cellVal.includes("melder_typ")) {
                typCol = c;
              }
              if (cellVal.includes("zustand") || cellVal.includes("wert") || cellVal.includes("intervall") || cellVal.includes("status") || cellVal.includes("ergebnis")) {
                valCol = c;
              }
            }
            if (hasGruppe && hasName) {
              headerRowIndex = r + 1;
              break;
            }
          }

          const groupsMap = new Map<string, { groupId: string; groupName: string; cellsMap: Map<number, { detectorType: string; value: string }> }>();
          let maxSlotNum = 10;

          for (let r = headerRowIndex; r < rawRows.length; r++) {
            const row = rawRows[r];
            if (!row || !Array.isArray(row) || row.length === 0) continue;
            
            const groupId = String(row[groupCol] || "").trim();
            if (!groupId || groupId.toLowerCase() === "gruppe" || groupId.toLowerCase() === "group") continue; // skip repeat headers
            
            const groupName = String(row[nameCol] || "").trim();
            const slotStr = String(row[slotCol] || "").trim();
            const slotNum = parseInt(slotStr, 10) || 1;
            
            if (slotNum > maxSlotNum && slotNum <= 50) {
              maxSlotNum = slotNum;
            }

            const detectorType = String(row[typCol] || "Normal").trim();
            const value = String(row[valCol] || "").trim();

            if (!groupsMap.has(groupId)) {
              groupsMap.set(groupId, {
                groupId,
                groupName: groupName || `Bereich ${groupId}`,
                cellsMap: new Map()
              });
            }

            const activeGroupItem = groupsMap.get(groupId)!;
            if (groupName && !activeGroupItem.groupName) {
              activeGroupItem.groupName = groupName;
            }
            activeGroupItem.cellsMap.set(slotNum, { detectorType, value });
          }

          if (groupsMap.size === 0) {
            return res.status(400).json({
              success: false,
              error: "Es konnten keine gültigen Zeilen eingelesen werden. Bitte prüfen Sie das Spalten-Format (Gruppe;Name;Slot;Typ;Zustand)."
            });
          }

          const processedRows = Array.from(groupsMap.values()).map(g => {
            const cells = [];
            for (let s = 1; s <= maxSlotNum; s++) {
              const cellData = g.cellsMap.get(s);
              cells.push({
                slotKey: s.toString(),
                detectorType: cellData ? (cellData.detectorType || "-") : "-",
                value: cellData ? (cellData.value || "") : ""
              });
            }
            return {
              groupId: g.groupId,
              groupName: g.groupName,
              groupType: "NAM",
              cells: cells
            };
          });

          return res.json({
            success: true,
            message: `Datei '${filename}' erfolgreich als ${importType.toUpperCase()} importiert! ${processedRows.length} Gruppen mit ${maxSlotNum} Spalten erfasst.`,
            subSystems: [
              {
                id: `sub-imported-sheet-${Date.now()}`,
                name: `Datei-Import: ${filename.split(".")[0]}`,
                rows: processedRows
              }
            ]
          });
        } catch (excelErr: any) {
          return res.status(500).json({
            success: false,
            error: `Fehler beim Analysieren des Tabellenblatts: ${excelErr.message}`
          });
        }
      } else {
        // Clean up temp file for notifier/hekatron
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        } catch (unlinkErr) {
          console.error("Fehler beim Löschen:", unlinkErr);
        }

        // Return mock templates for Notifier and Hekatron directly
        const brandName = importType === "notifier" ? "NOTIFIER" : "HEKATRON";
        const prefix = importType === "notifier" ? "N" : "H";
        
        const rows = [
          {
            groupId: `${prefix}01`,
            groupName: `${brandName} Bereich Flur Erdgeschoss`,
            groupType: "NAM",
            cells: Array.from({ length: 10 }, (_, i) => ({
              slotKey: (i + 1).toString(),
              detectorType: i < 6 ? "Normal" : "-",
              value: i === 0 ? "CHECK" : ""
            }))
          },
          {
            groupId: `${prefix}02`,
            groupName: `${brandName} Bereich Serverraum Doppelboden`,
            groupType: "NAM",
            cells: Array.from({ length: 10 }, (_, i) => ({
              slotKey: (i + 1).toString(),
              detectorType: i < 4 ? "Rauch" : "-",
              value: i === 1 ? "H1" : ""
            }))
          },
          {
            groupId: `${prefix}03`,
            groupName: `${brandName} Büro Westflügel`,
            groupType: "NAM",
            cells: Array.from({ length: 10 }, (_, i) => ({
              slotKey: (i + 1).toString(),
              detectorType: i < 5 ? "Normal" : "-",
              value: ""
            }))
          }
        ];

        return res.json({
          success: true,
          message: `${brandName} Import erfolgreich abgeschlossen (Strukturierte Demo-Schnittstelle).`,
          subSystems: [
            {
              id: `sub-imported-${importType}-${Date.now()}`,
              name: `${brandName} Import (${filename})`,
              rows: rows
            }
          ]
        });
      }
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: `Allgemeiner Importfehler: ${err.message}`
      });
    }
  });

  // ----------------- Android App Service API Endpoints -----------------

  const systemDefinitionsData = {
    BMA: {
      detector_types: ["-", "Normal", "ZD", "ZB", "TDIFF", "TMAX", "RAS", "LINEAR"],
      columns: [
        { key: "1", label: "01" },
        { key: "2", label: "02" },
        { key: "3", label: "03" },
        { key: "4", label: "04" }
      ],
      applicable_values: [
        { value: "H1", label: "Halbjahr 1" },
        { value: "H2", label: "Halbjahr 2" },
        { value: "Def.", label: "Defekt", is_defect: true }
      ]
    },
    EMA: {
      detector_types: ["-", "Normal", "BWM", "ZK", "RSK", "Lichtschranke", "Glasbruch", "Körperschall"],
      columns: [
        { key: "1", label: "01" },
        { key: "2", label: "02" },
        { key: "3", label: "03" },
        { key: "4", label: "04" }
      ],
      applicable_values: [
        { value: "CHECK", label: "Fin" },
        { value: "Def.", label: "Defekt", is_defect: true }
      ]
    },
    ELA: {
      detector_types: ["-", "Normal", "Innenlautsprecher", "Außenlautsprecher"],
      columns: [
        { key: "1", label: "01" },
        { key: "2", label: "02" },
        { key: "3", label: "03" }
      ],
      applicable_values: [
        { value: "CHECK", label: "Fin" },
        { value: "Def.", label: "Defekt", is_defect: true }
      ]
    },
    LIRA: {
      detector_types: ["-", "Normal", "AT", "BT", "ZT", "EM", "PN", "Display"],
      columns: [
        { key: "1", label: "01" },
        { key: "2", label: "02" },
        { key: "3", label: "03" },
        { key: "4", label: "04" }
      ],
      applicable_values: [
        { value: "CHECK", label: "Fin" },
        { value: "Def.", label: "Defekt", is_defect: true }
      ]
    },
    SLA: {
      detector_types: ["-", "Normal", "ZD", "DB", "RAS", "TDIF"],
      columns: [
        { key: "1", label: "01" },
        { key: "2", label: "02" },
        { key: "3", label: "03" },
        { key: "4", label: "04" }
      ],
      applicable_values: [
        { value: "CHECK", label: "Fin" },
        { value: "Def.", label: "Defekt", is_defect: true }
      ]
    }
  };

  const mockProtocolItems = [
    {
      id: "PRO-100",
      name: "Klinikum Nord - BMA",
      address: "Klinikweg 12, N-04",
      contract_number: "V-2026-NBF",
      interval: "Halbjährlich",
      system_type: "BMA",
      status: "pending",
      is_live: true
    },
    {
      id: "PRO-101",
      name: "Seniorenheim Lebensbaum - SAA",
      address: "Sonnenstr. 4, L-05",
      contract_number: "V-2026-LBM",
      interval: "Jährlich",
      system_type: "SAA",
      status: "pending",
      is_live: true
    },
    {
      id: "PRO-102",
      name: "Einkaufszentrum CityGallerie",
      address: "Marktplatz 1, C-01",
      contract_number: "V-2026-CTG",
      interval: "Vierteljährlich",
      system_type: "BMA",
      status: "pending",
      is_live: true
    }
  ];

  // Helper to handle double route registrations support
  const registerGet = (pathStr: string, handler: any) => {
    app.get(pathStr, handler);
    app.get("/api" + pathStr, handler);
  };
  const registerPost = (pathStr: string, handler: any) => {
    app.post(pathStr, handler);
    app.post("/api" + pathStr, handler);
  };

  registerPost("/auth/check", (req: express.Request, res: express.Response) => {
    res.json({
      status: "SUCCESS",
      technician_id: "T-01",
      name: "Max Mustermann"
    });
  });

  registerPost("/protocols/search", (req: express.Request, res: express.Response) => {
    res.json(mockProtocolItems);
  });

  registerPost("/protocols/list-pending", (req: express.Request, res: express.Response) => {
    res.json(mockProtocolItems);
  });

  registerPost("/protocols/definitions", (req: express.Request, res: express.Response) => {
    res.json(systemDefinitionsData);
  });

  registerPost("/protocols/download/:id", (req: express.Request, res: express.Response) => {
    // Return standard 404 to trigger client-side fallback default dynamic structure generator
    res.status(404).send("Explicit client-side dynamic fallback fallback.");
  });

  registerPost("/protocols/upload/:id", (req: express.Request, res: express.Response) => {
    res.json({
      status: "SUCCESS",
      version: 1,
      message: "Protokoll erfolgreich hochgeladen und mit Zentralserver synchronisiert!"
    });
  });

  registerPost("/protocols/live-sync/:id", (req: express.Request, res: express.Response) => {
    res.json({
      protocol_id: req.params.id,
      payload_json: "{}"
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
