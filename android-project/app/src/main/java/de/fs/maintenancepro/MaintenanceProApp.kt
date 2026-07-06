package de.fs.maintenancepro

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import de.fs.maintenancepro.data.sync.SyncWorkScheduler
import javax.inject.Inject

@HiltAndroidApp
class MaintenanceProApp : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()
        // Safety-net periodic check (WorkManager's minimum interval is 15min) so
        // a queued upload eventually goes out even if the immediate one-time job
        // enqueued on save somehow never fired -- the immediate job is what makes
        // this fast, this is just the backstop.
        SyncWorkScheduler.schedulePeriodicFallback(this)
    }
}
