package de.fs.maintenancepro.data.remote

import de.fs.maintenancepro.data.crypto.CryptoManager
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okio.Buffer
import org.json.JSONObject
import javax.crypto.spec.SecretKeySpec

/**
 * Intercepts outcoming requests, injects encrypted X-Auth header,
 * and intercepts request/response payloads to encrypt and decrypt on the fly.
 */
class CryptoInterceptor(
    private val credentialsProvider: () -> Credentials?
) : Interceptor {

    data class Credentials(
        val username: String,
        val password: CharArray,
        val codewordKey: SecretKeySpec?
    )

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val creds = credentialsProvider()

        // If no credentials or main key is loaded yet, forward without alteration
        if (creds == null || creds.codewordKey == null) {
            return chain.proceed(originalRequest)
        }

        // 1. Build and encrypt X-Auth header
        val authJson = JSONObject().apply {
            put("user", creds.username)
            put("pass", String(creds.password))
        }.toString()
        
        val encryptedAuth = CryptoManager.encrypt(authJson, creds.codewordKey)

        // 2. Encrypt Body if it is a POST request
        val requestBuilder = originalRequest.newBuilder()
            .header("X-Auth", encryptedAuth)
            .header("Accept", "application/json")

        if (originalRequest.method == "POST" && originalRequest.body != null) {
            val buffer = Buffer()
            originalRequest.body!!.writeTo(buffer)
            val originalBodyStr = buffer.readUtf8()

            if (originalBodyStr.isNotEmpty() && originalBodyStr.startsWith("{")) {
                val encryptedBody = CryptoManager.encrypt(originalBodyStr, creds.codewordKey)
                val mediaType = "application/json; charset=utf-8".toMediaType()
                requestBuilder.post(encryptedBody.toRequestBody(mediaType))
            }
        }

        val encryptedRequest = requestBuilder.build()
        val response = chain.proceed(encryptedRequest)

        // 3. Decrypt response payload if successful and content is encrypted
        if (response.isSuccessful && response.body != null) {
            val responseBodyStr = response.body!!.string()
            
            // Decrypt unless it's empty or already unencrypted JSON
            return if (responseBodyStr.isNotEmpty() && !responseBodyStr.startsWith("{") && !responseBodyStr.startsWith("[")) {
                try {
                    val decryptedBody = CryptoManager.decrypt(responseBodyStr, creds.codewordKey)
                    val mediaType = response.body!!.contentType()
                    response.newBuilder()
                        .body(decryptedBody.toRequestBody(mediaType))
                        .build()
                } catch (e: Exception) {
                    // Decryption failed (bad key or malformed) -> pass through standard raw response
                    response.newBuilder()
                        .body(responseBodyStr.toRequestBody(response.body!!.contentType()))
                        .build()
                }
            } else {
                response.newBuilder()
                    .body(responseBodyStr.toRequestBody(response.body!!.contentType()))
                    .build()
            }
        }

        return response
    }
}
