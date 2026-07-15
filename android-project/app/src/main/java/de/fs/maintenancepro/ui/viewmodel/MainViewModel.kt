package de.fs.maintenancepro.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.room.withTransaction
import dagger.hilt.android.lifecycle.HiltViewModel
import de.fs.maintenancepro.data.local.*
import de.fs.maintenancepro.data.remote.ApiService
import de.fs.maintenancepro.data.remote.ProtocolGroupDto
import de.fs.maintenancepro.data.remote.UploadProtocolDto
import de.fs.maintenancepro.data.remote.SearchRequestDto
import de.fs.maintenancepro.data.remote.ProtocolCellDto
import de.fs.maintenancepro.data.remote.ProtocolItemDto
import de.fs.maintenancepro.data.remote.ProtocolColumnDto
import de.fs.maintenancepro.data.remote.ApplicableValueDto
import de.fs.maintenancepro.data.remote.SyncDeltaRequestDto
import de.fs.maintenancepro.data.remote.SyncUploadCellsDto
import de.fs.maintenancepro.data.remote.SyncCellChangeDto
import de.fs.maintenancepro.data.remote.SyncProtocolDto
import de.fs.maintenancepro.data.remote.HardwareTableDto
import de.fs.maintenancepro.data.remote.HardwareRowDto
import kotlinx.coroutines.flow.first
import de.fs.maintenancepro.BuildConfig
import de.fs.maintenancepro.data.crypto.CryptoManager
import de.fs.maintenancepro.data.remote.UpdateInfoDto
import de.fs.maintenancepro.data.sync.SyncQueueProcessor
import de.fs.maintenancepro.data.sync.SyncWorkScheduler
import de.fs.maintenancepro.data.update.AppUpdateInstaller
import de.fs.maintenancepro.data.update.UpdateDownloadResult
import de.fs.maintenancepro.data.update.UpdateDownloadUiState
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
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
    private val database: MaintenanceDatabase,
    private val protocolDao: ProtocolDao,
    private val protocolGroupDao: ProtocolGroupDao,
    private val groupCellDao: GroupCellDao,
    private val hardwareTableDao: HardwareTableDao,
    private val syncQueueDao: SyncQueueDao,
    private val serverConfigDao: ServerConfigDao,
    private val apiService: ApiService,
    private val sessionManager: ActiveSessionManager,
    private val syncQueueProcessor: SyncQueueProcessor,
    private val appUpdateInstaller: AppUpdateInstaller,
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

    private val _isSyncing = MutableStateFlow(false)
    val isSyncing: StateFlow<Boolean> = _isSyncing

    private val _liveModusEnabled = MutableStateFlow(false)
    val liveModusEnabled: StateFlow<Boolean> = _liveModusEnabled

    private val _activeProtocolId = MutableStateFlow<String?>(null)
    val activeProtocolId: StateFlow<String?> = _activeProtocolId

    // ── Grid data access (normalized tables — no JSON parsing on the hot path) ──────────────

    /** Reactive rows for a protocol's detector matrix, ordered by group insertion order. */
    fun getGroupsFlow(protocolId: String): Flow<List<ProtocolGroupEntity>> = protocolGroupDao.getGroupsFlow(protocolId)

    /** Reactive cells for a protocol's detector matrix. */
    fun getCellsFlow(protocolId: String): Flow<List<GroupCellEntity>> = groupCellDao.getCellsFlow(protocolId)

    // ── Verbindungstest State ───────────────────────────────────────────────
    sealed class ConnectionTestState {
        object Idle : ConnectionTestState()
        object Testing : ConnectionTestState()
        data class Success(val technicianName: String) : ConnectionTestState()
        object Unreachable : ConnectionTestState()
        object WrongKey : ConnectionTestState()
        object WrongCredentials : ConnectionTestState()
        data class UnknownError(val code: Int, val detail: String) : ConnectionTestState()
    }

    private val _connectionTestState = MutableStateFlow<ConnectionTestState>(ConnectionTestState.Idle)
    val connectionTestState: StateFlow<ConnectionTestState> = _connectionTestState

    fun resetConnectionTest() {
        _connectionTestState.value = ConnectionTestState.Idle
    }

    fun testConnectionWithSettings(address: String, portVal: Int, user: String, pass: String, key: String) {
        viewModelScope.launch(Dispatchers.IO) {
            _connectionTestState.value = ConnectionTestState.Testing
            sessionManager.setNetworkConfig(address, portVal)
            sessionManager.setSession(user, pass.toCharArray(), key.toCharArray())
            try {
                val response = apiService.checkAuth()
                if (response.isSuccessful && response.body() != null) {
                    _connectionTestState.value = ConnectionTestState.Success(
                        response.body()!!.name.ifBlank { user }
                    )
                    // Persist immediately on a successful test -- previously only the
                    // explicit "Speichern" button wrote to Room, so a verified-working
                    // connection could still be lost on app restart if never saved.
                    val existing = serverConfigDao.getConfig()
                    serverConfigDao.saveConfig(
                        ServerConfigEntity(
                            serverAddress = address,
                            port = portVal,
                            username = user,
                            encryptedPasswordBase64 = pass,
                            codeword = key,
                            lastFullSyncAt = existing?.lastFullSyncAt ?: 0L,
                            myMandantId = response.body()!!.mandant_id
                        )
                    )
                } else {
                    val errBody = response.errorBody()?.string() ?: ""
                    _connectionTestState.value = when {
                        errBody.contains("DECRYPTION_FAILED") -> ConnectionTestState.WrongKey
                        errBody.contains("INVALID_CREDENTIALS") -> ConnectionTestState.WrongCredentials
                        else -> ConnectionTestState.UnknownError(response.code(), errBody)
                    }
                }
            } catch (e: Exception) {
                _connectionTestState.value = ConnectionTestState.Unreachable
            }
        }
    }

    // ── Offline-Sync State ──────────────────────────────────────────────────
    sealed class SyncState {
        object Idle : SyncState()
        data class InProgress(val message: String) : SyncState()
        data class Done(val downloaded: Int, val uploaded: Int) : SyncState()
        data class Error(val message: String) : SyncState()
    }

    private val _syncState = MutableStateFlow<SyncState>(SyncState.Idle)
    val syncState: StateFlow<SyncState> = _syncState

    private val prefs = context.getSharedPreferences("maintenance_pro_prefs", Context.MODE_PRIVATE)

    // ── Verlauf / History ───────────────────────────────────────────────────
    val recentlyOpened: Flow<List<ProtocolEntity>> = protocolDao.getRecentlyOpenedFlow()

    private val _historyLimit = MutableStateFlow(20)
    val historyLimit: StateFlow<Int> = _historyLimit

    fun loadHistoryLimit() {
        _historyLimit.value = prefs.getInt("history_limit", 20)
    }

    fun setHistoryLimit(limit: Int) {
        prefs.edit().putInt("history_limit", limit).apply()
        _historyLimit.value = limit
    }

    fun trackProtocolOpen(id: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val entity = protocolDao.getProtocolById(id) ?: return@launch
            protocolDao.insertOrUpdate(entity.copy(lastOpenedAt = System.currentTimeMillis()))
        }
    }

    fun resetProtocolToOpen(id: String) {
        viewModelScope.launch(Dispatchers.IO) {
            protocolDao.updateStatus(id, "ready_to_download")
            try {
                apiService.resetProtocolStatus(id)
            } catch (_: Exception) {}
        }
    }

    /** Pull-only delta sync: holt Änderungen vom Server, lädt nichts hoch. */
    fun pullServerUpdates() {
        viewModelScope.launch(Dispatchers.IO) {
            if (_isOffline.value || _isSyncing.value) return@launch
            _isSyncing.value = true
            try {
                // Refresh search results from server
                searchRemoteProtocols(_searchQuery.value)

                // Update status of locally cached protocols from server delta
                val response = apiService.syncDelta(SyncDeltaRequestDto(since = 0L))
                if (response.isSuccessful && response.body() != null) {
                    for (proto in response.body()!!.protocols) {
                        val existing = protocolDao.getProtocolById(proto.id) ?: continue
                        // Only overwrite status if server has reset it (e.g. new quarter)
                        if (existing.localStatus == "synchronized" && proto.status == "ready_to_download") {
                            protocolDao.updateStatus(proto.id, "ready_to_download")
                        }
                    }
                }
            } catch (_: Exception) {
                // Offline or unreachable — search will show cached results
            } finally {
                _isSyncing.value = false
            }
        }
    }

    fun setLiveModusEnabled(enabled: Boolean) {
        _liveModusEnabled.value = enabled
    }

    fun setActiveProtocolId(id: String?) {
        _activeProtocolId.value = id
    }

    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    init {
        // Run initial background tasks
        viewModelScope.launch(Dispatchers.IO) {
            // ActiveSessionManager is an in-memory @Singleton that starts with
            // hardcoded placeholder server/credentials -- it's only ever fed real
            // values by saveConfig()/testConnectionWithSettings()/applyQrSetup(),
            // never restored from the persisted ServerConfigEntity on a fresh
            // process start. That's why a closed-and-reopened app authenticated
            // against the placeholder (always fails -> UNREACHABLE) until the user
            // manually re-ran the connection test, which happened to be the first
            // thing that ever wrote real config into the session manager.
            loadPersistedSessionConfig()
            checkConnectivity()
            startConnectivityCheckLoop()
            checkForAppUpdate()
        }
        registerNetworkCallback()
        processSyncQueue()
        startLiveSyncLoop()
        updateSearchQuery("")
        loadHistoryLimit()
    }

    // ── App-Update (sideloaded, no Play Store) ──────────────────────────────
    private val _updateInfo = MutableStateFlow<UpdateInfoDto?>(null)
    val updateInfo: StateFlow<UpdateInfoDto?> = _updateInfo

    private val _updateBannerDismissed = MutableStateFlow(false)
    val updateBannerDismissed: StateFlow<Boolean> = _updateBannerDismissed

    private val _updateDownloadState = MutableStateFlow<UpdateDownloadUiState>(UpdateDownloadUiState.Idle)
    val updateDownloadState: StateFlow<UpdateDownloadUiState> = _updateDownloadState

    /** True once the installed version is below the server's min_supported_version_code --
     * the UI shows a non-dismissible dialog instead of the optional banner in that case. */
    fun isUpdateForced(): Boolean {
        val info = _updateInfo.value ?: return false
        return BuildConfig.VERSION_CODE < info.min_supported_version_code
    }

    fun dismissUpdateBanner() {
        _updateBannerDismissed.value = true
    }

    private suspend fun checkForAppUpdate() {
        try {
            val response = apiService.getAppUpdateInfo()
            val info = response.body()
            if (response.isSuccessful && info != null && info.available && info.version_code > BuildConfig.VERSION_CODE) {
                _updateInfo.value = info
            }
        } catch (e: Exception) {
            // No update server reachable right now -- not worth surfacing as an error,
            // the periodic connectivity loop already covers "server unreachable".
        }
    }

    fun canInstallUnknownApps(context: Context): Boolean = appUpdateInstaller.canInstallUnknownApps(context)

    fun requestInstallPermissionIntent(context: Context) = appUpdateInstaller.requestInstallPermissionIntent(context)

    fun downloadAndInstallUpdate(context: Context) {
        val info = _updateInfo.value ?: return
        viewModelScope.launch {
            _updateDownloadState.value = UpdateDownloadUiState.Downloading(0)
            val fullUrl = sessionManager.getActiveBaseUrl().removeSuffix("/") + info.download_url
            val result = appUpdateInstaller.downloadAndVerify(context, fullUrl, info.sha256) { progress ->
                _updateDownloadState.value = UpdateDownloadUiState.Downloading(progress)
            }
            when (result) {
                is UpdateDownloadResult.Success -> {
                    _updateDownloadState.value = UpdateDownloadUiState.ReadyToInstall
                    appUpdateInstaller.launchInstall(context)
                }
                is UpdateDownloadResult.ChecksumMismatch -> {
                    _updateDownloadState.value = UpdateDownloadUiState.Error(
                        "Prüfsumme stimmt nicht überein -- Download unvollständig oder beschädigt. Bitte erneut versuchen."
                    )
                }
                is UpdateDownloadResult.Failed -> {
                    _updateDownloadState.value = UpdateDownloadUiState.Error(result.reason)
                }
            }
        }
    }

    private suspend fun loadPersistedSessionConfig() {
        val config = serverConfigDao.getConfig() ?: return
        // A row can exist with only some fields ever populated (e.g. checkConnectivity()
        // copies the existing row just to update myMandantId) -- deriveKey() throws on an
        // empty codeword, so only rehydrate once real credentials are actually present.
        if (config.codeword.isEmpty() || config.username.isEmpty()) return
        sessionManager.setNetworkConfig(config.serverAddress, config.port)
        sessionManager.setSession(
            config.username,
            config.encryptedPasswordBase64.toCharArray(),
            config.codeword.toCharArray()
        )
    }

    /** Instant, zero-cost signal for the common case (wifi/mobile data toggling)
     * so the badge doesn't have to wait for the next poll tick to react. The
     * periodic loop below is still needed to catch "network is fine but the
     * maintenance server itself is down/unreachable", which the OS can't tell us. */
    private fun registerNetworkCallback() {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                checkConnectivity()
            }
            override fun onLost(network: Network) {
                _isServerAvailable.value = false
            }
        }
        try {
            connectivityManager.registerDefaultNetworkCallback(callback)
            networkCallback = callback
        } catch (e: Exception) {
            // Some OEM/emulator setups restrict this -- the periodic loop below
            // still covers connectivity changes, just less instantly.
        }
    }

    override fun onCleared() {
        super.onCleared()
        networkCallback?.let {
            val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            try { connectivityManager.unregisterNetworkCallback(it) } catch (e: Exception) { }
        }
    }

    private fun startConnectivityCheckLoop() {
        viewModelScope.launch(Dispatchers.IO) {
            while (true) {
                // The NetworkCallback above handles fast reactions to the network
                // itself dropping/returning; this loop's job is just to periodically
                // re-confirm the actual server is reachable, so it can afford to be
                // infrequent rather than polling every few seconds.
                kotlinx.coroutines.delay(60000) // check every 60 seconds
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
                if (response.isSuccessful && response.body() != null) {
                    // Keep "my own Mandant" fresh -- used to default SearchScreen's
                    // contract filter to "just my Mandant" even while offline later.
                    val mandantId = response.body()!!.mandant_id
                    val existing = serverConfigDao.getConfig()
                    if (existing != null && existing.myMandantId != mandantId) {
                        serverConfigDao.saveConfig(existing.copy(myMandantId = mandantId))
                    }
                }
            } catch (e: Exception) {
                _isServerAvailable.value = false
            }
        }
    }

    fun searchRemoteProtocols(query: String) {
        viewModelScope.launch(Dispatchers.IO) {
            if (_isOffline.value || !_isServerAvailable.value) {
                _searchResults.value = searchLocalOrEmpty(query)
                return@launch
            }
            try {
                val response = apiService.searchProtocols(SearchRequestDto(query))
                if (response.isSuccessful && response.body() != null) {
                    _searchResults.value = response.body()!!
                } else {
                    _searchResults.value = searchLocalOrEmpty(query)
                }
            } catch (e: Exception) {
                _searchResults.value = searchLocalOrEmpty(query)
            }
        }
    }

    private suspend fun searchLocalOrEmpty(query: String): List<ProtocolItemDto> {
        val pat = "%${query}%"
        val localResults = protocolDao.search(pat)
        if (localResults.isNotEmpty()) {
            return localResults.map { e ->
                ProtocolItemDto(
                    id = e.id, name = e.name, address = e.address,
                    contract_number = e.contractNumber, interval = e.interval,
                    system_type = e.systemType, status = e.localStatus,
                    mandant_id = e.mandantId
                )
            }
        }
        return emptyList()
    }

    fun saveConfig(address: String, portVal: Int, user: String, passHex: String, keyHex: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val existing = serverConfigDao.getConfig()
            val config = ServerConfigEntity(
                serverAddress = address,
                port = portVal,
                username = user,
                encryptedPasswordBase64 = passHex,
                codeword = keyHex,
                lastFullSyncAt = existing?.lastFullSyncAt ?: 0L
            )
            serverConfigDao.saveConfig(config)
            sessionManager.setNetworkConfig(address, portVal)
            sessionManager.setSession(user, passHex.toCharArray(), keyHex.toCharArray())
            checkConnectivity()
            // reload search list with new server configs
            searchRemoteProtocols(_searchQuery.value)
        }
    }

    // ── Live-Sync: JSON stays a WIRE format only — local storage is normalized tables ───────

    private fun startLiveSyncLoop() {
        viewModelScope.launch(Dispatchers.IO) {
            combine(_activeProtocolId, _liveModusEnabled, _isOffline) { id, live, offline ->
                Triple(id, live, offline)
            }.collectLatest { (id, live, offline) ->
                if (id != null && live && !offline) {
                    while (true) {
                        try {
                            val outgoingJson = buildWireJson(id)
                            if (outgoingJson != null) {
                                val request = de.fs.maintenancepro.data.remote.LiveSyncRequestDto(
                                    protocol_id = id,
                                    payload_json = outgoingJson
                                )
                                val response = apiService.liveSyncProtocol(id, request)
                                if (response.isSuccessful && response.body() != null) {
                                    val mergedJson = response.body()!!.payload_json
                                    if (mergedJson != outgoingJson) {
                                        applyWireJsonToLocal(id, mergedJson)
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

    /** Builds the wire-format JSON for a protocol on the fly from the normalized tables. */
    private suspend fun buildWireJson(protocolId: String): String? {
        val protocol = protocolDao.getProtocolById(protocolId) ?: return null
        val groups = protocolGroupDao.getGroupsOnce(protocolId)
        val cells = groupCellDao.getCellsOnce(protocolId).groupBy { it.groupId }
        return JSONObject().apply {
            put("protocol_id", protocol.id)
            put("client_name", protocol.name)
            put("contract_number", protocol.contractNumber)
            put("interval", protocol.interval)
            put("system_type", protocol.systemType)
            put("definition", JSONObject().apply {
                put("columns", safeJsonArray(protocol.columnsJson))
                put("applicable_values", safeJsonArray(protocol.applicableValuesJson))
                put("detector_types", safeJsonArray(protocol.detectorTypesJson))
            })
            put("rows", JSONArray().also { arr ->
                groups.forEach { g ->
                    arr.put(JSONObject().apply {
                        put("group_id", g.groupId)
                        put("group_name", g.groupName)
                        put("group_type", g.groupType)
                        g.anlageId?.let { put("anlage_id", it) }
                        g.anlageName?.let { put("anlage_name", it) }
                        g.anlageType?.let { put("anlage_type", it) }
                        g.anlageInterval?.let { put("anlage_interval", it) }
                        put("cells", JSONArray().also { ca ->
                            cells[g.groupId]?.forEach { c ->
                                ca.put(JSONObject().apply {
                                    put("slot_key", c.slotKey)
                                    put("detector_type", c.detectorType)
                                    put("value", c.value)
                                    put("updated_at", c.updatedAt)
                                })
                            }
                        })
                    })
                }
            })
            // Hardware (Zentrale/Ringkarten) is device-scoped, not Melder-Gruppe-scoped,
            // so it's a sibling of 'rows' rather than another namespaced row within it.
            put("hardware", JSONArray().also { arr ->
                hardwareTableDao.getAllForProtocol(protocolId).forEach { hw ->
                    arr.put(JSONObject().apply {
                        put("group_id", hw.deviceGroupId)
                        put("updated_at", hw.updatedAt)
                        put("rows", safeJsonArray(hw.rowsJson))
                    })
                }
            })
        }.toString()
    }

    /** Merges an incoming wire-format JSON (server's live-sync response) into the normalized tables. */
    private suspend fun applyWireJsonToLocal(protocolId: String, json: String) {
        try {
            val root = JSONObject(json)
            applyWireHardwareToLocal(protocolId, root.optJSONArray("hardware"))
            val rows = root.optJSONArray("rows") ?: return
            val now = System.currentTimeMillis()

            val existingGroups = protocolGroupDao.getGroupsOnce(protocolId).associateBy { it.groupId }.toMutableMap()
            val existingCells = groupCellDao.getCellsOnce(protocolId).associateBy { "${it.groupId}::${it.slotKey}" }

            val newGroups = mutableListOf<ProtocolGroupEntity>()
            val newCells = mutableListOf<GroupCellEntity>()

            for (i in 0 until rows.length()) {
                val rowO = rows.getJSONObject(i)
                val groupId = rowO.optString("group_id", null) ?: continue
                if (!existingGroups.containsKey(groupId)) {
                    val g = ProtocolGroupEntity(
                        protocolId = protocolId, groupId = groupId,
                        groupName = rowO.optString("group_name", ""),
                        groupType = rowO.optString("group_type", "NAM"),
                        orderIndex = i
                    )
                    newGroups.add(g)
                    existingGroups[groupId] = g
                }
                val cells = rowO.optJSONArray("cells") ?: continue
                for (j in 0 until cells.length()) {
                    val cellO = cells.getJSONObject(j)
                    val slotKey = cellO.optString("slot_key", null) ?: continue
                    if (slotKey == "__grid__") continue
                    val key = "$groupId::$slotKey"
                    val newUpdatedAt = cellO.optLong("updated_at", now)
                    val existing = existingCells[key]
                    if (existing == null || newUpdatedAt >= existing.updatedAt) {
                        newCells.add(GroupCellEntity(
                            protocolId = protocolId, groupId = groupId, slotKey = slotKey,
                            detectorType = cellO.optString("detector_type", existing?.detectorType ?: "-"),
                            value = cellO.optString("value", ""), updatedAt = newUpdatedAt,
                            orderIndex = existing?.orderIndex ?: j
                        ))
                    }
                }
            }
            if (newGroups.isNotEmpty()) protocolGroupDao.insertOrUpdateAll(newGroups)
            if (newCells.isNotEmpty()) groupCellDao.insertOrUpdateAll(newCells)
        } catch (_: Exception) { }
    }

    private fun safeJsonArray(raw: String): JSONArray = try { JSONArray(raw) } catch (e: Exception) { JSONArray() }

    /** Shared by every download/sync path (live-sync, full download, delta) --
     * Hardware entries are `{group_id, updated_at, rows: [...]}`, last-write-wins
     * against whatever's already stored locally for that device. */
    private suspend fun applyWireHardwareToLocal(protocolId: String, hardwareArr: JSONArray?) {
        if (hardwareArr == null) return
        val existingByDevice = hardwareTableDao.getAllForProtocol(protocolId).associateBy { it.deviceGroupId }
        for (i in 0 until hardwareArr.length()) {
            val hwO = hardwareArr.optJSONObject(i) ?: continue
            val deviceGroupId = hwO.optString("group_id", null) ?: continue
            val updatedAt = hwO.optLong("updated_at", 0L)
            val rows = hwO.optJSONArray("rows") ?: JSONArray()
            val existing = existingByDevice[deviceGroupId]
            if (existing != null && existing.updatedAt > updatedAt) continue
            hardwareTableDao.upsert(
                HardwareTableEntity(
                    protocolId = protocolId, deviceGroupId = deviceGroupId,
                    rowsJson = rows.toString(), updatedAt = updatedAt
                )
            )
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
     * Download inspection protocol and cache it locally inside Room (Offline-First).
     * Storage is normalized (protocol_groups/group_cells) — the JSON on the wire is parsed once
     * here and fanned out into rows, never touched again as a blob.
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
                    storeProtocolFromJson(item, decryptedJson, "downloaded")
                } else {
                    throw Exception("HTTP ${response.code()}")
                }
            } catch (e: Exception) {
                // If network download fails, load simple cached mock structure for failover demo/offline testing
                val dummyPayload = createDefaultDynamicProtocol(item)
                storeProtocolFromJson(item, dummyPayload, "downloaded")
            }
        }
    }

    /** Parses a protocol JSON blob (wire/synthetic) once and fans it out into normalized tables. */
    private suspend fun storeProtocolFromJson(item: ProtocolItemDto, json: String, status: String) {
        val root = try { JSONObject(json) } catch (e: Exception) { JSONObject() }
        val def = root.optJSONObject("definition")
        database.withTransaction {
            protocolDao.insertOrUpdate(ProtocolEntity(
                id = item.id, name = item.name, address = item.address,
                contractNumber = item.contract_number, interval = item.interval,
                systemType = item.system_type, localStatus = status,
                columnsJson = (def?.optJSONArray("columns") ?: JSONArray()).toString(),
                applicableValuesJson = (def?.optJSONArray("applicable_values") ?: JSONArray()).toString(),
                detectorTypesJson = (def?.optJSONArray("detector_types") ?: JSONArray()).toString(),
                lastEditedAt = System.currentTimeMillis(),
                mandantId = root.optString("mandant_id", item.mandant_id)
            ))
            protocolGroupDao.deleteAllForProtocol(item.id)
            groupCellDao.deleteAllForProtocol(item.id)

            // Hardware (Zentrale/Ringkarten) is device-scoped, a sibling of 'rows' --
            // full download replaces it entirely, same as groups/cells above.
            hardwareTableDao.deleteAllForProtocol(item.id)
            root.optJSONArray("hardware")?.let { hardwareArr ->
                for (i in 0 until hardwareArr.length()) {
                    val hwO = hardwareArr.optJSONObject(i) ?: continue
                    val deviceGroupId = hwO.optString("group_id", null) ?: continue
                    hardwareTableDao.upsert(
                        HardwareTableEntity(
                            protocolId = item.id, deviceGroupId = deviceGroupId,
                            rowsJson = (hwO.optJSONArray("rows") ?: JSONArray()).toString(),
                            updatedAt = hwO.optLong("updated_at", 0L)
                        )
                    )
                }
            }

            val rows = root.optJSONArray("rows") ?: return@withTransaction
            val groups = mutableListOf<ProtocolGroupEntity>()
            val cells = mutableListOf<GroupCellEntity>()
            for (i in 0 until rows.length()) {
                val rowO = rows.getJSONObject(i)
                val groupId = rowO.optString("group_id", null) ?: continue
                groups.add(ProtocolGroupEntity(
                    protocolId = item.id, groupId = groupId,
                    groupName = rowO.optString("group_name", ""),
                    groupType = rowO.optString("group_type", "NAM"),
                    anlageId = if (rowO.has("anlage_id")) rowO.optString("anlage_id") else null,
                    anlageName = if (rowO.has("anlage_name")) rowO.optString("anlage_name") else null,
                    anlageType = if (rowO.has("anlage_type")) rowO.optString("anlage_type") else null,
                    anlageInterval = if (rowO.has("anlage_interval")) rowO.optString("anlage_interval") else null,
                    orderIndex = i
                ))
                val cellsArr = rowO.optJSONArray("cells") ?: continue
                for (j in 0 until cellsArr.length()) {
                    val cellO = cellsArr.getJSONObject(j)
                    val slotKey = cellO.optString("slot_key", null) ?: continue
                    if (slotKey == "__grid__") continue
                    cells.add(GroupCellEntity(
                        protocolId = item.id, groupId = groupId, slotKey = slotKey,
                        detectorType = cellO.optString("detector_type", "-"),
                        value = cellO.optString("value", ""),
                        updatedAt = cellO.optLong("updated_at", 0L),
                        orderIndex = j
                    ))
                }
            }
            if (groups.isNotEmpty()) protocolGroupDao.insertOrUpdateAll(groups)
            if (cells.isNotEmpty()) groupCellDao.insertOrUpdateAll(cells)
        }
    }

    /**
     * Updates an individual checklist cell instantly in SQLite via a single targeted, indexed
     * UPDATE — protects against accidental battery death or OS-level application restarts without
     * having to read/rewrite the rest of the protocol.
     */
    fun editCell(protocolId: String, groupId: String, slotKey: String, writeValue: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val current = groupCellDao.getCell(protocolId, groupId, slotKey) ?: return@launch
            if (current.value == writeValue) return@launch
            val now = System.currentTimeMillis()
            groupCellDao.updateValue(protocolId, groupId, slotKey, writeValue, now)
            protocolDao.updateStatusAndEditedAt(protocolId, "upload_pending", now)
        }
    }

    fun getHardwareTableFlow(protocolId: String, deviceGroupId: String) =
        hardwareTableDao.getForDeviceFlow(protocolId, deviceGroupId)

    /** Edits one field of one Hardware row (Störung/Unterbrechung/Software-Stand) --
     * read-modify-write on the whole blob, same as the server side does. The row
     * count is always small (Zentrale + a handful of Ringkarten), so this is cheap. */
    fun editHardwareField(protocolId: String, deviceGroupId: String, rowIndex: Int, field: String, newValue: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val existing = hardwareTableDao.getAllForProtocol(protocolId).find { it.deviceGroupId == deviceGroupId } ?: return@launch
            val rows = safeJsonArray(existing.rowsJson)
            if (rowIndex !in 0 until rows.length()) return@launch
            val row = rows.getJSONObject(rowIndex)
            if (row.optString(field, "") == newValue) return@launch
            row.put(field, newValue)
            val now = System.currentTimeMillis()
            hardwareTableDao.upsert(existing.copy(rowsJson = rows.toString(), updatedAt = now))
            protocolDao.updateStatusAndEditedAt(protocolId, "upload_pending", now)
        }
    }

    /**
     * Updates multiple cells of a group row at once. Dramatically increases performance on
     * "mark all / unmark all" row actions since it's now a handful of indexed UPDATEs, not a
     * whole-protocol JSON rewrite.
     */
    fun batchEditGroupCells(protocolId: String, groupId: String, cellValues: Map<String, String>) {
        if (cellValues.isEmpty()) return
        viewModelScope.launch(Dispatchers.IO) {
            val now = System.currentTimeMillis()
            var modified = false
            database.withTransaction {
                cellValues.forEach { (slotKey, newVal) ->
                    val current = groupCellDao.getCell(protocolId, groupId, slotKey) ?: return@forEach
                    if (current.value != newVal) {
                        groupCellDao.updateValue(protocolId, groupId, slotKey, newVal, now)
                        modified = true
                    }
                }
                if (modified) protocolDao.updateStatusAndEditedAt(protocolId, "upload_pending", now)
            }
        }
    }

    // Applies cell changes for MULTIPLE groups in one atomic transaction (avoids race conditions).
    fun batchEditMultiGroupCells(protocolId: String, allChanges: Map<String, Map<String, String>>) {
        if (allChanges.isEmpty()) return
        viewModelScope.launch(Dispatchers.IO) {
            val now = System.currentTimeMillis()
            var modified = false
            database.withTransaction {
                allChanges.forEach { (groupId, cellChanges) ->
                    cellChanges.forEach { (slotKey, newVal) ->
                        val current = groupCellDao.getCell(protocolId, groupId, slotKey) ?: return@forEach
                        if (current.value != newVal) {
                            groupCellDao.updateValue(protocolId, groupId, slotKey, newVal, now)
                            modified = true
                        }
                    }
                }
                if (modified) protocolDao.updateStatusAndEditedAt(protocolId, "upload_pending", now)
            }
        }
    }

    /**
     * Structure edit logic: add a new group dynamically to the detector matrix
     */
    fun addGroup(protocolId: String, newGroupId: String, groupName: String, columnKeys: List<String>) {
        viewModelScope.launch(Dispatchers.IO) {
            val now = System.currentTimeMillis()
            database.withTransaction {
                val maxOrder = protocolGroupDao.getMaxOrderIndex(protocolId)
                protocolGroupDao.insertOrUpdate(ProtocolGroupEntity(
                    protocolId = protocolId, groupId = newGroupId, groupName = groupName, orderIndex = maxOrder + 1
                ))
                val cells = columnKeys.mapIndexed { idx, colKey ->
                    GroupCellEntity(
                        protocolId = protocolId, groupId = newGroupId, slotKey = colKey,
                        detectorType = "ZD", value = "", updatedAt = now, orderIndex = idx
                    )
                }
                if (cells.isNotEmpty()) groupCellDao.insertOrUpdateAll(cells)
                protocolDao.updateStatusAndEditedAt(protocolId, "upload_pending", now)
            }
        }
    }

    /**
     * Structure edit logic: add a new slot column dynamically across all existing matrices
     */
    fun addSlotColumn(protocolId: String, newColumnKey: String, newColumnLabel: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val protocol = protocolDao.getProtocolById(protocolId) ?: return@launch
            val now = System.currentTimeMillis()
            database.withTransaction {
                val columnsArr = safeJsonArray(protocol.columnsJson)
                columnsArr.put(JSONObject().apply { put("key", newColumnKey); put("label", newColumnLabel) })
                protocolDao.update(protocol.copy(columnsJson = columnsArr.toString(), localStatus = "upload_pending", lastEditedAt = now))

                val groups = protocolGroupDao.getGroupsOnce(protocolId)
                val newCells = groups.map { g ->
                    val maxOrder = groupCellDao.getMaxOrderIndex(protocolId, g.groupId)
                    GroupCellEntity(
                        protocolId = protocolId, groupId = g.groupId, slotKey = newColumnKey,
                        detectorType = "ZD", value = "", updatedAt = now, orderIndex = maxOrder + 1
                    )
                }
                if (newCells.isNotEmpty()) groupCellDao.insertOrUpdateAll(newCells)
            }
        }
    }

    /**
     * Delete a group row from the matrix
     */
    fun deleteGroup(protocolId: String, groupId: String) {
        viewModelScope.launch(Dispatchers.IO) {
            database.withTransaction {
                groupCellDao.deleteForGroup(protocolId, groupId)
                protocolGroupDao.deleteGroup(protocolId, groupId)
                protocolDao.updateStatusAndEditedAt(protocolId, "upload_pending", System.currentTimeMillis())
            }
        }
    }

    /**
     * Update group metadata (ID, name, and option type)
     */
    fun updateGroupDetails(protocolId: String, oldGroupId: String, newGroupId: String, newGroupName: String, newGroupType: String) {
        viewModelScope.launch(Dispatchers.IO) {
            database.withTransaction {
                if (oldGroupId != newGroupId) {
                    // group_cells has no enforced FK — re-key affected cells manually before renaming the row.
                    val cellsToMove = groupCellDao.getCellsOnce(protocolId).filter { it.groupId == oldGroupId }
                    if (cellsToMove.isNotEmpty()) {
                        groupCellDao.insertOrUpdateAll(cellsToMove.map { it.copy(groupId = newGroupId) })
                        groupCellDao.deleteForGroup(protocolId, oldGroupId)
                    }
                }
                protocolGroupDao.updateGroupDetails(protocolId, oldGroupId, newGroupId, newGroupName, newGroupType)
                protocolDao.updateStatusAndEditedAt(protocolId, "upload_pending", System.currentTimeMillis())
            }
        }
    }

    /**
     * Update the detector type for a particular cell slot
     */
    fun updateCellDetectorType(protocolId: String, groupId: String, slotKey: String, newDetectorType: String) {
        viewModelScope.launch(Dispatchers.IO) {
            groupCellDao.updateDetectorType(protocolId, groupId, slotKey, newDetectorType)
            protocolDao.updateStatusAndEditedAt(protocolId, "upload_pending", System.currentTimeMillis())
        }
    }

    /**
     * Grid editor: batch-set detector types ("painting", mirrors the WebUI editor).
     * Preserves existing Messwerte, creates missing cells on the fly, and pads slot
     * gaps below the painted column with '-' cells so slots stay contiguous from 1
     * (the fill view renders cells sequentially by orderIndex — a gap would shift
     * every following Melder one column to the left there). Bumps updatedAt so
     * delta-sync picks the type change up.
     */
    fun paintCells(protocolId: String, targets: Map<String, List<Int>>, newType: String) {
        if (targets.isEmpty()) return
        viewModelScope.launch(Dispatchers.IO) {
            val now = System.currentTimeMillis()
            database.withTransaction {
                val cellsByGroup = groupCellDao.getCellsOnce(protocolId).groupBy { it.groupId }
                val upserts = mutableListOf<GroupCellEntity>()
                targets.forEach { (groupId, cols) ->
                    if (cols.isEmpty()) return@forEach
                    val bySlot = cellsByGroup[groupId].orEmpty().associateBy { it.slotKey }
                    val colSet = cols.toSet()
                    for (col in 1..cols.max()) {
                        val slotKey = col.toString()
                        val existing = bySlot[slotKey]
                        when {
                            col in colSet -> {
                                if (existing == null) {
                                    upserts.add(GroupCellEntity(
                                        protocolId = protocolId, groupId = groupId, slotKey = slotKey,
                                        detectorType = newType, value = "", updatedAt = now, orderIndex = col - 1
                                    ))
                                } else if (existing.detectorType != newType) {
                                    upserts.add(existing.copy(detectorType = newType, updatedAt = now))
                                }
                            }
                            existing == null -> {
                                upserts.add(GroupCellEntity(
                                    protocolId = protocolId, groupId = groupId, slotKey = slotKey,
                                    detectorType = "-", value = "", updatedAt = now, orderIndex = col - 1
                                ))
                            }
                        }
                    }
                }
                if (upserts.isNotEmpty()) {
                    groupCellDao.insertOrUpdateAll(upserts)
                    protocolDao.updateStatusAndEditedAt(protocolId, "upload_pending", now)
                }
            }
        }
    }

    /**
     * Grid editor: append a new Melder-Gruppe to one device. Group ids are namespaced
     * "{devicePrefix}::{grp_num}" on the wire; the new group slots in directly after the
     * device's last group, and orderIndex is rewritten protocol-wide so devices stay
     * contiguous. No cells are created — the group only becomes part of the Melderliste
     * once Melder are painted (same semantics as an empty row in the WebUI editor).
     */
    fun addGroupToDevice(protocolId: String, devicePrefix: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val now = System.currentTimeMillis()
            database.withTransaction {
                val groups = protocolGroupDao.getGroupsOnce(protocolId)
                val isDevice = { g: ProtocolGroupEntity -> g.groupId.substringBeforeLast("::", "") == devicePrefix }
                val deviceGroups = groups.filter(isDevice)
                val nextNum = deviceGroups
                    .mapNotNull { it.groupId.substringAfterLast("::").trim().toIntOrNull() }
                    .maxOrNull()?.plus(1) ?: (deviceGroups.size + 1)
                val template = deviceGroups.lastOrNull()
                val newGroup = ProtocolGroupEntity(
                    protocolId = protocolId,
                    groupId = "$devicePrefix::${nextNum.toString().padStart(2, '0')}",
                    groupName = "",
                    groupType = template?.groupType ?: "NAM",
                    anlageId = template?.anlageId,
                    anlageName = template?.anlageName,
                    anlageType = template?.anlageType,
                    anlageInterval = template?.anlageInterval
                )
                val insertAt = groups.indexOfLast(isDevice).let { if (it == -1) groups.size else it + 1 }
                val reordered = groups.toMutableList().apply { add(insertAt, newGroup) }
                protocolGroupDao.insertOrUpdateAll(reordered.mapIndexed { i, g -> g.copy(orderIndex = i) })
                protocolDao.updateStatusAndEditedAt(protocolId, "upload_pending", now)
            }
        }
    }

    /** Grid editor: remove one device's last Melder-Gruppe including its cells. */
    fun removeLastGroupFromDevice(protocolId: String, devicePrefix: String) {
        viewModelScope.launch(Dispatchers.IO) {
            database.withTransaction {
                val groups = protocolGroupDao.getGroupsOnce(protocolId)
                val last = groups.lastOrNull { it.groupId.substringBeforeLast("::", "") == devicePrefix }
                    ?: return@withTransaction
                groupCellDao.deleteForGroup(protocolId, last.groupId)
                protocolGroupDao.deleteGroup(protocolId, last.groupId)
                protocolDao.updateStatusAndEditedAt(protocolId, "upload_pending", System.currentTimeMillis())
            }
        }
    }

    /**
     * Full synchronize of completed checklists. Places failing attempts safely
     * into the Room local background queue for robust retry.
     */
    fun synchronizeProtocol(protocolId: String) {
        viewModelScope.launch(Dispatchers.IO) {
            protocolDao.getProtocolById(protocolId) ?: return@launch
            val uploadDto = buildUploadDto(protocolId)

            if (_isOffline.value) {
                // Instantly enqueue for offline sync queue if network offline
                enqueueSync(protocolId, uploadDto)
                return@launch
            }

            try {
                val response = apiService.uploadProtocol(protocolId, uploadDto)
                if (response.isSuccessful) {
                    protocolDao.updateStatus(protocolId, "synchronized")
                } else {
                    enqueueSync(protocolId, uploadDto)
                }
            } catch (e: Exception) {
                enqueueSync(protocolId, uploadDto)
            }
        }
    }

    private suspend fun buildUploadDto(protocolId: String): UploadProtocolDto {
        val groups = protocolGroupDao.getGroupsOnce(protocolId)
        val cellsByGroup = groupCellDao.getCellsOnce(protocolId).groupBy { it.groupId }
        return UploadProtocolDto(
            protocol_id = protocolId,
            finished_at = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.GERMANY).format(Date()),
            technician_id = "99283-FS",
            rows = groups.map { g ->
                ProtocolGroupDto(
                    group_id = g.groupId,
                    group_name = g.groupName,
                    cells = (cellsByGroup[g.groupId] ?: emptyList()).map { c ->
                        ProtocolCellDto(slot_key = c.slotKey, detector_type = c.detectorType, value = c.value, updated_at = c.updatedAt)
                    }
                )
            },
            hardware = hardwareTableDao.getAllForProtocol(protocolId).map { hw ->
                HardwareTableDto(
                    group_id = hw.deviceGroupId,
                    updated_at = hw.updatedAt,
                    rows = jsonToHardwareRows(hw.rowsJson)
                )
            }
        )
    }

    private fun jsonToHardwareRows(rowsJson: String): List<HardwareRowDto> {
        val arr = safeJsonArray(rowsJson)
        return (0 until arr.length()).map { i ->
            val r = arr.getJSONObject(i)
            HardwareRowDto(
                hardware = r.optString("hardware", ""),
                bezeichnung = r.optString("bezeichnung", ""),
                typ = r.optString("typ", ""),
                stoerung = r.optString("stoerung", ""),
                unterbrechung = r.optString("unterbrechung", ""),
                sw_stand = r.optString("sw_stand", "")
            )
        }
    }

    private suspend fun enqueueSync(protocolId: String, dto: UploadProtocolDto) {
        val serialized = JSONObject().apply {
            put("protocol_id", dto.protocol_id)
            put("finished_at", dto.finished_at)
            put("technician_id", dto.technician_id)
            put("rows", JSONArray().also { arr ->
                dto.rows.forEach { row ->
                    arr.put(JSONObject().apply {
                        put("group_id", row.group_id)
                        put("group_name", row.group_name)
                        put("cells", JSONArray().also { ca ->
                            row.cells.forEach { c ->
                                ca.put(JSONObject().apply {
                                    put("slot_key", c.slot_key)
                                    put("detector_type", c.detector_type)
                                    put("value", c.value)
                                    put("updated_at", c.updated_at)
                                })
                            }
                        })
                    })
                }
            })
            put("hardware", JSONArray().also { arr ->
                dto.hardware.forEach { hw ->
                    arr.put(JSONObject().apply {
                        put("group_id", hw.group_id)
                        put("updated_at", hw.updated_at)
                        put("rows", JSONArray(hardwareRowsToJson(hw.rows)))
                    })
                }
            })
        }.toString()

        syncQueueDao.addToQueue(SyncQueueEntity(protocolId = protocolId, serializedUploadData = serialized))
        protocolDao.updateStatus(protocolId, "upload_pending")
        // Fires a real WorkManager job, not just this ViewModel's coroutine scope --
        // it'll go out the moment a connection is available even if the app is
        // closed a second after this call returns.
        SyncWorkScheduler.scheduleImmediate(context)
    }

    /**
     * Fast path for while the app is open: retries the queue right away instead
     * of waiting on WorkManager's scheduling. SyncUploadWorker (via
     * SyncWorkScheduler) is what keeps retrying in the background once this
     * ViewModel/coroutine no longer exists.
     */
    fun processSyncQueue() {
        viewModelScope.launch(Dispatchers.IO) {
            if (_isOffline.value) return@launch
            syncQueueProcessor.processQueue()
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
            database.withTransaction {
                groupCellDao.deleteAllForProtocol(protocolId)
                protocolGroupDao.deleteAllForProtocol(protocolId)
                protocolDao.deleteById(protocolId)
            }
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
                            encryptedPasswordBase64 = pass,
                            codeword = key
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
                        encryptedPasswordBase64 = pass,
                        codeword = key
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
                    storeProtocolFromSyncDto(proto)
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

                // 1. Collect cells modified locally since last sync (a couple of indexed queries, not a JSON scan)
                val localChanges = collectLocalChanges(since)

                // 2. Download server delta
                val deltaResp = apiService.syncDelta(SyncDeltaRequestDto(since))
                if (!deltaResp.isSuccessful || deltaResp.body() == null) {
                    _syncState.value = SyncState.Error("Delta-Fehler ${deltaResp.code()}"); return@launch
                }
                val delta = deltaResp.body()!!

                // 3. Merge server delta into local tables (server wins only on newer updated_at,
                //    protecting un-uploaded local pending edits)
                _syncState.value = SyncState.InProgress("${delta.protocols.size} geänderte Verträge…")
                for (proto in delta.protocols) {
                    val existing = protocolDao.getProtocolById(proto.id)
                    if (existing != null) mergeSyncDtoIntoLocal(proto) else storeProtocolFromSyncDto(proto)
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
                            protocolDao.updateStatus(pid, "synchronized")
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
        val pendingProtocols = protocolDao.getAllProtocolsFlow().first().filter { it.localStatus == "upload_pending" }
        for (entity in pendingProtocols) {
            val changed = groupCellDao.getChangedSince(entity.id, since)
            changed.forEach { c ->
                changes.add(SyncCellChangeDto(
                    protocol_id = entity.id,
                    group_id = c.groupId,
                    slot_key = c.slotKey,
                    detector_type = c.detectorType,
                    value = c.value,
                    updated_at = c.updatedAt
                ))
            }
        }
        return changes
    }

    private fun columnsToJson(columns: List<ProtocolColumnDto>): String =
        JSONArray().apply { columns.forEach { put(JSONObject().apply { put("key", it.key); put("label", it.label) }) } }.toString()

    private fun applicableValuesToJson(values: List<ApplicableValueDto>): String =
        JSONArray().apply { values.forEach { put(JSONObject().apply { put("value", it.value); put("label", it.label); put("is_defect", it.is_defect) }) } }.toString()

    private fun detectorTypesToJson(types: List<String>): String = JSONArray(types).toString()

    private fun hardwareRowsToJson(rows: List<HardwareRowDto>): String =
        JSONArray().apply {
            rows.forEach {
                put(JSONObject().apply {
                    put("hardware", it.hardware); put("bezeichnung", it.bezeichnung); put("typ", it.typ)
                    put("stoerung", it.stoerung); put("unterbrechung", it.unterbrechung); put("sw_stand", it.sw_stand)
                })
            }
        }.toString()

    /** Stores a brand-new protocol from a full/delta sync DTO directly into normalized tables. */
    private suspend fun storeProtocolFromSyncDto(proto: SyncProtocolDto) {
        database.withTransaction {
            protocolDao.insertOrUpdate(ProtocolEntity(
                id = proto.id, name = proto.name, address = proto.address,
                contractNumber = proto.contract_number, interval = proto.interval,
                systemType = proto.system_type, localStatus = proto.status,
                columnsJson = columnsToJson(proto.definition?.columns ?: emptyList()),
                applicableValuesJson = applicableValuesToJson(proto.definition?.applicable_values ?: emptyList()),
                detectorTypesJson = detectorTypesToJson(proto.definition?.detector_types ?: emptyList()),
                lastEditedAt = proto.updated_at,
                mandantId = proto.mandant_id
            ))
            protocolGroupDao.deleteAllForProtocol(proto.id)
            groupCellDao.deleteAllForProtocol(proto.id)

            hardwareTableDao.deleteAllForProtocol(proto.id)
            proto.hardware.forEach { hw ->
                hardwareTableDao.upsert(
                    HardwareTableEntity(
                        protocolId = proto.id, deviceGroupId = hw.group_id,
                        rowsJson = hardwareRowsToJson(hw.rows), updatedAt = hw.updated_at
                    )
                )
            }

            val groups = proto.rows.mapIndexed { i, row ->
                ProtocolGroupEntity(
                    protocolId = proto.id, groupId = row.group_id, groupName = row.group_name, groupType = row.group_type,
                    anlageId = row.anlage_id, anlageName = row.anlage_name, anlageType = row.anlage_type, anlageInterval = row.anlage_interval,
                    orderIndex = i
                )
            }
            val cells = mutableListOf<GroupCellEntity>()
            proto.rows.forEach { row ->
                row.cells.forEachIndexed { j, c ->
                    if (c.slot_key != "__grid__") {
                        cells.add(GroupCellEntity(
                            protocolId = proto.id, groupId = row.group_id, slotKey = c.slot_key,
                            detectorType = c.detector_type, value = c.value, updatedAt = c.updated_at, orderIndex = j
                        ))
                    }
                }
            }
            if (groups.isNotEmpty()) protocolGroupDao.insertOrUpdateAll(groups)
            if (cells.isNotEmpty()) groupCellDao.insertOrUpdateAll(cells)
        }
    }

    /** Merges a server delta into an EXISTING local protocol. Server wins only on newer updated_at. */
    private suspend fun mergeSyncDtoIntoLocal(proto: SyncProtocolDto) {
        database.withTransaction {
            protocolDao.insertOrUpdate(ProtocolEntity(
                id = proto.id, name = proto.name, address = proto.address,
                contractNumber = proto.contract_number, interval = proto.interval,
                systemType = proto.system_type, localStatus = proto.status,
                columnsJson = columnsToJson(proto.definition?.columns ?: emptyList()),
                applicableValuesJson = applicableValuesToJson(proto.definition?.applicable_values ?: emptyList()),
                detectorTypesJson = detectorTypesToJson(proto.definition?.detector_types ?: emptyList()),
                lastEditedAt = proto.updated_at,
                mandantId = proto.mandant_id
            ))

            val existingHardware = hardwareTableDao.getAllForProtocol(proto.id).associateBy { it.deviceGroupId }
            proto.hardware.forEach { hw ->
                val existing = existingHardware[hw.group_id]
                // Server wins only if its data is newer -- protects un-uploaded local pending edits.
                if (existing == null || hw.updated_at > existing.updatedAt) {
                    hardwareTableDao.upsert(
                        HardwareTableEntity(
                            protocolId = proto.id, deviceGroupId = hw.group_id,
                            rowsJson = hardwareRowsToJson(hw.rows), updatedAt = hw.updated_at
                        )
                    )
                }
            }

            val existingGroups = protocolGroupDao.getGroupsOnce(proto.id).associateBy { it.groupId }
            val existingCells = groupCellDao.getCellsOnce(proto.id).associateBy { "${it.groupId}::${it.slotKey}" }
            var nextOrder = (existingGroups.values.maxOfOrNull { it.orderIndex } ?: -1) + 1

            val newGroups = mutableListOf<ProtocolGroupEntity>()
            val newCells = mutableListOf<GroupCellEntity>()

            proto.rows.forEach { row ->
                if (!existingGroups.containsKey(row.group_id)) {
                    newGroups.add(ProtocolGroupEntity(
                        protocolId = proto.id, groupId = row.group_id, groupName = row.group_name, groupType = row.group_type,
                        anlageId = row.anlage_id, anlageName = row.anlage_name, anlageType = row.anlage_type, anlageInterval = row.anlage_interval,
                        orderIndex = nextOrder++
                    ))
                }
                row.cells.forEachIndexed { j, c ->
                    if (c.slot_key == "__grid__") return@forEachIndexed
                    val key = "${row.group_id}::${c.slot_key}"
                    val existing = existingCells[key]
                    // Server wins only if its data is newer — protects un-uploaded local pending edits.
                    if (existing == null || c.updated_at > existing.updatedAt) {
                        newCells.add(GroupCellEntity(
                            protocolId = proto.id, groupId = row.group_id, slotKey = c.slot_key,
                            detectorType = c.detector_type, value = c.value, updatedAt = c.updated_at,
                            orderIndex = existing?.orderIndex ?: j
                        ))
                    }
                }
            }
            if (newGroups.isNotEmpty()) protocolGroupDao.insertOrUpdateAll(newGroups)
            if (newCells.isNotEmpty()) groupCellDao.insertOrUpdateAll(newCells)
        }
    }

    fun getSystemDefinitionsString(): String? {
        return prefs.getString("system_definitions", null)
    }

    /** Real outcome of a definitions reload -- SettingsScreen shows a different
     * Toast for each, instead of the previous "always looks successful" fallback. */
    enum class DefinitionsSyncResult { SERVER_OK, OFFLINE_FALLBACK, ERROR }

    suspend fun reloadSystemDefinitionsOnServer(): DefinitionsSyncResult {
        // Only seed the hardcoded fallback if nothing is cached yet -- never let an
        // offline attempt or a server error clobber a previously successful sync
        // with older baked-in defaults.
        fun seedFallbackIfEmpty() {
            if (getSystemDefinitionsString() == null) {
                prefs.edit().putString("system_definitions", getFallbackDefinitionsJson()).apply()
            }
        }
        if (_isOffline.value) {
            seedFallbackIfEmpty()
            return DefinitionsSyncResult.OFFLINE_FALLBACK
        }
        return try {
            val response = apiService.loadSystemDefinitions()
            if (response.isSuccessful && response.body() != null) {
                prefs.edit().putString("system_definitions", response.body()!!.string()).apply()
                DefinitionsSyncResult.SERVER_OK
            } else {
                seedFallbackIfEmpty()
                DefinitionsSyncResult.ERROR
            }
        } catch (e: Exception) {
            seedFallbackIfEmpty()
            DefinitionsSyncResult.ERROR
        }
    }

    /** Same shape as the server's /protocols/definitions response (meldepunkt_definitionen:
     * detectors/values/columns/colors/labels/kurzzeichen, all flat arrays/maps) -- kept
     * structurally identical to the real payload so this fallback and a genuine sync are
     * interchangeable everywhere they're consumed. BMA's detector list mirrors the ETB
     * decoder's real vocabulary (AM/DKM/IO/Steu/MASI/Koppler/Konventionell) plus the older
     * manual/TAIFUN-only types (ZD/ZB/TDiff/Tmax/RAS/Linear) that the decoder never emits
     * but existing contracts may still use -- see server_stack/webui/app.py's
     * DEFAULT_ANLAGENTYPEN for the authoritative copy this mirrors. */
    fun getFallbackDefinitionsJson(): String {
        fun typeDef(detectors: List<String>, values: List<String>, columns: List<String>,
                    colors: Map<String, String> = emptyMap(), labels: Map<String, String> = emptyMap(),
                    kurzzeichen: Map<String, String> = emptyMap()) = JSONObject().apply {
            put("detectors", JSONArray(detectors))
            put("values", JSONArray(values))
            put("columns", JSONArray(columns))
            put("colors", JSONObject(colors as Map<*, *>))
            put("labels", JSONObject(labels as Map<*, *>))
            put("kurzzeichen", JSONObject(kurzzeichen as Map<*, *>))
        }
        return JSONObject().apply {
            put("BMA", typeDef(
                detectors = listOf("-", "AM", "DKM", "IO", "Steu", "MASI", "Koppler", "Konventionell",
                                    "ZD", "ZB", "TDiff", "Tmax", "RAS", "Linear"),
                values = listOf("CHECK", "H1", "H2", "Def."),
                columns = listOf("1", "2", "3", "4", "5", "6", "7", "8"),
                colors = mapOf(
                    "AM" to "#10B981", "DKM" to "#F43F5E", "IO" to "#3B82F6", "Steu" to "#10B981",
                    "MASI" to "#EAB308", "Koppler" to "#FB923C", "Konventionell" to "#64748B",
                    "ZD" to "#3B82F6", "ZB" to "#EAB308", "TDiff" to "#FB923C", "Tmax" to "#EF4444",
                    "RAS" to "#A855F7", "Linear" to "#EC4899"
                ),
                labels = mapOf("AM" to "Automatischer Melder", "Konventionell" to "Konventionell"),
                kurzzeichen = mapOf(
                    "AM" to "AM", "DKM" to "DK", "IO" to "IO", "Steu" to "ST", "MASI" to "MS",
                    "Koppler" to "KO", "Konventionell" to "KV", "ZD" to "ZD", "ZB" to "ZB",
                    "TDiff" to "TD", "Tmax" to "TM", "RAS" to "RS", "Linear" to "LN"
                )
            ))
            put("EMA", typeDef(
                detectors = listOf("-", "Normal", "BWM", "ZK", "RSK", "Lichtschranke", "Glasbruch", "Körperschall"),
                values = listOf("CHECK", "Def."),
                columns = listOf("1", "2", "3", "4")
            ))
            put("ELA", typeDef(
                detectors = listOf("-", "Normal", "Innenlautsprecher", "Außenlautsprecher"),
                values = listOf("CHECK", "Def."),
                columns = listOf("1", "2", "3")
            ))
            put("Lichtruf", typeDef(
                detectors = listOf("-", "Normal", "AT", "BT", "ZT", "EM", "PN", "Display"),
                values = listOf("CHECK", "Def."),
                columns = listOf("1", "2", "3", "4")
            ))
            put("SLA", typeDef(
                detectors = listOf("-", "Normal", "ZD", "DB", "RAS", "TDIF"),
                values = listOf("CHECK", "Def."),
                columns = listOf("1", "2", "3", "4")
            ))
        }.toString()
    }

    /** One Anlagentyp's Meldepunkt-Definitionen, parsed from the global
     * "system_definitions" cache -- see [getMeldepunktMeta]. */
    data class MeldepunktMeta(
        val detectors: List<String>,
        val colors: Map<String, String>,
        val labels: Map<String, String>,
        val kurzzeichen: Map<String, String>
    )

    /** Single source of truth for detector colors/labels/kurzzeichen in the app --
     * reads the globally cached, protocol-independent "system_definitions" (refreshed
     * via the "Anlagentypen neu laden" button, see [reloadSystemDefinitionsOnServer]),
     * NOT anything stored per-protocol. Returns null if nothing's been synced/cached
     * yet or the systemType isn't present -- callers should fall back to their own
     * hardcoded defaults in that case. */
    fun getMeldepunktMeta(systemType: String): MeldepunktMeta? {
        val raw = getSystemDefinitionsString() ?: return null
        return try {
            val typeDef = JSONObject(raw).optJSONObject(systemType) ?: return null
            fun mapOf(key: String): Map<String, String> {
                val obj = typeDef.optJSONObject(key) ?: return emptyMap()
                return buildMap { obj.keys().forEach { k -> put(k, obj.getString(k)) } }
            }
            val detectorsArr = typeDef.optJSONArray("detectors") ?: JSONArray()
            MeldepunktMeta(
                detectors = List(detectorsArr.length()) { detectorsArr.getString(it) },
                colors = mapOf("colors"),
                labels = mapOf("labels"),
                kurzzeichen = mapOf("kurzzeichen")
            )
        } catch (e: Exception) {
            null
        }
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
                    // meldepunkt_definitionen.columns is a flat array of column numbers
                    // ("1", "2", ...) -- ProtocolEntity.columnsJson (read by InspectionScreen's
                    // ColumnModel) needs {key,label} objects, so convert here.
                    val flatCols = specificDefObj.optJSONArray("columns") ?: JSONArray()
                    put("columns", JSONArray().apply {
                        for (i in 0 until flatCols.length()) {
                            val colKey = flatCols.getString(i)
                            put(JSONObject().apply { put("key", colKey); put("label", colKey) })
                        }
                    })
                    put("applicable_values", specificDefObj.optJSONArray("values") ?: JSONArray())
                    put("detector_types", specificDefObj.optJSONArray("detectors") ?: JSONArray())
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

    // ── Protocol details dialog data (Search/Archive/Verlauf "Info" popup) ──────────────────

    data class ProtocolDetailsData(
        val clientName: String,
        val address: String,
        val systemType: String,
        val contractNumber: String,
        val interval: String,
        val lastEditedAt: Long,
        val activeCount: Int,
        val triggeredCount: Int,
        val defectiveList: List<DefectiveDetectorInfo>
    )

    data class DefectiveDetectorInfo(val groupId: String, val groupName: String, val slotKey: String, val type: String)

    suspend fun getProtocolDetails(protocolId: String): ProtocolDetailsData? {
        val protocol = protocolDao.getProtocolById(protocolId) ?: return null
        val groupNames = protocolGroupDao.getGroupsOnce(protocolId).associate { it.groupId to it.groupName }
        val activeCount = groupCellDao.countActive(protocolId)
        val triggeredCount = groupCellDao.countTriggered(protocolId)
        val defective = groupCellDao.getDefective(protocolId).map { c ->
            DefectiveDetectorInfo(
                groupId = c.groupId,
                groupName = groupNames[c.groupId] ?: "Standardgruppe",
                slotKey = c.slotKey,
                type = c.detectorType
            )
        }
        return ProtocolDetailsData(
            clientName = protocol.name,
            address = protocol.address,
            systemType = protocol.systemType,
            contractNumber = protocol.contractNumber,
            interval = protocol.interval,
            lastEditedAt = protocol.lastEditedAt,
            activeCount = activeCount,
            triggeredCount = triggeredCount,
            defectiveList = defective
        )
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
