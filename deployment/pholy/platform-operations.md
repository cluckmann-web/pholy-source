# PHOLY .13: account, support and community

PHOLY remains one native Immich application. Registration requires an invitation;
there are no paid plans or independent React services in this release.

## User and administration routes

| Route | Purpose |
| --- | --- |
| `/auth/forgot-password`, `/auth/reset-password` | Email recovery for password accounts |
| `/admin/invitations` | Create, revoke, copy, send and resend invitations |
| `/upload-history` | Account-scoped 90-day history and current storage usage |
| `/help`, `/admin/support` | Searchable help and private support conversations |
| `/account` | Download account data and originals; request/cancel account closure |
| `/community` | Voluntary profile publication and selected public photos |
| `/community/:slug` | Public profile and stripped-metadata preview images |
| `/admin/community` | Review reports and hide/restore public content |

## Mail

The existing `notifications.smtp` configuration supplies the transport, sender
and reply address. PHOLY does not store SMTP credentials in source. Configure a
real transport before offering recovery; the UI reports when mail is disabled.
The production server's existing Postfix relay can be used over loopback. Its
certificate name does not match 127.0.0.1, so a loopback-only transport may use
`ignoreCert: true`; do not apply that setting to a remote SMTP server.

An invitation is sent only when explicitly requested. Resending replaces its
secret, invalidates the earlier link and renews its seven-day validity. Status
`accepted` means the SMTP server accepted the message, not that a mailbox
received it; `failed` and `disabled` remain visible and permit a later retry.
An old send result cannot overwrite a newer invitation's status.

Password recovery returns the same response for unknown, passwordless and
existing accounts. Requests and confirmations are rate limited. Reset links
expire after 30 minutes, are single-use and carry the secret in the fragment.
Only a hash and a credential fingerprint are stored. A password change makes
older links invalid; completing recovery deletes existing sessions. Passwordless
external-login accounts need administrator assistance to establish a local
password. Mail submission never persists plaintext links in job payloads.

## Upload history and warnings

Accepted browser and app uploads are recorded through the server's AssetCreate
event. Failed, cancelled and duplicate browser attempts are account-scoped;
client reports cannot fabricate accepted media. History expires after 90 days.
Hidden/locked media are excluded. Retrying successfully removes the failed
attempt; originals are never deleted by history cleanup.

Warnings start at 80%, 95% and full quota. Processing errors explain that the
original was received and separate processing from transfer. Notifications are
deduplicated, and the upload flow continues if optional history recording fails.
The completed-upload panel still closes automatically after two seconds.

## Support

Users see only their own tickets; administrators can reply and update status.
Ticket creation and replies are transactionally bounded and rate limited.
Messages are plain text, not rendered HTML. Resolved tickets expire 90 days after
their last update; deleting an account cascades to its conversations. The help
center includes app setup, upload recovery, storage, invitations and privacy.

## Export and closure

Sensitive account actions require a browser session and the current password.
An export grant expires after one hour, belongs to that session and is revoked
when the session is deleted or the password changes. Exports contain account
JSON plus separately downloadable ZIP parts of up to 200 originals/about 1 GiB.
A larger individual file gets its own part. Every ZIP has a checksum manifest.
Originals include hidden/trash and Live Photo motion media owned by the account;
no partner's or shared album contributor's originals are included.

This is a streamed export, not a server backup or immutable snapshot. Download
the JSON and every ZIP part; avoid editing or deleting media during the export.
Files uploaded after the grant's cutoff are excluded. Downloads are no-store and
do not put reusable bearer grants in URLs. Missing originals produce a visible
error rather than a silently incomplete archive.

Closure requires the password, exact email confirmation and an explicit consent
checkbox. The account stays usable for seven days with a visible cancellation
notice. Then it is soft-deleted, its public profile is unpublished and existing
upstream deletion processing takes over (currently another seven-day delay).
An administrator must transfer administration and lose the admin role before
self-closure. The closure worker serializes with cancellation and account updates.

## Community privacy and moderation

Profiles start unpublished. Only explicitly selected own timeline photos with
ready previews can be selected; private albums, archived/locked/trashed files
and other owners' media are never automatically published. Public endpoints
exclude deleted accounts and re-check publication/selection after rendering.
JPEG previews are bounded and have embedded metadata removed; visible image
content can still identify a person or location. Original downloads are not
exposed. Disabling publication takes effect for subsequent requests; previously
saved copies cannot be recalled.

Follows require an account. Reports go to administrators; moderation hides the
public profile or image without deleting private originals. An owner edit cannot
override a moderator block. Public image responses prohibit caching.

## Release and verification

Five additive migrations `1794950000001` through `1794950000005` add account,
mail, history, support and community state. Existing originals are not rewritten.
Run migrations first on an empty isolated database, then verify the resulting
native runtime before changing `current`. Only restart `pholy-server`.

`pholy-suite-acceptance.mjs` performs actual HTTP checks against an isolated
loopback API, a `pholy_suite_test_*` database, a dedicated Redis database and a
`.pholy-suite-test-*` CIFS folder. It refuses a database with existing users and
starts its own SMTP sink on 127.0.0.1:25261; no messages leave that sink. It creates
and removes only guarded synthetic fixtures. The operator must stop staging and
remove its isolated database, Redis state and media folder after checking.

The public release branch is `releases/3.4.1-pholy.16`. Publish complete matching
source and build instructions before activating the release; keep the private
repository private. No backup is created by this update.
