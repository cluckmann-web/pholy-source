#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Generate the upstream mobile artifacts without building or deploying the website.
set -euo pipefail
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/../.." && pwd)
export CI=true FLUTTER_SUPPRESS_ANALYTICS=true DART_SUPPRESS_ANALYTICS=true

flutter_version=$(flutter --version --machine | python3 -c 'import json,sys; print(json.load(sys.stdin)["frameworkVersion"])')
if [[ "$flutter_version" != "3.47.2" ]]; then
  printf 'Use the repository-pinned Flutter 3.47.2 (found %s).\n' "$flutter_version" >&2
  exit 1
fi

cd "$repo_dir/open-api"
bash ./bin/generate-dart-sdk.sh
cd "$repo_dir/mobile"
flutter pub get --enforce-lockfile
node ./scripts/build_runner_patch.mjs

# The native crate's explicit toolchain is authoritative for its FFI build.
export RUSTUP_TOOLCHAIN
RUSTUP_TOOLCHAIN=$(python3 -c 'import pathlib,tomllib; print(tomllib.loads(pathlib.Path("../native/crates/native_core_ffi/rust-toolchain.toml").read_text())["toolchain"]["channel"])')
(
  cd "$repo_dir/native/native_core"
  cargo build --locked -p native_core_ffi
  flutter pub get
  dart run ffigen --config ffigen.yaml
)

dart run drift_dev make-migrations
dart run drift_dev schema generate --data-classes --companions drift_schemas/main/ test/drift/main/generated/
dart run build_runner build
for input in pigeon/*.dart; do
  dart run pigeon --input "$input"
done
dart run easy_localization:generate -S ../i18n
dart run bin/generate_keys.dart
dart run flutter_launcher_icons
dart run flutter_native_splash:create
