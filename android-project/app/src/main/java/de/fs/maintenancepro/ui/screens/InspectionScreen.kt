package de.fs.maintenancepro.ui.screens

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Warning
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
import de.fs.maintenancepro.ui.theme.*
import de.fs.maintenancepro.ui.viewmodel.MainViewModel
import org.json.JSONObject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InspectionScreen(
    viewModel: MainViewModel,
    protocolId: String,
    onNavigateToEditMatrix: (String) -> Unit,
    onNavigateBack: () -> Unit
) {
    val context = LocalContext.current
    val allProtocols by viewModel.protocols.collectAsState(initial = emptyList())
    val protocolEntity = allProtocols.find { it.id == protocolId }

    LaunchedEffect(protocolId) {
        viewModel.setActiveProtocolId(protocolId)
    }

    DisposableEffect(protocolId) {
        onDispose {
            viewModel.setActiveProtocolId(null)
        }
    }

    if (protocolEntity == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    val rootJson = remember(protocolEntity.decryptedPayloadJson) {
        JSONObject(protocolEntity.decryptedPayloadJson)
    }

    val clientName = rootJson.optString("client_name", "Unbekannt")
    val systemType = rootJson.optString("system_type", "BMA")
    val intervalText = rootJson.optString("interval", "Jährlich")
    val defObj = rootJson.getJSONObject("definition")
    val columnsArray = defObj.getJSONArray("columns")
    val rowsArray = rootJson.getJSONArray("rows")
    val applicableValuesArray = defObj.getJSONArray("applicable_values")

    // Active Selection Choice (H1, H2, Q1, Def etc.)
    var activeSelectVal by remember { mutableStateOf("H1") }
    var expandedFabMenu by remember { mutableStateOf(false) }

    val totalColumns = columnsArray.length()
    val scrollState = rememberScrollState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(clientName, fontWeight = FontWeight.Bold, color = IndustrialPrimary, fontSize = 20.sp) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.Close, contentDescription = null, tint = IndustrialPrimary)
                    }
                },
                actions = {
                    IconButton(onClick = { onNavigateToEditMatrix(protocolId) }) {
                        Icon(Icons.Default.Edit, contentDescription = "Editor Modus", tint = IndustrialPrimary)
                    }
                }
            )
        },
        floatingActionButton = {
            // Floating Action Button displaying Active Select status
            Box(modifier = Modifier.padding(bottom = 16.dp)) {
                FloatingActionButton(
                    onClick = { expandedFabMenu = !expandedFabMenu },
                    containerColor = if (activeSelectVal == "Def.") IndustrialError else IndustrialSecondaryContainer,
                    contentColor = if (activeSelectVal == "Def.") Color.White else IndustrialOnSecondaryContainer
                ) {
                    Text(text = activeSelectVal, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }

                DropdownMenu(
                    expanded = expandedFabMenu,
                    onDismissRequest = { expandedFabMenu = false }
                ) {
                    for (v in 0 until applicableValuesArray.length()) {
                        val valObj = applicableValuesArray.getJSONObject(v)
                        val valStr = valObj.getString("value")
                        DropdownMenuItem(
                            text = { Text(valObj.getString("label")) },
                            onClick = {
                                activeSelectVal = valStr
                                expandedFabMenu = false
                            }
                        )
                    }
                }
            }
        },
        containerColor = IndustrialBackground
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize()
        ) {
            // Context Info Strip
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(LightSurfaceLow)
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(text = clientName, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Box(modifier = Modifier.background(IndustrialSecondaryContainer, RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 2.dp)) {
                            Text(text = systemType, color = IndustrialOnSecondaryContainer, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Text(text = "Intervall: $intervalText", color = IndustrialOutline)
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            viewModel.synchronizeProtocol(protocolId)
                            Toast.makeText(context, "Inspektions-Upload gestartet.", Toast.LENGTH_SHORT).show()
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = IndustrialSecondaryContainer, contentColor = IndustrialOnSecondaryContainer)
                    ) {
                        Text("Sync Sync", fontWeight = FontWeight.Bold)
                    }
                }
            }

            // Scrollable Dynamic Table Grid
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .horizontalScroll(scrollState)
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize()
                ) {
                    // Header Row
                    item {
                        Row(
                            modifier = Modifier
                                .background(LightSurfaceHigh)
                                .border(1.dp, IndustrialOutlineVariant)
                        ) {
                            // Frozen GRP Corner Cell
                            Box(
                                modifier = Modifier
                                    .width(100.dp)
                                    .padding(12.dp)
                            ) {
                                Text(text = "GRP", fontWeight = FontWeight.Bold, color = IndustrialOutline)
                            }

                            // Dynamic slot columns definitions
                            for (c in 0 until totalColumns) {
                                val colObj = columnsArray.getJSONObject(c)
                                Box(
                                    modifier = Modifier
                                        .width(72.dp)
                                        .padding(12.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(text = colObj.getString("label"), fontWeight = FontWeight.Bold, color = IndustrialOutline)
                                }
                            }
                        }
                    }

                    // Dynamically populated group checklist items
                    items((0 until rowsArray.length()).toList()) { rIndex ->
                        val rowObj = rowsArray.getJSONObject(rIndex)
                        val groupId = rowObj.getString("group_id")
                        val cellsArray = rowObj.getJSONArray("cells")

                        Row(
                            modifier = Modifier
                                .background(Color.White)
                                .border(0.5.dp, IndustrialOutlineVariant)
                        ) {
                            // Frozen GRP ID column
                            Box(
                                modifier = Modifier
                                    .width(100.dp)
                                    .background(Color.White)
                                    .border(0.5.dp, IndustrialOutlineVariant)
                                    .padding(16.dp)
                            ) {
                                Text(text = groupId, fontWeight = FontWeight.Bold, color = IndustrialPrimary)
                            }

                            // Interactive slots cells
                            for (cIndex in 0 until cellsArray.length()) {
                                val cellObj = cellsArray.getJSONObject(cIndex)
                                val slotKey = cellObj.getString("slot_key")
                                val detectorType = cellObj.getString("detector_type")
                                val cellVal = cellObj.optString("value", "")

                                val isDisabled = detectorType == "-"

                                Box(
                                    modifier = Modifier
                                        .width(72.dp)
                                        .height(64.dp)
                                        .background(if (isDisabled) LightSurfaceLow else if (cellVal.isNotEmpty()) {
                                            if (cellVal == "Def.") IndustrialErrorContainer else IndustrialPrimaryContainer.copy(alpha = 0.1f)
                                        } else Color.White)
                                    .border(1.dp, IndustrialOutlineVariant)
                                    .clickable(enabled = !isDisabled) {
                                        val writeText = if (cellVal == activeSelectVal) "" else activeSelectVal
                                        viewModel.editCell(protocolId, groupId, slotKey, writeText)
                                    },
                                    contentAlignment = Alignment.Center
                                ) {
                                    if (isDisabled) {
                                        Text(text = "-", color = IndustrialOutline)
                                    } else if (cellVal.isNotEmpty()) {
                                        if (cellVal == "Def.") {
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                                Icon(Icons.Default.Warning, contentDescription = null, tint = IndustrialError, modifier = Modifier.size(12.dp))
                                                Text(text = "DEF.", color = IndustrialError, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                                            }
                                        } else {
                                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                                Text(text = cellVal, color = IndustrialPrimary, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                                Text(text = detectorType, color = IndustrialOutline, fontSize = 9.sp)
                                            }
                                        }
                                    } else {
                                        Text(text = detectorType, color = IndustrialOutline, fontSize = 11.sp)
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
