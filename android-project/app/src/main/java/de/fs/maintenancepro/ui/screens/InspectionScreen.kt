package de.fs.maintenancepro.ui.screens

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.fs.maintenancepro.R
import de.fs.maintenancepro.data.local.GroupCellEntity
import de.fs.maintenancepro.data.local.ProtocolGroupEntity
import de.fs.maintenancepro.ui.theme.*
import de.fs.maintenancepro.ui.viewmodel.MainViewModel
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import org.json.JSONArray

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

    // Rows/cells come straight from the normalized Room tables (protocol_groups/group_cells) via
    // reactive Flow — no JSON parsing on the render hot path at all anymore. Nullable initial
    // state (instead of emptyList()) lets us tell "not loaded yet" apart from "genuinely empty".
    var groupsStateOrNull by remember(protocolId) { mutableStateOf<List<ProtocolGroupEntity>?>(null) }
    var cellsStateOrNull by remember(protocolId) { mutableStateOf<List<GroupCellEntity>?>(null) }
    LaunchedEffect(protocolId) {
        viewModel.getGroupsFlow(protocolId).collect { groupsStateOrNull = it }
    }
    LaunchedEffect(protocolId) {
        viewModel.getCellsFlow(protocolId).collect { cellsStateOrNull = it }
    }

    val groupsState = groupsStateOrNull
    val cellsState = cellsStateOrNull
    if (groupsState == null || cellsState == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    val clientName = protocolEntity.name
    val systemType = protocolEntity.systemType

    val intervalText = remember(groupsState, protocolEntity.interval) {
        // TAIFUN imports set anlage_interval on the row (e.g. "Quartalsweise") but leave the
        // contract-level interval at the default "Halbjährlich". Prefer row-level value.
        groupsState.firstOrNull()?.anlageInterval?.takeIf { it.isNotBlank() }
            ?: protocolEntity.interval.ifBlank { "Jährlich" }
    }

    // Columns are small, structural, rarely-changing metadata — cheap to parse synchronously.
    val columnsList = remember(protocolEntity.columnsJson) {
        try {
            val arr = JSONArray(protocolEntity.columnsJson)
            List(arr.length()) { i ->
                val o = arr.getJSONObject(i)
                ColumnModel(o.getString("key"), o.getString("label"))
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    val rowsList = remember(groupsState, cellsState) {
        val cellsByGroup = cellsState.groupBy { it.groupId }
        groupsState.mapNotNull { g ->
            val cells = cellsByGroup[g.groupId]?.map { c -> CellModel(c.slotKey, c.detectorType, c.value) } ?: emptyList()
            if (cells.isEmpty()) null
            else RowModel(
                groupId = g.groupId,
                groupName = g.groupName.ifBlank { g.anlageName ?: "" },
                cells = cells
            )
        }
    }

    // Optimistic local overlay: cell edits render instantly here, DB write happens in background.
    // Key = "groupId::slotKey". Even though the DB write is now a fast targeted UPDATE (not a
    // whole-blob rewrite), Flow emission + recomposition still isn't perceptibly instant, so this
    // overlay keeps taps feeling immediate.
    val pendingOverrides = remember { mutableStateMapOf<String, String>() }

    // Once the DB confirms an override's value via the Flow, drop it from the overlay.
    LaunchedEffect(cellsState) {
        if (pendingOverrides.isEmpty()) return@LaunchedEffect
        val cellMap = cellsState.associateBy { "${it.groupId}::${it.slotKey}" }
        val toRemove = mutableListOf<String>()
        for ((key, overrideVal) in pendingOverrides) {
            val cell = cellMap[key]
            if (cell == null || cell.value == overrideVal) toRemove.add(key)
        }
        toRemove.forEach { pendingOverrides.remove(it) }
    }

    // Fill progress across all active (non-disabled) detector slots, including
    // not-yet-persisted optimistic overlay edits so the bar updates instantly while tapping.
    var totalActiveCells = 0
    var filledActiveCells = 0
    rowsList.forEach { row ->
        row.cells.forEach { cell ->
            if (cell.detectorType != "-") {
                totalActiveCells++
                val overrideVal = pendingOverrides["${row.groupId}::${cell.slotKey}"]
                if ((overrideVal ?: cell.value).isNotEmpty()) filledActiveCells++
            }
        }
    }
    val fillProgress = if (totalActiveCells > 0) filledActiveCells.toFloat() / totalActiveCells else 0f

    // Derive period-based applicable values from interval, ignoring server-provided list
    val (periodValues, defaultPeriod) = remember(intervalText) {
        val month = java.util.Calendar.getInstance().get(java.util.Calendar.MONTH) + 1
        when {
            intervalText.contains("Vierteljährlich", ignoreCase = true) ||
            intervalText.contains("Quartalsweise", ignoreCase = true) ||
            intervalText.contains("Quartal", ignoreCase = true) -> {
                val q = (month - 1) / 3 + 1
                listOf(
                    ValueModel("Q1", "Q1", false), ValueModel("Q2", "Q2", false),
                    ValueModel("Q3", "Q3", false), ValueModel("Q4", "Q4", false),
                    ValueModel("Def.", "Def.", true)
                ) to "Q$q"
            }
            intervalText.contains("Halbjährlich", ignoreCase = true) -> {
                val h = if (month <= 6) "H1" else "H2"
                listOf(
                    ValueModel("H1", "H1", false), ValueModel("H2", "H2", false),
                    ValueModel("Def.", "Def.", true)
                ) to h
            }
            else -> { // Jährlich, Monatlich oder unbekannt → J + Def.
                listOf(ValueModel("J", "J", false), ValueModel("Def.", "Def.", true)) to "J"
            }
        }
    }

    // Selected Row GRP for expanding into the rich hardware details sub-table below the main table
    var selectedGroupIdForSubTable by remember { mutableStateOf<String?>(null) }

    // Active Selection Choice — preselected to the current period (Q3 in Jul-Sep, H2 in Jul-Dec, etc.)
    var activeSelectVal by remember(defaultPeriod) { mutableStateOf(defaultPeriod) }
    var expandedFabMenu by remember { mutableStateOf(false) }

    // Pinch-to-zoom factor support (replaces XML library Zoom behavior natively on GPU layers)
    var zoomScale by remember { mutableStateOf(1.0f) }
    val transformState = rememberTransformableState { zoomChange, _, _ ->
        zoomScale = (zoomScale * zoomChange).coerceIn(0.6f, 1.8f)
    }

    val totalColumns = columnsList.size

    val density = LocalDensity.current
    val hapticFeedback = LocalHapticFeedback.current

    // Cell pixel dimensions (updated when zoomScale changes for drag-select coordinate math)
    val cellWidthPx = with(density) { (72f * zoomScale).dp.toPx() }
    val cellHeightPx = with(density) { (48f * zoomScale).dp.toPx() }

    // Always-current references for use inside long-lived pointerInput coroutine
    val currentRowsList = rememberUpdatedState(rowsList)
    val currentActiveVal = rememberUpdatedState(activeSelectVal)
    val currentCellWidthPx = rememberUpdatedState(cellWidthPx)
    val currentCellHeightPx = rememberUpdatedState(cellHeightPx)

    // Rubber-band drag-select state
    var isDragSelecting by remember { mutableStateOf(false) }
    var isClearMode by remember { mutableStateOf(false) } // decided once from the origin cell at drag-start
    var dragSelStartGrid by remember { mutableStateOf(Offset.Zero) }
    var dragSelEndGrid by remember { mutableStateOf(Offset.Zero) }
    var dragScrollX by remember { mutableStateOf(0f) }
    var dragScrollY by remember { mutableStateOf(0f) }

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
                                periodValues.forEach { valModel ->
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
                            val activeLabel = periodValues.find { it.value == activeSelectVal }?.label ?: activeSelectVal
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

                if (!protocolEntity.isArchived) {
                    var showAbschliessenDialog by remember { mutableStateOf(false) }

                    Button(
                        onClick = { showAbschliessenDialog = true },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF15803D), contentColor = Color.White),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Abschließen", fontWeight = FontWeight.Bold)
                    }

                    if (showAbschliessenDialog) {
                        AlertDialog(
                            onDismissRequest = { showAbschliessenDialog = false },
                            title = { Text("Protokoll abschließen?") },
                            text = { Text("Alle Einträge werden zum Server übertragen und das Protokoll als erledigt markiert.") },
                            confirmButton = {
                                Button(
                                    onClick = {
                                        showAbschliessenDialog = false
                                        viewModel.synchronizeProtocol(protocolId)
                                        onNavigateBack()
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF15803D))
                                ) { Text("Abschließen") }
                            },
                            dismissButton = {
                                TextButton(onClick = { showAbschliessenDialog = false }) {
                                    Text("Abbrechen")
                                }
                            }
                        )
                    }
                }
            }

            // Fill-progress bar (left) + Zoom & Reset controls (right)
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
                    modifier = Modifier.weight(1f).padding(end = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    LinearProgressIndicator(
                        progress = { fillProgress },
                        modifier = Modifier.weight(1f).height(6.dp).clip(RoundedCornerShape(3.dp)),
                        color = IndustrialPrimary,
                        trackColor = LightSurfaceHigh
                    )
                    Text(
                        text = "${(fillProgress * 100).toInt()}%",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = IndustrialOnSurface
                    )
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.ZoomIn,
                        contentDescription = null,
                        tint = IndustrialOutline,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = "${(zoomScale * 100).toInt()}%",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = IndustrialOnSurface
                    )
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
            Row(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .clipToBounds()
                    .transformable(state = transformState)
            ) {
                // Dimensions dynamically scaled at layout-level by zoomScale to resolve all scroll issues
                val cellWidth = (72 * zoomScale).dp
                val cellHeight = (48 * zoomScale).dp
                val grpColWidth = (44 * zoomScale).dp        // frozen: group number only
                val bezeichnungColWidth = (110 * zoomScale).dp  // frozen: group name
                val headerRowHeight = (44 * zoomScale).dp

                val headerFontSize = (12 * zoomScale).sp
                val cellFontSize = (11 * zoomScale).sp
                val subFontSize = (8 * zoomScale).sp

                // 1. LEFT FROZEN COLUMNS: GRP (number) + Bezeichnung (name), both non-scrolling horizontally
                Row(modifier = Modifier.fillMaxHeight()) {
                    // 1a. GRP column — narrow, shows group number only
                    Column(modifier = Modifier.width(grpColWidth).fillMaxHeight()) {
                        Box(
                            modifier = Modifier.width(grpColWidth).height(headerRowHeight)
                                .background(LightSurfaceHigh).border(0.5.dp, IndustrialOutlineVariant),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("GRP", fontWeight = FontWeight.ExtraBold, color = IndustrialOutline, fontSize = headerFontSize)
                        }
                        Column(modifier = Modifier.width(grpColWidth).weight(1f).verticalScroll(verticalScrollState)) {
                            rowsList.forEach { row ->
                                Box(
                                    modifier = Modifier.width(grpColWidth).height(cellHeight)
                                        .background(LightSurfaceLow).border(0.5.dp, IndustrialOutlineVariant),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        // row.groupId is "{device}::{grp_num}" on the wire -- only the
                                        // Gruppen-Nummer is meaningful to show in this narrow column.
                                        text = row.groupId.substringAfterLast("::"),
                                        fontWeight = FontWeight.Bold,
                                        color = IndustrialPrimary,
                                        fontSize = cellFontSize
                                    )
                                }
                            }
                        }
                    }

                    // 1b. Bezeichnung column — shows group name, clickable for batch-fill
                    Column(modifier = Modifier.width(bezeichnungColWidth).fillMaxHeight()) {
                        Box(
                            modifier = Modifier.width(bezeichnungColWidth).height(headerRowHeight)
                                .background(LightSurfaceHigh).border(0.5.dp, IndustrialOutlineVariant)
                                .padding(horizontal = 8.dp),
                            contentAlignment = Alignment.CenterStart
                        ) {
                            Text("Bezeichnung", fontWeight = FontWeight.ExtraBold, color = IndustrialOutline, fontSize = headerFontSize)
                        }
                        Column(modifier = Modifier.width(bezeichnungColWidth).weight(1f).verticalScroll(verticalScrollState)) {
                            rowsList.forEach { row ->
                                Box(
                                    modifier = Modifier
                                        .width(bezeichnungColWidth).height(cellHeight)
                                        .background(LightSurfaceLow).border(0.5.dp, IndustrialOutlineVariant)
                                        .clickable {
                                            if (!protocolEntity.isArchived) {
                                                val validCells = row.cells.filter { it.detectorType != "-" }
                                                val targetCells = validCells.filter { it.value.isEmpty() || it.value == activeSelectVal }
                                                val hasEmptyTargets = targetCells.any { it.value.isEmpty() }
                                                val batchValues = if (hasEmptyTargets) {
                                                    targetCells.filter { it.value.isEmpty() }.associate { it.slotKey to activeSelectVal }
                                                } else {
                                                    targetCells.filter { it.value == activeSelectVal }.associate { it.slotKey to "" }
                                                }
                                                if (batchValues.isNotEmpty()) {
                                                    viewModel.batchEditGroupCells(protocolId, row.groupId, batchValues)
                                                } else {
                                                    Toast.makeText(context, "Keine änderbaren Felder in dieser Reihe", Toast.LENGTH_SHORT).show()
                                                }
                                            }
                                        }
                                        .padding(horizontal = 8.dp, vertical = 6.dp),
                                    contentAlignment = Alignment.CenterStart
                                ) {
                                    Text(
                                        text = row.groupName.ifBlank { "—" },
                                        color = IndustrialOnSurface,
                                        fontSize = cellFontSize,
                                        maxLines = 2
                                    )
                                }
                            }
                        }
                    }
                }

                // 2. RIGHT SIDE: Scrollable columns header + scrollable 2D grid cells
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                ) {
                    // Column Headers (Scrolls only horizontally, matches main grid horizontal scroll)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(headerRowHeight)
                            .horizontalScroll(horizontalScrollState)
                    ) {
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

                    // Main Interactive 2D Grid Cells — outer Box handles rubber-band drag-select
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f)
                            .pointerInput(zoomScale, protocolEntity.isArchived) {
                                if (protocolEntity.isArchived) return@pointerInput
                                detectDragGesturesAfterLongPress(
                                    onDragStart = { offset ->
                                        hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                                        dragScrollX = horizontalScrollState.value.toFloat()
                                        dragScrollY = verticalScrollState.value.toFloat()
                                        val gx = offset.x + dragScrollX
                                        val gy = offset.y + dragScrollY
                                        dragSelStartGrid = Offset(gx, gy)
                                        dragSelEndGrid = Offset(gx, gy)

                                        // Mode is decided ONCE from the origin cell: already-filled origin
                                        // means the gesture clears matching cells, empty origin means it fills.
                                        val wPx = currentCellWidthPx.value
                                        val hPx = currentCellHeightPx.value
                                        val originRow = (gy / hPx).toInt()
                                        val originCol = (gx / wPx).toInt()
                                        val rows = currentRowsList.value
                                        val originRowModel = rows.getOrNull(originRow)
                                        val originCell = originRowModel?.cells?.getOrNull(originCol)
                                        val originVal = originCell?.let { c ->
                                            pendingOverrides["${originRowModel.groupId}::${c.slotKey}"] ?: c.value
                                        } ?: ""
                                        isClearMode = originCell != null && originCell.detectorType != "-" && originVal.isNotEmpty()

                                        isDragSelecting = true
                                    },
                                    onDrag = { change, _ ->
                                        change.consume()
                                        dragSelEndGrid = Offset(
                                            change.position.x + dragScrollX,
                                            change.position.y + dragScrollY
                                        )
                                    },
                                    onDragEnd = {
                                        isDragSelecting = false
                                        val selLeft = min(dragSelStartGrid.x, dragSelEndGrid.x)
                                        val selRight = max(dragSelStartGrid.x, dragSelEndGrid.x)
                                        val selTop = min(dragSelStartGrid.y, dragSelEndGrid.y)
                                        val selBottom = max(dragSelStartGrid.y, dragSelEndGrid.y)
                                        val wPx = currentCellWidthPx.value
                                        val hPx = currentCellHeightPx.value
                                        val fillVal = currentActiveVal.value
                                        val clearMode = isClearMode
                                        val allChanges = mutableMapOf<String, MutableMap<String, String>>()
                                        var applied = 0
                                        currentRowsList.value.forEachIndexed { rowIdx, row ->
                                            val cTop = rowIdx * hPx
                                            val cBottom = cTop + hPx
                                            if (cTop < selBottom && cBottom > selTop) {
                                                row.cells.forEachIndexed { colIdx, cell ->
                                                    if (cell.detectorType != "-") {
                                                        val cLeft = colIdx * wPx
                                                        val cRight = cLeft + wPx
                                                        if (cLeft < selRight && cRight > selLeft) {
                                                            val key = "${row.groupId}::${cell.slotKey}"
                                                            val curVal = pendingOverrides[key] ?: cell.value
                                                            val newVal: String? = if (clearMode) {
                                                                // Only clear cells matching the active period; protect other periods' entries
                                                                if (curVal == fillVal) "" else null
                                                            } else {
                                                                // Only fill empty cells; protect already-filled (other period) entries
                                                                if (curVal.isEmpty()) fillVal else null
                                                            }
                                                            if (newVal != null) {
                                                                pendingOverrides[key] = newVal
                                                                allChanges.getOrPut(row.groupId) { mutableMapOf() }[cell.slotKey] = newVal
                                                                applied++
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        viewModel.batchEditMultiGroupCells(protocolId, allChanges)
                                        if (applied > 0) {
                                            val msg = if (clearMode) "$applied Melder zurückgesetzt" else "$applied Melder auf $fillVal gesetzt"
                                            Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                                        }
                                    },
                                    onDragCancel = { isDragSelecting = false }
                                )
                            }
                    ) {
                        // Inner scrollable grid
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .fillMaxHeight()
                                .verticalScroll(verticalScrollState)
                                .horizontalScroll(horizontalScrollState)
                        ) {
                            Column {
                                rowsList.forEach { row ->
                                    Row(modifier = Modifier.height(cellHeight)) {
                                        row.cells.forEach { cell ->
                                            key(row.groupId, cell.slotKey) {
                                                val overrideKey = "${row.groupId}::${cell.slotKey}"
                                                // Read override first: instant visual feedback without waiting for DB round-trip
                                                val cellVal = pendingOverrides[overrideKey] ?: cell.value
                                                DetectorCell(
                                                    cellVal = cellVal,
                                                    detectorType = cell.detectorType,
                                                    cellWidth = cellWidth,
                                                    cellHeight = cellHeight,
                                                    cellFontSize = cellFontSize,
                                                    subFontSize = subFontSize,
                                                    zoomScale = zoomScale,
                                                    enabled = !protocolEntity.isArchived,
                                                    onClick = {
                                                        if (cellVal.isEmpty()) {
                                                            pendingOverrides[overrideKey] = activeSelectVal
                                                            viewModel.editCell(protocolId, row.groupId, cell.slotKey, activeSelectVal)
                                                        } else if (cellVal == activeSelectVal) {
                                                            pendingOverrides[overrideKey] = ""
                                                            viewModel.editCell(protocolId, row.groupId, cell.slotKey, "")
                                                        } else {
                                                            Toast.makeText(context, "Melder geschützt geprüft ($cellVal).", Toast.LENGTH_SHORT).show()
                                                        }
                                                    }
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Selection overlay — always in tree so ALL state reads happen in DrawScope.
                        // DrawScope state reads → only Canvas redraws, zero cell recomposition.
                        Canvas(modifier = Modifier.matchParentSize()) {
                            if (!isDragSelecting) return@Canvas
                            val selLeft = min(dragSelStartGrid.x, dragSelEndGrid.x)
                            val selRight = max(dragSelStartGrid.x, dragSelEndGrid.x)
                            val selTop = min(dragSelStartGrid.y, dragSelEndGrid.y)
                            val selBottom = max(dragSelStartGrid.y, dragSelEndGrid.y)
                            val modeColor = if (isClearMode) Color(0xFFDC2626) else Color(0xFF2563EB)

                            // Cell-snapped filled highlight
                            val colStart = floor(selLeft / cellWidthPx).toInt().coerceAtLeast(0)
                            val colEnd = ceil(selRight / cellWidthPx).toInt()
                            val rowStart = floor(selTop / cellHeightPx).toInt().coerceAtLeast(0)
                            val rowEnd = ceil(selBottom / cellHeightPx).toInt()
                            val snapLeft = (colStart * cellWidthPx - dragScrollX).coerceAtLeast(0f)
                            val snapTop = (rowStart * cellHeightPx - dragScrollY).coerceAtLeast(0f)
                            val snapRight = colEnd * cellWidthPx - dragScrollX
                            val snapBottom = rowEnd * cellHeightPx - dragScrollY
                            if (snapRight > snapLeft && snapBottom > snapTop) {
                                drawRect(
                                    color = modeColor.copy(alpha = 0.18f),
                                    topLeft = Offset(snapLeft, snapTop),
                                    size = Size(snapRight - snapLeft, snapBottom - snapTop)
                                )
                            }

                            // Dashed rubber-band border (actual drag extent)
                            val w = selRight - selLeft
                            val h = selBottom - selTop
                            if (w > 4f && h > 4f) {
                                drawRect(
                                    color = modeColor,
                                    topLeft = Offset(selLeft - dragScrollX, selTop - dragScrollY),
                                    size = Size(w, h),
                                    style = Stroke(
                                        width = 2.dp.toPx(),
                                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 5f))
                                    )
                                )
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

// Extracted so each detector cell is its own skippable recompose scope — without this, Row/Column/Box
// (all inline in Compose foundation) flatten the whole grid into one scope, so a single cell edit
// would recompose every cell in the table instead of just the one that changed.
@Composable
private fun DetectorCell(
    cellVal: String,
    detectorType: String,
    cellWidth: Dp,
    cellHeight: Dp,
    cellFontSize: TextUnit,
    subFontSize: TextUnit,
    zoomScale: Float,
    enabled: Boolean,
    onClick: () -> Unit
) {
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
            .clickable(
                interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                indication = null,
                enabled = !isDisabled && enabled,
                onClick = onClick
            ),
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
                        modifier = Modifier.size((11 * zoomScale).dp)
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
