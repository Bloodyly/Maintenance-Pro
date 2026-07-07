package de.fs.maintenancepro.ui.components

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import de.fs.maintenancepro.data.update.UpdateDownloadUiState
import de.fs.maintenancepro.ui.viewmodel.MainViewModel

/**
 * Sideloaded (no Play Store) app-update UI, floating above whatever screen is
 * currently shown. Two modes:
 * - optional: dismissible banner, user can keep using the current version.
 * - forced (installed version below the server's min_supported_version_code):
 *   non-dismissible full-screen dialog that blocks app usage until updated.
 */
@Composable
fun AppUpdateOverlay(viewModel: MainViewModel) {
    val context = LocalContext.current
    val updateInfo by viewModel.updateInfo.collectAsState()
    val bannerDismissed by viewModel.updateBannerDismissed.collectAsState()
    val downloadState by viewModel.updateDownloadState.collectAsState()

    val info = updateInfo ?: return
    val forced = viewModel.isUpdateForced()

    val installPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        if (viewModel.canInstallUnknownApps(context)) {
            viewModel.downloadAndInstallUpdate(context)
        }
    }

    fun startUpdate() {
        if (viewModel.canInstallUnknownApps(context)) {
            viewModel.downloadAndInstallUpdate(context)
        } else {
            installPermissionLauncher.launch(viewModel.requestInstallPermissionIntent(context))
        }
    }

    if (forced) {
        Dialog(
            onDismissRequest = { /* not dismissible */ },
            properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false)
        ) {
            UpdateContentCard(
                title = "Update erforderlich",
                subtitle = "Diese Version wird nicht mehr unterstützt. Bitte aktualisieren, um fortzufahren.",
                info = info,
                downloadState = downloadState,
                dismissible = false,
                onDismiss = {},
                onUpdateClick = { startUpdate() }
            )
        }
    } else if (!bannerDismissed) {
        Box(modifier = Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.TopCenter) {
            Card(elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)) {
                Box(modifier = Modifier.padding(4.dp)) {
                    UpdateContentCard(
                        title = "Update verfügbar",
                        subtitle = "Version ${info.version_name} steht bereit.",
                        info = info,
                        downloadState = downloadState,
                        dismissible = true,
                        onDismiss = { viewModel.dismissUpdateBanner() },
                        onUpdateClick = { startUpdate() }
                    )
                }
            }
        }
    }
}

@Composable
private fun UpdateContentCard(
    title: String,
    subtitle: String,
    info: de.fs.maintenancepro.data.remote.UpdateInfoDto,
    downloadState: UpdateDownloadUiState,
    dismissible: Boolean,
    onDismiss: () -> Unit,
    onUpdateClick: () -> Unit
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.medium,
        tonalElevation = 4.dp
    ) {
        Column(modifier = Modifier.padding(20.dp).widthIn(max = 400.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.SystemUpdate, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(modifier = Modifier.width(8.dp))
                Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                if (dismissible) {
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Schließen")
                    }
                }
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(subtitle, style = MaterialTheme.typography.bodyMedium)
            if (info.release_notes.isNotBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    info.release_notes,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(modifier = Modifier.height(14.dp))

            when (val state = downloadState) {
                is UpdateDownloadUiState.Idle -> {
                    Button(onClick = onUpdateClick, modifier = Modifier.fillMaxWidth()) {
                        Text("Jetzt aktualisieren")
                    }
                }
                is UpdateDownloadUiState.Downloading -> {
                    Column {
                        LinearProgressIndicator(
                            progress = { state.progressPercent / 100f },
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text("Wird heruntergeladen... ${state.progressPercent}%", style = MaterialTheme.typography.bodySmall)
                    }
                }
                is UpdateDownloadUiState.ReadyToInstall -> {
                    Text(
                        "Download abgeschlossen -- Installation wird angestoßen...",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                is UpdateDownloadUiState.Error -> {
                    Column {
                        Text(state.message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(onClick = onUpdateClick, modifier = Modifier.fillMaxWidth()) {
                            Text("Erneut versuchen")
                        }
                    }
                }
            }
        }
    }
}
