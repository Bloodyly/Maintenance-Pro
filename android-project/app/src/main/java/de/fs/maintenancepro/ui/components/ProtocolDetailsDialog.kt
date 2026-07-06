package de.fs.maintenancepro.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.fs.maintenancepro.ui.theme.*
import de.fs.maintenancepro.ui.viewmodel.MainViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun ProtocolDetailsDialog(
    protocolId: String,
    viewModel: MainViewModel,
    onDismiss: () -> Unit
) {
    var details by remember { mutableStateOf<MainViewModel.ProtocolDetailsData?>(null) }

    LaunchedEffect(protocolId) {
        details = viewModel.getProtocolDetails(protocolId)
    }

    val data = details
    if (data == null) {
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("Objektdetails", fontWeight = FontWeight.Bold, color = IndustrialPrimary) },
            text = {
                Box(modifier = Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = IndustrialPrimary)
                }
            },
            confirmButton = {
                TextButton(onClick = onDismiss) { Text("Schließen", fontWeight = FontWeight.Bold, color = IndustrialPrimary) }
            }
        )
        return
    }

    val lastEditedTime = if (data.lastEditedAt > 0L) {
        val sdf = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.GERMAN)
        sdf.format(Date(data.lastEditedAt))
    } else {
        "Unbearbeitet"
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(Icons.Default.Info, contentDescription = null, tint = IndustrialPrimary)
                Text(
                    text = "Objektdetails",
                    fontWeight = FontWeight.Bold,
                    color = IndustrialPrimary,
                    fontSize = 18.sp
                )
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Section 1: Basic Config Row Columns
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "BEZEICHNUNG",
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                color = IndustrialOutline
                            )
                            Text(
                                text = data.clientName,
                                fontWeight = FontWeight.SemiBold,
                                color = IndustrialOnSurface,
                                fontSize = 14.sp
                            )
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "ANLAGENTYP",
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                color = IndustrialOutline
                            )
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                Box(
                                    modifier = Modifier
                                        .background(IndustrialPrimaryContainer, RoundedCornerShape(4.dp))
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = data.systemType,
                                        color = IndustrialOnPrimaryContainer,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }

                    Column {
                        Text(
                            text = "ADRESSE",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = IndustrialOutline
                        )
                        Text(
                            text = data.address,
                            color = IndustrialOnSurface,
                            fontSize = 13.sp
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "VERTRAGSNUMMER",
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                color = IndustrialOutline
                            )
                            Text(
                                text = data.contractNumber,
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                color = IndustrialPrimary
                            )
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "WARTUNGSINTERVALL",
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                color = IndustrialOutline
                            )
                            Text(
                                text = data.interval,
                                fontSize = 13.sp,
                                color = IndustrialOnSurface
                            )
                        }
                    }
                }

                HorizontalDivider(color = IndustrialOutlineVariant)

                // Section 2: Metadata / Counts
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "ZULETZT BEARBEITET",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = IndustrialOutline
                        )
                        Text(
                            text = lastEditedTime,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 13.sp,
                            color = IndustrialOnSurface
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "MELDER (AUSGELÖST/GESAMT)",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = IndustrialOutline
                        )
                        Text(
                            text = "${data.triggeredCount} / ${data.activeCount}",
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                            color = IndustrialPrimary
                        )
                    }
                }

                HorizontalDivider(color = IndustrialOutlineVariant)

                // Section 3: Defective Detectors List
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "DEFEKTE MELDER (${data.defectiveList.size})",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFEF4444)
                    )

                    if (data.defectiveList.isNotEmpty()) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 120.dp)
                                .background(Color(0xFFFEF2F2), RoundedCornerShape(4.dp))
                                .border(1.dp, Color(0xFFFCA5A5), RoundedCornerShape(4.dp))
                                .padding(8.dp)
                                .verticalScroll(rememberScrollState()),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            data.defectiveList.forEach { def ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        // groupId is "{device}::{grp_num}" on the wire -- show only the Gruppen-Nummer.
                                        text = "${def.groupName} • ${def.groupId.substringAfterLast("::")} (Slot ${def.slotKey}) - ${def.type}",
                                        fontSize = 10.sp,
                                        color = Color(0xFFB91C1C),
                                        modifier = Modifier.weight(1f)
                                    )
                                    Box(
                                        modifier = Modifier
                                            .background(Color(0xFFFCA5A5), RoundedCornerShape(2.dp))
                                            .padding(horizontal = 4.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = "DEFEKT",
                                            fontSize = 8.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFFB91C1C)
                                        )
                                    }
                                }
                            }
                        }
                    } else {
                        Text(
                            text = "Keine defekten Melder verzeichnet.",
                            fontSize = 11.sp,
                            color = IndustrialOutline
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(
                    text = "Schließen",
                    fontWeight = FontWeight.Bold,
                    color = IndustrialPrimary
                )
            }
        }
    )
}
