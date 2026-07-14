package de.fs.maintenancepro.ui.screens

import android.widget.Toast
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
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
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
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

    // WebUI-configured Zellfarben for this protocol's Anlagentyp -- same global,
    // protocol-independent cache MatrixEditScreen reads (MainViewModel.getMeldepunktMeta),
    // refreshed via the "Anlagentypen neu laden" button. Empty (falls back to
    // DetectorCell's own muted styling) until that button has ever been pressed.
    val configuredColors = remember(systemType) {
        viewModel.getMeldepunktMeta(systemType)?.colors ?: emptyMap()
    }

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

    // Wide layout (tablet, or a phone rotated to landscape) has room to keep the Aktion-
    // Segmente inline in the header; narrow/portrait docks them at the bottom instead --
    // matches Material's "medium" window-size-class breakpoint.
    val isWideScreen = LocalConfiguration.current.screenWidthDp >= 600

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

    // Confirmation dialog state for the header's Abschließen icon (moved up from the old
    // Context Info Strip, which this compact header now replaces entirely).
    var showAbschliessenDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            // Single compact header replacing the old TopAppBar + duplicate Context Info
            // Strip (both used to show the client name/type/interval separately). Line 1 is
            // the name; line 2 carries the system-type badge, interval and fill progress --
            // info that used to occupy an entire second row.
            Surface(color = Color.White, shadowElevation = 1.dp) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(start = 4.dp, end = 8.dp, top = 6.dp, bottom = 6.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    IconButton(onClick = onNavigateBack, modifier = Modifier.padding(top = 4.dp)) {
                        Icon(Icons.Default.Close, contentDescription = null, tint = IndustrialPrimary)
                    }
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .padding(top = 10.dp, end = 8.dp)
                    ) {
                        Text(
                            text = clientName,
                            fontWeight = FontWeight.Bold,
                            color = IndustrialPrimary,
                            fontSize = 16.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.padding(top = 3.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .background(IndustrialSecondaryContainer, RoundedCornerShape(4.dp))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(text = systemType, color = IndustrialOnSecondaryContainer, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                            }
                            Text(
                                text = "$intervalText · ${(fillProgress * 100).toInt()}%",
                                color = IndustrialOutline,
                                fontSize = 11.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                    // Wide layouts keep the Aktion-Segmente inline in the header, right next
                    // to the edit/Abschließen icons -- narrow ones dock them at the bottom
                    // instead (see bottomBar below).
                    if (isWideScreen && !protocolEntity.isArchived) {
                        AktionSegmentBar(
                            periodValues = periodValues,
                            activeSelectVal = activeSelectVal,
                            onSelect = { activeSelectVal = it },
                            modifier = Modifier.padding(end = 8.dp, top = 3.dp).width(280.dp),
                            compact = true
                        )
                    }
                    if (!protocolEntity.isArchived) {
                        IconButton(onClick = { onNavigateToEditMatrix(protocolId) }, modifier = Modifier.padding(top = 2.dp)) {
                            Icon(Icons.Default.Edit, contentDescription = "Editor Modus", tint = IndustrialPrimary)
                        }
                        IconButton(onClick = { showAbschliessenDialog = true }, modifier = Modifier.padding(top = 2.dp)) {
                            Icon(Icons.Default.Check, contentDescription = "Abschließen", tint = Color(0xFF15803D))
                        }
                    }
                }
            }
        },
        bottomBar = {
            // Docked segmented Aktion-selector, replacing the floating bubble-menu FAB --
            // always visible, never overlaps the Melderliste or Hardware-Tabelle content.
            // Only on narrow/portrait layouts; wide ones show it inline in the header instead.
            if (!isWideScreen && !protocolEntity.isArchived) {
                Column(modifier = Modifier.fillMaxWidth().background(Color.White)) {
                    HorizontalDivider(color = IndustrialOutlineVariant)
                    AktionSegmentBar(
                        periodValues = periodValues,
                        activeSelectVal = activeSelectVal,
                        onSelect = { activeSelectVal = it },
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 6.dp),
                        compact = false
                    )
                }
            }
        },
        containerColor = IndustrialBackground
    ) { innerPadding ->
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
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize()
        ) {
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
                    // Fill % already shown in the compact header's subtitle line -- no need to repeat it here.
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

            // BoxWithConstraints captures the maximum height available for the grid (what it
            // used to always claim via weight(1f)). The grid is only given that FULL height
            // when its own content actually needs it (long Auslöseliste -> internal scroll,
            // Hardware reachable by scrolling past it); for a short list it gets just its
            // natural content height instead, so Hardware follows immediately with no gap.
            BoxWithConstraints(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            ) {
            val maxGridHeight = maxHeight
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
            ) {
            // Dimensions dynamically scaled at layout-level by zoomScale to resolve all scroll issues.
            // Hoisted above the Row so the natural (unclipped) content height can be computed
            // directly, instead of relying on Compose's intrinsic measurement -- the frozen
            // columns below use weight()/fillMaxHeight() internally, which can't be measured
            // bottom-up as "wrap content" the way a plain Row's children normally could.
            val cellWidth = (72 * zoomScale).dp
            val cellHeight = (48 * zoomScale).dp
            val grpColWidth = (44 * zoomScale).dp        // frozen: group number only
            val bezeichnungColWidth = (110 * zoomScale).dp  // frozen: group name
            val headerRowHeight = (44 * zoomScale).dp
            val naturalGridHeight = headerRowHeight + cellHeight * rowsList.size
            val gridHeight = naturalGridHeight.coerceAtMost(maxGridHeight)

            // Scrollable Grid Box container restricting scaling artifacts from bleeding
            Row(
                modifier = Modifier
                    .height(gridHeight)
                    .fillMaxWidth()
                    .clipToBounds()
                    .transformable(state = transformState)
            ) {
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
                                                    configuredColors = configuredColors,
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

            // Hardware-Inventar (Zentrale/Ringkarten) — optional pro Gerät, direkt unterhalb der
            // Melderliste (spiegelt die PDF-Reihenfolge), mit minimalem Abstand. Jedes Gerät wird
            // über den "{device}::{grp_num}"-Präfix seiner Meldergruppen identifiziert, da die App
            // kein eigenes "Gerät"-Entity kennt. Non-weighted (wrap content) inside the bounded
            // wrapper Column above, so it never starves or overlaps the Melderliste's grid.
            val deviceIds = remember(rowsList) { rowsList.map { it.groupId.substringBefore("::") }.distinct() }
            deviceIds.forEach { deviceId ->
                HardwareSection(
                    viewModel = viewModel,
                    protocolId = protocolId,
                    deviceGroupId = deviceId,
                    activeSelectVal = activeSelectVal,
                    isArchived = protocolEntity.isArchived
                )
            }
            }
            }
        }
    }
}

// ---------------- Aktion-Segmentleiste (Q1-Q4/Def.), inline im Header (breit) oder als
// angedockte bottomBar (schmal) -- gleicher Inhalt, nur Zellgröße/Schriftgröße unterscheiden
// sich per "compact", damit sie inline neben den Header-Icons nicht zu breit wird.

@Composable
private fun AktionSegmentBar(
    periodValues: List<ValueModel>,
    activeSelectVal: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    compact: Boolean
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(if (compact) 3.dp else 4.dp)
    ) {
        periodValues.forEach { valModel ->
            val isSelected = activeSelectVal == valModel.value
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(if (compact) 6.dp else 8.dp))
                    .background(
                        when {
                            isSelected && valModel.isDefect -> IndustrialError
                            isSelected -> IndustrialPrimary
                            valModel.isDefect -> IndustrialErrorContainer.copy(alpha = 0.4f)
                            else -> LightSurfaceLow
                        }
                    )
                    .clickable { onSelect(valModel.value) }
                    .padding(vertical = if (compact) 6.dp else 10.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = valModel.label,
                    fontWeight = FontWeight.Bold,
                    fontSize = if (compact) 10.sp else 12.sp,
                    color = if (isSelected) Color.White else if (valModel.isDefect) IndustrialError else IndustrialOnSurface
                )
            }
        }
    }
}

// ---------------- High Performance Stable Nested Layout Models ----------------

data class ColumnModel(val key: String, val label: String)
data class CellModel(val slotKey: String, val detectorType: String, val value: String)
data class RowModel(val groupId: String, val groupName: String, val cells: List<CellModel>)
data class ValueModel(val value: String, val label: String, val isDefect: Boolean)
data class HardwareRowModel(
    val index: Int,
    val hardware: String,
    val bezeichnung: String,
    val typ: String,
    val stoerung: String,
    val unterbrechung: String,
    val swStand: String
)

// ---------------- Hardware-Tabelle (Zentrale/Ringkarten-Inventar), optional pro Gerät ----------------
// Kompakte, echte Tabellenzeilen (wie die Melderliste) statt Karten -- fixe Spaltenbreiten,
// niedrige Zeilenhöhe. Störung/Unterbrechung verhalten sich wie ein Melder-Slot: Antippen trägt
// den gerade im schwebenden Button gewählten Wert ein (statt einen eigenen Dialog zu öffnen).

private val hwColHardware = 84.dp
private val hwColBezeichnung = 110.dp
private val hwColTyp = 76.dp
private val hwColValue = 60.dp
private val hwRowHeight = 34.dp

@Composable
private fun HardwareSection(
    viewModel: MainViewModel,
    protocolId: String,
    deviceGroupId: String,
    activeSelectVal: String,
    isArchived: Boolean
) {
    val context = LocalContext.current
    val hwEntity by viewModel.getHardwareTableFlow(protocolId, deviceGroupId).collectAsState(initial = null)
    val hwRows = remember(hwEntity?.rowsJson) {
        val json = hwEntity?.rowsJson
        if (json == null) {
            emptyList()
        } else {
            try {
                val arr = JSONArray(json)
                List(arr.length()) { i ->
                    val o = arr.getJSONObject(i)
                    HardwareRowModel(
                        index = i,
                        hardware = o.optString("hardware", ""),
                        bezeichnung = o.optString("bezeichnung", ""),
                        typ = o.optString("typ", ""),
                        stoerung = o.optString("stoerung", ""),
                        unterbrechung = o.optString("unterbrechung", ""),
                        swStand = o.optString("sw_stand", "")
                    )
                }
            } catch (e: Exception) {
                emptyList()
            }
        }
    }
    if (hwRows.isEmpty()) return

    fun onValueTap(rowIdx: Int, field: String, currentVal: String) {
        if (currentVal.isEmpty()) {
            viewModel.editHardwareField(protocolId, deviceGroupId, rowIdx, field, activeSelectVal)
        } else if (currentVal == activeSelectVal) {
            viewModel.editHardwareField(protocolId, deviceGroupId, rowIdx, field, "")
        } else {
            Toast.makeText(context, "Feld geschützt geprüft ($currentVal).", Toast.LENGTH_SHORT).show()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 4.dp)
            .border(1.dp, IndustrialOutlineVariant)
    ) {
        Text(
            "Hardware",
            fontWeight = FontWeight.ExtraBold,
            fontSize = 11.sp,
            color = IndustrialOutline,
            modifier = Modifier
                .fillMaxWidth()
                .background(LightSurfaceHigh)
                .padding(horizontal = 8.dp, vertical = 2.dp)
        )

        // Header row
        Row(modifier = Modifier.fillMaxWidth().height(hwRowHeight).background(LightSurfaceHigh)) {
            HwHeaderCell("Hardware", Modifier.width(hwColHardware))
            HwHeaderCell("Bezeichnung", Modifier.width(hwColBezeichnung))
            HwHeaderCell("Typ", Modifier.width(hwColTyp))
            HwHeaderCell("Störung", Modifier.width(hwColValue))
            HwHeaderCell("Unterbr.", Modifier.width(hwColValue))
            HwHeaderCell("SW-Stand", Modifier.weight(1f))
        }

        hwRows.forEach { row ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(hwRowHeight)
            ) {
                HwTextCell(row.hardware, Modifier.width(hwColHardware))
                HwTextCell(row.bezeichnung, Modifier.width(hwColBezeichnung))
                HwTextCell(row.typ, Modifier.width(hwColTyp))
                HwValueCell(
                    value = row.stoerung,
                    enabled = !isArchived,
                    modifier = Modifier.width(hwColValue),
                    onClick = { onValueTap(row.index, "stoerung", row.stoerung) }
                )
                HwValueCell(
                    value = row.unterbrechung,
                    enabled = !isArchived,
                    modifier = Modifier.width(hwColValue),
                    onClick = { onValueTap(row.index, "unterbrechung", row.unterbrechung) }
                )
                HwSwStandCell(
                    row = row,
                    protocolId = protocolId,
                    deviceGroupId = deviceGroupId,
                    viewModel = viewModel,
                    enabled = !isArchived,
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
private fun HwHeaderCell(label: String, modifier: Modifier) {
    Box(
        modifier = modifier
            .fillMaxHeight()
            .border(0.5.dp, IndustrialOutlineVariant)
            .padding(horizontal = 6.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        Text(label, fontWeight = FontWeight.Bold, fontSize = 10.sp, color = IndustrialOutline, maxLines = 1)
    }
}

@Composable
private fun HwTextCell(text: String, modifier: Modifier) {
    Box(
        modifier = modifier
            .fillMaxHeight()
            .border(0.5.dp, IndustrialOutlineVariant)
            .padding(horizontal = 6.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        Text(
            text = text.ifBlank { "—" },
            fontSize = 11.sp,
            color = IndustrialOnSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun HwValueCell(
    value: String,
    enabled: Boolean,
    modifier: Modifier,
    onClick: () -> Unit
) {
    val isDefect = value == "Def." || value.lowercase().contains("def")
    Box(
        modifier = modifier
            .fillMaxHeight()
            .background(
                when {
                    isDefect -> IndustrialErrorContainer
                    value.isNotEmpty() -> IndustrialPrimaryContainer.copy(alpha = 0.12f)
                    else -> Color.White
                }
            )
            .border(0.5.dp, IndustrialOutlineVariant)
            .clickable(
                interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                onClick = onClick
            ),
        contentAlignment = Alignment.Center
    ) {
        if (isDefect) {
            Text("DEF.", color = IndustrialError, fontWeight = FontWeight.ExtraBold, fontSize = 10.sp)
        } else {
            Text(
                text = value.ifEmpty { "-" },
                color = if (value.isNotEmpty()) IndustrialPrimary else IndustrialOutline.copy(alpha = 0.5f),
                fontWeight = if (value.isNotEmpty()) FontWeight.Bold else FontWeight.Normal,
                fontSize = 11.sp
            )
        }
    }
}

@Composable
private fun HwSwStandCell(
    row: HardwareRowModel,
    protocolId: String,
    deviceGroupId: String,
    viewModel: MainViewModel,
    enabled: Boolean,
    modifier: Modifier
) {
    // Keyed on the persisted value (not on updatedAt) so the field doesn't reset
    // mid-typing -- same pattern as MatrixEditScreen's grpNameInput.
    var value by remember(row.swStand) { mutableStateOf(row.swStand) }
    Box(
        modifier = modifier
            .fillMaxHeight()
            .border(0.5.dp, IndustrialOutlineVariant)
            .padding(horizontal = 6.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        BasicTextField(
            value = value,
            onValueChange = { newVal ->
                value = newVal
                viewModel.editHardwareField(protocolId, deviceGroupId, row.index, "sw_stand", newVal)
            },
            enabled = enabled,
            singleLine = true,
            textStyle = TextStyle(fontSize = 11.sp, color = IndustrialOnSurface),
            modifier = Modifier.fillMaxWidth()
        )
    }
}

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
    configuredColors: Map<String, String> = emptyMap(),
    onClick: () -> Unit
) {
    val isDisabled = detectorType == "-"
    // Not-yet-checked cells show the Meldepunkttyp in its configured (or built-in fallback)
    // color, mirroring MatrixEditScreen's paint palette and the WebUI grid -- same source
    // (MainViewModel.getMeldepunktMeta), same "type color when empty, status color once
    // checked" convention. Once a Prüfwert is entered, the existing green/red status
    // styling below stays exactly as it was.
    val typeColor = remember(detectorType, configuredColors) { detectorTypeColor(detectorType, configuredColors) }
    Box(
        modifier = Modifier
            .width(cellWidth)
            .height(cellHeight)
            .background(
                if (isDisabled) LightSurfaceLow
                else if (cellVal.isNotEmpty()) {
                    if (cellVal == "Def." || cellVal.lowercase().contains("def")) IndustrialErrorContainer
                    else IndustrialPrimaryContainer.copy(alpha = 0.12f)
                } else typeColor.copy(alpha = 0.15f)
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
                color = typeColor,
                fontSize = cellFontSize
            )
        }
    }
}

/** Detector-type color -- a configured color from the Anlagentyp's Meldepunkt-Definitionen
 * (see MainViewModel.getMeldepunktMeta) wins if present, otherwise the same built-in
 * fallback map MatrixEditScreen's paint palette uses when nothing's configured. */
private fun detectorTypeColor(type: String, configuredColors: Map<String, String> = emptyMap()): Color {
    if (type == "-") return IndustrialOutline
    configuredColors[type]?.let { hex -> parseHexColor(hex)?.let { return it } }
    return when (type) {
        "ZD" -> Color(0xFF3B82F6); "Normal", "AM" -> Color(0xFF10B981); "ZB" -> Color(0xFFEAB308)
        "TDIFF", "TDiff" -> Color(0xFFFB923C); "TMAX", "Tmax" -> Color(0xFFEF4444); "RAS" -> Color(0xFFA855F7)
        "LINEAR", "Linear" -> Color(0xFFEC4899); "DKM" -> Color(0xFFF43F5E); "Konventionell" -> Color(0xFF64748B)
        "BWM" -> Color(0xFF3B82F6); "ZK" -> Color(0xFFEAB308); "RSK" -> Color(0xFFA855F7)
        else -> Color(0xFF94A3B8)
    }
}

private fun parseHexColor(hex: String): Color? = try {
    val clean = hex.removePrefix("#")
    when (clean.length) {
        6 -> Color((0xFF000000L or clean.toLong(16)).toInt())
        8 -> Color(clean.toLong(16).toInt())
        else -> null
    }
} catch (e: Exception) {
    null
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
