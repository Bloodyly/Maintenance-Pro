package de.fs.maintenancepro.data.remote

import de.fs.maintenancepro.data.crypto.CryptoManager
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
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
    private val credentialsProvider: () -> Credentials?,
    private val baseUrlProvider: () -> String
) : Interceptor {

    data class Credentials(
        val username: String,
        val password: CharArray,
        val codewordKey: SecretKeySpec?
    )

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        
        // Rewrite the request destination URL dynamically to the active base URL
        val currentBaseUrlStr = baseUrlProvider()
        val newUrl = originalRequest.url.newBuilder().apply {
            val parsed = currentBaseUrlStr.toHttpUrlOrNull()
            if (parsed != null) {
                scheme(parsed.scheme)
                host(parsed.host)
                port(parsed.port)
            }
        }.build()
        
        val redirectedRequest = originalRequest.newBuilder().url(newUrl).build()
        val creds = credentialsProvider()

        // If no credentials or main key is loaded yet, forward with URL redirect done
        if (creds == null || creds.codewordKey == null) {
            return chain.proceed(redirectedRequest)
        }

        // 1. Build and encrypt X-Auth header
        val authJson = JSONObject().apply {
            put("user", creds.username)
            put("pass", String(creds.password))
        }.toString()
        
        val encryptedAuth = CryptoManager.encrypt(authJson, creds.codewordKey)

        // 2. Encrypt Body if it is a POST request
        val requestBuilder = redirectedRequest.newBuilder()
            .header("X-Auth", encryptedAuth)
            .header("Accept", "application/json")

        if (redirectedRequest.method == "POST" && redirectedRequest.body != null) {
            val buffer = Buffer()
            redirectedRequest.body!!.writeTo(buffer)
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
