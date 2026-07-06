package de.fs.maintenancepro.di

import android.content.Context
import androidx.room.Room
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import de.fs.maintenancepro.data.local.GroupCellDao
import de.fs.maintenancepro.data.local.MaintenanceDatabase
import de.fs.maintenancepro.data.local.MIGRATION_4_5
import de.fs.maintenancepro.data.local.MIGRATION_5_6
import de.fs.maintenancepro.data.local.MIGRATION_6_7
import de.fs.maintenancepro.data.local.ProtocolDao
import de.fs.maintenancepro.data.local.ProtocolGroupDao
import de.fs.maintenancepro.data.local.ServerConfigDao
import de.fs.maintenancepro.data.local.SyncQueueDao
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(
        @ApplicationContext context: Context
    ): MaintenanceDatabase {
        return Room.databaseBuilder(
            context,
            MaintenanceDatabase::class.java,
            "maintenance_pro.db"
        )
            .addMigrations(MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7)
            .fallbackToDestructiveMigration() // last-resort net for any future unhandled version jump
            .build()
    }

    @Provides
    fun provideProtocolDao(db: MaintenanceDatabase): ProtocolDao = db.protocolDao()

    @Provides
    fun provideProtocolGroupDao(db: MaintenanceDatabase): ProtocolGroupDao = db.protocolGroupDao()

    @Provides
    fun provideGroupCellDao(db: MaintenanceDatabase): GroupCellDao = db.groupCellDao()

    @Provides
    fun provideSyncQueueDao(db: MaintenanceDatabase): SyncQueueDao = db.syncQueueDao()

    @Provides
    fun provideServerConfigDao(db: MaintenanceDatabase): ServerConfigDao = db.serverConfigDao()
}
