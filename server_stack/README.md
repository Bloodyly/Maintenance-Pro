# 🏗️ Server-Side Application Container Stack

Dieses Verzeichnis enthält die vollständige, produktionsreife Docker-Container-Architektur für die serverseitige Verwaltung, Auswertung und Synchronisation unseres offline-fähigen Wartungssystems.

Die Architektur besteht aus **5 separaten Containern**, die untereinander kommunizieren und durch ein hochsicheres Netzwerkgefüge (Network Isolation) getrennt sind.

---

## 🚦 System- & Netzwerkarchitektur

Das Sicherheitskonzept basiert auf einer strikten Trennung zwischen dem öffentlichen Internet (WAN) und dem geschützten Firmen-Intranet (LAN).

```text
       [ Android App (Internet) ]
                   │
                   ▼ (Port 3000, HTTPS)
          ┌─────────────────┐
          │     Netlink     │ <── WAN (Nur Internet-Zugriff)
          └─────────────────┘
                   │
           (Gemeinsames Volume) ◄─── SQLite Database ("protocols.db")
                   │
          ┌─────────────────┐
          │   ProtocolDB    │ <── LAN (Firmeneigenes Intranet)
          └─────────────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
┌─────────────────┐ ┌─────────────────┐
│     WebUI       │ │  ProtocolCore   │
│   (Port 8080)   │ │ (Parser/PDF)    │
└─────────────────┘ └─────────────────┘
         │                   │
         ▼                   ▼
   ┌───────────────────────────┐
   │           Samba           │ (Netzlaufwerk)
   │  📂 Melderlisten          │
   │  📂 Protokolle (Aktuell)  │
   │  📂 Archiv (Versioniert)  │
   └───────────────────────────┘
```

### 1. Netzwerk-Isolierungs-Statuten

*   **`internet_wan` (Bridge):** Einziger Zugangspunkt für die verschlüsselten Synchronisations-Anfragen der Android-App. Ausschließlich der **Netlink**-Container ist an dieses Netzwerk angebunden.
*   **`internal_lan` (Internal):** Ein rein firmeninternes, vom Internet vollständig isoliertes virtuelles Netzwerk. Hier kommunizieren die Management-Schnittstelle (**WebUI**), der Hintergrund-Worker (**ProtocolCore**), die Datenpflege-Schnittstelle (**ProtocolDB**) und das Samba-Netzlaufwerk (**Samba**).
*   **Database Isolation (Gemeinsames Volume):** Der **Netlink**-Container darf keine direkte Netzwerkverbindung zu anderen internen Firmenressourcen besitzen. Daher erfolgt die Datenübergabe über ein geschütztes Docker-Volume (`db_data`), welches die SQLite-Datenbankdatei direkt zwischen Netlink und ProtocolDB teilt.

---

## 📦 Container-Übersicht & Detailfunktionen

### 1. 🌐 WebUI (Port `8080`)
*   **Zweck:** Firmeninternes Leitstellen-Dashboard zur Einsicht, manuellen Bearbeitung und Versionierung von Prüfprotokollen.
*   **Sicherheitszone:** Ausschließlich firmeninternes Intranet (`internal_lan`).
*   **Features:**
    *   Echtzeit-Statistiken über offene, offline-geladene und abgeschlossene Wartungen.
    *   Detail-Gitteransicht (Matrix) aller Meldergruppen und deren aktiven Slot-Belegungen.
    *   Integration mit dem Samba-Archiv zur Auflistung historischer Revisionsstände.
    *   Schnittstelle zur Einplanung folgener Wartungsperioden ("Neu Planen").

### 2. ⚡ Netlink (Port `3000`)
*   **Zweck:** Hochgeschwindigkeits-Schnittstelle für Android-Clients über das Internet.
*   **Sicherheitszone:** Nur-Internet (`internet_wan`). Kein Zugriff auf das Firmennetzwerk.
*   **Features:**
    *   Empfängt und entschlüsselt die mit **AES-256-GCM** gesicherten Login-Header (`X-Auth`).
    *   Liefert verschlüsselte JSON-Suchergebnisse für Wartungsobjekte (`/protocols/search` & `/protocols/list-pending`).
    *   Liefert eine binäre, AES-GCM-verschlüsselte ZIP-Datei zur Offline-Synchronisation (`/protocols/download/<id>`).
    *   Verarbeitet verschlüsselte Upload-Datenströme und schreibt diese transaktionssicher direkt in die SQLite-Datenbank.

### 3. 📂 Samba (Ports `139`, `445`)
*   **Zweck:** Stellt firmeninterne Freigaben für den Im- und Export von Tabellen und pdf-Dateien bereit.
*   **Sicherheitszone:** Internes Firmennetzwerk (`internal_lan`).
*   **Freigegebene Verzeichnisse:**
    1.  `\\Melderlisten\`: Hauptspeicherort für Objekt-Excel-Arbeitsplanungsmappen.
    2.  `\\Protokolle\`: Enthält immer das **aktuellste**, vollständig ausgefüllte Revisionsprotokoll als PDF. Pro Objekt/Vertragsnummer existiert hier stets nur *eine* Datei.
    3.  `\\Archiv\`: Enthält ältere oder überarbeitete Prüfberichte in einer strukturierten Ordnerhierarchie:
        `[Vertragsnummer] / [Monatsjahr] / [Halbjahr] / [Vertragsnummer]_V[Version].pdf`
*   **💡 Optionaler Betrieb:** Wenn bereits ein physischer NAS-Server (z.B. Synology, QNAP, TrueNAS) im Netz vorhanden ist, kann dieser Container komplett abgeschaltet werden. Details dazu siehe unten.

### 4. ⚙️ ProtocolCore
*   **Zweck:** Der clevere, automatische Service-Hintergrund-Daemon.
*   **Sicherheitszone:** Internes Firmennetzwerk (`internal_lan`).
*   **Features:**
    *   Überwacht die SQLite-Datenbank kontinuierlich auf neu synchronisierte Uploads von den Außendiensttechnikern.
    *   Generiert vollautomatisch hochprofessionelle Prüfberichte im PDF-Format mittels der kryptografisch sicheren Systemparameter.
    *   **Automatisches Versionierungsgesetz:** Erkennt, ob für einen Kunden bereits ein älteres Wartungs-PDF im Ordner `Protokolle/` existiert. Wenn ja, verschiebt es dieses in den Ordner `Archiv/[Vertragsnummer]/[Jahr]/[Halbjahr]/` und benennt es mit einer aufsteigenden Versionsnummer `_V2`, `_V3` etc. um. Erst danach wird das neue, aktuelle PDF im Hauptordner abgelegt.

### 5. 🗄️ ProtocolDB
*   **Zweck:** Interner SQLite-Verzeichnishalter. Bindet das `db_data` Volume und stellt Werkzeuge zur Integritätsprüfung bereit.
*   **Sicherheitszone:** Internes Firmennetzwerk (`internal_lan`).

---

## 💾 Integration eines physischen NAS (Optionaler Samba-Betrieb)

Wenn Sie den integrierten Samba-Container nicht benötigen und stattdessen ein bestehendes Firmen-NAS ankoppeln möchten, haben Sie zwei Möglichkeiten in `docker-compose.yml`:

### Option A: Direktes Host-Path Binding (Empfohlen)
Besitzt der Docker-Host bereits einen Mount zum NAS (z.B. `/mnt/nas/wartungen`), können Sie diesen direkt in die Services `webui` und `protocol_core` schleifen:
1. Kommentieren Sie den Dienst `samba` in `docker-compose.yml` aus oder löschen Sie ihn.
2. Ändern Sie die Volumes bei `webui` und `protocol_core` von `samba_data:/samba_shares` wie folgt um:
   ```yaml
   volumes:
     - db_data:/shared_db:ro
     - /mnt/nas/wartungen:/samba_shares:rw  # Lokales Verzeichnis oder NAS-Einhängepunkt
   ```

### Option B: Direkter Docker-CIFS-Volume-Treiber
Sie können Docker anweisen, die SMB-Freigabe des NAS direkt beim Start der Container per Netzwerk zu mounten:
1. Kommentieren oder löschen Sie den Dienst `samba` in `docker-compose.yml`.
2. Aktivieren Sie die Volume-Konfiguration am Ende der `docker-compose.yml`:
   ```yaml
   volumes:
     db_data:
     samba_data:
       driver: local
       driver_opts:
         type: "cifs"
         device: "//192.168.1.100/my-wartung-share"   # IP/Freigabename Ihres NAS
         o: "username=nas_user,password=nas_pass,vers=3.0,rw,uid=1000,gid=1000"
   ```

---

## 🚀 Inbetriebnahme des Stacks

Zum schnellen und unkomplizierten Start des gesamten Verbundes ist Docker und Docker-Compose erforderlich.

```bash
# 1. Navigieren Sie in das Server-Verzeichnis
cd server_stack

# 2. Bauen und starten Sie den gesamten Stack im Hintergrund
docker compose up --build -d

# 3. Überprüfen Sie den Status aller Dienste
docker compose ps
```

### Server-Zugriffspunkte nach dem Start:
*   **Web-Dashboard für die Zentrale (Intranet-PC):** `http://localhost:8080`
*   **Android-App Gateway (Öffentlich/Internet-Reverse-Proxy):** `http://[Ihre-Server-IP]:3000`
*   **Samba Netzlaufwerk-Mount (In Windows Explorer oder macOS Finder eingeben):**
    `smb://[Ihre-Server-IP]/` (Verzeichnisse: `Melderlisten`, `Protokolle`, `Archiv`)

---

## 🔒 Kryptografischer Wahrheitsbeweis & Verifikation

Das im **Netlink**-Container verwendete Entschlüsselungsverfahren entspricht bit-identisch dem Standard unserer Android-Wartungsapp.

Sie können die Integrität der Verschlüsselung anhand des Testvektors in `crypto_reference.py` im Stammverzeichnis verifizieren:

```bash
# Führen Sie das Test-Skript aus, um die plattformübergreifende Identität zu prüfen:
python crypto_reference.py
```

*   **Derivation-Salt:** `ENO_AUSLOESELISTE_v1`
*   **Standard-Iterationen:** `100.000 (PBKDF2-HMAC-SHA256)`
*   **Symmetrisches Verfahren:** `AES-256-GCM (NoPadding)`
