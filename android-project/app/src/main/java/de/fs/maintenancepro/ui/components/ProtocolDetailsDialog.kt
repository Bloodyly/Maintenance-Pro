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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.fs.maintenancepro.ui.theme.*
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun ProtocolDetailsDialog(
    payloadJson: String,
    onDismiss: () -> Unit
) {
    val rootJson = remember(payloadJson) {
        JSONObject(payloadJson)
    }

    val name = rootJson.optString("client_name", "Unbekannt")
    val systemType = rootJson.optString("system_type", "BMA")
    val address = rootJson.optString("address", "")
    val contractNumber = rootJson.optString("contract_number", "")
    val interval = rootJson.optString("interval", "Jährlich")
    val lastEditedBy = rootJson.optString("last_edited_by", "Thomas Prantl")
    val lastEditedAtLong = rootJson.optLong("last_edited_at", 0L)
    val lastEditedTime = if (lastEditedAtLong > 0L) {
        val sdf = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.GERMAN)
        sdf.format(Date(lastEditedAtLong))
    } else {
        "Unbearbeitet"
    }

    // Detector stats calculations
    var activeCount = 0
    var triggeredCount = 0
    val defectiveList = remember(payloadJson) {
        val list = mutableListOf<DefectiveItem>()
        val rows = rootJson.optJSONArray("rows")
        if (rows != null) {
            for (i in 0 until rows.length()) {
                val row = rows.getJSONObject(i)
                val groupId = row.optString("group_id", "")
                val groupName = row.optString("group_name", "Standardgruppe")
                val cells = row.optJSONArray("cells")
                if (cells != null) {
                    for (j in 0 until cells.length()) {
                        val cell = cells.getJSONObject(j)
                        val detectorType = cell.optString("detector_type", "-")
                        val value = cell.optString("value", "")
                        if (detectorType != "-") {
                            activeCount++
                            if (value.isNotEmpty() && value != "Def.") {
                                triggeredCount++
                            }
                            if (value == "Def.") {
                                list.add(
                                    DefectiveItem(
                                        groupId = groupId,
                                        groupName = groupName,
                                        slotKey = cell.optString("slot_key", ""),
                                        type = detectorType
                                    )
                                )
                            }
                        }
                    }
                }
            }
        }
        list
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
                                text = name,
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
                                        text = systemType,
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
                            text = address,
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
                                text = contractNumber,
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
                                text = interval,
                                fontSize = 13.sp,
                                color = IndustrialOnSurface
                            )
                        }
                    }
                }

                HorizontalDivider(color = IndustrialOutlineVariant)

                // Section 2: Metadata / Techniker / Counts
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "BEARBEITET DURCH",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = IndustrialOutline
                        )
                        Text(
                            text = lastEditedBy,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 13.sp,
                            color = IndustrialOnSurface
                        )
                        Text(
                            text = lastEditedTime,
                            fontSize = 11.sp,
                            color = IndustrialOutline
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
                            text = "$triggeredCount / $activeCount",
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
                        text = "DEFEKTE MELDER (${defectiveList.size})",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFEF4444)
                    )

                    if (defectiveList.isNotEmpty()) {
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
                            defectiveList.forEach { def ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "${def.groupName} • ${def.groupId} (Slot ${def.slotKey}) - ${def.type}",
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

data class DefectiveItem(
    val groupId: String,
    val groupName: String,
    val slotKey: String,
    val type: String
)
