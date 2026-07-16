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
- [x] **Bug gefunden + behoben nach erstem Live-Test:** Server lieferte laut
      Produktions-Logs (via Portainer-API geprüft) durchgehend `200 OK` für
      `/protocols/definitions`, die App zeigte trotzdem "Server nicht
      erreichbar". Ursache: `loadSystemDefinitions(): Response<String>` ließ
      Retrofit/Gson den (von CryptoInterceptor bereits entschlüsselten) JSON-
      OBJEKT-Body durch Gsons String-TypeAdapter laufen, der nur einen JSON-
      String-Literal akzeptiert und bei `{` (BEGIN_OBJECT) eine Exception
      wirft -- die vom Catch-Block als "Server nicht erreichbar" gemeldet
      wurde. `downloadProtocol()`s gleichnamiges `Response<String>`
      funktioniert nur zufällig (dessen Payload ist kein gültiges UTF-8-JSON,
      der CryptoInterceptor scheitert dort schon beim Auto-Decrypt und reicht
      den rohen verschlüsselten Text unverändert durch, der Aufrufer
      entschlüsselt selbst manuell -- ein komplett anderer, nicht
      übertragbarer Pfad). Fix: `Response<ResponseBody>` statt
      `Response<String>`, umgeht Gson komplett.
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

## Nachfassende Verbesserungen (nach erstem Live-Test)

- [x] **1. Android MatrixEditScreen-Palette**: `detChoices` bezieht die
      Auswahl jetzt zuerst aus `getMeldepunktMeta(systemType)?.detectors`
      (frisch synchronisiert), Fallback auf `protocolEntity.detectorTypesJson`,
      dann Hardcoded-Minimum.
- [x] **2. Melderliste nach Gruppennummer sortieren**: `devices`-Berechnung
      sortiert `grps` jetzt numerisch-bewusst nach dem Suffix hinter "::" --
      da das innerhalb von `remember(groupsState, ...)` passiert, sortiert
      sich die Liste automatisch neu, sobald `groupsState` sich nach einem
      `updateGroupDetails`/`addGroupToDevice`-Schreibvorgang ändert (kein
      Neuladen nötig).
- [x] **3. WebUI Leerfeld ("-") nicht löschbar**: "×"-Button erscheint jetzt
      nur noch für `d !== '-'`.
- [x] **4. WebUI Meldepunkttypen per Drag&Drop neu anordnen**: natives HTML5
      Drag&Drop (kein neues JS-Abhängigkeit), Greifpunkt "⠿" nur bei echten
      Typen (nicht bei "-", das bleibt fix an erster Stelle und ist weder
      zieh- noch drop-Ziel). Reihenfolge ist einfach die Array-Reihenfolge
      von `detectors` -- wirkt sich automatisch überall aus, wo diese Liste
      gelesen wird (WebUI-Grid-Palette, Android-Palette via Punkt 1, PDF
      falls später gebraucht), ohne weitere Verdrahtung.
      Render-Smoke-Test (isolierte webui-Instanz) — 200 OK, neue Markup
      vorhanden, Brace/Paren-Balance OK.
- [x] **5. Vorbereitung Lichtruf-Auslöseliste** (nächstes Vorhaben, noch NICHT
      umgesetzt): `Muster_Lichtrufanlage.xlsx` gesichtet. Struktur ist
      grundlegend anders als BMA:
      - Zeilen = **Räume** (Raum-Nr. + Bezeichnung), nicht Meldergruppen.
      - Spalten = **feste, benannte Bauteil-Typen** pro Raum (ZT, ZL, RT B1,
        RT B2, RT B3, RT, PT Bad, RT Bad, ZT Bad, AT Bad) statt dynamisch
        durchnummerierter Melder-Spalten 1..N -- die Spalte selbst ist der
        Typ, nicht frei pro Zelle wählbar.
      - Zusätzliche **"o.k."-Spalte** je Raum (ein raumweiter Sammelstatus,
        kein Bauteil-Einzelwert).
      - Defekte werden über **nummerierte Fehlercodes** (*1 mech. Defekt, *2
        Taste klemmt, ... bis *15) statt eines einfachen "Def."/Perioden-
        Werts eingetragen, mit einer Legende am Blattende.
      - Datum/Unterschrift-Zeile am Ende statt der BMA-typischen Quartals-
        Struktur.

      Das heutige Meldergruppen/Melder-Nummer-Datenmodell (dynamische
      Spaltenzahl, ein Wert pro Zelle aus der Perioden-Palette) passt nicht
      direkt -- Lichtruf braucht feste benannte Spalten pro Raum plus ein
      Fehlercode-Vokabular statt eines Zeitraum-Vokabulars. Wird als eigenes
      Vorhaben separat geplant, sobald angefordert.

## Nachfassende Verbesserungen, Runde 2: Meldegruppe direkt löschen/hinzufügen

Bisher musste man zum Löschen einer bestimmten Meldegruppe deren Nummer auf
den höchsten Wert umsortieren und dann den "Gruppen"-Stepper um eins
verringern (der immer nur die LETZTE Gruppe entfernte). Ersetzt durch:
direktes Löschen einer beliebigen Zeile (mit Rückfrage) + eine
"Meldegruppe hinzufügen"-Zeile am Ende statt des Steppers. Für beide Editoren
(Web + Android).

- [x] **Android `MainViewModel.kt`**: `removeLastGroupFromDevice(protocolId,
      devicePrefix)` ersetzt durch `removeGroupFromDevice(protocolId,
      groupId)` -- löscht eine beliebige Gruppe (Cells + Group-Row,
      transaktional) statt zwingend die letzte. `addGroupToDevice` war
      bereits korrekt (hängt neue Gruppe ans Ende) -- unverändert.
- [x] **Android `MatrixEditScreen.kt`**: `showRemoveGroupDialog`
      (Boolean) ersetzt durch `groupPendingDelete`
      (`ProtocolGroupEntity?`) -- Dialog jetzt pro Zeile statt fix auf die
      letzte Gruppe. "Gruppen"-Stepper aus dem Geräte-Header entfernt
      (Anzahl steht weiterhin in der Subtitle-Zeile). Neue Lösch-Spalte
      (`deleteColWidth`, Papierkorb-Icon) in der eingefrorenen Spalte pro
      Zeile, mit Toast-Guard bei `device.groups.size <= 1` (letzte Gruppe
      kann nicht entfernt werden). Neue "+ Meldegruppe hinzufügen"-Zeile
      unter dem Grid, ruft `addGroupToDevice` auf (Guard bei >= 200).
      `./gradlew :app:compileDebugKotlin` -- grün.
- [x] **WebUI `templates/index.html`**: neue Alpine-Funktionen
      `gridDeleteGroup(rIdx)` (mit `confirm()`-Rückfrage, re-keyed alle
      Zellen nach dem gelöschten Index um eins herunter -- `gridCells` sind
      POSITIONAL nach Zeilenindex geschlüsselt, nicht nach Gruppennummer,
      das musste beim Löschen einer mittleren Zeile beachtet werden) und
      `gridAddGroup()` (hängt eine neue Gruppe mit nächsthöherer Nummer ans
      Ende an). Das alte "Gruppen:"-Zahlenfeld im Toolbar entfernt; neue
      Papierkorb-Spalte pro Zeile + "Meldegruppe hinzufügen"-Zeile unter der
      Tabelle (nur im Editier-, nicht im Lesemodus). Render-Smoke-Test
      (isolierte webui-Instanz, `GET /`) -- 200 OK, neue Funktionen/Markup
      vorhanden, alte "Gruppen:"-Beschriftung weg.
- [ ] Manueller Rundlauf-Test im echten Browser + auf dem Testgerät bleibt
      beim Nutzer.
- [ ] Commit + Deploy (nur auf explizite Nutzer-Anfrage).
