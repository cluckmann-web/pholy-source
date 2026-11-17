import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import sharp from 'sharp';
import type {
  PholyCommentContextDto,
  PholyCommentCreateDto,
  PholyCommentEditDto,
  PholyCommentListDto,
} from 'src/dtos/pholy-comment.dto.js';
import { AlbumUserRole, AssetStatus, AssetVisibility, UserStatus } from 'src/enum.js';
import type { DB } from 'src/schema/index.js';

export type CommentActor = { id: string; isAdmin: boolean };
type Context = {
  assetId: string;
  kind: PholyCommentContextDto['kind'];
  id: string;
  ownerId: string;
  albumOwner: boolean;
  enabled: boolean;
};
export type CommentResponse = {
  id: string;
  assetId: string;
  parentId: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  deleted: boolean;
  author: { id: string; name: string; avatarColor: string; hasProfileImage: boolean } | null;
  likeCount: number;
  liked: boolean;
  canEdit: boolean;
  canDelete: boolean;
  replies: CommentResponse[];
};

@Injectable()
export class PholyCommentRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  private missing(): never {
    throw new NotFoundException('Diese Foto-Kommentare sind nicht verfügbar.');
  }

  private async context(
    db: Kysely<DB>,
    actor: CommentActor,
    assetId: string,
    dto: PholyCommentContextDto,
    lock = false,
  ): Promise<Context> {
    const member = await db
      .selectFrom('user')
      .select('id')
      .where('id', '=', actor.id)
      .where('deletedAt', 'is', null)
      .where('status', '=', UserStatus.Active)
      .$if(lock, (qb) => qb.forShare())
      .executeTakeFirst();
    if (!member) this.missing();
    const asset = await db
      .selectFrom('asset as a')
      .innerJoin('user as u', 'u.id', 'a.ownerId')
      .select(['a.id', 'a.ownerId', 'a.visibility'])
      .where('a.id', '=', assetId)
      .where('a.deletedAt', 'is', null)
      .where('a.status', '=', AssetStatus.Active)
      .where('a.visibility', '!=', AssetVisibility.Locked)
      .where('u.deletedAt', 'is', null)
      .where('u.status', '=', UserStatus.Active)
      .$if(lock, (qb) => qb.forShare(['a', 'u']))
      .executeTakeFirst();
    if (!asset) this.missing();
    if (dto.kind === 'private') {
      if (asset.ownerId !== actor.id) this.missing();
      return { assetId, kind: dto.kind, id: actor.id, ownerId: asset.ownerId, albumOwner: false, enabled: true };
    }
    if (dto.kind === 'album') {
      const album = await db
        .selectFrom('album as a')
        .innerJoin('album_asset as aa', 'aa.albumId', 'a.id')
        .innerJoin('album_user as au', 'au.albumId', 'a.id')
        .select(['a.id', 'a.isActivityEnabled', 'au.role'])
        .where('a.id', '=', dto.albumId!)
        .where('aa.assetId', '=', assetId)
        .where('au.userId', '=', actor.id)
        .where('a.deletedAt', 'is', null)
        .$if(lock, (qb) => qb.forShare(['a', 'aa', 'au']))
        .executeTakeFirst();
      if (!album) this.missing();
      return {
        assetId,
        kind: dto.kind,
        id: album.id,
        ownerId: asset.ownerId,
        albumOwner: album.role === AlbumUserRole.Owner,
        enabled: album.isActivityEnabled,
      };
    }
    const profile = await db
      .selectFrom('pholy_community_profile as p')
      .innerJoin('pholy_community_asset as ca', 'ca.userId', 'p.userId')
      .select('p.userId')
      .where('p.slug', '=', dto.profileSlug!)
      .where('p.userId', '=', asset.ownerId)
      .where('p.published', '=', true)
      .where('p.blocked', '=', false)
      .where('ca.assetId', '=', assetId)
      .where('ca.selected', '=', true)
      .where('ca.hidden', '=', false)
      .$if(lock, (qb) => qb.forShare(['p', 'ca']))
      .executeTakeFirst();
    if (!profile || asset.visibility !== AssetVisibility.Timeline) this.missing();
    return { assetId, kind: dto.kind, id: profile.userId, ownerId: asset.ownerId, albumOwner: false, enabled: true };
  }

  private comments(db: Kysely<DB>, context: Context) {
    return db
      .selectFrom('pholy_comment as c')
      .where('c.assetId', '=', context.assetId)
      .where('c.contextKind', '=', context.kind)
      .where('c.contextId', '=', context.id);
  }

  private rows(db: Kysely<DB>, context: Context, actor: CommentActor) {
    return this.comments(db, context)
      .leftJoin('user as u', 'u.id', 'c.authorId')
      .selectAll('c')
      .select([
        'u.name as authorName',
        'u.avatarColor',
        'u.profileImagePath',
        'u.deletedAt as authorDeletedAt',
        'u.status as authorStatus',
      ])
      .select((eb) => [
        eb
          .selectFrom('pholy_comment_like as l')
          .innerJoin('user as lu', 'lu.id', 'l.userId')
          .whereRef('l.commentId', '=', 'c.id')
          .where('lu.deletedAt', 'is', null)
          .where('lu.status', '=', UserStatus.Active)
          .select(({ fn }) => fn.countAll<number>().as('count'))
          .as('likeCount'),
        eb
          .exists(
            eb
              .selectFrom('pholy_comment_like as mine')
              .whereRef('mine.commentId', '=', 'c.id')
              .where('mine.userId', '=', actor.id)
              .select('mine.commentId'),
          )
          .as('liked'),
      ]);
  }

  private map(
    row: Awaited<ReturnType<ReturnType<PholyCommentRepository['rows']>['execute']>>[number],
    context: Context,
    actor: CommentActor,
  ): CommentResponse {
    const deleted =
      !!row.deletedAt || !row.authorId || row.authorDeletedAt !== null || row.authorStatus !== UserStatus.Active;
    return {
      id: row.id,
      assetId: row.assetId,
      parentId: row.parentId,
      body: deleted ? '' : row.body,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deleted,
      author: deleted
        ? null
        : {
            id: row.authorId!,
            name: row.authorName!,
            avatarColor: row.avatarColor!,
            hasProfileImage: !!row.profileImagePath,
          },
      likeCount: deleted ? 0 : Number(row.likeCount ?? 0),
      liked: !deleted && !!row.liked,
      canEdit: !deleted && context.enabled && row.authorId === actor.id,
      canDelete:
        !deleted &&
        (row.authorId === actor.id ||
          context.ownerId === actor.id ||
          context.albumOwner ||
          (actor.isAdmin && context.kind === 'community')),
      replies: [] as CommentResponse[],
    };
  }

  async list(actor: CommentActor, assetId: string, dto: PholyCommentListDto) {
    const context = await this.context(this.db, actor, assetId, dto);
    const [roots, count] = await Promise.all([
      this.rows(this.db, context, actor)
        .where('c.parentId', 'is', null)
        .orderBy('c.createdAt')
        .orderBy('c.id')
        .offset(dto.offset)
        .limit(21)
        .execute(),
      this.comments(this.db, context)
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow(),
    ]);
    const page = roots.slice(0, 20).map((row) => this.map(row, context, actor));
    if (page.length > 0) {
      const replies = await this.rows(this.db, context, actor)
        .where(
          'c.parentId',
          'in',
          page.map(({ id }) => id),
        )
        .orderBy('c.createdAt')
        .orderBy('c.id')
        .limit(500)
        .execute();
      const lookup = new Map(page.map((row) => [row.id, row]));
      for (const row of replies) lookup.get(row.parentId!)?.replies.push(this.map(row, context, actor));
    }
    // Do not return a discussion fetched just before a concurrent unshare/unpublish.
    await this.context(this.db, actor, assetId, dto);
    return {
      comments: page,
      nextOffset: roots.length > 20 ? dto.offset + 20 : null,
      total: Number(count.count),
      canComment: context.enabled && Number(count.count) < 500,
    };
  }

  private async rate(db: Kysely<DB>, userId: string) {
    const row = await sql<{ count: number }>`INSERT INTO pholy_comment_rate ("userId", "windowStartedAt", count)
      VALUES (${userId}, now(), 1) ON CONFLICT ("userId") DO UPDATE SET
      count = CASE WHEN pholy_comment_rate."windowStartedAt" < now() - interval '5 minutes' THEN 1 ELSE pholy_comment_rate.count + 1 END,
      "windowStartedAt" = CASE WHEN pholy_comment_rate."windowStartedAt" < now() - interval '5 minutes' THEN now() ELSE pholy_comment_rate."windowStartedAt" END
      RETURNING count`.execute(db);
    if (row.rows[0].count > 64)
      throw new HttpException(
        'Bitte warte kurz, bevor du weitere Kommentare oder Reaktionen sendest.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }

  private async write<T>(
    actor: CommentActor,
    assetId: string,
    dto: PholyCommentContextDto,
    action: (db: Kysely<DB>, context: Context) => Promise<T>,
  ) {
    return this.db.transaction().execute(async (db) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`pholy-comments-user:${actor.id}`}, 0))`.execute(db);
      const context = await this.context(db, actor, assetId, dto, true);
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`pholy-comments:${context.assetId}:${context.kind}:${context.id}`}, 0))`.execute(
        db,
      );
      await this.rate(db, actor.id);
      const result = await action(db, context);
      await this.context(db, actor, assetId, dto);
      return result;
    });
  }

  private async comment(db: Kysely<DB>, context: Context, actor: CommentActor, id: string) {
    const row = await this.rows(db, context, actor).where('c.id', '=', id).executeTakeFirst();
    if (!row) this.missing();
    return row;
  }

  create(actor: CommentActor, assetId: string, dto: PholyCommentCreateDto) {
    return this.write(actor, assetId, dto, async (db, context) => {
      if (!context.enabled) throw new ForbiddenException('Kommentare sind für dieses Album deaktiviert.');
      const count = await this.comments(db, context)
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();
      if (Number(count.count) >= 500)
        throw new BadRequestException('Für dieses Foto ist die maximale Anzahl an Kommentaren erreicht.');
      if (dto.parentId) {
        const parent = await this.comment(db, context, actor, dto.parentId);
        if (parent.parentId || this.map(parent, context, actor).deleted)
          throw new BadRequestException('Bitte antworte auf einen verfügbaren Hauptkommentar.');
        const replies = await this.comments(db, context)
          .where('c.parentId', '=', parent.id)
          .select(({ fn }) => fn.countAll<number>().as('count'))
          .executeTakeFirstOrThrow();
        if (Number(replies.count) >= 50) throw new BadRequestException('Dieser Kommentar hat bereits 50 Antworten.');
      }
      const row = await db
        .insertInto('pholy_comment')
        .values({
          assetId,
          contextKind: context.kind,
          contextId: context.id,
          albumId: context.kind === 'album' ? context.id : null,
          profileId: context.kind === 'community' ? context.id : null,
          authorId: actor.id,
          parentId: dto.parentId ?? null,
          body: dto.body,
          deletedAt: null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return this.map(await this.comment(db, context, actor, row.id), context, actor);
    });
  }

  edit(actor: CommentActor, assetId: string, id: string, dto: PholyCommentEditDto) {
    return this.write(actor, assetId, dto, async (db, context) => {
      const row = await this.comment(db, context, actor, id);
      if (!this.map(row, context, actor).canEdit)
        throw new ForbiddenException('Nur eigene verfügbare Kommentare können bearbeitet werden.');
      await db
        .updateTable('pholy_comment')
        .set({ body: dto.body, updatedAt: new Date() })
        .where('id', '=', id)
        .execute();
      return this.map(await this.comment(db, context, actor, id), context, actor);
    });
  }

  remove(actor: CommentActor, assetId: string, id: string, dto: PholyCommentContextDto) {
    return this.write(actor, assetId, dto, async (db, context) => {
      const row = await this.comment(db, context, actor, id);
      if (!this.map(row, context, actor).canDelete)
        throw new ForbiddenException('Dieser Kommentar kann nicht entfernt werden.');
      await db
        .updateTable('pholy_comment')
        .set({ body: '', deletedAt: new Date(), updatedAt: new Date() })
        .where('id', '=', id)
        .execute();
      await db.deleteFrom('pholy_comment_like').where('commentId', '=', id).execute();
    });
  }

  like(actor: CommentActor, assetId: string, id: string, dto: PholyCommentContextDto, enabled: boolean) {
    return this.write(actor, assetId, dto, async (db, context) => {
      const row = await this.comment(db, context, actor, id);
      if (!context.enabled || this.map(row, context, actor).deleted)
        throw new ForbiddenException('Dieser Kommentar kann derzeit keine Reaktionen erhalten.');
      if (enabled)
        await db
          .insertInto('pholy_comment_like')
          .values({ commentId: id, userId: actor.id })
          .onConflict((oc) => oc.columns(['commentId', 'userId']).doNothing())
          .execute();
      else
        await db.deleteFrom('pholy_comment_like').where('commentId', '=', id).where('userId', '=', actor.id).execute();
      const result = this.map(await this.comment(db, context, actor, id), context, actor);
      return { liked: result.liked, likeCount: result.likeCount };
    });
  }

  private async avatarPath(actor: CommentActor, assetId: string, userId: string, dto: PholyCommentContextDto) {
    const context = await this.context(this.db, actor, assetId, dto);
    const author = await this.comments(this.db, context)
      .innerJoin('user as u', 'u.id', 'c.authorId')
      .select('u.profileImagePath')
      .where('c.authorId', '=', userId)
      .where('c.deletedAt', 'is', null)
      .where('u.deletedAt', 'is', null)
      .where('u.status', '=', UserStatus.Active)
      .executeTakeFirst();
    if (!author?.profileImagePath) this.missing();
    return author.profileImagePath;
  }

  async avatar(actor: CommentActor, assetId: string, userId: string, dto: PholyCommentContextDto) {
    const path = await this.avatarPath(actor, assetId, userId, dto);
    const buffer = await sharp(path, { limitInputPixels: 16_000_000 })
      .rotate()
      .resize(96, 96, { fit: 'cover', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    if (path !== (await this.avatarPath(actor, assetId, userId, dto))) this.missing();
    return buffer;
  }
}
