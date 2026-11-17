# PHOLY native deployment

This directory adds a native, systemd-managed PHOLY deployment to Immich
v3.4.1, upstream commit `22b95194c80a2f2e6201093916b6c8c3d6d271dd`.
The application is built from a reviewed PHOLY commit descending from that
version. This is a custom deployment; the official Immich production install
uses Docker Compose.

## Layout and ownership

| Path | Purpose |
|---|---|
| `/var/www/vhosts/pholy.de/pholy-app` | Source checkout |
| `/var/www/vhosts/pholy.de/pholy-runtime/releases/<release-id>` | Complete immutable application release |
| `/var/www/vhosts/pholy.de/pholy-runtime/current` | Administrator-selected release symlink |
| `/var/www/vhosts/pholy.de/pholy-runtime/build/<release-id>` | Isolated build workspace exported from Git |
| `/var/www/vhosts/pholy.de/pholy-toolchain` | Pinned mise tools, native media tools, reusable build cache |
| `/var/www/vhosts/pholy.de/pholy-data` | Local DB, queue persistence, ML models, temporary files, secret configs |
| `/mnt/familyphotos-storage/Cloud-Fotos/PHOLY` | CIFS media, including all originals |

All application processes run as Unix user `pholy`. The host's Plesk group
`psacln` is shared, so secret configs and PostgreSQL/Redis data must be owned
by `pholy` with mode 0600 for files and 0700 for directories. Do not rely on
group isolation. Public release files can be 0644 and directories 0755, so the
domain reverse proxy can serve the source archive.

The fixed media root stores Immich's upload/library/thumbs/encoded-video/profile
subdirectories on CIFS. ML models, temporary files, PostgreSQL and Redis remain
local. The mount guard checks the effective filesystem with statfs plus `findmnt -t cifs` (including systemd automount overlays),
refuses a missing/unwritable share, and never creates a local fallback.
The server service uses `RequiresMountsFor` and binds its lifetime to the
mount unit `mnt-familyphotos\\x2dstorage.mount`. PostgreSQL and Redis have
no dependency on the share. No backup job is enabled.

## Prerequisites

Administrator-installed Ubuntu packages:

```text
ca-certificates curl git xz-utils unzip tar util-linux cifs-utils
build-essential pkg-config python3 python3-dev python3-venv
libgomp1 libglib2.0-0t64 libgl1
perl libimage-exiftool-perl libio-compress-brotli-perl
postgresql-16 postgresql-contrib-16 postgresql-server-dev-16 redis-server
```

Ubuntu 24.04 already provides Python 3.12 for helper scripts. The application
ML environment uses the exact separate Python 3.12.14 from upstream's lockfile.
The database requires additional pgvector/VectorChord extensions; see
[database-dependencies.md](database-dependencies.md).

Install mise separately at
`/var/www/vhosts/pholy.de/pholy-toolchain/bin/mise` (reviewed version
2026.10.20). The builder honors `MISE_BIN`, `MISE_DATA_DIR`,
`MISE_CONFIG_DIR`, `MISE_CACHE_DIR`, and `MISE_STATE_DIR`.

The builder selects only these upstream-pinned tools:

| Tool | Version |
|---|---|
| Node.js | 24.22.1 |
| pnpm | 12.15.0 |
| Python | 3.12.14 |
| uv | 0.8.15 |
| Extism CLI | 1.6.3 |
| Extism JS PDK | 1.7.0 |
| Binaryen | version_124 |
| Jellyfin FFmpeg | 7.1.3-6 |

It uses upstream mise build tasks for SDK/core plugin, server, web and CLI.
It sets MISE_LOCKED=1 to preserve dependency tool lockfiles and disables implicit installation of unrelated monorepo tools. Java,
Terraform/OpenTofu, restic and Docker are not needed by this builder. Tool
download checksums are supplied by the upstream mise lockfiles. Retain the
pinned tool installations: runtime Node, FFmpeg and Python use those paths.

### Native image formats

`PHOLY_SHARP_MODE=prebuilt` is the builder default and keeps pnpm's optional
prebuilt Sharp dependencies. It supports common web image formats but does
not provide the full HEIC/RAW format coverage of the official image.

For the production photo deployment, prepare the reviewed `media-tools.sh`
prefix, then build with `PHOLY_SHARP_MODE=global`. Sharp from this lockfile
requires libvips >=8.18.7. The builder deliberately does not force it against
Ubuntu 24.04's older libvips. Its native prefix defaults to
`pholy-toolchain/media`, override with `PHOLY_MEDIA_PREFIX`.
Global mode exports the prefix's pkg-config and library directories and
rebuilds Sharp in the final server package.

The official ImageMagick policy is preserved under `imagemagick/`, with
its upstream commit and SHA256 in `PROVENANCE.txt`. Only PHOLY sets
`MAGICK_CONFIGURE_PATH` to this file. No shared ImageMagick configuration
is changed. Verify HEIC, JPEG, video and RAW files after deployment against
the actual native libraries; a completed JavaScript build alone does not
establish format coverage.

## Build a release

For a Git build, the source checkout must be clean, with all intended PHOLY modifications,
branding and these deployment files committed. The builder exports that
commit before building, ensuring the downloadable source matches the actual
code. Uncommitted changes cannot accidentally enter the production release.

Prepare toolchain/runtime parent directories owned by `pholy`, then:

```sh
sudo -u pholy /var/www/vhosts/pholy.de/pholy-app/deployment/pholy/build-native.sh --check
sudo -u pholy env PHOLY_SHARP_MODE=global /var/www/vhosts/pholy.de/pholy-app/deployment/pholy/build-native.sh build
```

The check mode verifies local prerequisite commands and exact tool pins. It
does not download tools. The build command installs only the selected tools
into the PHOLY toolchain, performs frozen dependency installs, invokes the
upstream builds, packages production server/CLI dependencies, web assets,
core WASM plugin, translations and a CPU ML virtual environment, then runs
package/import smoke checks. The ML runtime uses MACHINE_LEARNING_MODEL_REVISION=v2, matching the upstream Dockerfile. The ML venv is built at its final path because
its generated entrypoints contain absolute paths.

Each invocation uses a fresh release/build directory. A failed build leaves
those directories for inspection, with no `BUILD_COMPLETE` marker. It never
stops services, updates `current`, modifies a database or installs OS packages.
Set `PHOLY_RELEASE_ID` to a new unique identifier when retrying. Build
workspaces can be removed deliberately after successful deployment.

GeoNames data changes over time. The first build downloads a snapshot to
`pholy-toolchain/cache/geodata-v3.4.1`, hashes every file and records its
date/source. Later builds verify and reuse that same snapshot. To reproduce a
release, retain its geodata manifest and snapshot; do not silently replace
the cache. `PHOLY_GEODATA_DIR` can select another reviewed snapshot. Native
system package versions and model downloads are separate deployment inputs;
this is a pinned, traceable build process, not a claim of byte-identical
binaries across different operating systems.

### Rebuild the public source archive

The public archive includes `PHOLY-SOURCE.json` with the original source
commit, upstream commit, timestamp, and hashes/executable modes of every
source file. An extracted archive is a supported build input: no private
GitHub access, Git ancestry or Git initialization is required.

```sh
tar -xzf pholy-source.tar.gz
cd pholy-source
PHOLY_BUILD_USER="$(id -un)" \
PHOLY_DOMAIN_ROOT=/absolute/path/to/pholy-rebuild \
MISE_BIN=/absolute/path/to/mise \
./deployment/pholy/build-native.sh --check
```

After preparing the documented tools/native dependencies and writable output
directories, use the same command with `build` instead of `--check` and the
appropriate `PHOLY_SHARP_MODE`. Root execution is refused. The builder
verifies all source hashes before copying the source into a fresh workspace.
Keep the extracted source free of local edits, dependency installs or added
files; the builder installs dependencies only in its separate workspace.
The default production build user remains `pholy`.

The exported source includes a machine-readable provenance manifest in
addition to the original committed tree. A rebuilt source archive retains
that source identity. Actual binary output can still depend on the native
library/platform inputs recorded in the deployment instructions.

## Provision and start

The administrator creates local directories under `pholy-data`:

```text
config
postgres
run-postgres
redis
cache/server
cache/ml
cache/huggingface
tmp
```

Copy the templates to the following live paths, replace random password
placeholders without putting secrets in Git, and keep secret files mode 0600:

| Template | Live path under pholy-data/config |
|---|---|
| `config/server.env.example` | `server.env` |
| `config/machine-learning.env.example` | `machine-learning.env` |
| `config/immich.json` | `immich.json` |
| `config/postgresql.conf` | `postgresql.conf` |
| `config/pg_hba.conf` | `pg_hba.conf` |
| `config/redis.conf.example` | `redis.conf` |

The server's config file fixes the ML URL and explicitly disables automatic
database backups. Other configuration keys use upstream defaults. Config
values supplied by this file are managed in the file rather than the web UI.

Ports are private loopback listeners:

| Service | Address | Unit |
|---|---|---|
| Dedicated PostgreSQL 16 | `127.0.0.1:5448` | `pholy-postgresql.service` |
| Dedicated Redis | `127.0.0.1:6388` | `pholy-redis.service` |
| PHOLY server + workers | `127.0.0.1:2288` | `pholy-server.service` |
| ML | `127.0.0.1:3008` | `pholy-machine-learning.service` |

Initialize and provision only the private database as described in the
database document. Install the four unit templates under `/etc/systemd/system`.
Check the CIFS mount unit name using `systemd-escape --path --suffix=mount
/mnt/familyphotos-storage` and inspect the actual mount before starting the
server. Select a release that has `BUILD_COMPLETE` with an atomic
`current` symlink replacement. Then start the private DB/Redis, ML and server.
Never restart the shared `postgresql.service` or an existing Redis instance
for this deployment. A restart of `pholy-server` may run Immich migrations
on the PHOLY database.

The scripts do not assume an admin account. Complete first-account setup
through the intended private deployment path before opening normal traffic.
After setup, set `IMMICH_ALLOW_SETUP=false` in the live server environment.
Keep existing application credentials out of shell logs.

## Reverse proxy and corresponding source

Integrate `nginx/pholy.locations.conf` into the domain's Plesk TLS vhost
without duplicating Plesk-generated locations. Serve Immich at the root of
`https://pholy.de`, preserving WebSocket forwarding and the long upload
timeouts. The template exposes only the server; PostgreSQL, Redis and ML
are not proxied.

`/source` and `/source/` serve the public PHOLY source information page,
with its stylesheet at `/source/source.css`. The page links to the complete
versioned source on GitHub, rather than offering a direct download on PHOLY.
The public GitHub release branch is recorded in `PHOLY-RELEASE.json`.

For compatibility with the existing verified import tooling,
`/source/pholy-source.tar.gz` still serves the exact release's source archive;
`/source/pholy-source.tar.gz.sha256` serves its checksum, and
`/source/LICENSE.txt` serves the AGPL license. The source archive contains a Git export of
the committed PHOLY tree, including the AGPL license, modifications, build
scripts, dependency lockfiles and these deployment templates. A private
GitHub repository does not replace this network source offer. Provide a
prominent, working source link in the PHOLY UI to all users, including guests;
the runtime metadata also points at this public source URL.

The builder never copies live media, databases, tool caches or runtime secret
configs into the source archive. Review each source commit before release;
do not commit secret material. The source download must remain associated
with the active release when `current` changes.

## Verification before opening traffic

Check the private listeners and the dedicated database extensions. Confirm
the application responds through the intended proxy and reports its PHOLY
source commit. Verify the public source download is unauthenticated, matches
`/source/pholy-source.tar.gz.sha256`, and contains the modifications. Upload and retrieve a
small JPEG, a representative HEIC/RAW file, and a short video; check original
paths on CIFS and thumbnails/transcoding. Check ML availability separately.

The media guard can be tested safely with an intentionally wrong
`IMMICH_MEDIA_LOCATION`; it must refuse immediately without writing. Do not
unmount the live family photo share for a test. Inspect journal output only
for the four PHOLY services. Check that the existing shared PostgreSQL
instance remains on its original port and has not been restarted.

## Primary references

- [Immich v3.4.1 source](https://github.com/immich-app/immich/tree/v3.4.1)
- [Upstream build tasks](https://github.com/immich-app/immich/blob/v3.4.1/mise.toml)
- [Server packaging](https://github.com/immich-app/immich/blob/v3.4.1/server/Dockerfile)
- [Standalone PostgreSQL](https://docs.immich.app/administration/postgres-standalone/)
- [Reverse proxy](https://docs.immich.app/administration/reverse-proxy/)
- [AGPL license](https://github.com/immich-app/immich/blob/v3.4.1/LICENSE)
- [Mise tool allowlist / automatic installation settings](https://mise.jdx.dev/configuration/settings.html)

## Public homepage (PHOLY .6)

After initialization, the root route renders the public PHOLY homepage for
both guests and signed-in users. The existing first-account setup remains
available before initialization. The root layout still handles maintenance
and startup failures. The homepage's primary action opens /photos, which
retains the application's existing authentication checks.

The page is integrated into the existing Svelte application. It introduces
no separate service or API, public registration, tracking, or external font
and image requests. Public copy is translated in i18n/en.json and i18n/de.json.
Illustrative photographs, local font subsets, licenses and image provenance
are in web/static/pholy/landing/. The two application previews use synthetic
account data and licensed demonstration photographs, never production media.

Legal/contact links need confirmed PHOLY operator information and approved
texts. They are not substituted with unrelated projects' legal pages or
non-existent routes.

Checks from the repository root, with the pinned Node/pnpm tools available:

```sh
pnpm --dir web run check:typescript
pnpm --dir web run check:svelte
pnpm --dir web run build
pnpm --dir web exec playwright test landing.spec.ts workspace.spec.ts --workers=2
```

The landing tests cover guest/authenticated entry, initial setup, section
navigation, mobile navigation dismissal, loaded images, source access and
320/390/1440px layouts. To reproduce the actual application screenshots with
synthetic data, run landing-preview.spec.ts. The resulting desktop.png and
mobile.png in web/test-results can be converted to WebP with Sharp and placed
in static/pholy/landing/app-desktop.webp and app-mobile.webp respectively.

## Login presentation (PHOLY .7)

The login route uses PholyLoginLayout with the homepage's locally hosted
fonts, off-white surfaces, green controls and licensed lake photograph.
Mobile layouts place the sign-in form first and omit the decorative image.
The light public-page palette remains independent of the saved app theme.
The font definitions are shared in web/src/lib/styles/pholy-public.css.

Only login presentation is changed. Password, passkey and OAuth handlers,
onboarding, required password changes and continuation URL validation
retain their existing behavior. Registration and other auth layouts are
unchanged. The logo and Back to home link return to the public homepage.

Run the login.spec.ts and landing.spec.ts medium tests against the built
web application. The login tests cover responsive layouts, password
visibility, successful submission, pending and failed requests, alternative
sign-in methods, disabled sign-in and the saved dark-theme case. All sign-in
requests in these tests use synthetic credentials and mocked endpoints.

## Public typography (PHOLY .8)

The homepage and login now use the locally hosted variable Inter font for
all headings and body text. Upright, medium-weight headings replace the
serif and italic treatment. Responsive heading sizes, line heights and
letter spacing are adjusted for the wider sans-serif letterforms. Both
pages preload the shared Inter font. No authentication behavior changes.


## Free invitation-only access (PHOLY .9)

PHOLY remains free. There is no public self-registration on an initialized
server. Administrators open /admin/invitations, choose an email and optional
quota, and copy a personal invitation URL. This action does not send email.
Links expire after seven days, can be revoked, and are usable once. Reissuing
for the same email revokes the earlier link. Store and share the returned
URL securely; only its hash is persisted, so it cannot be retrieved again.

The token is carried in a URL fragment, omitted from normal web access logs
and referrers. Preview and acceptance use non-cacheable POST requests. Public
attempts are limited per hashed IP in process memory; token fields are
redacted from verbose request logs. The transaction locks by email and then
invitation row so concurrent acceptance/reissue cannot create two accounts.
The invited email and quota are assigned by the server; newly registered
accounts never receive admin privileges. Passwords use the existing bcrypt
implementation with a 12-character minimum and 72-byte maximum.

Keep OAuth autoRegister=false and IMMICH_ALLOW_SETUP=false in the private
production configuration. Initial administrator setup is preserved only for
uninitialized installations. Existing password/passkey login is unchanged.

The registration screen includes the official Immich iOS/Android links,
https://pholy.de as server address, copy action, and sign-in instructions,
both before and after successful signup. Terms acceptance records the
displayed terms version; it is not consent for biometric processing.

Public routes /kontakt, /impressum, /datenschutz and /agb share PHOLY's visual
style and are accessible without a session. Legal links are available from
the homepage, login, signup and signed-in sidebar. The operator was confirmed
by the user. The privacy page describes observed operation; outstanding
legal/contract verification is tracked in legal-draft.md. Do not describe
this release as a legal compliance certification.

Verification:

- Server controller/service tests and invitation repository transaction
  tests use synthetic data. Repository tests require an explicitly created
  isolated database named pholy_invitation_test_* and
  PHOLY_INVITATION_TEST_DATABASE. Never point them at the live database.
- Run server tests with:
  pnpm --dir server exec vitest run --config test/vitest.config.mjs pholy-invitation auth.controller.spec.ts
- Run browser checks with:
  pnpm --dir web exec playwright test landing.spec.ts login.spec.ts invitation.spec.ts --workers=2
- The new migration adds only pholy_invitation and its foreign keys/indexes.
  Existing user/media tables are not rewritten. Verify the additive migration
  before deployment and keep the previously built release for rollback.

## External source link (PHOLY .10)

The source page links to GitHub release branch `releases/3.4.1-pholy.11`.
It has no direct archive download button. Before activating this release,
verify that the GitHub repository and branch are readable without an account,
and that the branch tree equals the source tree used by the native builder.
Publish a new versioned branch for each later deployment; never repoint an
existing release branch to a different source tree.

To build from the public repository, install the prerequisites above, then:

```sh
git clone --branch releases/3.4.1-pholy.11 https://github.com/cluckmann-web/pholy-source.git
cd pholy-source
PHOLY_BUILD_USER="$(id -un)" \
PHOLY_DOMAIN_ROOT=/absolute/path/to/pholy-rebuild \
MISE_BIN=/absolute/path/to/mise \
./deployment/pholy/build-native.sh --check
```

After preparing the documented native dependencies, use `build` instead of
`--check` and the appropriate `PHOLY_SHARP_MODE`. Keep the checkout clean.
The existing source archive endpoints remain compatible with the legacy
hash-verified import workflow, but are not offered by the public page.

## Uploads and administration (.11)

See [upload operations](upload-operations.md) for resumable uploads, storage
requirements, processing limits, acceptance checks and the new administration
overview. Invitation-only registration and native mobile compatibility remain
part of the same application.
