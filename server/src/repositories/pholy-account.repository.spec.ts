import { Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { PHOLY_ACCOUNT_GRACE_MS, PholyAccountRepository } from 'src/repositories/pholy-account.repository.js';
import type { DB } from 'src/schema/index.js';
import { down, up } from 'src/schema/migrations/1794950000004-PholyAccount.js';

const database = process.env.PHOLY_ACCOUNT_TEST_DATABASE;
describe.skipIf(!database)('PHOLY account transactions (isolated database)', () => {
  let db: Kysely<DB>;
  let repo: PholyAccountRepository;
  const createUser = async (isAdmin = false) => {
    const id = randomUUID();
    await sql`INSERT INTO "user" (id,email,"isAdmin") VALUES (${id},${id + '@example.test'},${isAdmin})`.execute(db);
    await sql`INSERT INTO session (id,"userId") VALUES (${id},${id})`.execute(db);
    return id;
  };
  beforeAll(async () => {
    if (!database?.startsWith('pholy_account_test_')) throw new Error('Refusing non-test database');
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
      CREATE TABLE "user" (id uuid PRIMARY KEY, email text NOT NULL, password text DEFAULT 'synthetic-hash', name text NOT NULL DEFAULT 'Synthetic', "isAdmin" boolean DEFAULT false, "deletedAt" timestamptz, status text DEFAULT 'active', "avatarColor" text, "profileImagePath" text DEFAULT '', "profileChangedAt" timestamptz DEFAULT now(), "clusterGroupId" uuid, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now(), "oauthId" text, "shouldChangePassword" boolean DEFAULT false, "storageLabel" text, "quotaSizeInBytes" bigint, "quotaUsageInBytes" bigint DEFAULT 0);
      CREATE TABLE session (id uuid PRIMARY KEY, "userId" uuid REFERENCES "user"(id));
      CREATE TABLE album (id uuid PRIMARY KEY, "deletedAt" timestamptz);
      CREATE TABLE album_user ("albumId" uuid REFERENCES album(id), "userId" uuid REFERENCES "user"(id), role text);
      CREATE TABLE pholy_community_profile ("userId" uuid PRIMARY KEY REFERENCES "user"(id), published boolean DEFAULT true);
      CREATE TABLE asset (id uuid PRIMARY KEY, "ownerId" uuid REFERENCES "user"(id), "createdAt" timestamptz DEFAULT now(), "originalPath" text, "originalFileName" text, checksum bytea, "checksumAlgorithm" text DEFAULT 'sha1', visibility text DEFAULT 'timeline', "deletedAt" timestamptz);
      CREATE TABLE asset_exif ("assetId" uuid PRIMARY KEY REFERENCES asset(id), "fileSizeInByte" bigint);
      CREATE TABLE tag (id uuid PRIMARY KEY, "userId" uuid, value text, color text, "parentId" uuid, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now());
      CREATE TABLE tag_asset ("tagId" uuid, "assetId" uuid);
      CREATE TABLE person ("ownerId" uuid, "personGroupId" uuid, name text, "birthDate" date, "isHidden" boolean DEFAULT false, "isFavorite" boolean DEFAULT false, color text, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now());
      CREATE TABLE asset_face (id uuid, "assetId" uuid, "personGroupId" uuid, "imageWidth" integer DEFAULT 100, "imageHeight" integer DEFAULT 100, "boundingBoxX1" integer DEFAULT 10, "boundingBoxY1" integer DEFAULT 20, "boundingBoxX2" integer DEFAULT 30, "boundingBoxY2" integer DEFAULT 40, "sourceType" text DEFAULT 'manual', "isVisible" boolean DEFAULT true, "deletedAt" timestamptz, "updatedAt" timestamptz DEFAULT now());
      CREATE TABLE memory (id uuid PRIMARY KEY, "ownerId" uuid, type text DEFAULT 'on_this_day', data jsonb DEFAULT '{}', "isSaved" boolean DEFAULT true, "memoryAt" timestamptz DEFAULT now(), "seenAt" timestamptz, "showAt" timestamptz, "hideAt" timestamptz, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now(), "deletedAt" timestamptz);
      CREATE TABLE memory_asset ("memoriesId" uuid, "assetId" uuid, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now());
      CREATE TABLE stack (id uuid PRIMARY KEY, "ownerId" uuid, "primaryAssetId" uuid, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now());
      CREATE TABLE shared_link (id uuid PRIMARY KEY, "userId" uuid, key bytea, password text, slug text, description text, type text DEFAULT 'individual', "albumId" uuid, "createdAt" timestamptz DEFAULT now(), "expiresAt" timestamptz, "allowUpload" boolean DEFAULT false, "allowDownload" boolean DEFAULT true, "showExif" boolean DEFAULT true);
      CREATE TABLE shared_link_asset ("sharedLinkId" uuid, "assetId" uuid);
      CREATE TABLE asset_ocr (id uuid, "assetId" uuid, text text, "isVisible" boolean DEFAULT true, x1 real DEFAULT 0, y1 real DEFAULT 0, x2 real DEFAULT 1, y2 real DEFAULT 0, x3 real DEFAULT 1, y3 real DEFAULT 1, x4 real DEFAULT 0, y4 real DEFAULT 1, "updatedAt" timestamptz DEFAULT now());
      CREATE TABLE notification (id uuid, "userId" uuid, level text DEFAULT 'info', type text DEFAULT 'info', title text, description text, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now(), "readAt" timestamptz, "deletedAt" timestamptz);
      CREATE TABLE partner ("sharedById" uuid, "sharedWithId" uuid, "inTimeline" boolean DEFAULT false, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now());

    `,
      )
      .execute(db);
    await up(db);
    repo = new PholyAccountRepository(db);
  });
  afterAll(async () => {
    if (!db) return;
    await down(db);
    await db.destroy();
  });
  it('exports only own originals, including hidden/trash files with missing EXIF', async () => {
    const owner = await createUser();
    const foreign = await createUser();
    const ownAsset = randomUUID();
    await sql`INSERT INTO asset (id,"ownerId","originalPath","originalFileName",visibility,"deletedAt") VALUES (${ownAsset},${owner},'/synthetic/own','own.jpg','hidden',now()),(${randomUUID()},${foreign},'/synthetic/foreign','foreign.jpg','timeline',NULL)`.execute(
      db,
    );
    const part = await repo.exportPart(owner, new Date(Date.now() + 1000));
    expect(part.items.map((item) => item.id)).toEqual([ownAsset]);
    expect(part.items[0].size).toBeNull();
  });
  it('exports only own labels, face names, collections and safe share settings', async () => {
    const owner = await createUser();
    const foreign = await createUser();
    const ownAsset = randomUUID(),
      foreignAsset = randomUUID();
    const ownTag = randomUUID(),
      childTag = randomUUID(),
      foreignTag = randomUUID();
    const group = randomUUID(),
      ownFace = randomUUID(),
      foreignFace = randomUUID();
    const ownMemory = randomUUID(),
      foreignMemory = randomUUID();
    const ownStack = randomUUID(),
      foreignStack = randomUUID();
    const ownLink = randomUUID(),
      foreignLink = randomUUID();
    await sql`INSERT INTO asset(id,"ownerId") VALUES (${ownAsset},${owner}),(${foreignAsset},${foreign})`.execute(db);
    await sql`INSERT INTO tag(id,"userId",value,"parentId") VALUES (${ownTag},${owner},'Own label',NULL),(${childTag},${owner},'Child label',${ownTag}),(${foreignTag},${foreign},'FOREIGN-PRIVATE-LABEL',NULL)`.execute(
      db,
    );
    await sql`INSERT INTO tag_asset("tagId","assetId") VALUES (${ownTag},${ownAsset}),(${ownTag},${foreignAsset}),(${foreignTag},${ownAsset})`.execute(
      db,
    );
    await sql`INSERT INTO person("ownerId","personGroupId",name) VALUES (${owner},${group},'My person name'),(${foreign},${group},'FOREIGN-PRIVATE-PERSON-NAME')`.execute(
      db,
    );
    await sql`INSERT INTO asset_face(id,"assetId","personGroupId") VALUES (${ownFace},${ownAsset},${group}),(${foreignFace},${foreignAsset},${group})`.execute(
      db,
    );
    await sql`INSERT INTO memory(id,"ownerId") VALUES (${ownMemory},${owner}),(${foreignMemory},${foreign})`.execute(
      db,
    );
    await sql`INSERT INTO memory_asset("memoriesId","assetId") VALUES (${ownMemory},${ownAsset}),(${ownMemory},${foreignAsset}),(${foreignMemory},${ownAsset})`.execute(
      db,
    );
    await sql`INSERT INTO stack(id,"ownerId","primaryAssetId") VALUES (${ownStack},${owner},${ownAsset}),(${foreignStack},${foreign},${foreignAsset})`.execute(
      db,
    );
    await sql`INSERT INTO shared_link(id,"userId",key,password,slug,description) VALUES (${ownLink},${owner},decode('abcdef','hex'),'REUSABLE-PASSWORD-SECRET','REUSABLE-SLUG-SECRET','Own sharing'),(${foreignLink},${foreign},decode('fedcba','hex'),'FOREIGN-PASSWORD','FOREIGN-SLUG','FOREIGN-PRIVATE-SHARE')`.execute(
      db,
    );
    await sql`INSERT INTO shared_link_asset("sharedLinkId","assetId") VALUES (${ownLink},${ownAsset}),(${ownLink},${foreignAsset}),(${foreignLink},${ownAsset})`.execute(
      db,
    );
    await sql`INSERT INTO asset_ocr(id,"assetId",text) VALUES (${randomUUID()},${ownAsset},'Own image text'),(${randomUUID()},${foreignAsset},'FOREIGN-PRIVATE-OCR')`.execute(
      db,
    );
    await sql`INSERT INTO notification(id,"userId",title) VALUES (${randomUUID()},${owner},'Own notification'),(${randomUUID()},${foreign},'FOREIGN-PRIVATE-NOTIFICATION'),(${randomUUID()},NULL,'GLOBAL-ADMIN-NOTIFICATION')`.execute(
      db,
    );
    const sections = repo.exportSections(owner, new Date(Date.now() + 1000));
    const names = [
      'tags',
      'tagAssets',
      'people',
      'faces',
      'memories',
      'memoryAssets',
      'stacks',
      'sharedLinks',
      'sharedLinkAssets',
      'ocr',
      'notifications',
    ];
    const exported: Record<string, unknown[]> = {};
    for (const name of names) {
      const section = sections.find((section) => section.name === name)!;
      exported[name] = await Array.fromAsync(section.rows as AsyncIterable<unknown>);
    }
    expect(exported.tags).toHaveLength(2);
    expect(exported.tags).toContainEqual(expect.objectContaining({ id: childTag, parentId: ownTag }));
    expect(exported.tagAssets).toEqual([{ tagId: ownTag, assetId: ownAsset }]);
    expect(exported.people).toEqual([expect.objectContaining({ personGroupId: group, name: 'My person name' })]);
    expect(exported.faces).toEqual([expect.objectContaining({ id: ownFace, assetId: ownAsset, boundingBoxX1: 10 })]);
    expect(exported.memories).toEqual([expect.objectContaining({ id: ownMemory })]);
    expect(exported.memoryAssets).toEqual([expect.objectContaining({ memoriesId: ownMemory, assetId: ownAsset })]);
    expect(exported.stacks).toEqual([expect.objectContaining({ id: ownStack, primaryAssetId: ownAsset })]);
    expect(exported.sharedLinks).toEqual([expect.objectContaining({ id: ownLink, passwordProtected: true })]);
    expect(exported.sharedLinkAssets).toEqual([{ sharedLinkId: ownLink, assetId: ownAsset }]);
    expect(exported.ocr).toEqual([expect.objectContaining({ text: 'Own image text' })]);
    expect(exported.notifications).toEqual([expect.objectContaining({ title: 'Own notification' })]);
    const json = JSON.stringify(exported);
    expect(json).not.toContain('FOREIGN-PRIVATE');
    expect(json).not.toContain('GLOBAL-ADMIN');
    expect(json).not.toContain('REUSABLE-');
    expect(json).not.toContain('abcdef');
    expect(exported.sharedLinks[0]).not.toHaveProperty('key');
    expect(exported.sharedLinks[0]).not.toHaveProperty('password');
    expect(exported.sharedLinks[0]).not.toHaveProperty('slug');
  });
  it('schedules exactly seven days and repeat requests do not move the deadline', async () => {
    const id = await createUser();
    const now = new Date();
    const first = await repo.requestClosure(id, now, 'synthetic-hash', id);
    const second = await repo.requestClosure(id, new Date(now.getTime() + 1000), 'synthetic-hash', id);
    expect(first.closeAfter?.getTime()).toBe(now.getTime() + PHOLY_ACCOUNT_GRACE_MS);
    expect(second.closeAfter).toEqual(first.closeAfter);
    const user = await db.selectFrom('user').select('deletedAt').where('id', '=', id).executeTakeFirstOrThrow();
    expect(user.deletedAt).toBeNull();
    await repo.cancelClosure(id, now);
  });
  it('does not close before the deadline and cancellation wins atomically at a race boundary', async () => {
    const id = await createUser();
    const now = new Date();
    const state = await repo.requestClosure(id, now, 'synthetic-hash', id);
    expect(await repo.closeDue(new Date(state.closeAfter!.getTime() - 1))).toEqual([]);
    const [cancelled, processed] = await Promise.allSettled([
      repo.cancelClosure(id, new Date(state.closeAfter!.getTime() - 1)),
      repo.closeDue(new Date(state.closeAfter!.getTime() + 1)),
    ]);
    expect(processed.status).toBe('fulfilled');
    const user = await db.selectFrom('user').select('deletedAt').where('id', '=', id).executeTakeFirstOrThrow();
    if (cancelled.status === 'fulfilled') expect(user.deletedAt).toBeNull();
    else expect(user.deletedAt).not.toBeNull();
  });
  it('serializes closure requests and workers and processes a due account only once', async () => {
    const id = await createUser();
    const state = await repo.requestClosure(
      id,
      new Date(Date.now() - PHOLY_ACCOUNT_GRACE_MS - 1000),
      'synthetic-hash',
      id,
    );
    const [, firstWorker, secondWorker] = await Promise.allSettled([
      repo.requestClosure(id, new Date(), 'synthetic-hash', id),
      repo.closeDue(new Date()),
      repo.closeDue(new Date()),
    ]);
    expect(firstWorker.status).toBe('fulfilled');
    expect(secondWorker.status).toBe('fulfilled');
    const workers = [firstWorker, secondWorker].flatMap((result) =>
      result.status === 'fulfilled' ? result.value : [],
    );
    expect(workers.filter((user) => user.id === id)).toHaveLength(1);
    expect(state.closeAfter!.getTime()).toBeLessThan(Date.now());
  });
  it('blocks administrator closure and cancels pending closure after a promotion', async () => {
    const admin = await createUser(true);
    await expect(repo.requestClosure(admin, new Date(), 'synthetic-hash', admin)).rejects.toThrow('Administratoren');
    const promoted = await createUser();
    await repo.requestClosure(
      promoted,
      new Date(Date.now() - PHOLY_ACCOUNT_GRACE_MS - 1000),
      'synthetic-hash',
      promoted,
    );
    await sql`UPDATE "user" SET "isAdmin"=true WHERE id=${promoted}`.execute(db);
    const closed = await repo.closeDue(new Date());
    expect(closed.map((user) => user.id)).not.toContain(promoted);
    const promotedState = await repo.state(promoted);
    expect(promotedState?.closeAfter).toBeNull();
  });
  it('soft-deletes own albums, revokes sessions and unpublishes only the closing profile', async () => {
    const owner = await createUser();
    const foreign = await createUser();
    const album = randomUUID();
    const otherAlbum = randomUUID();
    await sql`INSERT INTO session (id,"userId") VALUES (${randomUUID()},${owner})`.execute(db);
    await sql`INSERT INTO pholy_community_profile ("userId") VALUES (${owner}),(${foreign})`.execute(db);
    await sql`INSERT INTO album(id) VALUES (${album}),(${otherAlbum})`.execute(db);
    await sql`INSERT INTO album_user ("albumId","userId",role) VALUES (${album},${owner},'owner'),(${otherAlbum},${foreign},'owner'),(${otherAlbum},${owner},'viewer')`.execute(
      db,
    );
    await repo.requestClosure(owner, new Date(Date.now() - PHOLY_ACCOUNT_GRACE_MS - 1000), 'synthetic-hash', owner);
    await repo.closeDue(new Date());
    expect(await db.selectFrom('session').select('id').where('userId', '=', owner).execute()).toEqual([]);
    const ownAlbum = await db.selectFrom('album').select('deletedAt').where('id', '=', album).executeTakeFirstOrThrow();
    const sharedAlbum = await db
      .selectFrom('album')
      .select('deletedAt')
      .where('id', '=', otherAlbum)
      .executeTakeFirstOrThrow();
    const ownProfile = await db
      .selectFrom('pholy_community_profile')
      .select('published')
      .where('userId', '=', owner)
      .executeTakeFirstOrThrow();
    const otherProfile = await db
      .selectFrom('pholy_community_profile')
      .select('published')
      .where('userId', '=', foreign)
      .executeTakeFirstOrThrow();
    expect(ownAlbum.deletedAt).not.toBeNull();
    expect(sharedAlbum.deletedAt).toBeNull();
    expect(ownProfile.published).toBe(false);
    expect(otherProfile.published).toBe(true);
  });
  it('rejects stale credential proofs and revoked sessions atomically before account mutations', async () => {
    const id = await createUser();
    await sql`UPDATE "user" SET password='changed-hash' WHERE id=${id}`.execute(db);
    await expect(repo.grantExport(id, id, new Date(), 'synthetic-hash')).rejects.toThrow('Konto wurde geändert');
    await expect(repo.requestClosure(id, new Date(), 'synthetic-hash', id)).rejects.toThrow('Konto wurde geändert');
    expect(await repo.state(id)).toBeUndefined();
    await sql`DELETE FROM session WHERE "userId"=${id}`.execute(db);
    await expect(repo.grantExport(id, id, new Date(), 'changed-hash')).rejects.toThrow('erneut an');
    await expect(repo.requestClosure(id, new Date(), 'changed-hash', id)).rejects.toThrow('erneut an');
    expect(await repo.state(id)).toBeUndefined();
  });
  it('revokes session-bound export grants when that session is deleted', async () => {
    const id = await createUser();
    const session = randomUUID();
    await sql`INSERT INTO session (id,"userId") VALUES (${session},${id})`.execute(db);
    await repo.grantExport(id, session, new Date(), 'synthetic-hash');
    const granted = await repo.state(id);
    expect(granted?.exportSessionId).toBe(session);
    await sql`DELETE FROM session WHERE id=${session}`.execute(db);
    const revoked = await repo.state(id);
    expect(revoked?.exportSessionId).toBeNull();
  });
});
