# Esser ETB Parser — JSON Output Format

Erzeugt von `esser_etb_parser.py`:

```
python esser_etb_parser.py <datei.etb> --json            # auf stdout
python esser_etb_parser.py <datei.etb> --json-out out.json
```

Python-API (falls direkt importiert statt CLI):

```python
from esser_etb_parser import parse_etb_all, to_json
all_anlagen = parse_etb_all("datei.etb")   # list[dict]
payload = to_json(all_anlagen)             # JSON-serialisierbares dict
```

## Top-Level: zwei mögliche Formen

Die meisten Dateien haben **eine** Zentrale (Anlage). Manche (EsserNet-Verbund) haben mehrere. Am `"anlagen"`-Key erkennbar, welche Form vorliegt:

**Einzelanlage** (Normalfall):
```json
{
  "anlage": "GS Arendsee",
  "gruppen": [ /* Gruppe[] */ ],
  "version": "3.13.000",
  "module": [ /* Module[] */ ]
}
```

**Mehrere Anlagen** (EsserNet, selten):
```json
{
  "anlagen": [
    { "anlage": "...", "gruppen": [...], "version": "...", "module": [...] },
    { "anlage": "...", "gruppen": [...], "version": "...", "module": [...] }
  ]
}
```

`version` und `module` fehlen komplett bei manchen älteren Dateiformat-Varianten (Type B/C) — mit `.get()` bzw. optional chaining behandeln, nicht als Pflichtfeld annehmen.

## Gruppe-Objekt (Eintrag in `gruppen`)

```json
{
  "gruppe": 35,
  "name": "FSE",
  "melder": [ { "nr": 1, "typ": "DKM" } ],
  "unresolved": false,
  "gruppenart": "TAL",
  "ausblendbar": true,
  "melderzahl_unbekannt": false
}
```

| Feld | Typ | Bedeutung |
|---|---|---|
| `gruppe` | `int \| null` | Meldegruppen-Nummer aus der Kundendatei. `null` nur wenn `unresolved: true`. |
| `name` | `string` | Gruppentext/Zusatztext. Kann `""` sein (v.a. bei `melderzahl_unbekannt: true`). |
| `melder` | `Melder[]` | Liste der Melder in dieser Gruppe (kann leer sein). |
| `unresolved` | `bool` | `true` = ein Melder-Array wurde gefunden, konnte aber **keiner** Gruppennummer zugeordnet werden. `gruppe` ist dann `null`, `melder` kann trotzdem befüllt sein. |
| `gruppenart` | `string \| null` | Siehe Enum unten. `null` = Kategorie nicht ermittelbar (immer der Fall bei `unresolved: true`, sonst selten). |
| `ausblendbar` | `bool` | `true` → Gruppe soll in der Auslöseliste **ausgeblendet** werden. Siehe Logik unten. |
| `melderzahl_unbekannt` | `bool` | `true` = die Gruppe/Kategorie ist zwar bekannt, aber die Melder-Liste konnte nicht sicher ermittelt werden. `melder` ist dann `[]` — das heißt **nicht** "0 Melder", sondern "unbekannt". |

### `gruppenart` — Enum

| Wert | Bedeutung | `ausblendbar` |
|---|---|---|
| `"Automatische Melder"` | echte Brandmelder (Rauch/Wärme/Multi) | `false` |
| `"Nichtautomatische Melder"` | Druckknopf-/Handfeuermelder | `false` |
| `"Koppler"` | Koppler-Baugruppe | `true` |
| `"Signalgeber"` | Sirenen-/Blitzleuchten-Überwachung | `true` |
| `"TAL"` | Technischer Alarm (z. B. Aufzugsabschaltung, Brandschutzklappe) | `true` |
| `"Konventionell"` | Grenzwert-Meldegruppe (mehrere Melder in Reihe, keine Einzeladressen) | `false` |
| `"Störung"` | Überwachungseingang / Störungsmeldung | `true` |
| `null` | nicht ermittelbar | `false` (sicherer Default) |

**`"Konventionell"`**: Diese Gruppen haben technisch keine adressierbare Melderliste — auch Tools 8000 zeigt für sie keine Melderzahl an (`---`). Sie erscheinen mit korrekter Gruppennummer, `melder: []` und `melderzahl_unbekannt: true`. Die Melderzahl muss hier manuell erfasst werden.

`ausblendbar` ist rein aus `gruppenart` abgeleitet (`gruppenart in {"Koppler","Signalgeber","TAL"}`). "Störungsgruppen" (externe Überwachungseingänge, z. B. Netzteil-Überwachung) tauchen aktuell **gar nicht** in der Ausgabe auf — sie sind bewusst nicht implementiert, da nicht prüfpflichtig.

**Steuergruppen** (Relais-/Ansteuerungsausgänge, z. B. Sirenen-Ansteuerlisten) werden ebenfalls **komplett unterdrückt** — sie sind keine Meldegruppen und erscheinen weder als reguläre Gruppen noch als `???`-Einträge. Erkannt werden sie an einer binären Objektsignatur (Präfix `01 00 00 00` vor dem Datensatz), validiert gegen Installateurs-Exporte aus 3 Gebäuden.

### Melder-Objekt

```json
{ "nr": 1, "typ": "DKM" }
```

| Feld | Typ | Bedeutung |
|---|---|---|
| `nr` | `int` | 1-basierter Index innerhalb der Gruppe (keine Hardware-Adresse). |
| `typ` | `string` | Meldertyp, siehe Enum unten. |

### `typ` — Enum (Meldertyp)

`"AM"`, `"DKM"`, `"IO"`, `"Steu"`, `"MASI"`, `"Koppler"`.
Fallback für unbekannte Typ-Codes: Hex-String wie `"0x0199"` — im UI generisch behandeln (z. B. als "Sonstiger Typ" anzeigen), nicht hart auf die bekannten Werte matchen.

**Wichtige Einschränkung zu `"AM"`**: Die ETB-Datei speichert die genaue Meldertechnik (O2T, O2T/So, TDIFF, IQ8/So+, …) nicht — nur eine Live-Hardware-Abfrage am Panel kennt das. Ein interner Code deckt sowohl reine optische Melder als auch (vermutlich) optische Melder mit eingebautem Signalgeber ab; er korreliert **nicht** zuverlässig mit Sensortechnik. Verifiziert an einer echten Anlage: eine Meldegruppe mit zwei echten TDiff-Wärmemeldern zeigte für diese keinen konsistent unterscheidbaren Code gegenüber den optischen Meldern in derselben Gruppe.
Deshalb (Nutzer-Entscheidung): **alle** Melder dieser Familie werden als `"AM"` ausgegeben, auch die seltenen echten Wärmemelder (TDiff/Tmax). Eine automatische Erkennung echter Wärmemelder ist aus der ETB-Datei nicht möglich.

**Achtung**: `typ` beschreibt die *Hardware* des einzelnen Melders, nicht die Gruppenfunktion. Eine `TAL`-Gruppe enthält z. B. ganz normal `DKM`-Melder — die Entscheidung "ausblenden ja/nein" muss immer über `gruppenart`/`ausblendbar` auf Gruppenebene laufen, **nicht** über `typ` auf Melderebene.

### Zwei verschiedene "fehlt"-Zustände — nicht verwechseln

- **`unresolved: true`** → Gruppennummer unbekannt (`gruppe: null`), aber Melderdaten liegen vor. Kommt vor, wenn ein Melder-Array im Binärformat gefunden wurde, das keiner Gruppen-Metadaten zugeordnet werden konnte.
- **`melderzahl_unbekannt: true`** → Gruppennummer und meist auch Gruppenart sind bekannt, aber die Melderliste ist leer, weil sie nicht sicher verknüpft werden konnte.

Beide Fälle sollten im UI **sichtbar als unsicher markiert** werden (z. B. "⚠ konnte nicht eindeutig aus der Kundendatei übernommen werden — bitte manuell prüfen"), nicht stillschweigend wie eine normale Gruppe angezeigt werden.

## Module-Objekt (optional, top-level `module`-Array)

```json
{ "slot": 3, "type": "Esserbus Plus" }
```

Hardware-Ringkarten der Zentrale. Meist leer (`[]`), da die meisten Baugruppen bereits als Meldegruppen aufgelöst werden.

## Vollständiges Beispiel

Ausschnitt aus `Sek Arendsee.etb`, deckt alle Fälle ab:

```json
[
  {
    "gruppe": 1,
    "name": "KG HA/Heizr./Schulbücher",
    "melder": [
      { "nr": 1, "typ": "AM" },
      { "nr": 2, "typ": "AM" },
      { "nr": 3, "typ": "AM" },
      { "nr": 4, "typ": "AM" }
    ],
    "unresolved": false,
    "gruppenart": "Automatische Melder",
    "ausblendbar": false,
    "melderzahl_unbekannt": false
  },
  {
    "gruppe": 3,
    "name": "KG Flur",
    "melder": [
      { "nr": 1, "typ": "DKM" },
      { "nr": 2, "typ": "DKM" }
    ],
    "unresolved": false,
    "gruppenart": "Nichtautomatische Melder",
    "ausblendbar": false,
    "melderzahl_unbekannt": false
  },
  {
    "gruppe": 35,
    "name": "FSE",
    "melder": [ { "nr": 1, "typ": "DKM" } ],
    "unresolved": false,
    "gruppenart": "TAL",
    "ausblendbar": true,
    "melderzahl_unbekannt": false
  },
  {
    "gruppe": 70,
    "name": "LED Anzeige",
    "melder": [ { "nr": 1, "typ": "Koppler" } ],
    "unresolved": false,
    "gruppenart": "Koppler",
    "ausblendbar": true,
    "melderzahl_unbekannt": false
  },
  {
    "gruppe": 90,
    "name": "",
    "melder": [],
    "unresolved": false,
    "gruppenart": "Signalgeber",
    "ausblendbar": true,
    "melderzahl_unbekannt": true
  },
  {
    "gruppe": null,
    "name": "Abschaltung Aufzug",
    "melder": [ { "nr": 1, "typ": "DKM" } ],
    "unresolved": true,
    "gruppenart": null,
    "ausblendbar": false,
    "melderzahl_unbekannt": false
  }
]
```

## Empfehlung für die Auslöseliste-Web-App

1. **Ausblenden**: `gruppe.ausblendbar === true` → nicht in der Auslöseliste anzeigen.
2. **Unsicherheit sichtbar machen**: `unresolved === true` oder `melderzahl_unbekannt === true` → Gruppe zwar anzeigen (nicht verstecken!), aber optisch als "bitte manuell prüfen" markieren. Diese Fälle sind sicherheitsrelevant — lieber auffällig markieren als stillschweigend unvollständige Daten zeigen.
3. **Nicht über `typ` filtern** — Ausblend-Entscheidung immer über `gruppenart`/`ausblendbar`, nie über den Meldertyp einzelner Melder.

## Zuverlässigkeit (Stand: aktuelle Version)

Die Auflösung läuft nicht mehr über Heuristiken, sondern über die Objektadressierung der zugrundeliegenden POET-Datenbank: Jede Meldegruppe wird direkt aus der Root-Tabelle der Zentrale enumeriert, und ihre Melderliste über einen echten Objektzeiger gefunden. Das ist derselbe Weg, den Tools 8000 selbst nimmt.

Validiert gegen Installateurs-CSV-Exporte aus **5 Gebäuden (662 Meldegruppen, 4 Dateiformat-Generationen von 2010 bis heute)**:

- **`gruppe` (Nummer): immer vollständig und korrekt.** Es gibt keine `???`-Einträge und keine fehlenden Gruppen mehr.
- **0 falsche Zuordnungen.** Kein Gruppentext und keine Melderliste wird je der falschen Gruppe zugeordnet.
- **619 von 662 Gruppen mit vollständiger Melderliste.** Die restlichen 43 sind ausschließlich Gruppen, für die auch Tools 8000 selbst keine Melderzahl anzeigt (konventionelle Grenzwertgruppen, Störungs-/Überwachungseingänge) — erkennbar an `melderzahl_unbekannt: true` und der jeweiligen `gruppenart`.

**Steuergruppen** werden vollständig unterdrückt und tauchen nie in der Ausgabe auf.
