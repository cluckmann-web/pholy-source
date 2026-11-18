#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Only the isolated GitHub Actions branch may run this synthetic Android job.
set -euo pipefail

[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_OS:-}" == Linux ]]
[[ "${RUNNER_ENVIRONMENT:-}" == github-hosted ]]
[[ "${GITHUB_REF:-}" == refs/heads/pholy-mobile-native-test ]]
[[ "${GITHUB_EVENT_NAME:-}" == push ]]
[[ "$(uname -m)" == x86_64 ]]
: "${GITHUB_WORKSPACE:?A disposable GitHub-hosted checkout is required}"
: "${RUNNER_TEMP:?A disposable GitHub-hosted temporary directory is required}"

phase=${1:?Expected setup, prepare, build or run}
case "$phase" in setup|prepare|build|run) ;; *) exit 2 ;; esac
repo_dir=$GITHUB_WORKSPACE
tool_dir="$RUNNER_TEMP/pholy-native-ci"
evidence_dir="$RUNNER_TEMP/pholy-native-evidence"
mkdir -p "$tool_dir" "$evidence_dir"

export CI=true FLUTTER_SUPPRESS_ANALYTICS=true DART_SUPPRESS_ANALYTICS=true
export RUSTUP_TOOLCHAIN=1.99.1 CARGO_BUILD_JOBS=2
export RUSTUP_HOME="$tool_dir/rustup" CARGO_HOME="$tool_dir/cargo"
export JAVA_HOME="$tool_dir/jdk21"
export GRADLE_USER_HOME="$tool_dir/gradle" PUB_CACHE="$tool_dir/pub-cache"
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_AVD_HOME="$tool_dir/avd"
export PHOLY_SMOKE_OUTPUT_DIR="$evidence_dir/driver"
export PATH="$tool_dir/flutter/bin:$tool_dir/node/bin:$tool_dir/openapi-cli/node_modules/.bin:$JAVA_HOME/bin:$CARGO_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
export CC=clang-16 CXX=clang++-16

flutter_version=${PHOLY_FLUTTER_VERSION:-3.47.2}
flutter_revision=${PHOLY_FLUTTER_REVISION:-d3b14c876900e553bc736ca19295fc09e3853e8e}
flutter_engine=${PHOLY_FLUTTER_ENGINE:-a804b261645ef8c13eb3d5c44a5c2fb0340c5539}
node_version=${PHOLY_NODE_VERSION:-24.22.1}
android_image=${PHOLY_ANDROID_IMAGE:-system-images;android-35;google_apis;x86_64}
apk="$repo_dir/mobile/build/app/outputs/flutter-apk/app-debug.apk"
emulator_pid=
logcat_pid=
runtime_state=not-started

mark_runtime_state() {
  runtime_state=$1
  printf '%s\n' "$runtime_state" > "$evidence_dir/runtime-phase.txt"
}

finish() {
  local exit_code=$?
  trap - EXIT INT TERM
  set +e
  if [[ -n "$emulator_pid" ]]; then
    timeout 8 adb -s emulator-5554 shell 'getprop sys.boot_completed; getprop init.svc.bootanim; pidof system_server; service check package; service check activity' > "$evidence_dir/final-device-state.txt" 2>&1
    timeout 8 adb -s emulator-5554 logcat -b all -d -t 2000 > "$evidence_dir/final-logcat.txt" 2>&1
    timeout 8 adb -s emulator-5554 exec-out screencap -p > "$evidence_dir/final-screen.png" 2> "$evidence_dir/screencap-error.txt"
    timeout 20 adb -s emulator-5554 pull /sdcard/Android/data/de.pholy.app.debug/files/pholy-smoke-evidence "$evidence_dir/device" > "$evidence_dir/pull-evidence.log" 2>&1
    timeout 5 adb -s emulator-5554 emu kill >/dev/null 2>&1
    kill "$emulator_pid" >/dev/null 2>&1
    timeout 5 tail --pid="$emulator_pid" -f /dev/null >/dev/null 2>&1
    kill -KILL "$emulator_pid" >/dev/null 2>&1
  fi
  if [[ -n "$logcat_pid" ]]; then kill "$logcat_pid" >/dev/null 2>&1; fi
  python3 - "$phase" "$exit_code" "$evidence_dir" "$runtime_state" <<'PY'
from datetime import datetime, timezone
from pathlib import Path
import json, sys
phase, code, destination, runtime_state = sys.argv[1:]
Path(destination, phase + '-result.json').write_text(json.dumps({
    'phase': phase, 'runtime_state': runtime_state, 'exit_code': int(code),
    'completed_at_utc': datetime.now(timezone.utc).isoformat(),
    'scope': 'Synthetic debug APK; no production account or real media',
}, indent=2) + '\n')
PY
  exit "$exit_code"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

download() {
  curl --fail --location --retry 3 --connect-timeout 20 --max-time 900 "$1" --output "$2"
}

setup() {
  sudo apt-get update
  sudo apt-get install -y --no-install-recommends \
    ca-certificates curl git unzip xz-utils zip patch acl \
    build-essential pkg-config python3 clang-16 llvm-16 libclang-16-dev \
    libsqlite3-dev ninja-build libgl1 libglu1-mesa libpulse0 libx11-6 \
    libxcb1 libxkbcommon0 libnss3 libvulkan1
  df -h "$repo_dir" "$RUNNER_TEMP" > "$evidence_dir/disk-before.txt"
  free -m > "$evidence_dir/memory-before.txt"

  # No TCG fallback: hardware acceleration is the purpose of this runner.
  [[ -c /dev/kvm ]] || { printf 'This runner has no /dev/kvm.\n' >&2; return 1; }
  sudo setfacl -m "u:$(id -un):rw" /dev/kvm
  [[ -r /dev/kvm && -w /dev/kvm ]]

  mkdir -p "$tool_dir/downloads" "$JAVA_HOME" "$tool_dir/node" "$GRADLE_USER_HOME" "$ANDROID_AVD_HOME"
  local jdk_archive="$tool_dir/downloads/jdk21.tar.gz"
  download 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.2%2B13/OpenJDK21U-jdk_x64_linux_hotspot_21.0.2_13.tar.gz' "$jdk_archive"
  printf '%s  %s\n' '454bebb2c9fe48d981341461ffb6bf1017c7b7c6e15c6b0c29b959194ba3aaa5' "$jdk_archive" | sha256sum --check
  tar -xzf "$jdk_archive" -C "$JAVA_HOME" --strip-components=1
  [[ -x "$JAVA_HOME/bin/javac" ]]
  rm "$jdk_archive"

  local node_archive="node-v${node_version}-linux-x64.tar.xz"
  download "https://nodejs.org/dist/v${node_version}/$node_archive" "$tool_dir/downloads/$node_archive"
  download "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt" "$tool_dir/downloads/node-SHASUMS256.txt"
  (
    cd "$tool_dir/downloads"
    awk -v file="$node_archive" '$2 == file { print; found=1 } END { if (!found) exit 1 }' node-SHASUMS256.txt | sha256sum --check
  )
  tar -xJf "$tool_dir/downloads/$node_archive" -C "$tool_dir/node" --strip-components=1
  rm "$tool_dir/downloads/$node_archive"
  [[ "$(node --version)" == "v$node_version" ]]
  npm install --prefix "$tool_dir/openapi-cli" --no-audit --no-fund @openapitools/openapi-generator-cli@2.42.0

  # Check out the exact SDK release commit instead of depending on a moving
  # archive-index URL. Flutter then obtains the engine-pinned Dart artifacts.
  git clone --depth 1 --branch "$flutter_version" https://github.com/flutter/flutter.git "$tool_dir/flutter"
  [[ "$(git -C "$tool_dir/flutter" rev-parse HEAD)" == "$flutter_revision" ]]
  [[ "$(cat "$tool_dir/flutter/bin/internal/engine.version")" == "$flutter_engine" ]]
  flutter --version --machine > "$evidence_dir/flutter-version.json"
  python3 - "$evidence_dir/flutter-version.json" "$flutter_version" "$flutter_revision" "$evidence_dir/flutter-selection.json" <<'PYSDK'
from pathlib import Path
import json,sys
data=json.load(open(sys.argv[1]))
assert data['frameworkVersion'] == sys.argv[2]
assert data['frameworkRevision'] == sys.argv[3]
Path(sys.argv[4]).write_text(json.dumps({
    'repository': 'https://github.com/flutter/flutter.git',
    'version': sys.argv[2], 'revision': sys.argv[3],
    'selection': 'exact release tag plus verified commit and engine hash',
}, indent=2) + '\n')
PYSDK
  # The targeted APK build fetches its needed engine artifacts; avoid eagerly
  # precaching every Android ABI/build mode on the runner's limited disk.

  # GitHub's Ubuntu image supplies rustup; isolate its downloads and cargo cache.
  command -v rustup
  rustup toolchain install 1.99.1 --profile minimal --no-self-update
  rustup target add --toolchain 1.99.1 x86_64-linux-android
  cargo --version

  command -v sdkmanager
  # Avoid the usual yes/SIGPIPE failure under pipefail, while checking sdkmanager.
  set +o pipefail
  yes | sdkmanager --licenses > "$evidence_dir/android-licenses.log" 2>&1
  local sdk_license_exit=${PIPESTATUS[1]}
  set -o pipefail
  [[ "$sdk_license_exit" == 0 ]]
  sdkmanager 'platform-tools' 'emulator' \
    'platforms;android-33' 'platforms;android-34' 'platforms;android-35' 'platforms;android-36' \
    'build-tools;35.0.0' 'build-tools;36.0.0' 'ndk;28.2.13676358' 'cmake;3.22.1' "$android_image"
  emulator -accel-check > "$evidence_dir/kvm-check.txt" 2>&1

  cat > "$GRADLE_USER_HOME/gradle.properties" <<'PROPERTIES'
org.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=768m -XX:MaxDirectMemorySize=512m -XX:ActiveProcessorCount=2
org.gradle.parallel=false
org.gradle.workers.max=2
org.gradle.daemon=false
kotlin.compiler.execution.strategy=in-process
android.jetifier.ignorelist=(armeabi_v7a|arm64_v8a|x86_64)_(debug|profile|release)-1[.]0[.]0-a804b261645ef8c13eb3d5c44a5c2fb0340c5539[.]jar$
PROPERTIES
  {
    git -C "$repo_dir" rev-parse HEAD
    javac --version
    node --version
    rustc --version
    clang-16 --version
    sdkmanager --version
    emulator -version
  } > "$evidence_dir/toolchain.txt" 2>&1
}

prepare() {
  # ffigen does not honor LIBCLANG_PATH. Restore this host-only selection even on failure.
  (
    local config="$repo_dir/native/native_core/ffigen.yaml"
    local original
    original=$(mktemp "$tool_dir/ffigen-original.XXXXXX.yaml")
    cp "$config" "$original"
    trap 'cp "$original" "$config"; rm -f "$original"' EXIT
    if grep -q '^llvm-path:' "$config"; then
      printf 'Review the existing ffigen llvm-path before applying the CI host override.\n' >&2
      exit 1
    fi
    printf '\nllvm-path:\n  - /usr/lib/llvm-16\n' >> "$config"
    bash "$repo_dir/mobile/scripts/prepare-pholy.sh"
  )
  # Native codegen has its own untracked lock; preserve the actual resolved versions as evidence.
  cp "$repo_dir/native/native_core/pubspec.lock" "$evidence_dir/native-codegen-pubspec.lock"
  git -C "$repo_dir" diff --exit-code -- mobile/pubspec.lock native/Cargo.lock
}

build() {
  cd "$repo_dir/mobile"
  flutter build apk --debug --no-pub --target-platform android-x64 \
    --target=integration_test/pholy_mobile_smoke_test.dart \
    --dart-define=PHOLY_SERVER_URL=http://127.0.0.1:17415 \
    --dart-define=PHOLY_ENABLE_PASSKEYS=false
  [[ -s "$apk" ]]
  "$ANDROID_HOME/build-tools/36.0.0/aapt2" dump badging "$apk" > "$evidence_dir/debug-apk-metadata.txt"
  grep -q "^package: name='de[.]pholy[.]app[.]debug' " "$evidence_dir/debug-apk-metadata.txt"
  sha256sum "$apk" > "$evidence_dir/debug-apk-sha256.txt"
  (cd android && ./gradlew --stop)
}

run() {
  [[ -s "$apk" && -r /dev/kvm && -w /dev/kvm ]]
  mark_runtime_state emulator-setup
  emulator -accel-check > "$evidence_dir/kvm-check-before-run.txt" 2>&1
  printf 'no\n' | avdmanager create avd --force --name pholy_native_ci --package "$android_image" --device pixel_2
  python3 - "$ANDROID_AVD_HOME/pholy_native_ci.avd/config.ini" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); settings={}
for line in p.read_text().splitlines():
    if '=' in line:
        key,value=line.split('=',1); settings[key.strip()]=value.strip()
settings.update({'hw.lcd.width':'720','hw.lcd.height':'1280','hw.lcd.density':'320',
    'hw.ramSize':'2048','hw.cpu.ncore':'2','hw.keyboard':'yes',
    'hw.camera.back':'none','hw.camera.front':'none','showDeviceFrame':'no'})
p.write_text('\n'.join(f'{key}={value}' for key,value in settings.items())+'\n')
PY
  adb start-server
  emulator -avd pholy_native_ci -port 5554 -no-window -no-audio -no-boot-anim \
    -no-snapshot -no-metrics -gpu swiftshader -feature -Vulkan -accel on \
    -memory 2048 -cores 2 -skin 720x1280 -camera-back none -camera-front none \
    > "$evidence_dir/emulator.log" 2>&1 &
  emulator_pid=$!
  mark_runtime_state boot
  timeout 180 adb -s emulator-5554 wait-for-device
  adb -s emulator-5554 logcat -b all -v threadtime > "$evidence_dir/logcat-continuous.txt" 2>&1 &
  logcat_pid=$!

  local deadline=$((SECONDS + 480)) stable=0 previous_pid= current_pid= boot= animation= services= package_path=
  while (( SECONDS < deadline )); do
    kill -0 "$emulator_pid" || { printf 'Emulator exited before readiness.\n' >&2; return 1; }
    boot=$(timeout 5 adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
    animation=$(timeout 5 adb -s emulator-5554 shell getprop init.svc.bootanim 2>/dev/null | tr -d '\r' || true)
    current_pid=$(timeout 5 adb -s emulator-5554 shell pidof system_server 2>/dev/null | tr -d '\r' || true)
    services=$(timeout 5 adb -s emulator-5554 shell 'service check package; service check activity' 2>/dev/null | tr -d '\r' || true)
    package_path=$(timeout 5 adb -s emulator-5554 shell cmd package path android 2>/dev/null | tr -d '\r' || true)
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
  (( stable >= 3 )) || { printf 'Android framework did not become stable within the readiness deadline.\n' >&2; return 1; }
  mark_runtime_state android-ready
  [[ "$(adb -s emulator-5554 shell getprop ro.build.version.sdk | tr -d '\r')" == 35 ]]
  # Cosmetic wake/unlock failures must not masquerade as application failures.
  timeout 5 adb -s emulator-5554 shell input keyevent 224 || true
  timeout 5 adb -s emulator-5554 shell input keyevent 82 || true
  adb -s emulator-5554 shell settings put global window_animation_scale 0
  adb -s emulator-5554 shell settings put global transition_animation_scale 0
  adb -s emulator-5554 shell settings put global animator_duration_scale 0
  mark_runtime_state installing-debug-apk
  timeout 120 adb -s emulator-5554 install -r -t "$apk"
  mark_runtime_state debug-apk-installed
  adb -s emulator-5554 shell pm grant de.pholy.app.debug android.permission.POST_NOTIFICATIONS
  cd "$repo_dir/mobile"
  mark_runtime_state synthetic-app-flow
  timeout --signal=TERM --kill-after=30s 1200 flutter drive --no-pub -d emulator-5554 \
    --driver=test_driver/pholy_smoke_driver.dart \
    --target=integration_test/pholy_mobile_smoke_test.dart \
    --use-application-binary="$apk"
  python3 - "$PHOLY_SMOKE_OUTPUT_DIR/result.json" <<'PY'
import json,sys
report=json.load(open(sys.argv[1]))
smoke=report.get('pholySmoke',{})
assert smoke.get('passed') is True, 'Driver did not report completion of the synthetic flow'
assert smoke.get('fixtureUrl') == 'http://127.0.0.1:17415'
assert smoke.get('applicationId') == 'de.pholy.app.debug'
print('Native synthetic flow completed; production and physical-device behavior remain outside this test.')
PY
  mark_runtime_state synthetic-flow-completed
}

"$phase"
