#!/usr/bin/env bash
# PHOLY native release builder, based on Immich v3.4.1 build definitions.
# SPDX-License-Identifier: AGPL-3.0-only
set -Eeuo pipefail
umask 0022
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PHOLY_SOURCE="${PHOLY_SOURCE:-$(cd "$SCRIPT_DIR/../.." && pwd -P)}"
PHOLY_DOMAIN_ROOT="${PHOLY_DOMAIN_ROOT:-$(dirname -- "$PHOLY_SOURCE")}"
PHOLY_RUNTIME="${PHOLY_RUNTIME:-$PHOLY_DOMAIN_ROOT/pholy-runtime}"
PHOLY_DATA="${PHOLY_DATA:-$PHOLY_DOMAIN_ROOT/pholy-data}"
PHOLY_TOOLCHAIN="${PHOLY_TOOLCHAIN:-$PHOLY_DOMAIN_ROOT/pholy-toolchain}"
MISE_BIN="${MISE_BIN:-$PHOLY_TOOLCHAIN/bin/mise}"
export MISE_DATA_DIR="${MISE_DATA_DIR:-$PHOLY_TOOLCHAIN/mise}"
export MISE_CONFIG_DIR="${MISE_CONFIG_DIR:-$PHOLY_TOOLCHAIN/config}"
export MISE_CACHE_DIR="${MISE_CACHE_DIR:-$PHOLY_TOOLCHAIN/cache}"
export MISE_STATE_DIR="${MISE_STATE_DIR:-$PHOLY_TOOLCHAIN/state/mise}"
# This allowlist prevents upstream Terraform, Java, restic and unrelated tools
# from being installed or activated by monorepo tasks.
export MISE_ENABLE_TOOLS="node,pnpm,python,uv,github:extism/cli,github:extism/js-pdk,github:webassembly/binaryen,github:jellyfin/jellyfin-ffmpeg"
export MISE_AUTO_INSTALL=false
export MISE_LOCKED=1
export MISE_YES=true
export CI=true
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}"
export UV_CACHE_DIR="${UV_CACHE_DIR:-$PHOLY_TOOLCHAIN/cache/uv}"
export UV_PYTHON_DOWNLOADS=never
export PHOLY_MEDIA_PREFIX="${PHOLY_MEDIA_PREFIX:-$PHOLY_TOOLCHAIN/media}"
export PHOLY_SHARP_MODE="${PHOLY_SHARP_MODE:-prebuilt}"
BASE_COMMIT=22b95194c80a2f2e6201093916b6c8c3d6d271dd

fail() { printf 'PHOLY build: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null || fail "Missing required command: $1"; }
for command in git python3 tar gzip sha256sum findmnt curl unzip make cc pkg-config; do need "$command"; done
[[ "$EUID" != 0 && "$(id -un)" == "${PHOLY_BUILD_USER:-pholy}" ]] || fail "Run as pholy (or explicitly set PHOLY_BUILD_USER for a source rebuild), never root."
[[ -x "$MISE_BIN" ]] || fail "Install mise first or set MISE_BIN: $MISE_BIN"
if [[ -e "$PHOLY_SOURCE/.git" ]]; then
  SOURCE_KIND=git
  git -C "$PHOLY_SOURCE" merge-base --is-ancestor "$BASE_COMMIT" HEAD ||
    fail "Source must descend from the reviewed Immich v3.4.1 commit."
else
  SOURCE_KIND=archive
  source_info="$(python3 "$SCRIPT_DIR/source-archive.py" info "$PHOLY_SOURCE")"
  mapfile -t source_fields <<< "$source_info"
  SOURCE_COMMIT="${source_fields[0]}"
  SOURCE_DATE_EPOCH="${source_fields[1]}"
fi
python3 "$SCRIPT_DIR/check-pins.py" "$PHOLY_SOURCE"
case "${1:-build}" in
  check|--check)
    printf 'Prerequisites and upstream pins validated. No tools installed and no build performed.\n'
    exit 0 ;;
  build) ;;
  *) fail "Usage: $0 [build|--check]" ;;
esac
if [[ "$SOURCE_KIND" == git ]]; then
  [[ -z "$(git -C "$PHOLY_SOURCE" status --porcelain --untracked-files=all)" ]] ||
    fail "Commit the reviewed PHOLY changes before release. A clean HEAD is required for an exact /source offer."
fi
case "$PHOLY_SHARP_MODE" in
  prebuilt)
    export SHARP_IGNORE_GLOBAL_LIBVIPS=1
    unset SHARP_FORCE_GLOBAL_LIBVIPS
    ;;
  global)
    unset SHARP_IGNORE_GLOBAL_LIBVIPS
    export SHARP_FORCE_GLOBAL_LIBVIPS=true
    export PKG_CONFIG_PATH="$PHOLY_MEDIA_PREFIX/lib/pkgconfig:$PHOLY_MEDIA_PREFIX/lib64/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
    export LD_LIBRARY_PATH="$PHOLY_MEDIA_PREFIX/lib:$PHOLY_MEDIA_PREFIX/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    pkg-config --atleast-version=8.18.7 vips-cpp ||
      fail "Global Sharp requires libvips >=8.18.7. Prepare the media-tools.sh prefix first."
    ;;
  *) fail "PHOLY_SHARP_MODE must be prebuilt or global." ;;
esac
export PATH="$PHOLY_MEDIA_PREFIX/bin:$PATH"
if [[ "$SOURCE_KIND" == git ]]; then
  SOURCE_COMMIT="$(git -C "$PHOLY_SOURCE" rev-parse HEAD)"
  SOURCE_DATE_EPOCH="$(git -C "$PHOLY_SOURCE" show -s --format=%ct HEAD)"
fi
export SOURCE_DATE_EPOCH
RELEASE_ID="${PHOLY_RELEASE_ID:-${SOURCE_COMMIT:0:12}-$(date -u +%Y%m%dT%H%M%SZ)}"
[[ "$RELEASE_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]+$ ]] || fail "Unsafe PHOLY_RELEASE_ID."
RELEASE="$PHOLY_RUNTIME/releases/$RELEASE_ID"
BUILD="$PHOLY_RUNTIME/build/$RELEASE_ID"
[[ ! -e "$RELEASE" && ! -e "$BUILD" ]] || fail "Release/build path already exists; choose a new PHOLY_RELEASE_ID."
mkdir -p "$RELEASE/source" "$BUILD"
trap 'printf "Build failed; live current was not changed. Inspect %s and %s.\n" "$BUILD" "$RELEASE" >&2' ERR

# Export immutable Git content (or verify a public archive), then record every
# source file in PHOLY-SOURCE.json. No private Git remote is needed for a rebuild.
python3 "$SCRIPT_DIR/source-archive.py" export "$PHOLY_SOURCE" "$SOURCE_KIND" \
  "$SOURCE_COMMIT" "$SOURCE_DATE_EPOCH" "$RELEASE/source/pholy-source.tar.gz" "$BUILD"
(cd "$RELEASE/source" && sha256sum pholy-source.tar.gz > pholy-source.tar.gz.sha256)
export MISE_TRUSTED_CONFIG_PATHS="$BUILD"
cd "$BUILD"
ROOT_TOOLS=(node@24.22.1 pnpm@12.15.0 github:extism/cli@1.6.3 github:extism/js-pdk@v1.7.0 github:webassembly/binaryen@version_124 github:jellyfin/jellyfin-ffmpeg@7.1.3-6)
"$MISE_BIN" install "${ROOT_TOOLS[@]}"
(
  cd "$BUILD/machine-learning"
  "$MISE_BIN" install python@3.12.14 uv@0.8.15
)
NODE_BIN="$("$MISE_BIN" which node)"
FFMPEG_BIN="$("$MISE_BIN" which ffmpeg)"
FFPROBE_BIN="$("$MISE_BIN" which ffprobe)"
PYTHON_BIN="$(cd "$BUILD/machine-learning" && "$MISE_BIN" which python)"
UV_BIN="$(cd "$BUILD/machine-learning" && "$MISE_BIN" which uv)"
[[ "$("$NODE_BIN" --version)" == v24.22.1 ]] || fail "Unexpected Node version."
[[ "$("$MISE_BIN" exec -- pnpm --version)" == 12.15.0 ]] || fail "Unexpected pnpm version."
[[ "$("$PYTHON_BIN" --version)" == 'Python 3.12.14' ]] || fail "Unexpected Python version."

# Use the checked-out upstream tasks, with automatic unrelated tool installs off.
# plugins builds SDK, plugin SDK, and the WASM core plugin in dependency order.
"$MISE_BIN" run //:plugins
"$MISE_BIN" exec -- pnpm --filter immich --filter immich-web --filter @immich/cli install --frozen-lockfile
"$MISE_BIN" run //server:build
export IMMICH_BUILD="PHOLY-3.4.1-${SOURCE_COMMIT:0:12}"
"$MISE_BIN" run //web:build
"$MISE_BIN" run //packages/cli:build

# Retain optional dependencies for prebuilt Sharp and the vendored ExifTool.
# The official container omits them because its base image supplies native libs.
"$MISE_BIN" exec -- pnpm --filter immich --prod deploy "$RELEASE/server"
"$MISE_BIN" exec -- pnpm --filter @immich/cli --prod deploy "$RELEASE/cli"
if [[ "$PHOLY_SHARP_MODE" == global ]]; then
  "$MISE_BIN" exec -- pnpm --config.verify-deps-before-run=false --dir "$RELEASE/server/node_modules/sharp" exec npm run build
fi
mkdir -p "$RELEASE/bin" "$RELEASE/build/plugins/immich-plugin-core" "$RELEASE/config" "$RELEASE/ml"
cp -a "$BUILD/web/build" "$RELEASE/build/www"
cp -a "$BUILD/packages/plugin-core/dist" "$BUILD/packages/plugin-core/manifest.json" "$RELEASE/build/plugins/immich-plugin-core/"
cp -a "$BUILD/i18n" "$RELEASE/i18n"
cp -a "$BUILD/LICENSE" "$RELEASE/LICENSE"
cp "$BUILD/LICENSE" "$RELEASE/source/LICENSE.txt"
cp -a "$BUILD/deployment/pholy/imagemagick" "$RELEASE/config/"
cp "$BUILD/deployment/pholy/"{run-server.sh,run-ml.sh,verify-storage.sh} "$RELEASE/bin/"
chmod 0755 "$RELEASE/bin/"*.sh
ln -s "$NODE_BIN" "$RELEASE/bin/node"
ln -s "$FFMPEG_BIN" "$RELEASE/bin/ffmpeg"
ln -s "$FFPROBE_BIN" "$RELEASE/bin/ffprobe"
ln -sfn ../../cli/bin/immich "$RELEASE/server/bin/immich"

cp -a "$BUILD/machine-learning/immich_ml" "$RELEASE/ml/"
cp "$BUILD/machine-learning/"{pyproject.toml,uv.lock,README.md} "$RELEASE/ml/"
# Build the virtualenv in its final location: Python entrypoints are not relocatable.
UV_PROJECT_ENVIRONMENT="$RELEASE/ml/venv" "$UV_BIN" sync --project "$RELEASE/ml" \
  --python "$PYTHON_BIN" --frozen --extra cpu --no-dev --no-editable --no-install-project

GEODATA="${PHOLY_GEODATA_DIR:-$PHOLY_TOOLCHAIN/cache/geodata-v3.4.1}"
python3 "$BUILD/deployment/pholy/geodata.py" "$GEODATA" "$RELEASE/build/geodata"
python3 "$BUILD/deployment/pholy/release-metadata.py" "$RELEASE" "$SOURCE_COMMIT" "$SOURCE_DATE_EPOCH" "$PHOLY_SHARP_MODE" "$PHOLY_MEDIA_PREFIX"
test -s "$RELEASE/server/dist/main.js"
test -s "$RELEASE/build/www/index.html"
test -s "$RELEASE/build/plugins/immich-plugin-core/dist/plugin.wasm"
test -s "$RELEASE/cli/package.json"
(
  cd "$RELEASE/server"
  "$NODE_BIN" --input-type=module -e \
    'import sharp from "sharp"; import bcrypt from "bcrypt"; import * as extism from "@extism/extism"; console.log(JSON.stringify({sharp:sharp.versions,heif:sharp.format.heif,bcrypt:typeof bcrypt.hash,extism:typeof extism.createPlugin})); if (!sharp.format.jpeg.input.buffer) process.exit(1);'
)
"$RELEASE/ml/venv/bin/python" -c 'import fastapi, gunicorn, onnxruntime; print("ML imports OK:", onnxruntime.__version__)'
touch "$RELEASE/BUILD_COMPLETE"
printf 'Release complete: %s\nSource archive: %s/source/pholy-source.tar.gz\n' "$RELEASE" "$RELEASE"
printf 'No service was started and no current symlink was changed.\n'
if [[ "$PHOLY_SHARP_MODE" == prebuilt ]]; then
  printf 'Prebuilt Sharp selected. Rebuild with PHOLY_SHARP_MODE=global and media-tools.sh for HEIC/RAW format parity.\n'
fi
