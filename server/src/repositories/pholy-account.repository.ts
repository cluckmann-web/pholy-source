import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { columns } from 'src/database.js';
import { AlbumUserRole, UserMetadataKey, UserStatus } from 'src/enum.js';
import { DB } from 'src/schema/index.js';
import { PholyAccountStateTable } from 'src/schema/tables/pholy-account-state.table.js';
import { PholyCommentLikeTable, PholyCommentTable } from 'src/schema/tables/pholy-comment.table.js';
import {
  PholyCommunityAssetTable,
  PholyCommunityFollowTable,
  PholyCommunityProfileTable,
  PholyCommunityReportTable,
} from 'src/schema/tables/pholy-community.table.js';
import { PholySupportMessageTable, PholySupportTicketTable } from 'src/schema/tables/pholy-support.table.js';
import { PholyUploadHistoryTable } from 'src/schema/tables/pholy-upload-history.table.js';

type AccountDB = DB & {
  pholy_account_state: PholyAccountStateTable;
  pholy_comment: PholyCommentTable;
  pholy_comment_like: PholyCommentLikeTable;
  pholy_community_profile: PholyCommunityProfileTable;
  pholy_community_asset: PholyCommunityAssetTable;
  pholy_community_follow: PholyCommunityFollowTable;
  pholy_community_report: PholyCommunityReportTable;
  pholy_support_ticket: PholySupportTicketTable;
  pholy_support_message: PholySupportMessageTable;
  pholy_upload_history: PholyUploadHistoryTable;
};
export const PHOLY_EXPORT_PART_LIMIT = 200;
export const PHOLY_EXPORT_PART_BYTES = 1024 ** 3;
export const PHOLY_ACCOUNT_GRACE_MS = 7 * 86_400_000;

@Injectable()
export class PholyAccountRepository {
  constructor(@InjectKysely() private db: Kysely<AccountDB>) {}

  state(userId: string) {
    return this.db.selectFrom('pholy_account_state').selectAll().where('userId', '=', userId).executeTakeFirst();
  }

  async grantExport(userId: string, sessionId: string, now: Date, verifiedPassword: string) {
    return this.db.transaction().execute(async (tx) => {
      const user = await tx
        .selectFrom('user')
        .select(['password', 'deletedAt'])
        .where('id', '=', userId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (user.deletedAt || !user.password || user.password !== verifiedPassword)
        throw new ForbiddenException('Dein Konto wurde geändert. Bitte melde dich erneut an.');
      const session = await tx
        .selectFrom('session')
        .select('id')
        .where('id', '=', sessionId)
        .where('userId', '=', userId)
        .forKeyShare()
        .executeTakeFirst();
      if (!session) throw new ForbiddenException('Bitte melde dich erneut an.');
      return tx
        .insertInto('pholy_account_state')
        .values({
          userId,
          exportSessionId: sessionId,
          exportBefore: now,
          exportExpiresAt: new Date(now.getTime() + 60 * 60_000),
        })
        .onConflict((oc) =>
          oc.column('userId').doUpdateSet({
            exportSessionId: sessionId,
            exportBefore: now,
            exportExpiresAt: new Date(now.getTime() + 60 * 60_000),
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  async revokeExport(userId: string) {
    await this.db
      .updateTable('pholy_account_state')
      .set({ exportSessionId: null, exportExpiresAt: null })
      .where('userId', '=', userId)
      .execute();
  }

  async requestClosure(userId: string, now: Date, verifiedPassword: string, sessionId: string) {
    return this.db.transaction().execute(async (tx) => {
      const user = await tx
        .selectFrom('user')
        .select(['isAdmin', 'deletedAt', 'password'])
        .where('id', '=', userId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (user.isAdmin)
        throw new ForbiddenException('Administratoren müssen ihre Rolle zuerst an ein anderes Konto übertragen.');
      if (user.deletedAt) throw new ConflictException('Dieses Konto wird bereits geschlossen.');
      if (!user.password || user.password !== verifiedPassword)
        throw new ForbiddenException('Dein Konto wurde geändert. Bitte bestätige dein Passwort erneut.');
      const session = await tx
        .selectFrom('session')
        .select('id')
        .where('id', '=', sessionId)
        .where('userId', '=', userId)
        .forKeyShare()
        .executeTakeFirst();
      if (!session) throw new ForbiddenException('Bitte melde dich erneut an.');
      const existing = await tx
        .selectFrom('pholy_account_state')
        .selectAll()
        .where('userId', '=', userId)
        .executeTakeFirst();
      if (existing?.closeAfter) return existing;
      return tx
        .insertInto('pholy_account_state')
        .values({ userId, closeRequestedAt: now, closeAfter: new Date(now.getTime() + PHOLY_ACCOUNT_GRACE_MS) })
        .onConflict((oc) =>
          oc
            .column('userId')
            .doUpdateSet({ closeRequestedAt: now, closeAfter: new Date(now.getTime() + PHOLY_ACCOUNT_GRACE_MS) }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  async cancelClosure(userId: string, now: Date) {
    const result = await this.db
      .updateTable('pholy_account_state')
      .set({ closeAfter: null, closeRequestedAt: null })
      .where('userId', '=', userId)
      .where('closeAfter', '>', now)
      .returning('userId')
      .executeTakeFirst();
    if (!result) throw new ConflictException('Es gibt keine noch widerrufbare Kontoschließung.');
  }

  async closeDue(now: Date) {
    return this.db.transaction().execute(async (tx) => {
      const due = await tx
        .selectFrom('user')
        .innerJoin('pholy_account_state', 'pholy_account_state.userId', 'user.id')
        .select(['user.id as userId'])
        .where('pholy_account_state.closeAfter', '<=', now)
        .orderBy('user.id')
        .limit(50)
        .forUpdate('user')
        .skipLocked()
        .execute();
      const closed = [];
      for (const { userId } of due) {
        const state = await tx
          .selectFrom('pholy_account_state')
          .select('closeAfter')
          .where('userId', '=', userId)
          .forUpdate()
          .executeTakeFirst();
        if (!state?.closeAfter || state.closeAfter > now) continue;
        const user = await tx
          .selectFrom('user')
          .select(columns.userAdmin)
          .where('id', '=', userId)
          .forUpdate()
          .executeTakeFirst();
        if (user && !user.isAdmin && !user.deletedAt) {
          await tx
            .updateTable('album')
            .set({ deletedAt: now })
            .where(
              'id',
              'in',
              tx
                .selectFrom('album_user')
                .select('albumId')
                .where('userId', '=', userId)
                .where('role', '=', AlbumUserRole.Owner),
            )
            .execute();
          const deleted = await tx
            .updateTable('user')
            .set({ deletedAt: now, status: UserStatus.Deleted })
            .where('id', '=', userId)
            .returning(columns.userAdmin)
            .executeTakeFirstOrThrow();
          const sessions = await tx.deleteFrom('session').where('userId', '=', userId).returning('id').execute();
          await tx
            .updateTable('pholy_community_profile')
            .set({ published: false })
            .where('userId', '=', userId)
            .execute();
          closed.push({ ...deleted, closedSessionIds: sessions.map(({ id }) => id) });
        }
        await tx
          .updateTable('pholy_account_state')
          .set({ closeAfter: null, closeRequestedAt: null, exportSessionId: null, exportExpiresAt: null })
          .where('userId', '=', userId)
          .execute();
      }
      return closed;
    });
  }

  async exportPart(userId: string, before: Date, cursor?: string) {
    // Includes hidden, archived, trashed and live-motion originals, even before EXIF exists.
    const assets = await this.db
      .selectFrom('asset')
      .leftJoin('asset_exif', 'asset_exif.assetId', 'asset.id')
      .select([
        'asset.id',
        'asset.originalPath',
        'asset.originalFileName',
        'asset.checksum',
        'asset.checksumAlgorithm',
        'asset_exif.fileSizeInByte as size',
      ])
      .where('asset.ownerId', '=', userId)
      .where('asset.createdAt', '<=', before)
      .$if(!!cursor, (qb) => qb.where('asset.id', '>', cursor!))
      .orderBy('asset.id')
      .limit(PHOLY_EXPORT_PART_LIMIT + 1)
      .execute();
    let size = 0;
    let count = 0;
    for (const asset of assets) {
      if (count >= PHOLY_EXPORT_PART_LIMIT || (count > 0 && size + Number(asset.size ?? 0) > PHOLY_EXPORT_PART_BYTES))
        break;
      count++;
      size += Number(asset.size ?? 0);
    }
    const items = assets.slice(0, count);
    return { items, size, nextCursor: count < assets.length ? items.at(-1)!.id : null };
  }

  async profile(userId: string) {
    return this.db
      .selectFrom('user')
      .select([
        'id',
        'name',
        'email',
        'createdAt',
        'updatedAt',
        'avatarColor',
        'quotaSizeInBytes',
        'quotaUsageInBytes',
        'status',
      ])
      .where('id', '=', userId)
      .where('deletedAt', 'is', null)
      .executeTakeFirstOrThrow();
  }

  profileImage(userId: string) {
    return this.db
      .selectFrom('user')
      .select('profileImagePath')
      .where('id', '=', userId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  exportSections(userId: string, before: Date) {
    const owned = this.db
      .selectFrom('asset')
      .select('id')
      .where('ownerId', '=', userId)
      .where('createdAt', '<=', before);
    const ownedAlbums = this.db
      .selectFrom('album_user')
      .select('albumId')
      .where('userId', '=', userId)
      .where('role', '=', AlbumUserRole.Owner);
    const ownTickets = this.db.selectFrom('pholy_support_ticket').select('id').where('userId', '=', userId);
    const ownTags = this.db.selectFrom('tag').select('id').where('userId', '=', userId);
    const ownMemories = this.db.selectFrom('memory').select('id').where('ownerId', '=', userId);
    const ownLinks = this.db.selectFrom('shared_link').select('id').where('userId', '=', userId);
    return [
      {
        name: 'tags',
        rows: this.db
          .selectFrom('tag')
          .select(['id', 'value', 'color', 'parentId', 'createdAt', 'updatedAt'])
          .where('userId', '=', userId)
          .stream(),
      },
      {
        name: 'tagAssets',
        rows: this.db
          .selectFrom('tag_asset')
          .select(['tagId', 'assetId'])
          .where('tagId', 'in', ownTags)
          .where('assetId', 'in', owned)
          .stream(),
      },
      {
        name: 'people',
        rows: this.db
          .selectFrom('person')
          .select(['personGroupId', 'name', 'birthDate', 'isHidden', 'isFavorite', 'color', 'createdAt', 'updatedAt'])
          .where('ownerId', '=', userId)
          .stream(),
      },
      {
        name: 'faces',
        rows: this.db
          .selectFrom('asset_face')
          .select([
            'id',
            'assetId',
            'personGroupId',
            'imageWidth',
            'imageHeight',
            'boundingBoxX1',
            'boundingBoxY1',
            'boundingBoxX2',
            'boundingBoxY2',
            'sourceType',
            'isVisible',
            'deletedAt',
            'updatedAt',
          ])
          .where('assetId', 'in', owned)
          .stream(),
      },
      {
        name: 'memories',
        rows: this.db
          .selectFrom('memory')
          .select([
            'id',
            'type',
            'data',
            'isSaved',
            'memoryAt',
            'seenAt',
            'showAt',
            'hideAt',
            'createdAt',
            'updatedAt',
            'deletedAt',
          ])
          .where('ownerId', '=', userId)
          .stream(),
      },
      {
        name: 'memoryAssets',
        rows: this.db
          .selectFrom('memory_asset')
          .select(['memoriesId', 'assetId', 'createdAt', 'updatedAt'])
          .where('memoriesId', 'in', ownMemories)
          .where('assetId', 'in', owned)
          .stream(),
      },
      {
        name: 'stacks',
        rows: this.db
          .selectFrom('stack')
          .select(['id', 'primaryAssetId', 'createdAt', 'updatedAt'])
          .where('ownerId', '=', userId)
          .where('primaryAssetId', 'in', owned)
          .stream(),
      },
      {
        name: 'sharedLinks',
        rows: this.db
          .selectFrom('shared_link')
          .select([
            'id',
            'description',
            'type',
            'albumId',
            'createdAt',
            'expiresAt',
            'allowUpload',
            'allowDownload',
            'showExif',
          ])
          .select(sql<boolean>`password IS NOT NULL`.as('passwordProtected'))
          .where('userId', '=', userId)
          .stream(),
      },
      {
        name: 'sharedLinkAssets',
        rows: this.db
          .selectFrom('shared_link_asset')
          .select(['sharedLinkId', 'assetId'])
          .where('sharedLinkId', 'in', ownLinks)
          .where('assetId', 'in', owned)
          .stream(),
      },
      {
        name: 'ocr',
        rows: this.db
          .selectFrom('asset_ocr')
          .select(['id', 'assetId', 'text', 'isVisible', 'x1', 'y1', 'x2', 'y2', 'x3', 'y3', 'x4', 'y4', 'updatedAt'])
          .where('assetId', 'in', owned)
          .stream(),
      },
      {
        name: 'notifications',
        rows: this.db
          .selectFrom('notification')
          .select(['id', 'level', 'type', 'title', 'description', 'createdAt', 'updatedAt', 'readAt', 'deletedAt'])
          .where('userId', '=', userId)
          .stream(),
      },
      {
        name: 'partnerSharing',
        rows: this.db
          .selectFrom('partner')
          .select(['sharedById', 'sharedWithId', 'inTimeline', 'createdAt', 'updatedAt'])
          .where((eb) => eb.or([eb('sharedById', '=', userId), eb('sharedWithId', '=', userId)]))
          .stream(),
      },
      {
        name: 'supportTickets',
        rows: this.db
          .selectFrom('pholy_support_ticket')
          .select(['id', 'category', 'subject', 'status', 'createdAt', 'updatedAt'])
          .where('userId', '=', userId)
          .stream(),
      },
      {
        name: 'supportMessages',
        rows: this.db
          .selectFrom('pholy_support_message')
          .select(['id', 'ticketId', 'message', 'isStaff', 'createdAt'])
          .where('ticketId', 'in', ownTickets)
          .stream(),
      },
      {
        name: 'uploadHistory',
        rows: this.db
          .selectFrom('pholy_upload_history')
          .select(['id', 'assetId', 'fileName', 'fileSize', 'status', 'processingStep', 'createdAt', 'updatedAt'])
          .where('userId', '=', userId)
          .stream(),
      },
      {
        name: 'communityProfile',
        rows: this.db
          .selectFrom('pholy_community_profile')
          .select(['slug', 'displayName', 'bio', 'published', 'blocked', 'updatedAt'])
          .where('userId', '=', userId)
          .stream(),
      },
      {
        name: 'communityGallery',
        rows: this.db
          .selectFrom('pholy_community_asset')
          .select(['assetId', 'selected', 'hidden', 'position'])
          .where('userId', '=', userId)
          .stream(),
      },
      {
        name: 'following',
        rows: this.db
          .selectFrom('pholy_community_follow')
          .select(['userId', 'createdAt'])
          .where('followerId', '=', userId)
          .stream(),
      },
      {
        name: 'communityReports',
        rows: this.db
          .selectFrom('pholy_community_report')
          .select(['id', 'userId', 'assetId', 'reason', 'details', 'createdAt', 'resolvedAt', 'action'])
          .where('reporterId', '=', userId)
          .stream(),
      },
      {
        name: 'photoComments',
        rows: this.db
          .selectFrom('pholy_comment')
          .select([
            'id',
            'assetId',
            'contextKind',
            'contextId',
            'albumId',
            'profileId',
            'parentId',
            'createdAt',
            'updatedAt',
            'deletedAt',
          ])
          .select(sql<string>`CASE WHEN "deletedAt" IS NULL THEN body ELSE '' END`.as('body'))
          .where('authorId', '=', userId)
          .where('createdAt', '<=', before)
          .orderBy('createdAt')
          .orderBy('id')
          .stream(),
      },
      {
        name: 'commentLikes',
        rows: this.db
          .selectFrom('pholy_comment_like')
          .select(['commentId', 'createdAt'])
          .where('userId', '=', userId)
          .where('createdAt', '<=', before)
          .orderBy('createdAt')
          .orderBy('commentId')
          .stream(),
      },
      {
        name: 'preferences',
        rows: this.db
          .selectFrom('user_metadata')
          .select(['key', 'value'])
          .where('userId', '=', userId)
          .where('key', 'in', [UserMetadataKey.Preferences, UserMetadataKey.Onboarding])
          .stream(),
      },
      {
        name: 'assets',
        rows: this.db
          .selectFrom('asset')
          .select([
            'id',
            'type',
            'originalFileName',
            'createdAt',
            'updatedAt',
            'fileCreatedAt',
            'fileModifiedAt',
            'isFavorite',
            'visibility',
            'deletedAt',
            'livePhotoVideoId',
            'stackId',
            'duration',
            'localDateTime',
          ])
          .select(sql<string>`encode(checksum, 'hex')`.as('checksum'))
          .where('id', 'in', owned)
          .orderBy('id')
          .stream(),
      },
      { name: 'exif', rows: this.db.selectFrom('asset_exif').selectAll().where('assetId', 'in', owned).stream() },
      {
        name: 'assetMetadata',
        rows: this.db
          .selectFrom('asset_metadata')
          .select(['assetId', 'key', 'value'])
          .where('assetId', 'in', owned)
          .stream(),
      },
      {
        name: 'edits',
        rows: this.db
          .selectFrom('asset_edit')
          .select(['assetId', 'action', 'parameters', 'sequence'])
          .where('assetId', 'in', owned)
          .stream(),
      },
      {
        name: 'albums',
        rows: this.db
          .selectFrom('album')
          .select(['id', 'albumName', 'description', 'createdAt', 'updatedAt', 'deletedAt'])
          .where('id', 'in', ownedAlbums)
          .stream(),
      },
      {
        name: 'albumAssets',
        rows: this.db
          .selectFrom('album_asset')
          .select(['albumId', 'assetId'])
          .where('albumId', 'in', ownedAlbums)
          .where('assetId', 'in', owned)
          .stream(),
      },
      {
        name: 'albumMemberships',
        rows: this.db
          .selectFrom('album_user')
          .select(['albumId', 'role', 'createdAt'])
          .where('userId', '=', userId)
          .stream(),
      },
      {
        name: 'activity',
        rows: this.db
          .selectFrom('activity')
          .select(['id', 'albumId', 'assetId', 'comment', 'isLiked', 'createdAt', 'updatedAt'])
          .where('userId', '=', userId)
          .stream(),
      },
      {
        name: 'invitationAcceptance',
        rows: this.db
          .selectFrom('pholy_invitation')
          .select(['email', 'createdAt', 'usedAt', 'termsVersion'])
          .where('acceptedUserId', '=', userId)
          .stream(),
      },
    ];
  }
}
