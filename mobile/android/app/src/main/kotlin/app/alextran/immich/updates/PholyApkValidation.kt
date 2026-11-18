package app.alextran.immich.updates

import java.io.File
import java.nio.file.Files
import java.security.MessageDigest
import java.util.zip.ZipFile

internal class PholyUpdateException(val code: String, message: String) : Exception(message)

internal data class PholyApkMetadata(
  val packageName: String,
  val versionCode: Long,
  val signingCertificates: Set<String>,
  val minSdk: Int,
)

/** Pure JVM checks, shared by the Android bridge and focused regression tests. */
internal object PholyApkValidation {
  const val MAX_APK_BYTES = 512L * 1024 * 1024
  private val sha256Pattern = Regex("^[a-fA-F0-9]{64}$")

  fun validateArguments(expectedSha256: String, expectedVersionCode: Long) {
    if (!sha256Pattern.matches(expectedSha256) || expectedVersionCode <= 0) {
      fail("invalid_arguments", "Ungültige Angaben zur PHOLY-Aktualisierung.")
    }
  }

  fun downloadFile(directory: File, path: String): File {
    val requested = File(path)
    val canonical = requested.canonicalFile
    if (!requested.isAbsolute || Files.isSymbolicLink(requested.toPath()) ||
      canonical.parentFile != directory.canonicalFile || !canonical.name.endsWith(".apk")) {
      fail("invalid_path", "Die Aktualisierung liegt nicht im privaten PHOLY-Downloadordner.")
    }
    if (!canonical.isFile || !canonical.canRead() || canonical.length() !in 1..MAX_APK_BYTES) {
      fail("invalid_apk", "Die APK fehlt, ist unvollständig oder überschreitet die zulässige Größe.")
    }
    return canonical
  }

  /** Hash while copying: the bytes inspected and handed to Android are one private snapshot. */
  fun copyAndCheckHash(source: File, target: File, expectedSha256: String) {
    val digest = MessageDigest.getInstance("SHA-256")
    var count = 0L
    source.inputStream().use { input ->
      target.outputStream().use { output ->
        val buffer = ByteArray(128 * 1024)
        while (true) {
          val read = input.read(buffer)
          if (read < 0) break
          count += read
          if (count > MAX_APK_BYTES) fail("invalid_apk", "Die APK überschreitet die zulässige Größe.")
          digest.update(buffer, 0, read)
          output.write(buffer, 0, read)
        }
        output.fd.sync()
      }
    }
    if (count == 0L || digest.digest().toHex() != expectedSha256.lowercase()) {
      fail("checksum_mismatch", "Die Prüfsumme der APK stimmt nicht. Bitte erneut herunterladen.")
    }
  }

  fun validateMetadata(
    installed: PholyApkMetadata,
    candidate: PholyApkMetadata,
    expectedPackageName: String,
    expectedVersionCode: Long,
    sdkInt: Int,
  ) {
    if (expectedPackageName != installed.packageName || candidate.packageName != installed.packageName) {
      fail("package_mismatch", "Diese APK gehört nicht zur installierten PHOLY-App.")
    }
    if (candidate.versionCode != expectedVersionCode) {
      fail("version_mismatch", "Die APK-Version stimmt nicht mit der angekündigten Aktualisierung überein.")
    }
    if (candidate.versionCode <= installed.versionCode) {
      fail("not_newer", "Diese PHOLY-Version ist bereits installiert oder älter.")
    }
    // Test releases use a fixed signing identity. Deliberately reject rotation or missing signers.
    if (installed.signingCertificates.isEmpty() || candidate.signingCertificates != installed.signingCertificates) {
      fail("signature_mismatch", "Die Signatur der APK stimmt nicht mit der installierten PHOLY-App überein.")
    }
    if (candidate.minSdk > sdkInt) {
      fail("incompatible_sdk", "Diese Aktualisierung benötigt eine neuere Android-Version.")
    }
  }

  fun validateArchive(file: File, supportedAbis: List<String>) {
    ZipFile(file).use { archive ->
      if (archive.getEntry("AndroidManifest.xml") == null || archive.getEntry("classes.dex") == null) {
        fail("invalid_apk", "Die Datei ist keine vollständige PHOLY-APK.")
      }
      // A complete Flutter release must contain both native runtime and app for one device ABI.
      // This also refuses individual AAB configuration splits, which cannot be installed alone.
      val compatible = supportedAbis.any { abi ->
        archive.getEntry("lib/$abi/libflutter.so") != null && archive.getEntry("lib/$abi/libapp.so") != null
      }
      if (!compatible) fail("incompatible_abi", "Die APK passt nicht zur Prozessorarchitektur dieses Geräts.")
    }
  }

  fun certificateSha256(encoded: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(encoded).toHex()

  private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it.toInt() and 0xff) }

  private fun fail(code: String, message: String): Nothing = throw PholyUpdateException(code, message)
}
