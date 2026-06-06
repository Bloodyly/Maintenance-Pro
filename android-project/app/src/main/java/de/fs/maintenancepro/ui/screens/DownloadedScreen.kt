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
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tune
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
fun DownloadedScreen(
    viewModel: MainViewModel,
    onNavigateToInspection: (String) -> Unit
) {
    val context = LocalContext.current
    val downloadedProtocols by viewModel.protocols.collectAsState(initial = emptyList())
    
    var searchQuery by remember { mutableStateOf("") }
    var showFilterOptions by remember { mutableStateOf(false) }
    var filterSystemType by remember { mutableStateOf("Alle") }
    var sortByOption by remember { mutableStateOf("Kunde (Name)") }
    
    // Filter out archived ones and keep only downloaded, pending, or synchronized local items, plus client search and filters
    val localList = remember(downloadedProtocols, searchQuery, filterSystemType, sortByOption) {
        var list = downloadedProtocols.filter { 
            (it.localStatus == "downloaded" || it.localStatus == "upload_pending" || it.localStatus == "synchronized") && !it.isArchived 
        }
        
        if (searchQuery.isNotBlank()) {
            val q = searchQuery.trim().lowercase()
            list = list.filter {
                it.name.lowercase().contains(q) ||
                it.address.lowercase().contains(q) ||
                it.contractNumber.lowercase().contains(q)
            }
        }
        
        if (filterSystemType != "Alle") {
            list = list.filter { it.systemType == filterSystemType }
        }
        
        list = when (sortByOption) {
            "Adresse" -> list.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.address })
            "Vertragsnummer" -> list.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.contractNumber })
            else -> list.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.name })
        }
        
        list
    }

    var activeDetailsPayload by remember { mutableStateOf<String?>(null) }
    var selectedArchiveProtocol by remember { mutableStateOf<ProtocolEntity?>(null) }
    var selectedDeleteProtocol by remember { mutableStateOf<ProtocolEntity?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.title_inspections), color = IndustrialPrimary, fontWeight = FontWeight.Bold) },
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
        ) {
            // Search Input Row
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(LightSurfaceLow)
                    .padding(8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text("Lokal durchsuchen...") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = IndustrialOutline) },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Color.White,
                        unfocusedContainerColor = Color.White,
                        focusedBorderColor = IndustrialPrimary
                    )
                )

                IconButton(
                    onClick = { showFilterOptions = !showFilterOptions },
                    modifier = Modifier
                        .size(52.dp)
                        .border(2.dp, if (showFilterOptions) IndustrialPrimary else IndustrialOutline, RoundedCornerShape(8.dp))
                        .background(if (showFilterOptions) IndustrialPrimaryContainer else Color.White, RoundedCornerShape(8.dp))
                ) {
                    Icon(Icons.Default.Tune, contentDescription = null, tint = if (showFilterOptions) IndustrialPrimary else IndustrialOnSurface)
                }
            }

            // Quick Filters Bar
            if (showFilterOptions) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(LightSurfaceLow)
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // System Type Selector
                    var typeExpanded by remember { mutableStateOf(false) }
                    Box {
                        Button(
                            onClick = { typeExpanded = true },
                            colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color.DarkGray),
                            border = BorderStroke(1.dp, IndustrialOutlineVariant),
                            shape = RoundedCornerShape(20.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                            modifier = Modifier.height(32.dp)
                        ) {
                            Text("Typ: $filterSystemType", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                        DropdownMenu(expanded = typeExpanded, onDismissRequest = { typeExpanded = false }) {
                            listOf("Alle", "BMA", "EMA", "ELA", "LIRA", "SLA").forEach { t ->
                                DropdownMenuItem(
                                    text = { Text(t) },
                                    onClick = {
                                        filterSystemType = t
                                        typeExpanded = false
                                    }
                                )
                            }
                        }
                    }

                    // Sort By Selector
                    var sortExpanded by remember { mutableStateOf(false) }
                    Box {
                        Button(
                            onClick = { sortExpanded = true },
                            colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color.DarkGray),
                            border = BorderStroke(1.dp, IndustrialOutlineVariant),
                            shape = RoundedCornerShape(20.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                            modifier = Modifier.height(32.dp)
                        ) {
                            Text("Sort: $sortByOption", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                        DropdownMenu(expanded = sortExpanded, onDismissRequest = { sortExpanded = false }) {
                            listOf("Kunde (Name)", "Adresse", "Vertragsnummer").forEach { s ->
                                DropdownMenuItem(
                                    text = { Text(s) },
                                    onClick = {
                                        sortByOption = s
                                        sortExpanded = false
                                    }
                                )
                            }
                        }
                    }
                }
            }

            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
            ) {
                if (localList.isEmpty()) {
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            border = BorderStroke(1.dp, IndustrialOutlineVariant)
                        ) {
                            Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                                Text(
                                    text = "Keine lokalen Auslöselisten geladen. Suchen Sie eine Anlage in der 'Online Suche' und laden Sie diese herunter.",
                                    color = IndustrialOutline,
                                    fontSize = 14.sp
                                )
                            }
                        }
                    }
                }

                items(localList) { protocol ->
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
                                        .background(IndustrialPrimaryContainer, RoundedCornerShape(4.dp))
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Text(text = protocol.systemType, color = IndustrialOnPrimaryContainer, fontSize = 11.sp, fontWeight = FontWeight.Bold)
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
                                    val statusText = when (protocol.localStatus) {
                                        "upload_pending" -> "Upload ausstehend"
                                        "synchronized" -> "Synchronisiert"
                                        else -> "Lokal Geladen"
                                    }
                                    val statusColor = when (protocol.localStatus) {
                                        "upload_pending" -> Color(0xFFB45309)
                                        "synchronized" -> Color(0xFF15803D)
                                        else -> IndustrialPrimary
                                    }
                                    Text(text = statusText, style = MaterialTheme.typography.labelMedium, color = statusColor, fontWeight = FontWeight.Bold)
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
                                    colors = ButtonDefaults.buttonColors(containerColor = IndustrialPrimary),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text("Ausfüllen", fontWeight = FontWeight.Bold)
                                }

                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    // Info Details Button
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

                                    // Move to Archive Button
                                    OutlinedButton(
                                        onClick = { selectedArchiveProtocol = protocol },
                                        colors = ButtonDefaults.outlinedButtonColors(contentColor = IndustrialPrimary),
                                        border = BorderStroke(1.dp, IndustrialOutlineVariant),
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Text("Archivieren", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                    }

                                    // Local Delete Button
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
                                            contentDescription = "Entladen",
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

    // Archive Confirmation
    if (selectedArchiveProtocol != null) {
        AlertDialog(
            onDismissRequest = { selectedArchiveProtocol = null },
            title = { Text("In das Archiv verschieben?", fontWeight = FontWeight.Bold, color = IndustrialPrimary) },
            text = {
                Text("Möchten Sie das Protokoll \"${selectedArchiveProtocol!!.name}\" manuell ins Archiv verschieben? Die Bearbeitung wird danach gesperrt.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.archiveProtocol(selectedArchiveProtocol!!.id)
                        Toast.makeText(context, "Protokoll archiviert.", Toast.LENGTH_SHORT).show()
                        selectedArchiveProtocol = null
                    }
                ) {
                    Text("Archivieren", fontWeight = FontWeight.Bold, color = IndustrialPrimary)
                }
            },
            dismissButton = {
                TextButton(onClick = { selectedArchiveProtocol = null }) {
                    Text("Abbrechen", color = Color.Gray)
                }
            }
        )
    }

    // Delete Confirmation
    if (selectedDeleteProtocol != null) {
        AlertDialog(
            onDismissRequest = { selectedDeleteProtocol = null },
            title = { Text("Vom Mobilgerät entfernen?", fontWeight = FontWeight.Bold, color = Color(0xFFEF4444)) },
            text = {
                Text("Möchten Sie das Protokoll \"${selectedDeleteProtocol!!.name}\" wirklich von diesem Gerät entladen? Ungespeicherte Änderungen gehen dauerhaft verloren.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteProtocolLocally(selectedDeleteProtocol!!.id)
                        Toast.makeText(context, "Vom Gerät entfernt.", Toast.LENGTH_SHORT).show()
                        selectedDeleteProtocol = null
                    }
                ) {
                    Text("Entfernen", fontWeight = FontWeight.Bold, color = Color(0xFFEF4444))
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
