package de.fs.maintenancepro.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import de.fs.maintenancepro.R
import de.fs.maintenancepro.ui.components.StatusHeaderBadge
import de.fs.maintenancepro.ui.theme.*
import de.fs.maintenancepro.ui.viewmodel.MainViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DownloadedScreen(
    viewModel: MainViewModel,
    onNavigateToInspection: (String) -> Unit
) {
    val downloadedProtocols by viewModel.protocols.collectAsState(initial = emptyList())
    val localList = downloadedProtocols.filter { it.localStatus == "downloaded" || it.localStatus == "upload_pending" }

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
                .padding(16.dp)
        ) {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                if (localList.isEmpty()) {
                    item {
                        Box(modifier = Modifier.fillMaxWidth().padding(32.dp)) {
                            Text(text = "Keine lokalen Auslöselisten geladen. Laden Sie diese in der 'Online Suche' herunter.")
                        }
                    }
                }

                items(localList) { protocol ->
                    // Recycle Card logic but bind directly to local DB entity items
                    ElevatedCard(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color.White)
                    ) {
                        Column(modifier = Modifier.padding(16.dp).background(Color.White)) {
                            Text(text = protocol.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold)
                            Text(text = protocol.address, style = MaterialTheme.typography.labelMedium, color = IndustrialOutline)
                            
                            Spacer(Modifier.height(8.dp))
                            
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Button(
                                    onClick = { onNavigateToInspection(protocol.id) },
                                    colors = ButtonDefaults.buttonColors(containerColor = IndustrialPrimary)
                                ) {
                                    Text("Ausfüllen", fontWeight = FontWeight.Bold)
                                }

                                if (protocol.localStatus == "upload_pending") {
                                    Box(
                                        modifier = Modifier
                                            .background(Color(0xFFFEF3C7))
                                    ) {
                                        Text(text = "Upload ausstehend", color = IndustrialSecondary, modifier = Modifier.padding(8.dp))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
