package de.fs.maintenancepro.ui.screens

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LockReset
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.fs.maintenancepro.data.local.ProtocolEntity
import de.fs.maintenancepro.ui.components.StatusHeaderBadge
import de.fs.maintenancepro.ui.theme.*
import de.fs.maintenancepro.ui.viewmodel.MainViewModel
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun DownloadedScreen(
    viewModel: MainViewModel,
    onNavigateToInspection: (String) -> Unit
) {
    val context = LocalContext.current
    val allRecent by viewModel.recentlyOpened.collectAsState(initial = emptyList())
    val historyLimit by viewModel.historyLimit.collectAsState()

    val displayedProtocols = remember(allRecent, historyLimit) {
        if (historyLimit <= 0) allRecent else allRecent.take(historyLimit)
    }

    var activeDetailsPayload by remember { mutableStateOf<String?>(null) }
    var resetTarget by remember { mutableStateOf<ProtocolEntity?>(null) }
    var limitMenuExpanded by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Verlauf", color = IndustrialPrimary, fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
                actions = {
                    Box {
                        TextButton(onClick = { limitMenuExpanded = true }) {
                            Icon(Icons.Default.History, contentDescription = null, tint = IndustrialPrimary, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(4.dp))
                            Text(
                                text = if (historyLimit <= 0) "Alle" else "Letzte $historyLimit",
                                color = IndustrialPrimary,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        DropdownMenu(expanded = limitMenuExpanded, onDismissRequest = { limitMenuExpanded = false }) {
                            listOf(10, 20, 50, 100, 0).forEach { n ->
                                DropdownMenuItem(
                                    text = { Text(if (n == 0) "Alle" else "Letzte $n") },
                                    onClick = {
                                        viewModel.setHistoryLimit(n)
                                        limitMenuExpanded = false
                                    }
                                )
                            }
                        }
                    }
                    StatusHeaderBadge(viewModel)
                }
            )
        },
        containerColor = IndustrialBackground
    ) { innerPadding ->
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp),
            contentPadding = PaddingValues(vertical = 16.dp)
        ) {
            if (displayedProtocols.isEmpty()) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.dp, IndustrialOutlineVariant)
                    ) {
                        Box(
                            modifier = Modifier.fillMaxWidth().padding(32.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(Icons.Default.History, contentDescription = null, tint = IndustrialOutline, modifier = Modifier.size(40.dp))
                                Text("Noch keine Anlagen geöffnet.", color = IndustrialOutline, fontSize = 14.sp)
                            }
                        }
                    }
                }
            }

            items(displayedProtocols, key = { it.id }) { protocol ->
                VerlaufCard(
                    protocol = protocol,
                    onOpen = { onNavigateToInspection(protocol.id) },
                    onShowDetails = { activeDetailsPayload = protocol.decryptedPayloadJson },
                    onLongPress = { resetTarget = protocol }
                )
            }
        }
    }

    if (activeDetailsPayload != null) {
        de.fs.maintenancepro.ui.components.ProtocolDetailsDialog(
            payloadJson = activeDetailsPayload!!,
            onDismiss = { activeDetailsPayload = null }
        )
    }

    if (resetTarget != null) {
        AlertDialog(
            onDismissRequest = { resetTarget = null },
            icon = { Icon(Icons.Default.LockReset, contentDescription = null, tint = IndustrialPrimary) },
            title = { Text("Status zurücksetzen?", fontWeight = FontWeight.Bold, color = IndustrialPrimary) },
            text = {
                Text("\"${resetTarget!!.name}\" wird auf 'Offen' gesetzt. Zelleninhalte bleiben erhalten.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.resetProtocolToOpen(resetTarget!!.id)
                        Toast.makeText(context, "Status zurückgesetzt.", Toast.LENGTH_SHORT).show()
                        resetTarget = null
                    }
                ) {
                    Text("Zurücksetzen", fontWeight = FontWeight.Bold, color = IndustrialPrimary)
                }
            },
            dismissButton = {
                TextButton(onClick = { resetTarget = null }) {
                    Text("Abbrechen", color = Color.Gray)
                }
            }
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun VerlaufCard(
    protocol: ProtocolEntity,
    onOpen: () -> Unit,
    onShowDetails: () -> Unit,
    onLongPress: () -> Unit
) {
    val dateStr = remember(protocol.lastOpenedAt) {
        if (protocol.lastOpenedAt > 0) {
            SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.GERMANY).format(Date(protocol.lastOpenedAt))
        } else ""
    }

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = onOpen, onLongClick = onLongPress),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = protocol.name,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold,
                        color = IndustrialOnSurface
                    )
                    Text(text = protocol.address, style = MaterialTheme.typography.labelMedium, color = IndustrialOutline)
                }
                Box(
                    modifier = Modifier
                        .background(IndustrialPrimaryContainer, RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(text = protocol.systemType, color = IndustrialOnPrimaryContainer, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }

            Spacer(Modifier.height(10.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text("VERTRAGSNUMMER", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = IndustrialOutline)
                    Text(text = protocol.contractNumber, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("STATUS", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = IndustrialOutline)
                    val (statusText, statusColor) = when (protocol.localStatus) {
                        "upload_pending" -> "Upload ausstehend" to Color(0xFFB45309)
                        "synchronized" -> "Erledigt" to Color(0xFF15803D)
                        "downloaded" -> "Geladen" to IndustrialPrimary
                        else -> "Offen" to IndustrialOutline
                    }
                    Text(text = statusText, style = MaterialTheme.typography.labelMedium, color = statusColor, fontWeight = FontWeight.Bold)
                }
            }

            if (dateStr.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                Text("Zuletzt geöffnet: $dateStr", fontSize = 10.sp, color = IndustrialOutline)
            }

            Spacer(Modifier.height(12.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Button(
                    onClick = onOpen,
                    colors = ButtonDefaults.buttonColors(containerColor = IndustrialPrimary),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("Ausfüllen", fontWeight = FontWeight.Bold)
                }

                IconButton(
                    onClick = onShowDetails,
                    modifier = Modifier
                        .size(40.dp)
                        .border(1.dp, IndustrialOutlineVariant, RoundedCornerShape(8.dp))
                        .background(Color.White, RoundedCornerShape(8.dp))
                ) {
                    Icon(imageVector = Icons.Default.Info, contentDescription = "Details", tint = IndustrialPrimary, modifier = Modifier.size(20.dp))
                }
            }
        }
    }
}
