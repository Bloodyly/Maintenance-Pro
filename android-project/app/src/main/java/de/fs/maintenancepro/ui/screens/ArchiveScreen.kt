package de.fs.maintenancepro.ui.screens

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.fs.maintenancepro.R
import de.fs.maintenancepro.data.local.ProtocolEntity
import de.fs.maintenancepro.ui.components.StatusHeaderBadge
import de.fs.maintenancepro.ui.theme.*
import de.fs.maintenancepro.ui.viewmodel.MainViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArchiveScreen(
    viewModel: MainViewModel,
    onNavigateToInspection: (String) -> Unit
) {
    val context = LocalContext.current
    val allProtocols by viewModel.protocols.collectAsState(initial = emptyList())
    
    // Filter to get exclusively archived protocols
    val archiveList = allProtocols.filter { it.isArchived }

    var activeDetailsPayload by remember { mutableStateOf<String?>(null) }
    var selectedRestoreProtocol by remember { mutableStateOf<ProtocolEntity?>(null) }
    var selectedDeleteProtocol by remember { mutableStateOf<ProtocolEntity?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.btn_archives), color = IndustrialPrimary, fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
                actions = {
                    StatusHeaderBadge(viewModel)
                }
            )
        },
        containerColor = IndustrialBackground
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize()
                .padding(16.dp)
        ) {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                if (archiveList.isEmpty()) {
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            border = BorderStroke(1.dp, IndustrialOutlineVariant)
                        ) {
                            Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                                Text(
                                    text = "Keine archivierten Protokolle vorhanden. Archivieren Sie ungenutzte oder abgeschlossene Listeneinträge in der Ansicht 'Geladen'.",
                                    color = IndustrialOutline,
                                    fontSize = 14.sp
                                )
                            }
                        }
                    }
                }

                items(archiveList) { protocol ->
                    ElevatedCard(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp).background(Color.White)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.Top
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(text = protocol.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = IndustrialOnSurface)
                                    Text(text = protocol.address, style = MaterialTheme.typography.labelMedium, color = IndustrialOutline)
                                }
                                Box(
                                    modifier = Modifier
                                        .background(Color(0xFFE2E8F0), RoundedCornerShape(4.dp))
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Text(text = protocol.systemType, color = Color(0xFF475569), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                            
                            Spacer(Modifier.height(12.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column {
                                    Text(text = "VERTRAGSNUMMER", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = IndustrialOutline)
                                    Text(text = protocol.contractNumber, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                                }
                                Column {
                                    Text(text = "STATUS", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = IndustrialOutline)
                                    Text(text = "Archiviert (Gesperrt)", style = MaterialTheme.typography.labelMedium, color = Color(0xFF64748B), fontWeight = FontWeight.Bold)
                                }
                            }

                            Spacer(Modifier.height(16.dp))
                            
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Button(
                                    onClick = { onNavigateToInspection(protocol.id) },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF475569)),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text("Ansehen", fontWeight = FontWeight.Bold)
                                }

                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    // Info Button
                                    IconButton(
                                        onClick = { activeDetailsPayload = protocol.decryptedPayloadJson },
                                        modifier = Modifier
                                            .size(40.dp)
                                            .border(1.dp, IndustrialOutlineVariant, RoundedCornerShape(8.dp))
                                            .background(Color.White, RoundedCornerShape(8.dp))
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Info,
                                            contentDescription = "Details",
                                            tint = IndustrialPrimary,
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }

                                    // Restore Button
                                    OutlinedButton(
                                        onClick = { selectedRestoreProtocol = protocol },
                                        colors = ButtonDefaults.outlinedButtonColors(contentColor = IndustrialPrimary),
                                        border = BorderStroke(1.dp, IndustrialOutlineVariant),
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Icon(imageVector = Icons.Default.Restore, contentDescription = null, modifier = Modifier.size(14.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Re-Act", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                    }

                                    // Delete / Discard locally
                                    IconButton(
                                        onClick = { selectedDeleteProtocol = protocol },
                                        modifier = Modifier
                                            .size(40.dp)
                                            .border(1.dp, Color(0xFFFCA5A5), RoundedCornerShape(8.dp))
                                            .background(Color.White, RoundedCornerShape(8.dp)),
                                        colors = IconButtonDefaults.iconButtonColors(contentColor = Color(0xFFEF4444))
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Delete,
                                            contentDescription = "Löschen",
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Details Modal
    if (activeDetailsPayload != null) {
        de.fs.maintenancepro.ui.components.ProtocolDetailsDialog(
            payloadJson = activeDetailsPayload!!,
            onDismiss = { activeDetailsPayload = null }
        )
    }

    // Restore Confirmation
    if (selectedRestoreProtocol != null) {
        AlertDialog(
            onDismissRequest = { selectedRestoreProtocol = null },
            title = { Text("Aus dem Archiv entlassen?", fontWeight = FontWeight.Bold, color = IndustrialPrimary) },
            text = {
                Text("Möchten Sie das Protokoll \"${selectedRestoreProtocol!!.name}\" wiederherstellen? Es wird zurück in Ihre 'Geladen' Liste verschoben und die Bearbeitung wird reaktiviert.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.restoreProtocol(selectedRestoreProtocol!!.id)
                        Toast.makeText(context, "Protokoll reaktiviert.", Toast.LENGTH_SHORT).show()
                        selectedRestoreProtocol = null
                    }
                ) {
                    Text("Reaktivieren", fontWeight = FontWeight.Bold, color = IndustrialPrimary)
                }
            },
            dismissButton = {
                TextButton(onClick = { selectedRestoreProtocol = null }) {
                    Text("Abbrechen", color = Color.Gray)
                }
            }
        )
    }

    // Delete Confirmation
    if (selectedDeleteProtocol != null) {
        AlertDialog(
            onDismissRequest = { selectedDeleteProtocol = null },
            title = { Text("Dauerhaft vom Gerät löschen?", fontWeight = FontWeight.Bold, color = Color(0xFFEF4444)) },
            text = {
                Text("Möchten Sie das Protokoll \"${selectedDeleteProtocol!!.name}\" dauerhaft löschen? Alle Messdaten werden gelöscht und es muss bei Bedarf neu heruntergeladen werden.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteProtocolLocally(selectedDeleteProtocol!!.id)
                        Toast.makeText(context, "Erfolgreich gelöscht.", Toast.LENGTH_SHORT).show()
                        selectedDeleteProtocol = null
                    }
                ) {
                    Text("Löschen", fontWeight = FontWeight.Bold, color = Color(0xFFEF4444))
                }
            },
            dismissButton = {
                TextButton(onClick = { selectedDeleteProtocol = null }) {
                    Text("Abbrechen", color = Color.Gray)
                }
            }
        )
    }
}
