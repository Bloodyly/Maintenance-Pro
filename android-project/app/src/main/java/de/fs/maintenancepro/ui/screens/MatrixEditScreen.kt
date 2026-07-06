package de.fs.maintenancepro.ui.screens

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.fs.maintenancepro.R
import de.fs.maintenancepro.ui.theme.*
import de.fs.maintenancepro.ui.viewmodel.MainViewModel
import org.json.JSONArray

data class EditRowModel(
    val groupId: String,
    val groupName: String,
    val groupType: String,
    val cells: List<CellModel>
)

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

    // Structure editor now reads straight from the normalized tables — no JSON parsing needed.
    val groupsState by viewModel.getGroupsFlow(protocolId).collectAsState(initial = emptyList())
    val cellsState by viewModel.getCellsFlow(protocolId).collectAsState(initial = emptyList())

    val detChoices = remember(protocolEntity.detectorTypesJson) {
        try {
            val arr = JSONArray(protocolEntity.detectorTypesJson)
            if (arr.length() > 0) List(arr.length()) { i -> arr.getString(i) }
            else listOf("-", "Normal", "ZD", "ZB", "TDIFF", "TMAX", "RAS", "LINEAR")
        } catch (e: Exception) {
            listOf("-", "Normal", "ZD", "ZB", "TDIFF", "TMAX", "RAS", "LINEAR")
        }
    }

    val rowsList = remember(groupsState, cellsState) {
        val cellsByGroup = cellsState.groupBy { it.groupId }
        groupsState.map { g ->
            EditRowModel(
                groupId = g.groupId,
                groupName = g.groupName,
                groupType = g.groupType,
                cells = cellsByGroup[g.groupId]?.map { c -> CellModel(c.slotKey, c.detectorType, c.value) } ?: emptyList()
            )
        }
    }

    var activeCellForDetectorDialog by remember { mutableStateOf<Pair<EditRowModel, CellModel>?>(null) }

    // Dialog for picking detector types for a specific slot cell
    activeCellForDetectorDialog?.let { (row, cell) ->
        AlertDialog(
            onDismissRequest = { activeCellForDetectorDialog = null },
            title = { Text("Slot ${cell.slotKey} Typisierung", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = "Gewünschten Melder-Typ oder Status für diesen Tabelleneintrag auswählen:",
                        fontSize = 13.sp,
                        color = IndustrialOutline
                    )
                    Spacer(Modifier.height(8.dp))
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 240.dp)
                    ) {
                        items(detChoices) { choice ->
                            val isCurrent = cell.detectorType == choice
                            val displayName = if (choice == "-") "- (Deaktiviert)" else choice
                            
                            Surface(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        viewModel.updateCellDetectorType(protocolId, row.groupId, cell.slotKey, choice)
                                        activeCellForDetectorDialog = null
                                        Toast.makeText(context, "Slot ${cell.slotKey} auf $displayName aktualisiert", Toast.LENGTH_SHORT).show()
                                    }
                                    .padding(vertical = 10.dp, horizontal = 14.dp),
                                color = if (isCurrent) IndustrialPrimaryContainer else Color.Transparent,
                                shape = RoundedCornerShape(4.dp)
                            ) {
                                Text(
                                    text = displayName,
                                    fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Normal,
                                    color = if (isCurrent) IndustrialPrimary else IndustrialOnSurface,
                                    fontSize = 14.sp
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { activeCellForDetectorDialog = null }) {
                    Text("Abbrechen", color = IndustrialOutline)
                }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.title_matrix_edit), fontWeight = FontWeight.Bold, color = IndustrialPrimary) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
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
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Warning Alert
            Card(
                colors = CardDefaults.cardColors(containerColor = IndustrialErrorContainer),
                border = BorderStroke(1.dp, IndustrialError),
                shape = RoundedCornerShape(8.dp)
            ) {
                Row(modifier = Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = IndustrialError)
                    Column {
                        Text(text = stringResource(R.string.matrix_warning_title), fontWeight = FontWeight.Bold, color = IndustrialOnErrorContainer)
                        Text(text = stringResource(R.string.matrix_warning_desc), fontSize = 13.sp, color = IndustrialOnErrorContainer)
                    }
                }
            }

            // Controls
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Button(
                    onClick = {
                        val count = rowsList.size + 1
                        val newGrpId = "GRP %02d".format(count)
                        val slotKeys = rowsList.firstOrNull()?.cells?.map { it.slotKey } ?: listOf("1", "2", "3", "4")
                        viewModel.addGroup(protocolId, newGrpId, "Neue Standardgruppe", slotKeys)
                        Toast.makeText(context, "$newGrpId hinzugefügt.", Toast.LENGTH_SHORT).show()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = IndustrialPrimary),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.btn_add_group))
                }

                Button(
                    onClick = {
                        val slotsCount = rowsList.firstOrNull()?.cells?.size ?: 0
                        val newIndex = slotsCount + 1
                        viewModel.addSlotColumn(protocolId, newIndex.toString(), "Slot $newIndex")
                        Toast.makeText(context, "Slot $newIndex Spalte hinzugefügt.", Toast.LENGTH_SHORT).show()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = IndustrialPrimary),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.AddCircle, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.btn_add_slot))
                }
            }

            Text(text = "Segmente und Gruppen verwalten:", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = IndustrialPrimary)

            // Render rich editor cards
            rowsList.forEach { row ->
                key(row.groupId) {
                    RowEditCard(
                        protocolId = protocolId,
                        row = row,
                        viewModel = viewModel,
                        onSelectCell = { r, c ->
                            activeCellForDetectorDialog = Pair(r, c)
                        }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RowEditCard(
    protocolId: String,
    row: EditRowModel,
    viewModel: MainViewModel,
    onSelectCell: (EditRowModel, CellModel) -> Unit
) {
    // row.groupId is "{device}::{grp_num}" on the wire -- only the Gruppen-Nummer is
    // meaningful for a technician to see/edit; the device prefix stays fixed underneath.
    val devicePrefix = remember(row.groupId) { row.groupId.substringBeforeLast("::", "") }
    val grpNumOnly = remember(row.groupId) { row.groupId.substringAfterLast("::") }

    var grpIdInput by remember(row.groupId) { mutableStateOf(grpNumOnly) }
    var grpNameInput by remember(row.groupName) { mutableStateOf(row.groupName) }
    var showDeleteDialog by remember { mutableStateOf(false) }

    val context = LocalContext.current

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Segment löschen", fontWeight = FontWeight.Bold) },
            text = { Text("Möchten Sie die Gruppe \"$grpNumOnly\" wirklich löschen? Alle zugeordneten Prüfergebnisse dieses Segments werden dauerhaft entfernt!") },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteDialog = false
                    viewModel.deleteGroup(protocolId, row.groupId)
                    Toast.makeText(context, "Gruppe gelöscht.", Toast.LENGTH_SHORT).show()
                }) {
                    Text("Löschen", color = IndustrialError, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text("Abbrechen", color = IndustrialOutline)
                }
            }
        )
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, IndustrialOutlineVariant),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            // First Row: Group ID code + Delete Button
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = grpIdInput,
                    onValueChange = { grpIdInput = it },
                    label = { Text("Index-Kennung") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Done),
                    modifier = Modifier.weight(1f),
                    trailingIcon = {
                        if (grpIdInput != grpNumOnly) {
                            IconButton(onClick = {
                                if (grpIdInput.trim().isEmpty()) {
                                    Toast.makeText(context, "Index-ID darf nicht leer sein", Toast.LENGTH_SHORT).show()
                                } else {
                                    val newFullGroupId = if (devicePrefix.isNotEmpty()) "$devicePrefix::${grpIdInput.trim()}" else grpIdInput.trim()
                                    viewModel.updateGroupDetails(
                                        protocolId = protocolId,
                                        oldGroupId = row.groupId,
                                        newGroupId = newFullGroupId,
                                        newGroupName = grpNameInput,
                                        newGroupType = row.groupType
                                    )
                                    Toast.makeText(context, "Kennung aktualisiert.", Toast.LENGTH_SHORT).show()
                                }
                            }) {
                                Icon(Icons.Default.Check, contentDescription = "Übernehmen", tint = IndustrialPrimary)
                            }
                        }
                    }
                )

                IconButton(
                    onClick = { showDeleteDialog = true },
                    modifier = Modifier.size(48.dp)
                ) {
                    Icon(Icons.Default.Delete, contentDescription = "Löschen", tint = IndustrialError)
                }
            }

            // Second Row: Segment Name Textfield
            OutlinedTextField(
                value = grpNameInput,
                onValueChange = { newVal ->
                    grpNameInput = newVal
                    viewModel.updateGroupDetails(
                        protocolId = protocolId,
                        oldGroupId = row.groupId,
                        newGroupId = row.groupId,
                        newGroupName = newVal,
                        newGroupType = row.groupType
                    )
                },
                label = { Text("Name (Auslösegruppe / Einbauort)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            // Third Row: Option Type scroll list Chips
            Text(
                text = "Gruppentyp (Typisierung):",
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp,
                color = IndustrialOutline
            )

            val groupTypeOptions = listOf(
                "NAM" to "Normal",
                "AM" to "Alarm",
                "TECH" to "Störung",
                "HLK" to "HLK",
                "GLT" to "GLT",
                "VS" to "Verschluss"
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                groupTypeOptions.forEach { (typeVal, typeLabel) ->
                    val isSelected = row.groupType == typeVal
                    FilterChip(
                        selected = isSelected,
                        onClick = {
                            viewModel.updateGroupDetails(
                                protocolId = protocolId,
                                oldGroupId = row.groupId,
                                newGroupId = row.groupId,
                                newGroupName = row.groupName,
                                newGroupType = typeVal
                            )
                        },
                        label = { Text("$typeVal ($typeLabel)") },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = IndustrialPrimaryContainer,
                            selectedLabelColor = IndustrialPrimary
                        )
                    )
                }
            }

            HorizontalDivider(color = IndustrialOutlineVariant.copy(alpha = 0.5f), thickness = 0.5.dp)

            // Fourth Row: Slot column buttons
            Text(
                text = "Melder-Typisierung je Spalten-Slot (Tippen zum Ändern):",
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp,
                color = IndustrialOutline
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                row.cells.forEach { cell ->
                    val hasDet = cell.detectorType != "-"
                    val displayType = if (cell.detectorType == "-") "Inaktiv" else cell.detectorType

                    Card(
                        modifier = Modifier.clickable {
                            onSelectCell(row, cell)
                        },
                        colors = CardDefaults.cardColors(
                            containerColor = if (hasDet) LightSurfaceHigh else Color.Transparent
                        ),
                        border = BorderStroke(1.dp, if (hasDet) IndustrialOutlineVariant else IndustrialOutlineVariant.copy(alpha = 0.4f)),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Column(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "Slot ${cell.slotKey}",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (hasDet) IndustrialPrimary else IndustrialOutline
                            )
                            Text(
                                text = displayType,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = if (hasDet) IndustrialPrimary else IndustrialOutline.copy(alpha = 0.6f)
                            )
                        }
                    }
                }
            }
        }
    }
}
