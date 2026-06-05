package de.fs.maintenancepro.ui.screens

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.ArrowBack
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

    val rootJson = remember(protocolEntity.decryptedPayloadJson) {
        JSONObject(protocolEntity.decryptedPayloadJson)
    }

    val columnsArray = rootJson.getJSONObject("definition").getJSONArray("columns")
    val rowsArray = rootJson.getJSONArray("rows")

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
                border = BorderStroke(2.dp, IndustrialError)
            ) {
                Row(modifier = Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = IndustrialError)
                    Column {
                        Text(text = stringResource(R.string.matrix_warning_title), fontWeight = FontWeight.Bold, color = IndustrialOnErrorContainer)
                        Text(text = stringResource(R.string.matrix_warning_desc), fontSize = 14.sp, color = IndustrialOnErrorContainer)
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
                        val count = rowsArray.length() + 1
                        val newGrpId = "GRP %02d".format(count)
                        val colKeys = (1..columnsArray.length()).map { it.toString() }
                        viewModel.addGroup(protocolId, newGrpId, "Neue Standardgruppe", colKeys)
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
                        val count = columnsArray.length() + 1
                        viewModel.addSlotColumn(protocolId, count.toString(), "Slot $count")
                        Toast.makeText(context, "Slot $count Spalte hinzugefügt.", Toast.LENGTH_SHORT).show()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = IndustrialPrimary),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.AddCircle, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.btn_add_slot))
                }
            }

            // Simple group list representations
            Text(text = "Aktuelle Gruppen:", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            for (i in 0 until rowsArray.length()) {
                val rowObj = rowsArray.getJSONObject(i)
                val grpId = rowObj.getString("group_id")
                val grpName = rowObj.getString("group_name")

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    border = BorderStroke(1.dp, IndustrialOutlineVariant)
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(text = grpId, fontWeight = FontWeight.Bold, color = IndustrialPrimary)
                            Text(text = grpName, fontSize = 14.sp, color = IndustrialOutline)
                        }
                    }
                }
            }
        }
    }
}
