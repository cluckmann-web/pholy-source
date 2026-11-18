package app.alextran.immich.updates

import java.io.File
import java.nio.file.Files
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class PholyApkValidationTest {
  @get:Rule val temporary = TemporaryFolder()

  private val installed = PholyApkMetadata("de.pholy.app.test", 3042201, setOf("test-certificate"), 26)
  private val next = installed.copy(versionCode = 3042202)
  private val abcSha256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"

  private fun expectCode(code: String, operation: () -> Unit) {
    val error = assertThrows(PholyUpdateException::class.java, operation)
    assertEquals(code, error.code)
  }

  private fun metadata(candidate: PholyApkMetadata, expectedVersion: Long = 3042202, expectedPackage: String = installed.packageName) {
    PholyApkValidation.validateMetadata(installed, candidate, expectedPackage, expectedVersion, 35)
  }

  @Test fun permitsSameSignerAndStrictlyNewerInstalledPackage() {
    metadata(next)
  }

  @Test fun refusesTheStorePackageAndAnotherFeedPackage() {
    expectCode("package_mismatch") { metadata(next.copy(packageName = "de.pholy.app")) }
    expectCode("package_mismatch") { metadata(next, expectedPackage = "untrusted.package") }
  }

  @Test fun checksActualApkVersionAgainstFeed() {
    expectCode("version_mismatch") { metadata(next.copy(versionCode = 3042203)) }
  }

  @Test fun refusesEqualVersionsAndDowngrades() {
    expectCode("not_newer") { metadata(installed, expectedVersion = installed.versionCode) }
    expectCode("not_newer") { metadata(installed.copy(versionCode = 3042200), expectedVersion = 3042200) }
  }

  @Test fun refusesMissingChangedAndAdditionalSigners() {
    expectCode("signature_mismatch") { metadata(next.copy(signingCertificates = emptySet())) }
    expectCode("signature_mismatch") { metadata(next.copy(signingCertificates = setOf("another-certificate"))) }
    expectCode("signature_mismatch") { metadata(next.copy(signingCertificates = setOf("test-certificate", "extra"))) }
    expectCode("signature_mismatch") {
      PholyApkValidation.validateMetadata(installed.copy(signingCertificates = emptySet()), next, installed.packageName, next.versionCode, 35)
    }
  }

  @Test fun comparesAllMultipleSignersWithoutDependingOnOrder() {
    PholyApkValidation.validateMetadata(
      installed.copy(signingCertificates = linkedSetOf("one", "two")),
      next.copy(signingCertificates = linkedSetOf("two", "one")),
      installed.packageName, next.versionCode, 35,
    )
  }

  @Test fun refusesUnsupportedAndroidVersion() {
    expectCode("incompatible_sdk") { metadata(next.copy(minSdk = 36)) }
    metadata(next.copy(minSdk = 35))
  }

  @Test fun rejectsInvalidManifestHashAndVersionBeforeReadingApk() {
    PholyApkValidation.validateArguments(abcSha256.uppercase(), 3042202)
    expectCode("invalid_arguments") { PholyApkValidation.validateArguments("sha256:wrong", 3042202) }
    expectCode("invalid_arguments") { PholyApkValidation.validateArguments(abcSha256, 0) }
  }

  @Test fun acceptsOnlyCompletedApkDirectlyInsideDownloadDirectory() {
    val root = temporary.newFolder("updates")
    val apk = File(root, "pholy.apk").apply { writeText("download") }
    assertEquals(apk.canonicalFile, PholyApkValidation.downloadFile(root, apk.path))
    expectCode("invalid_path") { PholyApkValidation.downloadFile(root, File(root, "pholy.apk.part").path) }
    val nested = File(root, "nested").apply { mkdir() }
    val nestedApk = File(nested, "pholy.apk").apply { writeText("download") }
    expectCode("invalid_path") { PholyApkValidation.downloadFile(root, nestedApk.path) }
  }

  @Test fun refusesPathTraversalSiblingPrefixAndSymlinks() {
    val root = temporary.newFolder("updates")
    val sibling = temporary.newFolder("updates-elsewhere")
    val outside = File(sibling, "pholy.apk").apply { writeText("outside") }
    expectCode("invalid_path") { PholyApkValidation.downloadFile(root, outside.path) }
    expectCode("invalid_path") { PholyApkValidation.downloadFile(root, File(root, "../updates-elsewhere/pholy.apk").path) }
    val link = File(root, "linked.apk")
    Files.createSymbolicLink(link.toPath(), outside.toPath())
    expectCode("invalid_path") { PholyApkValidation.downloadFile(root, link.path) }
    val inside = File(root, "inside.apk").apply { writeText("inside") }
    val localLink = File(root, "local-link.apk")
    Files.createSymbolicLink(localLink.toPath(), inside.toPath())
    expectCode("invalid_path") { PholyApkValidation.downloadFile(root, localLink.path) }
  }

  @Test fun refusesMissingEmptyAndDirectoryApks() {
    val root = temporary.newFolder("updates")
    expectCode("invalid_apk") { PholyApkValidation.downloadFile(root, File(root, "missing.apk").path) }
    val empty = File(root, "empty.apk").apply { createNewFile() }
    expectCode("invalid_apk") { PholyApkValidation.downloadFile(root, empty.path) }
    val directory = File(root, "directory.apk").apply { mkdir() }
    expectCode("invalid_apk") { PholyApkValidation.downloadFile(root, directory.path) }
  }

  @Test fun hashesExactBytesOfIndependentInstallationSnapshot() {
    val source = temporary.newFile("download.apk").apply { writeText("abc") }
    val snapshot = temporary.newFile("verified.apk")
    PholyApkValidation.copyAndCheckHash(source, snapshot, abcSha256.uppercase())
    source.writeText("replaced after verification")
    assertArrayEquals("abc".toByteArray(), snapshot.readBytes())
    assertEquals(abcSha256, PholyApkValidation.certificateSha256("abc".toByteArray()))
  }

  @Test fun refusesCorruptDownloadsAndEmptyCopies() {
    val source = temporary.newFile("download.apk").apply { writeText("abc") }
    val snapshot = temporary.newFile("verified.apk")
    expectCode("checksum_mismatch") { PholyApkValidation.copyAndCheckHash(source, snapshot, "0".repeat(64)) }
    source.writeText("")
    expectCode("checksum_mismatch") { PholyApkValidation.copyAndCheckHash(source, snapshot, abcSha256) }
  }

  private fun archive(name: String, entries: List<String>): File = temporary.newFile(name).apply {
    ZipOutputStream(outputStream()).use { zip ->
      entries.forEach {
        zip.putNextEntry(ZipEntry(it))
        zip.write(byteArrayOf(1))
        zip.closeEntry()
      }
    }
  }

  @Test fun acceptsCompleteReleaseForOneSupportedAbi() {
    val apk = archive("complete.apk", listOf("AndroidManifest.xml", "classes.dex", "lib/arm64-v8a/libflutter.so", "lib/arm64-v8a/libapp.so"))
    PholyApkValidation.validateArchive(apk, listOf("arm64-v8a", "armeabi-v7a"))
  }

  @Test fun refusesWrongAbiAndPartialFlutterRelease() {
    val wrongAbi = archive("wrong-abi.apk", listOf("AndroidManifest.xml", "classes.dex", "lib/x86_64/libflutter.so", "lib/x86_64/libapp.so"))
    expectCode("incompatible_abi") { PholyApkValidation.validateArchive(wrongAbi, listOf("arm64-v8a")) }
    val partial = archive("partial.apk", listOf("AndroidManifest.xml", "classes.dex", "lib/arm64-v8a/libflutter.so"))
    expectCode("incompatible_abi") { PholyApkValidation.validateArchive(partial, listOf("arm64-v8a")) }
  }

  @Test fun refusesConfigurationSplitAndNonApkArchive() {
    val split = archive("split.apk", listOf("AndroidManifest.xml", "lib/arm64-v8a/libapp.so"))
    expectCode("invalid_apk") { PholyApkValidation.validateArchive(split, listOf("arm64-v8a")) }
    val arbitraryZip = archive("zip.apk", listOf("image.jpg"))
    expectCode("invalid_apk") { PholyApkValidation.validateArchive(arbitraryZip, listOf("arm64-v8a")) }
  }
}
