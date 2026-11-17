#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
set -Eeuo pipefail
release="$(realpath -- "$(dirname -- "${BASH_SOURCE[0]}")/..")"
[[ -f "$release/BUILD_COMPLETE" ]] || { echo "Incomplete PHOLY release" >&2; exit 1; }
export PATH="$release/ml/venv/bin:/usr/bin:/bin"
export PYTHONDONTWRITEBYTECODE=1
cd "$release/ml"
exec "$release/ml/venv/bin/python" -m immich_ml
