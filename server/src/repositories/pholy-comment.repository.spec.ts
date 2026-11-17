import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { PholyCommentRepository } from 'src/repositories/pholy-comment.repository.js';
import type { DB } from 'src/schema/index.js';
import { down, up } from 'src/schema/migrations/1794950000006-PholyComments.js';

const database = process.env.PHOLY_COMMENT_TEST_DATABASE;
describe.skipIf(!database)('PHOLY photo comment transactions (isolated database)', () => {
  let db: Kysely<DB>;
  let repository: PholyCommentRepository;
  const fixture = async () => {
    const owner = { id: randomUUID(), isAdmin: false },
      member = { id: randomUUID(), isAdmin: false },
      admin = { id: randomUUID(), isAdmin: true };
    const asset = randomUUID(),
      otherAsset = randomUUID(),
      album = randomUUID(),
      otherAlbum = randomUUID(),
      slug = 'gallery-' + randomUUID().slice(0, 8);
    for (const actor of [owner, member, admin])
      await sql`INSERT INTO "user" (id,name) VALUES (${actor.id},${actor.id})`.execute(db);
    await sql`INSERT INTO asset (id,"ownerId") VALUES (${asset},${owner.id}),(${otherAsset},${owner.id})`.execute(db);
    await sql`INSERT INTO album (id) VALUES (${album}),(${otherAlbum})`.execute(db);
    await sql`INSERT INTO album_user ("albumId","userId",role) VALUES (${album},${owner.id},'owner'),(${album},${member.id},'editor'),(${otherAlbum},${owner.id},'owner'),(${otherAlbum},${member.id},'viewer')`.execute(
      db,
    );
    await sql`INSERT INTO album_asset ("albumId","assetId") VALUES (${album},${asset}),(${otherAlbum},${asset})`.execute(
      db,
    );
    await sql`INSERT INTO pholy_community_profile ("userId",slug) VALUES (${owner.id},${slug})`.execute(db);
    await sql`INSERT INTO pholy_community_asset ("userId","assetId") VALUES (${owner.id},${asset}),(${owner.id},${otherAsset})`.execute(
      db,
    );
    return {
      owner,
      member,
      admin,
      asset,
      otherAsset,
      album,
      otherAlbum,
      slug,
      community: { kind: 'community' as const, profileSlug: slug },
    };
  };
  beforeAll(async () => {
    if (!database?.startsWith('pholy_comment_test_')) throw new Error('Refusing non-test database');
    db = new Kysely<DB>({
      dialect: new PostgresJSDialect({
        postgres: postgres({
          host: process.env.PHOLY_TEST_PGHOST ?? '/var/www/vhosts/pholy.de/pholy-data/run-postgres',
          port: Number(process.env.PHOLY_TEST_PGPORT ?? 5448),
          database,
          username: 'pholy',
          onnotice: () => {},
        }),
      }),
    });
    await sql
      .raw(
        `
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE TABLE "user" (id uuid PRIMARY KEY, name text NOT NULL, "avatarColor" text DEFAULT 'blue', "profileImagePath" text DEFAULT '', "deletedAt" timestamptz, status text DEFAULT 'active');
      CREATE TABLE asset (id uuid PRIMARY KEY, "ownerId" uuid REFERENCES "user"(id), visibility text DEFAULT 'timeline', status text DEFAULT 'active', "deletedAt" timestamptz);
      CREATE TABLE album (id uuid PRIMARY KEY, "deletedAt" timestamptz, "isActivityEnabled" boolean DEFAULT true);
      CREATE TABLE album_user ("albumId" uuid REFERENCES album(id), "userId" uuid REFERENCES "user"(id) ON DELETE CASCADE, role text, PRIMARY KEY("albumId","userId"));
      CREATE TABLE album_asset ("albumId" uuid REFERENCES album(id), "assetId" uuid REFERENCES asset(id), PRIMARY KEY("albumId","assetId"));
      CREATE TABLE pholy_community_profile ("userId" uuid PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE, slug text UNIQUE, published boolean DEFAULT true, blocked boolean DEFAULT false);
      CREATE TABLE pholy_community_asset ("userId" uuid REFERENCES "user"(id) ON DELETE CASCADE, "assetId" uuid REFERENCES asset(id), selected boolean DEFAULT true, hidden boolean DEFAULT false, PRIMARY KEY("userId","assetId"));
    `,
      )
      .execute(db);
    await up(db);
    repository = new PholyCommentRepository(db);
  });
  afterAll(async () => {
    if (!db) {
      return;
    }

    await down(db);
    await db.destroy();
  });
  it('isolates private, two album and community discussions even for the same image', async () => {
    const f = await fixture();
    const contexts = [
      { kind: 'private' as const },
      { kind: 'album' as const, albumId: f.album },
      { kind: 'album' as const, albumId: f.otherAlbum },
      f.community,
    ];
    for (const [index, context] of contexts.entries())
      await repository.create(f.owner, f.asset, { ...context, body: 'context-' + index });
    for (const [index, context] of contexts.entries()) {
      const result = await repository.list(f.owner, f.asset, { ...context, offset: 0 });
      expect(result.comments.map((comment) => comment.body)).toEqual(['context-' + index]);
    }
    for (const actor of [f.member, f.admin])
      await expect(repository.list(actor, f.asset, { kind: 'private', offset: 0 })).rejects.toThrow(NotFoundException);
  });
  it('requires current album membership, exact album asset membership and enabled activity for writes', async () => {
    const f = await fixture(),
      context = { kind: 'album' as const, albumId: f.album };
    await expect(repository.create(f.member, f.otherAsset, { ...context, body: 'wrong photo' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(repository.list(f.admin, f.asset, { ...context, offset: 0 })).rejects.toThrow(NotFoundException);
    await repository.create(f.member, f.asset, { ...context, body: 'shared' });
    await sql`UPDATE album SET "isActivityEnabled"=false WHERE id=${f.album}`.execute(db);
    const disabled = await repository.list(f.member, f.asset, { ...context, offset: 0 });
    expect(disabled.canComment).toBe(false);
    await expect(repository.create(f.member, f.asset, { ...context, body: 'disabled' })).rejects.toThrow(
      ForbiddenException,
    );
    await sql`DELETE FROM album_user WHERE "albumId"=${f.album} AND "userId"=${f.member.id}`.execute(db);
    await expect(repository.list(f.member, f.asset, { ...context, offset: 0 })).rejects.toThrow(NotFoundException);
  });
  it('rejects cross-context, cross-photo and nested reply parents', async () => {
    const f = await fixture();
    const root = await repository.create(f.owner, f.asset, { ...f.community, body: 'root' });
    const reply = await repository.create(f.member, f.asset, { ...f.community, body: 'reply', parentId: root.id });
    await expect(
      repository.create(f.owner, f.asset, { kind: 'private', body: 'wrong context', parentId: root.id }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      repository.create(f.owner, f.otherAsset, { ...f.community, body: 'wrong photo', parentId: root.id }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      repository.create(f.owner, f.asset, { ...f.community, body: 'nested', parentId: reply.id }),
    ).rejects.toThrow('Hauptkommentar');
  });
  it('permits editing only own live comments and retains replies when an owner moderates', async () => {
    const f = await fixture();
    const root = await repository.create(f.member, f.asset, { ...f.community, body: 'member text' });
    const reply = await repository.create(f.owner, f.asset, { ...f.community, body: 'reply stays', parentId: root.id });
    await expect(repository.edit(f.owner, f.asset, root.id, { ...f.community, body: 'take over' })).rejects.toThrow(
      ForbiddenException,
    );
    await repository.edit(f.member, f.asset, root.id, { ...f.community, body: 'own edit' });
    await repository.remove(f.owner, f.asset, root.id, f.community);
    const list = await repository.list(f.member, f.asset, { ...f.community, offset: 0 });
    const result = list.comments[0];
    expect(result).toMatchObject({ deleted: true, body: '', author: null });
    expect(result.replies[0]).toMatchObject({ id: reply.id, body: 'reply stays' });
    await expect(repository.edit(f.member, f.asset, root.id, { ...f.community, body: 'restore' })).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('keeps concurrent likes idempotent and limits unlike to the current user', async () => {
    const f = await fixture();
    const root = await repository.create(f.owner, f.asset, { ...f.community, body: 'root' });
    await Promise.all([
      repository.like(f.member, f.asset, root.id, f.community, true),
      repository.like(f.member, f.asset, root.id, f.community, true),
    ]);
    await repository.like(f.owner, f.asset, root.id, f.community, true);
    expect(await repository.like(f.member, f.asset, root.id, f.community, false)).toEqual({
      liked: false,
      likeCount: 1,
    });
    expect(await repository.like(f.member, f.asset, root.id, f.community, false)).toEqual({
      liked: false,
      likeCount: 1,
    });
  });
  it('revokes public discussion after unpublish, deselection, moderation, trash or locking', async () => {
    const f = await fixture();
    await repository.create(f.owner, f.asset, { ...f.community, body: 'public' });
    for (const [change, reset] of [
      [
        sql`UPDATE pholy_community_profile SET published=false WHERE "userId"=${f.owner.id}`,
        sql`UPDATE pholy_community_profile SET published=true WHERE "userId"=${f.owner.id}`,
      ],
      [
        sql`UPDATE pholy_community_asset SET selected=false WHERE "assetId"=${f.asset}`,
        sql`UPDATE pholy_community_asset SET selected=true WHERE "assetId"=${f.asset}`,
      ],
      [
        sql`UPDATE pholy_community_asset SET hidden=true WHERE "assetId"=${f.asset}`,
        sql`UPDATE pholy_community_asset SET hidden=false WHERE "assetId"=${f.asset}`,
      ],
      [
        sql`UPDATE asset SET "deletedAt"=now() WHERE id=${f.asset}`,
        sql`UPDATE asset SET "deletedAt"=NULL WHERE id=${f.asset}`,
      ],
      [
        sql`UPDATE asset SET visibility='locked' WHERE id=${f.asset}`,
        sql`UPDATE asset SET visibility='timeline' WHERE id=${f.asset}`,
      ],
    ]) {
      await change.execute(db);
      await expect(repository.list(f.member, f.asset, { ...f.community, offset: 0 })).rejects.toThrow(
        NotFoundException,
      );
      await reset.execute(db);
    }
  });
  it('scrubs permanently deleted authors while preserving other members replies', async () => {
    const f = await fixture();
    const root = await repository.create(f.member, f.asset, { ...f.community, body: 'erase on account deletion' });
    await repository.create(f.owner, f.asset, { ...f.community, body: 'retain reply', parentId: root.id });
    await sql`DELETE FROM "user" WHERE id=${f.member.id}`.execute(db);
    const stored = await db
      .selectFrom('pholy_comment')
      .select(['body', 'authorId', 'deletedAt'])
      .where('id', '=', root.id)
      .executeTakeFirstOrThrow();
    expect(stored.body).toBe('');
    expect(stored.authorId).toBeNull();
    expect(stored.deletedAt).not.toBeNull();
    const result = await repository.list(f.owner, f.asset, { ...f.community, offset: 0 });
    expect(result.comments[0].replies[0].body).toBe('retain reply');
  });
  it('enforces per-user rate limits transactionally under concurrent writes', async () => {
    const f = await fixture();
    await sql`INSERT INTO pholy_comment_rate ("userId",count) VALUES (${f.owner.id},63)`.execute(db);
    const results = await Promise.allSettled([
      repository.create(f.owner, f.asset, { ...f.community, body: 'one' }),
      repository.create(f.owner, f.asset, { ...f.community, body: 'two' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(HttpException);
    expect(rejected?.reason.getStatus()).toBe(429);
    const rate = await db
      .selectFrom('pholy_comment_rate')
      .select('count')
      .where('userId', '=', f.owner.id)
      .executeTakeFirstOrThrow();
    expect(rate.count).toBe(64);
  });
  it('paginates root comments consistently when their timestamps are identical', async () => {
    const f = await fixture();
    const now = new Date();
    const ids = Array.from({ length: 22 }, () => randomUUID()).sort();
    await db
      .insertInto('pholy_comment')
      .values(
        ids.map((id) => ({
          id,
          assetId: f.asset,
          contextKind: 'community' as const,
          contextId: f.owner.id,
          profileId: f.owner.id,
          albumId: null,
          authorId: f.owner.id,
          parentId: null,
          body: id,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .execute();
    const first = await repository.list(f.member, f.asset, { ...f.community, offset: 0 });
    const second = await repository.list(f.member, f.asset, { ...f.community, offset: first.nextOffset! });
    expect([...first.comments, ...second.comments].map((row) => row.id)).toEqual(ids);
    expect(second.nextOffset).toBeNull();
    expect(first.total).toBe(22);
  });
  it('enforces album activity revocation that wins a concurrent write lock', async () => {
    const f = await fixture();
    const { promise: locked, resolve: acquired } = Promise.withResolvers<void>();
    const { promise: hold, resolve: release } = Promise.withResolvers<void>();
    const disabling = db.transaction().execute(async (trx) => {
      await sql`UPDATE album SET "isActivityEnabled"=false WHERE id=${f.album}`.execute(trx);
      acquired();
      await hold;
    });
    await locked;
    const creating = repository.create(f.member, f.asset, { kind: 'album', albumId: f.album, body: 'must not commit' });
    const rejected = expect(creating).rejects.toThrow(ForbiddenException);
    release();
    await disabling;
    await rejected;
    const result = await repository.list(f.owner, f.asset, { kind: 'album', albumId: f.album, offset: 0 });
    expect(result.total).toBe(0);
  });
});
