package de.fs.maintenancepro.ui.screens

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import android.Manifest
import android.content.pm.PackageManager
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.animation.core.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.NetworkCheck
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.Wifi
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import androidx.compose.material3.*
import androidx.compose.runtime.*
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import de.fs.maintenancepro.ui.components.QrScannerView
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.fs.maintenancepro.R
import de.fs.maintenancepro.ui.theme.*
import de.fs.maintenancepro.ui.viewmodel.MainViewModel

sealed class StepState {
    object Pending : StepState()
    object Skipped : StepState()
    object Ok : StepState()
    data class Fail(val reason: String) : StepState()
}

@Composable
private fun ConnectionTestStep(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    state: StepState
) {
    val (tint, statusIcon, detail) = when (state) {
        is StepState.Ok -> Triple(Color(0xFF16A34A), Icons.Default.Check, null)
        is StepState.Fail -> Triple(Color(0xFFDC2626), Icons.Default.Close, state.reason)
        StepState.Skipped -> Triple(Color(0xFF94A3B8), null, null)
        StepState.Pending -> Triple(Color(0xFF64748B), null, null)
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier
            .fillMaxWidth()
            .background(
                when (state) {
                    is StepState.Ok -> Color(0xFFF0FDF4)
                    is StepState.Fail -> Color(0xFFFEF2F2)
                    else -> Color(0xFFF8FAFC)
                },
                RoundedCornerShape(8.dp)
            )
            .padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
        Text(label, style = MaterialTheme.typography.bodySmall, color = tint, modifier = Modifier.weight(1f))
        when {
            state == StepState.Pending -> CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = tint)
            statusIcon != null -> Icon(statusIcon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
        }
    }
    if (detail != null) {
        Text(
            "  $detail",
            style = MaterialTheme.typography.labelSmall,
            color = Color(0xFFDC2626),
            modifier = Modifier.padding(start = 16.dp, bottom = 2.dp)
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: MainViewModel,
    onNavigateBack: () -> Unit
) {
    val context = LocalContext.current
    val configState by viewModel.serverConfig.collectAsState(initial = null)
    val isOffline by viewModel.isOffline.collectAsState()
    val connectionTestState by viewModel.connectionTestState.collectAsState()
    val coroutineScope = rememberCoroutineScope()

    var serverAddress by remember { mutableStateOf("http://eno-nt-remote.dynip.online") }
    var port by remember { mutableStateOf("34313") }
    var username by remember { mutableStateOf("tprantl") }
    var password by remember { mutableStateOf("testpasswort") }
    var codeword by remember { mutableStateOf("77-XJ-900-PLX-22") }

    var showPassword by remember { mutableStateOf(false) }

    var showQrInputDialog by remember { mutableStateOf(false) }
    var qrInputText by remember { mutableStateOf("") }

    val cameraPermission = Manifest.permission.CAMERA
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            showQrInputDialog = true
        } else {
            Toast.makeText(context, "Kamera-Freigabe ist erforderlich, um einen QR-Code zu scannen.", Toast.LENGTH_LONG).show()
        }
    }

    // Update form when database state is loaded -- previously password/codeword were
    // never restored here, so a verified-working connection would silently fall back
    // to hardcoded placeholder values on every app restart or re-entry into Settings.
    LaunchedEffect(configState) {
        configState?.let {
            serverAddress = it.serverAddress
            port = it.port.toString()
            username = it.username
            if (it.encryptedPasswordBase64.isNotBlank()) password = it.encryptedPasswordBase64
            if (it.codeword.isNotBlank()) codeword = it.codeword
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.title_configuration), color = IndustrialPrimary, fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
                actions = {
                    IconButton(onClick = {
                        val hasCameraPermission = ContextCompat.checkSelfPermission(
                            context, cameraPermission
                        ) == PackageManager.PERMISSION_GRANTED
                        if (hasCameraPermission) {
                            showQrInputDialog = true
                        } else {
                            cameraPermissionLauncher.launch(cameraPermission)
                        }
                    }) {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = stringResource(R.string.btn_qr_scan), tint = IndustrialPrimary)
                    }
                }
            )
        },
        containerColor = IndustrialBackground
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .padding(16.dp)
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = stringResource(R.string.title_configuration),
                style = MaterialTheme.typography.headlineLarge,
                color = IndustrialOnBackground
            )
            
            Text(
                text = "Verwalten Sie Ihre Serververbindungen und Authentifizierungsdaten für den Feldeinsatz.",
                style = MaterialTheme.typography.bodyMedium,
                color = IndustrialOnSurfaceVariant
            )

            // Connection Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(2.dp, IndustrialOutlineVariant)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(Icons.Default.NetworkCheck, contentDescription = null, tint = IndustrialPrimary)
                        Text(
                            text = "Server-Verbindung",
                            style = MaterialTheme.typography.headlineMedium,
                            color = IndustrialPrimary
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        OutlinedTextField(
                            value = serverAddress,
                            onValueChange = { serverAddress = it; viewModel.resetConnectionTest() },
                            label = { Text(stringResource(R.string.label_server_address)) },
                            modifier = Modifier.weight(3f),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = IndustrialSecondaryContainer,
                                focusedLabelColor = IndustrialSecondaryContainer
                            )
                        )

                        OutlinedTextField(
                            value = port,
                            onValueChange = { port = it; viewModel.resetConnectionTest() },
                            label = { Text(stringResource(R.string.label_port)) },
                            modifier = Modifier.weight(1f),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = IndustrialSecondaryContainer,
                                focusedLabelColor = IndustrialSecondaryContainer
                            )
                        )
                    }

                    OutlinedTextField(
                        value = username,
                        onValueChange = { username = it; viewModel.resetConnectionTest() },
                        label = { Text(stringResource(R.string.label_username)) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = IndustrialSecondaryContainer,
                            focusedLabelColor = IndustrialSecondaryContainer
                        )
                    )

                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it; viewModel.resetConnectionTest() },
                        label = { Text(stringResource(R.string.label_password)) },
                        modifier = Modifier.fillMaxWidth(),
                        visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { showPassword = !showPassword }) {
                                Icon(
                                    imageVector = if (showPassword) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                                    contentDescription = null
                                )
                            }
                        },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = IndustrialSecondaryContainer,
                            focusedLabelColor = IndustrialSecondaryContainer
                        )
                    )

                    OutlinedTextField(
                        value = codeword,
                        onValueChange = { codeword = it; viewModel.resetConnectionTest() },
                        label = { Text(stringResource(R.string.label_mainkey)) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = IndustrialSecondaryContainer,
                            focusedLabelColor = IndustrialSecondaryContainer
                        )
                    )

                    HorizontalDivider(color = IndustrialOutlineVariant)

                    // ── Verbindungstest ─────────────────────────────────────
                    Button(
                        onClick = {
                            viewModel.testConnectionWithSettings(
                                serverAddress.trim(),
                                port.toIntOrNull() ?: 3000,
                                username.trim(),
                                password,
                                codeword.trim()
                            )
                        },
                        enabled = connectionTestState !is MainViewModel.ConnectionTestState.Testing,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = IndustrialPrimary,
                            contentColor = Color.White
                        )
                    ) {
                        if (connectionTestState is MainViewModel.ConnectionTestState.Testing) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = Color.White)
                            Spacer(Modifier.width(8.dp))
                            Text("Teste Verbindung…", fontWeight = FontWeight.Bold)
                        } else {
                            Icon(Icons.Default.NetworkCheck, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Verbindung testen", fontWeight = FontWeight.Bold)
                        }
                    }

                    // 3-Stufen-Ergebnis
                    if (connectionTestState !is MainViewModel.ConnectionTestState.Idle) {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            ConnectionTestStep(
                                icon = Icons.Default.Wifi,
                                label = "Server erreichbar",
                                state = when (connectionTestState) {
                                    is MainViewModel.ConnectionTestState.Testing -> StepState.Pending
                                    is MainViewModel.ConnectionTestState.Unreachable -> StepState.Fail("Kein Netzwerk oder falsche Adresse")
                                    else -> StepState.Ok
                                }
                            )
                            ConnectionTestStep(
                                icon = Icons.Default.Lock,
                                label = "Verschlüsselung (Codeword)",
                                state = when (connectionTestState) {
                                    is MainViewModel.ConnectionTestState.Testing -> StepState.Pending
                                    is MainViewModel.ConnectionTestState.Unreachable -> StepState.Skipped
                                    is MainViewModel.ConnectionTestState.WrongKey -> StepState.Fail("Codeword stimmt nicht überein")
                                    else -> StepState.Ok
                                }
                            )
                            ConnectionTestStep(
                                icon = Icons.Default.Person,
                                label = "Zugangsdaten",
                                state = when (val s = connectionTestState) {
                                    is MainViewModel.ConnectionTestState.Testing -> StepState.Pending
                                    is MainViewModel.ConnectionTestState.Unreachable -> StepState.Skipped
                                    is MainViewModel.ConnectionTestState.WrongKey -> StepState.Skipped
                                    is MainViewModel.ConnectionTestState.WrongCredentials -> StepState.Fail("Benutzername oder Passwort falsch")
                                    is MainViewModel.ConnectionTestState.UnknownError -> StepState.Fail("HTTP ${s.code}")
                                    is MainViewModel.ConnectionTestState.Success -> StepState.Ok
                                    else -> StepState.Pending
                                }
                            )
                            if (connectionTestState is MainViewModel.ConnectionTestState.Success) {
                                val name = (connectionTestState as MainViewModel.ConnectionTestState.Success).technicianName
                                Text(
                                    "✓ Angemeldet als: $name",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = Color(0xFF16A34A),
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(top = 2.dp)
                                )
                            }
                        }
                    }
                }
            }

            // Info Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = LightSurfaceHigh),
                border = BorderStroke(2.dp, IndustrialOutlineVariant)
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .background(IndustrialPrimary)
                    ) {
                        Text(
                            text = "MP",
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 20.sp,
                            modifier = Modifier.align(Alignment.Center)
                        )
                    }

                    Column {
                        Text(
                            text = "Maintenance Pro",
                            style = MaterialTheme.typography.headlineMedium,
                            color = IndustrialOnBackground
                        )
                        Text(
                            text = "ID: 99283-FS",
                            style = MaterialTheme.typography.labelMedium,
                            color = IndustrialOnSurfaceVariant
                        )
                    }
                }
            }

            // Server-Anlagendefinitionen Loading Card
            var isReloadingDefs by remember { mutableStateOf(false) }

            Card(
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, IndustrialOutlineVariant)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Server-Anlagendefinitionen",
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleMedium,
                        color = IndustrialOnSurface
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Laden Sie die aktuellen Anlagentypen, Melderarten und Spalten-Strukturen direkt vom zentralen WebUI des Mandanten.",
                        style = MaterialTheme.typography.bodySmall,
                        color = IndustrialOutline
                    )
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = {
                            isReloadingDefs = true
                            coroutineScope.launch {
                                val success = viewModel.reloadSystemDefinitionsOnServer()
                                isReloadingDefs = false
                                if (success) {
                                    Toast.makeText(context, "Anlagentypen erfolgreich geladen!", Toast.LENGTH_SHORT).show()
                                } else {
                                    Toast.makeText(context, "Fehler beim Laden der Anlagentypen vom Server.", Toast.LENGTH_SHORT).show()
                                }
                            }
                        },
                        enabled = !isReloadingDefs,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = IndustrialPrimary,
                            contentColor = Color.White
                        ),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        if (isReloadingDefs) {
                            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Lädt...", fontWeight = FontWeight.Bold)
                        } else {
                            Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Anlagentypen neu laden", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            // ── Offline-Datenbank Sync Card ──────────────────────────────────
            val syncState by viewModel.syncState.collectAsState()
            val lastSyncAt = configState?.lastFullSyncAt ?: 0L

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, IndustrialOutlineVariant)
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(Icons.Default.Sync, contentDescription = null, tint = IndustrialPrimary)
                        Text(
                            text = "Offline-Datenbank Synchronisation",
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.titleMedium,
                            color = IndustrialOnSurface
                        )
                    }
                    Text(
                        text = "Lädt alle Verträge mit Auslöselisten herunter, damit diese offline vollständig durchsucht und bearbeitet werden können.",
                        style = MaterialTheme.typography.bodySmall,
                        color = IndustrialOutline
                    )

                    if (lastSyncAt > 0L) {
                        val lastSyncDate = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.GERMAN).format(Date(lastSyncAt))
                        Text(
                            text = "Letzter Sync: $lastSyncDate",
                            style = MaterialTheme.typography.labelSmall,
                            color = IndustrialOutline
                        )
                    }

                    // Sync status feedback
                    when (val state = syncState) {
                        is MainViewModel.SyncState.InProgress -> {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(14.dp),
                                    strokeWidth = 2.dp,
                                    color = IndustrialPrimary
                                )
                                Text(state.message, style = MaterialTheme.typography.labelSmall, color = IndustrialPrimary)
                            }
                        }
                        is MainViewModel.SyncState.Done -> {
                            Text(
                                "✓ ${state.downloaded} heruntergeladen" + if (state.uploaded > 0) ", ${state.uploaded} hochgeladen" else "",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color(0xFF16A34A)
                            )
                        }
                        is MainViewModel.SyncState.Error -> {
                            Text(
                                "✗ ${state.message}",
                                style = MaterialTheme.typography.labelSmall,
                                color = IndustrialError
                            )
                        }
                        else -> {}
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { viewModel.startFullSync() },
                            enabled = syncState !is MainViewModel.SyncState.InProgress,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = IndustrialPrimary,
                                contentColor = Color.White
                            )
                        ) {
                            Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Grundsynchronisation", fontWeight = FontWeight.Bold, fontSize = 11.sp)
                        }

                        if (lastSyncAt > 0L) {
                            OutlinedButton(
                                onClick = { viewModel.startDeltaSync() },
                                enabled = syncState !is MainViewModel.SyncState.InProgress,
                                modifier = Modifier.weight(1f),
                                border = BorderStroke(1.dp, IndustrialPrimary)
                            ) {
                                Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(16.dp), tint = IndustrialPrimary)
                                Spacer(Modifier.width(6.dp))
                                Text("Delta-Sync", fontWeight = FontWeight.Bold, fontSize = 11.sp, color = IndustrialPrimary)
                            }
                        }
                    }
                }
            }

            // Warning Banner
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFFEF3C7)),
                border = BorderStroke(2.dp, IndustrialSecondaryContainer)
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(Icons.Default.Info, contentDescription = null, tint = IndustrialSecondary)
                    Text(
                        text = stringResource(R.string.warning_restart),
                        style = MaterialTheme.typography.bodyMedium,
                        color = IndustrialOnSecondaryContainer
                    )
                }
            }

            // Danger Action / Save Button Layout
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedButton(
                    onClick = {
                        viewModel.clearDatabaseCache()
                        Toast.makeText(context, "Cache erfolgreich bereinigt.", Toast.LENGTH_SHORT).show()
                    },
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = IndustrialError),
                    border = BorderStroke(2.dp, IndustrialError),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.btn_clear_cache), fontWeight = FontWeight.Bold)
                }

                Button(
                    onClick = {
                        val p = port.toIntOrNull() ?: 3000
                        viewModel.saveConfig(serverAddress, p, username, password, codeword)
                        Toast.makeText(context, "Konfiguration erfolgreich gespeichert!", Toast.LENGTH_LONG).show()
                        onNavigateBack()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = IndustrialSecondaryContainer, contentColor = IndustrialOnSecondaryContainer),
                    contentPadding = PaddingValues(horizontal = 24.dp, vertical = 14.dp)
                ) {
                    Icon(Icons.Default.Save, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.btn_save), fontWeight = FontWeight.Bold)
                }
            }

            if (showQrInputDialog) {
                fun trySubmitQr(text: String): Boolean {
                    if (text.isBlank()) return false
                    val success = viewModel.applyQrSetup(text)
                    if (success) {
                        Toast.makeText(context, "Verbindungsprofil erfolgreich geladen!", Toast.LENGTH_SHORT).show()
                        showQrInputDialog = false
                    } else {
                        Toast.makeText(context, "Ungültiges QR-Format!", Toast.LENGTH_SHORT).show()
                    }
                    return success
                }

                AlertDialog(
                    onDismissRequest = { showQrInputDialog = false },
                    title = { Text("Mobiles QR-Kamera-Scanning", fontWeight = FontWeight.Bold, color = IndustrialPrimary) },
                    text = {
                        Column(
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "Scannen Sie den Einrichtungs-QR-Code auf dem Web-Dashboard der Zentrale.",
                                fontSize = 13.sp,
                                color = Color.Gray
                            )

                            Box(
                                modifier = Modifier
                                    .size(240.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(Color(0xFF1E293B))
                                    .border(2.dp, IndustrialOutline, RoundedCornerShape(12.dp))
                            ) {
                                QrScannerView(
                                    modifier = Modifier.fillMaxSize(),
                                    onScanned = { text ->
                                        qrInputText = text
                                        trySubmitQr(text)
                                    }
                                )
                                // Crop bracket bounding box overlay, purely visual
                                Box(
                                    modifier = Modifier
                                        .align(Alignment.Center)
                                        .size(180.dp)
                                        .border(2.dp, Color(0xFF22C55E), RoundedCornerShape(8.dp))
                                )
                            }

                            Spacer(modifier = Modifier.height(4.dp))

                            OutlinedTextField(
                                value = qrInputText,
                                onValueChange = { qrInputText = it },
                                placeholder = { Text("Hier Mandantendaten (SECURE_MANDANT;...) einfügen") },
                                label = { Text("QR-Code Inhalt manuell einfügen / simulieren") },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(8.dp),
                                maxLines = 1,
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = IndustrialPrimary,
                                    unfocusedBorderColor = IndustrialOutline
                                )
                            )
                        }
                    },
                    confirmButton = {
                        Button(
                            onClick = {
                                if (qrInputText.isBlank()) {
                                    Toast.makeText(context, "Bitte geben Sie einen QR-Text ein.", Toast.LENGTH_SHORT).show()
                                } else {
                                    trySubmitQr(qrInputText)
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = IndustrialPrimary)
                        ) {
                            Text("Einrichten")
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showQrInputDialog = false }) {
                            Text("Abbrechen", color = Color.Gray)
                        }
                    }
                )
            }
        }
    }
}
