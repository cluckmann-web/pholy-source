#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Source-only replay: never builds the application or runs its code generators.
set -euo pipefail

[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_OS:-}" == Linux ]]
[[ "${RUNNER_ENVIRONMENT:-}" == github-hosted ]]
[[ "${GITHUB_REPOSITORY:-}" == cluckmann-web/pholy-source ]]
[[ "${GITHUB_REF:-}" == refs/heads/pholy-mobile-native-replay && "${GITHUB_EVENT_NAME:-}" == push ]]
[[ "$(uname -m)" == x86_64 ]]
: "${GITHUB_WORKSPACE:?A disposable GitHub-hosted checkout is required}"
: "${RUNNER_TEMP:?A disposable GitHub-hosted temporary directory is required}"
phase=${1:?Expected fetch, setup or run}
case "$phase" in fetch|setup|run) ;; *) exit 2 ;; esac

tool_dir="$RUNNER_TEMP/pholy-native-replay"
evidence_dir="$RUNNER_TEMP/pholy-native-replay-evidence"
driver_dir="$tool_dir/driver"
artifact_dir="$tool_dir/fixture"
apk="$artifact_dir/PHOLY-Fixture-Only-Android-x64-debug.apk"
artifact_id=14403546416
source_run=44248912745
source_commit=6c1a2719178417f7fabeecc7e6a51f36d5b2cd4d
apk_sha256=d1c0b7b7e380cfa6ff2f2bbe4561769944b590d64b3c06c38a3868a3ac2e39b2
flutter_revision=d3b14c876900e553bc736ca19295fc09e3853e8e
flutter_engine=a804b261645ef8c13eb3d5c44a5c2fb0340c5539
android_image='system-images;android-35;google_apis;x86_64'
mkdir -p "$tool_dir" "$evidence_dir"

export CI=true FLUTTER_SUPPRESS_ANALYTICS=true DART_SUPPRESS_ANALYTICS=true
export JAVA_HOME="$tool_dir/jdk21" PUB_CACHE="$tool_dir/pub-cache"
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME" ANDROID_AVD_HOME="$tool_dir/avd"
export PHOLY_SMOKE_OUTPUT_DIR="$evidence_dir/driver"
export PATH="$tool_dir/flutter/bin:$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
emulator_pid= logcat_pid= drive_pid= diagnostic_pid=
runtime_state=not-started

mark_state() {
  runtime_state=$1
  printf '%s\n' "$runtime_state" > "$evidence_dir/runtime-phase.txt.tmp"
  mv "$evidence_dir/runtime-phase.txt.tmp" "$evidence_dir/runtime-phase.txt"
}

write_phase_result() {
  python3 - "$phase" "$1" "$runtime_state" "$evidence_dir" "$source_commit" "$source_run" "$artifact_id" "$apk_sha256" "$2" <<'PY'
from datetime import datetime, timezone
from pathlib import Path
import json, sys
phase, code, state, destination, commit, run, artifact, apk_hash, cleanup = sys.argv[1:]
result = Path(destination, phase + '-result.json')
pending = result.with_suffix('.json.tmp')
pending.write_text(json.dumps({
    'phase': phase, 'exit_code': int(code), 'runtime_state': state,
    'recorded_at_utc': datetime.now(timezone.utc).isoformat(),
    'cleanup_completed': cleanup == 'true',
    'source_commit': commit, 'source_run': int(run), 'artifact_id': int(artifact),
    'expected_apk_sha256': apk_hash, 'apk_rebuilt': False,
    'scope': 'Existing synthetic debug APK; loopback fixture; no production account or real media',
}, indent=2) + '\n')
pending.replace(result)
PY
}

diagnostic_snapshot() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
  free -m
  ps -eo pid,ppid,stat,pcpu,pmem,rss,comm --sort=-rss | head -16 || true
  timeout --kill-after=2s 5 adb devices -l || true
  timeout --kill-after=2s 5 adb -s emulator-5554 forward --list || true
  timeout --kill-after=2s 5 adb -s emulator-5554 shell 'getprop sys.boot_completed; getprop init.svc.bootanim; pidof system_server; pidof de.pholy.app.debug; service check activity; service check package' || true
  timeout --kill-after=2s 5 ss -ltnp || true
}

finish() {
  local code=$?
  trap - EXIT INT TERM
  set +e
  # Record cancellation/failure before a stalled ADB or cleanup can consume the
  # runner's signal grace period. The final rewrite only adds cleanup status.
  write_phase_result "$code" false
  # The drive process has its own session, so timeout and its Dart descendants
  # can be stopped together before collecting final device evidence.
  if [[ -n "$drive_pid" ]]; then kill -TERM -- "-$drive_pid" >/dev/null 2>&1; fi
  if [[ -n "$diagnostic_pid" ]]; then kill "$diagnostic_pid" >/dev/null 2>&1; fi
  if [[ -n "$emulator_pid" ]]; then
    diagnostic_snapshot > "$evidence_dir/final-host-device-state.txt" 2>&1
    timeout --kill-after=2s 5 adb -s emulator-5554 logcat -b all -d -t 3000 > "$evidence_dir/final-logcat.txt" 2>&1
    timeout --kill-after=2s 5 adb -s emulator-5554 exec-out screencap -p > "$evidence_dir/final-screen.png" 2> "$evidence_dir/screencap-error.txt"
    timeout --kill-after=2s 5 adb -s emulator-5554 pull /sdcard/Android/data/de.pholy.app.debug/files/pholy-smoke-evidence "$evidence_dir/device" > "$evidence_dir/pull-evidence.log" 2>&1
    timeout --kill-after=2s 5 adb -s emulator-5554 shell am force-stop de.pholy.app.debug >/dev/null 2>&1
    timeout --kill-after=2s 5 adb -s emulator-5554 emu kill >/dev/null 2>&1
    kill "$emulator_pid" >/dev/null 2>&1
    timeout 5 tail --pid="$emulator_pid" -f /dev/null >/dev/null 2>&1
    kill -KILL "$emulator_pid" >/dev/null 2>&1
  fi
  if [[ -n "$logcat_pid" ]]; then kill "$logcat_pid" >/dev/null 2>&1; fi
  if [[ -n "$drive_pid" ]]; then kill -KILL -- "-$drive_pid" >/dev/null 2>&1; fi
  write_phase_result "$code" true
  exit "$code"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

download() {
  curl --fail --location --retry 3 --connect-timeout 20 --max-time 900 "$1" --output "$2"
}

fetch() {
  : "${PHOLY_ARTIFACT_TOKEN:?Scoped actions:read token required for the existing artifact}"
  local api="https://api.github.com/repos/cluckmann-web/pholy-source/actions/artifacts/$artifact_id"
  # No verbose curl and no credential file. Authorization is not forwarded to
  # a different host when curl follows GitHub's signed download redirect.
  curl --fail --location --retry 3 --connect-timeout 20 --max-time 60 \
    -H "Authorization: Bearer $PHOLY_ARTIFACT_TOKEN" -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' "$api" -o "$evidence_dir/artifact-metadata.json"
  python3 - "$evidence_dir/artifact-metadata.json" "$artifact_id" "$source_run" "$source_commit" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
assert data['id'] == int(sys.argv[2]) and data['expired'] is False
assert data['workflow_run']['id'] == int(sys.argv[3])
assert data['workflow_run']['head_sha'] == sys.argv[4]
assert data['name'] == 'pholy-fixture-only-debug-apk-44248912745-1'
assert 0 < data['size_in_bytes'] < 400_000_000
PY
  curl --fail --location --retry 3 --connect-timeout 20 --max-time 900 \
    -H "Authorization: Bearer $PHOLY_ARTIFACT_TOKEN" -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' "$api/zip" -o "$tool_dir/fixture.zip"
  unset PHOLY_ARTIFACT_TOKEN
  python3 - "$tool_dir/fixture.zip" "$artifact_dir" "$evidence_dir/artifact-metadata.json" <<'PY'
from pathlib import Path, PurePosixPath
import hashlib, json, stat, sys, zipfile
archive, destination, metadata = map(Path, sys.argv[1:])
digest = json.loads(metadata.read_text()).get('digest')
if digest:
    assert digest == 'sha256:' + hashlib.sha256(archive.read_bytes()).hexdigest()
destination.mkdir()
with zipfile.ZipFile(archive) as package:
    entries = package.infolist()
    assert len(entries) <= 10 and sum(i.file_size for i in entries) < 400_000_000
    assert len({i.filename for i in entries}) == len(entries)
    for item in entries:
        name = PurePosixPath(item.filename)
        assert not name.is_absolute() and '..' not in name.parts and '\\' not in item.filename
        assert not stat.S_ISLNK(item.external_attr >> 16)
    package.extractall(destination)
assert [p.name for p in destination.rglob('*.apk')] == ['PHOLY-Fixture-Only-Android-x64-debug.apk']
PY
  printf '%s  %s\n' "$apk_sha256" "$apk" | sha256sum --check
  grep -Fx "Source commit: $source_commit" "$artifact_dir/README.txt"
  grep -Fx "Workflow run: $source_run" "$artifact_dir/README.txt"
  sha256sum "$apk" > "$evidence_dir/replayed-apk-sha256.txt"
  cp "$artifact_dir/README.txt" "$evidence_dir/fixture-provenance.txt"
  rm "$tool_dir/fixture.zip"
  mkdir -p "$driver_dir/test_driver" "$driver_dir/lib"
  # Fetch the matching host adapter from the immutable fixture source commit;
  # no app package, native plugin, generated code or repository dependency is used.
  download "https://raw.githubusercontent.com/cluckmann-web/pholy-source/$source_commit/mobile/test_driver/pholy_smoke_driver.dart" "$driver_dir/test_driver/pholy_smoke_driver.dart"
  sha256sum "$driver_dir/test_driver/pholy_smoke_driver.dart" > "$evidence_dir/host-driver-sha256.txt"
  cp "$driver_dir/test_driver/pholy_smoke_driver.dart" "$evidence_dir/pholy_smoke_driver.dart"
}

setup() {
  [[ -s "$apk" && -s "$driver_dir/test_driver/pholy_smoke_driver.dart" ]]
  sudo apt-get update
  sudo apt-get install -y --no-install-recommends \
    ca-certificates curl git unzip xz-utils acl python3 util-linux \
    libgl1 libglu1-mesa libpulse0 libx11-6 libxcb1 libxkbcommon0 libnss3 libvulkan1
  [[ -c /dev/kvm ]] || { printf 'KVM is required; no TCG fallback.\n' >&2; return 1; }
  sudo setfacl -m "u:$(id -un):rw" /dev/kvm
  [[ -r /dev/kvm && -w /dev/kvm ]]
  mkdir -p "$JAVA_HOME" "$ANDROID_AVD_HOME"
  download 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.2%2B13/OpenJDK21U-jdk_x64_linux_hotspot_21.0.2_13.tar.gz' "$tool_dir/jdk21.tar.gz"
  printf '%s  %s\n' '454bebb2c9fe48d981341461ffb6bf1017c7b7c6e15c6b0c29b959194ba3aaa5' "$tool_dir/jdk21.tar.gz" | sha256sum --check
  tar -xzf "$tool_dir/jdk21.tar.gz" -C "$JAVA_HOME" --strip-components=1
  rm "$tool_dir/jdk21.tar.gz"
  git clone --depth 1 --branch 3.47.2 https://github.com/flutter/flutter.git "$tool_dir/flutter"
  [[ "$(git -C "$tool_dir/flutter" rev-parse HEAD)" == "$flutter_revision" ]]
  [[ "$(cat "$tool_dir/flutter/bin/internal/engine.version")" == "$flutter_engine" ]]
  flutter --version > "$evidence_dir/flutter-bootstrap.log" 2>&1
  flutter --version --machine > "$evidence_dir/flutter-version.json"
  python3 - "$evidence_dir/flutter-version.json" "$flutter_revision" <<'PY'
import json, sys
sdk = json.load(open(sys.argv[1]))
assert sdk['frameworkVersion'] == '3.47.2' and sdk['frameworkRevision'] == sys.argv[2]
assert sdk['dartSdkVersion'].split(' ')[0] == '3.13.2'
PY
  # Flutter drive's DeviceBasedDevelopmentArtifacts asks for this cache even
  # with a prebuilt APK. Warm only that SDK cache, never Android Maven/Gradle.
  flutter precache --android_gen_snapshot --universal
  command -v sdkmanager
  set +o pipefail
  yes | sdkmanager --licenses > "$evidence_dir/android-licenses.log" 2>&1
  local license_status=${PIPESTATUS[1]}
  set -o pipefail
  [[ "$license_status" == 0 ]]
  sdkmanager 'platform-tools' 'emulator' 'platforms;android-35' 'platforms;android-36' \
    'build-tools;36.0.0' "$android_image"
  emulator -accel-check > "$evidence_dir/kvm-check.txt" 2>&1
  cat > "$driver_dir/pubspec.yaml" <<'YAML'
name: pholy_native_replay_driver
publish_to: none
environment:
  sdk: '>=3.13.0 <4.0.0'
dev_dependencies:
  flutter_driver:
    sdk: flutter
  integration_test:
    sdk: flutter
YAML
  # Flutter validates a target path even when it launches an existing binary.
  # This source is never compiled: the APK retains its original test entrypoint.
  cat > "$driver_dir/lib/prebuilt_fixture_placeholder.dart" <<'DART'
void main() => throw StateError('Use only the verified prebuilt fixture APK.');
DART
  (cd "$driver_dir" && flutter pub get)
  cp "$driver_dir/pubspec.yaml" "$driver_dir/pubspec.lock" "$evidence_dir/"
  [[ ! -d "$driver_dir/android" ]]
  {
    java -version
    emulator -version
    adb version
    sdkmanager --list_installed
    df -h "$RUNNER_TEMP"
  } > "$evidence_dir/toolchain.txt" 2>&1
}

run() {
  [[ -s "$apk" && -r /dev/kvm && -w /dev/kvm ]]
  printf '%s  %s\n' "$apk_sha256" "$apk" | sha256sum --check
  "$ANDROID_HOME/build-tools/36.0.0/aapt2" dump badging "$apk" > "$evidence_dir/apk-metadata.txt"
  grep -q "^package: name='de[.]pholy[.]app[.]debug' " "$evidence_dir/apk-metadata.txt"
  grep -q '^application-debuggable$' "$evidence_dir/apk-metadata.txt"
  grep -q "^launchable-activity: name='app[.]alextran[.]immich[.]MainActivity'" "$evidence_dir/apk-metadata.txt"
  grep -q "^native-code: .*'x86_64'" "$evidence_dir/apk-metadata.txt"
  mark_state emulator-setup
  emulator -accel-check > "$evidence_dir/kvm-before-run.txt" 2>&1
  printf 'no\n' | timeout --kill-after=2s 90 avdmanager create avd --force --name pholy_native_replay --package "$android_image" --device pixel_2
  python3 - "$ANDROID_AVD_HOME/pholy_native_replay.avd/config.ini" <<'PY'
from pathlib import Path
import sys
config = Path(sys.argv[1]); values = {}
for line in config.read_text().splitlines():
    if '=' in line:
        key, value = line.split('=', 1); values[key.strip()] = value.strip()
values.update({'hw.lcd.width': '720', 'hw.lcd.height': '1280', 'hw.lcd.density': '320',
    'hw.ramSize': '2048', 'hw.cpu.ncore': '2', 'hw.keyboard': 'yes',
    'hw.camera.back': 'none', 'hw.camera.front': 'none', 'showDeviceFrame': 'no'})
config.write_text('\n'.join(f'{key}={value}' for key, value in values.items()) + '\n')
PY
  timeout --kill-after=2s 10 adb start-server
  emulator -avd pholy_native_replay -port 5554 -no-window -no-audio -no-boot-anim \
    -no-snapshot -no-metrics -gpu swiftshader -feature -Vulkan -accel on \
    -memory 2048 -cores 2 -skin 720x1280 -camera-back none -camera-front none \
    > "$evidence_dir/emulator.log" 2>&1 &
  emulator_pid=$!
  mark_state boot
  timeout --kill-after=2s 180 adb -s emulator-5554 wait-for-device
  timeout --kill-after=2s 2000 adb -s emulator-5554 logcat -b all -v threadtime > "$evidence_dir/logcat-continuous.txt" 2>&1 &
  logcat_pid=$!
  local deadline=$((SECONDS + 480)) stable=0 previous_pid= current_pid= boot= animation= services= package_path=
  while (( SECONDS < deadline )); do
    kill -0 "$emulator_pid" || { printf 'Emulator exited before readiness.\n' >&2; return 1; }
    boot=$(timeout --kill-after=2s 5 adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
    animation=$(timeout --kill-after=2s 5 adb -s emulator-5554 shell getprop init.svc.bootanim 2>/dev/null | tr -d '\r' || true)
    current_pid=$(timeout --kill-after=2s 5 adb -s emulator-5554 shell pidof system_server 2>/dev/null | tr -d '\r' || true)
    services=$(timeout --kill-after=2s 5 adb -s emulator-5554 shell 'service check package; service check activity' 2>/dev/null | tr -d '\r' || true)
    package_path=$(timeout --kill-after=2s 5 adb -s emulator-5554 shell cmd package path android 2>/dev/null | tr -d '\r' || true)
    if [[ "$boot" == 1 && "$animation" == stopped && -n "$current_pid" && "$current_pid" == "$previous_pid" \
      && "$services" == *'Service package: found'* && "$services" == *'Service activity: found'* && "$package_path" == package:* ]]; then
      stable=$((stable + 1))
    else
      stable=0
    fi
    printf 'Android readiness: boot=%s animation=%s stable_samples=%s system_server=%s\n' "$boot" "$animation" "$stable" "$current_pid"
    (( stable >= 3 )) && break
    previous_pid=$current_pid
    sleep 3
  done
  (( stable >= 3 )) || { printf 'Android framework did not stabilize.\n' >&2; return 1; }
  mark_state android-ready
  [[ "$(timeout --kill-after=2s 5 adb -s emulator-5554 shell getprop ro.build.version.sdk | tr -d '\r')" == 35 ]]
  timeout --kill-after=2s 5 adb -s emulator-5554 shell input keyevent 224 || true
  timeout --kill-after=2s 5 adb -s emulator-5554 shell input keyevent 82 || true
  timeout --kill-after=2s 5 adb -s emulator-5554 shell settings put global window_animation_scale 0
  timeout --kill-after=2s 5 adb -s emulator-5554 shell settings put global transition_animation_scale 0
  timeout --kill-after=2s 5 adb -s emulator-5554 shell settings put global animator_duration_scale 0
  mark_state installing-fixture-apk
  timeout --kill-after=2s 120 adb -s emulator-5554 install -r -t "$apk"
  mark_state fixture-apk-installed
  timeout --kill-after=2s 10 adb -s emulator-5554 shell pm grant de.pholy.app.debug android.permission.POST_NOTIFICATIONS
  mkdir -p "$evidence_dir/checkpoints"
  (
    trap - EXIT INT TERM
    while kill -0 "$emulator_pid" 2>/dev/null; do
      diagnostic_snapshot >> "$evidence_dir/runtime-host-device-samples.txt" 2>&1
      if timeout --kill-after=2s 5 adb -s emulator-5554 shell test -f /sdcard/Android/data/de.pholy.app.debug/files/pholy-smoke-evidence/result.json; then
        timeout --kill-after=2s 12 adb -s emulator-5554 pull /sdcard/Android/data/de.pholy.app.debug/files/pholy-smoke-evidence \
          "$evidence_dir/checkpoints" >> "$evidence_dir/checkpoint-transfer.log" 2>&1 || true
      fi
      sleep 15
    done
  ) &
  diagnostic_pid=$!
  cd "$driver_dir"
  mark_state awaiting-vm-driver-connection
  # Same APK and Skia CPU renderer as the prior attempt. Disable only DDS to
  # isolate the observed connection-disposed failure; no renderer-fix claim.
  # Explicit -d bypasses project-platform filtering. This SDK-only package has
  # no Android/Gradle project and cannot accidentally rebuild the application.
  setsid timeout --signal=TERM --kill-after=30s 1200 \
    flutter --verbose drive --no-pub -d emulator-5554 --debug --no-dds \
    --no-enable-impeller --enable-software-rendering --keep-app-running \
    --driver=test_driver/pholy_smoke_driver.dart --target=lib/prebuilt_fixture_placeholder.dart \
    --use-application-binary="$apk" > "$evidence_dir/drive-verbose.log" 2>&1 &
  drive_pid=$!
  local connection_deadline=$((SECONDS + 240)) connected=false drive_status=0
  while kill -0 "$drive_pid" 2>/dev/null; do
    if grep -q 'Connected to Flutter application[.]' "$evidence_dir/drive-verbose.log"; then
      connected=true
      mark_state synthetic-app-flow
      break
    fi
    kill -0 "$emulator_pid" || { mark_state emulator-exited-during-connection; return 1; }
    if (( SECONDS >= connection_deadline )); then
      mark_state vm-driver-connection-timeout
      printf 'The Flutter driver did not finish its VM/extension connection within 240 seconds.\n' >&2
      tail -100 "$evidence_dir/drive-verbose.log"
      return 1
    fi
    sleep 3
  done
  wait "$drive_pid" || drive_status=$?
  drive_pid=
  printf 'Flutter drive exit code: %s; driver connected: %s\n' "$drive_status" "$connected"
  tail -100 "$evidence_dir/drive-verbose.log"
  [[ "$drive_status" == 0 ]] || return "$drive_status"
  python3 - "$PHOLY_SMOKE_OUTPUT_DIR/result.json" <<'PY'
import json, sys
report = json.load(open(sys.argv[1])); smoke = report.get('pholySmoke', {})
assert smoke.get('passed') is True, 'The synthetic flow did not report completion'
assert smoke.get('fixtureUrl') == 'http://127.0.0.1:17415'
assert smoke.get('applicationId') == 'de.pholy.app.debug'
assert isinstance(smoke.get('checks'), list) and len(smoke['checks']) > 0
assert isinstance(report.get('screenshots'), list) and len(report['screenshots']) > 0
print('Existing fixture flow completed; no production, release renderer, physical-device or iOS claim.')
PY
  mark_state synthetic-flow-completed
}

"$phase"
