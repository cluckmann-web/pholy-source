package app.alextran.immich.updates

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import app.alextran.immich.BuildConfig
import androidx.core.content.FileProvider
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.util.zip.ZipException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** User-initiated sideload updates for PHOLY test builds. Android owns install consent. */
class PholyUpdatesPlugin : FlutterPlugin, ActivityAware, MethodChannel.MethodCallHandler {
  private var context: Context? = null
  private var activity: Activity? = null
  private var channel: MethodChannel? = null
  private var scope: CoroutineScope? = null
  private var installInFlight = false

  override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
    context = binding.applicationContext
    scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    channel = MethodChannel(binding.binaryMessenger, "de.pholy.app/updates").also {
      it.setMethodCallHandler(this)
    }
  }

  override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
    channel?.setMethodCallHandler(null)
    channel = null
    scope?.cancel()
    scope = null
    context = null
    activity = null
  }

  override fun onAttachedToActivity(binding: ActivityPluginBinding) { activity = binding.activity }
  override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) { activity = binding.activity }
  override fun onDetachedFromActivityForConfigChanges() { activity = null }
  override fun onDetachedFromActivity() { activity = null }

  override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
    val ctx = context ?: return result.error("activity_unavailable", "PHOLY ist nicht geöffnet.", null)
    val currentScope = scope ?: return result.error("activity_unavailable", "PHOLY ist nicht geöffnet.", null)
    when (call.method) {
      "getInstalledInfo" -> currentScope.launch {
        reply(result) {
          withContext(Dispatchers.IO) {
            val info = installedPackage(ctx)
            mapOf(
              "packageName" to info.packageName,
              "versionCode" to versionCode(info),
              "versionName" to (info.versionName ?: ""),
              "supportedAbis" to Build.SUPPORTED_ABIS.toList(),
              "sdkInt" to Build.VERSION.SDK_INT,
              "signingCertificateSha256" to signingCertificates(info).sorted(),
              "updateDirectory" to updateDirectory(ctx).path,
              "sideloadUpdatesEnabled" to BuildConfig.PHOLY_SIDELOAD_UPDATES,
            )
          }
        }
      }
      "canRequestPackageInstalls" -> result.success(
        BuildConfig.PHOLY_SIDELOAD_UPDATES && ctx.packageManager.canRequestPackageInstalls()
      )
      "openInstallPermissionSettings" -> currentScope.launch {
        reply(result) {
          requireEnabled()
          currentActivity().startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
            data = Uri.parse("package:${ctx.packageName}")
          })
          null
        }
      }
      "inspectAndInstallApk" -> {
        if (installInFlight) {
          result.error("update_busy", "Eine PHOLY-Aktualisierung wird bereits geprüft.", null)
          return
        }
        installInFlight = true
        currentScope.launch {
          var verified: File? = null
          var handedToInstaller = false
          try {
            reply(result) {
              requireEnabled()
              currentActivity()
              if (!ctx.packageManager.canRequestPackageInstalls()) {
                throw PholyUpdateException("install_permission_required", "Erlaube Android zuerst Aktualisierungen durch PHOLY.")
              }
              val path = call.argument<String>("path")
              val expectedHash = call.argument<String>("expectedSha256")
              val expectedPackage = call.argument<String>("expectedPackageName")
              val rawVersion = call.argument<Any>("expectedVersionCode")
              val expectedVersion = when (rawVersion) { is Int -> rawVersion.toLong(); is Long -> rawVersion; else -> null }
              if (path == null || expectedHash == null || expectedPackage == null || expectedVersion == null) {
                throw PholyUpdateException("invalid_arguments", "Die Angaben zur PHOLY-Aktualisierung fehlen.")
              }
              val file = withContext(Dispatchers.IO) {
                prepareUpdate(ctx, path, expectedHash, expectedPackage, expectedVersion).also { verified = it }
              }
              // Permissions and activity may have changed while the APK was being checked.
              if (!ctx.packageManager.canRequestPackageInstalls()) {
                throw PholyUpdateException("install_permission_required", "Erlaube Android zuerst Aktualisierungen durch PHOLY.")
              }
              val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.pholy-updates", file)
              @Suppress("DEPRECATION") // Standard user-confirmed APK installer; no silent installation.
              val install = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
                data = uri
                clipData = ClipData.newRawUri("PHOLY-Aktualisierung", uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
              }
              currentActivity().startActivity(install)
              handedToInstaller = true
              // This signals only that Android's confirmation UI opened, never successful install.
              null
            }
          } finally {
            if (!handedToInstaller) verified?.delete()
            installInFlight = false
          }
        }
      }
      else -> result.notImplemented()
    }
  }

  private fun requireEnabled() {
    if (!BuildConfig.PHOLY_SIDELOAD_UPDATES) {
      throw PholyUpdateException("updates_disabled", "Diese PHOLY-Ausgabe verwendet keine direkten APK-Aktualisierungen.")
    }
  }

  private fun currentActivity(): Activity = activity?.takeUnless { it.isFinishing || it.isDestroyed }
    ?: throw PholyUpdateException("activity_unavailable", "Öffne PHOLY, um die Aktualisierung zu installieren.")

  private suspend fun reply(result: MethodChannel.Result, work: suspend () -> Any?) {
    try {
      result.success(work())
    } catch (e: CancellationException) {
      throw e
    } catch (e: PholyUpdateException) {
      result.error(e.code, e.message, null)
    } catch (e: ActivityNotFoundException) {
      result.error("installer_unavailable", "Android konnte den Installationsdialog nicht öffnen.", null)
    } catch (e: ZipException) {
      result.error("invalid_apk", "Die heruntergeladene APK ist beschädigt. Bitte erneut herunterladen.", null)
    } catch (e: IOException) {
      result.error("update_io_error", "Die APK konnte nicht gelesen werden. Prüfe den freien Speicherplatz und lade sie erneut herunter.", null)
    } catch (e: Exception) {
      // Do not send filesystem paths or package-manager internals into Dart logs.
      result.error("update_io_error", "Die PHOLY-Aktualisierung konnte nicht sicher geprüft oder geöffnet werden.", null)
    }
  }

  private fun updateDirectory(ctx: Context): File {
    val directory = File(ctx.cacheDir, "pholy-updates")
    if (Files.isSymbolicLink(directory.toPath()) || (!directory.isDirectory && !directory.mkdirs())) {
      throw IOException("Update directory unavailable")
    }
    return directory.canonicalFile
  }

  private fun prepareUpdate(ctx: Context, path: String, hash: String, pkg: String, version: Long): File {
    PholyApkValidation.validateArguments(hash, version)
    if (pkg != ctx.packageName) throw PholyUpdateException("package_mismatch", "Diese Aktualisierung gehört nicht zu dieser PHOLY-Ausgabe.")
    val directory = updateDirectory(ctx)
    val download = PholyApkValidation.downloadFile(directory, path)
    val snapshots = File(directory, "verified")
    if (Files.isSymbolicLink(snapshots.toPath()) || (!snapshots.isDirectory && !snapshots.mkdir())) {
      throw IOException("Verified update directory unavailable")
    }
    val expiry = System.currentTimeMillis() - 7L * 24 * 60 * 60 * 1000
    snapshots.listFiles()?.filter { it.name.startsWith("pholy-") && it.name.endsWith(".apk") && it.lastModified() < expiry }
      ?.forEach { it.delete() }
    val snapshot = File.createTempFile("pholy-", ".apk", snapshots)
    try {
      PholyApkValidation.copyAndCheckHash(download, snapshot, hash)
      if (!snapshot.setReadOnly()) throw IOException("Cannot protect APK snapshot")
      PholyApkValidation.validateArchive(snapshot, Build.SUPPORTED_ABIS.toList())
      val candidate = archivePackage(ctx.packageManager, snapshot.path)
        ?: throw PholyUpdateException("invalid_apk", "Android konnte die APK nicht vollständig prüfen.")
      PholyApkValidation.validateMetadata(
        metadata(installedPackage(ctx)), metadata(candidate), pkg, version, Build.VERSION.SDK_INT,
      )
      return snapshot
    } catch (e: Exception) {
      snapshot.delete()
      throw e
    }
  }

  @Suppress("DEPRECATION")
  private fun installedPackage(ctx: Context): PackageInfo = ctx.packageManager.getPackageInfo(ctx.packageName, signingFlags())

  @Suppress("DEPRECATION")
  private fun archivePackage(pm: PackageManager, path: String): PackageInfo? = pm.getPackageArchiveInfo(path, signingFlags())

  @Suppress("DEPRECATION")
  private fun signingFlags(): Int = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES

  @Suppress("DEPRECATION")
  private fun versionCode(info: PackageInfo): Long = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()

  @Suppress("DEPRECATION")
  private fun signingCertificates(info: PackageInfo): Set<String> {
    val signatures = if (Build.VERSION.SDK_INT >= 28) {
      // Compare the actual APK signers, never a certificate from a rotation history.
      // Test releases intentionally require the same current signing identity.
      info.signingInfo?.apkContentsSigners?.toList()
    } else info.signatures?.toList()
    return signatures.orEmpty().map { PholyApkValidation.certificateSha256(it.toByteArray()) }.toSet()
  }

  private fun metadata(info: PackageInfo) = PholyApkMetadata(
    info.packageName, versionCode(info), signingCertificates(info), info.applicationInfo?.minSdkVersion ?: Int.MAX_VALUE,
  )
}
