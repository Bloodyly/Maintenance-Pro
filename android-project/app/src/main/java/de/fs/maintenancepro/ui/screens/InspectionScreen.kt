package de.fs.maintenancepro.ui.screens

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
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

    // Synchronize default selection value based on loaded definitions
    LaunchedEffect(applicableValuesArray) {
        if (applicableValuesArray.length() > 0) {
            activeSelectVal = applicableValuesArray.getJSONObject(0).getString("value")
        }
    }

    val totalColumns = columnsArray.length()

    // Scroll states for 2D diagonal scrolling with frozen row/column
    val horizontalScrollState = rememberScrollState()
    val headerScrollState = rememberScrollState()
    val verticalScrollState = rememberScrollState()
    val leftScrollState = rememberScrollState()

    // Maintain alignment
    LaunchedEffect(horizontalScrollState.value) {
        headerScrollState.scrollTo(horizontalScrollState.value)
    }
    LaunchedEffect(headerScrollState.value) {
        horizontalScrollState.scrollTo(headerScrollState.value)
    }
    LaunchedEffect(verticalScrollState.value) {
        leftScrollState.scrollTo(verticalScrollState.value)
    }
    LaunchedEffect(leftScrollState.value) {
        verticalScrollState.scrollTo(leftScrollState.value)
    }

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
                    if (!protocolEntity.isArchived) {
                        IconButton(onClick = { onNavigateToEditMatrix(protocolId) }) {
                            Icon(Icons.Default.Edit, contentDescription = "Editor Modus", tint = IndustrialPrimary)
                        }
                    }
                }
            )
        },
        floatingActionButton = {
            if (!protocolEntity.isArchived) {
                Column(
                    horizontalAlignment = Alignment.End,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(bottom = 16.dp, end = 8.dp)
                ) {
                    // Modern selection bubbles overlay
                    if (expandedFabMenu) {
                        Card(
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
                            border = BorderStroke(1.dp, IndustrialOutlineVariant),
                            modifier = Modifier.padding(bottom = 4.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(8.dp),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                for (v in 0 until applicableValuesArray.length()) {
                                    val valObj = applicableValuesArray.getJSONObject(v)
                                    val valStr = valObj.getString("value")
                                    val labelStr = valObj.getString("label")
                                    val isDefect = valObj.optBoolean("is_defect", false)
                                    val isSelected = activeSelectVal == valStr

                                    Box(
                                        modifier = Modifier
                                            .background(
                                                color = if (isSelected) {
                                                    if (isDefect) IndustrialError else IndustrialPrimary
                                                } else {
                                                    if (isDefect) IndustrialErrorContainer.copy(alpha = 0.4f) else LightSurfaceLow
                                                },
                                                shape = RoundedCornerShape(20.dp)
                                            )
                                            .border(
                                                width = 1.dp,
                                                color = if (isSelected) Color.Transparent else IndustrialOutlineVariant,
                                                shape = RoundedCornerShape(20.dp)
                                            )
                                            .clickable {
                                                activeSelectVal = valStr
                                                expandedFabMenu = false
                                            }
                                            .padding(horizontal = 14.dp, vertical = 8.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = labelStr,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 12.sp,
                                            color = if (isSelected) Color.White else {
                                                if (isDefect) IndustrialError else IndustrialOnSurface
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // Main Active Choice Floating Action Button displaying status
                    ExtendedFloatingActionButton(
                        onClick = { expandedFabMenu = !expandedFabMenu },
                        containerColor = if (activeSelectVal == "Def.") IndustrialError else IndustrialPrimary,
                        contentColor = Color.White,
                        elevation = FloatingActionButtonDefaults.elevation(defaultElevation = 6.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            var activeLabel = activeSelectVal
                            for (v in 0 until applicableValuesArray.length()) {
                                val valObj = applicableValuesArray.getJSONObject(v)
                                if (valObj.getString("value") == activeSelectVal) {
                                    activeLabel = valObj.getString("label")
                                }
                            }
                            Text(text = "Aktion: $activeLabel", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        }
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

            // Beautiful frozen scrolling grid architecture supporting 2D diagonal scroll
            Column(modifier = Modifier.fillMaxSize()) {
                
                // 1. HEADER ROW (Frozen top row, scrolls only horizontally linked with column content)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(LightSurfaceHigh)
                        .border(1.dp, IndustrialOutlineVariant)
                ) {
                    // Frozen GRP Corner Cell
                    Box(
                        modifier = Modifier
                            .width(100.dp)
                            .height(44.dp)
                            .background(LightSurfaceHigh)
                            .padding(12.dp),
                        contentAlignment = Alignment.CenterStart
                    ) {
                        Text(text = "GRP", fontWeight = FontWeight.ExtraBold, color = IndustrialOutline, fontSize = 12.sp)
                    }

                    // Dynamic slot columns definitions (scrolls horizontally with headerScrollState)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(44.dp)
                            .horizontalScroll(headerScrollState)
                    ) {
                        for (c in 0 until totalColumns) {
                            val colObj = columnsArray.getJSONObject(c)
                            Box(
                                modifier = Modifier
                                    .width(72.dp)
                                    .fillMaxHeight()
                                    .border(0.5.dp, IndustrialOutlineVariant),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = colObj.getString("label"),
                                    fontWeight = FontWeight.Bold,
                                    color = IndustrialOnSurface,
                                    fontSize = 13.sp
                                )
                            }
                        }
                    }
                }

                // 2. SCROLLABLE INNER TABLE (Columns linked vertical / Grid scrollable both)
                Row(
                    modifier = Modifier.fillMaxSize()
                ) {
                    // Left Column: List of Group IDs (Frozen horizontal, scrolls only vertically)
                    Column(
                        modifier = Modifier
                            .width(100.dp)
                            .fillMaxHeight()
                            .background(Color.White)
                            .verticalScroll(leftScrollState)
                    ) {
                        for (rIndex in 0 until rowsArray.length()) {
                            val rowObj = rowsArray.getJSONObject(rIndex)
                            val groupId = rowObj.getString("group_id")
                            val cellsArray = rowObj.getJSONArray("cells")

                            Box(
                                modifier = Modifier
                                    .width(100.dp)
                                    .height(48.dp) // Compact heights!
                                    .background(LightSurfaceLow)
                                    .border(0.5.dp, IndustrialOutlineVariant)
                                    .clickable {
                                        // Tap on Group ID (first column) selects/marks the entire row with active choice!!
                                        if (!protocolEntity.isArchived) {
                                            for (cIndex in 0 until cellsArray.length()) {
                                                val cellObj = cellsArray.getJSONObject(cIndex)
                                                val slotKey = cellObj.getString("slot_key")
                                                val detectorType = cellObj.getString("detector_type")
                                                if (detectorType != "-") {
                                                    viewModel.editCell(protocolId, groupId, slotKey, activeSelectVal)
                                                }
                                            }
                                        }
                                    }
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                                contentAlignment = Alignment.CenterStart
                            ) {
                                Text(
                                    text = groupId,
                                    fontWeight = FontWeight.Bold,
                                    color = IndustrialPrimary,
                                    fontSize = 12.sp
                                )
                            }
                        }
                    }

                    // Central Grid Container (Fully scrollable horizontally & vertically = DIAGONAL 2D SCROLL!)
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(verticalScrollState)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxHeight()
                                .horizontalScroll(horizontalScrollState)
                        ) {
                            Column {
                                for (rIndex in 0 until rowsArray.length()) {
                                    val rowObj = rowsArray.getJSONObject(rIndex)
                                    val groupId = rowObj.getString("group_id")
                                    val cellsArray = rowObj.getJSONArray("cells")

                                    Row {
                                        // Interactive slots cells
                                        for (cIndex in 1..cellsArray.length()) {
                                            val cellObj = cellsArray.getJSONObject(cIndex - 1)
                                            val slotKey = cellObj.getString("slot_key")
                                            val detectorType = cellObj.getString("detector_type")
                                            val cellVal = cellObj.optString("value", "")

                                            val isDisabled = detectorType == "-"

                                            Box(
                                                modifier = Modifier
                                                    .width(72.dp)
                                                    .height(48.dp) // Compact heights!
                                                    .background(
                                                        if (isDisabled) LightSurfaceLow 
                                                        else if (cellVal.isNotEmpty()) {
                                                            if (cellVal == "Def.") IndustrialErrorContainer 
                                                            else IndustrialPrimaryContainer.copy(alpha = 0.12f)
                                                        } else Color.White
                                                    )
                                                    .border(0.5.dp, IndustrialOutlineVariant)
                                                    .clickable(enabled = !isDisabled && !protocolEntity.isArchived) {
                                                        val writeText = if (cellVal == activeSelectVal) "" else activeSelectVal
                                                        viewModel.editCell(protocolId, groupId, slotKey, writeText)
                                                    },
                                                contentAlignment = Alignment.Center
                                            ) {
                                                if (isDisabled) {
                                                    Text(text = "-", color = IndustrialOutline.copy(alpha = 0.5f), fontSize = 12.sp)
                                                } else if (cellVal.isNotEmpty()) {
                                                    if (cellVal == "Def." || cellVal.lowercase().contains("def")) {
                                                        Row(
                                                            verticalAlignment = Alignment.CenterVertically,
                                                            horizontalArrangement = Arrangement.spacedBy(1.dp)
                                                        ) {
                                                            Icon(
                                                                Icons.Default.Warning,
                                                                contentDescription = null,
                                                                tint = IndustrialError,
                                                                modifier = Modifier.size(10.dp)
                                                            )
                                                            Text(
                                                                text = "DEF.",
                                                                color = IndustrialError,
                                                                fontWeight = FontWeight.ExtraBold,
                                                                fontSize = 10.sp
                                                            )
                                                        }
                                                    } else {
                                                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                                            Text(
                                                                text = cellVal,
                                                                color = IndustrialPrimary,
                                                                fontWeight = FontWeight.Bold,
                                                                fontSize = 11.sp
                                                            )
                                                            Text(
                                                                text = detectorType,
                                                                color = IndustrialOutline,
                                                                fontSize = 8.sp,
                                                                fontWeight = FontWeight.Light
                                                            )
                                                        }
                                                    }
                                                } else {
                                                    Text(
                                                        text = detectorType,
                                                        color = IndustrialOutline.copy(alpha = 0.7f),
                                                        fontSize = 10.sp
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
            }
        }
    }
}
