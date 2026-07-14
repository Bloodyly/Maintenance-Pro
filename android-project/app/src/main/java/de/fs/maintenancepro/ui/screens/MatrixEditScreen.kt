package de.fs.maintenancepro.ui.screens

import android.widget.Toast
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.fs.maintenancepro.R
import de.fs.maintenancepro.data.local.GroupCellEntity
import de.fs.maintenancepro.data.local.ProtocolGroupEntity
import de.fs.maintenancepro.ui.theme.*
import de.fs.maintenancepro.ui.viewmodel.MainViewModel
import kotlin.math.max
import kotlin.math.min
import org.json.JSONArray

// ---------------------------------------------------------------------------
// Grid-based Auslöselisten editor -- works exactly like the WebUI cells editor:
// one grid per Gerät (Grp | Bezeichnung | Melder 1..N), a paint palette of
// detector types, tap or long-press-drag to paint cells, and inline-editable
// Grp/Bezeichnung text fields. Painting preserves already-entered Messwerte.
// ---------------------------------------------------------------------------

/** Detector-type colors, mirroring the WebUI's gridTypeColor/-Pale maps. */
private fun typeSolidColor(type: String): Color = when (type) {
    "ZD" -> Color(0xFF3B82F6); "Normal" -> Color(0xFF10B981); "ZB" -> Color(0xFFEAB308)
    "TDIFF" -> Color(0xFFFB923C); "TMAX" -> Color(0xFFEF4444); "RAS" -> Color(0xFFA855F7)
    "LINEAR" -> Color(0xFFEC4899); "-" -> Color(0xFFF1F5F9)
    else -> Color(0xFF94A3B8)
}

private fun typePaleColor(type: String): Color = when (type) {
    "ZD" -> Color(0xFFDBEAFE); "Normal" -> Color(0xFFD1FAE5); "ZB" -> Color(0xFFFEF9C3)
    "TDIFF" -> Color(0xFFFFEDD5); "TMAX" -> Color(0xFFFEE2E2); "RAS" -> Color(0xFFF3E8FF)
    "LINEAR" -> Color(0xFFFCE7F3)
    else -> Color(0xFFF1F5F9)
}

private fun typePaleTextColor(type: String): Color = when (type) {
    "ZD" -> Color(0xFF60A5FA); "Normal" -> Color(0xFF34D399); "ZB" -> Color(0xFFCA8A04)
    "TDIFF" -> Color(0xFFFB923C); "TMAX" -> Color(0xFFF87171); "RAS" -> Color(0xFFC084FC)
    "LINEAR" -> Color(0xFFF472B6)
    else -> Color(0xFF94A3B8)
}

/** Short in-cell label, mirroring the WebUI's gridTypeText map. */
private fun typeAbbrev(type: String): String = when (type) {
    "ZD" -> "ZD"; "Normal" -> "N"; "ZB" -> "ZB"; "TDIFF" -> "TD"
    "TMAX" -> "TM"; "RAS" -> "RS"; "LINEAR" -> "LN"; "-" -> ""
    else -> type
}

/** One Gerät (device) section of the editor: its groups plus a numeric slot lookup. */
private data class EditorDevice(
    val prefix: String,
    val displayName: String,
    val groups: List<ProtocolGroupEntity>,
    /** groupId -> (slot number -> cell) for cells with numeric slot keys */
    val cellsBySlot: Map<String, Map<Int, GroupCellEntity>>,
    val maxSlot: Int,
    /** Highest slot that actually carries content (type or value) — the floor for "Melder max." */
    val maxPaintedSlot: Int
)

private fun devicePrefixOf(groupId: String): String = groupId.substringBeforeLast("::", "")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MatrixEditScreen(
    viewModel: MainViewModel,
    protocolId: String,
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

    if (protocolEntity == null) return

    val groupsState by viewModel.getGroupsFlow(protocolId).collectAsState(initial = emptyList())
    val cellsState by viewModel.getCellsFlow(protocolId).collectAsState(initial = emptyList())

    // Paint palette choices: detector types from the protocol definition, with the
    // eraser ('-') always available as first entry -- same lineup as the WebUI palette.
    val detChoices = remember(protocolEntity.detectorTypesJson) {
        val parsed = try {
            val arr = JSONArray(protocolEntity.detectorTypesJson)
            List(arr.length()) { i -> arr.getString(i) }
        } catch (e: Exception) {
            emptyList()
        }
        val types = parsed.ifEmpty { listOf("-", "Normal", "ZD", "ZB", "TDIFF", "TMAX", "RAS", "LINEAR") }
        if (types.contains("-")) types else listOf("-") + types
    }

    var paintType by remember(detChoices) {
        mutableStateOf(detChoices.firstOrNull { it != "-" } ?: "-")
    }

    val devices = remember(groupsState, cellsState) {
        val cellsByGroup = cellsState.groupBy { it.groupId }
        groupsState.groupBy { devicePrefixOf(it.groupId) }.map { (prefix, grps) ->
            val slotMaps = grps.associate { g ->
                g.groupId to cellsByGroup[g.groupId].orEmpty()
                    .mapNotNull { c -> c.slotKey.toIntOrNull()?.let { it to c } }
                    .toMap()
            }
            EditorDevice(
                prefix = prefix,
                displayName = grps.firstOrNull { !it.anlageName.isNullOrBlank() }?.anlageName
                    ?: prefix.ifBlank { protocolEntity.name },
                groups = grps,
                cellsBySlot = slotMaps,
                maxSlot = slotMaps.values.maxOfOrNull { it.keys.maxOrNull() ?: 0 } ?: 0,
                maxPaintedSlot = slotMaps.values.maxOfOrNull { m ->
                    m.entries.filter { it.value.detectorType != "-" || it.value.value.isNotEmpty() }
                        .maxOfOrNull { it.key } ?: 0
                } ?: 0
            )
        }
    }

    // Optimistic paint overlay ("groupId::col" -> painted type): identical idea to
    // InspectionScreen's pendingOverrides -- taps/drags render instantly, the DB write
    // and Flow round-trip catch up in the background.
    val pendingPaint = remember { mutableStateMapOf<String, String>() }
    LaunchedEffect(cellsState) {
        if (pendingPaint.isEmpty()) return@LaunchedEffect
        val cellMap = cellsState.associateBy { "${it.groupId}::${it.slotKey}" }
        val confirmed = pendingPaint.filter { (key, type) -> cellMap[key]?.detectorType == type }.keys
        confirmed.forEach { pendingPaint.remove(it) }
    }

    // User-widened column counts per device (view-level until something is painted there).
    val colsOverride = remember { mutableStateMapOf<String, Int>() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            stringResource(R.string.title_matrix_edit),
                            fontWeight = FontWeight.Bold, color = IndustrialPrimary, fontSize = 16.sp
                        )
                        Text(
                            protocolEntity.name,
                            fontSize = 11.sp, color = IndustrialOutline,
                            maxLines = 1, overflow = TextOverflow.Ellipsis
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
                // MainActivity's outer Scaffold already reserves the status-bar inset via its
                // own innerPadding on the NavHost -- see SearchScreen.kt for the full explanation.
                windowInsets = WindowInsets(0.dp),
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = null, tint = IndustrialPrimary)
                    }
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
            // --- Paint palette (sticky above the scrolling grids) ---
            Surface(color = Color.White, shadowElevation = 1.dp) {
                Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.horizontalScroll(rememberScrollState())
                    ) {
                        Icon(
                            Icons.Default.Brush, contentDescription = null,
                            tint = IndustrialOutline, modifier = Modifier.size(16.dp)
                        )
                        detChoices.forEach { dt ->
                            val selected = paintType == dt
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = if (selected) typeSolidColor(dt) else Color.White,
                                border = androidx.compose.foundation.BorderStroke(
                                    1.dp,
                                    if (selected) Color.Transparent else IndustrialOutlineVariant
                                ),
                                shadowElevation = if (selected) 2.dp else 0.dp,
                                modifier = Modifier.clickable { paintType = dt }
                            ) {
                                Text(
                                    text = if (dt == "-") "✕" else dt,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = when {
                                        !selected -> IndustrialOnSurface
                                        dt == "-" -> IndustrialOnSurface
                                        else -> Color.White
                                    },
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                                )
                            }
                        }
                    }
                    Text(
                        text = "Tippen oder gedrückt halten und ziehen, um Melder zu typisieren. ✕ entfernt.",
                        fontSize = 10.sp, color = IndustrialOutline,
                        modifier = Modifier.padding(top = 6.dp)
                    )
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(bottom = 24.dp)
            ) {
                if (devices.isEmpty()) {
                    Text(
                        "Keine Geräte/Meldegruppen vorhanden.",
                        fontSize = 12.sp, color = IndustrialOutline,
                        modifier = Modifier.padding(24.dp)
                    )
                }
                devices.forEach { device ->
                    key(device.prefix) {
                        DeviceEditorSection(
                            protocolId = protocolId,
                            device = device,
                            nCols = (colsOverride[device.prefix]
                                ?: if (device.maxSlot == 0) 10 else device.maxSlot)
                                .coerceIn(max(device.maxPaintedSlot, 1), 60),
                            paintType = paintType,
                            pendingPaint = pendingPaint,
                            viewModel = viewModel,
                            onColsChange = { newCols -> colsOverride[device.prefix] = newCols }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DeviceEditorSection(
    protocolId: String,
    device: EditorDevice,
    nCols: Int,
    paintType: String,
    pendingPaint: MutableMap<String, String>,
    viewModel: MainViewModel,
    onColsChange: (Int) -> Unit
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val hapticFeedback = LocalHapticFeedback.current

    val rowHeight = 42.dp
    val headerHeight = 34.dp
    val colWidth = 40.dp
    val grpColWidth = 56.dp
    val nameColWidth = 150.dp

    val colWidthPx = with(density) { colWidth.toPx() }
    val rowHeightPx = with(density) { rowHeight.toPx() }

    // Always-current references for the long-lived pointerInput coroutine.
    val currentGroups = rememberUpdatedState(device.groups)
    val currentPaintType = rememberUpdatedState(paintType)
    val currentNCols = rememberUpdatedState(nCols)

    var showRemoveGroupDialog by remember { mutableStateOf(false) }

    // Rubber-band selection state (content coordinates of the cells box).
    var isPainting by remember { mutableStateOf(false) }
    var paintStart by remember { mutableStateOf(Offset.Zero) }
    var paintEnd by remember { mutableStateOf(Offset.Zero) }

    fun paintRect(startPx: Offset, endPx: Offset) {
        val groups = currentGroups.value
        val cols = currentNCols.value
        val minR = (min(startPx.y, endPx.y) / rowHeightPx).toInt().coerceIn(0, groups.size - 1)
        val maxR = (max(startPx.y, endPx.y) / rowHeightPx).toInt().coerceIn(0, groups.size - 1)
        val minC = ((min(startPx.x, endPx.x) / colWidthPx).toInt() + 1).coerceIn(1, cols)
        val maxC = ((max(startPx.x, endPx.x) / colWidthPx).toInt() + 1).coerceIn(1, cols)
        val type = currentPaintType.value
        val targets = mutableMapOf<String, List<Int>>()
        for (r in minR..maxR) {
            val g = groups[r]
            val colList = (minC..maxC).toList()
            targets[g.groupId] = colList
            colList.forEach { c -> pendingPaint["${g.groupId}::$c"] = type }
        }
        viewModel.paintCells(protocolId, targets, type)
        val count = (maxR - minR + 1) * (maxC - minC + 1)
        if (count > 1) {
            val msg = if (type == "-") "$count Melder entfernt" else "$count Melder auf $type gesetzt"
            Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
        }
    }

    if (showRemoveGroupDialog) {
        val lastGroup = device.groups.lastOrNull()
        AlertDialog(
            onDismissRequest = { showRemoveGroupDialog = false },
            title = { Text("Gruppe löschen", fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    "Die letzte Gruppe \"${lastGroup?.groupId?.substringAfterLast("::") ?: ""}\" enthält Melder oder Prüfwerte. Wirklich löschen?"
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showRemoveGroupDialog = false
                    viewModel.removeLastGroupFromDevice(protocolId, device.prefix)
                }) {
                    Text("Löschen", color = IndustrialError, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showRemoveGroupDialog = false }) {
                    Text("Abbrechen", color = IndustrialOutline)
                }
            }
        )
    }

    Column(modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
        // --- Device header: name + Gruppen/Melder steppers ---
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = device.displayName,
                    fontWeight = FontWeight.Bold, fontSize = 13.sp, color = IndustrialPrimary,
                    maxLines = 1, overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = "${device.groups.size} Gruppen · $nCols Melder",
                    fontSize = 10.sp, color = IndustrialOutline
                )
            }
            StepperControl(
                label = "Gruppen",
                value = device.groups.size,
                onDecrement = {
                    val last = device.groups.lastOrNull() ?: return@StepperControl
                    if (device.groups.size <= 1) {
                        Toast.makeText(context, "Letzte Gruppe kann nicht entfernt werden", Toast.LENGTH_SHORT).show()
                        return@StepperControl
                    }
                    val hasContent = device.cellsBySlot[last.groupId].orEmpty().values
                        .any { it.detectorType != "-" || it.value.isNotEmpty() }
                    if (hasContent) showRemoveGroupDialog = true
                    else viewModel.removeLastGroupFromDevice(protocolId, device.prefix)
                },
                onIncrement = {
                    if (device.groups.size >= 200) return@StepperControl
                    viewModel.addGroupToDevice(protocolId, device.prefix)
                }
            )
            Spacer(Modifier.width(10.dp))
            StepperControl(
                label = "Melder",
                value = nCols,
                onDecrement = { onColsChange(nCols - 1) },
                onIncrement = { onColsChange(nCols + 1) }
            )
        }

        // --- Grid ---
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White)
                .border(1.dp, IndustrialOutlineVariant)
        ) {
            // Frozen left columns: Grp + Bezeichnung (both inline-editable).
            Column(modifier = Modifier.width(grpColWidth + nameColWidth)) {
                Row(modifier = Modifier.height(headerHeight)) {
                    GridHeaderCell("Grp", grpColWidth, headerHeight)
                    GridHeaderCell("Bezeichnung", nameColWidth, headerHeight, alignStart = true)
                }
                device.groups.forEach { g ->
                    key(g.groupId) {
                        Row(modifier = Modifier.height(rowHeight)) {
                            GrpNumField(
                                group = g,
                                devicePrefix = device.prefix,
                                allGroups = device.groups,
                                width = grpColWidth,
                                height = rowHeight,
                                onCommit = { newFullId ->
                                    viewModel.updateGroupDetails(
                                        protocolId = protocolId,
                                        oldGroupId = g.groupId,
                                        newGroupId = newFullId,
                                        newGroupName = g.groupName,
                                        newGroupType = g.groupType
                                    )
                                }
                            )
                            GroupNameField(
                                group = g,
                                width = nameColWidth,
                                height = rowHeight,
                                onNameChange = { newName ->
                                    viewModel.updateGroupDetails(
                                        protocolId = protocolId,
                                        oldGroupId = g.groupId,
                                        newGroupId = g.groupId,
                                        newGroupName = newName,
                                        newGroupType = g.groupType
                                    )
                                }
                            )
                        }
                    }
                }
            }

            // Scrollable Melder columns: numeric header + paintable cells.
            val hScroll = rememberScrollState()
            Column(
                modifier = Modifier
                    .weight(1f)
                    .horizontalScroll(hScroll)
            ) {
                Row(modifier = Modifier.height(headerHeight)) {
                    (1..nCols).forEach { c ->
                        GridHeaderCell(c.toString(), colWidth, headerHeight, subdued = true)
                    }
                }
                Box(
                    modifier = Modifier.pointerInput(Unit) {
                        detectDragGesturesAfterLongPress(
                            onDragStart = { offset ->
                                hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                                paintStart = offset
                                paintEnd = offset
                                isPainting = true
                            },
                            onDrag = { change, _ ->
                                change.consume()
                                paintEnd = change.position
                            },
                            onDragEnd = {
                                isPainting = false
                                paintRect(paintStart, paintEnd)
                            },
                            onDragCancel = { isPainting = false }
                        )
                    }
                ) {
                    Column {
                        device.groups.forEach { g ->
                            key(g.groupId) {
                                Row(modifier = Modifier.height(rowHeight)) {
                                    val slotCells = device.cellsBySlot[g.groupId].orEmpty()
                                    (1..nCols).forEach { c ->
                                        val cell = slotCells[c]
                                        val type = pendingPaint["${g.groupId}::$c"]
                                            ?: cell?.detectorType ?: "-"
                                        EditorCell(
                                            type = type,
                                            value = cell?.value ?: "",
                                            width = colWidth,
                                            height = rowHeight,
                                            onClick = {
                                                val newType = currentPaintType.value
                                                pendingPaint["${g.groupId}::$c"] = newType
                                                viewModel.paintCells(
                                                    protocolId, mapOf(g.groupId to listOf(c)), newType
                                                )
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // Rubber-band overlay: all selection state reads happen in DrawScope,
                    // so dragging only redraws the Canvas, never recomposes the cells.
                    Canvas(modifier = Modifier.matchParentSize()) {
                        if (!isPainting) return@Canvas
                        val left = min(paintStart.x, paintEnd.x)
                        val top = min(paintStart.y, paintEnd.y)
                        val right = max(paintStart.x, paintEnd.x)
                        val bottom = max(paintStart.y, paintEnd.y)
                        drawRect(
                            color = Color(0x1A3B82F6),
                            topLeft = Offset(left, top),
                            size = Size(right - left, bottom - top)
                        )
                        drawRect(
                            color = Color(0xFF3B82F6),
                            topLeft = Offset(left, top),
                            size = Size(right - left, bottom - top),
                            style = Stroke(
                                width = 2.dp.toPx(),
                                pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 8f))
                            )
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StepperControl(
    label: String,
    value: Int,
    onDecrement: () -> Unit,
    onIncrement: () -> Unit
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = IndustrialOutline)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .background(LightSurfaceHigh, RoundedCornerShape(6.dp))
                .padding(horizontal = 2.dp)
        ) {
            Text(
                "−", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = IndustrialPrimary,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .clickable { onDecrement() }
                    .padding(horizontal = 8.dp, vertical = 2.dp)
            )
            Text(
                value.toString(), fontSize = 12.sp, fontWeight = FontWeight.Bold,
                color = IndustrialOnSurface,
                modifier = Modifier.widthIn(min = 26.dp), textAlign = TextAlign.Center
            )
            Text(
                "+", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = IndustrialPrimary,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .clickable { onIncrement() }
                    .padding(horizontal = 8.dp, vertical = 2.dp)
            )
        }
    }
}

@Composable
private fun GridHeaderCell(
    text: String,
    width: androidx.compose.ui.unit.Dp,
    height: androidx.compose.ui.unit.Dp,
    alignStart: Boolean = false,
    subdued: Boolean = false
) {
    Box(
        modifier = Modifier
            .width(width)
            .height(height)
            .background(if (subdued) LightSurfaceHigh else IndustrialPrimary)
            .border(0.5.dp, IndustrialOutlineVariant)
            .padding(horizontal = if (alignStart) 8.dp else 0.dp),
        contentAlignment = if (alignStart) Alignment.CenterStart else Alignment.Center
    ) {
        Text(
            text = text,
            fontSize = 10.sp,
            fontWeight = FontWeight.ExtraBold,
            color = if (subdued) IndustrialOutline else Color.White,
            maxLines = 1
        )
    }
}

/** Inline-editable Gruppen-Nummer: commits on IME-Done or focus loss, with
 * empty/duplicate guarding -- a rename re-keys the group's cells underneath. */
@Composable
private fun GrpNumField(
    group: ProtocolGroupEntity,
    devicePrefix: String,
    allGroups: List<ProtocolGroupEntity>,
    width: androidx.compose.ui.unit.Dp,
    height: androidx.compose.ui.unit.Dp,
    onCommit: (String) -> Unit
) {
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val grpNumOnly = group.groupId.substringAfterLast("::")
    var input by remember(group.groupId) { mutableStateOf(grpNumOnly) }

    fun commit() {
        val trimmed = input.trim()
        if (trimmed == grpNumOnly) return
        if (trimmed.isEmpty()) {
            Toast.makeText(context, "Gruppen-Nr. darf nicht leer sein", Toast.LENGTH_SHORT).show()
            input = grpNumOnly
            return
        }
        val newFullId = if (devicePrefix.isNotEmpty()) "$devicePrefix::$trimmed" else trimmed
        if (allGroups.any { it.groupId == newFullId }) {
            Toast.makeText(context, "Gruppen-Nr. \"$trimmed\" existiert bereits", Toast.LENGTH_SHORT).show()
            input = grpNumOnly
            return
        }
        onCommit(newFullId)
    }

    Box(
        modifier = Modifier
            .width(width)
            .height(height)
            .background(LightSurfaceLow)
            .border(0.5.dp, IndustrialOutlineVariant),
        contentAlignment = Alignment.Center
    ) {
        BasicTextField(
            value = input,
            onValueChange = { input = it },
            singleLine = true,
            textStyle = TextStyle(
                fontSize = 11.sp, fontWeight = FontWeight.Bold,
                color = IndustrialPrimary, textAlign = TextAlign.Center
            ),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = {
                commit()
                focusManager.clearFocus()
            }),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp)
                .onFocusChanged { if (!it.isFocused) commit() }
        )
    }
}

/** Inline-editable Bezeichnung: writes through on every change (same pattern the
 * old card editor used) with local state so typing never stutters. */
@Composable
private fun GroupNameField(
    group: ProtocolGroupEntity,
    width: androidx.compose.ui.unit.Dp,
    height: androidx.compose.ui.unit.Dp,
    onNameChange: (String) -> Unit
) {
    var input by remember(group.groupId, group.groupName) { mutableStateOf(group.groupName) }

    Box(
        modifier = Modifier
            .width(width)
            .height(height)
            .background(Color.White)
            .border(0.5.dp, IndustrialOutlineVariant)
            .padding(horizontal = 8.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        BasicTextField(
            value = input,
            onValueChange = { newVal ->
                input = newVal
                onNameChange(newVal)
            },
            singleLine = true,
            textStyle = TextStyle(fontSize = 11.sp, color = IndustrialOnSurface),
            decorationBox = { innerTextField ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (input.isEmpty()) {
                        Text("Bezeichnung…", fontSize = 11.sp, color = IndustrialOutlineVariant)
                    }
                    innerTextField()
                }
            },
            modifier = Modifier.fillMaxWidth()
        )
    }
}

/** One paintable Melder cell: pale type color + abbreviation, or the entered
 * Messwert on top of it -- exactly the WebUI grid cell's rendering. */
@Composable
private fun EditorCell(
    type: String,
    value: String,
    width: androidx.compose.ui.unit.Dp,
    height: androidx.compose.ui.unit.Dp,
    onClick: () -> Unit
) {
    val inactive = type == "-" || type.isEmpty()
    Box(
        modifier = Modifier
            .width(width)
            .height(height)
            .background(if (inactive) Color(0xFFF8FAFC) else typePaleColor(type))
            .border(0.5.dp, IndustrialOutlineVariant)
            .clickable { onClick() },
        contentAlignment = Alignment.Center
    ) {
        when {
            value.isNotEmpty() -> Text(
                text = value,
                fontSize = 9.sp,
                fontWeight = FontWeight.Black,
                color = if (value == "Def." || value == "Fehler") Color(0xFFB91C1C) else Color(0xFF0F172A)
            )
            !inactive -> Text(
                text = typeAbbrev(type),
                fontSize = 9.sp,
                fontWeight = FontWeight.SemiBold,
                color = typePaleTextColor(type)
            )
        }
    }
}
