package de.fs.maintenancepro.data.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkRequest
import java.util.concurrent.TimeUnit

/**
 * Schedules SyncUploadWorker. Two entry points:
 * - scheduleImmediate(): fired right when something new lands in the queue, so
 *   the upload goes out the moment a network connection is available, even if
 *   the app gets closed a second later.
 * - schedulePeriodicFallback(): a 15-minute backstop (WorkManager's minimum
 *   period) registered once at app startup, in case the immediate job was
 *   somehow never enqueued or got lost.
 * Both use enqueueUnique*Work so repeated calls don't pile up duplicate jobs.
 */
object SyncWorkScheduler {
    private const val UNIQUE_IMMEDIATE_WORK = "sync_queue_upload_now"
    private const val UNIQUE_PERIODIC_WORK = "sync_queue_upload_periodic"

    private val networkConstraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    fun scheduleImmediate(context: Context) {
        val request = OneTimeWorkRequestBuilder<SyncUploadWorker>()
            .setConstraints(networkConstraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, WorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork(UNIQUE_IMMEDIATE_WORK, ExistingWorkPolicy.KEEP, request)
    }

    fun schedulePeriodicFallback(context: Context) {
        val request = PeriodicWorkRequestBuilder<SyncUploadWorker>(15, TimeUnit.MINUTES)
            .setConstraints(networkConstraints)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(UNIQUE_PERIODIC_WORK, ExistingPeriodicWorkPolicy.KEEP, request)
    }
}
