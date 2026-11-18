#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Build a signed, fixed-server PHOLY Android test APK. Signing material stays outside Git.
set -euo pipefail
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
mobile_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
repo_dir=$(CDPATH= cd -- "$mobile_dir/.." && pwd)
export CI=true FLUTTER_SUPPRESS_ANALYTICS=true DART_SUPPRESS_ANALYTICS=true
export PHOLY_ANDROID_TEST_BUILD=true
if [[ -n "${JAVA_HOME:-}" && ! -x "$JAVA_HOME/bin/javac" ]]; then
  printf 'JAVA_HOME must point to a complete JDK (including bin/javac), not only a Java runtime.\n' >&2
  exit 1
fi
: "${PHOLY_ANDROID_KEYSTORE:?Set an absolute path to the external PHOLY test keystore}"
: "${ALIAS:?Set the test signing key alias}"
: "${ANDROID_KEY_PASSWORD:?Set the test key password through the build environment}"
: "${ANDROID_STORE_PASSWORD:?Set the test keystore password through the build environment}"
case "$PHOLY_ANDROID_KEYSTORE" in
  /*) ;;
  *) printf 'PHOLY_ANDROID_KEYSTORE must be an absolute path.\n' >&2; exit 1 ;;
esac
if [[ ! -f "$PHOLY_ANDROID_KEYSTORE" || ! -r "$PHOLY_ANDROID_KEYSTORE" || ! -s "$PHOLY_ANDROID_KEYSTORE" ]]; then
  printf 'The external signing keystore must exist, be readable, and be nonempty.\n' >&2
  exit 1
fi
case "$(realpath "$PHOLY_ANDROID_KEYSTORE")" in
  "$repo_dir"/*) printf 'Keep signing keys outside the source repository.\n' >&2; exit 1 ;;
esac

cd "$mobile_dir"
# Match the native FFI crate even when a local mise environment pins an older toolchain.
export RUSTUP_TOOLCHAIN
RUSTUP_TOOLCHAIN=$(python3 -c 'import pathlib,tomllib; print(tomllib.loads(pathlib.Path("../native/crates/native_core_ffi/rust-toolchain.toml").read_text())["toolchain"]["channel"])')
flutter pub get --enforce-lockfile
# Explicit defines prevent development server/passkey settings leaking into the distributable.
flutter build apk --release --split-per-abi \
  --target-platform android-arm64,android-x64 \
  --dart-define=PHOLY_SERVER_URL=https://pholy.de \
  --dart-define=PHOLY_ENABLE_PASSKEYS=false \
  --build-name=3.4.1-pholy-mobile.3 --build-number=3040203

printf '\nSigned APKs: %s/build/app/outputs/flutter-apk/\n' "$mobile_dir"
