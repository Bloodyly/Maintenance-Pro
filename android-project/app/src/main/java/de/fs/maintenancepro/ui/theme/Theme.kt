package de.fs.maintenancepro.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val LightColorScheme = lightColorScheme(
    primary = IndustrialPrimary,
    onPrimary = IndustrialOnPrimary,
    primaryContainer = IndustrialPrimaryContainer,
    onPrimaryContainer = IndustrialOnPrimaryContainer,
    secondary = IndustrialSecondary,
    onSecondary = IndustrialOnSecondary,
    secondaryContainer = IndustrialSecondaryContainer,
    onSecondaryContainer = IndustrialOnSecondaryContainer,
    background = IndustrialBackground,
    onBackground = IndustrialOnBackground,
    surface = IndustrialSurface,
    onSurface = IndustrialOnSurface,
    surfaceVariant = IndustrialSurfaceVariant,
    onSurfaceVariant = IndustrialOnSurfaceVariant,
    error = IndustrialError,
    onError = IndustrialOnError,
    errorContainer = IndustrialErrorContainer,
    onErrorContainer = IndustrialOnErrorContainer,
    outline = IndustrialOutline,
    outlineVariant = IndustrialOutlineVariant
)

@Composable
fun MaintenanceProTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    // We default to Light Industrial Theme as requested in Guidelines for high-visibility
    val colorScheme = LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
