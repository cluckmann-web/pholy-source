#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
import json, sys, tomllib
from pathlib import Path
root = Path(sys.argv[1])
tools = tomllib.loads((root / "mise.toml").read_text())["tools"]
expected = {"node": "24.22.1", "pnpm": "12.15.0", "github:extism/cli": "1.6.3",
            "github:extism/js-pdk": "v1.7.0", "github:webassembly/binaryen": "version_124"}
for key, version in expected.items():
    assert tools[key] == version, f"Review changed upstream tool pin: {key}"
assert tools["github:jellyfin/jellyfin-ffmpeg"]["version"] == "7.1.3-6"
ml = tomllib.loads((root / "machine-learning/mise.lock").read_text())["tools"]
assert ml["python"][0]["version"] == "3.12.14"
assert ml["uv"][0]["version"] == "0.8.15"
package = json.loads((root / "package.json").read_text())
assert package["version"] == "3.4.1"
assert package["packageManager"] == "pnpm@12.15.0"
print("Validated Immich v3.4.1 tool pins, including lockfile Python 3.12.14.")
