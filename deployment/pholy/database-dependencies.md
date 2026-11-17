# Dedicated PostgreSQL 16 extension dependencies

PHOLY uses its own cluster on `127.0.0.1:5448`. The existing main cluster on
5432 is not part of this deployment. Installing new extension files under the
PostgreSQL 16 installation does not activate them in another database. Do not
modify the main cluster's configuration or restart it.

| Component | Pin | Source / binary |
|---|---|---|
| pgvector | v0.8.1; commit `778dacf20c07caf904557a88705142631818d8cb` | [official source archive](https://codeload.github.com/pgvector/pgvector/tar.gz/778dacf20c07caf904557a88705142631818d8cb) |
| VectorChord | 0.4.3; PG16 amd64 | [official Debian package](https://github.com/supervc-stack/VectorChord/releases/download/0.4.3/postgresql-16-vchord_0.4.3-1_amd64.deb) |
| PostgreSQL | Ubuntu package 16, security updates within major 16 | `postgresql-16`, `postgresql-contrib-16`, `postgresql-server-dev-16` |

The former `tensorchord/VectorChord` GitHub repository redirects to
`supervc-stack/VectorChord` (repository ID 851492630).

SHA256:

```text
4c33cf053329784ba6d992d05c9588b93789e907a7511f20ff5a5a5b8a0703c1  pgvector-778dacf20c07caf904557a88705142631818d8cb.tar.gz
f5aa6d02b5ac730a44a5168ccf8cbb93b7f59d9e7ace494786e9762b6a74dd2b  postgresql-16-vchord_0.4.3-1_amd64.deb
```

The VectorChord hash is published as the GitHub asset digest. The pgvector
hash was computed from the exact official commit archive on 2026-11-15.
`build-db-extensions.sh` reproduces the downloads, verifies both hashes and
builds pgvector as `pholy`; it does not install or restart anything.

Administrator installation after review:

```sh
make -C /var/www/vhosts/pholy.de/pholy-toolchain/db-build/pgvector-778dacf20c07caf904557a88705142631818d8cb PG_CONFIG=/usr/lib/postgresql/16/bin/pg_config install
dpkg -i /var/www/vhosts/pholy.de/pholy-toolchain/db-build/postgresql-16-vchord_0.4.3-1_amd64.deb
```

Initialize only the empty PHOLY cluster as Unix user `pholy`, with PostgreSQL
superuser `pholy`, local peer authentication, and host SCRAM authentication:

```sh
/usr/lib/postgresql/16/bin/initdb -D /var/www/vhosts/pholy.de/pholy-data/postgres --username=pholy --auth-local=peer --auth-host=scram-sha-256 --encoding=UTF8
```

Install the supplied private `postgresql.conf` / `pg_hba.conf`, then start
only `pholy-postgresql.service`. The PostgreSQL package on the reviewed
Ubuntu 24.04 host reports `--with-systemd`; the service uses Type=notify.

Create database `pholy`, owned by application role `pholy_app`. Give the
role a generated random password, with LOGIN but no superuser, createdb or
createrole rights. In that database, as the cluster superuser, run:

```sql
CREATE EXTENSION IF NOT EXISTS vchord CASCADE;
CREATE EXTENSION IF NOT EXISTS earthdistance CASCADE;
```

This creates the dependent `vector` and `cube` extensions. The application
owner needs normal DDL privileges in its database for Immich migrations.
Keep the superuser credentials out of the application environment.

The PHOLY config disables scheduled database dumps (`backup.database.enabled`)
and the optional backups beta. The Redis append-only file is queue persistence.
It is not an additional backup job.

References: [Immich standalone PostgreSQL](https://docs.immich.app/administration/postgres-standalone/),
[pgvector source](https://github.com/pgvector/pgvector/tree/v0.8.1),
[VectorChord release](https://github.com/supervc-stack/VectorChord/releases/tag/0.4.3),
and `server/src/constants.ts` in the pinned Immich checkout.
