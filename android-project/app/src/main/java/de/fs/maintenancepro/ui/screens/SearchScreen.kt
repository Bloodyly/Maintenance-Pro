package de.fs.maintenancepro.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.fs.maintenancepro.data.local.ProtocolEntity
import de.fs.maintenancepro.data.remote.ProtocolItemDto
import de.fs.maintenancepro.ui.components.StatusHeaderBadge
import de.fs.maintenancepro.ui.theme.*
import de.fs.maintenancepro.ui.viewmodel.MainViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    viewModel: MainViewModel,
    onNavigateToInspection: (String) -> Unit,
    onNavigateToSettings: () -> Unit
) {
    val searchQuery by viewModel.searchQuery.collectAsState()
    val searchResults by viewModel.searchResults.collectAsState()
    val localProtocols by viewModel.protocols.collectAsState(initial = emptyList())
    val isSyncing by viewModel.isSyncing.collectAsState()

    var showFilterOptions by remember { mutableStateOf(false) }
    var filterSystemType by remember { mutableStateOf("Alle") }
    var sortByOption by remember { mutableStateOf("Kunde (Name)") }
    var showCompleted by remember { mutableStateOf(false) }
    var activeDetailsPayload by remember { mutableStateOf<String?>(null) }

    val filteredItems = remember(searchResults, localProtocols, filterSystemType, sortByOption, showCompleted) {
        var list = searchResults.map { item ->
            val local = localProtocols.find { it.id == item.id }
            if (local != null) item.copy(status = local.localStatus) else item
        }
        if (!showCompleted) {
            list = list.filter { it.status != "synchronized" }
        }
        if (filterSystemType != "Alle") {
            list = list.filter { it.system_type == filterSystemType }
        }
        list = when (sortByOption) {
            "Adresse" -> list.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.address })
            "Vertragsnummer" -> list.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.contract_number })
            else -> list.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.name })
        }
        list
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Suche", color = IndustrialPrimary, fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
                navigationIcon = {
                    IconButton(
                        onClick = { viewModel.pullServerUpdates() },
                        enabled = !isSyncing
                    ) {
                        if (isSyncing) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = IndustrialPrimary)
                        } else {
                            Icon(Icons.Default.Sync, contentDescription = "Aktualisieren", tint = IndustrialPrimary)
                        }
                    }
                },
                actions = { StatusHeaderBadge(viewModel) }
            )
        },
        containerColor = IndustrialBackground
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize()
        ) {
            // Search + Filter bar
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
                    onValueChange = { viewModel.updateSearchQuery(it) },
                    placeholder = { Text("Suche nach Kunden oder Anlagen...") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = IndustrialOutline) },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Color.White,
                        unfocusedContainerColor = Color.White,
                        focusedBorderColor = IndustrialPrimary
                    ),
                    singleLine = true
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

            if (showFilterOptions) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(LightSurfaceLow)
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    var typeExpanded by remember { mutableStateOf(false) }
                    Box {
                        Button(
                            onClick = { typeExpanded = true },
                            colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color.DarkGray),
                            border = androidx.compose.foundation.BorderStroke(1.dp, IndustrialOutlineVariant),
                            shape = RoundedCornerShape(20.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                            modifier = Modifier.height(32.dp)
                        ) { Text("Typ: $filterSystemType", fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                        DropdownMenu(expanded = typeExpanded, onDismissRequest = { typeExpanded = false }) {
                            listOf("Alle", "BMA", "EMA", "ELA", "LIRA", "SLA").forEach { t ->
                                DropdownMenuItem(text = { Text(t) }, onClick = { filterSystemType = t; typeExpanded = false })
                            }
                        }
                    }

                    var sortExpanded by remember { mutableStateOf(false) }
                    Box {
                        Button(
                            onClick = { sortExpanded = true },
                            colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color.DarkGray),
                            border = androidx.compose.foundation.BorderStroke(1.dp, IndustrialOutlineVariant),
                            shape = RoundedCornerShape(20.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                            modifier = Modifier.height(32.dp)
                        ) { Text("Sort: $sortByOption", fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                        DropdownMenu(expanded = sortExpanded, onDismissRequest = { sortExpanded = false }) {
                            listOf("Kunde (Name)", "Adresse", "Vertragsnummer").forEach { s ->
                                DropdownMenuItem(text = { Text(s) }, onClick = { sortByOption = s; sortExpanded = false })
                            }
                        }
                    }

                    FilterChip(
                        selected = showCompleted,
                        onClick = { showCompleted = !showCompleted },
                        label = { Text("Erledigte", fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                    )
                }
            }

            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(vertical = 16.dp)
            ) {
                items(filteredItems, key = { it.id }) { item ->
                    val localEntity = localProtocols.find { it.id == item.id }
                    SearchProtocolCard(
                        item = item,
                        localEntity = localEntity,
                        onEdit = { onNavigateToInspection(item.id) },
                        onDownloadAndEdit = {
                            viewModel.downloadProtocol(item)
                        },
                        onShowDetails = {
                            if (localEntity != null) activeDetailsPayload = localEntity.decryptedPayloadJson
                        }
                    )
                }

                if (filteredItems.isEmpty()) {
                    item { SearchEmptyState() }
                }
            }
        }
    }

    if (activeDetailsPayload != null) {
        de.fs.maintenancepro.ui.components.ProtocolDetailsDialog(
            payloadJson = activeDetailsPayload!!,
            onDismiss = { activeDetailsPayload = null }
        )
    }
}

@Composable
private fun SearchProtocolCard(
    item: ProtocolItemDto,
    localEntity: ProtocolEntity?,
    onEdit: () -> Unit,
    onDownloadAndEdit: () -> Unit,
    onShowDetails: () -> Unit
) {
    val isLocal = localEntity != null
    val isLive = item.is_live == true

    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {

            // Header: name + system type badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = item.name,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold,
                        color = IndustrialOnSurface
                    )
                    Text(text = item.address, style = MaterialTheme.typography.labelMedium, color = IndustrialOutline)
                }
                Box(
                    modifier = Modifier
                        .background(IndustrialPrimaryContainer, RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(text = item.system_type, color = IndustrialOnPrimaryContainer, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }

            // Live-Warnung
            if (isLive) {
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFFEF2F2), RoundedCornerShape(4.dp))
                        .border(1.dp, Color(0xFFFCA5A5), RoundedCornerShape(4.dp))
                        .padding(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFEF4444), modifier = Modifier.size(14.dp))
                    Text("Wird gerade von einem Kollegen bearbeitet", color = Color(0xFFB91C1C), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                }
            }

            Spacer(Modifier.height(10.dp))

            // Contract number + status
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text("VERTRAGSNUMMER", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = IndustrialOutline)
                    Text(text = item.contract_number, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("STATUS", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = IndustrialOutline)
                    val (statusText, statusColor) = when (item.status) {
                        "upload_pending" -> "Upload ausstehend" to Color(0xFFB45309)
                        "synchronized"   -> "Erledigt" to Color(0xFF15803D)
                        "downloaded"     -> "Geladen" to IndustrialPrimary
                        else             -> "Verfügbar" to IndustrialOutline
                    }
                    Text(text = statusText, style = MaterialTheme.typography.labelMedium, color = statusColor, fontWeight = FontWeight.Bold)
                }
            }

            Spacer(Modifier.height(12.dp))

            // Action buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (isLocal) {
                    Button(
                        onClick = onEdit,
                        colors = ButtonDefaults.buttonColors(containerColor = IndustrialPrimary),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Anpassen", fontWeight = FontWeight.Bold)
                    }
                } else {
                    OutlinedButton(
                        onClick = onDownloadAndEdit,
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = IndustrialPrimary),
                        shape = RoundedCornerShape(8.dp),
                        border = androidx.compose.foundation.BorderStroke(1.dp, IndustrialPrimary)
                    ) {
                        Text("Laden", fontWeight = FontWeight.Bold)
                    }
                }

                IconButton(
                    onClick = onShowDetails,
                    enabled = isLocal,
                    modifier = Modifier
                        .size(40.dp)
                        .border(1.dp, if (isLocal) IndustrialOutlineVariant else IndustrialOutlineVariant.copy(alpha = 0.4f), RoundedCornerShape(8.dp))
                        .background(Color.White, RoundedCornerShape(8.dp))
                ) {
                    Icon(
                        imageVector = Icons.Default.Info,
                        contentDescription = "Ansehen",
                        tint = if (isLocal) IndustrialPrimary else IndustrialOutline.copy(alpha = 0.4f),
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun SearchEmptyState() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(48.dp), tint = IndustrialOutline)
        Text("Keine Anlagen gefunden", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = IndustrialOnSurface)
        Text("Suchbegriff anpassen oder Aktualisieren tippen", fontSize = 13.sp, color = IndustrialOutline)
    }
}
