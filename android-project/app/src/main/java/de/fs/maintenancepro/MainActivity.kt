package de.fs.maintenancepro

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import dagger.hilt.android.AndroidEntryPoint
import de.fs.maintenancepro.ui.screens.*
import de.fs.maintenancepro.ui.theme.IndustrialOutlineVariant
import de.fs.maintenancepro.ui.theme.LightSurfaceLow
import de.fs.maintenancepro.ui.theme.MaintenanceProTheme
import de.fs.maintenancepro.ui.viewmodel.MainViewModel

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaintenanceProTheme {
                val navController = rememberNavController()
                val viewModel: MainViewModel = hiltViewModel()

                // Bottom Tab selection state
                var selectedTab by remember { mutableStateOf(0) }

                Scaffold(
                    modifier = Modifier.fillMaxSize(),
                    bottomBar = {
                        NavigationBar(containerColor = LightSurfaceLow) {
                            NavigationBarItem(
                                selected = selectedTab == 0,
                                onClick = {
                                    selectedTab = 0
                                    navController.navigate("search") {
                                        popUpTo("search") { saveState = true }
                                        launchSingleTop = true
                                    }
                                },
                                icon = { Icon(Icons.Default.Search, contentDescription = null) },
                                label = { Text("Suche") }
                            )
                            NavigationBarItem(
                                selected = selectedTab == 1,
                                onClick = {
                                    selectedTab = 1
                                    navController.navigate("downloaded") {
                                        popUpTo("search") { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                },
                                icon = { Icon(Icons.Default.Checklist, contentDescription = null) },
                                label = { Text("Geladen") }
                            )
                            NavigationBarItem(
                                selected = selectedTab == 2,
                                onClick = {
                                    selectedTab = 2
                                    navController.navigate("archive") {
                                        popUpTo("search") { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                },
                                icon = { Icon(Icons.Default.List, contentDescription = null) },
                                label = { Text("Archiv") }
                            )
                            NavigationBarItem(
                                selected = selectedTab == 3,
                                onClick = {
                                    selectedTab = 3
                                    navController.navigate("settings") {
                                        popUpTo("search") { saveState = true }
                                        launchSingleTop = true
                                    }
                                },
                                icon = { Icon(Icons.Default.Settings, contentDescription = null) },
                                label = { Text("Settings") }
                            )
                        }
                    }
                ) { innerPadding ->
                    NavHost(
                        navController = navController,
                        startDestination = "search",
                        modifier = Modifier.padding(innerPadding)
                    ) {
                        composable("search") {
                            SearchScreen(
                                viewModel = viewModel,
                                onNavigateToInspection = { id ->
                                    navController.navigate("inspection/$id")
                                },
                                onNavigateToSettings = {
                                    selectedTab = 3
                                    navController.navigate("settings")
                                }
                            )
                        }
                        
                        composable("downloaded") {
                            DownloadedScreen(
                                viewModel = viewModel,
                                onNavigateToInspection = { id ->
                                    navController.navigate("inspection/$id")
                                }
                            )
                        }

                        composable("archive") {
                            ArchiveScreen(
                                viewModel = viewModel,
                                onNavigateToInspection = { id ->
                                    navController.navigate("inspection/$id")
                                }
                            )
                        }

                        composable("settings") {
                            SettingsScreen(
                                viewModel = viewModel,
                                onNavigateBack = {
                                    selectedTab = 0
                                    navController.popBackStack()
                                }
                            )
                        }

                        composable(
                            route = "inspection/{protocolId}",
                            arguments = listOf(navArgument("protocolId") { type = NavType.StringType })
                        ) { backStackEntry ->
                            val pId = backStackEntry.arguments?.getString("protocolId") ?: ""
                            InspectionScreen(
                                viewModel = viewModel,
                                protocolId = pId,
                                onNavigateToEditMatrix = { id ->
                                    navController.navigate("edit/$id")
                                },
                                onNavigateBack = {
                                    navController.popBackStack()
                                }
                            )
                        }

                        composable(
                            route = "edit/{protocolId}",
                            arguments = listOf(navArgument("protocolId") { type = NavType.StringType })
                        ) { backStackEntry ->
                            val pId = backStackEntry.arguments?.getString("protocolId") ?: ""
                            MatrixEditScreen(
                                viewModel = viewModel,
                                protocolId = pId,
                                onNavigateBack = {
                                    navController.popBackStack()
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}
