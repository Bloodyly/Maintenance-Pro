package de.fs.maintenancepro.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [
        ProtocolEntity::class,
        ProtocolGroupEntity::class,
        GroupCellEntity::class,
        SyncQueueEntity::class,
        ServerConfigEntity::class
    ],
    version = 7,
    exportSchema = false
)
abstract class MaintenanceDatabase : RoomDatabase() {
    abstract fun protocolDao(): ProtocolDao
    abstract fun protocolGroupDao(): ProtocolGroupDao
    abstract fun groupCellDao(): GroupCellDao
    abstract fun syncQueueDao(): SyncQueueDao
    abstract fun serverConfigDao(): ServerConfigDao
}
