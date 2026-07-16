package de.fs.maintenancepro.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface ProtocolDao {
    @Query("SELECT * FROM protocols")
    fun getAllProtocolsFlow(): Flow<List<ProtocolEntity>>

    @Query("SELECT * FROM protocols WHERE id = :id")
    suspend fun getProtocolById(id: String): ProtocolEntity?

    @Query("SELECT COUNT(*) FROM protocols")
    suspend fun count(): Int

    @Query("""
        SELECT * FROM protocols WHERE
        LOWER(name) LIKE LOWER(:pat) OR
        LOWER(address) LIKE LOWER(:pat) OR
        LOWER(contractNumber) LIKE LOWER(:pat)
        ORDER BY name ASC
    """)
    suspend fun search(pat: String): List<ProtocolEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdate(protocol: ProtocolEntity)

    @Update
    suspend fun update(protocol: ProtocolEntity)

    @Query("UPDATE protocols SET localStatus = :status WHERE id = :id")
    suspend fun updateStatus(id: String, status: String)

    @Query("UPDATE protocols SET localStatus = :status, lastEditedAt = :lastEditedAt WHERE id = :id")
    suspend fun updateStatusAndEditedAt(id: String, status: String, lastEditedAt: Long)

    @Query("DELETE FROM protocols WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("SELECT * FROM protocols WHERE lastOpenedAt > 0 ORDER BY lastOpenedAt DESC")
    fun getRecentlyOpenedFlow(): Flow<List<ProtocolEntity>>

    @Query("DELETE FROM protocols")
    suspend fun clearAll()
}

/** Structural row data (Melder-Gruppe / Anlage) — mirrors the server's `protocol_groups` table. */
@Dao
interface ProtocolGroupDao {
    @Query("SELECT * FROM protocol_groups WHERE protocolId = :protocolId ORDER BY orderIndex ASC")
    fun getGroupsFlow(protocolId: String): Flow<List<ProtocolGroupEntity>>

    @Query("SELECT * FROM protocol_groups WHERE protocolId = :protocolId ORDER BY orderIndex ASC")
    suspend fun getGroupsOnce(protocolId: String): List<ProtocolGroupEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdate(group: ProtocolGroupEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdateAll(groups: List<ProtocolGroupEntity>)

    @Query("UPDATE protocol_groups SET groupId = :newGroupId, groupName = :newGroupName, groupType = :newGroupType WHERE protocolId = :protocolId AND groupId = :oldGroupId")
    suspend fun updateGroupDetails(protocolId: String, oldGroupId: String, newGroupId: String, newGroupName: String, newGroupType: String)

    @Query("UPDATE protocol_groups SET bereich = :bereich, updatedAt = :updatedAt WHERE protocolId = :protocolId AND groupId = :groupId")
    suspend fun updateBereich(protocolId: String, groupId: String, bereich: String, updatedAt: Long)

    @Query("SELECT * FROM protocol_groups WHERE protocolId = :protocolId AND updatedAt > :since")
    suspend fun getChangedSince(protocolId: String, since: Long): List<ProtocolGroupEntity>

    @Query("DELETE FROM protocol_groups WHERE protocolId = :protocolId AND groupId = :groupId")
    suspend fun deleteGroup(protocolId: String, groupId: String)

    @Query("DELETE FROM protocol_groups WHERE protocolId = :protocolId")
    suspend fun deleteAllForProtocol(protocolId: String)

    @Query("SELECT COALESCE(MAX(orderIndex), -1) FROM protocol_groups WHERE protocolId = :protocolId")
    suspend fun getMaxOrderIndex(protocolId: String): Int
}

/** Individual detector slots — mirrors the server's `group_cells` table (the hot edit path). */
@Dao
interface GroupCellDao {
    @Query("SELECT * FROM group_cells WHERE protocolId = :protocolId ORDER BY groupId ASC, orderIndex ASC")
    fun getCellsFlow(protocolId: String): Flow<List<GroupCellEntity>>

    @Query("SELECT * FROM group_cells WHERE protocolId = :protocolId ORDER BY groupId ASC, orderIndex ASC")
    suspend fun getCellsOnce(protocolId: String): List<GroupCellEntity>

    @Query("SELECT * FROM group_cells WHERE protocolId = :protocolId AND groupId = :groupId AND slotKey = :slotKey LIMIT 1")
    suspend fun getCell(protocolId: String, groupId: String, slotKey: String): GroupCellEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdate(cell: GroupCellEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdateAll(cells: List<GroupCellEntity>)

    /** Targeted single-cell write — the whole point of this table: O(1) indexed UPDATE, not a whole-blob rewrite. */
    @Query("UPDATE group_cells SET value = :value, updatedAt = :updatedAt WHERE protocolId = :protocolId AND groupId = :groupId AND slotKey = :slotKey")
    suspend fun updateValue(protocolId: String, groupId: String, slotKey: String, value: String, updatedAt: Long)

    @Query("UPDATE group_cells SET detectorType = :detectorType WHERE protocolId = :protocolId AND groupId = :groupId AND slotKey = :slotKey")
    suspend fun updateDetectorType(protocolId: String, groupId: String, slotKey: String, detectorType: String)

    @Query("DELETE FROM group_cells WHERE protocolId = :protocolId AND groupId = :groupId")
    suspend fun deleteForGroup(protocolId: String, groupId: String)

    @Query("DELETE FROM group_cells WHERE protocolId = :protocolId")
    suspend fun deleteAllForProtocol(protocolId: String)

    @Query("SELECT * FROM group_cells WHERE protocolId = :protocolId AND updatedAt > :since")
    suspend fun getChangedSince(protocolId: String, since: Long): List<GroupCellEntity>

    @Query("SELECT COALESCE(MAX(orderIndex), -1) FROM group_cells WHERE protocolId = :protocolId AND groupId = :groupId")
    suspend fun getMaxOrderIndex(protocolId: String, groupId: String): Int

    @Query("SELECT COUNT(*) FROM group_cells WHERE protocolId = :protocolId AND detectorType != '-'")
    suspend fun countActive(protocolId: String): Int

    @Query("SELECT COUNT(*) FROM group_cells WHERE protocolId = :protocolId AND detectorType != '-' AND value != '' AND value != 'Def.'")
    suspend fun countTriggered(protocolId: String): Int

    @Query("SELECT * FROM group_cells WHERE protocolId = :protocolId AND value = 'Def.'")
    suspend fun getDefective(protocolId: String): List<GroupCellEntity>
}

/** Optional per-device Hardware inventory (Zentrale/Ringkarten) -- one row per
 * (protocolId, deviceGroupId), independent of the Melderliste tables. */
@Dao
interface HardwareTableDao {
    @Query("SELECT * FROM hardware_tables WHERE protocolId = :protocolId AND deviceGroupId = :deviceGroupId LIMIT 1")
    fun getForDeviceFlow(protocolId: String, deviceGroupId: String): Flow<HardwareTableEntity?>

    @Query("SELECT * FROM hardware_tables WHERE protocolId = :protocolId")
    suspend fun getAllForProtocol(protocolId: String): List<HardwareTableEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(table: HardwareTableEntity)

    @Query("DELETE FROM hardware_tables WHERE protocolId = :protocolId AND deviceGroupId = :deviceGroupId")
    suspend fun deleteForDevice(protocolId: String, deviceGroupId: String)

    @Query("DELETE FROM hardware_tables WHERE protocolId = :protocolId")
    suspend fun deleteAllForProtocol(protocolId: String)
}

/** Ordered Bereich-Namen-Liste per device -- mirrors HardwareTableDao 1:1. */
@Dao
interface BereicheTableDao {
    @Query("SELECT * FROM bereiche_table WHERE protocolId = :protocolId AND deviceGroupId = :deviceGroupId LIMIT 1")
    fun getForDeviceFlow(protocolId: String, deviceGroupId: String): Flow<BereicheTableEntity?>

    @Query("SELECT * FROM bereiche_table WHERE protocolId = :protocolId AND deviceGroupId = :deviceGroupId LIMIT 1")
    suspend fun getForDevice(protocolId: String, deviceGroupId: String): BereicheTableEntity?

    @Query("SELECT * FROM bereiche_table WHERE protocolId = :protocolId")
    suspend fun getAllForProtocol(protocolId: String): List<BereicheTableEntity>

    @Query("SELECT * FROM bereiche_table WHERE protocolId = :protocolId")
    fun getAllForProtocolFlow(protocolId: String): Flow<List<BereicheTableEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(table: BereicheTableEntity)

    @Query("DELETE FROM bereiche_table WHERE protocolId = :protocolId")
    suspend fun deleteAllForProtocol(protocolId: String)
}

@Dao
interface SyncQueueDao {
    @Query("SELECT * FROM sync_queue ORDER BY addedAt ASC")
    suspend fun getAllPending(): List<SyncQueueEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun addToQueue(item: SyncQueueEntity)

    @Delete
    suspend fun removeFromQueue(item: SyncQueueEntity)

    @Query("DELETE FROM sync_queue")
    suspend fun clearQueue()
}

@Dao
interface ServerConfigDao {
    @Query("SELECT * FROM server_config WHERE configId = 1")
    fun getConfigFlow(): Flow<ServerConfigEntity?>

    @Query("SELECT * FROM server_config WHERE configId = 1")
    suspend fun getConfig(): ServerConfigEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveConfig(config: ServerConfigEntity)
}
