# Maintenance Pro - Android Feld-Service App

Dieses Android-Projekt dient als offline-first Applikation für Techniker im Außendienst zur Wartung von Brandmelde-, ELA- und Einbruchmeldeanlagen. Die App implementiert bit-identische AES-256-GCM Verschlüsselungs-Routinen, Room Offline-Datenhaltung und dynamische, vom Server definierte Tabellen-Layouts.

---

## 🛠️ Technologien & Vorgaben

*   **Sprache:** Kotlin (JVM Target 17)
*   **UI-Framework:** Jetpack Compose (Material 3)
*   **Netzwerk:** Retrofit & OkHttp mit einem krypto-transparenten Interceptor (`CryptoInterceptor.kt`)
*   **Lokale Datenbank:** Room (Offline-First)
*   **Dependency Injection:** Dagger Hilt (`@HiltAndroidApp`, `@AndroidEntryPoint`)
*   **Kryptografie:** PBKDF2 (100.000 Iterationen, SHA256) und symmetrisches AES-256-GCM.
*   **Minimale Android Version:** SDK 26 (Android 8.0)
*   **Ziel-Version:** SDK 34 (Android 14)

---

## 📦 Projekt-Struktur

```text
/app/src/main/java/de/fs/maintenancepro/
├── MaintenanceProApp.kt             # Hilt Application Entrypoint
├── MainActivity.kt                  # Compose Navigation Host
├── data/
│   ├── crypto/
│   │   └── CryptoManager.kt         # PBKDF2/AES-GCM Algorithmen (bit-identisch mit Python)
│   ├── local/
│   │   ├── DAOs.kt                  # ProtocolDao, SyncQueueDao, ServerConfigDao
│   │   ├── Entities.kt              # Room Tabellen (Protokolle, Upload-Queue, Config)
│   │   └── MaintenanceDatabase.kt   # SQLite Datenbank Deklaration
│   └── remote/
│       ├── ApiService.kt            # Retrofit Endpoint Deklarationen
│       └── CryptoInterceptor.kt     # Transparente Verschlüsselung ausgehender Requests und Responses
├── di/
│   ├── DatabaseModule.kt            # Hilt SQLite-Datenbank Provider
│   └── NetworkModule.kt             # Hilt Retrofit, Interceptor und HttpClient Provider
└── ui/
    ├── screens/
    │   ├── SettingsScreen.kt        # Systemkonfiguration & Server-Credentials
    │   ├── SearchScreen.kt          # Online-Suche & Arbeitsvorrat
    │   ├── DownloadedScreen.kt      # Lokale, offline geladene Wartungen
    │   ├── InspectionScreen.kt      # Arbeitsmatrix (Gefrorene Spalten/Köpfe, FAB-Auswahl)
    │   └── MatrixEditScreen.kt      # Editor-Modus (Melder nachträglich hinzufügen/umbauen)
    ├── theme/
    │   ├── Color.kt                 # Farbdefinitionen (Industrial Utilitarian Theme)
    │   ├── Theme.kt                 # MaterialTheme Konfiguration (Light-First)
    │   └── Type.kt                  # Sans-serif (Inter) + Monospace (JetBrains Mono) Paarung
    └── viewmodel/
        ├── ActiveSessionManager.kt  # In-Memory Management des Codeworts zur Echtzeit-Verschlüsselung
        └── MainViewModel.kt         # MVVM ViewModel mit SyncQueue & Offline-First Abwicklungen
```

---

## 🚀 Inbetriebnahme in Android Studio

1.  Öffnen Sie **Android Studio** (Koala oder neuer empfohlen).
2.  Wählen Sie **Open an existing Project** und navigieren Sie in dieses `/android-project` Verzeichnis.
3.  Lassen Sie Android Studio die `settings.gradle.kts` und `build.gradle.kts` einlesen und die Gradle-Synchronisation durchführen.
4.  Stellen Sie sicher, dass Ihr ProjektJDK auf **Java 17** eingestellt ist (Einstellungen -> Build, Execution, Deployment -> Build Tools -> Gradle -> Gradle JDK).
5.  Klicken Sie auf **Run "app"**, um die Anwendung auf einem Emulator oder physischen Gerät (Tablet/Smartphone) zu starten.

---

## 🔒 Kryptografische Verifikation

Die Verschlüsselungslogik arbeitet mit dem standardisierten Wire-Format `base64( iv[12] + ciphertext[N] + tag[16] )`. Um die Plattformkompatibilität mit dem Python-Vorratsbackend zu testen, nutzen Sie das Skript `crypto_reference.py` im Hauptverzeichnis des Workspaces.

Dieses Skript prüft und verifiziert den identischen Testvektor:
*   Codewort: `MeinGeheimesCodewort123!`
*   Fester Initialisierungsvektor: 12 Bytes `00`
*   Plaintext: `{"user":"tech","pass":"123"}`
*   Unerwartete Differenzen werden sofort deklariert.

---

## 📡 Lokaler Offline-Abgleich (SyncQueue)

Wenn ein Techniker Wartungen offline vor Ort befüllt und auf **"Sync"** klickt, aber kein Netzwerksignal besteht:
1.  Die Einträge werden als ausstehend (`upload_pending`) markiert und in der lokalen Room-Tabelle `sync_queue` persistiert.
2.  Bei Wiederherstellung der Verbindung (oder manuell über das Trigger-Symbol oben links in der App) stößt die Methode `processSyncQueue()` im ViewModel die Übertragung an.
3.  Die Integrität bleibt auch bei Systemabstürzen oder plötzlichem Batterie-Ausfall gewahrt.
