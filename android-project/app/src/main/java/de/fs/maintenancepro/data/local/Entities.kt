package de.fs.maintenancepro.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Persists downloaded protocols and their current local state.
 * Offline-first design allows full read, write, and editing operations offline.
 *
 * Row/cell data lives in [ProtocolGroupEntity]/[GroupCellEntity] (normalized, mirrors the
 * server's protocol_groups/group_cells tables) so a single cell edit is a targeted SQL UPDATE
 * instead of a whole-JSON-blob read-mutate-write cycle. Only structural, rarely-changing
 * definition data (columns/applicable values/detector types) stays as small JSON blobs here,
 * matching how the server itself stores these fields on its `protocols` table.
 */
@Entity(tableName = "protocols")
data class ProtocolEntity(
    @PrimaryKey val id: String,
    val name: String,
    val address: String,
    val contractNumber: String,
    val interval: String,
    val systemType: String,

    // Status tracking: 'ready_to_download', 'downloaded', 'upload_pending', 'synchronized'
    val localStatus: String,

    // Structural definition data — small, rarely changes, not part of the per-cell edit hot path.
    val columnsJson: String = "[]",
    val applicableValuesJson: String = "[]",
    val detectorTypesJson: String = "[]",

    val lastEditedAt: Long = 0L,

    val lastOpenedAt: Long = 0L,

    val isArchived: Boolean = false,

    // Organizational sub-unit (e.g. "Esser-Team" vs "Notifier-Team") -- NOT a
    // security boundary, everything still syncs; used only to default the
    // contract list to "my own Mandant" until the "anderer Mandant"
    // FilterChip in SearchScreen is toggled on.
    val mandantId: String = "standard"
)

/**
 * One row (Melder-Gruppe / Anlage) of a protocol's detector matrix.
 * Mirrors the server's `protocol_groups` table.
 */
@Entity(tableName = "protocol_groups", primaryKeys = ["protocolId", "groupId"])
data class ProtocolGroupEntity(
    val protocolId: String,
    val groupId: String,
    val groupName: String,
    val groupType: String = "NAM",
    val anlageId: String? = null,
    val anlageName: String? = null,
    val anlageType: String? = null,
    val anlageInterval: String? = null,
    // Preserves original row order (JSON arrays are ordered, DB tables aren't).
    val orderIndex: Int = 0
)

/**
 * One detector slot (Melder) within a group. Mirrors the server's `group_cells` table.
 * `updatedAt` is what delta-sync keys off of — maps 1:1 onto the server column of the same name.
 */
@Entity(tableName = "group_cells", primaryKeys = ["protocolId", "groupId", "slotKey"])
data class GroupCellEntity(
    val protocolId: String,
    val groupId: String,
    val slotKey: String,
    val detectorType: String = "-",
    val value: String = "",
    val updatedAt: Long = 0L,
    // Preserves original column order within a row.
    val orderIndex: Int = 0
)

/**
 * Persists failed uploads in a queue to guarantee sync on reconnection.
 */
@Entity(tableName = "sync_queue")
data class SyncQueueEntity(
    @PrimaryKey(autoGenerate = true) val queueId: Long = 0L,
    val protocolId: String,
    val serializedUploadData: String,
    val addedAt: Long = System.currentTimeMillis(),
    val retryCount: Int = 0
)

/**
 * Persists global network and credential details.
 */
@Entity(tableName = "server_config")
data class ServerConfigEntity(
    @PrimaryKey val configId: Int = 1,
    val serverAddress: String = "http://eno-nt-remote.dynip.online",
    val port: Int = 34313,
    val username: String = "TECH_UNIT_99283",
    val encryptedPasswordBase64: String = "",
    val codeword: String = "",
    /** Epoch-ms timestamp of the last successful sync (full or delta). 0 = never synced. */
    val lastFullSyncAt: Long = 0L,
    /** This technician's own Mandant, from the last successful auth_check --
     * survives process restart so SearchScreen's default filter works offline too. */
    val myMandantId: String = "standard"
)
