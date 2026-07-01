package de.fs.maintenancepro.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [ProtocolEntity::class, SyncQueueEntity::class, ServerConfigEntity::class],
    version = 3,
    exportSchema = false
)
abstract class MaintenanceDatabase : RoomDatabase() {
    abstract fun protocolDao(): ProtocolDao
    abstract fun syncQueueDao(): SyncQueueDao
    abstract fun serverConfigDao(): ServerConfigDao
}
