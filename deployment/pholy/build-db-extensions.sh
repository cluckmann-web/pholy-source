#!/usr/bin/env bash
# Download/compile only. Installation is a separate administrator step.
# SPDX-License-Identifier: AGPL-3.0-only
set -Eeuo pipefail
umask 0022
[[ "$(id -un)" == pholy ]] || { echo "Run the build as pholy." >&2; exit 1; }
DB_BUILD="${PHOLY_DB_BUILD:-/var/www/vhosts/pholy.de/pholy-toolchain/db-build}"
PG_CONFIG="${PG_CONFIG:-/usr/lib/postgresql/16/bin/pg_config}"
[[ "$("$PG_CONFIG" --version)" == 'PostgreSQL 16.'* ]] || { echo "PostgreSQL 16 development files required." >&2; exit 1; }
mkdir -p "$DB_BUILD"
cd "$DB_BUILD"
source_file=pgvector-778dacf20c07caf904557a88705142631818d8cb.tar.gz
package_file=postgresql-16-vchord_0.4.3-1_amd64.deb
curl --fail --location --retry 3 --proto '=https' --tlsv1.2 \
  https://codeload.github.com/pgvector/pgvector/tar.gz/778dacf20c07caf904557a88705142631818d8cb -o "$source_file"
curl --fail --location --retry 3 --proto '=https' --tlsv1.2 \
  "https://github.com/supervc-stack/VectorChord/releases/download/0.4.3/$package_file" -o "$package_file"
printf '%s  %s\n' 4c33cf053329784ba6d992d05c9588b93789e907a7511f20ff5a5a5b8a0703c1 "$source_file" \
  f5aa6d02b5ac730a44a5168ccf8cbb93b7f59d9e7ace494786e9762b6a74dd2b "$package_file" | sha256sum --check -
src="$DB_BUILD/pgvector-778dacf20c07caf904557a88705142631818d8cb"
[[ ! -e "$src" ]] || { echo "Existing source directory: inspect it or use another PHOLY_DB_BUILD." >&2; exit 1; }
tar --extract --gzip --file "$source_file"
make -C "$src" PG_CONFIG="$PG_CONFIG" -j"${PHOLY_BUILD_JOBS:-4}"
printf 'Built pgvector v0.8.1: %s\nVerified VectorChord package: %s/%s\n' "$src" "$DB_BUILD" "$package_file"
printf 'No extension was installed and no PostgreSQL service was restarted.\n'
