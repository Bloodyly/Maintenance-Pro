package de.fs.maintenancepro.data.crypto

import android.util.Base64
import java.security.SecureRandom
import java.security.spec.KeySpec
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * Handles PBKDF2 key derivation and AES-256-GCM encryption/decryption
 * with total precision matching the Python backend verification vector.
 */
object CryptoManager {

    private const val ALGORITHM = "AES/GCM/NoPadding"
    private const val SALT = "ENO_AUSLOESELISTE_v1"
    private const val ITERATIONS = 100000
    private const val KEY_LENGTH = 256
    private const val GCM_IV_LENGTH = 12
    private const val GCM_TAG_LENGTH = 16 * 8 // 128 Bits

    /**
     * Derives a bit-identical 256-bit AES key from a passphrase using PBKDF2-HMAC-SHA256.
     */
    fun deriveKey(passphrase: CharArray): SecretKeySpec {
        val saltBytes = SALT.toByteArray(Charsets.UTF_8)
        val spec: KeySpec = PBEKeySpec(passphrase, saltBytes, ITERATIONS, KEY_LENGTH)
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val secretBytes = factory.generateSecret(spec).encoded
        return SecretKeySpec(secretBytes, "AES")
    }

    /**
     * Encrypts plaintext using AES-256-GCM.
     * Returns "Base64(IV[12] || Ciphertext[N] || Tag[16])" Wire Format.
     */
    fun encrypt(plainText: String, keySpec: SecretKeySpec, fixedIv: ByteArray? = null): String {
        val cipher = Cipher.getInstance(ALGORITHM)
        
        // Random IV generation, or fallback fixed IV for testing (test vector verification)
        val iv = fixedIv ?: ByteArray(GCM_IV_LENGTH).apply {
            SecureRandom().nextBytes(this)
        }
        
        val gcmSpec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
        cipher.init(Cipher.ENCRYPT_MODE, keySpec, gcmSpec)
        
        val cipherTextWithTag = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
        
        // Concat IV and Ciphertext (which already incorporates the GCM tag in Java/Android doFinal)
        val combinedPacket = ByteArray(GCM_IV_LENGTH + cipherTextWithTag.size)
        System.arraycopy(iv, 0, combinedPacket, 0, GCM_IV_LENGTH)
        System.arraycopy(cipherTextWithTag, 0, combinedPacket, GCM_IV_LENGTH, cipherTextWithTag.size)
        
        return Base64.encodeToString(combinedPacket, Base64.NO_WRAP)
    }

    /**
     * Decrypts encrypted payload using AES-256-GCM.
     * Input must be Base64 of packet: "IV[12] || Ciphertext[N] || Tag[16]".
     */
    fun decrypt(base64Payload: String, keySpec: SecretKeySpec): String {
        val combinedPacket = Base64.decode(base64Payload, Base64.NO_WRAP)
        if (combinedPacket.size < GCM_IV_LENGTH) {
            throw IllegalArgumentException("Payload exceeds minimal package size boundary.")
        }
        
        val iv = ByteArray(GCM_IV_LENGTH)
        System.arraycopy(combinedPacket, 0, iv, 0, GCM_IV_LENGTH)
        
        val cipherTextWithTagSize = combinedPacket.size - GCM_IV_LENGTH
        val cipherTextWithTag = ByteArray(cipherTextWithTagSize)
        System.arraycopy(combinedPacket, GCM_IV_LENGTH, cipherTextWithTag, 0, cipherTextWithTagSize)
        
        val cipher = Cipher.getInstance(ALGORITHM)
        val gcmSpec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
        cipher.init(Cipher.DECRYPT_MODE, keySpec, gcmSpec)
        
        val plainBytes = cipher.doFinal(cipherTextWithTag)
        return String(plainBytes, Charsets.UTF_8)
    }
}
