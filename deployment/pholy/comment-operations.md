# PHOLY .16: collapsible photo comments

PHOLY photo comments are an additive feature in the existing native application.
The photo viewer and community photo detail provide names, safe avatars, timestamps,
replies, comment likes and actions to edit or remove comments. Existing upstream
album activity remains available and its API/mobile behavior is unchanged.

Opening an eligible photo shows its discussion immediately: beside the image on
desktop and underneath on mobile. No separate comments action is required.
Switching photos changes the discussion context and clears the previous draft.
The metadata, editing and slideshow views retain their dedicated controls.
Community photo details also show the image and discussion together.

The discussion header offers a hide action in both photo viewers. Hiding gives
the image the available space and leaves a show-comments control on the image.
The current draft survives hiding and showing; selecting another photo clears
it. Hidden discussions pause automatic fetching. The hidden state lasts while
browsing the current viewer; opening a new viewer shows comments by default.

## Visibility

Every comment belongs to exactly one photo and one explicit discussion context:

- Personal: the photo owner's private discussion.
- Album: members of the specified album, while that photo remains in the album.
- Community: signed-in members viewing an explicitly published community photo.

Publishing a photo never publishes its earlier private or album discussion.
Anonymous visitors can view an already public photo but must sign in to read or
write comments. Shared-link identities and API keys cannot act as social users.
Each request rechecks current access; removing a photo from an album or public
gallery revokes access to that discussion. Private photos do not become visible
to administrators merely because they can moderate community comments.

## Data and controls

Comments are plain text. Authors can edit or delete their own comments. Authorized
photo/album owners can remove comments in their discussion; administrators can
moderate accessible community discussions. A removed comment becomes an empty
placeholder when necessary to preserve replies written by other people.

Replies have one level. A reply must belong to a root comment on the same photo
and in the same context. Comment likes are idempotent and unique per user. Names
and scoped avatar previews are returned without email addresses, filesystem paths
or account secrets. Account export includes the user's own comment contributions.

Text is limited to 2,000 characters. A discussion is bounded to 500 comments and
a root to 50 replies; root comments are paginated in groups of 20. Transactional
rate limits and database constraints protect concurrent writes.

## Deployment and verification

Releases .15 and .16 change only presentation and require no new database migration.
Migration `1794950000006-PholyComments` from .14 adds the comment storage; existing media
and native activity rows are retained. Build with the existing pinned native
toolchain and global Sharp support. Publish the complete corresponding source at
`releases/3.4.1-pholy.16` before activating the release; restart only `pholy-server`.

Verify permissions, context separation, reply ownership, edit/delete authorization,
duplicate likes, revoked access, export and keyboard/mobile interaction. The
existing isolated HTTP acceptance script includes comment scenarios and removes
its synthetic fixtures; stop its isolated service and clean test infrastructure
after it finishes. Do not send test mail to real users or create backups.
