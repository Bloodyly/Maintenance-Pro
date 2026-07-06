package de.fs.maintenancepro.ui.components

import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.zxing.BinaryBitmap
import com.google.zxing.MultiFormatReader
import com.google.zxing.NotFoundException
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Live camera preview that decodes QR codes from the feed using ZXing, invoking
 * [onScanned] exactly once (on the main thread) as soon as a code is recognized.
 * Caller is responsible for having already obtained camera permission.
 */
@Composable
fun QrScannerView(
    modifier: Modifier = Modifier,
    onScanned: (String) -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val currentOnScanned = rememberUpdatedState(onScanned)
    val hasScanned = remember { AtomicBoolean(false) }
    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }
    val mainExecutor = remember { ContextCompat.getMainExecutor(context) }

    DisposableEffect(Unit) {
        onDispose { analysisExecutor.shutdown() }
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            val previewView = PreviewView(ctx)
            bindCameraForQrScanning(
                ctx = ctx,
                previewView = previewView,
                lifecycleOwner = lifecycleOwner,
                analysisExecutor = analysisExecutor,
                mainExecutor = mainExecutor,
                hasScanned = hasScanned,
                onScanned = { text -> currentOnScanned.value(text) }
            )
            previewView
        }
    )
}

private fun bindCameraForQrScanning(
    ctx: android.content.Context,
    previewView: PreviewView,
    lifecycleOwner: androidx.lifecycle.LifecycleOwner,
    analysisExecutor: ExecutorService,
    mainExecutor: java.util.concurrent.Executor,
    hasScanned: AtomicBoolean,
    onScanned: (String) -> Unit
) {
    val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
    val reader = MultiFormatReader()

    cameraProviderFuture.addListener({
        try {
            val cameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }

            val imageAnalysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()

            imageAnalysis.setAnalyzer(analysisExecutor) { imageProxy ->
                if (!hasScanned.get()) {
                    decodeQrFromImage(imageProxy, reader)?.let { text ->
                        if (hasScanned.compareAndSet(false, true)) {
                            mainExecutor.execute { onScanned(text) }
                        }
                    }
                }
                imageProxy.close()
            }

            cameraProvider.unbindAll()
            cameraProvider.bindToLifecycle(
                lifecycleOwner,
                CameraSelector.DEFAULT_BACK_CAMERA,
                preview,
                imageAnalysis
            )
        } catch (e: Exception) {
            Log.e("QrScannerView", "Camera bind failed", e)
        }
    }, mainExecutor)
}

private fun decodeQrFromImage(imageProxy: ImageProxy, reader: MultiFormatReader): String? {
    return try {
        val buffer = imageProxy.planes[0].buffer
        val bytes = ByteArray(buffer.remaining())
        buffer.get(bytes)
        val source = PlanarYUVLuminanceSource(
            bytes, imageProxy.width, imageProxy.height,
            0, 0, imageProxy.width, imageProxy.height, false
        )
        val bitmap = BinaryBitmap(HybridBinarizer(source))
        reader.decode(bitmap).text
    } catch (e: NotFoundException) {
        null
    } catch (e: Exception) {
        null
    } finally {
        reader.reset()
    }
}
