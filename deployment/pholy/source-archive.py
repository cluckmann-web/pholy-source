#!/usr/bin/env python3
"""Create/verify a complete PHOLY source archive without requiring a private Git remote."""
# SPDX-License-Identifier: AGPL-3.0-only
import gzip, hashlib, json, os, re, shutil, subprocess, sys, tarfile
from pathlib import Path

BASE = "22b95194c80a2f2e6201093916b6c8c3d6d271dd"
MANIFEST = "PHOLY-SOURCE.json"

def tree_manifest(root):
    result = {}
    for directory, dirs, names in os.walk(root, followlinks=False):
        for name in sorted(dirs + names):
            path = Path(directory) / name
            relative = path.relative_to(root).as_posix()
            if relative == MANIFEST:
                continue
            if path.is_symlink():
                target = os.readlink(path)
                if os.path.isabs(target) or not path.resolve().is_relative_to(root.resolve()):
                    raise RuntimeError(f"Source symlink escapes the source directory: {relative}")
                result[relative] = {"symlink": target}
            elif path.is_file():
                digest = hashlib.sha256()
                with path.open("rb") as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                        digest.update(chunk)
                result[relative] = {"sha256": digest.hexdigest(), "executable": bool(path.stat().st_mode & 0o111)}
    return result

def read_manifest(root):
    data = json.loads((root / MANIFEST).read_text())
    if data.get("format") != 1 or data.get("upstream_commit") != BASE:
        raise RuntimeError("Unsupported or unexpected PHOLY source metadata.")
    if not re.fullmatch(r"[0-9a-f]{40}", data["source_commit"]):
        raise RuntimeError("Invalid source commit in PHOLY-SOURCE.json.")
    if not isinstance(data["source_date_epoch"], int) or data["source_date_epoch"] <= 0:
        raise RuntimeError("Invalid source timestamp.")
    if tree_manifest(root) != data["files"]:
        raise RuntimeError("Source archive files differ from PHOLY-SOURCE.json. Use an untouched extracted source archive.")
    return data

action = sys.argv[1]
source = Path(sys.argv[2]).resolve()
if action == "info":
    metadata = read_manifest(source)
    print(metadata["source_commit"])
    print(metadata["source_date_epoch"])
elif action == "export":
    kind, commit, epoch_string, archive_string, build_string = sys.argv[3:8]
    archive, build = Path(archive_string), Path(build_string)
    epoch = int(epoch_string)
    if any(build.iterdir()):
        raise RuntimeError("Build workspace must be empty.")
    if kind == "git":
        raw = archive.parent / ".git-export.tar"
        try:
            with raw.open("wb") as output:
                subprocess.run(["git", "-C", str(source), "archive", "--format=tar", commit], stdout=output, check=True)
            with tarfile.open(raw) as stream:
                stream.extractall(build, filter="data")
        finally:
            raw.unlink(missing_ok=True)
    elif kind == "archive":
        original = read_manifest(source)
        if original["source_commit"] != commit or original["source_date_epoch"] != epoch:
            raise RuntimeError("Source metadata changed during build preparation.")
        shutil.copytree(source, build, symlinks=True, dirs_exist_ok=True)
    else:
        raise RuntimeError("Unknown source mode.")
    if kind == "git":
        source_tree = subprocess.check_output(["git", "-C", str(source), "rev-parse", f"{commit}^{{tree}}"], text=True).strip()
        gitlinks = {}
        entries = subprocess.check_output(["git", "-C", str(source), "ls-tree", "-rz", commit]).split(bytes([0]))
        for entry in entries:
            if not entry:
                continue
            attributes, name = entry.split(bytes([9]), 1)
            mode, object_type, object_id = attributes.decode().split()
            if mode == "160000":
                gitlinks[os.fsdecode(name)] = object_id
    else:
        source_tree = original["source_tree"]
        gitlinks = original["gitlinks"]
    metadata = {
        "format": 1, "application": "PHOLY", "upstream_version": "3.4.1",
        "upstream_commit": BASE, "source_commit": commit, "source_tree": source_tree,
        "source_date_epoch": epoch, "gitlinks": gitlinks,
        "files": tree_manifest(build),
    }
    (build / MANIFEST).write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n")
    def normalize(info):
        info.uid = info.gid = 0
        info.uname = info.gname = ""
        info.mtime = epoch
        info.pax_headers = {}
        return info
    with archive.open("wb") as output:
        with gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode="w", format=tarfile.PAX_FORMAT) as stream:
                stream.add(build, arcname="pholy-source", filter=normalize)
    print(f"Exported {len(metadata['files'])} source files and links from {kind} input.")
else:
    raise SystemExit("Usage: source-archive.py info SOURCE | export SOURCE KIND COMMIT EPOCH ARCHIVE BUILD")
