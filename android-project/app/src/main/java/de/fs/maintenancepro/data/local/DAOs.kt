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

    @Query("DELETE FROM protocols WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM protocols")
    suspend fun clearAll()
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
