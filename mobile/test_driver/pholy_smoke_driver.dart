import 'dart:convert';
import 'dart:io';

import 'package:integration_test/integration_test_driver_extended.dart';

/// Host-side adapter for the synthetic Android smoke APK. Build the APK first,
/// then run flutter drive with --use-application-binary to avoid running Gradle
/// and the software emulator together. This file performs no application build.
Future<void> main() async {
  final directory = await Directory(
    Platform.environment['PHOLY_SMOKE_OUTPUT_DIR'] ?? '$testOutputsDirectory/pholy-smoke-evidence',
  ).create(recursive: true);
  final screenshots = <String>[];

  await integrationDriver(
    writeResponseOnFailure: true,
    onScreenshot: (String name, List<int> bytes, [Map<String, Object?>? args]) async {
      // Names originate in the synthetic fixture, but keep file paths local
      // even if a future test accidentally supplies a path separator.
      final filename = '${name.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_')}.png';
      if (bytes.length < 8 || bytes[0] != 0x89 || bytes[1] != 0x50 || bytes[2] != 0x4e || bytes[3] != 0x47) {
        return false;
      }
      final file = File('${directory.path}/$filename');
      await file.writeAsBytes(bytes, flush: true);
      screenshots.add(filename);
      stdout.writeln('PHOLY_SMOKE_SCREENSHOT=${file.absolute.path}');
      // Captures are evidence for review, not a golden-image comparison.
      return true;
    },
    responseDataCallback: (Map<String, dynamic>? data) async {
      final smoke = data?['pholySmoke'];
      final harnessPassed =
          smoke is Map<String, dynamic> &&
          smoke['passed'] == true &&
          smoke['flowCompleted'] == true &&
          smoke['teardownCompleted'] == true &&
          smoke['teardownFailure'] == null &&
          smoke['frameworkFailureCount'] == 0;
      final report = <String, dynamic>{
        ...?data,
        // Do not duplicate binary screenshot arrays in the readable report.
        'screenshots': screenshots,
        'suiteStatus': harnessPassed
            ? 'PHOLY flow and teardown completed; the runner also verifies the native Flutter suite summary.'
            : 'PHOLY flow or teardown failed, incomplete or missing; the driver fails.',
      };
      final file = File('${directory.path}/result.json');
      await file.writeAsString(const JsonEncoder.withIndent('  ').convert(report), flush: true);
      stdout.writeln('PHOLY_SMOKE_REPORT=${file.absolute.path}');
      if (smoke is Map<String, dynamic>) {
        final checks = smoke['checks'];
        stdout.writeln('PHOLY_SMOKE_CHECKS=${checks is List ? checks.length : 0}');
        stdout.writeln('PHOLY_SMOKE_FLOW_COMPLETED=${smoke['flowCompleted'] == true}');
        stdout.writeln('PHOLY_SMOKE_TEARDOWN_COMPLETED=${smoke['teardownCompleted'] == true}');
      }
      // integrationDriver calls exit(0) immediately after this callback when
      // its SDK result says success. Require the app's own terminal check here
      // and teardown, so a timeout or cleanup error cannot produce a green
      // driver. The CI runner separately checks the native suite's summary to
      // catch later binding.postTest/tearDownAll failures omitted by this SDK.
      if (!harnessPassed) {
        throw StateError('PHOLY smoke flow or teardown did not complete successfully; inspect ${file.absolute.path}');
      }
    },
  );
}
