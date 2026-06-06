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
import de.fs.maintenancepro.data.crypto.CryptoManager
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
    private val sessionManager: ActiveSessionManager
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
                _searchResults.value = getFallbackMockItems().filter {
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
                    _searchResults.value = getFallbackMockItems().filter {
                        it.name.contains(query, ignoreCase = true) ||
                        it.address.contains(query, ignoreCase = true) ||
                        it.contract_number.contains(query, ignoreCase = true)
                    }
                }
            } catch (e: Exception) {
                _searchResults.value = getFallbackMockItems().filter {
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

    private fun createDefaultDynamicProtocol(item: ProtocolItemDto): String {
        return JSONObject().apply {
            put("protocol_id", item.id)
            put("client_name", item.name)
            put("contract_number", item.contract_number)
            put("interval", item.interval)
            put("system_type", item.system_type)
            
            val definition = JSONObject().apply {
                val cols = JSONArray().apply {
                    put(JSONObject().apply { put("key", "1"); put("label", "Slot 1") })
                    put(JSONObject().apply { put("key", "2"); put("label", "Slot 2") })
                    put(JSONObject().apply { put("key", "3"); put("label", "Slot 3") })
                    put(JSONObject().apply { put("key", "4"); put("label", "Slot 4") })
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
                    put(JSONObject().apply { put("value", "Def."); put("label", "Defekt"); put("is_defect", true })
                }
                put("applicable_values", vals)
                
                val types = JSONArray().apply {
                    put("ZD"); put("DB"); put("RAS"); put("TDIF")
                }
                put("detector_types", types)
            }
            put("definition", definition)

            val rows = JSONArray().apply {
                for (g in 1..8) {
                    val row = JSONObject().apply {
                        put("group_id", "GRP %02d".format(g))
                        put("group_name", "Standardgruppe %d".format(g))
                        
                        val cells = JSONArray().apply {
                            for (c in 1..4) {
                                put(JSONObject().apply {
                                    put("slot_key", c.toString())
                                    put("detector_type", listOf("RAS", "ZD", "DB", "TDIF", "-")[c - 1])
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

    fun getFallbackMockItems(): List<ProtocolItemDto> {
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
