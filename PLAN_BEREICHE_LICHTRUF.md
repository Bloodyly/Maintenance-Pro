# Lichtruf-Vokabular + Bereiche (Sektionen) für Auslöselisten

Persistente, abhakbare Arbeits-Checkliste. Voller Kontext/Begründung im
Claude-Plan `.claude/plans/immutable-stirring-donut.md` (falls noch
vorhanden). Bei Unterbrechung: ersten unabgehakten Punkt nehmen.

## Ausgangslage (Kurzfassung)

1. Lichtruf-Anlagentyp trägt Platzhalter-Vokabular ohne Bezug zur echten
   Zimmermodul-Terminologie -- soll auf die reale Musterliste umgestellt
   werden. Strukturell fast identisch zu BMA (Räume=Meldegruppen,
   Modul-Slots=Melder-Slots, Prüfwerte=Quartal/Halbjahr/Jahr oder Defekt).
2. Neues generisches Feature "Bereiche": Meldegruppen einer Anlage können
   zu benannten Abschnitten gruppiert werden (z.B. "Station 1/2/3").
   Definition + Zuordnung nur im WebUI. Anzeige als Sektions-Header in
   WebUI-Grid + PDF, sobald mind. eine Zuordnung existiert. Android
   Ausfüllmodus bleibt in dieser Runde unverändert (bewusste
   Scope-Entscheidung).

**Architektur:** `protocol_groups` = ein Gerät/Anlage, NICHT eine
Meldegruppe. Meldegruppen (Räume) leben als JSON-Registry
`[[grp_num, name], ...]` in einer `group_cells`-Zeile mit
`slot_key='__rows__'`. Bereiche werden als Erweiterung dieses JSON-Blobs
gebaut: Registry-Einträge werden 3-elementig `[grp_num, name, bereich]`,
plus eine neue parallele `group_cells`-Zeile `slot_key='__bereiche__'` mit
der geordneten Liste der Bereichsnamen. **Keine SQL-Schema-Änderung, keine
Android-Room-Migration.**

---

## Teil A: Lichtruf-Vokabular korrigieren

- [x] `server_stack/webui/app.py`: `DEFAULT_ANLAGENTYPEN`'s `Lichtruf`
      (`:356-365`) + `system_settings["Lichtruf"]` (`:503`) auf
      `detectors: ["-", "ZT", "ZL", "RT B1", "RT B2", "RT B3", "RT",
      "PT Bad", "RT Bad", "ZT Bad", "AT Bad"]`,
      `values: ["CHECK", "H1", "H2", "Def."]` umgestellt, inkl.
      `KNOWN_DETECTOR_KURZZEICHEN`-Ergänzung (Labels defaulten bewusst auf
      den Code selbst -- keine erfundene Fachterminologie, da nicht
      dokumentiert; über den WebUI-Editor jederzeit nachträglich anpassbar).
- [x] `server_stack/netlink/main.py`: identische Änderung in
      `DEFAULT_MELDEPUNKT_DEFS["Lichtruf"]` (`:331`) + gespiegelte
      `KNOWN_DETECTOR_KURZZEICHEN`.
- [x] Android `MainViewModel.kt`: identische Änderung in
      `getFallbackDefinitionsJson()`s `Lichtruf`-Eintrag (`:1549-1553`).
- [x] `columns`-Default für Lichtruf auf 10 angehoben (webui + netlink
      Fallback + Android Fallback).
- [x] Verifikation: `python3 -m py_compile` beide Dateien -- OK.
      `./gradlew :app:compileDebugKotlin` -- BUILD SUCCESSFUL (nur
      vorbestehende, unabhängige Warnings). Render-Smoke-Test (isolierte
      webui-Instanz): `fill_detector_colors()` befüllt alle 10 Module mit
      Farbe/Kurzzeichen korrekt, `GET /` liefert 200 mit "Lichtrufanlage"
      im Markup.

## Teil B: Bereiche -- Datenmodell + WebUI CRUD + Grid-Anzeige

### B1. Server: Registry-Erweiterung
- [x] `webui/app.py`: `_device_registry_to_grid()`/`_grid_to_device_registry()`
      um 3. Feld (`bereich`) erweitert, rückwärtskompatibel.
- [x] `webui/app.py`: `_load_bereiche()`/`_save_bereiche()` Helfer für die
      neue `__bereiche__`-Registry-Zeile (mirrors `_device_hardware_to_rows`/
      `_hardware_rows_to_device`).
- [x] `webui/app.py`: `get_cells()`/`save_cells()` liefern/nehmen
      `bereiche`-Liste entgegen. **Vereinfachung ggü. Plan**: keine
      `{old,new}`-Rename-Paare im Wire-Format nötig -- der Client propagiert
      Umbenennungen selbst in `gridGroups[i].bereich` BEVOR gespeichert wird
      (er hat die Gruppenliste ohnehin im Speicher), der Server persistiert
      einfach was er bekommt.
- [x] **Bugfix während Umsetzung entdeckt**: `_grid_to_device_registry()`s
      Blanket-`DELETE ... slot_key != '__hardware__'` hätte die neue
      `__bereiche__`-Zeile bei jedem Melderlisten-Save gelöscht (wie es das
      bereits für `__hardware__` explizit ausschließt) -- Fix: Ausschluss auf
      `NOT IN ('__hardware__', '__bereiche__')` erweitert.
- [x] `netlink/main.py`: `build_device_rows_payload()`s
      `for grp_num, grp_name in registry:` hätte bei einem 3-elementigen
      Registry-Eintrag (sobald webui einen Bereich zuweist) mit
      `ValueError: too many values to unpack` abgestürzt und den kompletten
      Android-Sync für dieses Protokoll lahmgelegt -- auf defensives
      `entry[0]`/`entry[1]`-Indexing umgestellt (kein `for a,b in registry`
      mehr). Sonst keine Änderung nötig, da Android das 3. Feld nicht
      verbraucht.
- [x] Verifikation (isolierte Instanz, `test_bereiche.py`): Anlegen mit
      2 Bereichen + 1 unzugewiesener Gruppe, Umbenennen, Löschen (Gruppen
      fallen auf "kein Bereich" zurück, Liste schrumpft), Speichern OHNE
      `bereiche`-Feld im Payload (simuliert einen älteren/anderen Client) --
      Bereiche-Liste bleibt unangetastet. Alle 4 Szenarien PASS.
- [x] Verifikation `netlink/main.py`: `build_device_rows_payload()` gegen
      dieselbe Test-DB mit 3-elementigen Registry-Einträgen aufgerufen --
      kein Crash, alle 4 Wire-Rows korrekt erzeugt.

### B2. WebUI: "Bereiche verwalten"-Modal + Zuordnung inline im Grid
- [x] Neuer Button "Bereiche verwalten" im Grid-Editor-Toolbar (neben ETB-
      Import), öffnet ein Modal im Stil des ETB-Vorschau-Modals (z-[70],
      über dem Cells-Editor).
- [x] Modal: Liste hinzufügen/umbenennen (inline Text-Input)/löschen (mit
      `confirm()`)/Drag&Drop-Reorder (identisches Muster zu
      `atFormReorderDet`, jetzt auf Record-Array statt String-Array).
      **Vereinfachung ggü. ursprünglichem Plan**: keine Server-Rename-Paare
      nötig -- `bereicheSave()` propagiert Umbenennungen/Löschungen selbst
      in `gridGroups[i].bereich`, BEVOR `cellsEditorBereiche` committet
      wird; der Server bekommt beim nächsten Speichern einfach den fertigen
      Zustand.
- [x] Neue "Bereich"-Auswahlspalte (`<select>`) pro Grid-Zeile, nur
      sichtbar sobald `cellsEditorBereiche.length > 0` (kein Leerzustand-
      Rauschen für Anlagen ohne dieses Feature).
- [x] Anzeige-Aufteilung: `gridDisplayRows()` liefert eine flache Liste aus
      `{kind:'header', label}`/`{kind:'data', rIdx}`-Einträgen (Header und
      Datenzeilen sind separate Array-Einträge, damit jede Iteration exakt
      eine `<tr>` ergibt -- vermeidet die Unsicherheit, ob Alpines `x-for`
      mehrere Wurzel-Elemente pro Iteration unterstützt). `rIdx` bleibt
      durchgehend der ORIGINALE `gridGroups`-Index für alle Zell-/Lösch-
      Lookups (`gridCell`, `gridDeleteGroup`, `gridStartPaint`, ...) --
      nur die Anzeige-Reihenfolge ändert sich, nie die Cell-Adressierung.
- [x] `gridFromJson()`/`gridToJson()`/`gridInitEmpty()`/`gridApplyConfig()`/
      `gridAddGroup()` um das 3. Feld (`bereich`) erweitert, inkl.
      Bereichs-Erhalt beim ETB-Reimport (`preserveValues`-Pfad).
- [x] Regressionscheck: Anlage ohne jemals definierten Bereich --
      `gridDisplayRows()` liefert reine Datenzeilen in Originalreihenfolge,
      keine Header, keine "Bereich"-Spalte sichtbar (Spalte erscheint erst
      sobald der erste Bereich definiert wurde).
- [x] Verifikation (echte JS-Ausführung via quickjs, extrahiert aus
      `index.html`): alle Szenarien PASS -- kein Bereich (flache Liste),
      Bereich anlegen+zuordnen (korrekte Header/Daten-Interleaving inkl.
      "Ohne Bereich"-Sektion), `gridToJson`/`gridFromJson`-Rundtrip erhält
      `bereich` pro Gruppe, Umbenennen propagiert in alle zugeordneten
      Gruppen, Löschen setzt betroffene Gruppen auf "kein Bereich" zurück
      (keine Gruppe verschwindet), `gridAddGroup`/`gridDeleteGroup` aus der
      letzten Runde funktionieren unverändert weiter.
- [x] Render-Smoke-Test (isolierte webui-Instanz, `GET /`): 200 OK, neue
      Funktionen/Markup vorhanden.

### B3. PDF
- [x] `worker.py`: `expand_device()` lädt `__bereiche__`, taggt jede Zeile
      mit `bereich`, sortiert `rows` in Bereichs-Reihenfolge (unzugewiesen
      zuletzt) NUR wenn mindestens eine Zeile einen Bereich trägt --
      ansonsten exakt Original-Reihenfolge (keine Regression). Wichtig:
      `rows_data` selbst bekommt KEINE synthetischen Header-Einträge
      (hätte `compute_layout()`/`build_summary()` kaputt gemacht, die
      dieselbe Liste konsumieren) -- die Header-Zeilen werden ausschließlich
      lokal in `build_matrix_table()`s eigener `table_data` eingefügt.
- [x] `build_matrix_table()`: erkennt Bereichswechsel zwischen
      aufeinanderfolgenden Zeilen, fügt volle-Breite-Header-Zeile ein
      (`SPAN` + Hintergrund/Fettschrift-Style), inkl. "Ohne Bereich"-Sektion
      für unzugewiesene Zeilen, nur wenn mindestens eine Zuordnung existiert.
- [x] Verifikation (isolierte Instanz): 4 Meldegruppen, 2 Bereiche + 1
      unzugewiesen -- PDF-Tabellenzeilen zeigen korrekte Section-Header in
      richtiger Reihenfolge mit richtig zugeordneten Datenzeilen darunter.
      Regressionstest: Gerät ohne jemals definierten Bereich (inkl.
      Alt-Registry mit 2-elementigen Einträgen) -- exakt 1 Header + N
      Datenzeilen, keine Section-Header injiziert.

### Verifikation (gesamt)
- [x] Funktionstest gegen isolierte webui-Instanz: Bereiche anlegen,
      zuordnen, speichern, neu laden, Zellwerte pro Sektion geprüft
      (korrekte positionale Zuordnung über 3 Speicher-Runden), umbenennen,
      löschen -- alle PASS (`test_bereiche.py`).
- [x] Echte JS-Ausführung (quickjs) für den kompletten Client-seitigen
      Bereiche-Workflow inkl. Regressionscheck für die Runde davor
      (`gridAddGroup`/`gridDeleteGroup`) -- alle PASS (`test_bereiche_js.py`).
- [x] Regressionstest: Gerät ohne Bereiche unverändert (WebUI-Grid UND PDF).
- [x] PDF-Test: mit/ohne Bereiche, korrekte Section-Header-Reihenfolge und
      Datenzeilen-Zuordnung.
- [x] `python3 -m py_compile` für `webui/app.py`, `netlink/main.py`,
      `protocol_core/worker.py` -- alle OK.
- [x] `./gradlew :app:compileDebugKotlin` (Teil A betrifft Android-Fallback)
      -- BUILD SUCCESSFUL.
- [ ] Manueller Rundlauf-Test im echten Browser (Bereiche-Modal bedienen,
      Drag&Drop-Reorder, Speichern/Neuladen) + ein echter PDF-Export mit
      Bereichen bleibt beim Nutzer.

## Nicht im Scope (diese Runde)

- ~~Android-Ausfüllmodus zeigt keine Bereichs-Sektionen~~ -- **überholt**,
  siehe Teil C unten (Nutzer hat diese Entscheidung explizit aufgehoben).
- Defekt-Detailcodes für Lichtruf (vom Nutzer als zweitrangig markiert,
  weiterhin nicht im Scope).

## Teil C: Android -- Bereiche anzeigen (Kapitel-Pillenleiste) + bearbeiten (Struktur-Editor)

Voller Kontext im Claude-Plan `.claude/plans/immutable-stirring-donut.md`.
UI-Vorschläge vorab als interaktives Artifact gezeigt und vom Nutzer
entschieden: Android = Variante A (Pillenleiste oben, springt zu Sektionen),
WebUI = Variante B (3-Spalten-Shuttle mit Drag&Drop + Pfeilen, ersetzt Teil
B2s Inline-Dropdown-Spalte).

- [x] C1. `netlink/main.py`: `build_device_rows_payload` liefert `bereich`
      pro Zeile mit; neue `build_device_bereiche_payload()` (Muster
      `build_device_hardware_payload`); beide Sync-Routen
      (`_build_protocol_sync_payload` UND `sync_delta`s Inline-Dict, zwei
      getrennte Stellen) bekommen den neuen `"bereiche"`-Key.
      Verifiziert per echtem HTTP-Request (Flask-Test-Client, echte
      AES-GCM-Verschlüsselung via `crypto_reference.py`) gegen `sync_full`:
      `bereiche`/`bereich`-Felder korrekt befüllt.
- [x] C2. `netlink/main.py`: neues `group_changes`-Feld in
      `sync_upload_cells` (Muster `hardware_changes`), neue
      `apply_bereich_change_to_device()` -- reassignt eine Meldegruppe,
      legt einen neuen Bereichsnamen automatisch in `__bereiche__` an falls
      noch unbekannt. LWW-Schutz über den `updated_at`-Zeitstempel der
      Registry-Zeile (gleiche Granularität wie group_name-Änderungen).
      Verifiziert per echtem HTTP-Request: erfolgreiche Zuordnung +
      automatisches Anlegen eines neuen Bereichsnamens, UND ein zu alter
      (älterer Timestamp) Nachzügler-Request wird korrekt verworfen
      (`applied: 0`).
- [x] C3. Android Room: `ProtocolGroupEntity.bereich` + `updatedAt` (für
      Delta-Sync-Erkennung), neue `BereicheTableEntity` (Muster:
      `HardwareTableEntity`), `MIGRATION_9_10`, `@Database version = 10`,
      DAO-Erweiterung `updateBereich(...)`/`getChangedSince(...)`, neuer
      `BereicheTableDao`. `./gradlew :app:compileDebugKotlin` -- BUILD
      SUCCESSFUL.
- [x] C4. Android `ApiService.kt`: `SyncRowDto.bereich`, neues
      `BereicheTableDto` (Muster `HardwareTableDto`),
      `SyncProtocolDto.bereiche`, neues `SyncGroupChangeDto`,
      `SyncUploadCellsDto.group_changes`. Kompiliert.
- [x] C5. Android `MainViewModel.kt`: `storeProtocolFromSyncDto` übernimmt
      `bereich` + befüllt `BereicheTableEntity`; `mergeSyncDtoIntoLocal`
      gezielt um Bereich-Update für bestehende Gruppen erweitert (LWW über
      `proto.updated_at` vs. der Gruppe eigenen `updatedAt`, da das Wire-
      Format keinen Pro-Zeile-Zeitstempel für Strukturfelder kennt --
      **Erkenntnis während Umsetzung**: `SyncUploadCellsDto` hatte bisher
      GAR KEIN `hardware_changes`-Feld im Android-Client trotz
      Server-Unterstützung dafür -- Hardware läuft stattdessen über den
      separaten "Abschließen"-Queue-Pfad. `group_changes` daher analog zum
      bereits funktionierenden `changes`-Sammelmechanismus gebaut
      (`collectLocalGroupChanges`, gleiche "seit letztem Sync"-Logik wie
      `collectLocalChanges`), nicht blind `hardware_changes` nachgeahmt.
      Neue `getBereicheForDevice()`/`updateGroupBereich()` (inkl. Auto-
      Anlegen neuer Bereichsnamen). Kompiliert.
- [x] C6. Android `MatrixEditScreen.kt`: neue "Bereich"-Auswahl pro Zeile
      (bestehende Bereiche + "+ Neuer Bereich…"), write-through wie
      `GroupNameField`. Neue `BereichPickerCell` (DropdownMenu-Muster wie
      SearchScreen/ArchiveScreen), neuer Text-Eingabe-Dialog für neue
      Bereichsnamen. Kompiliert.
- [x] C7. Android `InspectionScreen.kt`: `RowModel.bereich`, neuer
      `DisplayEntry`-Sealed-Type (Header/Data), pro-Gerät gruppierte
      Anzeige-Reihenfolge (`displayEntries`, aus `bereicheMap` via neuer
      `getBereicheMapForProtocol()`), beide Spalten-Stacks (GRP/Bezeichnung
      UND scrollbare Melder-Zellen) + Drag-Select-Pixel-Mathematik
      (`onDragStart`/`onDragEnd`) auf `displayEntries`-Indizes umgestellt
      (Header-Treffer = No-Op). Neue Kapitel-Pillenleiste (Variante A) mit
      `verticalScrollState.animateScrollTo(entryIndex * cellHeightPx)`, nur
      sichtbar wenn mind. ein Header-Eintrag existiert. Kompiliert.
- [x] Verifikation: `python3 -m py_compile` netlink -- OK. Funktionstest
      gegen isolierte netlink-Instanz per echtem HTTP-Request (Flask-Test-
      Client + echte AES-GCM-Verschlüsselung): `sync_full` liefert
      `bereiche`/`bereich` korrekt, `group_changes`-Upload (inkl. neuem
      Bereichsnamen) angewendet, LWW verwirft einen zu alten Nachzügler
      korrekt. `./gradlew :app:compileDebugKotlin` nach jeder Datei --
      durchgehend BUILD SUCCESSFUL.
- [ ] Manueller Rundlauf-Test (Tablet/Handy) bleibt beim Nutzer.

### Nachfassende Korrektur (nach erstem Screenshot-Feedback)

Auf dem Handy blieb im Editor (BMA) nur ein minimaler Teil der Melder-Spalten
sichtbar, da Grp+Bezeichnung+Bereich zusammen als fixierte Spalten fast die
ganze Bildschirmbreite belegten.

- [x] `MatrixEditScreen.kt`: nur noch die Grp-Spalte ist fixiert; Bezeichnung
      scrollt jetzt zusammen mit den Melder-Spalten (gleicher
      `hScroll`-Container, aber außerhalb der pointerInput-Box für die
      Paint-Auswahl, damit deren Spalten-Index-Mathematik unverändert
      bleibt). Inline-Bereich-Spalte pro Zeile entfernt, ersetzt durch einen
      "Bereiche"-Button im Geräte-Header, der eine neue
      `BereicheAssignDialog` (Vollbild) öffnet: Bereich oben als Chip
      auswählen (inkl. "+ Neu"), darunter eine Liste aller Meldegruppen zum
      Antippen (Toggle Zuordnung) -- Touch-Äquivalent zu den WebUI-Pfeilen,
      da Drag&Drop auf einer einzelnen Handy-Liste keinen Mehrwert hätte.
- [x] `InspectionScreen.kt`: gleiche Korrektur für den Ausfüllmodus -- nur
      Grp bleibt fixiert, Bezeichnung ist jetzt Teil derselben horizontal
      scrollenden Zeile wie die Melder-Zellen. Die Rubber-Band-Drag-Select-
      Pixel-Mathematik (`originCol`, `cLeft`) wurde um einen
      `bezeichnungColWidthPx`-Offset erweitert, damit Spaltenindizes
      weiterhin korrekt auf die richtigen Melder-Zellen treffen.
- [x] `./gradlew :app:compileDebugKotlin` nach beiden Dateien -- BUILD
      SUCCESSFUL. Build (versionCode 16 / 2.7.1) + APK-Versand.

### Zweite Nachfass-Runde (Bereich-Überschrift + Doppel-Abfrage + fehlendes Umbenennen/Löschen)

- [x] `InspectionScreen.kt`: die Sektions-Header-Balken (leere Zeilen der
      Bereichsteilung) zeigten den Bereichsnamen gar nicht mehr an -- beim
      Umbau auf "Bezeichnung scrollt mit" wurde der `Text(entry.label...)`
      versehentlich nicht in den neuen kombinierten Header-Balken übernommen
      (nur eine leere farbige Box blieb übrig). Fett ergänzt.
- [x] `MatrixEditScreen.kt`: **Bug behoben** -- beim Anlegen eines neuen
      Bereichs über "+ Neu" wurde der Name entgegengenommen, aber statt ihn
      direkt zu verwenden, öffnete das UI zusätzlich den alten (aus der
      vorherigen Inline-Dropdown-Ära stammenden, eigentlich toten)
      "Neuer Bereich"-Dialog, der ERNEUT nach dem Namen fragte. Alter Dialog
      (`newBereichDialogFor`/`newBereichText`) + `onRequestNew`-Parameter
      komplett entfernt; "+ Neu" ruft jetzt direkt eine neue
      `MainViewModel.addBereichToDevice()` auf (legt den Bereich an, OHNE
      ihn einer Gruppe zuzuweisen -- vorher musste willkürlich Gruppe 1 als
      "Träger" herhalten).
- [x] `MainViewModel.kt`: zwei neue Funktionen `renameBereichForDevice()`
      und `deleteBereichForDevice()` (mirror der WebUI-Logik: Umbenennen
      propagiert auf alle zugeordneten Gruppen inkl. Merge falls der neue
      Name bereits existiert; Löschen entfernt aus der Bereichs-Liste und
      setzt betroffene Gruppen auf "kein Bereich" zurück, löscht keine
      Gruppen). Beide markieren betroffene Gruppen mit neuem `updatedAt`,
      sodass die Änderung über den bestehenden `group_changes`-Sync-Pfad
      automatisch mit hochgeladen wird -- kein neuer Server-Vertrag nötig.
- [x] `MatrixEditScreen.kt`: `BereicheAssignDialog` bekommt Stift-/Papierkorb-
      Icons neben dem gerade ausgewählten Chip (Umbenennen öffnet ein
      Textfeld-Dialog, Löschen fragt zurück wie überall sonst in diesem
      Projekt).
- [x] `./gradlew :app:compileDebugKotlin` -- BUILD SUCCESSFUL, keine neuen
      Warnings.

## Teil D: WebUI -- Shuttle-Editor (ersetzt Inline-Dropdown aus Teil B2)

- [x] Neue 3-Spalten-Ansicht in der "Bereiche verwalten"-Modal (auf
      `max-w-3xl` verbreitert): Bereiche (Klick wählt für die Zuordnung
      aus, weiterhin Umbenennen/Löschen/Drag&Drop-Reorder) · Verfügbar
      (alle Gruppen außer dem ausgewählten Bereich, inkl. Gruppen anderer
      Bereiche -- direktes Umsortieren zwischen Bereichen möglich) ·
      Zugewiesen, mit Pfeil-Buttons UND Drag&Drop zwischen den beiden
      Spalten. Neu angelegter Bereich wird automatisch ausgewählt;
      `bereicheDeleteAt()`/`bereicheReorder()` halten die Auswahl korrekt
      am gemeinten Bereich fest (nicht am Index-Slot).
- [x] Inline-`<select>`-Bereich-Spalte im Haupt-Grid entfernt (Zuordnung
      nur noch über die Shuttle-Ansicht) inkl. der zugehörigen
      `<col>`/`<th>`-Einträge und Colspan-Korrektur; Sektions-Header-
      Anzeige im Grid bleibt unverändert bestehen.
- [x] Verifikation: Render-Smoke-Test (isolierte webui-Instanz) -- 200 OK,
      neue Shuttle-Funktionen im Markup, alte Select-Option-Strings weg.
      Echte JS-Ausführung (quickjs) des kompletten Shuttle-Workflows:
      Auto-Auswahl bei Neuanlage, Zuweisen/Entfernen per
      `shuttleAssignGroup`/`shuttleUnassignGroup`, Umsortieren zwischen zwei
      Bereichen, Umbenennen-Propagierung UND Löschen-mit-Auswahl-Anpassung
      -- alle Szenarien PASS, inkl. der Interaktion aus vorherigem
      Zuweisen+Umbenennen+Löschen in derselben Sitzung.

## Teil E: Nachfassende Korrektur -- Lichtruf-Editor-Verhalten (WebUI)

Auslöser: Nutzer-Feedback nach Teil A-D --
1. ETB-Import kann strukturell nie Lichtruf-Daten liefern (der ESSER-Parser
   liefert ausschließlich BMA-Meldertypen) und darf daher im Editor für
   Lichtruf-Geräte gar nicht erst angeboten werden.
2. Lichtruf ist spaltentechnisch fix wie die Muster-xlsx aufgebaut (Raum-
   Nr./Bezeichnung + je eine feste Spalte pro Modul: ZT, ZL, RT B1, RT B2,
   RT B3, RT, PT Bad, RT Bad, ZT Bad, AT Bad). Die Spaltenanzahl wird im
   Alltag nie verändert -- nur Räume (Meldegruppen) werden manuell
   angelegt, Module werden per Zeichen-Tool pro Zelle (de)aktiviert.
3. Der "Bereiche verwalten"-Button fehlte für (mindestens manche)
   Lichtruf-Geräte komplett.

Root Cause für (3): `openCellsEditorInner()`s Auto-Umschaltung auf
Grid-Format prüfte nur `dev.type === 'BMA' || dev.type === 'EMA'`. Ein
Lichtruf-Gerät, das (noch) im alten Flat-Format vorlag, blieb dauerhaft im
Flat-Modus -- und damit blieb die GESAMTE Grid-Toolbar (inkl. ETB-Import
UND Bereiche-Button) unsichtbar. Fix für (3) behebt automatisch auch den
Zugriff auf die Bereiche-Verwaltung für betroffene Lichtruf-Geräte.

- [x] `templates/index.html`: `openCellsEditorInner()` -- Auto-Umschaltung
      auf Grid-Format um `dev.type === 'Lichtruf'` erweitert; `n_cols` für
      neu initialisierte Lichtruf-Grids wird aus
      `cellsEditorDef.detectors.length - 1` (ohne den `-`-Platzhalter)
      abgeleitet, statt dem BMA/EMA-Standard von 20.
- [x] `templates/index.html`: "Melder max."-Steller im Grid-Toolbar per
      `x-if="cellsEditorDevice?.type !== 'Lichtruf'"` für Lichtruf
      ausgeblendet (Spaltenanzahl bleibt fix an die Modulliste gekoppelt,
      kein manuelles Verändern nötig/sinnvoll).
- [x] `templates/index.html`: "ETB importieren"-Button im Grid-Toolbar
      ebenso per `x-if` für Lichtruf ausgeblendet; Hardware-Tab-Hinweistext
      ("...oder per ETB-Import automatisch befüllen lassen") für Lichtruf
      auf eine Variante ohne ETB-Erwähnung umgeschaltet.
- [x] `templates/index.html`: neue Methode `gridColHeaderLabel(c)` --
      zeigt für Lichtruf-Geräte den echten Modulnamen (z.B. "RT B1") als
      Spaltenkopf statt der laufenden Nummer, in exakt der Reihenfolge aus
      `cellsEditorDef.detectors` (ohne `-`). Andere Anlagentypen (BMA/EMA)
      zeigen weiterhin die reine Positionsnummer, da ihre Spalten keine
      feste Modul-Bedeutung haben.
- [x] Verifikation: Template-Tag-Balance geprüft (109 `<template>`-Öffnungen
      / 109 Schließungen, unverändert nach den Edits). Neue/geänderte JS-
      Logik (`gridColHeaderLabel`, die erweiterte Auto-Grid-Umschaltung)
      per quickjs-Harness real ausgeführt: Lichtruf-Flat-Gerät schaltet
      jetzt korrekt auf Grid mit `n_cols=10` um, Default-Paint-Type wird
      korrekt gesetzt, Spaltenköpfe zeigen die 10 Modulnamen in der
      richtigen Reihenfolge; BMA bleibt unverändert (n_cols=20, numerische
      Spaltenköpfe) -- alle 4 Szenarien PASS.
- [ ] Noch nicht deployed -- wie üblich erst nach expliziter Nutzer-
      Aufforderung ("commit und deploy" o.ä.) commiten/pushen/Portainer-
      Stack neu ausrollen.

## Teil F: Nachfassende Korrektur -- "Raum hinzufügen", Kopfzeile, Add-Bug, stale Settings

Auslöser: Nutzer-Feedback nach Teil E -- Button "Meldegruppe hinzufügen" soll
bei Lichtruf "Raum hinzufügen" heißen, Tabellenkopf "Grp" soll bei Lichtruf
"Raum" heißen, und der Button hatte laut Nutzer "aktuell keinen Effekt".

- [x] `templates/index.html`: "Grp"-Kopfzelle zeigt jetzt
      `x-text="cellsEditorDevice?.type === 'Lichtruf' ? 'Raum' : 'Grp'"`.
- [x] `templates/index.html`: Add-Row-Button-Label zeigt jetzt
      `x-text="cellsEditorDevice?.type === 'Lichtruf' ? 'Raum hinzufügen' : 'Meldegruppe hinzufügen'"`.
- [x] Root-Cause-Suche zum "keine weitere Zeile einfügbar"-Report: `gridAddGroup()`/
      `gridDisplayRows()` real (per quickjs) gegen die ECHTEN Live-Daten des
      Nutzers getestet (Protokoll PRO-15503, Gerät G15503000, via Produktions-
      API abgerufen: n_groups=11, n_cols=5) -- die Zeile wird technisch
      korrekt hinzugefügt (12. Gruppe erscheint in `gridGroups`/
      `gridDisplayRows()`). Live-HTML der Produktion mit dem lokalen Stand
      abgeglichen (byte-identisch) -- kein Deploy-/Cache-Problem. Keine
      Ursache im Code gefunden; da eine neue Zeile leer (keine Bezeichnung,
      keine Melder) und damit optisch kaum von den Nachbarzeilen zu
      unterscheiden ist, wurde `gridAddGroup()` um automatisches
      Scrollen zum neuen Zeilenende ergänzt (`$nextTick` +
      `scrollIntoView({block:'center', behavior:'smooth'})` auf den nun mit
      `id="gridAddGroupBtn"` versehenen Button) -- macht den Effekt in jedem
      Fall sofort sichtbar, unabhängig von der tatsächlichen Ursache.
- [x] **Separater, während der Root-Cause-Suche entdeckter Bug (potenziell
      wichtiger als der Add-Button selbst):** Die Produktions-`settings_
      standard.json` trug noch die ALTE, generische Lichtruf-Vokabel-Liste
      (`AT, BT, ZT, EM, PN, Display`, 4 Spalten) -- die in Teil A
      umgestellte `DEFAULT_ANLAGENTYPEN`-Definition (10 feste Module aus der
      Muster-xlsx) hatte darauf NIE Wirkung, weil `load_settings()` ein
      bereits vorhandenes `anlagentypen` unverändert von Platte lädt und
      Code-Defaults nur brandneue Installationen seeden. Betraf sowohl
      WebUI als auch (über dieselbe geteilte settings-Datei) `netlink`s
      `/protocols/definitions` -- also auch die Android-App. Fix: neue
      `_migrate_stale_lichtruf_definitions()` in `webui/app.py` erkennt
      genau die alte, nie im Anlagentypen-Editor angefasste Default-Liste
      und ersetzt sie einmalig durch die aktuelle `DEFAULT_ANLAGENTYPEN`-
      Definition, persistiert das Ergebnis zurück auf Platte (wirkt dann
      automatisch auch für `netlink`, da beide dieselbe Datei lesen). Eine
      bereits vom Nutzer individuell angepasste Lichtruf-Definition (jeder
      andere Wert als exakt die alte Default-Liste) bleibt unangetastet.
      Verifiziert gegen eine Kopie der echten Produktions-Stale-Daten
      (Migration greift) und gegen eine simulierte Nutzer-Anpassung
      (Migration greift NICHT, Wert bleibt erhalten) -- beide Szenarien PASS.
- [ ] Noch nicht deployed.

## Teil G: Lichtruf fixe Spaltenliste (final) + kritischer Grid-Rendering-Bugfix + Android-Parität

Auslöser: Nutzer gab die ENDGÜLTIGE, exakte Lichtruf-Spaltenliste vor:
"Raum-Nr. ; Bezeichnung; ZT; ZL; RT B1; RT B2; RT B3; RT B4; AT; PT Bad; RT
Bad; ZT Bad; AT Bad; Terminal" -- 12 feste Auslösespalten (ersetzt die Teil-A/E
10-Modul-Liste: "RT" wurde durch "RT B4" ersetzt, "AT" und "Terminal" kamen
neu dazu). Außerdem: "es gibt hier keine Meldertypen zum Zeichnen, nur das -
für vorhanden oder eben nicht" (kein Paint-Vokabular, nur Ein/Aus pro Spalte)
und "das Hinzufügen der Räume funktioniert nicht" -- UND die exakt gleiche
Funktionalität wird für die Android-App verlangt (Raum hinzufügen/löschen/
umbenennen, Zellen (de)aktivieren).

### KRITISCHER FUND: Grid-Zeilen rendern in KEINEM Browser, für KEINEN Anlagentyp

Root-Cause-Suche zum "Raum hinzufügen funktioniert nicht"-Report (das zweite
Mal berichtet) führte erstmals zu einem ECHTEN Playwright-Headless-Browser
(zuvor nur quickjs-Funktionsextraktion -- reine Logikprüfung, keine
DOM-Prüfung). Ergebnis: `tbody`s `<template x-for="entry in
gridDisplayRows()">` hatte ZWEI Geschwister-`<template x-if>`-Tags als
direkte Kinder ("header"/"data") -- Alpine benötigt aber (wie bei `x-if`,
siehe bestehende feedback-server-Memory) auch bei `x-for` GENAU EIN
Root-Kind-Element im Template. Verifiziert gegen die ECHTE Produktion
(read-only "Ansehen" auf einem realen BMA-Gerät): `tbody.children` bestand
NUR aus unverarbeiteten `<template>`-Tags, NIE aus echten `<tr>` -- der Bug
betraf JEDEN Anlagentyp, nicht nur Lichtruf, vermutlich seit der
Bereiche-Header-Einführung (Teil D). Das erklärt den "Zeile hinzufügen hat
keinen Effekt"-Report vollständig: Zeilen wurden im Datenmodell korrekt
hinzugefügt (bereits per quickjs bestätigt), aber NIE sichtbar gerendert.

- [x] `templates/index.html`: `tbody`-Template umstrukturiert -- EIN `<tr>`
      pro `x-for`-Element (statt zwei Geschwister-Templates), "header"/"data"-
      Unterscheidung jetzt über `x-if` PRO `<td>` (bzw. pro verschachteltem
      `x-for` für die Melder-Spalten) INNERHALB dieses einen `<tr>`. Jedes
      `x-if` hat wieder genau ein Root-Kind (`<td>` oder `<template x-for>`),
      was der unterstützte Alpine-Pattern ist.
- [x] Verifikation: reale Playwright-Browser-Tests (Chromium, headless,
      lokal installiert) gegen eine isolierte Instanz mit einer 1:1-Kopie
      der echten Produktionsdaten (Lichtruf-Gerät PRO-15503/G15503000 UND
      ein neu angelegtes BMA-Test-Gerät mit Bereichen) -- VOR dem Fix: 0
      sichtbare `<tr>` trotz 11-13 Einträgen im Datenmodell; NACH dem Fix:
      alle Zeilen als echte `<tr>` sichtbar, "Raum/Meldegruppe hinzufügen"
      fügt sichtbar eine neue Zeile an, Speichern+Neuladen erhält den
      Zustand korrekt, Bereich-Kopfzeilen (BMA) rendern weiterhin korrekt
      zwischen den Datenzeilen.

### Lichtruf: finale 12-Spalten-Liste + Migration + Toggle-Verhalten

- [x] `webui/app.py`, `netlink/main.py`, Android `getFallbackDefinitionsJson()`:
      Lichtruf-Detectorliste auf die finale, vom Nutzer vorgegebene Liste
      aktualisiert: `-, ZT, ZL, RT B1, RT B2, RT B3, RT B4, AT, PT Bad, RT
      Bad, ZT Bad, AT Bad, Terminal` (12 echte Spalten). Neue Kurzzeichen:
      RT B4→R4, AT→AT (kein Override nötig, generischer Fallback reicht),
      Terminal→TE. Alte Einzel-"RT"-Abkürzung entfernt (durch RT B4 ersetzt,
      keine Kollision mit anderen Anlagentypen).
- [x] `webui/app.py`: `_migrate_stale_lichtruf_definitions()` erweitert auf
      eine LISTE bekannter alter Default-Signaturen (jetzt: der ur-alte
      generische Platzhalter UND die Teil-A/E-10-Modul-Liste) -- beide
      werden bei bereits vorhandenem `settings.json` automatisch auf die
      aktuelle Liste angehoben, eine vom Nutzer eigens angepasste Liste
      bleibt unangetastet. Verifiziert gegen eine Kopie der (inzwischen
      erneut veralteten) Produktionsdaten.
- [x] `templates/index.html`: Detector-Paint-Palette per `x-if` komplett
      ausgeblendet für Lichtruf (kein Typ-Vokabular mehr). Neue Methoden
      `gridLichtrufColumnType(c)` (Spalte → festes Modul) und
      `gridEnforceLichtrufColumns()` (setzt `n_cols` IMMER auf die exakte
      Modulanzahl, unabhängig davon was der Server aus altem
      Zell-Bestand berechnet hat -- behebt nebenbei einen entdeckten
      Datenschieflauf: ein reales Lichtruf-Gerät hatte durch Testen VOR
      dem Ausblenden des "Melder max."-Stellers auf n_cols=32 aufgeblähte
      Geisterspalten, die beim nächsten Speichern jetzt automatisch
      wegfallen, da der Server nur noch bis zur vom Client gesendeten,
      korrekten Spaltenzahl persistiert).
- [x] `templates/index.html`: `gridEndPaint()` verzweigt für Lichtruf --
      kein globaler `gridPaintType` mehr, stattdessen pro Spalte ihr festes
      Modul; Klick/Zug schaltet basierend auf dem Zustand der zuerst
      berührten Zelle (Anker) die GESAMTE Auswahl ein- oder aus.
- [x] `templates/index.html`: `gridColHeaderLabel()` (aus Teil E) zeigt
      weiterhin automatisch die aktuelle (jetzt 12-teilige) Modulliste als
      Spaltenköpfe -- keine Änderung nötig, da bereits generisch aus
      `cellsEditorDef.detectors` abgeleitet.
- [x] Verifikation: Playwright gegen isolierte Instanz -- Spaltenköpfe
      zeigen exakt "Raum, Bezeichnung, ZT, ZL, RT B1, RT B2, RT B3, RT B4,
      AT, PT Bad, RT Bad, ZT Bad, AT Bad, Terminal"; Palette unsichtbar (0
      Paint-Buttons); Toggle-Test auf einer echten Zelle (Spalte 6 = "RT
      B4"): Klick 1 setzt Typ auf "RT B4", Klick 2 setzt zurück auf "-";
      Spaltenzahl wird beim Laden eines Alt-Geräts mit n_cols=5 korrekt auf
      12 erzwungen; nach Speichern+Neuladen bleibt n_cols=12 stabil.

### Android-Parität (MatrixEditScreen.kt)

- [x] Neuer `isLichtruf`-Flag (`protocolEntity.systemType == "Lichtruf"`) und
      `lichtrufColumns` (Detector-Liste ohne "-") an `DeviceEditorSection`
      durchgereicht.
- [x] Paint-Palette (Surface mit Typ-Chips) für Lichtruf komplett
      ausgeblendet, ebenso der "Melder"-Stepper (Spaltenzahl ist fix =
      `lichtrufColumns.size`, `colsOverride`/`maxSlot`-Logik wird für
      diesen Typ ignoriert).
- [x] Spaltenköpfe zeigen für Lichtruf die festen Modulnamen (zweizeilig,
      kleinere Schrift, etwas breitere Spalten/Kopfzeile für lange Namen
      wie "Terminal"/"PT Bad") statt laufender Nummern.
- [x] Zell-Tap (Einzelklick) UND Drag-Select (`paintRect`) schalten für
      Lichtruf direkt zwischen "-" und dem festen Modul der jeweiligen
      Spalte um (kein `paintType`-Auswahlzustand mehr nötig) -- bei
      Mehrspalten-Drag entscheidet die zuerst berührte Zelle (Anker), ob
      aktiviert oder deaktiviert wird, exakt wie im WebUI-Pendant.
      Ansonsten unverändert: `addGroupToDevice`/`removeGroupFromDevice`/
      `updateGroupDetails` sind bereits typ-agnostisch generisch und
      brauchten keine Lichtruf-spezifische Änderung.
- [x] Label-Parität: "Grp"→"Raum", "Meldegruppe hinzufügen"→"Raum
      hinzufügen", Lösch-Dialog/-Toasts und "Gruppen-Nr."-Validierung
      ebenfalls auf "Raum"/"Raum-Nr." umgestellt für Lichtruf.
- [x] `./gradlew :app:compileDebugKotlin` -- BUILD SUCCESSFUL, keine neuen
      Warnings (alle vorbestehend, per `git diff` bestätigt).
- [x] `./gradlew :app:assembleDebug` -- APK gebaut, versionCode 19→20 /
      "2.8.1"→"2.9.0", an Nutzer zum Testen gesendet.

### Verifikations-Infrastruktur (neu für diese Session)

- [x] `playwright` + Chromium (headless shell) im Verifikations-venv
      installiert (`pip install playwright && playwright install
      chromium`) -- ERSETZT die bisherige quickjs-Funktionsextraktion als
      primäre WebUI-Verifikationsmethode, wo es um tatsächliches
      DOM-Rendering geht (quickjs prüft nur JS-Logik in Isolation, NIE ob
      Alpine die Templates korrekt in echte DOM-Knoten umsetzt -- genau
      diese Lücke hat den tbody-Bug bisher jede Verifikation überleben
      lassen). Siehe [[feedback-server]] für die daraus resultierende
      Merk-Regel.
- [ ] Noch nicht deployed (WebUI) / committed (WebUI+Android) -- wie üblich
      erst nach expliziter Nutzer-Aufforderung.
