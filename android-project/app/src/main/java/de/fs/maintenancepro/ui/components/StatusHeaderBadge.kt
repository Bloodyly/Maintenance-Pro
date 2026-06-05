package de.fs.maintenancepro.ui.components

import android.widget.Toast
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FiberManualRecord
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.fs.maintenancepro.ui.theme.IndustrialPrimary
import de.fs.maintenancepro.ui.viewmodel.MainViewModel

@Composable
fun StatusHeaderBadge(viewModel: MainViewModel) {
    val context = LocalContext.current
    val isOffline by viewModel.isOffline.collectAsState()
    val liveModus by viewModel.liveModusEnabled.collectAsState()
    var showDialog by remember { mutableStateOf(false) }

    // Pulsing alpha for active live mode dot
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val alphaPulse by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseAlpha"
    )

    Box(modifier = Modifier.padding(end = 16.dp)) {
        Row(
            modifier = Modifier
                .background(
                    color = when {
                        isOffline -> Color(0xFFE5E7EB) // Gray
                        liveModus -> Color(0xFFCCFBF1) // Teal / Live
                        else -> Color(0xFFDCFCE7) // Green / Online
                    },
                    shape = RoundedCornerShape(16.dp)
                )
                .clickable {
                    if (isOffline) {
                        Toast
                            .makeText(
                                context,
                                "Offline-Modus aktiv. Live-Modus erfordert eine aktive Verbindung.",
                                Toast.LENGTH_SHORT
                            )
                            .show()
                    } else {
                        showDialog = true
                    }
                }
                .padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            if (isOffline) {
                Icon(
                    imageVector = Icons.Default.WifiOff,
                    contentDescription = null,
                    tint = Color.Gray,
                    modifier = Modifier.size(14.dp)
                )
                Text(
                    text = "OFFLINE",
                    color = Color.Gray,
                    fontWeight = FontWeight.Bold,
                    fontSize = 11.sp
                )
            } else if (liveModus) {
                Icon(
                    imageVector = Icons.Default.FiberManualRecord,
                    contentDescription = null,
                    tint = Color(0xFF0D9488),
                    modifier = Modifier
                        .size(10.dp)
                        .alpha(alphaPulse)
                )
                Text(
                    text = "LIVE",
                    color = Color(0xFF0F766E),
                    fontWeight = FontWeight.Bold,
                    fontSize = 11.sp
                )
            } else {
                Icon(
                    imageVector = Icons.Default.Wifi,
                    contentDescription = null,
                    tint = Color(0xFF16A34A),
                    modifier = Modifier.size(14.dp)
                )
                Text(
                    text = "ONLINE",
                    color = Color(0xFF15803D),
                    fontWeight = FontWeight.Bold,
                    fontSize = 11.sp
                )
            }
        }
    }

    if (showDialog) {
        AlertDialog(
            onDismissRequest = { showDialog = false },
            title = {
                Text(
                    text = "Verbindungsstatus & Live-Modus",
                    fontWeight = FontWeight.Bold,
                    color = IndustrialPrimary
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        text = "Im Live-Modus (Multiplayer) können Sie simultan mit anderen Technikern am selben Protokoll arbeiten. Änderungen werden in Echtzeit synchronisiert.",
                        fontSize = 14.sp,
                        color = Color.DarkGray
                    )
                    
                    HorizontalDivider()
                    
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Live-Modus",
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp
                            )
                            Text(
                                text = "Änderungen live teilen & empfangen",
                                fontSize = 12.sp,
                                color = Color.Gray
                            )
                        }
                        Switch(
                            checked = liveModus,
                            onCheckedChange = { checked ->
                                viewModel.setLiveModusEnabled(checked)
                            }
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showDialog = false }) {
                    Text("Fertig", fontWeight = FontWeight.Bold, color = IndustrialPrimary)
                }
            }
        )
    }
}
