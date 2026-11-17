# PHOLY upload operations

Release `3.4.1-pholy.11` keeps the existing Immich API and mobile app. The web
client adds an authenticated resumable transport; shared-link uploads keep the
existing upload endpoint.

## Transfer and recovery

- The upload panel remains available during navigation. Each file reports its
  preparation, transfer, server processing, success, duplicate, or error state.
- Pause stops scheduling/transfer; resume continues queued files. Cancellation
  and retry are per file, with a separate action to retry failed files.
- Large files use `/api/pholy/uploads/sessions`. The server acknowledges the
  persisted offset for each chunk. It verifies the final SHA-1 checksum and size
  before handing the file to the existing media service and processing jobs.
- Reload recovery retains account-scoped metadata only. The browser cannot
  continue uploading a closed tab's files. The user must reselect the original
  file; matching metadata and checksum protect against selecting a different
  file. A missing/expired session requires a fresh transfer.
- Completed files are distinct from files still awaiting a server preview.
  Search indexing, face recognition, OCR, and video conversion can continue
  after the first preview is ready.

## Storage and access

Staging lives below `.pholy-uploads` on the verified PHOLY CIFS media mount.
There is no local-disk fallback. The native service's existing storage guard
continues to run before application startup. Sessions are owner-scoped and use
cross-process advisory locks. Incomplete sessions reserve their declared size
against the account quota and expire; regular cleanup removes expired staging.
The existing media service remains authoritative for ownership, duplicate
handling, quota accounting, asset creation, and downstream jobs.

If a process dies inside the upstream asset-create sequence, session recovery
repairs the verified file/metadata/job handoff without emitting a second
asset-create event. Quota reconciliation remains the existing scheduled
`UserSyncUsage` job; an immediate aggregate rewrite would race concurrent
mobile uploads. This rare crash window can temporarily leave quota usage stale.

The reverse proxy already disables request buffering and supports streamed
requests. Preserve `Upload-Offset`, `Content-Length`, cookies/authentication,
and `Content-Type: application/octet-stream` on PATCH requests. The server's
chunk bound is independent of the legacy proxy upload size limit.

## Processing priorities and resource limits

Fresh uploads use priority 1 in the sidecar, metadata, storage-template, and
thumbnail queues; background work in those queues uses priority 10. Running
jobs are never interrupted. Already queued jobs retain their old priority.
BullMQ treats priority 0 as highest, so all newly submitted work in these
queues has an explicit priority. Bulk submission uses BullMQ's `opts` field.
The administrator's waiting count and waiting-job list include prioritized jobs.

The native configuration sets thumbnail and metadata concurrency to 3,
video/face/search/OCR concurrency to 1, and FFmpeg threads to 2. This limits
contention on the shared 12-core host; it does not promise a fixed speed gain.
Do not increase concurrency solely because a queue is long. Compare transfer
latency, time to first preview, CPU pressure and CIFS I/O before changing limits.
The pipeline already starts expensive analysis after thumbnail generation.

Apply only the `job` values and `ffmpeg.threads` from
`config/immich.json` to the private live configuration. Preserve all other live
configuration and secrets. Restart only `pholy-server` after release validation.

## Acceptance checks

Use synthetic accounts/files only. Check a normal upload, an interrupted chunk
followed by offset recovery, a repeated completion, a duplicate, wrong-owner
access, cancellation, expiry, and insufficient quota. Check queue totals and
the first preview. Remove synthetic accounts, media, and sessions afterward.
No user-library rescan, database backup, shared-service restart, or migration
is required by this release.

Administration now links storage and user quotas, invitation state, and failed
jobs in one overview. The user introduction offers the mobile app connection
at `https://pholy.de`, album creation and the first upload. Invitation-only
registration remains enforced on the server.
