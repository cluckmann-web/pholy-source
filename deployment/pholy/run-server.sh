#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
set -Eeuo pipefail
release="$(realpath -- "$(dirname -- "${BASH_SOURCE[0]}")/..")"
[[ -f "$release/BUILD_COMPLETE" ]] || { echo "Incomplete PHOLY release" >&2; exit 1; }
"$release/bin/verify-storage.sh"
set -a
. "$release/build.env"
set +a
export IMMICH_BUILD_DATA="$release/build"
export MAGICK_CONFIGURE_PATH="$release/config/imagemagick"
export PHOLY_MEDIA_PREFIX="${PHOLY_MEDIA_PREFIX:-/var/www/vhosts/pholy.de/pholy-toolchain/media}"
export PATH="$release/bin:$release/server/bin:$PHOLY_MEDIA_PREFIX/bin:/usr/lib/postgresql/16/bin:/usr/local/bin:/usr/bin:/bin"
export LD_LIBRARY_PATH="$PHOLY_MEDIA_PREFIX/lib:$PHOLY_MEDIA_PREFIX/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
cd "$release/server"
exec "$release/server/bin/start.sh"
