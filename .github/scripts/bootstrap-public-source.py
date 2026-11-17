#!/usr/bin/env python3
"""Import the pinned PHOLY source tree, preserving main and Immich ancestry."""
# SPDX-License-Identifier: AGPL-3.0-only
import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

REPOSITORY = "cluckmann-web/pholy-source"
UPSTREAM = "22b95194c80a2f2e6201093916b6c8c3d6d271dd"
SOURCE_URL = "https://pholy.de/source/pholy-source.tar.gz"
BOOTSTRAP_MANIFEST = ".github/pholy-public-bootstrap.json"
IMPORT_SCRIPT = ".github/scripts/bootstrap-public-source.py"
SOURCE_METADATA = "PHOLY-SOURCE.json"
MAX_ARCHIVE = 512 * 1024 * 1024
MAX_FILE = 100 * 1024 * 1024
MAX_TOTAL = 2 * 1024 * 1024 * 1024
MAX_ENTRIES = 100000


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def oid(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{40}", value) is not None


def safe_path(value):
    require(isinstance(value, str) and value, "Empty source path.")
    require(not value.startswith("/") and "\\" not in value, "Non-relative source path.")
    parts = value.split("/")
    require(all(part not in ("", ".", "..") for part in parts), "Non-canonical source path.")
    require(all(part.lower() != ".git" for part in parts), "Git control path in archive.")
    require(not any(ord(char) < 32 for char in value), "Control character in source path.")
    return value


def git(*args, data=None, env=None, cwd=None):
    result = subprocess.run(
        ["git", *args], input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=env, cwd=cwd, check=False,
    )
    if result.returncode:
        # Do not echo environment or command arguments: the auth header is env-only.
        detail = result.stderr.decode("utf-8", "replace")[-3000:]
        raise RuntimeError("Git operation failed: " + detail)
    return result.stdout


def validate_manifest(data):
    require(isinstance(data, dict) and data.get("format") == 1, "Unsupported import manifest.")
    require(data.get("repository") == REPOSITORY, "Unexpected target repository.")
    require(data.get("source_url") == SOURCE_URL, "Unexpected source URL.")
    require(data.get("upstream_commit") == UPSTREAM, "Unexpected Immich base.")
    require(oid(data.get("source_commit")) and oid(data.get("source_tree")), "Invalid source IDs.")
    require(
        isinstance(data.get("archive_sha256"), str)
        and re.fullmatch(r"[0-9a-f]{64}", data["archive_sha256"]),
        "Invalid archive SHA256.",
    )
    require(
        type(data.get("source_date_epoch")) is int and data["source_date_epoch"] > 0,
        "Invalid source timestamp.",
    )
    return data


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("Source download redirected; verify a direct release URL.")


def download_archive(manifest, destination):
    opener = urllib.request.build_opener(NoRedirects())
    request = urllib.request.Request(manifest["source_url"], headers={"User-Agent": "PHOLY-source-import/1"})
    digest, size = hashlib.sha256(), 0
    with opener.open(request, timeout=90) as response, destination.open("wb") as output:
        require(response.status == 200, "Source download did not return HTTP 200.")
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            require(size <= MAX_ARCHIVE, "Source archive exceeds size limit.")
            digest.update(chunk)
            output.write(chunk)
    require(size > 0 and digest.hexdigest() == manifest["archive_sha256"], "Archive SHA256 mismatch.")


def verify_archive_hash(archive, expected):
    digest = hashlib.sha256()
    size = 0
    with archive.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            size += len(chunk)
            require(size <= MAX_ARCHIVE, "Source archive exceeds size limit.")
            digest.update(chunk)
    require(size > 0 and digest.hexdigest() == expected, "Archive SHA256 mismatch.")


def archive_tree(archive, manifest, index_path, repository):
    """Hash verified tar data directly; never extract or execute archived code."""
    verify_archive_hash(archive, manifest["archive_sha256"])
    index_env = os.environ.copy()
    index_env["GIT_INDEX_FILE"] = str(index_path)
    index_env["GIT_CONFIG_NOSYSTEM"] = "1"
    index_env["GIT_CONFIG_GLOBAL"] = os.devnull
    git("read-tree", "--empty", env=index_env, cwd=repository)

    files, entries, metadata, seen = {}, [], None, set()
    total = 0
    with tarfile.open(archive, "r:gz", encoding="utf-8", errors="surrogateescape") as stream:
        for number, item in enumerate(stream, 1):
            require(number <= MAX_ENTRIES, "Too many archive entries.")
            require(item.name == "pholy-source" or item.name.startswith("pholy-source/"),
                    "Unexpected archive prefix.")
            path = item.name[len("pholy-source/"):] if item.name.startswith("pholy-source/") else ""
            if not path:
                require(item.isdir(), "Invalid archive root.")
                continue
            path = safe_path(path.rstrip("/") if item.isdir() else path)
            require(path not in seen, "Duplicate archive path.")
            seen.add(path)
            if item.isdir():
                continue
            require(item.isfile() or item.issym(), "Unsupported tar entry type.")
            require(item.size <= MAX_FILE, "Source file exceeds GitHub's file-size limit.")
            total += item.size
            require(total <= MAX_TOTAL, "Uncompressed source exceeds size limit.")
            if item.issym():
                content = item.linkname.encode("utf-8", "surrogateescape")
                require(b"\0" not in content, "NUL in symlink target.")
                mode = "120000"
                description = {"symlink": item.linkname}
            else:
                with stream.extractfile(item) as file:
                    content = file.read(MAX_FILE + 1)
                require(len(content) == item.size and len(content) <= MAX_FILE, "Truncated source member.")
                executable = bool(item.mode & 0o111)
                mode = "100755" if executable else "100644"
                description = {"sha256": hashlib.sha256(content).hexdigest(), "executable": executable}
            if path == SOURCE_METADATA:
                require(item.isfile() and len(content) <= 16 * 1024 * 1024, "Invalid source metadata.")
                metadata = json.loads(content)
                continue
            files[path] = description
            blob = git("hash-object", "-w", "--stdin", data=content, cwd=repository).strip().decode()
            entries.append((mode, blob, path))

    require(isinstance(metadata, dict), "Missing PHOLY-SOURCE.json.")
    require(metadata.get("format") == 1 and metadata.get("application") == "PHOLY",
            "Unexpected source metadata format.")
    require(metadata.get("upstream_version") == "3.4.1", "Unexpected upstream version.")
    for key in ("upstream_commit", "source_commit", "source_tree", "source_date_epoch"):
        require(metadata.get(key) == manifest[key], "Source metadata mismatch: " + key)
    require(metadata.get("files") == files, "Archive file hashes, modes or symlinks do not match metadata.")
    gitlinks = metadata.get("gitlinks")
    require(isinstance(gitlinks, dict), "Missing gitlink metadata.")
    for path, commit in gitlinks.items():
        safe_path(path)
        require(oid(commit) and path not in files, "Invalid or conflicting gitlink.")
        entries.append(("160000", commit, path))
    require(BOOTSTRAP_MANIFEST not in files, "Temporary bootstrap manifest must not be in the source tree.")
    index_data = b"".join(
        mode.encode() + b" " + commit.encode() + b"\t" + path.encode("utf-8", "surrogateescape") + b"\0"
        for mode, commit, path in sorted(entries, key=lambda entry: entry[2])
    )
    git("update-index", "-z", "--index-info", data=index_data, env=index_env, cwd=repository)
    tree = git("write-tree", env=index_env, cwd=repository).strip().decode()
    require(tree == manifest["source_tree"], "Reconstructed Git tree differs from pinned source tree.")
    print(f"Verified source tree {tree}: {len(files)} files/symlinks, {len(gitlinks)} gitlinks.")
    return tree


def workflow_entries(tree, repository):
    return git("ls-tree", "-r", "-z", tree, "--", ".github/workflows", cwd=repository)


def auth_environment(token):
    # The normal job-scoped GITHUB_TOKEN is used only for this repository.
    result = os.environ.copy()
    result["GIT_TERMINAL_PROMPT"] = "0"
    result["GIT_CONFIG_COUNT"] = "1"
    result["GIT_CONFIG_KEY_0"] = "http.https://github.com/.extraheader"
    header = base64.b64encode(("x-access-token:" + token).encode()).decode()
    result["GIT_CONFIG_VALUE_0"] = "AUTHORIZATION: basic " + header
    return result


def remote_head(repository, auth_env):
    output = git("ls-remote", "--exit-code", "origin", "refs/heads/main", env=auth_env, cwd=repository)
    fields = output.decode().strip().split()
    require(len(fields) == 2 and oid(fields[0]) and fields[1] == "refs/heads/main", "Unexpected remote main.")
    return fields[0]


def already_imported(head, bootstrap, manifest, repository, auth_env):
    if head == bootstrap:
        return False
    git("fetch", "--no-tags", "--no-recurse-submodules", "origin", head, env=auth_env, cwd=repository)
    tree = git("rev-parse", head + "^{tree}", cwd=repository).strip().decode()
    parents = git("show", "-s", "--format=%P", head, cwd=repository).decode().split()
    require(
        tree == manifest["source_tree"] and parents == [bootstrap, UPSTREAM],
        "main advanced after bootstrap; refusing to overwrite another commit.",
    )
    print("The verified source tree was already imported; no push is needed.")
    return True


def run_import(manifest_path):
    manifest = validate_manifest(json.loads(manifest_path.read_text()))
    require(os.environ.get("GITHUB_REPOSITORY") == REPOSITORY, "Run only in the PHOLY repository.")
    require(os.environ.get("GITHUB_REF") == "refs/heads/main", "Run only on main.")
    require(os.environ.get("GITHUB_EVENT_NAME") == "push", "Run only from the reviewed push event.")
    require(os.environ.get("GITHUB_SERVER_URL") == "https://github.com", "Unexpected GitHub server.")
    repository = Path.cwd()
    require(git("rev-parse", "--show-object-format", cwd=repository).strip() == b"sha1", "Expected SHA-1 Git repository.")
    bootstrap = git("rev-parse", "HEAD", cwd=repository).strip().decode()
    require(bootstrap == os.environ.get("GITHUB_SHA"), "Checkout is not the triggering commit.")
    require(git("rev-parse", "--is-shallow-repository", cwd=repository).strip() == b"false",
            "Bootstrap checkout must contain complete history.")
    origin = git("remote", "get-url", "origin", cwd=repository).decode().strip()
    require(origin.rstrip("/") in (
        "https://github.com/" + REPOSITORY, "https://github.com/" + REPOSITORY + ".git",
    ), "Unexpected origin URL.")
    token = os.environ.pop("GH_TOKEN", "")
    require(bool(token), "Missing normal job GITHUB_TOKEN.")
    auth_env = auth_environment(token)
    del token
    if already_imported(remote_head(repository, auth_env), bootstrap, manifest, repository, auth_env):
        return

    with tempfile.TemporaryDirectory(prefix="pholy-import-", dir=os.environ.get("RUNNER_TEMP")) as temporary:
        temporary = Path(temporary)
        archive = temporary / "source.tar.gz"
        download_archive(manifest, archive)
        tree = archive_tree(archive, manifest, temporary / "index", repository)

        # Keep only this reviewed one-time import runner in addition to the
        # verified source. It is removed by the publication commit afterward.
        index_env = os.environ.copy()
        index_env["GIT_INDEX_FILE"] = str(temporary / "index")
        for path in (IMPORT_SCRIPT, ".github/workflows/bootstrap-public-source.yml"):
            entry = git("ls-tree", "-z", bootstrap, "--", path, cwd=repository)
            require(bool(entry), "Missing bootstrap entry: " + path)
            git("update-index", "-z", "--index-info", data=entry, env=index_env, cwd=repository)
        tree = git("write-tree", env=index_env, cwd=repository).strip().decode()
        require(workflow_entries(tree, repository) == workflow_entries(bootstrap, repository),
                "Active workflows must already be byte-identical in bootstrap and source.")
        source_script = git("rev-parse", tree + ":" + IMPORT_SCRIPT, cwd=repository).strip()
        bootstrap_script = git("rev-parse", bootstrap + ":" + IMPORT_SCRIPT, cwd=repository).strip()
        require(source_script == bootstrap_script, "Importer script differs between bootstrap and source.")

        # No depth/filter: the second parent must have its complete public history.
        git("-c", "fetch.fsckObjects=true", "fetch", "--no-tags", "--no-recurse-submodules",
            "https://github.com/immich-app/immich.git", UPSTREAM, cwd=repository)
        require(git("cat-file", "-t", UPSTREAM, cwd=repository).strip() == b"commit", "Missing upstream commit.")
        require(git("rev-parse", "--is-shallow-repository", cwd=repository).strip() == b"false",
                "Upstream history is unexpectedly shallow.")
        git("fsck", "--connectivity-only", "--no-dangling", UPSTREAM, cwd=repository)

        require(remote_head(repository, auth_env) == bootstrap, "main advanced during import; refusing to push.")
        message = (
            "Import complete PHOLY source based on Immich 3.4.1\n\n"
            f"PHOLY-Source-Commit: {manifest['source_commit']}\n"
            f"PHOLY-Source-Tree: {tree}\n"
            f"PHOLY-Archive-SHA256: {manifest['archive_sha256']}\n"
            f"Immich-Upstream: {UPSTREAM}\n"
        )
        commit_env = os.environ.copy()
        for role in ("AUTHOR", "COMMITTER"):
            commit_env["GIT_" + role + "_NAME"] = "github-actions[bot]"
            commit_env["GIT_" + role + "_EMAIL"] = "41898282+github-actions[bot]@users.noreply.github.com"
        commit = git("commit-tree", tree, "-p", bootstrap, "-p", UPSTREAM,
                     data=message.encode(), env=commit_env, cwd=repository).strip().decode()
        require(git("rev-parse", commit + "^{tree}", cwd=repository).strip().decode() == tree,
                "Final commit tree differs from verified source plus bootstrap runner.")
        git("merge-base", "--is-ancestor", bootstrap, commit, cwd=repository)
        git("merge-base", "--is-ancestor", UPSTREAM, commit, cwd=repository)
        # Ordinary fast-forward push; concurrent updates are never forced away.
        git("push", "origin", commit + ":refs/heads/main", env=auth_env, cwd=repository)
        require(remote_head(repository, auth_env) == commit, "Could not verify the imported remote head.")
        print(f"Imported {commit}; exact source tree {tree}; both main and Immich ancestry retained.")
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a") as output:
                output.write(
                    "## PHOLY source imported\n\n"
                    f"- Commit: `{commit}`\n- Source tree: `{tree}`\n"
                    "- Full source, executable modes, symlinks and submodule gitlinks verified.\n"
                    "- Previous main and the pinned Immich history are both parents.\n"
                )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run")
    run.add_argument("manifest", type=Path)
    verify = commands.add_parser("verify", help="Verify an archive into a disposable local Git object database; never push.")
    verify.add_argument("manifest", type=Path)
    verify.add_argument("archive", type=Path)
    verify.add_argument("repository", type=Path)
    args = parser.parse_args()
    if args.command == "run":
        run_import(args.manifest)
    else:
        manifest = validate_manifest(json.loads(args.manifest.read_text()))
        with tempfile.TemporaryDirectory(prefix="pholy-verify-") as temporary:
            archive_tree(args.archive, manifest, Path(temporary) / "index", args.repository.resolve())


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, OSError, tarfile.TarError) as error:
        print("PHOLY import stopped: " + str(error), file=sys.stderr)
        raise SystemExit(1)
