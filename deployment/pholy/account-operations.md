# PHOLY account export and closure

`/account` provides self-service data export and account closure inside the existing application. These routes require a browser session; API keys and shared links cannot authorize them.

## Export

The current local password is verified before granting a 60-minute export window to the current session. The repository rechecks the same credential and session while holding the user row lock, preventing a concurrent password change from creating a grant based on an outdated proof. Password changes revoke grants; session deletion nulls their session reference. Any later account update also requires password confirmation again before an export request.

`GET /api/pholy/account/export/metadata` streams JSON containing account details, preferences, own originals' metadata/EXIF/edits/OCR, owned tags and their tree/asset assignments, own person names and face rectangles on owned media, memories and their asset assignments, stacks, owned albums and own membership/activity, invitation acceptance, support threads, upload history, personal notifications, partner-sharing relationships and the account's community information. Own shared-link settings and owned-media assignments are included without the reusable key, password or slug. A shared link only records whether it is password protected. Authentication secrets and private filesystem paths are not included. Reports made by others about the user are excluded.

`GET /api/pholy/account/export/part` plans one part, optionally after a UUID `cursor`. `GET /api/pholy/account/export/archive` streams that part as ZIP. Each part contains at most 200 originals and approximately 1 GiB based on actual file stats; an oversized original occupies a part by itself. `manifest.json` records stable asset IDs, archive paths and checksums. All owned originals are included, including trash, hidden assets and live-motion files. Originals belonging to another person are excluded even if shared with the exporting account. Missing originals fail explicitly before starting an archive. The first originals ZIP also includes the own profile image, if present, under `profile/profile-picture.<extension>`, referenced by the manifest. The JSON export independently includes that image as `{filename, contentType, encoding: "base64", data}` so it is preserved even for accounts with no original media. Base64 is streamed with bounded chunks, and missing profile images fail explicitly instead of being silently omitted. No temporary duplicate archives or automatic backups are created.

The upper creation timestamp is fixed when the export is prepared. This is not a database snapshot: users should avoid modifying/deleting media while downloading. They must download the JSON and every ZIP part. The browser's final save cannot be verified by PHOLY. Export grants can be renewed with the password when needed. Accounts without a local password must contact administration; an external identity provider is not bypassed by adding a credential automatically.

## Closure

`POST /api/pholy/account/closure` requires the current password, exact own email and explicit confirmation. The account stays active and a global notice links to cancellation for seven days. `DELETE /api/pholy/account/closure` cancels before the deadline.

Every five minutes, the microservices worker claims expired requests using consistent user-before-state row locking with `SKIP LOCKED`. It checks the current administrator role again, soft-deletes owned albums and the user, removes their sessions, unpublishes their community profile, emits session-deletion events and requests the upstream deletion check. The existing configured user deletion delay and deletion machinery perform permanent removal. No direct filesystem deletion is introduced here. An administrator cannot self-close; if a pending member becomes administrator, processing cancels the request.

## Validation

- `server/src/services/pholy-account.service.spec.ts`: credential, owner/session boundaries, actual ZIP/avatar bytes, missing originals/profile images, streamed avatar Base64 across uneven chunks, metadata JSON, administrator and closure safeguards.
- `server/src/repositories/pholy-account.repository.spec.ts`: isolated PostgreSQL tests for owner export and metadata cross-owner isolation (including label trees, face labels, memories and share secrets), seven-day grace, cancellation races, concurrent workers, administrator promotion, credential/session races and grant revocation. Requires a freshly created empty `PHOLY_ACCOUNT_TEST_DATABASE` beginning with `pholy_account_test_`; fixtures never run against the application's database. Drop the isolated database after the tests.
- `web/test/medium/specs/pholy/account.spec.ts`: export parts, confirmation/cancellation, administrator/passwordless states, desktop and 320 px layout.
