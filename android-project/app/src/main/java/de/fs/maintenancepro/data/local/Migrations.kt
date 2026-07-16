package de.fs.maintenancepro.data.local

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import org.json.JSONObject

/**
 * v4 -> v5: normalizes the single `decryptedPayloadJson` blob column on `protocols` into
 * `protocol_groups`/`group_cells` tables (mirroring the server's schema), so individual cell
 * edits become targeted indexed UPDATEs instead of a whole-blob read-mutate-write cycle.
 *
 * Deliberately non-destructive: `upload_pending` protocols can hold real, un-synced field work,
 * so this parses every existing blob and carries it into the new tables rather than wiping local
 * data. The old `decryptedPayloadJson` column is left in place (unused, harmless) rather than
 * risking a table-rebuild-based column drop.
 */
val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE protocols ADD COLUMN columnsJson TEXT NOT NULL DEFAULT '[]'")
        db.execSQL("ALTER TABLE protocols ADD COLUMN applicableValuesJson TEXT NOT NULL DEFAULT '[]'")
        db.execSQL("ALTER TABLE protocols ADD COLUMN detectorTypesJson TEXT NOT NULL DEFAULT '[]'")

        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS protocol_groups (
                protocolId TEXT NOT NULL,
                groupId TEXT NOT NULL,
                groupName TEXT NOT NULL,
                groupType TEXT NOT NULL DEFAULT 'NAM',
                anlageId TEXT,
                anlageName TEXT,
                anlageType TEXT,
                anlageInterval TEXT,
                orderIndex INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(protocolId, groupId)
            )
            """.trimIndent()
        )

        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS group_cells (
                protocolId TEXT NOT NULL,
                groupId TEXT NOT NULL,
                slotKey TEXT NOT NULL,
                detectorType TEXT NOT NULL DEFAULT '-',
                value TEXT NOT NULL DEFAULT '',
                updatedAt INTEGER NOT NULL DEFAULT 0,
                orderIndex INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(protocolId, groupId, slotKey)
            )
            """.trimIndent()
        )

        // Read every existing blob into memory first (small dataset — local device cache),
        // then write, so we're not mutating the table we're iterating.
        val oldBlobs = mutableListOf<Pair<String, String>>()
        db.query("SELECT id, decryptedPayloadJson FROM protocols").use { cursor ->
            val idIdx = cursor.getColumnIndex("id")
            val jsonIdx = cursor.getColumnIndex("decryptedPayloadJson")
            if (idIdx >= 0 && jsonIdx >= 0) {
                while (cursor.moveToNext()) {
                    oldBlobs.add(cursor.getString(idIdx) to cursor.getString(jsonIdx))
                }
            }
        }

        for ((protocolId, blob) in oldBlobs) {
            if (blob.isNullOrBlank()) continue
            try {
                val root = JSONObject(blob)
                val def = root.optJSONObject("definition")

                val protoValues = ContentValues().apply {
                    put("columnsJson", (def?.optJSONArray("columns") ?: org.json.JSONArray()).toString())
                    put("applicableValuesJson", (def?.optJSONArray("applicable_values") ?: org.json.JSONArray()).toString())
                    put("detectorTypesJson", (def?.optJSONArray("detector_types") ?: org.json.JSONArray()).toString())
                }
                db.update("protocols", SQLiteDatabase.CONFLICT_REPLACE, protoValues, "id = ?", arrayOf<Any?>(protocolId))

                val rows = root.optJSONArray("rows") ?: continue
                for (i in 0 until rows.length()) {
                    val rowO = rows.getJSONObject(i)
                    val groupId = rowO.optString("group_id", null) ?: continue

                    val groupValues = ContentValues().apply {
                        put("protocolId", protocolId)
                        put("groupId", groupId)
                        put("groupName", rowO.optString("group_name", ""))
                        put("groupType", rowO.optString("group_type", "NAM"))
                        put("anlageId", if (rowO.has("anlage_id")) rowO.optString("anlage_id") else null)
                        put("anlageName", if (rowO.has("anlage_name")) rowO.optString("anlage_name") else null)
                        put("anlageType", if (rowO.has("anlage_type")) rowO.optString("anlage_type") else null)
                        put("anlageInterval", if (rowO.has("anlage_interval")) rowO.optString("anlage_interval") else null)
                        put("orderIndex", i)
                    }
                    db.insert("protocol_groups", SQLiteDatabase.CONFLICT_REPLACE, groupValues)

                    val cells = rowO.optJSONArray("cells") ?: continue
                    for (j in 0 until cells.length()) {
                        val cellO = cells.getJSONObject(j)
                        val slotKey = cellO.optString("slot_key", null) ?: continue
                        if (slotKey == "__grid__") continue // legacy sentinel, never a real slot

                        val cellValues = ContentValues().apply {
                            put("protocolId", protocolId)
                            put("groupId", groupId)
                            put("slotKey", slotKey)
                            put("detectorType", cellO.optString("detector_type", "-"))
                            put("value", cellO.optString("value", ""))
                            put("updatedAt", cellO.optLong("updated_at", 0L))
                            put("orderIndex", j)
                        }
                        db.insert("group_cells", SQLiteDatabase.CONFLICT_REPLACE, cellValues)
                    }
                }
            } catch (_: Exception) {
                // Skip unparseable legacy blobs rather than aborting migration for every other protocol.
            }
        }
    }
}

/**
 * v5 -> v6: adds a `codeword` column to `server_config`. Previously the codeword
 * (crypto key) was never persisted to Room at all -- only held in-memory by
 * ActiveSessionManager -- so it silently reset to a hardcoded default on every app
 * restart. See MainViewModel.testConnectionWithSettings/saveConfig.
 */
val MIGRATION_5_6 = object : Migration(5, 6) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE server_config ADD COLUMN codeword TEXT NOT NULL DEFAULT ''")
    }
}

/**
 * v6 -> v7: adds Mandant fields for the "show my own contracts by default"
 * SearchScreen filter. mandantId on `protocols` mirrors the server's per-contract
 * tag; myMandantId on `server_config` is this technician's own Mandant, captured
 * from the last successful auth_check so the default filter works offline too.
 */
val MIGRATION_6_7 = object : Migration(6, 7) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE protocols ADD COLUMN mandantId TEXT NOT NULL DEFAULT 'standard'")
        db.execSQL("ALTER TABLE server_config ADD COLUMN myMandantId TEXT NOT NULL DEFAULT 'standard'")
    }
}

/**
 * v7 -> v8: new hardware_tables entity for the optional per-device Hardware
 * inventory (Zentrale/Ringkarten), mirroring the server's group_cells
 * '__hardware__' sentinel blob. Independent of protocol_groups/group_cells,
 * so a plain CREATE TABLE is enough -- nothing to backfill from existing data.
 */
val MIGRATION_7_8 = object : Migration(7, 8) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS hardware_tables (
                protocolId TEXT NOT NULL,
                deviceGroupId TEXT NOT NULL,
                rowsJson TEXT NOT NULL DEFAULT '[]',
                updatedAt INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(protocolId, deviceGroupId)
            )
            """.trimIndent()
        )
    }
}

/**
 * v8 -> v9: detectorDefsJson on `protocols` -- Meldertypen + Zellfarben je
 * Anlagentyp aus den WebUI-Einstellungen, mitgeliefert von netlink in Download-
 * und Sync-Payloads. '{}' bis zum nächsten Sync; Editor/Prüfliste fallen dann
 * auf detectorTypesJson und die eingebaute Farbtabelle zurück.
 */
val MIGRATION_8_9 = object : Migration(8, 9) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE protocols ADD COLUMN detectorDefsJson TEXT NOT NULL DEFAULT '{}'")
    }
}

/**
 * v9 -> v10: Bereiche (Sektionen) -- benannte Abschnitte für Meldegruppen, z.B.
 * "Station 1/2/3". `bereich` on protocol_groups is the per-group assignment
 * (WebUI-style registry 3rd field, see PLAN_BEREICHE_LICHTRUF.md); `updatedAt`
 * lets delta-sync pick up local reassignments the same way group_cells.updatedAt
 * already does for cell edits. New bereiche_table mirrors hardware_tables'
 * shape exactly (one ordered-name-list JSON blob per device).
 */
val MIGRATION_9_10 = object : Migration(9, 10) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE protocol_groups ADD COLUMN bereich TEXT")
        db.execSQL("ALTER TABLE protocol_groups ADD COLUMN updatedAt INTEGER NOT NULL DEFAULT 0")
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS bereiche_table (
                protocolId TEXT NOT NULL,
                deviceGroupId TEXT NOT NULL,
                orderJson TEXT NOT NULL DEFAULT '[]',
                updatedAt INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(protocolId, deviceGroupId)
            )
            """.trimIndent()
        )
    }
}
