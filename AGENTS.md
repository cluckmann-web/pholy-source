# PHOLY development instructions

## Product and source

- PHOLY is one application based on the pinned Immich source in this repository.
- The previous Nextcloud/Lychee implementation has been superseded by the user's explicit Immich decision.
- Use main for this project. Review the current diff before committing.
- Use Material Design with square corners for navigation rows, buttons, fields, cards, tabs, and dialogs. The user means visual styling by "flat", not a prohibition on navigation groups or submenus. Keep intentional circles such as avatars and status indicators; do not reshape navigation without a separate request.
- Preserve upstream copyright, license, attribution, API identifiers, and dependency lockfiles.
- Read applicable nested AGENTS.md files before changing their directories.

## Deployment

- Run PHOLY natively with systemd on Ubuntu/Plesk. Do not introduce Docker.
- Keep original media on the existing Hetzner CIFS mount under Cloud-Fotos/PHOLY. Refuse local fallback.
- Keep PHOLY's PostgreSQL, Redis and ML listeners private; do not restart shared services for a PHOLY change.
- Keep secrets outside Git, with private file permissions. Never print credentials or password hashes.
- Publish the complete corresponding source and build instructions for every deployed modified release.
- Verify the new runtime before changing the domain's active release.

## User data

- Do not create backups unless the user explicitly requests them.
- The authorization to replace the old application does not authorize deleting unrelated domains, real media, or unrelated user files.
- Preserve the existing administrator's login when replacing the application, without disclosing credentials.
- Use synthetic or clearly identified official fixtures for verification and remove created test records after checking.
