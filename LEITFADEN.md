# Maintenance Pro — Projekt-Leitfaden (Developer Blueprint)

Willkommen beim Entwickler-Leitfaden für **Maintenance Pro**. Dieses Dokument dient als zentrale Wissensdatenbank und Spezifikationsgrundlage für KI-Agenten sowie menschliche Entwickler. Es beschreibt detailliert die Architektur, die Funktionsbereiche und die technischen Anforderungen des Projekts.

---

## 1. Vision & Leitphilosophie

Maintenance Pro ist eine integrierte Simulations- und Arbeitsplattform zur Verwaltung und Ausführung von Wartungs-Auslöselisten im vorbeugenden Brandschutz und der Sicherheitstechnik (z. B. BMA, ELA, SLA). 

Der Fokus liegt auf einer **100 % getreuen Nachbildung** realer Feldarbeitsabläufe im Zusammenspiel mit einer zentralen Intranet-Leitstelle:
- **Echte Full-Stack-Architektur**: Ein integrierter Express-Server mit SQLite-Persistenz, gekoppelt mit einem modernen React-Vite-Frontend.
- **Zwei-Perspektiven-Modell**: Synchronisierte Koexistenz zwischen der mobilen Außendienst-Ansicht (Android-Emulator für Techniker) und der Büro-Zentrale (WebUI-Leitstelle).
- **Zustands-Synchronität**: Änderungen in einer Perspektive spiegeln sich in Echtzeit in der anderen wider (oder simulieren das Offline-Verhalten im Netzwerk).

---

## 2. Systemarchitektur & Verzeichnisstruktur

Das Projekt ist modular aufgebaut und verbindet Node.js mit React und SQLite:

```text
├── server.ts                  # Haupt-Express-Server (integriert Node + Vite Middleware)
├── package.json               # Paket-Abhängigkeiten und Start- bzw. Build-Skripte
├── vite.config.ts             # Vite-Konfiguration für die Frontend-Kompilierung
├── index.html                 # Haupteinstiegspunkt für das Browser-Frontend
├── database.db                # SQLite-Datenbankdatei (Speicherort für Protokolle/Mitarbeiter)
├── server_stack/              # Altes Legacy-Backend und Python/AlpineJS-Ressourcen (Referenz)
│   └── webui/templates/index.html   # Alte Alpine-Layouts (erreichbar unter /old-webui)
├── src/                       # React Quellcode (Haupt-Webapplikation)
│   ├── main.tsx               # Haupteinstieg des Frontends
│   ├── App.tsx                # Hauptkomponente, Zustand-Enzyklopädie & Emulator-Shells
│   ├── index.css              # Globale Styles (Importiert Tailwind CSS und Fonts)
│   ├── types.ts               # Shared TypeScript Definitionen & Interfaces
│   └── components/            # Gekapselte Sub-Komponenten
│       └── CentralWebUI.tsx   # Kern-Komponente der Büro-Leitstelle (WebUI)
```

---

## 3. Zentrale Feature-Spezifikation

### A. Techniker-Perspektive (Die Android-Emulator-Shell)
Diese Ansicht simuliert ein mobiles Android-Tablet oder Smartphone im Feldeinsatz. Sie ist optisch als natives Gerät gerahmt.

1. **Systemkonfiguration & QR-Scanner**:
   - Ermöglicht das eintragen von Port/Server-IP, Benutzername und Codewort (Mainkey).
   - Ein simulierter **Kamera-QR-Code-Scanner** kann gestartet werden. Dieser liest reale Konfigurationen basierend auf dem aktiven Mandanten (Firma) aus, um Feldtechniker sekundenschnell anzumelden.
2. **Offline-Fähigkeit & Lokaler Cache**:
   - Die App arbeitet komplett lokal (Room/SQLite-äquivalent im React-State).
   - Ein **Pull-To-Refresh-Geste** auf der Liste synchronisiert die lokalen Stände zurück in die Hauptdatenbank.
   - Wisch-Gesten (**Swipe Left to Delete** zum Entladen; **Swipe Right to Archive** zum Archivieren) steuern die lokale Cache-Belegung.
3. **Meldertyp-Synchronisation**:
   - Über einen API-Abruf können Anlagendefinitionen (BMA, EMA, ELA, LIRA) live vom Zentral-Server gezogen werden.

### B. Büro-Leitstelle (Intranet WebUI & Leitstand)
Ermöglicht der Einsatzleitung im Büro die Verwaltung aller laufenden und archivierten Wartungen.

1. **Dashboard & Import/Export**:
   - Bietet Statistiken zur Gesamtauslastung, bearbeiteten Meldepunkten und offenen Verträgen.
   - Import von neuen Anlagen oder Technikern via XML- oder JSON-Schnittstellen.
2. **PDF-Archiv & Downloads**:
   - Generiert druckfertige Reports und ermöglicht das Herunterladen von PDF-Zertifikaten (Schnittstellen zu `/download_pdf` und `/download_archive`).
3. **Techniker-Verwaltung**:
   - Management aller aktiven Außendienstmitarbeiter.
   - Sperrung/Freischaltung von Profilen (Gesperrte Techniker können sich über den QR-Code-Emulator nicht mehr anmelden).

---

## 4. Richtlinien für KI-Entwickler (Coding-Codex)

Wenn Sie dieses Projekt erweitern, halten Sie sich zwingend an folgende Leitlinien, um die Code-Qualität und Stabilität hoch zu halten:

### I. Server-Port & Netzwerk-Constraints
- Der Server **muss** auf Port `3000` und Host `0.0.0.0` lauschen. Dies ist fest in der Infrastruktur verankert.
- Verwenden Sie keine kundenspezifischen Port-Zuweisungen im Code, die über Umgebungsvariablen nicht abgesichert sind.

### II. Vite-Integration in Express-Server
- In der Entwicklung (`NODE_ENV !== "production"`) dient der Express-Server als Wrapper für den Vite Dev-Server (`createServer`). Jegliche Client-Asset-Verarbeitung wird an Vite delegiert.
- In der Produktion werden vorkompilierte Builds aus dem Verzeichnis `dist/` statisch ausgeliefert.
- Ändern Sie diese Middleware-Konfiguration nicht ohne zwingenden Grund.

### III. Daten-Fluss & State sharing
- Das Frontend verwendet in `App.tsx` einen geteilten globalen React-State für Protokolle und Mandanten, um den Simulatormodus nahtlos zu betreiben.
- API-Routen in `server.ts` bedienen Schnittstellen wie `/api/import` und `/download_pdf`. Halten Sie die DB-Logik in `server.ts` und die Client-Zustände synchron.

### IV. TypeScript & Typisierung
- Fügen Sie neue Datenmodelle immer zuerst in `src/types.ts` hinzu.
- Verwenden Sie **kein** `const enum`. Nutzen Sie standardmäßige `enum` Deklarationen.
- Halten Sie Ihren Code absolut linter-grün (`npm run lint` muss immer fehlerfrei durchlaufen).
