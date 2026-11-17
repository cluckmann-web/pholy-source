#!/usr/bin/env bash
# Fail closed. This check never creates a directory or a test file.
# SPDX-License-Identifier: AGPL-3.0-only
set -Eeuo pipefail
expected=/mnt/familyphotos-storage/Cloud-Fotos/PHOLY
media="${IMMICH_MEDIA_LOCATION:-}"
fail() { printf 'PHOLY media guard: %s\n' "$*" >&2; exit 1; }
on_cifs() {
  local path="$1" magic target
  # statfs checks the filesystem actually backing this path. With systemd
  # automount, findmnt may legitimately report BOTH autofs and cifs.
  magic="$(stat --file-system --format=%t -- "$path")" || return 1
  case "$magic" in ff534d42|fe534d42) ;; *) return 1 ;; esac
  target="$(findmnt -rn -T "$path" -t cifs -o TARGET | tail -n 1)"
  case "$target" in /mnt/familyphotos-storage|/mnt/familyphotos-storage/*) return 0 ;; *) return 1 ;; esac
}
[[ "$media" == "$expected" ]] || fail "IMMICH_MEDIA_LOCATION must be exactly $expected"
[[ -d "$media" ]] || fail "The PHOLY media directory is absent."
on_cifs "$media" || fail "PHOLY media is not backed by the expected CIFS mount; refusing local fallback."
[[ -r "$media" && -w "$media" && -x "$media" ]] ||
  fail "The application user cannot access the CIFS media directory."
# Originals cannot be redirected out of the approved share by symlinks or bind mounts.
for name in upload library; do
  path="$media/$name"
  if [[ -e "$path" || -L "$path" ]]; then
    actual="$(realpath -e -- "$path")" || fail "Unresolvable originals directory: $name"
    case "$actual" in "$media"/*) ;; *) fail "$name resolves outside the media root" ;; esac
    on_cifs "$path" || fail "$name is not stored on CIFS."
  fi
done
