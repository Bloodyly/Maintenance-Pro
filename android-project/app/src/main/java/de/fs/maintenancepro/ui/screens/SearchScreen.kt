package de.fs.maintenancepro.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.fs.maintenancepro.R
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
    val isOffline by viewModel.isOffline.collectAsState()
    val liveModusEnabled by viewModel.liveModusEnabled.collectAsState()
    val searchResults by viewModel.searchResults.collectAsState()
    val localProtocols by viewModel.protocols.collectAsState(initial = emptyList())
    var activeDetailsPayload by remember { mutableStateOf<String?>(null) }

    val filteredItems = remember(searchResults, localProtocols) {
        searchResults.map { item ->
            val localItem = localProtocols.find { it.id == item.id }
            if (localItem != null) {
                item.copy(status = localItem.localStatus)
            } else {
                item
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.title_search), color = IndustrialPrimary, fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
                navigationIcon = {
                    IconButton(onClick = { viewModel.processSyncQueue() }) {
                        Icon(Icons.Default.Sync, contentDescription = null, tint = IndustrialPrimary)
                    }
                },
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
                    onValueChange = { viewModel.updateSearchQuery(it) },
                    placeholder = { Text("Suche nach Kunden oder Anlagen...") },
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
                    onClick = { /* Filter dialogue */ },
                    modifier = Modifier
                        .size(52.dp)
                        .border(2.dp, IndustrialOutline, RoundedCornerShape(8.dp))
                        .background(Color.White, RoundedCornerShape(8.dp))
                ) {
                    Icon(Icons.Default.Tune, contentDescription = null, tint = IndustrialOnSurface)
                }
            }

            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                contentPadding = PaddingValues(vertical = 16.dp)
            ) {
                items(filteredItems) { item ->
                    ProtocolCard(
                        item = item,
                        isLiveEditing = (liveModusEnabled && item.is_live == true),
                        onDownload = { viewModel.downloadProtocol(item) },
                        onEdit = { onNavigateToInspection(item.id) },
                        onShowDetails = {
                            val local = localProtocols.find { it.id == item.id }
                            if (local != null) {
                                activeDetailsPayload = local.decryptedPayloadJson
                            }
                        }
                    )
                }

                if (filteredItems.isEmpty()) {
                    item {
                        EmptyStateItem()
                    }
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
fun ProtocolCard(
    item: ProtocolItemDto,
    isLiveEditing: Boolean = false,
    onDownload: () -> Unit,
    onEdit: () -> Unit,
    onShowDetails: () -> Unit = {}
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(2.dp, IndustrialOutlineVariant)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(text = item.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = IndustrialOnSurface)
                    Text(text = item.address, style = MaterialTheme.typography.labelMedium, color = IndustrialOutline)
                }
                
                Spacer(modifier = Modifier.width(8.dp))

                // System Type Badge
                Box(
                    modifier = Modifier
                        .background(IndustrialPrimaryContainer, RoundedCornerShape(4.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(text = item.system_type, color = IndustrialOnPrimaryContainer, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }

            if (isLiveEditing) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFFEF2F2), RoundedCornerShape(4.dp))
                        .border(1.dp, Color(0xFFFCA5A5), RoundedCornerShape(4.dp))
                        .padding(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Warning,
                        contentDescription = null,
                        tint = Color(0xFFEF4444),
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = "Dieses Protokoll wird gerade live von einem Kollegen bearbeitet!",
                        color = Color(0xFFB91C1C),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            // Divider dashed style simulated
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(IndustrialOutlineVariant)
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(text = "VERTRAGSNUMMER", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = IndustrialOutline)
                    Text(text = item.contract_number, style = MaterialTheme.typography.labelMedium)
                }
                Column {
                    Text(text = "WARTUNGSINTERVALL", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = IndustrialOutline)
                    Text(text = item.interval, style = MaterialTheme.typography.labelMedium)
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                when (item.status) {
                    "ready_to_download" -> {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.clickable { onDownload() }
                        ) {
                            Icon(Icons.Default.CloudDownload, contentDescription = null, tint = IndustrialOutline)
                            Text(text = stringResource(R.string.status_ready_to_download), style = MaterialTheme.typography.labelMedium, color = IndustrialOutline)
                        }
                        
                        Button(
                            onClick = onDownload,
                            colors = ButtonDefaults.buttonColors(containerColor = IndustrialPrimary),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.Default.Download, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text(stringResource(R.string.btn_download), fontWeight = FontWeight.Bold)
                        }
                    }
                    "downloaded", "upload_pending" -> {
                        Box(
                            modifier = Modifier
                                .background(Color(0xFFDCFCE7), RoundedCornerShape(4.dp))
                                .padding(horizontal = 12.dp, vertical = 8.dp)
                        ) {
                            Text(
                                text = if (item.status == "upload_pending") "Ausstehend" else stringResource(R.string.status_downloaded),
                                color = IndustrialGreen,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            IconButton(
                                onClick = onShowDetails,
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

                            Button(
                                onClick = onEdit,
                                colors = ButtonDefaults.buttonColors(containerColor = IndustrialPrimary),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text("Bearbeiten", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                    else -> { // Synchronized
                        Text(text = "Synchronisiert (12.05.)", style = MaterialTheme.typography.labelMedium, color = IndustrialOutline)
                        Button(
                            onClick = {},
                            enabled = false,
                            colors = ButtonDefaults.buttonColors(containerColor = IndustrialOutlineVariant)
                        ) {
                            Text(stringResource(R.string.status_archived))
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun EmptyStateItem() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(Icons.Default.Warning, contentDescription = null, modifier = Modifier.size(48.dp), tint = IndustrialOutline)
        Text(text = stringResource(R.string.empty_results), fontSize = 18.sp, fontWeight = FontWeight.Bold)
    }
}
