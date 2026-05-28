package de.fs.maintenancepro.ui.viewmodel

import de.fs.maintenancepro.data.crypto.CryptoManager
import de.fs.maintenancepro.data.remote.CryptoInterceptor
import javax.inject.Inject
import javax.inject.Singleton
import javax.crypto.spec.SecretKeySpec

@Singleton
class ActiveSessionManager @Inject constructor() {
    
    private var activeUsername: String = "TECH_UNIT_99283"
    private var activePassword: CharArray = "••••••••••••".toCharArray()
    private var activeCodeword: CharArray = "77-XJ-900-PLX-22".toCharArray()
    
    private var derivedKey: SecretKeySpec? = null
    
    // Dynamic network attributes
    private var activeServerAddress: String = "http://field-service.corp.internal"
    private var activePort: Int = 8443

    init {
        recalculateKey()
    }

    @Synchronized
    fun setSession(username: String, pass: CharArray, codeword: CharArray) {
        this.activeUsername = username
        this.activePassword = pass
        this.activeCodeword = codeword
        recalculateKey()
    }

    @Synchronized
    fun setNetworkConfig(address: String, port: Int) {
        this.activeServerAddress = if (address.startsWith("http")) address else "http://$address"
        this.activePort = port
    }

    @Synchronized
    fun getActiveCredentials(): CryptoInterceptor.Credentials {
        return CryptoInterceptor.Credentials(
            username = activeUsername,
            password = activePassword,
            codewordKey = derivedKey ?: CryptoManager.deriveKey(activeCodeword)
        )
    }

    @Synchronized
    fun getActiveBaseUrl(): String {
        val cleanAddress = activeServerAddress.removeSuffix("/")
        return "$cleanAddress:$activePort/"
    }

    private fun recalculateKey() {
        derivedKey = CryptoManager.deriveKey(activeCodeword)
    }

    @Synchronized
    fun clearSession() {
        activeUsername = ""
        activePassword.fill('\u0000')
        activeCodeword.fill('\u0000')
        derivedKey = null
    }
}
