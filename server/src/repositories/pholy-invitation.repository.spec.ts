import { Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { PholyInvitationRepository } from 'src/repositories/pholy-invitation.repository.js';
import type { DB } from 'src/schema/index.js';
import { down, up } from 'src/schema/migrations/1794916800000-PholyInvitations.js';
import { down as mailDown, up as mailUp } from 'src/schema/migrations/1794950000001-PholyAccountMail.js';

const hash = (s: string) => createHash('sha256').update(s).digest();
const database = process.env.PHOLY_INVITATION_TEST_DATABASE;
describe.skipIf(!database)('PHOLY invitation transactions (isolated database)', () => {
  let db: Kysely<DB>;
  let repo: PholyInvitationRepository;
  let owner: string;

  const accept = (token: string) =>
    repo.accept({
      tokenHash: hash(token),
      name: 'Synthetic Person',
      passwordHash: 'synthetic-hash',
      termsVersion: '2026-11-17',
    });
  const invite = (email: string, token: string, expiresAt = new Date(Date.now() + 60_000)) =>
    repo.create({ email, tokenHash: hash(token), createdBy: owner, expiresAt, quotaSizeInBytes: 1024 });
  beforeAll(async () => {
    if (!database?.startsWith('pholy_invitation_test_')) throw new Error('Refusing non-test database');
    db = new Kysely<DB>({
      dialect: new PostgresJSDialect({
        postgres: postgres({
          host: process.env.PHOLY_TEST_PGHOST ?? '/var/www/vhosts/pholy.de/pholy-data/run-postgres',
          port: 5448,
          database,
          username: 'pholy',
          onnotice: () => {},
        }),
      }),
    });
    await sql
      .raw(
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE TABLE cluster_group (id uuid PRIMARY KEY DEFAULT uuid_generate_v4()); CREATE TABLE "user" (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), email varchar NOT NULL UNIQUE, name varchar NOT NULL, password varchar, "clusterGroupId" uuid REFERENCES cluster_group(id), "isAdmin" boolean NOT NULL DEFAULT false, "shouldChangePassword" boolean NOT NULL DEFAULT true, "quotaSizeInBytes" bigint);',
      )
      .execute(db);
    await up(db);
    await mailUp(db);
    repo = new PholyInvitationRepository(db);
    owner = randomUUID();
    await sql`INSERT INTO "user" (id,email,name,"isAdmin") VALUES (${owner},'admin@example.test','Admin',true)`.execute(
      db,
    );
  });
  afterAll(async () => {
    if (!db) {
      return;
    }

    await mailDown(db);
    await down(db);
    await db.destroy();
  });
  it('allows only one of two simultaneous registrations and preserves invited email/quota', async () => {
    await invite('race@example.test', 'race');
    const results = await Promise.allSettled([accept('race'), accept('race')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const user = await db
      .selectFrom('user')
      .selectAll()
      .where('email', '=', 'race@example.test')
      .executeTakeFirstOrThrow();
    expect(user.isAdmin).toBe(false);
    expect(user.shouldChangePassword).toBe(false);
    expect(Number(user.quotaSizeInBytes)).toBe(1024);
    expect(await repo.findValid(hash('race'))).toBeUndefined();
    await expect(accept('race')).rejects.toThrow();
    const groups = await sql<{ count: string }>`select count(*) from cluster_group`.execute(db);
    expect(Number(groups.rows[0].count)).toBe(1);
  });
  it('rejects expired, revoked and unknown tokens without creating users', async () => {
    await invite('expired@example.test', 'expired', new Date(Date.now() - 1000));
    const revoked = await invite('revoked@example.test', 'revoked');
    await repo.revoke(revoked.id);
    for (const token of ['expired', 'revoked', 'unknown']) {
      expect(await repo.findValid(hash(token))).toBeUndefined();
      await expect(accept(token)).rejects.toThrow();
    }
    expect(
      await db
        .selectFrom('user')
        .select('id')
        .where('email', 'in', ['expired@example.test', 'revoked@example.test'])
        .execute(),
    ).toEqual([]);
  });
  it('invalidates the previous link when an invitation is replaced', async () => {
    await invite('replace@example.test', 'old');
    await invite('replace@example.test', 'new');
    expect(await repo.findValid(hash('old'))).toBeUndefined();
    await expect(accept('old')).rejects.toThrow();
    await expect(accept('new')).resolves.toHaveProperty('id');
  });
  it('serializes replacement and acceptance without deadlocks or duplicate users', async () => {
    await invite('compete@example.test', 'first');
    const results = await Promise.allSettled([accept('first'), invite('compete@example.test', 'second')]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    if (await repo.findValid(hash('second'))) await accept('second');
    expect(await db.selectFrom('user').select('id').where('email', '=', 'compete@example.test').execute()).toHaveLength(
      1,
    );
  });
  it('invalidates old links on mail resend, rate limits repeated sends and ignores stale delivery updates', async () => {
    const invitation = await invite('resend@example.test', 'before-send');
    const sent = await repo.rotateForMail(invitation.id, hash('after-send'));
    expect(sent.mailStatus).toBe('sending');
    expect(await repo.findValid(hash('before-send'))).toBeUndefined();
    expect(await repo.findValid(hash('after-send'))).toHaveProperty('id', invitation.id);
    await expect(repo.rotateForMail(invitation.id, hash('too-soon'))).rejects.toThrow('Minute');
    await expect(repo.finishMail(invitation.id, hash('before-send'), 'accepted')).rejects.toMatchObject({
      status: 409,
      response: { message: 'Die Einladung wurde inzwischen geändert oder entfernt. Bitte aktualisiere die Übersicht.' },
    });
    const current = await db
      .selectFrom('pholy_invitation')
      .select(['mailStatus', 'tokenHash'])
      .where('id', '=', invitation.id)
      .executeTakeFirstOrThrow();
    expect(current.mailStatus).toBe('sending');
    expect(current.tokenHash).toEqual(hash('after-send'));
    const failed = await repo.finishMail(invitation.id, hash('after-send'), 'failed');
    expect(failed.mailStatus).toBe('failed');
    await repo.revoke(invitation.id);
    await expect(repo.rotateForMail(invitation.id, hash('revoked'))).rejects.toThrow();
  });
  it('refuses existing accounts and removes accepted invitation on final user deletion', async () => {
    await expect(invite('admin@example.test', 'existing')).rejects.toThrow();
    const user = await db
      .selectFrom('user')
      .select('id')
      .where('email', '=', 'race@example.test')
      .executeTakeFirstOrThrow();
    await db.deleteFrom('user').where('id', '=', user.id).execute();
    expect(
      await db.selectFrom('pholy_invitation').select('id').where('email', '=', 'race@example.test').execute(),
    ).toEqual([]);
  });
});
