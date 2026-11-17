import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import sharp from 'sharp';
import {
  PholyCommunityModerateDto,
  PholyCommunityProfileDto,
  PholyCommunityReportDto,
} from 'src/dtos/pholy-community.dto.js';
import { AssetFileType, AssetStatus, AssetType, AssetVisibility, UserStatus } from 'src/enum.js';
import type { DB } from 'src/schema/index.js';
import type {
  PholyCommunityAssetTable,
  PholyCommunityFollowTable,
  PholyCommunityProfileTable,
  PholyCommunityReportTable,
} from 'src/schema/tables/pholy-community.table.js';

type CommunityDB = DB & {
  pholy_community_profile: PholyCommunityProfileTable;
  pholy_community_asset: PholyCommunityAssetTable;
  pholy_community_follow: PholyCommunityFollowTable;
  pholy_community_report: PholyCommunityReportTable;
};

@Injectable()
export class PholyCommunityRepository {
  constructor(@InjectKysely() private db: Kysely<CommunityDB>) {}

  private publicProfiles() {
    return this.db
      .selectFrom('pholy_community_profile as p')
      .innerJoin('user as u', 'u.id', 'p.userId')
      .where('p.published', '=', true)
      .where('p.blocked', '=', false)
      .where('u.deletedAt', 'is', null)
      .where('u.status', '=', UserStatus.Active);
  }

  private publicAssets(userId: string) {
    return this.db
      .selectFrom('pholy_community_asset as ca')
      .innerJoin('asset as a', 'a.id', 'ca.assetId')
      .where('ca.userId', '=', userId)
      .where('a.ownerId', '=', userId)
      .where('ca.selected', '=', true)
      .where('ca.hidden', '=', false)
      .where('a.deletedAt', 'is', null)
      .where('a.status', '=', AssetStatus.Active)
      .where('a.visibility', '=', AssetVisibility.Timeline)
      .where('a.type', '=', AssetType.Image);
  }

  async list(offset: number) {
    const profiles = await this.publicProfiles()
      .select(['p.slug', 'p.displayName', 'p.bio'])
      .orderBy('p.updatedAt', 'desc')
      .orderBy('p.userId')
      .offset(offset)
      .limit(49)
      .execute();
    return { profiles: profiles.slice(0, 48), nextOffset: profiles.length > 48 ? offset + 48 : null };
  }

  async publicProfile(slug: string) {
    const profile = await this.publicProfiles()
      .where('p.slug', '=', slug)
      .select(['p.userId', 'p.slug', 'p.displayName', 'p.bio'])
      .executeTakeFirst();
    if (!profile) throw new NotFoundException('Dieses Profil ist nicht öffentlich verfügbar.');
    return profile;
  }

  async view(slug: string) {
    const profile = await this.publicProfile(slug);
    const [assets, followers] = await Promise.all([
      this.publicAssets(profile.userId).select(['a.id']).orderBy('ca.position').limit(100).execute(),
      this.db
        .selectFrom('pholy_community_follow')
        .where('userId', '=', profile.userId)
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow(),
    ]);
    return {
      slug: profile.slug,
      displayName: profile.displayName,
      bio: profile.bio,
      assets,
      followers: Number(followers.count),
    };
  }

  async unpublish(userId: string) {
    await this.db
      .updateTable('pholy_community_profile')
      .set({ published: false, updatedAt: new Date() })
      .where('userId', '=', userId)
      .execute();
    return this.getMine(userId);
  }

  async getMine(userId: string) {
    const [profile, assets] = await Promise.all([
      this.db
        .selectFrom('pholy_community_profile')
        .select(['slug', 'displayName', 'bio', 'published', 'blocked'])
        .where('userId', '=', userId)
        .executeTakeFirst(),
      this.db
        .selectFrom('pholy_community_asset as ca')
        .innerJoin('asset as a', 'a.id', 'ca.assetId')
        .where('ca.userId', '=', userId)
        .where('ca.selected', '=', true)
        .where('a.ownerId', '=', userId)
        .where('a.deletedAt', 'is', null)
        .where('a.status', '=', AssetStatus.Active)
        .where('a.visibility', '=', AssetVisibility.Timeline)
        .where('a.type', '=', AssetType.Image)
        .select(['ca.assetId', 'ca.hidden', 'a.originalFileName'])
        .orderBy('ca.position')
        .execute(),
    ]);
    return { profile: profile ?? null, assets };
  }

  async picker(userId: string, offset: number) {
    const assets = await this.db
      .selectFrom('asset')
      .select(['id', 'originalFileName'])
      .where('ownerId', '=', userId)
      .where('deletedAt', 'is', null)
      .where('status', '=', AssetStatus.Active)
      .where('visibility', '=', AssetVisibility.Timeline)
      .where('type', '=', AssetType.Image)
      .orderBy('fileCreatedAt', 'desc')
      .orderBy('id')
      .offset(offset)
      .limit(61)
      .execute();
    return { assets: assets.slice(0, 60), nextOffset: assets.length > 60 ? offset + 60 : null };
  }

  async save(userId: string, dto: PholyCommunityProfileDto) {
    try {
      await this.db.transaction().execute(async (trx) => {
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`pholy-community:${userId}`}, 0))`.execute(trx);
        const existing = await trx
          .selectFrom('pholy_community_profile')
          .select(['blocked'])
          .where('userId', '=', userId)
          .executeTakeFirst();
        if (existing?.blocked && dto.published)
          throw new BadRequestException('Das öffentliche Profil wurde durch die Moderation gesperrt.');
        if (dto.assetIds.length > 0) {
          const owned = await trx
            .selectFrom('asset')
            .select('id')
            .where('id', 'in', dto.assetIds)
            .where('ownerId', '=', userId)
            .where('deletedAt', 'is', null)
            .where('status', '=', AssetStatus.Active)
            .where('visibility', '=', AssetVisibility.Timeline)
            .where('type', '=', AssetType.Image)
            .execute();
          if (owned.length !== dto.assetIds.length)
            throw new BadRequestException('Bitte wähle ausschließlich eigene, verfügbare Fotos aus der Zeitleiste.');
        }
        const { assetIds, ...profile } = dto;
        await trx
          .insertInto('pholy_community_profile')
          .values({ ...profile, userId })
          .onConflict((oc) => oc.column('userId').doUpdateSet({ ...profile, updatedAt: new Date() }))
          .execute();
        // Retain moderation tombstones so removing and re-adding a photo cannot bypass a restriction.
        await trx.updateTable('pholy_community_asset').set({ selected: false }).where('userId', '=', userId).execute();
        if (assetIds.length > 0)
          await trx
            .insertInto('pholy_community_asset')
            .values(assetIds.map((assetId, position) => ({ userId, assetId, position, selected: true })))
            .onConflict((oc) =>
              oc
                .columns(['userId', 'assetId'])
                .doUpdateSet((eb) => ({ selected: true, position: eb.ref('excluded.position') })),
            )
            .execute();
      });
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === '23505')
        throw new ConflictException('Diese Profiladresse ist bereits vergeben.');
      throw error;
    }
    return this.getMine(userId);
  }

  private publicPreview(userId: string, assetId: string) {
    return this.publicAssets(userId)
      .innerJoin('asset_file as af', 'af.assetId', 'a.id')
      .where('a.id', '=', assetId)
      .where('af.type', '=', AssetFileType.Preview)
      .whereRef('af.isEdited', '=', 'a.isEdited')
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('asset_edit as ae')
              .select('ae.id')
              .whereRef('ae.assetId', '=', 'a.id')
              .whereRef('ae.updatedAt', '>', 'af.updatedAt'),
          ),
        ),
      )
      .select(['af.path', 'af.updatedAt'])
      .executeTakeFirst();
  }

  async thumbnail(slug: string, assetId: string) {
    const profile = await this.publicProfile(slug);
    const file = await this.publicPreview(profile.userId, assetId);
    if (!file) throw new NotFoundException('Dieses Foto ist nicht öffentlich verfügbar.');
    // Never fall back to an original or an uncropped preview. Re-encoding strips all embedded metadata.
    const buffer = await sharp(file.path, { limitInputPixels: 64_000_000 })
      .rotate()
      .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    // Check identity, publication, selection and current edit after rendering, not just the reusable slug.
    const currentProfile = await this.publicProfile(slug);
    if (currentProfile.userId !== profile.userId)
      throw new NotFoundException('Dieses Foto ist nicht öffentlich verfügbar.');
    const currentFile = await this.publicPreview(profile.userId, assetId);
    if (
      !currentFile ||
      currentFile.path !== file.path ||
      currentFile.updatedAt.getTime() !== file.updatedAt.getTime()
    ) {
      throw new NotFoundException('Dieses Foto ist nicht öffentlich verfügbar.');
    }
    return buffer;
  }

  async relation(userId: string, slug: string) {
    const profile = await this.publicProfile(slug);
    const follow = await this.db
      .selectFrom('pholy_community_follow')
      .where('followerId', '=', userId)
      .where('userId', '=', profile.userId)
      .select('userId')
      .executeTakeFirst();
    return { following: !!follow, ownProfile: userId === profile.userId };
  }

  async follow(userId: string, slug: string, enabled: boolean) {
    const profile = await this.publicProfile(slug);
    if (userId === profile.userId) throw new BadRequestException('Du kannst deinem eigenen Profil nicht folgen.');
    if (enabled)
      await this.db
        .insertInto('pholy_community_follow')
        .values({ userId: profile.userId, followerId: userId })
        .onConflict((oc) => oc.columns(['followerId', 'userId']).doNothing())
        .execute();
    else
      await this.db
        .deleteFrom('pholy_community_follow')
        .where('userId', '=', profile.userId)
        .where('followerId', '=', userId)
        .execute();
    return { following: enabled, ownProfile: false };
  }

  async following(userId: string) {
    const profiles = await this.publicProfiles()
      .innerJoin('pholy_community_follow as f', 'f.userId', 'p.userId')
      .where('f.followerId', '=', userId)
      .select(['p.slug', 'p.displayName', 'p.bio'])
      .orderBy('f.createdAt', 'desc')
      .limit(200)
      .execute();
    return { profiles };
  }

  async report(userId: string, dto: PholyCommunityReportDto) {
    const profile = await this.publicProfile(dto.slug);
    if (
      dto.assetId &&
      !(await this.publicAssets(profile.userId).where('a.id', '=', dto.assetId).select('a.id').executeTakeFirst())
    ) {
      throw new NotFoundException('Dieses Foto ist nicht öffentlich verfügbar.');
    }
    return this.db.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`pholy-report:${userId}`}, 0))`.execute(trx);
      const existing = await trx
        .selectFrom('pholy_community_report')
        .select('id')
        .where('reporterId', '=', userId)
        .where('userId', '=', profile.userId)
        .where('assetId', dto.assetId ? '=' : 'is', dto.assetId)
        .where('resolvedAt', 'is', null)
        .executeTakeFirst();
      if (existing) return { received: true };
      const recent = await trx
        .selectFrom('pholy_community_report')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('reporterId', '=', userId)
        .where('createdAt', '>', new Date(Date.now() - 3_600_000))
        .executeTakeFirstOrThrow();
      if (Number(recent.count) >= 5)
        throw new HttpException('Bitte warte vor weiteren Meldungen eine Stunde.', HttpStatus.TOO_MANY_REQUESTS);
      await trx
        .insertInto('pholy_community_report')
        .values({
          reporterId: userId,
          userId: profile.userId,
          assetId: dto.assetId,
          reason: dto.reason,
          details: dto.details,
        })
        .execute();
      return { received: true };
    });
  }

  moderation() {
    return this.db
      .selectFrom('pholy_community_report as r')
      .innerJoin('pholy_community_profile as p', 'p.userId', 'r.userId')
      .leftJoin('pholy_community_asset as ca', (join) =>
        join.onRef('ca.userId', '=', 'r.userId').onRef('ca.assetId', '=', 'r.assetId'),
      )
      .select([
        'r.id',
        'r.assetId',
        'r.reason',
        'r.details',
        'r.createdAt',
        'r.resolvedAt',
        'r.action',
        'p.slug',
        'p.displayName',
        'p.blocked',
        'ca.hidden',
      ])
      .orderBy(sql<boolean>`r."resolvedAt" IS NULL`, 'desc')
      .orderBy('r.createdAt', 'desc')
      .limit(200)
      .execute();
  }

  async moderate(adminId: string, id: string, dto: PholyCommunityModerateDto) {
    await this.db.transaction().execute(async (trx) => {
      const report = await trx
        .selectFrom('pholy_community_report')
        .select(['userId', 'assetId'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!report) throw new NotFoundException('Meldung nicht gefunden.');
      if (dto.action === 'hide_asset' || dto.action === 'restore_asset') {
        if (!report.assetId) throw new BadRequestException('Diese Meldung betrifft kein Foto.');
        await trx
          .updateTable('pholy_community_asset')
          .set({ hidden: dto.action === 'hide_asset' })
          .where('userId', '=', report.userId)
          .where('assetId', '=', report.assetId)
          .execute();
      } else if (dto.action === 'disable_profile' || dto.action === 'restore_profile') {
        // Restoring removes the moderator block but never publishes on the user's behalf.
        await trx
          .updateTable('pholy_community_profile')
          .set({ blocked: dto.action === 'disable_profile', published: false })
          .where('userId', '=', report.userId)
          .execute();
      }
      await trx
        .updateTable('pholy_community_report')
        .set({ resolvedBy: adminId, resolvedAt: new Date(), action: dto.action })
        .where('id', '=', id)
        .execute();
    });
    return { resolved: true };
  }
}
