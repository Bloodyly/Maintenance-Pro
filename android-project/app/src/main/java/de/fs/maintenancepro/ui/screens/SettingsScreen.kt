package de.fs.maintenancepro.ui.screens

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.NetworkCheck
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: MainViewModel,
    onNavigateBack: () -> Unit
) {
    val context = LocalContext.current
    val configState by viewModel.serverConfig.collectAsState(initial = null)
    val isOffline by viewModel.isOffline.collectAsState()

    var serverAddress by remember { mutableStateOf("https://field-service.corp.internal") }
    var port by remember { mutableStateOf("8443") }
    var username by remember { mutableStateOf("TECH_UNIT_99283") }
    var password by remember { mutableStateOf("••••••••••••") }
    var codeword by remember { mutableStateOf("77-XJ-900-PLX-22") }
    
    var showPassword by remember { privateStateOf(false) }
    
    var showQrInputDialog by remember { mutableStateOf(false) }
    var qrInputText by remember { mutableStateOf("") }

    // Update form when database state is loaded
    LaunchedEffect(configState) {
        configState?.let {
            serverAddress = it.serverAddress
            port = it.port.toString()
            username = it.username
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.title_configuration), color = IndustrialPrimary, fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
                actions = {
                    IconButton(onClick = {
                        showQrInputDialog = true
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
                            onValueChange = { serverAddress = it },
                            label = { Text(stringResource(R.string.label_server_address)) },
                            modifier = Modifier.weight(3f),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = IndustrialSecondaryContainer,
                                focusedLabelColor = IndustrialSecondaryContainer
                            )
                        )

                        OutlinedTextField(
                            value = port,
                            onValueChange = { port = it },
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
                        onValueChange = { username = it },
                        label = { Text(stringResource(R.string.label_username)) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = IndustrialSecondaryContainer,
                            focusedLabelColor = IndustrialSecondaryContainer
                        )
                    )

                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
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
                        onValueChange = { codeword = it },
                        label = { Text(stringResource(R.string.label_mainkey)) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = IndustrialSecondaryContainer,
                            focusedLabelColor = IndustrialSecondaryContainer
                        )
                    )
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
            val coroutineScope = rememberCoroutineScope()

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
                AlertDialog(
                    onDismissRequest = { showQrInputDialog = false },
                    title = { Text("Mobiles QR-Kamera-Scanning", fontWeight = FontWeight.Bold, color = IndustrialPrimary) },
                    text = {
                        Column(
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "Kamera wird initialisiert... Scannen Sie den Einrichtungs-QR-Code auf dem Web-Dashboard der Zentrale.",
                                fontSize = 13.sp,
                                color = Color.Gray
                            )

                            // Animated scanner viewfinder
                            val infiniteTransition = rememberInfiniteTransition(label = "scanner")
                            val scannerOffsetY by infiniteTransition.animateFloat(
                                initialValue = 0f,
                                targetValue = 180f,
                                animationSpec = infiniteRepeatable(
                                    animation = tween(1500, easing = LinearEasing),
                                    repeatMode = RepeatMode.Reverse
                                ),
                                label = "scannerLine"
                            )

                            Box(
                                modifier = Modifier
                                    .size(200.dp)
                                    .background(Color(0xFF1E293B), RoundedCornerShape(12.dp))
                                    .border(2.dp, IndustrialOutline, RoundedCornerShape(12.dp)),
                                contentAlignment = Alignment.Center
                            ) {
                                // Crop bracket bounding box
                                Box(
                                    modifier = Modifier
                                        .size(160.dp)
                                        .border(2.dp, Color(0xFF22C55E), RoundedCornerShape(8.dp))
                                ) {
                                    // Glowing red/green scanning beam
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(3.dp)
                                            .offset(y = scannerOffsetY.dp)
                                            .background(Color(0xFF22C55E))
                                    )
                                }
                                Text(
                                    text = "LIVE-VIEWFINDER",
                                    color = Color.White.copy(alpha = 0.5f),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp)
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
                                if (qrInputText.isNotBlank()) {
                                    val success = viewModel.applyQrSetup(qrInputText)
                                    if (success) {
                                        Toast.makeText(context, "Verbindungsprofil erfolgreich geladen!", Toast.LENGTH_SHORT).show()
                                        showQrInputDialog = false
                                    } else {
                                        Toast.makeText(context, "Ungültiges QR-Format!", Toast.LENGTH_SHORT).show()
                                    }
                                } else {
                                    Toast.makeText(context, "Bitte geben Sie einen QR-Text ein.", Toast.LENGTH_SHORT).show()
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

// Custom private state helper wrapping remember
@Composable
fun <T> privateStateOf(value: T): MutableState<T> = remember { mutableStateOf(value) }
