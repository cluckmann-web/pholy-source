#!/usr/bin/env python3
"""Fetch once, retain an integrity manifest, and reuse the exact geodata snapshot."""
# SPDX-License-Identifier: AGPL-3.0-only
import datetime, hashlib, io, json, shutil, sys, urllib.request, zipfile
from pathlib import Path
cache, destination = map(Path, sys.argv[1:3])
sources = {
    "cities500.txt": "https://download.geonames.org/export/dump/cities500.zip",
    "admin1CodesASCII.txt": "https://download.geonames.org/export/dump/admin1CodesASCII.txt",
    "admin2Codes.txt": "https://download.geonames.org/export/dump/admin2Codes.txt",
    "countryInfo.txt": "https://download.geonames.org/export/dump/countryInfo.txt",
    "ne_10m_admin_0_countries.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson",
}
manifest_file = cache / "manifest.json"
if not manifest_file.exists():
    cache.mkdir(parents=True, exist_ok=True)
    manifest = {"retrieved_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "files": {}}
    for name, url in sources.items():
        req = urllib.request.Request(url, headers={"User-Agent": "PHOLY-native-builder/1"})
        with urllib.request.urlopen(req, timeout=120) as response:
            raw = response.read()
        if name == "cities500.txt":
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                raw = archive.read("cities500.txt")
        if len(raw) < 1000:
            raise RuntimeError(f"Unexpectedly short geodata: {name}")
        if name.endswith(".geojson"):
            data = json.loads(raw)
            assert data["type"] == "FeatureCollection"
        (cache / name).write_bytes(raw)
        manifest["files"][name] = {"url": url, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}
    manifest_file.write_text(json.dumps(manifest, indent=2) + "\n")
manifest = json.loads(manifest_file.read_text())
assert set(manifest["files"]) == set(sources), "Unexpected/incomplete geodata manifest"
for name, info in manifest["files"].items():
    raw = (cache / name).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == info["sha256"], f"Geodata integrity failure: {name}"
destination.mkdir(parents=True, exist_ok=False)
for name in sources:
    shutil.copy2(cache / name, destination / name)
shutil.copy2(manifest_file, destination / "manifest.json")
(destination / "geodata-date.txt").write_text(manifest["retrieved_at_utc"] + "\n")
(destination / "ATTRIBUTION.txt").write_text(
    "GeoNames: https://www.geonames.org/ — CC BY 4.0, https://creativecommons.org/licenses/by/4.0/\n"
    "Natural Earth v5.1.2: https://www.naturalearthdata.com/ — public domain\n"
    "Keep manifest.json and this snapshot to reproduce the release.\n")
print("Verified and packaged geodata snapshot:", manifest["retrieved_at_utc"])
