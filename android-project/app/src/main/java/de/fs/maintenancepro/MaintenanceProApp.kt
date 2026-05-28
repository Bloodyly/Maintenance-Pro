package de.fs.maintenancepro

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class MaintenanceProApp : Application() {
    override fun onCreate() {
        super.onCreate()
    }
}
