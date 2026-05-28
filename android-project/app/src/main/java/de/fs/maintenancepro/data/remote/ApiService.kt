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
}

// Data Transfer Objects (DTOs)
data class SearchRequestDto(val query: String)

data class AuthResponseDto(
    val status: String,
    val technician_id: String,
    val name: String
)

data class ProtocolItemDto(
    val id: String,
    val name: String,
    val address: String,
    val contract_number: String,
    val interval: String,
    val system_type: String,
    val status: String
)

data class UploadResponseDto(
    val status: String,
    val version: Int,
    val message: String
)

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

data class ApplicableValueDto(
    val value: String,
    val label: String,
    val is_defect: Boolean = false
)

data class ProtocolGroupDto(
    val group_id: String,
    val group_name: String,
    val cells: List<ProtocolCellDto>
)

data class ProtocolCellDto(
    val slot_key: String,
    val detector_type: String,
    val value: String
)
