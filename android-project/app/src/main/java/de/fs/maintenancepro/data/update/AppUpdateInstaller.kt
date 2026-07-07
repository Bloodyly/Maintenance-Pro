package de.fs.maintenancepro.data.update

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.delay
import java.io.File
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

sealed class UpdateDownloadResult {
    object Success : UpdateDownloadResult()
    object ChecksumMismatch : UpdateDownloadResult()
    data class Failed(val reason: String) : UpdateDownloadResult()
}

sealed class UpdateDownloadUiState {
    object Idle : UpdateDownloadUiState()
    data class Downloading(val progressPercent: Int) : UpdateDownloadUiState()
    object ReadyToInstall : UpdateDownloadUiState()
    data class Error(val message: String) : UpdateDownloadUiState()
}

/**
 * Downloads a sideloaded update APK and hands it to the system installer.
 * Deliberately does NOT use the app's own Retrofit/OkHttp client
 * (CryptoInterceptor reads response bodies as a String to decide whether to
 * decrypt them -- fine for small JSON, but that would silently corrupt a
 * multi-MB binary APK). DownloadManager is a separate system service that
 * makes its own plain HTTP request, sidestepping that entirely, and gives us
 * retry/progress/notification handling for free.
 */
@Singleton
class AppUpdateInstaller @Inject constructor() {

    private val fileName = "maintenance_pro_update.apk"

    fun canInstallUnknownApps(context: Context): Boolean {
        return context.packageManager.canRequestPackageInstalls()
    }

    fun requestInstallPermissionIntent(context: Context): Intent {
        return Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
            data = Uri.parse("package:${context.packageName}")
        }
    }

    private fun targetFile(context: Context): File {
        return File(context.getExternalFilesDir(null), fileName)
    }

    /** Enqueues the download and suspends until it finishes, then verifies the
     * checksum. onProgress reports 0-100, called from DownloadManager polling. */
    suspend fun downloadAndVerify(
        context: Context,
        downloadUrl: String,
        expectedSha256: String,
        onProgress: (Int) -> Unit
    ): UpdateDownloadResult {
        val target = targetFile(context)
        if (target.exists()) target.delete()

        val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val request = DownloadManager.Request(Uri.parse(downloadUrl))
            .setTitle("Maintenance Pro Update")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationUri(Uri.fromFile(target))
            .setAllowedOverMetered(true)

        val downloadId = downloadManager.enqueue(request)

        // Simple poll loop instead of the ACTION_DOWNLOAD_COMPLETE broadcast --
        // DownloadManager doesn't push progress via broadcast anyway, so one loop
        // covers both progress and completion without a receiver to manage.
        val query = DownloadManager.Query().setFilterById(downloadId)
        var finalStatus = -1
        while (finalStatus != DownloadManager.STATUS_SUCCESSFUL && finalStatus != DownloadManager.STATUS_FAILED) {
            downloadManager.query(query)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                    val soFarIdx = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)
                    val totalIdx = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
                    val total = if (totalIdx >= 0) cursor.getLong(totalIdx) else -1L
                    val soFar = if (soFarIdx >= 0) cursor.getLong(soFarIdx) else 0L
                    if (total > 0) onProgress(((soFar * 100) / total).toInt())
                    finalStatus = if (statusIdx >= 0) cursor.getInt(statusIdx) else -1
                } else {
                    finalStatus = DownloadManager.STATUS_FAILED
                }
            } ?: run { finalStatus = DownloadManager.STATUS_FAILED }
            if (finalStatus != DownloadManager.STATUS_SUCCESSFUL && finalStatus != DownloadManager.STATUS_FAILED) {
                delay(500)
            }
        }

        if (finalStatus != DownloadManager.STATUS_SUCCESSFUL || !target.exists()) {
            return UpdateDownloadResult.Failed("Download fehlgeschlagen.")
        }

        val actualSha256 = computeSha256(target)
        if (!actualSha256.equals(expectedSha256, ignoreCase = true)) {
            target.delete()
            return UpdateDownloadResult.ChecksumMismatch
        }
        return UpdateDownloadResult.Success
    }

    fun launchInstall(context: Context) {
        val target = targetFile(context)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", target)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
        }
        context.startActivity(intent)
    }

    private fun computeSha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(8192)
            var read: Int
            while (input.read(buffer).also { read = it } != -1) {
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
