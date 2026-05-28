# Spezifikation des Server-Kommunikationsprotokolls

Dieses Dokument spezifiziert das sichere, offline-fähige Kommunikationsprotokoll zwischen der Android-App **Maintenance Pro** und dem Python-basierten Backend-Server. Das Protokoll wurde so entwickelt, dass es plattformübergreifend bit-identisch funktioniert und sensible Daten Ende-zu-Ende verschlüsselt überträgt.

---

## 1. Verschlüsselung & Kryptografie-Routine

Die Verschlüsselung und Entschlüsselung erfolgt über ein symmetrisches **AES-256-GCM-Verfahren**. Alle Daten werden ausschließlich verschlüsselt per HTTP übertragen (Sicherheitsentscheidung für ein geschlossenes Netzwerk).

### 1.1 Schlüsselableitung (PBKDF2)
Um aus dem vom Benutzer eingegebenen Codewort einen kryptografisch sicheren 256-Bit-Schlüssel zu erzeugen, wird PBKDF2 verwendet.
*   **Hash-Algorithmus:** HMAC-SHA256
*   **Iterationen:** `100.000`
*   **Fester Salt:** `ENO_AUSLOESELISTE_v1` (als UTF-8-kodierter String, 19 Byte)
*   **Typische Implementierung in Android (Kotlin):** `SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")`
*   **Symmetrischer Key:** 32 Byte (256 Volt) starker abgeleiteter AES-Schlüssel.

### 1.2 AESgcm-Verschlüsselung
*   **Algorithmus:** AES-256-GCM ohne Padding (`AES/GCM/NoPadding`)
*   **IV (Initialization Vector):** 12 Byte (96 Bit), für jede verschlüsselte Nachricht mittels kryptografischem Zufallsgenerator (`SecureRandom` / `os.urandom`) neu generiert.
*   **Authentifizierungs-Tag (Auth-Tag):** 16 Byte (128 Bit), wird automatisch am Ende des Ciphertextes angefügt.

### 1.3 Wire-Format (Übertragungsformat)
Alle Payloads (Sowohl HTTP-Bodys als auch Auth-Header) werden im folgenden Binär-Format zusammengesetzt und anschließend mit standardmäßigem Base64 (ohne Zeilenumbrüche) kodiert:

```text
Wire-Format (Binär):
+-----------------+-----------------------+-------------------+
|  IV (12 Byte)   |  Zieldaten (N Byte)   |  Tag (16 Byte)    |
+-----------------+-----------------------+-------------------+
```

**Base64-kodierte Repräsentation:**
```text
base64( iv[12] || ciphertext[N] || tag[16] )
```

---

## 2. Authentifizierung und Auth-Header `X-Auth`

Zusätzlich zur Inhaltsverschlüsselung wird jeder Request durch den HTTP-Header `X-Auth` authentifiziert.
1.  Die Anmeldedaten werden als JSON-String verpackt:
    `{"user": "USERNAME", "pass": "PASSWORD"}`
2.  Dieser JSON-String wird mit dem aus dem Codewort abgeleiteten Key (PBKDF2) und einem zufälligen IV verschlüsselt.
3.  Das resultierende Base64-Paket wird als Wert im HTTP-Header `X-Auth` übertragen:
    `X-Auth: AAABBBCCCDDDEEE...` So verbleiben Anmeldedaten niemals unverschlüsselt auf dem Übertragungskanal.

---

## 3. Endpoint-Spezifikationen

Alle Endpoints verwenden ausschließlich die HTTP-Methode **POST** und akzeptieren/liefern verschlüsselte Payloads.

### 3.1 POST `/auth/check`
Prüft die Gültigkeit der Zugangsdaten und des Codeworts.
*   **Header:** `X-Auth` (Enthält verschlüsselte Username/Password-Struktur)
*   **Request-Body:** Leer
*   **Response-Body:** Verschlüsseltes JSON mit dem Validierungsstatus:
    ```json
    {
      "status": "authorized",
      "technician_id": "99283-FS",
      "name": "Thomas Prantl"
    }
    ```

### 3.2 POST `/protocols/search`
Suche nach Kundenanlagen über Adresse, Matchcode oder Vertragsnummer.
*   **Header:** `X-Auth`
*   **Request-Body (Klartext vor Verschlüsselung):**
    ```json
    {
      "query": "Wien"
    }
    ```
*   **Response-Body (Klartext nach Entschlüsselung):** Eine Liste von Such-Ergebnissen:
    ```json
    [
      {
        "id": "1",
        "name": "Siemens AG - Campus Nord",
        "address": "Gürtelstraße 14-16, 1210 Wien",
        "contract_number": "V-2023-9941-Z",
        "interval": "Jährlich",
        "system_type": "BMA",
        "status": "ready_to_download"
      },
      {
        "id": "2",
        "name": "Logistikzentrum West - Bau B",
        "address": "Industriestraße 1, 5020 Salzburg",
        "contract_number": "V-2022-1025-X",
        "interval": "Vierteljährlich",
        "system_type": "SLA",
        "status": "downloaded"
      }
    ]
    ```

### 3.3 POST `/protocols/download/{id}`
Fordert das Datenpaket für eine spezifische Wartung an.
*   **Header:** `X-Auth`
*   **Request-Body:** Leer
*   **Response-Body:** Das zurückgegebene Paket ist eine **AES-GCM-verschlüsselte ZIP-Datei** (verschlüsselt mit demselben vom Codewort abgeleiteten Key).
    *   Nach der Entschlüsselung des ZIP-Streams erhält die App:
        1.  `protocol.json`: Das JSON-Datenmodell der Wartung inklusive Gerätedefinitionen.
        2.  Optionale Medienanhänge (Bilder, Bestandspläne etc.).

#### 3.3.1 Struktur des `protocol.json` (Universelles, dynamisches Datenbankschema)
Das Schema ist dynamisch und wird vom Server vorgegeben, damit BMA, SLA, ELA und andere Anlagentypen generisch gerendert werden können:
```json
{
  "protocol_id": "1",
  "client_name": "Zentral-Klinikum West",
  "contract_number": "V-2024-99a",
  "interval": "Halbjährlich",
  "system_type": "BMA",
  "definition": {
    "columns": [
      { "key": "1", "label": "Slot 1" },
      { "key": "2", "label": "Slot 2" },
      { "key": "3", "label": "Slot 3" },
      { "key": "4", "label": "Slot 4" }
    ],
    "applicable_values": [
      { "value": "H1", "label": "Halbjahr 1" },
      { "value": "H2", "label": "Halbjahr 2" },
      { "value": "Def.", "label": "Soll-Zustand Defekt", "is_defect": true }
    ],
    "detector_types": ["ZD", "DB", "RAS", "TDIF"]
  },
  "rows": [
    {
      "group_id": "GRP 01",
      "group_name": "Standardgruppe",
      "cells": [
        { "slot_key": "1", "detector_type": "RAS", "value": "" },
        { "slot_key": "2", "detector_type": "RAS", "value": "" },
        { "slot_key": "3", "detector_type": "ZD", "value": "" },
        { "slot_key": "4", "detector_type": "ZD", "value": "" }
      ]
    },
    {
      "group_id": "GRP 02",
      "group_name": "Alarmgruppe",
      "cells": [
        { "slot_key": "1", "detector_type": "RAS", "value": "" },
        { "slot_key": "2", "detector_type": "-", "value": "" },
        { "slot_key": "3", "detector_type": "TDIF", "value": "" },
        { "slot_key": "4", "detector_type": "-", "value": "" }
      ]
    }
  ]
}
```

### 3.4 POST `/protocols/upload/{id}`
Lädt die ausgefüllte Auslöseliste zurück zum Server hoch.
*   **Header:** `X-Auth`
*   **Request-Body:** Ein AES-GCM-verschlüsseltes JSON-Objekt mit den ausgefüllten Werten und eventuell neu hinzugefügten oder modifizierten Melderstrukturen:
    ```json
    {
      "protocol_id": "1",
      "finished_at": "2026-05-27T22:45:00Z",
      "technician_id": "99283-FS",
      "rows": [
        {
          "group_id": "GRP 01",
          "group_name": "Standardgruppe",
          "cells": [
            { "slot_key": "1", "detector_type": "RAS", "value": "H1" },
            { "slot_key": "2", "detector_type": "RAS", "value": "H1" },
            { "slot_key": "3", "detector_type": "ZD", "value": "Def." },
            { "slot_key": "4", "detector_type": "ZD", "value": "H1" }
          ]
        }
      ]
    }
    ```
*   **Response-Body (Klartext):**
    ```json
    {
      "status": "conflict_resolved_or_synced",
      "version": 2,
      "message": "Erfolgreich synchronisiert."
    }
    ```

### 3.5 POST `/protocols/list-pending`
Dient dem Abrufen offener Wartungen für den angemeldeten Techniker.
*   **Header:** `X-Auth`
*   **Response-Body:** Liste ausstehender Wartungen im gleichen Format wie `/protocols/search`.

---

## 4. Test-Vektoren zur Cross-Plattform-Entwicklung

Mit diesen Vektoren können Sie die bit-identische Funktionsweise Ihrer Android (Java/Kotlin) und Server (Python) Verschlüsselungen überprüfen.

### 4.1 PBKDF2-Vektor (Key-Ableitung)
*   **Codeword:** `MeinGeheimesCodewort123!`
*   **Salt:** `ENO_AUSLOESELISTE_v1`
*   **Iterationen:** `100.000`
*   **Schlüssellänge:** `32 Byte (256 Volt)`
*   **Erwarteter Key (Hexadezimal):**
    `d6bf2c4cdd201fe9738f6bca487bf5948f95c80ef467645cf4595e0c656360c7`

### 4.2 AES-256-GCM-Szenario
*   **Abgeleiteter Key (aus 4.1):** `[32 Byte]`
*   **fester IV (nur für Tests):** `000000000000000000000000` (12 Bytes Hex -> `00 00 00 00 00 00 00 00 00 00 00 00`)
*   **Klartext (UTF-8):** `{"user":"tech","pass":"123"}`
*   **Erwarteter Ciphertext + Tag (Base64-Wire-Format mit all-zero IV am Anfang):**
    `AAAAAAAAAAAAAAAAAAAAAGV3E9Xatqscun3hAet3V6qE9R6DToM6A41g3gXb8+H0bA==`

---

## 5. Fehler-Response-Format

Tritt ein Fehler auf (z.B. falsches Codewort führt zu Entschlüsselungsfehlern, ungültige Credentials etc.), liefert das System ein einheitliches, maschinenlesbares Fehler-JSON zurück.

Da der Inhalt im Fehlerfall evtl. nicht entziffert werden kann (wenn z.B. das Codewort falsch war), sendet der Server im Logik-Fehlerfall (z.B. falsches Password) ein unverschlüsseltes, standardisiertes JSON zurück, jedoch mit dem HTTP-Status `401 Unauthorized` oder `400 Bad Request`.

```json
{
  "error": "DECRYPTION_FAILED",
  "message": "Der Server konnte die X-Auth-Credentials nicht entschlüsseln. Codewort inkorrekt.",
  "timestamp": "2026-05-27T22:33:02Z"
}
```

Mögliche Error-Codes:
1.  `DECRYPTION_FAILED`: Payload konnte mit dem Server-Gegenstück-Codewort nicht decodiert werden.
2.  `INVALID_CREDENTIALS`: Username/Password stimmt auf dem Server nicht.
3.  `PROTOCOL_NOT_FOUND`: Gesuchte Wartung existiert nicht.
4.  `SYNC_CONFLICT`: Bearbeitung veraltet; der Server führt automatischen Merge aus.
