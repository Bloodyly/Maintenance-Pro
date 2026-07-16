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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
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
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
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

/**
 * Detector-type color, mirroring the WebUI's gridTypeHex: a configured color from the
 * Anlagentyp's Meldepunkt-Definitionen (global cache, see MainViewModel.getMeldepunktMeta)
 * wins if present; otherwise the same built-in fallback map the WebUI uses when nothing's
 * configured. One hex per type is now the single source of truth -- pale cell backgrounds
 * and the in-cell abbreviation text both derive from it, not separately configured shades.
 */
private fun typeSolidColor(type: String, configuredColors: Map<String, String> = emptyMap()): Color {
    if (type == "-") return Color(0xFFF1F5F9)
    configuredColors[type]?.let { hex -> parseHexColor(hex)?.let { return it } }
    return when (type) {
        "ZD" -> Color(0xFF3B82F6); "Normal", "AM" -> Color(0xFF10B981); "ZB" -> Color(0xFFEAB308)
        "TDIFF", "TDiff" -> Color(0xFFFB923C); "TMAX", "Tmax" -> Color(0xFFEF4444); "RAS" -> Color(0xFFA855F7)
        "LINEAR", "Linear" -> Color(0xFFEC4899); "DKM" -> Color(0xFFF43F5E); "Konventionell" -> Color(0xFF64748B)
        "BWM" -> Color(0xFF3B82F6); "ZK" -> Color(0xFFEAB308); "RSK" -> Color(0xFFA855F7)
        else -> Color(0xFF94A3B8)
    }
}

/** Pale cell background: same hue as [typeSolidColor], low alpha -- matches the WebUI's
 * `gridTypeHex(type) + '26'` (~15% alpha) approach of deriving one shade from the other. */
private fun typePaleColor(type: String, configuredColors: Map<String, String> = emptyMap()): Color =
    if (type == "-") Color(0xFFF1F5F9) else typeSolidColor(type, configuredColors).copy(alpha = 0.15f)

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

/** Short in-cell label -- a configured Kurzzeichen from the Anlagentypen-Editor wins if
 * present, mirroring the WebUI's gridTypeText(); otherwise the same built-in fallback map. */
private fun typeAbbrev(type: String, configuredKurzzeichen: Map<String, String> = emptyMap()): String {
    if (type == "-") return ""
    configuredKurzzeichen[type]?.let { return it }
    val map = mapOf(
        "ZD" to "ZD", "Normal" to "N", "AM" to "AM", "ZB" to "ZB",
        "TDIFF" to "TD", "TDiff" to "TD", "TMAX" to "TM", "Tmax" to "TM",
        "RAS" to "RS", "LINEAR" to "LN", "Linear" to "LN",
        "DKM" to "DK", "Konventionell" to "KV", "IO" to "IO", "Steu" to "ST",
        "MASI" to "MS", "Koppler" to "KO"
    )
    return map[type] ?: if (type.length > 3) type.take(2) else type
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

    // WebUI-configured Zellfarben/Kurzzeichen for this protocol's Anlagentyp -- read from the
    // global, protocol-independent "Anlagentypen neu laden" cache (MainViewModel.getMeldepunktMeta),
    // NOT anything stored per-protocol. Empty until the button has ever been pressed, falling
    // back to typeSolidColor/typeAbbrev's built-in maps in that case.
    val meldepunktMeta = remember(protocolEntity.systemType) {
        viewModel.getMeldepunktMeta(protocolEntity.systemType)
    }
    val configuredColors = meldepunktMeta?.colors ?: emptyMap()
    val configuredKurzzeichen = meldepunktMeta?.kurzzeichen ?: emptyMap()

    // Paint palette choices: the freshly-synced Anlagentyp detector list wins if present
    // (same "Anlagentypen neu laden" cache as configuredColors/-Kurzzeichen above, so a
    // WebUI-side vocabulary change/reorder shows up here without a protocol re-sync) --
    // falls back to the protocol's own stored list, then a hardcoded minimum. The eraser
    // ('-') is always available as first entry -- same lineup as the WebUI palette.
    val detChoices = remember(meldepunktMeta, protocolEntity.detectorTypesJson) {
        val fromMeta = meldepunktMeta?.detectors.orEmpty()
        val fromProtocol = try {
            val arr = JSONArray(protocolEntity.detectorTypesJson)
            List(arr.length()) { i -> arr.getString(i) }
        } catch (e: Exception) {
            emptyList()
        }
        val types = fromMeta.ifEmpty { fromProtocol }
            .ifEmpty { listOf("-", "Normal", "ZD", "ZB", "TDIFF", "TMAX", "RAS", "LINEAR") }
        if (types.contains("-")) types else listOf("-") + types
    }

    var paintType by remember(detChoices) {
        mutableStateOf(detChoices.firstOrNull { it != "-" } ?: "-")
    }

    val devices = remember(groupsState, cellsState) {
        val cellsByGroup = cellsState.groupBy { it.groupId }
        groupsState.groupBy { devicePrefixOf(it.groupId) }.map { (prefix, grpsUnsorted) ->
            // Numeric-aware sort by Gruppennummer (the part after "::") so a newly added
            // group or a renumbered one always appears in the right position -- this recomputes
            // (and so re-sorts) automatically whenever groupsState changes, i.e. right after
            // GrpNumField's onCommit/addGroupToDevice round-trips through the DB, not just on
            // next screen open.
            val grps = grpsUnsorted.sortedWith(
                compareBy(
                    { it.groupId.substringAfterLast("::").toIntOrNull() ?: Int.MAX_VALUE },
                    { it.groupId.substringAfterLast("::") }
                )
            )
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
                                color = if (selected) typeSolidColor(dt, configuredColors) else Color.White,
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
                            configuredColors = configuredColors,
                            configuredKurzzeichen = configuredKurzzeichen,
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
    configuredColors: Map<String, String>,
    configuredKurzzeichen: Map<String, String>,
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
    val deleteColWidth = 28.dp

    // Bereiche (Sektionen) dieses Geräts -- synced vom Server oder vor Ort neu angelegt
    // (siehe updateGroupBereich). Leer, solange noch nie ein Bereich definiert wurde.
    val bereicheOptions by viewModel.getBereicheForDevice(protocolId, device.prefix)
        .collectAsState(initial = emptyList())

    val colWidthPx = with(density) { colWidth.toPx() }
    val rowHeightPx = with(density) { rowHeight.toPx() }

    // Always-current references for the long-lived pointerInput coroutine.
    val currentGroups = rememberUpdatedState(device.groups)
    val currentPaintType = rememberUpdatedState(paintType)
    val currentNCols = rememberUpdatedState(nCols)

    // Per-row delete: which group (if any) is currently pending the confirm dialog --
    // replaces the old "decrement the Gruppen-stepper until it happens to hit the group
    // you want gone" workaround with a direct delete on the specific row.
    var groupPendingDelete by remember { mutableStateOf<ProtocolGroupEntity?>(null) }

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

    groupPendingDelete?.let { pending ->
        AlertDialog(
            onDismissRequest = { groupPendingDelete = null },
            title = { Text("Gruppe löschen", fontWeight = FontWeight.Bold) },
            text = {
                val label = pending.groupId.substringAfterLast("::") +
                    (pending.groupName.takeIf { it.isNotBlank() }?.let { " ($it)" } ?: "")
                Text("Gruppe \"$label\" wirklich löschen? Alle Melder und Prüfwerte dieser Gruppe gehen dabei verloren.")
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.removeGroupFromDevice(protocolId, pending.groupId)
                    groupPendingDelete = null
                }) {
                    Text("Löschen", color = IndustrialError, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { groupPendingDelete = null }) {
                    Text("Abbrechen", color = IndustrialOutline)
                }
            }
        )
    }

    var showBereicheAssignDialog by remember { mutableStateOf(false) }
    if (showBereicheAssignDialog) {
        BereicheAssignDialog(
            protocolId = protocolId,
            device = device,
            options = bereicheOptions,
            viewModel = viewModel,
            onDismiss = { showBereicheAssignDialog = false }
        )
    }

    Column(modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
        // --- Device header: name + Melder-Stepper + Bereiche-Button ---
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
            // Dedicated button instead of an inline per-row picker column -- saves
            // horizontal space in the grid (which was cramped, see StepperControl
            // above) and keeps Bereich-assignment as one focused screen rather than
            // yet another frozen column to scroll past.
            TextButton(onClick = { showBereicheAssignDialog = true }) {
                Icon(Icons.AutoMirrored.Filled.List, contentDescription = null, tint = IndustrialPrimary, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("Bereiche", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = IndustrialPrimary)
            }
            Spacer(Modifier.width(4.dp))
            StepperControl(
                label = "Melder",
                value = nCols,
                onDecrement = { onColsChange(nCols - 1) },
                onIncrement = { onColsChange(nCols + 1) }
            )
        }

        // --- Grid ---
        // Only Grp is frozen -- Bezeichnung now scrolls together with the Melder cells
        // (it used to be frozen too, but at nameColWidth it left almost no screen width
        // for the actual Melder columns on a phone, see user report).
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White)
                .border(1.dp, IndustrialOutlineVariant)
        ) {
            // Frozen left column: Grp (+ delete) only.
            Column(modifier = Modifier.width(deleteColWidth + grpColWidth)) {
                Row(modifier = Modifier.height(headerHeight)) {
                    Spacer(Modifier.width(deleteColWidth).height(headerHeight))
                    GridHeaderCell("Grp", grpColWidth, headerHeight)
                }
                device.groups.forEach { g ->
                    key(g.groupId) {
                        Row(modifier = Modifier.height(rowHeight), verticalAlignment = Alignment.CenterVertically) {
                            IconButton(
                                onClick = {
                                    if (device.groups.size <= 1) {
                                        Toast.makeText(context, "Letzte Gruppe kann nicht entfernt werden", Toast.LENGTH_SHORT).show()
                                    } else {
                                        groupPendingDelete = g
                                    }
                                },
                                modifier = Modifier.width(deleteColWidth).height(rowHeight)
                            ) {
                                Icon(
                                    Icons.Default.Delete,
                                    contentDescription = "Gruppe löschen",
                                    tint = IndustrialError,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
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
                        }
                    }
                }
            }

            // Scrollable: Bezeichnung + numbered Melder columns, all moving together.
            val hScroll = rememberScrollState()
            Column(
                modifier = Modifier
                    .weight(1f)
                    .horizontalScroll(hScroll)
            ) {
                Row(modifier = Modifier.height(headerHeight)) {
                    GridHeaderCell("Bezeichnung", nameColWidth, headerHeight, alignStart = true)
                    (1..nCols).forEach { c ->
                        GridHeaderCell(c.toString(), colWidth, headerHeight, subdued = true)
                    }
                }
                Row {
                    // Bezeichnung column -- scrolls with everything else now, but stays
                    // OUTSIDE the pointerInput Box below so paintRect's column-index math
                    // (x / colWidthPx) is never offset by this column's width.
                    Column {
                        device.groups.forEach { g ->
                            key(g.groupId) {
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
                                                configuredColors = configuredColors,
                                                configuredKurzzeichen = configuredKurzzeichen,
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

        // --- Add-row affordance: replaces the old "increment the stepper" workflow
        // with a direct "append a group at the end" action, mirroring the per-row delete. ---
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable {
                    if (device.groups.size >= 200) {
                        Toast.makeText(context, "Maximale Gruppenanzahl erreicht", Toast.LENGTH_SHORT).show()
                    } else {
                        viewModel.addGroupToDevice(protocolId, device.prefix)
                    }
                }
                .padding(vertical = 8.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Add, contentDescription = null, tint = IndustrialPrimary, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(4.dp))
            Text("Meldegruppe hinzufügen", fontSize = 12.sp, color = IndustrialPrimary, fontWeight = FontWeight.Medium)
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

/** Full-screen Bereich-assignment dialog for one device -- a dedicated screen
 * instead of a per-row picker column, which left almost no width for the
 * actual Melder grid on a phone. Pick a Bereich as a chip at the top, then tap
 * rows below to toggle their membership -- the touch equivalent of the WebUI
 * shuttle's arrow buttons (drag & drop doesn't translate well to a phone-sized
 * single list, so this uses direct tap-to-toggle instead). */
@Composable
private fun BereicheAssignDialog(
    protocolId: String,
    device: EditorDevice,
    options: List<String>,
    viewModel: MainViewModel,
    onDismiss: () -> Unit
) {
    // No `options` key on remember: `options` is a freshly-collected list on every
    // sync/rename/delete, and keying on it would reset the selection back to
    // firstOrNull() on every such change. Selection is instead updated explicitly
    // wherever it needs to track a rename/delete/add outcome, below.
    var selectedBereich by remember { mutableStateOf(options.firstOrNull() ?: "") }
    var newNameInput by remember { mutableStateOf("") }
    var showNewInput by remember { mutableStateOf(false) }
    var renameDialogFor by remember { mutableStateOf<String?>(null) }
    var renameText by remember { mutableStateOf("") }
    var deleteConfirmFor by remember { mutableStateOf<String?>(null) }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(modifier = Modifier.fillMaxSize(), color = IndustrialBackground) {
            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier.fillMaxWidth().background(Color.White).padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Bereiche zuweisen — ${device.displayName}",
                        fontWeight = FontWeight.Bold, fontSize = 14.sp, color = IndustrialPrimary,
                        modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = null, tint = IndustrialPrimary)
                    }
                }
                HorizontalDivider(color = IndustrialOutlineVariant)

                // Bereich chips: tap to select which Bereich the list below toggles membership for.
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White)
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    options.forEach { name ->
                        val isSelected = name == selectedBereich
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = if (isSelected) IndustrialPrimary else LightSurfaceHigh,
                            modifier = Modifier.clickable { selectedBereich = name }
                        ) {
                            Text(
                                text = name,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isSelected) Color.White else IndustrialOnSurface,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp)
                            )
                        }
                        // Rename/delete only shown for the selected chip -- keeps the
                        // collapsed chip row compact while still reachable.
                        if (isSelected) {
                            IconButton(
                                onClick = { renameDialogFor = name; renameText = name },
                                modifier = Modifier.size(28.dp)
                            ) {
                                Icon(Icons.Default.Edit, contentDescription = "Bereich umbenennen", tint = IndustrialOutline, modifier = Modifier.size(15.dp))
                            }
                            IconButton(
                                onClick = { deleteConfirmFor = name },
                                modifier = Modifier.size(28.dp)
                            ) {
                                Icon(Icons.Default.Delete, contentDescription = "Bereich löschen", tint = IndustrialError, modifier = Modifier.size(15.dp))
                            }
                        }
                    }
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = Color.Transparent,
                        border = androidx.compose.foundation.BorderStroke(1.dp, IndustrialPrimary),
                        modifier = Modifier.clickable { showNewInput = true }
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp)) {
                            Icon(Icons.Default.Add, contentDescription = null, tint = IndustrialPrimary, modifier = Modifier.size(13.dp))
                            Spacer(Modifier.width(3.dp))
                            Text("Neu", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = IndustrialPrimary)
                        }
                    }
                }
                if (showNewInput) {
                    Row(
                        modifier = Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = newNameInput,
                            onValueChange = { newNameInput = it },
                            singleLine = true,
                            placeholder = { Text("z.B. Station 4", fontSize = 12.sp) },
                            textStyle = TextStyle(fontSize = 12.sp),
                            modifier = Modifier.weight(1f)
                        )
                        TextButton(onClick = {
                            val name = newNameInput.trim()
                            if (name.isNotEmpty()) {
                                // Defines the Bereich directly -- no second confirmation dialog,
                                // this text field IS the (only) name prompt.
                                viewModel.addBereichToDevice(protocolId, device.prefix, name)
                                selectedBereich = name
                            }
                            newNameInput = ""
                            showNewInput = false
                        }) { Text("OK", fontWeight = FontWeight.Bold) }
                        TextButton(onClick = { newNameInput = ""; showNewInput = false }) {
                            Text("Abbrechen", color = IndustrialOutline)
                        }
                    }
                }
                HorizontalDivider(color = IndustrialOutlineVariant)

                renameDialogFor?.let { oldName ->
                    AlertDialog(
                        onDismissRequest = { renameDialogFor = null },
                        title = { Text("Bereich umbenennen", fontWeight = FontWeight.Bold) },
                        text = {
                            OutlinedTextField(
                                value = renameText,
                                onValueChange = { renameText = it },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                        },
                        confirmButton = {
                            TextButton(onClick = {
                                val newName = renameText.trim()
                                if (newName.isNotEmpty() && newName != oldName) {
                                    viewModel.renameBereichForDevice(protocolId, device.prefix, oldName, newName)
                                    selectedBereich = newName
                                }
                                renameDialogFor = null
                            }) { Text("Speichern", color = IndustrialPrimary, fontWeight = FontWeight.Bold) }
                        },
                        dismissButton = {
                            TextButton(onClick = { renameDialogFor = null }) { Text("Abbrechen", color = IndustrialOutline) }
                        }
                    )
                }

                deleteConfirmFor?.let { name ->
                    AlertDialog(
                        onDismissRequest = { deleteConfirmFor = null },
                        title = { Text("Bereich löschen", fontWeight = FontWeight.Bold) },
                        text = { Text("Bereich \"$name\" wirklich löschen? Zugeordnete Meldegruppen verlieren dadurch ihre Bereichszuordnung (die Gruppen selbst bleiben erhalten).") },
                        confirmButton = {
                            TextButton(onClick = {
                                viewModel.deleteBereichForDevice(protocolId, device.prefix, name)
                                if (selectedBereich == name) selectedBereich = options.firstOrNull { it != name } ?: ""
                                deleteConfirmFor = null
                            }) { Text("Löschen", color = IndustrialError, fontWeight = FontWeight.Bold) }
                        },
                        dismissButton = {
                            TextButton(onClick = { deleteConfirmFor = null }) { Text("Abbrechen", color = IndustrialOutline) }
                        }
                    )
                }

                if (options.isEmpty() && !showNewInput) {
                    Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                        Text(
                            "Noch kein Bereich definiert -- oben \"Neu\" antippen.",
                            fontSize = 12.sp, color = IndustrialOutline, textAlign = TextAlign.Center
                        )
                    }
                }

                LazyColumn(modifier = Modifier.weight(1f)) {
                    items(device.groups, key = { it.groupId }) { g ->
                        val isAssigned = selectedBereich.isNotEmpty() && g.bereich == selectedBereich
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = selectedBereich.isNotEmpty()) {
                                    viewModel.updateGroupBereich(protocolId, g.groupId, if (isAssigned) "" else selectedBereich)
                                }
                                .background(Color.White)
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = g.groupId.substringAfterLast("::") +
                                        (g.groupName.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""),
                                    fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = IndustrialOnSurface,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis
                                )
                                if (!g.bereich.isNullOrBlank() && g.bereich != selectedBereich) {
                                    Text(
                                        text = "aktuell: ${g.bereich}",
                                        fontSize = 10.sp, color = IndustrialOutline
                                    )
                                }
                            }
                            Icon(
                                imageVector = if (isAssigned) Icons.Default.Check else Icons.Default.Add,
                                contentDescription = null,
                                tint = if (isAssigned) Color(0xFF15803D) else IndustrialOutlineVariant
                            )
                        }
                        HorizontalDivider(color = IndustrialOutlineVariant)
                    }
                }
            }
        }
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
    configuredColors: Map<String, String>,
    configuredKurzzeichen: Map<String, String>,
    onClick: () -> Unit
) {
    val inactive = type == "-" || type.isEmpty()
    Box(
        modifier = Modifier
            .width(width)
            .height(height)
            .background(if (inactive) Color(0xFFF8FAFC) else typePaleColor(type, configuredColors))
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
                text = typeAbbrev(type, configuredKurzzeichen),
                fontSize = 9.sp,
                fontWeight = FontWeight.SemiBold,
                color = typeSolidColor(type, configuredColors)
            )
        }
    }
}
