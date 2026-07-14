# Vereinheitlichung der Meldepunkttypen (Anlagentypen-Konfiguration)

Diese Datei ist die persistente, abhakbare Arbeits-Checkliste für dieses
Vorhaben. Vollständiger Kontext/Begründung steht im Claude-Plan
`.claude/plans/immutable-stirring-donut.md` (falls noch vorhanden) bzw. in
der Commit-Historie ab diesem Punkt. Bei Unterbrechung (z.B. Nutzungslimit)
kann jede neue Session hier exakt weiterarbeiten — einfach den ersten
unabgehakten Punkt nehmen.

## Ausgangslage (Kurzfassung)

Mindestens fünf unabhängige, auseinandergelaufene Kopien der
Meldepunkttyp-Vokabular existierten:
1. `webui/app.py` `DEFAULT_ANLAGENTYPEN` (behauptet ETB-Parität, stimmt nicht)
2. `netlink/main.py` `DEFAULT_MELDEPUNKT_DEFS` (Kopie von 1)
3. Android `getFallbackDefinitionsJson()` (andere Liste, andere JSON-Schlüssel)
4. Android `MatrixEditScreen.kt` hartcodierte Farb-/Kurzzeichen-Maps
5. Echter ETB-Decoder (`AM, DKM, IO, Steu, MASI, Koppler, Konventionell`)

Zusätzlich: Android ruft bereits `POST /protocols/definitions` auf
("Anlagentypen neu laden"-Button), aber dieser Endpunkt existiert im Server
nicht — der Button fällt still auf einen Fallback zurück, ohne dass der
Nutzer es merkt.

**Ziel:** eine editierbare, kanonische Quelle pro Anlagentyp (Meldepunkttyp =
Code + Bezeichnung + Kurzzeichen + Farbe) im WebUI, konsumiert von
WebUI-Anzeige/Editor UND App-Anzeige/Editor, aktualisierbar über den
bestehenden "Anlagentypen neu laden"-Button ohne App-Neubau. PDF-Erstellung
bleibt bewusst außen vor (späteres separates Vorhaben).

Architektur-Entscheidung: der globale, protokoll-unabhängige Cache
(SharedPreferences `"system_definitions"`) wird die EINZIGE Quelle in der
App — nicht die pro-Protokoll `detectorDefsJson`-Spalte aus der vorherigen
Session.

Alte manuelle Typen (ZD, ZB, TDiff, Tmax, RAS, Linear) bleiben erhalten
(zusätzlich zum ETB-Kern), nicht entfernt.

---

## Checkliste

### A. Schema: Bezeichnung + Kurzzeichen zu `meldepunkt_definitionen`
- [x] `server_stack/webui/app.py`: `labels`/`kurzzeichen`-Maps neben `colors`
      ergänzen; `fill_detector_colors` → Fill-Logik für alle drei Maps
      erweitert (Default-Label = Code, Default-Kurzzeichen aus bestehender
      hartcodierter Abkürzungstabelle).
- [x] `server_stack/webui/app.py`: `DEFAULT_ANLAGENTYPEN`'s BMA-Eintrag um
      `IO, Steu, MASI, Koppler` ergänzt (ETB-kanonischer Kern zuerst,
      Alt-Typen `ZD, ZB, TDiff, Tmax, RAS, Linear` danach, nicht entfernt).
- [x] `server_stack/netlink/main.py`: identische Ergänzung in
      `DEFAULT_MELDEPUNKT_DEFS` + `_fill_detector_colors` für
      `labels`/`kurzzeichen`.
- [x] `python3 -m py_compile` beide Dateien -- OK.

### B. WebUI Anlagentypen-Editor: Bezeichnung + Kurzzeichen editierbar
- [x] `templates/index.html`: Detector-Editor umgebaut auf Zeilen-Layout mit
      Code + Bezeichnung-Input + Kurzzeichen-Input + Farbwähler + Löschen.
- [x] `atFormAddDet()`: initialisiert `labels`/`kurzzeichen`/`colors` für neu
      hinzugefügte Detector-Codes.
- [x] `openEditAnlagentyp()`/`openNewAnlagentyp()`: Nachrüst-Guard für
      `labels`/`kurzzeichen` bei alten Settings-Dateien ergänzt.
- [x] `gridTypeText()`: liest zuerst `cellsEditorDef?.kurzzeichen?.[type]`,
      Fallback auf bestehende Map.
- [x] Render-Smoke-Test (isolierte webui-Instanz, `GET /`) — 200 OK, neue
      Editor-Markup vorhanden, Brace/Paren-Balance der ganzen Datei OK.
- [ ] Manueller Rundlauf-Test im echten Browser bleibt beim Nutzer (Bezeichnung/
      Kurzzeichen ändern, speichern, neu öffnen).

### C. Neuer netlink-Endpunkt `POST /protocols/definitions`
- [x] Eigene `load_settings`-Kopie war nicht nötig -- `load_meldepunkt_definitionen`
      (liest `settings_{mandant_id}.json` bereits direkt) genügt unverändert.
- [x] Neue Route `protocols_definitions()`, authentifiziert wie
      `auth/check`, liefert `{type_id: meldepunkt_definitionen}` für den
      Mandanten des Technikers.
- [x] Echter Funktionstest gegen isolierte netlink-Instanz — Response enthält
      alle 13 ETB+Legacy-Detektoren mit `colors`/`labels`/`kurzzeichen`
      korrekt befüllt. PASS.

### D. Android: Endpunkt-Konsum vereinheitlichen
- [x] `MainViewModel.kt`: `reloadSystemDefinitionsOnServer()` gibt echten
      Erfolg/Misserfolg zurück (`DefinitionsSyncResult` enum statt Immer-`true`).
- [x] `MainViewModel.kt`: `getFallbackDefinitionsJson()` Schlüssel auf
      `detectors`/`values` korrigiert, BMA-Liste vereinheitlicht (inkl.
      `colors`/`labels`/`kurzzeichen`); "LIRA"-Tippfehler auf "Lichtruf"
      korrigiert (stimmte vorher nie mit dem Server-type_id überein).
- [x] `MainViewModel.kt`: `createDefaultDynamicProtocol()` liest
      `detectors`/`values`; `columns` (flach beim Server) wird beim Lesen zu
      `{key,label}`-Objekten konvertiert (das braucht InspectionScreens
      ColumnModel weiterhin).
- [x] `MainViewModel.kt`: neue Funktion `getMeldepunktMeta(systemType)` +
      `MeldepunktMeta`-Datenklasse — einzige Quelle für Farbe/Bezeichnung/
      Kurzzeichen in der App.
- [x] `MainViewModel.kt`: pro-Protokoll `detectorDefsJson`-Befüllung aus
      `storeProtocolFromJson`/`storeProtocolFromSyncDto`/
      `mergeSyncDtoIntoLocal` entfernt (Room-Spalte/Migration bleibt, nur
      nicht mehr befüllt); toter `meldepunktDefsToJson`-Helper mitentfernt.
- [x] `MatrixEditScreen.kt`: `configuredColors`/neues `configuredKurzzeichen`
      jetzt aus `viewModel.getMeldepunktMeta(...)` statt
      `protocolEntity.detectorDefsJson`; `typeAbbrev` nimmt Kurzzeichen-Map
      (hartcodierte Tabelle bleibt nur Letzt-Fallback, "AM"→"N"-Fehlmapping
      dabei auf "AM"→"AM" korrigiert).
- [x] `InspectionScreen.kt`: `DetectorCell` bekommt Typ-Farbe aus
      `getMeldepunktMeta()` für noch nicht geprüfte Zellen (blasser
      Zellhintergrund + eingefärbtes Typ-Label, wie MatrixEditScreen/WebUI);
      Status-Farbe (grün/rot) bleibt unverändert führend sobald ein Prüfwert
      eingetragen ist.
- [x] `SettingsScreen.kt`: Toast-Text an echten Erfolg/Misserfolg angepasst
      (3 unterschiedliche Meldungen je nach `DefinitionsSyncResult`).
- [x] `./gradlew :app:compileDebugKotlin` nach jeder Datei-Änderung — grün.
- [x] Cross-Service-Test (Server-Seite): isolierte netlink-Instanz,
      `/protocols/definitions` liefert korrekt befüllte
      Farben/Bezeichnungen/Kurzzeichen (siehe Teil C).
- [x] Build (versionCode 10 / 2.6.0) + Install auf Test-Tablet erfolgreich.
- [ ] **Noch offen:** echter Live-Test "Anlagentypen neu laden" gegen den
      PRODUKTIVEN Server — braucht vorherigen Commit+Deploy der Server-
      Änderungen (aktuell nur lokal, Produktion hat den neuen Endpunkt noch
      nicht). Bis dahin würde der Button auf dem Tablet (das gegen den
      echten Server zeigt) einen Fehler melden (korrekt, da der Endpunkt dort
      noch fehlt) statt den Erfolgsfall zu zeigen. Manuelle Prüfung bleibt
      beim Nutzer, wie in diesem Projekt üblich.
- [x] Regressionstest: `getFallbackDefinitionsJson()`-Pfad in sich
      konsistent (gleiche Struktur wie echter Server-Payload), keine
      Sonderbehandlung nötig -- durch Code-Review bestätigt.

### Abschluss
- [x] Gesamtdiff review (`git diff --stat`) -- siehe unten.
- [ ] Commit (nur auf explizite Nutzer-Anfrage, wie in diesem Projekt üblich).
- [ ] Deploy (Portainer-Redeploy + APK-Build/Install/Chat-Versand, wie in
      diesem Projekt üblich).

## Nicht im Scope (bewusst zurückgestellt)

- `server_stack/protocol_core/worker.py` (PDF-Melderliste): bleibt
  unverändert, kein Typ/Legende im PDF — separates späteres Vorhaben.
