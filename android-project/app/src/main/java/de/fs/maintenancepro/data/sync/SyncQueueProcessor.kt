package de.fs.maintenancepro.data.sync

import de.fs.maintenancepro.data.local.ProtocolDao
import de.fs.maintenancepro.data.local.SyncQueueDao
import de.fs.maintenancepro.data.remote.ApiService
import de.fs.maintenancepro.data.remote.ProtocolCellDto
import de.fs.maintenancepro.data.remote.ProtocolGroupDto
import de.fs.maintenancepro.data.remote.UploadProtocolDto
import org.json.JSONArray
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Uploads whatever is sitting in the offline sync queue. Shared by
 * MainViewModel (the "app is open" fast path) and SyncUploadWorker (the
 * WorkManager background path that keeps retrying even after the app is
 * closed or the device reboots) so the actual upload/parsing logic exists
 * exactly once.
 */
@Singleton
class SyncQueueProcessor @Inject constructor(
    private val apiService: ApiService,
    private val syncQueueDao: SyncQueueDao,
    private val protocolDao: ProtocolDao,
) {
    /** Returns true if every pending item uploaded successfully (or the queue was empty). */
    suspend fun processQueue(): Boolean {
        val pendingItems = syncQueueDao.getAllPending()
        if (pendingItems.isEmpty()) return true

        var allSucceeded = true
        for (item in pendingItems) {
            try {
                val root = JSONObject(item.serializedUploadData)
                val rowsArr = root.optJSONArray("rows") ?: JSONArray()
                val rows = mutableListOf<ProtocolGroupDto>()
                for (i in 0 until rowsArr.length()) {
                    val rowO = rowsArr.getJSONObject(i)
                    val cellsArr = rowO.optJSONArray("cells") ?: JSONArray()
                    val cellsList = mutableListOf<ProtocolCellDto>()
                    for (j in 0 until cellsArr.length()) {
                        val cellO = cellsArr.getJSONObject(j)
                        cellsList.add(
                            ProtocolCellDto(
                                slot_key = cellO.getString("slot_key"),
                                detector_type = cellO.getString("detector_type"),
                                value = cellO.optString("value", ""),
                                updated_at = cellO.optLong("updated_at", 0L)
                            )
                        )
                    }
                    rows.add(
                        ProtocolGroupDto(
                            group_id = rowO.getString("group_id"),
                            group_name = rowO.optString("group_name", ""),
                            cells = cellsList
                        )
                    )
                }
                val dto = UploadProtocolDto(
                    protocol_id = item.protocolId,
                    finished_at = root.optString("finished_at", ""),
                    technician_id = root.optString("technician_id", "99283-FS"),
                    rows = rows
                )
                val response = apiService.uploadProtocol(item.protocolId, dto)
                if (response.isSuccessful) {
                    syncQueueDao.removeFromQueue(item)
                    protocolDao.updateStatus(item.protocolId, "synchronized")
                } else {
                    allSucceeded = false
                }
            } catch (e: Exception) {
                // Leave it queued -- next trigger (WorkManager retry, app reopen,
                // or the periodic fallback) will try this item again.
                allSucceeded = false
            }
        }
        return allSucceeded
    }
}
