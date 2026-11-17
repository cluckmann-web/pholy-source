#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
import datetime, hashlib, json, os, subprocess, sys
from pathlib import Path
release = Path(sys.argv[1])
commit, epoch, sharp_mode, media_prefix = sys.argv[2:6]
env = {
    "IMMICH_BUILD": f"PHOLY-3.4.1-{commit[:12]}",
    "IMMICH_REPOSITORY": "PHOLY",
    "IMMICH_REPOSITORY_URL": "https://pholy.de/source",
    "IMMICH_SOURCE_REF": f"pholy-{commit[:12]}",
    "IMMICH_SOURCE_COMMIT": commit,
    "IMMICH_SOURCE_URL": "https://pholy.de/source",
    "IMMICH_THIRD_PARTY_SOURCE_URL": "https://pholy.de/source",
}
(release / "build.env").write_text("".join(f"{key}={value}\n" for key, value in env.items()))
provenance = {
    "application": "PHOLY", "upstream_version": "3.4.1",
    "upstream_commit": "22b95194c80a2f2e6201093916b6c8c3d6d271dd",
    "source_commit": commit, "source_date_epoch": int(epoch),
    "sharp_mode": sharp_mode, "media_prefix": media_prefix,
    "tools": {"node": "24.22.1", "pnpm": "12.15.0", "python": "3.12.14", "uv": "0.8.15",
              "extism_cli": "1.6.3", "extism_js_pdk": "1.7.0", "binaryen": "124", "jellyfin_ffmpeg": "7.1.3-6"},
    "source_archive_sha256": hashlib.sha256((release / "source/pholy-source.tar.gz").read_bytes()).hexdigest(),
    "geodata_manifest": json.loads((release / "build/geodata/manifest.json").read_text()),
    "imagemagick_policy_commit": "e6d98454d6e6ed9a24df4ceff048590fbca30cd0",
}
(release / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
# Supported by ServerInfoRepository; empty arrays permit live version probing.
(release / "build/build-lock.json").write_text(json.dumps({
    "sources": [], "packages": [{"name": "ffmpeg", "version": "7.1.3-6"}]
}, indent=2) + "\n")
(release / "source/README.txt").write_text(
    "PHOLY corresponding source for the running network application.\n"
    f"Source commit: {commit}\n"
    "Upstream: Immich v3.4.1, 22b95194c80a2f2e6201093916b6c8c3d6d271dd\n"
    "License: GNU AGPL version 3; see LICENSE in the source archive.\n"
    "Includes PHOLY modifications, build scripts, lockfiles and deployment templates.\n"
    "Build instructions: deployment/pholy/README.md inside the archive.\n"
    "Media, credentials and user database are not part of the source archive.\n")
