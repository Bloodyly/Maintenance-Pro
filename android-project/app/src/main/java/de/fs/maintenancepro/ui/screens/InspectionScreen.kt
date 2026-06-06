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
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.zIndex
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.ZoomIn
import androidx.compose.material.icons.filled.ZoomOut
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

    // High performance model transformations remembered to avoid JSON overhead during draw loops
    val clientName = remember(protocolEntity.decryptedPayloadJson) {
        try { JSONObject(protocolEntity.decryptedPayloadJson).optString("client_name", "Unbekannt") } catch (e: Exception) { "Unbekannt" }
    }
    val systemType = remember(protocolEntity.decryptedPayloadJson) {
        try { JSONObject(protocolEntity.decryptedPayloadJson).optString("system_type", "BMA") } catch (e: Exception) { "BMA" }
    }
    val intervalText = remember(protocolEntity.decryptedPayloadJson) {
        try { JSONObject(protocolEntity.decryptedPayloadJson).optString("interval", "Jährlich") } catch (e: Exception) { "Jährlich" }
    }

    val tableData = remember(protocolEntity.decryptedPayloadJson) {
        try {
            val root = JSONObject(protocolEntity.decryptedPayloadJson)
            val def = root.getJSONObject("definition")
            val colsObj = def.getJSONArray("columns")
            val columns = List(colsObj.length()) { i ->
                val o = colsObj.getJSONObject(i)
                ColumnModel(o.getString("key"), o.getString("label"))
            }
            val appValsObj = def.getJSONArray("applicable_values")
            val applicableValues = List(appValsObj.length()) { i ->
                val o = appValsObj.getJSONObject(i)
                ValueModel(o.getString("value"), o.getString("label"), o.optBoolean("is_defect", false))
            }
            val rowsObj = root.getJSONArray("rows")
            val rows = List(rowsObj.length()) { i ->
                val rowO = rowsObj.getJSONObject(i)
                val cellsObj = rowO.getJSONArray("cells")
                val cells = List(cellsObj.length()) { j ->
                    val cellO = cellsObj.getJSONObject(j)
                    CellModel(
                        slotKey = cellO.getString("slot_key"),
                        detectorType = cellO.getString("detector_type"),
                        value = cellO.optString("value", "")
                    )
                }
                RowModel(
                    groupId = rowO.getString("group_id"),
                    groupName = rowO.optString("group_name", ""),
                    cells = cells
                )
            }
            Triple(columns, rows, applicableValues)
        } catch (e: Exception) {
            Triple(emptyList<ColumnModel>(), emptyList<RowModel>(), emptyList<ValueModel>())
        }
    }

    val columnsList = tableData.first
    val rowsList = tableData.second
    val applicableValuesList = tableData.third

    // Selected Row GRP for expanding into the rich hardware details sub-table below the main table
    var selectedGroupIdForSubTable by remember { mutableStateOf<String?>(null) }

    // Active Selection Choice (H1, H2, Q1, Def etc.)
    var activeSelectVal by remember { mutableStateOf("H1") }
    var expandedFabMenu by remember { mutableStateOf(false) }

    // Pinch-to-zoom factor support (replaces XML library Zoom behavior natively on GPU layers)
    var zoomScale by remember { mutableStateOf(1.0f) }
    val transformState = rememberTransformableState { zoomChange, _, _ ->
        zoomScale = (zoomScale * zoomChange).coerceIn(0.6f, 1.8f)
    }

    // Synchronize default selection value based on loaded definitions
    LaunchedEffect(applicableValuesList) {
        if (applicableValuesList.isNotEmpty()) {
            activeSelectVal = applicableValuesList.first().value
        }
    }

    val totalColumns = columnsList.size

    // Single horizontal and vertical scroll state for perfect 2D diagonal scrolling without lag/drift!
    val horizontalScrollState = rememberScrollState()
    val verticalScrollState = rememberScrollState()

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
                                applicableValuesList.forEach { valModel ->
                                    val isSelected = activeSelectVal == valModel.value

                                    Box(
                                        modifier = Modifier
                                            .background(
                                                color = if (isSelected) {
                                                    if (valModel.isDefect) IndustrialError else IndustrialPrimary
                                                } else {
                                                    if (valModel.isDefect) IndustrialErrorContainer.copy(alpha = 0.4f) else LightSurfaceLow
                                                },
                                                shape = RoundedCornerShape(20.dp)
                                            )
                                            .border(
                                                width = 1.dp,
                                                color = if (isSelected) Color.Transparent else IndustrialOutlineVariant,
                                                shape = RoundedCornerShape(20.dp)
                                            )
                                            .clickable {
                                                activeSelectVal = valModel.value
                                                expandedFabMenu = false
                                            }
                                            .padding(horizontal = 14.dp, vertical = 8.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = valModel.label,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 12.sp,
                                            color = if (isSelected) Color.White else {
                                                if (valModel.isDefect) IndustrialError else IndustrialOnSurface
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
                            applicableValuesList.find { it.value == activeSelectVal }?.let {
                                activeLabel = it.label
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
                    .padding(14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(text = clientName, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Box(modifier = Modifier.background(IndustrialSecondaryContainer, RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 2.dp)) {
                            Text(text = systemType, color = IndustrialOnSecondaryContainer, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Text(text = "Intervall: $intervalText", color = IndustrialOutline, fontSize = 12.sp)
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

            // High Performance Zoom & Reset bar for instant resizing of high-density grids
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White)
                    .border(1.dp, IndustrialOutlineVariant)
                    .padding(horizontal = 14.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.ZoomIn,
                        contentDescription = null,
                        tint = IndustrialOutline,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = "Zoom: ${(zoomScale * 100).toInt()}%",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = IndustrialOnSurface
                    )
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = { zoomScale = (zoomScale - 0.1f).coerceIn(0.6f, 1.8f) },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Text("-", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = IndustrialPrimary)
                    }
                    Button(
                        onClick = { zoomScale = 1.0f },
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 2.dp),
                        modifier = Modifier.height(26.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = LightSurfaceHigh, contentColor = IndustrialPrimary)
                    ) {
                        Text("Reset", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                    IconButton(
                        onClick = { zoomScale = (zoomScale + 0.1f).coerceIn(0.6f, 1.8f) },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Text("+", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = IndustrialPrimary)
                    }
                }
            }

            // Scrollable Grid Box container restricting scaling artifacts from bleeding
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .clipToBounds()
                    .transformable(state = transformState)
            ) {
                // Dimensions dynamically scaled at layout-level by zoomScale to resolve all scroll issues
                val cellWidth = (72 * zoomScale).dp
                val cellHeight = (48 * zoomScale).dp
                val groupCellWidth = (100 * zoomScale).dp
                val headerRowHeight = (44 * zoomScale).dp

                val headerFontSize = (12 * zoomScale).sp
                val cellFontSize = (11 * zoomScale).sp
                val subFontSize = (8 * zoomScale).sp

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(verticalScrollState)
                        .horizontalScroll(horizontalScrollState)
                ) {
                    Column(
                        modifier = Modifier
                            .width(groupCellWidth + (columnsList.size * cellWidth))
                    ) {
                        // Row 0: Header Row (GRP Corner + Dynamic Columns Headers)
                        Row(
                            modifier = Modifier
                                .height(headerRowHeight)
                                .graphicsLayer {
                                    translationY = verticalScrollState.value.toFloat()
                                }
                                .zIndex(2f)
                        ) {
                            // First cell: "GRP" Corner Cell (translated vertically & horizontally)
                            Box(
                                modifier = Modifier
                                    .width(groupCellWidth)
                                    .height(headerRowHeight)
                                    .background(LightSurfaceHigh)
                                    .graphicsLayer {
                                        translationX = horizontalScrollState.value.toFloat()
                                    }
                                    .zIndex(3f)
                                    .border(0.5.dp, IndustrialOutlineVariant)
                                    .padding(horizontal = 12.dp),
                                contentAlignment = Alignment.CenterStart
                            ) {
                                Text(
                                    text = "GRP",
                                    fontWeight = FontWeight.ExtraBold,
                                    color = IndustrialOutline,
                                    fontSize = headerFontSize
                                )
                            }

                            // Dynamic slot columns definitions
                            columnsList.forEach { colModel ->
                                Box(
                                    modifier = Modifier
                                        .width(cellWidth)
                                        .height(headerRowHeight)
                                        .background(LightSurfaceHigh)
                                        .border(0.5.dp, IndustrialOutlineVariant),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = colModel.label,
                                        fontWeight = FontWeight.Bold,
                                        color = IndustrialOnSurface,
                                        fontSize = headerFontSize
                                    )
                                }
                            }
                        }

                        // Data Rows
                        rowsList.forEach { row ->
                            Row(
                                modifier = Modifier.height(cellHeight)
                            ) {
                                // Left Column Cell: GroupHeaderCell (translated horizontally)
                                val isSelected = selectedGroupIdForSubTable == row.groupId
                                Box(
                                    modifier = Modifier
                                        .width(groupCellWidth)
                                        .height(cellHeight)
                                        .graphicsLayer {
                                            translationX = horizontalScrollState.value.toFloat()
                                        }
                                        .zIndex(1f)
                                        .background(if (isSelected) IndustrialSecondaryContainer.copy(alpha = 0.35f) else LightSurfaceLow)
                                        .border(0.5.dp, IndustrialOutlineVariant)
                                        .clickable {
                                            // Highlight column / toggle sub-table visibility
                                            selectedGroupIdForSubTable = if (isSelected) null else row.groupId

                                            // Robust Group click toggle mark/unmark cell behavior requested:
                                            if (!protocolEntity.isArchived) {
                                                val validCells = row.cells.filter { it.detectorType != "-" }
                                                val allMatchingActive = validCells.isNotEmpty() && validCells.all { it.value == activeSelectVal }

                                                // Toggle state values: if all are marked with active select, unmark them, otherwise mark all!
                                                val writeVal = if (allMatchingActive) "" else activeSelectVal
                                                val batchValues = validCells.associate { it.slotKey to writeVal }

                                                if (batchValues.isNotEmpty()) {
                                                    viewModel.batchEditGroupCells(protocolId, row.groupId, batchValues)
                                                }
                                            }
                                        }
                                        .padding(horizontal = 12.dp, vertical = 8.dp),
                                    contentAlignment = Alignment.CenterStart
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size((6 * zoomScale).dp)
                                                .background(if (isSelected) IndustrialPrimary else Color.Transparent, RoundedCornerShape(3.dp))
                                        )
                                        Text(
                                            text = row.groupId,
                                            fontWeight = FontWeight.Bold,
                                            color = if (isSelected) IndustrialPrimary else IndustrialPrimary.copy(alpha = 0.8f),
                                            fontSize = cellFontSize
                                        )
                                    }
                                }

                                // Central Interactive Grid Cells of this row
                                row.cells.forEach { cell ->
                                    val cellVal = cell.value
                                    val detectorType = cell.detectorType
                                    val isDisabled = detectorType == "-"

                                    Box(
                                        modifier = Modifier
                                            .width(cellWidth)
                                            .height(cellHeight)
                                            .background(
                                                if (isDisabled) LightSurfaceLow 
                                                else if (cellVal.isNotEmpty()) {
                                                    if (cellVal == "Def." || cellVal.lowercase().contains("def")) IndustrialErrorContainer 
                                                    else IndustrialPrimaryContainer.copy(alpha = 0.12f)
                                                } else Color.White
                                            )
                                            .border(0.5.dp, IndustrialOutlineVariant)
                                            .clickable(enabled = !isDisabled && !protocolEntity.isArchived) {
                                                val writeText = if (cellVal == activeSelectVal) "" else activeSelectVal
                                                viewModel.editCell(protocolId, row.groupId, cell.slotKey, writeText)
                                            },
                                        contentAlignment = Alignment.Center
                                    ) {
                                        if (isDisabled) {
                                            Text(text = "-", color = IndustrialOutline.copy(alpha = 0.5f), fontSize = cellFontSize)
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
                                                        modifier = Modifier.size((10 * zoomScale).dp)
                                                    )
                                                    Text(
                                                        text = "DEF.",
                                                        color = IndustrialError,
                                                        fontWeight = FontWeight.ExtraBold,
                                                        fontSize = cellFontSize
                                                    )
                                                }
                                            } else {
                                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                                    Text(
                                                        text = cellVal,
                                                        color = IndustrialPrimary,
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = cellFontSize
                                                    )
                                                    Text(
                                                        text = detectorType,
                                                        color = IndustrialOutline,
                                                        fontSize = subFontSize,
                                                        fontWeight = FontWeight.Light
                                                    )
                                                }
                                            }
                                        } else {
                                            Text(
                                                text = detectorType,
                                                color = IndustrialOutline.copy(alpha = 0.7f),
                                                fontSize = cellFontSize
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 3. SUB-TABLES HARDWARE DETAIL OVERLAY (Displays customized column weights underneath main grid)
            selectedGroupIdForSubTable?.let { targetId ->
                rowsList.find { it.groupId == targetId }?.let { activeRow ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.dp, IndustrialOutlineVariant),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = "Subtabelle: Hardware-Matrix Gruppe ${activeRow.groupId}",
                                        style = MaterialTheme.typography.titleSmall,
                                        color = IndustrialPrimary,
                                        fontWeight = FontWeight.Bold
                                    )
                                    if (activeRow.groupName.isNotEmpty()) {
                                        Text(text = "Montageort: ${activeRow.groupName}", color = IndustrialOutline, fontSize = 11.sp)
                                    }
                                }
                                IconButton(modifier = Modifier.size(24.dp), onClick = { selectedGroupIdForSubTable = null }) {
                                    Icon(Icons.Default.Close, contentDescription = "Schließen", tint = IndustrialOutline)
                                }
                            }

                            // Subtable column headers
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(LightSurfaceHigh)
                                    .border(1.dp, IndustrialOutlineVariant)
                                    .padding(vertical = 6.dp, horizontal = 10.dp)
                            ) {
                                Text(text = "Slot", modifier = Modifier.weight(1.5f), fontWeight = FontWeight.Bold, fontSize = 11.sp, color = IndustrialOnSurface)
                                Text(text = "Typ", modifier = Modifier.weight(1.5f), fontWeight = FontWeight.Bold, fontSize = 11.sp, color = IndustrialOnSurface)
                                Text(text = "Status", modifier = Modifier.weight(3.0f), fontWeight = FontWeight.Bold, fontSize = 11.sp, color = IndustrialOnSurface)
                                Text(text = "Aktion", modifier = Modifier.weight(2.0f), fontWeight = FontWeight.Bold, fontSize = 11.sp, color = IndustrialOnSurface)
                            }

                            // Limited subtable details to prevent screen crowding
                            activeRow.cells.forEach { cell ->
                                val isDisabled = cell.detectorType == "-"
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .border(0.5.dp, IndustrialOutlineVariant)
                                        .background(if (isDisabled) LightSurfaceLow else Color.White)
                                        .padding(vertical = 8.dp, horizontal = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "Index ${cell.slotKey}",
                                        modifier = Modifier.weight(1.5f),
                                        fontWeight = FontWeight.SemiBold,
                                        fontSize = 11.sp,
                                        color = if (isDisabled) IndustrialOutline else IndustrialOnSurface
                                    )
                                    Text(
                                        text = cell.detectorType,
                                        modifier = Modifier.weight(1.5f),
                                        fontSize = 11.sp,
                                        color = if (isDisabled) IndustrialOutline else IndustrialPrimary
                                    )
                                    Box(modifier = Modifier.weight(3.0f)) {
                                        if (isDisabled) {
                                            Text(text = "Spalte deaktiviert", fontSize = 10.sp, color = IndustrialOutline)
                                        } else if (cell.value.isEmpty()) {
                                            Text(text = "Nicht ausgelöst", fontSize = 10.sp, color = IndustrialOutline, fontWeight = FontWeight.Medium)
                                        } else {
                                            val isDef = cell.value == "Def."
                                            Box(
                                                modifier = Modifier
                                                    .background(
                                                        if (isDef) IndustrialErrorContainer else IndustrialPrimaryContainer.copy(alpha = 0.2f),
                                                        RoundedCornerShape(4.dp)
                                                    )
                                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                                            ) {
                                                Text(
                                                    text = if (isDef) "DEFEKT" else "OK (${cell.value})",
                                                    color = if (isDef) IndustrialError else IndustrialPrimary,
                                                    fontSize = 9.sp,
                                                    fontWeight = FontWeight.Bold
                                                )
                                            }
                                        }
                                    }
                                    
                                    Box(
                                        modifier = Modifier.weight(2.0f),
                                        contentAlignment = Alignment.CenterStart
                                    ) {
                                        if (!isDisabled && !protocolEntity.isArchived) {
                                            Box(
                                                modifier = Modifier
                                                    .background(LightSurfaceHigh, RoundedCornerShape(4.dp))
                                                    .border(0.5.dp, IndustrialOutlineVariant, RoundedCornerShape(4.dp))
                                                    .clickable {
                                                        val nextVal = if (cell.value == activeSelectVal) "" else activeSelectVal
                                                        viewModel.editCell(protocolId, activeRow.groupId, cell.slotKey, nextVal)
                                                    }
                                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                                            ) {
                                                Text(
                                                    text = "Tippen",
                                                    fontSize = 10.sp,
                                                    color = IndustrialPrimary,
                                                    fontWeight = FontWeight.Bold
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

// ---------------- High Performance Stable Nested Layout Models ----------------

data class ColumnModel(val key: String, val label: String)
data class CellModel(val slotKey: String, val detectorType: String, val value: String)
data class RowModel(val groupId: String, val groupName: String, val cells: List<CellModel>)
data class ValueModel(val value: String, val label: String, val isDefect: Boolean)

// ---------------- Isolated Composable Elements avoiding whole-screen recompositions ----------------

@Composable
fun TableHeaderCell(label: String) {
    Box(
        modifier = Modifier
            .width(72.dp)
            .fillMaxHeight()
            .border(0.5.dp, IndustrialOutlineVariant),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            fontWeight = FontWeight.Bold,
            color = IndustrialOnSurface,
            fontSize = 13.sp
        )
    }
}

@Composable
fun GroupHeaderCell(
    groupId: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .width(100.dp)
            .height(48.dp)
            .background(if (isSelected) IndustrialSecondaryContainer.copy(alpha = 0.35f) else LightSurfaceLow)
            .border(0.5.dp, IndustrialOutlineVariant)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .background(if (isSelected) IndustrialPrimary else Color.Transparent, RoundedCornerShape(3.dp))
            )
            Text(
                text = groupId,
                fontWeight = FontWeight.Bold,
                color = if (isSelected) IndustrialPrimary else IndustrialPrimary.copy(alpha = 0.8f),
                fontSize = 12.sp
            )
        }
    }
}

@Composable
fun GridInteractiveCell(
    cell: CellModel,
    isArchived: Boolean,
    activeSelectVal: String,
    onClick: () -> Unit
) {
    val cellVal = cell.value
    val detectorType = cell.detectorType
    val isDisabled = detectorType == "-"

    Box(
        modifier = Modifier
            .width(72.dp)
            .height(48.dp)
            .background(
                if (isDisabled) LightSurfaceLow 
                else if (cellVal.isNotEmpty()) {
                    if (cellVal == "Def." || cellVal.lowercase().contains("def")) IndustrialErrorContainer 
                    else IndustrialPrimaryContainer.copy(alpha = 0.12f)
                } else Color.White
            )
            .border(0.5.dp, IndustrialOutlineVariant)
            .clickable(enabled = !isDisabled && !isArchived) { onClick() },
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
