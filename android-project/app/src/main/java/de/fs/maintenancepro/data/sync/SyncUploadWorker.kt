package de.fs.maintenancepro.data.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * Background retry for the offline sync queue -- runs under WorkManager, which
 * survives the app being closed/killed and device reboots, unlike the
 * ViewModel-scoped coroutine that only runs while the app is open. Enqueued via
 * SyncWorkScheduler: once immediately whenever something new is queued, plus a
 * periodic safety-net check every 15 minutes.
 */
@HiltWorker
class SyncUploadWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val syncQueueProcessor: SyncQueueProcessor,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            if (syncQueueProcessor.processQueue()) Result.success() else Result.retry()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
