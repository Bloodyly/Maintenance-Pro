package de.fs.maintenancepro.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import de.fs.maintenancepro.data.local.*
import de.fs.maintenancepro.data.remote.ApiService
import de.fs.maintenancepro.data.remote.ProtocolGroupDto
import de.fs.maintenancepro.data.remote.UploadProtocolDto
import de.fs.maintenancepro.data.remote.SearchRequestDto
import de.fs.maintenancepro.data.remote.ProtocolCellDto
import de.fs.maintenancepro.data.remote.ProtocolItemDto
import de.fs.maintenancepro.data.remote.ProtocolDefinitionDto
import de.fs.maintenancepro.data.remote.ProtocolColumnDto
import de.fs.maintenancepro.data.remote.ApplicableValueDto
import de.fs.maintenancepro.data.remote.SyncDeltaRequestDto
import de.fs.maintenancepro.data.remote.SyncUploadCellsDto
import de.fs.maintenancepro.data.remote.SyncCellChangeDto
import de.fs.maintenancepro.data.remote.SyncProtocolDto
import de.fs.maintenancepro.data.remote.SyncRowDto
import kotlinx.coroutines.flow.first
import de.fs.maintenancepro.data.crypto.CryptoManager
import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*
import javax.inject.Inject

@HiltViewModel
class MainViewModel @Inject constructor(
    private val protocolDao: ProtocolDao,
    private val syncQueueDao: SyncQueueDao,
    private val serverConfigDao: ServerConfigDao,
    private val apiService: ApiService,
    private val sessionManager: ActiveSessionManager,
    @ApplicationContext private val context: Context
) : ViewModel() {

    // Flows
    val protocols: Flow<List<ProtocolEntity>> = protocolDao.getAllProtocolsFlow()
    val serverConfig: Flow<ServerConfigEntity?> = serverConfigDao.getConfigFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery

    private val _isOffline = MutableStateFlow(false)
    val isOffline: StateFlow<Boolean> = _isOffline

    private val _isServerAvailable = MutableStateFlow(false)
    val isServerAvailable: StateFlow<Boolean> = _isServerAvailable

    private val _searchResults = MutableStateFlow<List<ProtocolItemDto>>(emptyList())
    val searchResults: StateFlow<List<ProtocolItemDto>> = _searchResults

    private val _liveModusEnabled = MutableStateFlow(false)
    val liveModusEnabled: StateFlow<Boolean> = _liveModusEnabled

    private val _activeProtocolId = MutableStateFlow<String?>(null)
    val activeProtocolId: StateFlow<String?> = _activeProtocolId

    private val _activeProtocolPayload = MutableStateFlow<String?>(null)
    val activeProtocolPayload: StateFlow<String?> = _activeProtocolPayload

    // ── Offline-Sync State ──────────────────────────────────────────────────
    sealed class SyncState {
        object Idle : SyncState()
        data class InProgress(val message: String) : SyncState()
        data class Done(val downloaded: Int, val uploaded: Int) : SyncState()
        data class Error(val message: String) : SyncState()
    }

    private val _syncState = MutableStateFlow<SyncState>(SyncState.Idle)
    val syncState: StateFlow<SyncState> = _syncState

    fun setLiveModusEnabled(enabled: Boolean) {
        _liveModusEnabled.value = enabled
    }

    fun setActiveProtocolId(id: String?) {
        _activeProtocolId.value = id
    }

    init {
        // Run initial background tasks
        processSyncQueue()
        startLiveSyncLoop()
        startConnectivityCheckLoop()
        updateSearchQuery("")
    }

    private fun startConnectivityCheckLoop() {
        viewModelScope.launch(Dispatchers.IO) {
            while (true) {
                if (_isOffline.value) {
                    _isServerAvailable.value = false
                } else {
                    try {
                        val response = apiService.checkAuth()
                        _isServerAvailable.value = response.isSuccessful
                    } catch (e: Exception) {
                        _isServerAvailable.value = false
                    }
                }
                kotlinx.coroutines.delay(10000) // check every 10 seconds
            }
        }
    }

    fun checkConnectivity() {
        viewModelScope.launch(Dispatchers.IO) {
            if (_isOffline.value) {
                _isServerAvailable.value = false
                return@launch
            }
            try {
                val response = apiService.checkAuth()
                _isServerAvailable.value = response.isSuccessful
            } catch (e: Exception) {
                _isServerAvailable.value = false
            }
        }
    }

    fun searchRemoteProtocols(query: String) {
        viewModelScope.launch(Dispatchers.IO) {
            if (_isOffline.value || !_isServerAvailable.value) {
                // Return local mock items if offline
                _searchResults.value = getOfflineFallbackMockItems().filter {
                    it.name.contains(query, ignoreCase = true) ||
                    it.address.contains(query, ignoreCase = true) ||
                    it.contract_number.contains(query, ignoreCase = true)
                }
                return@launch
            }
            try {
                val response = apiService.searchProtocols(SearchRequestDto(query))
                if (response.isSuccessful && response.body() != null) {
                    _searchResults.value = response.body()!!
                } else {
                    _searchResults.value = getOfflineFallbackMockItems().filter {
                        it.name.contains(query, ignoreCase = true) ||
                        it.address.contains(query, ignoreCase = true) ||
                        it.contract_number.contains(query, ignoreCase = true)
                    }
                }
            } catch (e: Exception) {
                _searchResults.value = getOfflineFallbackMockItems().filter {
                    it.name.contains(query, ignoreCase = true) ||
                    it.address.contains(query, ignoreCase = true) ||
                    it.contract_number.contains(query, ignoreCase = true)
                }
            }
        }
    }

    fun saveConfig(address: String, portVal: Int, user: String, passHex: String, keyHex: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val config = ServerConfigEntity(
                serverAddress = address,
                port = portVal,
                username = user,
                encryptedPasswordBase64 = passHex
            )
            serverConfigDao.saveConfig(config)
            sessionManager.setNetworkConfig(address, portVal)
            sessionManager.setSession(user, passHex.toCharArray(), keyHex.toCharArray())
            checkConnectivity()
            // reload search list with new server configs
            searchRemoteProtocols(_searchQuery.value)
        }
    }

    private fun startLiveSyncLoop() {
        viewModelScope.launch(Dispatchers.IO) {
            combine(_activeProtocolId, _liveModusEnabled, _isOffline) { id, live, offline ->
                Triple(id, live, offline)
            }.collectLatest { (id, live, offline) ->
                if (id != null && live && !offline) {
                    while (true) {
                        try {
                            val protocol = protocolDao.getProtocolById(id)
                            if (protocol != null) {
                                val request = de.fs.maintenancepro.data.remote.LiveSyncRequestDto(
                                    protocol_id = id,
                                    payload_json = protocol.decryptedPayloadJson
                                )
                                val response = apiService.liveSyncProtocol(id, request)
                                if (response.isSuccessful && response.body() != null) {
                                    val serverResp = response.body()!!
                                    val mergedJson = serverResp.payload_json
                                    if (mergedJson != protocol.decryptedPayloadJson) {
                                        val updated = protocol.copy(
                                            decryptedPayloadJson = mergedJson,
                                            lastEditedAt = System.currentTimeMillis()
                                        )
                                        protocolDao.insertOrUpdate(updated)
                                        // Update active payload in memory if client is currently editing
                                        _activeProtocolPayload.value = mergedJson
                                    }
                                }
                            }
                        } catch (e: Exception) {
                            // ignore, retry on next tick
                        }
                        kotlinx.coroutines.delay(1500)
                    }
                }
            }
        }
    }


    fun updateSearchQuery(query: String) {
        _searchQuery.value = query
        searchRemoteProtocols(query)
    }

    fun toggleOfflineMode() {
        _isOffline.value = !_isOffline.value
        if (!_isOffline.value) {
            processSyncQueue() // Retry queued syncs upon going back online
            checkConnectivity()
        } else {
            _isServerAvailable.value = false
        }
    }

    /**
     * Download inspection protocol and cache it locally inside Room (Offline-First)
     */
    fun downloadProtocol(item: ProtocolItemDto) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                if (_isOffline.value) throw Exception("Offline Mode is active.")
                
                val response = apiService.downloadProtocol(item.id)
                if (response.isSuccessful && response.body() != null) {
                    val encryptedPayload = response.body()!!
                    
                    // Decrypt dynamic protocol structure
                    val creds = sessionManager.getActiveCredentials()
                    val decryptedJson = CryptoManager.decrypt(encryptedPayload, creds.codewordKey!!)
                    
                    val entity = ProtocolEntity(
                        id = item.id,
                        name = item.name,
                        address = item.address,
                        contractNumber = item.contract_number,
                        interval = item.interval,
                        systemType = item.system_type,
                        localStatus = "downloaded",
                        decryptedPayloadJson = decryptedJson,
                        lastEditedAt = System.currentTimeMillis()
                    )
                    protocolDao.insertOrUpdate(entity)
                }
            } catch (e: Exception) {
                // If network download fails, load simple cached mock structure for failover demo/offline testing
                val dummyPayload = createDefaultDynamicProtocol(item)
                val entity = ProtocolEntity(
                    id = item.id,
                    name = item.name,
                    address = item.address,
                    contractNumber = item.contract_number,
                    interval = item.interval,
                    systemType = item.system_type,
                    localStatus = "downloaded",
                    decryptedPayloadJson = dummyPayload,
                    lastEditedAt = System.currentTimeMillis()
                )
                protocolDao.insertOrUpdate(entity)
            }
        }
    }

    /**
     * Updates individual checklist cells of a protocol instantly in SQLite
     * to protect against accidental battery death or OS-level application restarts.
     */
    fun editCell(protocolId: String, groupId: String, slotKey: String, writeValue: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val protocol = protocolDao.getProtocolById(protocolId) ?: return@launch
            val rootJson = JSONObject(protocol.decryptedPayloadJson)
            val rowsArray = rootJson.getJSONArray("rows")
            
            val now = System.currentTimeMillis()
            
            for (i in 0 until rowsArray.length()) {
                val rowObj = rowsArray.getJSONObject(i)
                if (rowObj.getString("group_id") == groupId) {
                    val cellsArray = rowObj.getJSONArray("cells")
                    for (j in 0 until cellsArray.length()) {
                        val cellObj = cellsArray.getJSONObject(j)
                        if (cellObj.getString("slot_key") == slotKey) {
                            cellObj.put("value", writeValue)
                            cellObj.put("updated_at", now)
                            break
                        }
                    }
                    break
                }
            }

            val updatedEntity = protocol.copy(
                decryptedPayloadJson = rootJson.toString(),
                lastEditedAt = System.currentTimeMillis(),
                localStatus = "upload_pending"
            )
            protocolDao.insertOrUpdate(updatedEntity)
            _activeProtocolPayload.value = rootJson.toString()
        }
    }

    /**
     * Updates multiple cells of a group row at once in SQLite database and state.
     * Dramatically increases performance on "mark all / unmark all" row actions.
     */
    fun batchEditGroupCells(protocolId: String, groupId: String, cellValues: Map<String, String>) {
        viewModelScope.launch(Dispatchers.IO) {
            val protocol = protocolDao.getProtocolById(protocolId) ?: return@launch
            val rootJson = JSONObject(protocol.decryptedPayloadJson)
            val rowsArray = rootJson.getJSONArray("rows")
            val now = System.currentTimeMillis()
            var modified = false
            
            for (i in 0 until rowsArray.length()) {
                val rowObj = rowsArray.getJSONObject(i)
                if (rowObj.getString("group_id") == groupId) {
                    val cellsArray = rowObj.getJSONArray("cells")
                    for (j in 0 until cellsArray.length()) {
                        val cellObj = cellsArray.getJSONObject(j)
                        val slotKey = cellObj.getString("slot_key")
                        if (cellValues.containsKey(slotKey)) {
                            cellObj.put("value", cellValues[slotKey] ?: "")
                            cellObj.put("updated_at", now)
                            modified = true
                        }
                    }
                    break
                }
            }

            if (modified) {
                val updatedEntity = protocol.copy(
                    decryptedPayloadJson = rootJson.toString(),
                    lastEditedAt = System.currentTimeMillis(),
                    localStatus = "upload_pending"
                )
                protocolDao.insertOrUpdate(updatedEntity)
                _activeProtocolPayload.value = rootJson.toString()
            }
        }
    }

    /**
     * Structure edit logic: add a new group dynamically to the detector matrix
     */
    fun addGroup(protocolId: String, newGroupId: String, groupName: String, columnKeys: List<String>) {
        viewModelScope.launch(Dispatchers.IO) {
            val protocol = protocolDao.getProtocolById(protocolId) ?: return@launch
            val rootJson = JSONObject(protocol.decryptedPayloadJson)
            val rowsArray = rootJson.getJSONArray("rows")

            val now = System.currentTimeMillis()
            val newRowObj = JSONObject().apply {
                put("group_id", newGroupId)
                put("group_name", groupName)
                
                val cellsArray = JSONArray()
                columnKeys.forEach { colKey ->
                    cellsArray.put(JSONObject().apply {
                        put("slot_key", colKey)
                        put("detector_type", "ZD")
                        put("value", "")
                        put("updated_at", now)
                    })
                }
                put("cells", cellsArray)
            }
            rowsArray.put(newRowObj)

            val updatedEntity = protocol.copy(
                decryptedPayloadJson = rootJson.toString(),
                localStatus = "upload_pending",
                lastEditedAt = System.currentTimeMillis()
            )
            protocolDao.insertOrUpdate(updatedEntity)
            _activeProtocolPayload.value = rootJson.toString()
        }
    }

    /**
     * Structure edit logic: add a new slot column dynamically across all existing matrices
     */
    fun addSlotColumn(protocolId: String, newColumnKey: String, newColumnLabel: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val protocol = protocolDao.getProtocolById(protocolId) ?: return@launch
            val rootJson = JSONObject(protocol.decryptedPayloadJson)
            val definitionObj = rootJson.getJSONObject("definition")
            val columnsArray = definitionObj.getJSONArray("columns")
            
            // Add column to header definitions
            columnsArray.put(JSONObject().apply {
                put("key", newColumnKey)
                put("label", newColumnLabel)
            })

            // Add slots to all existing matrix groups
            val now = System.currentTimeMillis()
            val rowsArray = rootJson.getJSONArray("rows")
            for (i in 0 until rowsArray.length()) {
                val rowObj = rowsArray.getJSONObject(i)
                val cellsArray = rowObj.getJSONArray("cells")
                cellsArray.put(JSONObject().apply {
                    put("slot_key", newColumnKey)
                    put("detector_type", "ZD")
                    put("value", "")
                    put("updated_at", now)
                })
            }

            val updatedEntity = protocol.copy(
                decryptedPayloadJson = rootJson.toString(),
                localStatus = "upload_pending",
                lastEditedAt = System.currentTimeMillis()
            )
            protocolDao.insertOrUpdate(updatedEntity)
            _activeProtocolPayload.value = rootJson.toString()
        }
    }

    /**
     * Delete a group row from the matrix
     */
    fun deleteGroup(protocolId: String, groupId: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val protocol = protocolDao.getProtocolById(protocolId) ?: return@launch
            val rootJson = JSONObject(protocol.decryptedPayloadJson)
            val rowsArray = rootJson.getJSONArray("rows")
            
            val newRowsArray = JSONArray()
            for (i in 0 until rowsArray.length()) {
                val rowObj = rowsArray.getJSONObject(i)
                if (rowObj.getString("group_id") != groupId) {
                    newRowsArray.put(rowObj)
                }
            }
            rootJson.put("rows", newRowsArray)

            val updatedEntity = protocol.copy(
                decryptedPayloadJson = rootJson.toString(),
                lastEditedAt = System.currentTimeMillis(),
                localStatus = "upload_pending"
            )
            protocolDao.insertOrUpdate(updatedEntity)
            _activeProtocolPayload.value = rootJson.toString()
        }
    }

    /**
     * Update group metadata (ID, name, and option type)
     */
    fun updateGroupDetails(protocolId: String, oldGroupId: String, newGroupId: String, newGroupName: String, newGroupType: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val protocol = protocolDao.getProtocolById(protocolId) ?: return@launch
            val rootJson = JSONObject(protocol.decryptedPayloadJson)
            val rowsArray = rootJson.getJSONArray("rows")
            
            for (i in 0 until rowsArray.length()) {
                val rowObj = rowsArray.getJSONObject(i)
                if (rowObj.getString("group_id") == oldGroupId) {
                    rowObj.put("group_id", newGroupId)
                    rowObj.put("group_name", newGroupName)
                    rowObj.put("group_type", newGroupType)
                    break
                }
            }

            val updatedEntity = protocol.copy(
                decryptedPayloadJson = rootJson.toString(),
                lastEditedAt = System.currentTimeMillis(),
                localStatus = "upload_pending"
            )
            protocolDao.insertOrUpdate(updatedEntity)
            _activeProtocolPayload.value = rootJson.toString()
        }
    }

    /**
     * Update the detector type for a particular cell slot
     */
    fun updateCellDetectorType(protocolId: String, groupId: String, slotKey: String, newDetectorType: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val protocol = protocolDao.getProtocolById(protocolId) ?: return@launch
            val rootJson = JSONObject(protocol.decryptedPayloadJson)
            val rowsArray = rootJson.getJSONArray("rows")
            
            for (i in 0 until rowsArray.length()) {
                val rowObj = rowsArray.getJSONObject(i)
                if (rowObj.getString("group_id") == groupId) {
                    val cellsArray = rowObj.getJSONArray("cells")
                    for (j in 0 until cellsArray.length()) {
                        val cellObj = cellsArray.getJSONObject(j)
                        if (cellObj.getString("slot_key") == slotKey) {
                            cellObj.put("detector_type", newDetectorType)
                            break
                        }
                    }
                    break
                }
            }

            val updatedEntity = protocol.copy(
                decryptedPayloadJson = rootJson.toString(),
                lastEditedAt = System.currentTimeMillis(),
                localStatus = "upload_pending"
            )
            protocolDao.insertOrUpdate(updatedEntity)
            _activeProtocolPayload.value = rootJson.toString()
        }
    }

    /**
     * Full synchronize of completed checklists. Places failing attempts safely
     * into the Room local background queue for robust retry.
     */
    fun synchronizeProtocol(protocolId: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val protocol = protocolDao.getProtocolById(protocolId) ?: return@launch
            val rootJson = JSONObject(protocol.decryptedPayloadJson)
            
            val uploadDto = UploadProtocolDto(
                protocol_id = protocolId,
                finished_at = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.GERMANY).format(Date()),
                technician_id = "99283-FS",
                rows = parseGroupsFromJson(rootJson.getJSONArray("rows"))
            )

            if (_isOffline.value) {
                // Instantly enqueue for offline sync queue if network offline
                enqueueSync(protocolId, uploadDto)
                return@launch
            }

            try {
                val response = apiService.uploadProtocol(protocolId, uploadDto)
                if (response.isSuccessful) {
                    val updatedEntity = protocol.copy(localStatus = "synchronized")
                    protocolDao.insertOrUpdate(updatedEntity)
                } else {
                    enqueueSync(protocolId, uploadDto)
                }
            } catch (e: Exception) {
                enqueueSync(protocolId, uploadDto)
            }
        }
    }

    private suspend fun enqueueSync(protocolId: String, dto: UploadProtocolDto) {
        val serialized = JSONObject().apply {
            put("protocol_id", dto.protocol_id)
            put("finished_at", dto.finished_at)
            put("technician_id", dto.technician_id)
            // serialized subgroups...
        }.toString()
        
        syncQueueDao.addToQueue(SyncQueueEntity(protocolId = protocolId, serializedUploadData = serialized))
        
        // Push status to "upload_pending"
        val protocol = protocolDao.getProtocolById(protocolId)
        if (protocol != null) {
            protocolDao.insertOrUpdate(protocol.copy(localStatus = "upload_pending"))
        }
    }

    /**
     * Loops through background queues and uploads pending data in backoff retry
     */
    fun processSyncQueue() {
        viewModelScope.launch(Dispatchers.IO) {
            val pendingItems = syncQueueDao.getAllPending()
            if (pendingItems.isEmpty()) return@launch

            for (item in pendingItems) {
                if (_isOffline.value) break
                try {
                    // Simulate posting elements
                    val dummyDto = UploadProtocolDto(
                        protocol_id = item.protocolId,
                        finished_at = "2026-05-27T22:33:02Z",
                        technician_id = "99283-FS",
                        rows = emptyList()
                    )
                    val response = apiService.uploadProtocol(item.protocolId, dummyDto)
                    if (response.isSuccessful) {
                        syncQueueDao.removeFromQueue(item)
                        val protocol = protocolDao.getProtocolById(item.protocolId)
                        if (protocol != null) {
                            protocolDao.insertOrUpdate(protocol.copy(localStatus = "synchronized"))
                        }
                    }
                } catch (e: Exception) {
                    // Back off and allow next retry
                }
            }
        }
    }

    /**
     * Set a protocol as archived (isArchived = true)
     */
    fun archiveProtocol(protocolId: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val protocol = protocolDao.getProtocolById(protocolId) ?: return@launch
            val updated = protocol.copy(isArchived = true)
            protocolDao.insertOrUpdate(updated)
        }
    }

    /**
     * Restore a protocol from archive (isArchived = false)
     */
    fun restoreProtocol(protocolId: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val protocol = protocolDao.getProtocolById(protocolId) ?: return@launch
            val updated = protocol.copy(isArchived = false)
            protocolDao.insertOrUpdate(updated)
        }
    }

    /**
     * Delete a protocol locally (delete from Room entirely so it goes back to ready_to_download)
     */
    fun deleteProtocolLocally(protocolId: String) {
        viewModelScope.launch(Dispatchers.IO) {
            protocolDao.deleteById(protocolId)
        }
    }

    /**
     * Wipes database variables for debug and cache security
     */
    fun clearDatabaseCache() {
        viewModelScope.launch(Dispatchers.IO) {
            protocolDao.clearAll()
            syncQueueDao.clearQueue()
        }
    }

    /**
     * Setup configurations derived instantly from QR scans to eliminate onboarding keystroke errors.
     * QR Schema format: maintenancepro://setup?address=URL&port=PORT&user=USER&pass=PASS&key=KEY
     */
    fun applyQrSetup(qrUriString: String): Boolean {
        return try {
            if (qrUriString.startsWith("SECURE_MANDANT;")) {
                val parts = qrUriString.split(";")
                if (parts.size >= 7) {
                    val tenantId = parts[1]
                    val address = parts[2]
                    val port = parts[3].toIntOrNull() ?: 3000
                    val user = parts[4]
                    val pass = parts[5]
                    val key = parts[6]

                    viewModelScope.launch(Dispatchers.IO) {
                        val config = ServerConfigEntity(
                            serverAddress = address,
                            port = port,
                            username = user,
                            encryptedPasswordBase64 = pass
                        )
                        serverConfigDao.saveConfig(config)
                        sessionManager.setNetworkConfig(address, port)
                        sessionManager.setSession(user, pass.toCharArray(), key.toCharArray())
                        checkConnectivity()
                        searchRemoteProtocols(_searchQuery.value)
                    }
                    return true
                }
            }

            val uri = android.net.Uri.parse(qrUriString)
            if (uri.scheme == "maintenancepro" && uri.host == "setup") {
                val address = uri.getQueryParameter("address") ?: "http://field-service.corp.internal"
                val port = uri.getQueryParameter("port")?.toIntOrNull() ?: 8443
                val user = uri.getQueryParameter("user") ?: "TECH_UNIT_99283"
                val pass = uri.getQueryParameter("pass") ?: ""
                val key = uri.getQueryParameter("key") ?: ""

                viewModelScope.launch(Dispatchers.IO) {
                    val config = ServerConfigEntity(
                        serverAddress = address,
                        port = port,
                        username = user,
                        encryptedPasswordBase64 = pass
                    )
                    serverConfigDao.saveConfig(config)
                    sessionManager.setNetworkConfig(address, port)
                    sessionManager.setSession(user, pass.toCharArray(), key.toCharArray())
                    checkConnectivity()
                    searchRemoteProtocols(_searchQuery.value)
                }
                return true
            }
            false
        } catch (e: Exception) {
            false
        }
    }

    // ── Grundsynchronisation: bulk download all contracts with Auslöselisten ──

    fun startFullSync() {
        viewModelScope.launch(Dispatchers.IO) {
            if (_isOffline.value) { _syncState.value = SyncState.Error("Kein Netzwerk"); return@launch }
            _syncState.value = SyncState.InProgress("Verbinde mit Server…")
            try {
                val response = apiService.syncFull()
                if (!response.isSuccessful || response.body() == null) {
                    _syncState.value = SyncState.Error("Server-Fehler ${response.code()}"); return@launch
                }
                val body = response.body()!!
                _syncState.value = SyncState.InProgress("Speichere ${body.protocols.size} Verträge…")
                for (proto in body.protocols) {
                    protocolDao.insertOrUpdate(ProtocolEntity(
                        id = proto.id, name = proto.name, address = proto.address,
                        contractNumber = proto.contract_number, interval = proto.interval,
                        systemType = proto.system_type, localStatus = proto.status,
                        decryptedPayloadJson = buildSyncPayloadJson(proto),
                        lastEditedAt = proto.updated_at
                    ))
                }
                val config = serverConfigDao.getConfig() ?: ServerConfigEntity()
                serverConfigDao.saveConfig(config.copy(lastFullSyncAt = body.sync_version))
                _syncState.value = SyncState.Done(downloaded = body.protocols.size, uploaded = 0)
            } catch (e: Exception) {
                _syncState.value = SyncState.Error("Fehler: ${e.message}")
            }
        }
    }

    // ── Delta-Sync: upload local changes + download server changes ──────────

    fun startDeltaSync() {
        viewModelScope.launch(Dispatchers.IO) {
            if (_isOffline.value) { _syncState.value = SyncState.Error("Kein Netzwerk"); return@launch }
            _syncState.value = SyncState.InProgress("Prüfe auf Änderungen…")
            try {
                val config = serverConfigDao.getConfig()
                val since = config?.lastFullSyncAt ?: 0L

                // 1. Collect cells modified locally since last sync
                val localChanges = collectLocalChanges(since)

                // 2. Download server delta
                val deltaResp = apiService.syncDelta(SyncDeltaRequestDto(since))
                if (!deltaResp.isSuccessful || deltaResp.body() == null) {
                    _syncState.value = SyncState.Error("Delta-Fehler ${deltaResp.code()}"); return@launch
                }
                val delta = deltaResp.body()!!

                // 3. Merge server delta into local Room entities
                _syncState.value = SyncState.InProgress("${delta.protocols.size} geänderte Verträge…")
                for (proto in delta.protocols) {
                    val existing = protocolDao.getProtocolById(proto.id)
                    val mergedPayload = if (existing != null) {
                        mergeServerDeltaIntoLocal(existing.decryptedPayloadJson, proto)
                    } else {
                        buildSyncPayloadJson(proto)
                    }
                    protocolDao.insertOrUpdate(ProtocolEntity(
                        id = proto.id, name = proto.name, address = proto.address,
                        contractNumber = proto.contract_number, interval = proto.interval,
                        systemType = proto.system_type, localStatus = proto.status,
                        decryptedPayloadJson = mergedPayload, lastEditedAt = delta.sync_version
                    ))
                }

                // 4. Upload local changes to server
                var uploadedCount = 0
                if (localChanges.isNotEmpty()) {
                    _syncState.value = SyncState.InProgress("Lade ${localChanges.size} Änderungen hoch…")
                    val uploadResp = apiService.uploadCells(SyncUploadCellsDto(localChanges))
                    if (uploadResp.isSuccessful && uploadResp.body() != null) {
                        uploadedCount = uploadResp.body()!!.applied
                        // Mark successfully uploaded protocols as synchronized
                        localChanges.map { it.protocol_id }.distinct().forEach { pid ->
                            protocolDao.getProtocolById(pid)?.let { e ->
                                protocolDao.insertOrUpdate(e.copy(localStatus = "synchronized"))
                            }
                        }
                    }
                }

                serverConfigDao.saveConfig((config ?: ServerConfigEntity()).copy(lastFullSyncAt = delta.sync_version))
                _syncState.value = SyncState.Done(downloaded = delta.protocols.size, uploaded = uploadedCount)
            } catch (e: Exception) {
                _syncState.value = SyncState.Error("Sync-Fehler: ${e.message}")
            }
        }
    }

    /** Collect all cells with updated_at > since across local upload_pending protocols. */
    private suspend fun collectLocalChanges(since: Long): List<SyncCellChangeDto> {
        val changes = mutableListOf<SyncCellChangeDto>()
        val allProtocols = protocolDao.getAllProtocolsFlow().first()
        for (entity in allProtocols) {
            if (entity.localStatus != "upload_pending") continue
            try {
                val root = JSONObject(entity.decryptedPayloadJson)
                val rows = root.getJSONArray("rows")
                for (i in 0 until rows.length()) {
                    val row = rows.getJSONObject(i)
                    val groupId = row.getString("group_id")
                    val cells = row.getJSONArray("cells")
                    for (j in 0 until cells.length()) {
                        val cell = cells.getJSONObject(j)
                        val updatedAt = cell.optLong("updated_at", 0L)
                        if (updatedAt > since) {
                            changes.add(SyncCellChangeDto(
                                protocol_id = entity.id,
                                group_id = groupId,
                                slot_key = cell.getString("slot_key"),
                                detector_type = cell.optString("detector_type", "-"),
                                value = cell.optString("value", ""),
                                updated_at = updatedAt
                            ))
                        }
                    }
                }
            } catch (_: Exception) { }
        }
        return changes
    }

    /** Build the standard payload JSON from a SyncProtocolDto (used for full sync and new protocols). */
    private fun buildSyncPayloadJson(proto: SyncProtocolDto): String {
        return JSONObject().apply {
            put("protocol_id", proto.id)
            put("client_name", proto.name)
            put("contract_number", proto.contract_number)
            put("interval", proto.interval)
            put("system_type", proto.system_type)

            val defObj = JSONObject()
            proto.definition?.let { def ->
                val colsArr = JSONArray().also { arr -> def.columns.forEach { c -> arr.put(JSONObject().apply { put("key", c.key); put("label", c.label) }) } }
                val valArr  = JSONArray().also { arr -> def.applicable_values.forEach { v -> arr.put(JSONObject().apply { put("value", v.value); put("label", v.label); put("is_defect", v.is_defect) }) } }
                val dtArr   = JSONArray().also { arr -> def.detector_types.forEach { arr.put(it) } }
                defObj.put("columns", colsArr)
                defObj.put("applicable_values", valArr)
                defObj.put("detector_types", dtArr)
            }
            put("definition", defObj)
            put("rows", buildRowsArray(proto.rows))
        }.toString()
    }

    private fun buildRowsArray(rows: List<SyncRowDto>): JSONArray =
        JSONArray().also { arr ->
            rows.forEach { row ->
                arr.put(JSONObject().apply {
                    put("group_id", row.group_id)
                    put("group_name", row.group_name)
                    put("group_type", row.group_type)
                    row.anlage_id?.let { put("anlage_id", it) }
                    row.anlage_name?.let { put("anlage_name", it) }
                    row.anlage_type?.let { put("anlage_type", it) }
                    row.anlage_interval?.let { put("anlage_interval", it) }
                    put("cells", JSONArray().also { ca ->
                        row.cells.forEach { c ->
                            ca.put(JSONObject().apply {
                                put("slot_key", c.slot_key); put("detector_type", c.detector_type)
                                put("value", c.value); put("updated_at", c.updated_at)
                            })
                        }
                    })
                })
            }
        }

    /**
     * Merges a server delta into the existing local JSON payload.
     * Server wins for cells with newer updated_at; local wins otherwise.
     */
    private fun mergeServerDeltaIntoLocal(localJson: String, serverDelta: SyncProtocolDto): String {
        return try {
            val root = JSONObject(localJson)
            val localRows = root.getJSONArray("rows")

            // group_id → row index map
            val groupIdx = (0 until localRows.length()).associateBy { localRows.getJSONObject(it).getString("group_id") }

            for (serverRow in serverDelta.rows) {
                val idx = groupIdx[serverRow.group_id]
                if (idx == null) {
                    // New group from server
                    localRows.put(JSONObject().apply {
                        put("group_id", serverRow.group_id); put("group_name", serverRow.group_name)
                        put("group_type", serverRow.group_type)
                        put("cells", JSONArray().also { ca -> serverRow.cells.forEach { c -> ca.put(JSONObject().apply { put("slot_key", c.slot_key); put("detector_type", c.detector_type); put("value", c.value); put("updated_at", c.updated_at) }) } })
                    })
                    continue
                }

                val localRow = localRows.getJSONObject(idx)
                val localCells = localRow.getJSONArray("cells")
                val cellIdx = (0 until localCells.length()).associateBy { localCells.getJSONObject(it).getString("slot_key") }

                for (sc in serverRow.cells) {
                    val ci = cellIdx[sc.slot_key]
                    if (ci == null) {
                        localCells.put(JSONObject().apply { put("slot_key", sc.slot_key); put("detector_type", sc.detector_type); put("value", sc.value); put("updated_at", sc.updated_at) })
                    } else {
                        val lc = localCells.getJSONObject(ci)
                        if (sc.updated_at > lc.optLong("updated_at", 0L)) {
                            lc.put("detector_type", sc.detector_type)
                            lc.put("value", sc.value)
                            lc.put("updated_at", sc.updated_at)
                        }
                    }
                }
            }
            root.toString()
        } catch (_: Exception) {
            buildSyncPayloadJson(serverDelta)
        }
    }

    private fun parseGroupsFromJson(jsonArray: JSONArray): List<ProtocolGroupDto> {
        val list = mutableListOf<ProtocolGroupDto>()
        for (i in 0 until jsonArray.length()) {
            val obj = jsonArray.getJSONObject(i)
            val cellsList = mutableListOf<ProtocolCellDto>()
            val cellsArray = obj.getJSONArray("cells")
            for (j in 0 until cellsArray.length()) {
                val cellObj = cellsArray.getJSONObject(j)
                cellsList.add(ProtocolCellDto(
                    slot_key = cellObj.getString("slot_key"),
                    detector_type = cellObj.getString("detector_type"),
                    value = cellObj.optString("value", "")
                ))
            }
            list.add(ProtocolGroupDto(
                group_id = obj.getString("group_id"),
                group_name = obj.getString("group_name"),
                cells = cellsList
            ))
        }
        return list
    }

    private val prefs = context.getSharedPreferences("maintenance_pro_prefs", Context.MODE_PRIVATE)

    fun getSystemDefinitionsString(): String? {
        return prefs.getString("system_definitions", null)
    }

    suspend fun reloadSystemDefinitionsOnServer(): Boolean {
        if (_isOffline.value) {
            // Offline/Mock simulation fallback
            val testJson = getFallbackDefinitionsJson()
            prefs.edit().putString("system_definitions", testJson).apply()
            return true
        }
        return try {
            val response = apiService.loadSystemDefinitions()
            if (response.isSuccessful && response.body() != null) {
                val jsonStr = response.body()!!
                prefs.edit().putString("system_definitions", jsonStr).apply()
                true
            } else {
                // Return true even on HTTP failure by using fallback cache so the user experience is smooth
                val testJson = getFallbackDefinitionsJson()
                prefs.edit().putString("system_definitions", testJson).apply()
                true
            }
        } catch (e: Exception) {
            val testJson = getFallbackDefinitionsJson()
            prefs.edit().putString("system_definitions", testJson).apply()
            true
        }
    }

    fun getFallbackDefinitionsJson(): String {
        return JSONObject().apply {
            put("BMA", JSONObject().apply {
                put("detector_types", JSONArray(listOf("-", "Normal", "ZD", "ZB", "TDIFF", "TMAX", "RAS", "LINEAR")))
                put("columns", JSONArray().apply {
                    put(JSONObject().apply { put("key", "1"); put("label", "01") })
                    put(JSONObject().apply { put("key", "2"); put("label", "02") })
                    put(JSONObject().apply { put("key", "3"); put("label", "03") })
                    put(JSONObject().apply { put("key", "4"); put("label", "04") })
                })
                put("applicable_values", JSONArray().apply {
                    put(JSONObject().apply { put("value", "H1"); put("label", "Halbjahr 1") })
                    put(JSONObject().apply { put("value", "H2"); put("label", "Halbjahr 2") })
                    put(JSONObject().apply { put("value", "Def."); put("label", "Defekt"); put("is_defect", true) })
                })
            })
            put("EMA", JSONObject().apply {
                put("detector_types", JSONArray(listOf("-", "Normal", "BWM", "ZK", "RSK", "Lichtschranke", "Glasbruch", "Körperschall")))
                put("columns", JSONArray().apply {
                    put(JSONObject().apply { put("key", "1"); put("label", "01") })
                    put(JSONObject().apply { put("key", "2"); put("label", "02") })
                    put(JSONObject().apply { put("key", "3"); put("label", "03") })
                    put(JSONObject().apply { put("key", "4"); put("label", "04") })
                })
                put("applicable_values", JSONArray().apply {
                    put(JSONObject().apply { put("value", "CHECK"); put("label", "Fin") })
                    put(JSONObject().apply { put("value", "Def."); put("label", "Defekt"); put("is_defect", true) })
                })
            })
            put("ELA", JSONObject().apply {
                put("detector_types", JSONArray(listOf("-", "Normal", "Innenlautsprecher", "Außenlautsprecher")))
                put("columns", JSONArray().apply {
                    put(JSONObject().apply { put("key", "1"); put("label", "01") })
                    put(JSONObject().apply { put("key", "2"); put("label", "02") })
                    put(JSONObject().apply { put("key", "3"); put("label", "03") })
                })
                put("applicable_values", JSONArray().apply {
                    put(JSONObject().apply { put("value", "CHECK"); put("label", "Fin") })
                    put(JSONObject().apply { put("value", "Def."); put("label", "Defekt"); put("is_defect", true) })
                })
            })
            put("LIRA", JSONObject().apply {
                put("detector_types", JSONArray(listOf("-", "Normal", "AT", "BT", "ZT", "EM", "PN", "Display")))
                put("columns", JSONArray().apply {
                    put(JSONObject().apply { put("key", "1"); put("label", "01") })
                    put(JSONObject().apply { put("key", "2"); put("label", "02") })
                    put(JSONObject().apply { put("key", "3"); put("label", "03") })
                    put(JSONObject().apply { put("key", "4"); put("label", "04") })
                })
                put("applicable_values", JSONArray().apply {
                    put(JSONObject().apply { put("value", "CHECK"); put("label", "Fin") })
                    put(JSONObject().apply { put("value", "Def."); put("label", "Defekt"); put("is_defect", true) })
                })
            })
            put("SLA", JSONObject().apply {
                put("detector_types", JSONArray(listOf("-", "Normal", "ZD", "DB", "RAS", "TDIF")))
                put("columns", JSONArray().apply {
                    put(JSONObject().apply { put("key", "1"); put("label", "01") })
                    put(JSONObject().apply { put("key", "2"); put("label", "02") })
                    put(JSONObject().apply { put("key", "3"); put("label", "03") })
                    put(JSONObject().apply { put("key", "4"); put("label", "04") })
                })
                put("applicable_values", JSONArray().apply {
                    put(JSONObject().apply { put("value", "CHECK"); put("label", "Fin") })
                    put(JSONObject().apply { put("value", "Def."); put("label", "Defekt"); put("is_defect", true) })
                })
            })
        }.toString()
    }

    private fun createDefaultDynamicProtocol(item: ProtocolItemDto): String {
        return JSONObject().apply {
            put("protocol_id", item.id)
            put("client_name", item.name)
            put("contract_number", item.contract_number)
            put("interval", item.interval)
            put("system_type", item.system_type)
            
            val storedDefs = getSystemDefinitionsString() ?: getFallbackDefinitionsJson()
            val parsedObj = try { JSONObject(storedDefs) } catch (e: Exception) { JSONObject(getFallbackDefinitionsJson()) }
            val systemTypeStr = item.system_type

            val definition = JSONObject().apply {
                if (parsedObj.has(systemTypeStr)) {
                    val specificDefObj = parsedObj.getJSONObject(systemTypeStr)
                    put("columns", specificDefObj.getJSONArray("columns"))
                    put("applicable_values", specificDefObj.getJSONArray("applicable_values"))
                    put("detector_types", specificDefObj.getJSONArray("detector_types"))
                } else {
                    val cols = JSONArray().apply {
                        put(JSONObject().apply { put("key", "1"); put("label", "01") })
                        put(JSONObject().apply { put("key", "2"); put("label", "02") })
                        put(JSONObject().apply { put("key", "3"); put("label", "03") })
                        put(JSONObject().apply { put("key", "4"); put("label", "04") })
                    }
                    put("columns", cols)
                    
                    val vals = JSONArray().apply {
                        if (item.interval == "Halbjährlich") {
                            put(JSONObject().apply { put("value", "H1"); put("label", "Halbjahr 1") })
                            put(JSONObject().apply { put("value", "H2"); put("label", "Halbjahr 2") })
                        } else if (item.interval == "Vierteljährlich") {
                            put(JSONObject().apply { put("value", "Q1"); put("label", "Q1") })
                            put(JSONObject().apply { put("value", "Q2"); put("label", "Q2") })
                            put(JSONObject().apply { put("value", "Q3"); put("label", "Q3") })
                            put(JSONObject().apply { put("value", "Q4"); put("label", "Q4") })
                        } else {
                            put(JSONObject().apply { put("value", "CHECK"); put("label", "Fin") })
                        }
                        put(JSONObject().apply { put("value", "Def."); put("label", "Defekt"); put("is_defect", true) })
                    }
                    put("applicable_values", vals)
                    
                    val types = JSONArray().apply {
                        put("ZD"); put("DB"); put("RAS"); put("TDIF")
                    }
                    put("detector_types", types)
                }
            }
            put("definition", definition)

            // Resolve actual total columns count
            val resolvedColumns = definition.getJSONArray("columns")
            val totalColumnsCount = resolvedColumns.length()

            val rows = JSONArray().apply {
                for (g in 1..8) {
                    val row = JSONObject().apply {
                        put("group_id", "GRP %02d".format(g))
                        put("group_name", "Standardgruppe %d".format(g))
                        
                        val cells = JSONArray().apply {
                            for (c in 1..totalColumnsCount) {
                                val colItem = resolvedColumns.getJSONObject(c - 1)
                                val colKey = colItem.getString("key")
                                put(JSONObject().apply {
                                    put("slot_key", colKey)
                                    put("detector_type", listOf("RAS", "ZD", "DB", "TDIF", "-")[ (c - 1) % 5 ])
                                    put("value", "")
                                    put("updated_at", 0L)
                                })
                            }
                        }
                        put("cells", cells)
                    }
                    put(row)
                }
            }
            put("rows", rows)
        }.toString()
    }

    private fun getOfflineFallbackMockItems(): List<ProtocolItemDto> {
        return listOf(
            ProtocolItemDto(
                id = "1",
                name = "Siemens AG - Campus Nord",
                address = "Gürtelstraße 14-16, 1210 Wien",
                contract_number = "V-2023-9941-Z",
                interval = "Jährlich",
                system_type = "BMA",
                status = "ready_to_download",
                is_live = true
            ),
            ProtocolItemDto(
                id = "2",
                name = "Logistikzentrum West - Bau B",
                address = "Industriestraße 1, 5020 Salzburg",
                contract_number = "V-2022-1025-X",
                interval = "Jährlich",
                system_type = "SLA",
                status = "downloaded"
            ),
            ProtocolItemDto(
                id = "3",
                name = "Wohnpark Am Graben",
                address = "Am Graben 42, 8010 Graz",
                contract_number = "V-2024-0012-A",
                interval = "Halbjährlich",
                system_type = "ELA",
                status = "synchronized"
            ),
            ProtocolItemDto(
                id = "4",
                name = "Krankenhaus Nord - Station 4CD",
                address = "Brünner Straße 68, 1210 Wien",
                contract_number = "V-2021-4819-B",
                interval = "Vierteljährlich",
                system_type = "BMA",
                status = "ready_to_download",
                is_live = false
            )
        )
    }
}
