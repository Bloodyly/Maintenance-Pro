package de.fs.maintenancepro.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Persists downloaded protocols and their current local state.
 * Offline-first design allows full read, write, and editing operations offline.
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
    
    // Serialization of dynamic layouts to support flexible schemas and arbitrary column sizes
    val decryptedPayloadJson: String,
    
    val lastEditedAt: Long = 0L,
    
    val isArchived: Boolean = false
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
    val serverAddress: String = "https://field-service.corp.internal",
    val port: Int = 8443,
    val username: String = "TECH_UNIT_99283",
    val encryptedPasswordBase64: String = ""
)
