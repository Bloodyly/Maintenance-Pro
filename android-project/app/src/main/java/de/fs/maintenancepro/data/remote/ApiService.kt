package de.fs.maintenancepro.data.remote

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.Path

interface ApiService {

    @POST("auth/check")
    suspend fun checkAuth(): Response<AuthResponseDto>

    @POST("protocols/search")
    suspend fun searchProtocols(@Body request: SearchRequestDto): Response<List<ProtocolItemDto>>

    @POST("protocols/download/{id}")
    suspend fun downloadProtocol(@Path("id") protocolId: String): Response<String> // Base64 Zip

    @POST("protocols/upload/{id}")
    suspend fun uploadProtocol(
        @Path("id") protocolId: String,
        @Body uploadData: UploadProtocolDto
    ): Response<UploadResponseDto>

    @POST("protocols/list-pending")
    suspend fun listPending(): Response<List<ProtocolItemDto>>

    @POST("protocols/live-sync/{id}")
    suspend fun liveSyncProtocol(
        @Path("id") protocolId: String,
        @Body request: LiveSyncRequestDto
    ): Response<LiveSyncResponseDto>

    @POST("protocols/definitions")
    suspend fun loadSystemDefinitions(): Response<String>

    // ── Offline-Sync Endpoints ──────────────────────────────────────────────

    /** Grundsynchronisation: returns ALL protocols with at least one Auslöseliste. */
    @POST("protocols/sync/full")
    suspend fun syncFull(): Response<SyncFullResponseDto>

    /** Delta-Sync download: only protocols/cells changed since [SyncDeltaRequestDto.since]. */
    @POST("protocols/sync/delta")
    suspend fun syncDelta(@Body req: SyncDeltaRequestDto): Response<SyncDeltaResponseDto>

    /** Delta-Sync upload: push individual cell changes (last-write-wins). */
    @POST("protocols/sync/upload-cells")
    suspend fun uploadCells(@Body req: SyncUploadCellsDto): Response<SyncUploadResponseDto>

    /** Reset protocol status to ready_to_download without touching cell data. */
    @POST("protocols/reset-status/{id}")
    suspend fun resetProtocolStatus(@Path("id") protocolId: String): Response<ResetStatusResponseDto>
}

// ── Existing DTOs ────────────────────────────────────────────────────────────

data class SearchRequestDto(val query: String)

data class LiveSyncRequestDto(val protocol_id: String, val payload_json: String)
data class LiveSyncResponseDto(val protocol_id: String, val payload_json: String)

data class AuthResponseDto(val status: String, val technician_id: String, val name: String)

data class ProtocolItemDto(
    val id: String,
    val name: String,
    val address: String,
    val contract_number: String,
    val interval: String,
    val system_type: String,
    val status: String,
    val is_live: Boolean? = false,
    val has_cells: Boolean = true
)

data class UploadResponseDto(val status: String, val version: Int, val message: String)

data class UploadProtocolDto(
    val protocol_id: String,
    val finished_at: String,
    val technician_id: String,
    val rows: List<ProtocolGroupDto>
)

data class ProtocolDefinitionDto(
    val columns: List<ProtocolColumnDto>,
    val applicable_values: List<ApplicableValueDto>,
    val detector_types: List<String>
)

data class ProtocolColumnDto(val key: String, val label: String)
data class ApplicableValueDto(val value: String, val label: String, val is_defect: Boolean = false)

data class ProtocolGroupDto(
    val group_id: String,
    val group_name: String,
    val cells: List<ProtocolCellDto>
)

data class ProtocolCellDto(
    val slot_key: String,
    val detector_type: String,
    val value: String,
    val updated_at: Long? = 0L
)

// ── Sync DTOs ────────────────────────────────────────────────────────────────

data class SyncDeltaRequestDto(val since: Long)

data class SyncUploadCellsDto(val changes: List<SyncCellChangeDto>)

data class SyncCellChangeDto(
    val protocol_id: String,
    val group_id: String,
    val slot_key: String,
    val detector_type: String,
    val value: String,
    val updated_at: Long
)

data class SyncFullResponseDto(
    val sync_version: Long,
    val protocols: List<SyncProtocolDto>
)

data class SyncDeltaResponseDto(
    val sync_version: Long,
    val protocols: List<SyncProtocolDto>
)

data class SyncProtocolDto(
    val id: String,
    val name: String,
    val address: String,
    val contract_number: String,
    val interval: String,
    val system_type: String,
    val status: String,
    val updated_at: Long = 0L,
    val definition: SyncDefinitionDto? = null,
    val rows: List<SyncRowDto> = emptyList()
)

data class SyncDefinitionDto(
    val columns: List<ProtocolColumnDto>,
    val applicable_values: List<ApplicableValueDto>,
    val detector_types: List<String>
)

data class SyncRowDto(
    val group_id: String,
    val group_name: String,
    val group_type: String = "NAM",
    val anlage_id: String? = null,
    val anlage_name: String? = null,
    val anlage_type: String? = null,
    val anlage_interval: String? = null,
    val cells: List<SyncCellDto> = emptyList()
)

data class SyncCellDto(
    val slot_key: String,
    val detector_type: String,
    val value: String,
    val updated_at: Long = 0L
)

data class SyncUploadResponseDto(val status: String, val applied: Int, val sync_version: Long)

data class ResetStatusResponseDto(val status: String, val message: String)
