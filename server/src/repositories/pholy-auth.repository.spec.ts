import { Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { PholyAuthRepository } from 'src/repositories/pholy-auth.repository.js';
import type { DB } from 'src/schema/index.js';
import { up } from 'src/schema/migrations/1794950000001-PholyAccountMail.js';

const database = process.env.PHOLY_AUTH_TEST_DATABASE;
const hash = (value: string) => createHash('sha256').update(value).digest();
describe.skipIf(!database)('PHOLY credential recovery transactions (isolated database)', () => {
  let db: Kysely<DB>;
  let repository: PholyAuthRepository;
  const userId = randomUUID();
  const email = 'synthetic-reset@example.test';
  beforeAll(async () => {
    if (!database?.startsWith('pholy_auth_test_')) throw new Error('Refusing non-test database');
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
        `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE TABLE "user" (id uuid PRIMARY KEY, email varchar UNIQUE, password varchar, "deletedAt" timestamptz, status varchar NOT NULL DEFAULT 'active', "shouldChangePassword" boolean NOT NULL DEFAULT true);
      CREATE TABLE "session" (id uuid PRIMARY KEY, "userId" uuid REFERENCES "user" (id));
      CREATE TABLE "pholy_invitation" (id uuid PRIMARY KEY);`,
      )
      .execute(db);
    await up(db);
    await sql`INSERT INTO "user" (id,email,password) VALUES (${userId}, ${email}, 'original-credential-hash')`.execute(
      db,
    );
    repository = new PholyAuthRepository(db);
  });
  afterAll(async () => {
    if (db) await db.destroy();
  });
  beforeEach(async () => {
    await db.deleteFrom('pholy_password_reset').execute();
    await db.deleteFrom('session').execute();
    await db
      .updateTable('user')
      .set({ password: 'original-credential-hash', deletedAt: null })
      .where('id', '=', userId)
      .execute();
  });
  it('returns no account for unknown, deleted or passwordless users', async () => {
    expect(await repository.issue('unknown@example.test', hash('unknown'))).toBeUndefined();
    await db.updateTable('user').set({ password: null }).where('id', '=', userId).execute();
    expect(await repository.issue(email, hash('passwordless'))).toBeUndefined();
    await db
      .updateTable('user')
      .set({ password: 'original-credential-hash', deletedAt: new Date() })
      .where('id', '=', userId)
      .execute();
    expect(await repository.issue(email, hash('deleted'))).toBeUndefined();
  });
  it('throttles per account and rotates the prior link after cooldown', async () => {
    expect(await repository.issue(email, hash('first'))).toEqual({ email });
    expect(await repository.issue(email, hash('too-soon'))).toBeUndefined();
    await db
      .updateTable('pholy_password_reset')
      .set({ createdAt: new Date(Date.now() - 61_000) })
      .execute();
    expect(await repository.issue(email, hash('second'))).toEqual({ email });
    expect(await repository.isValid(hash('first'))).toBe(false);
    expect(await repository.isValid(hash('second'))).toBe(true);
  });
  it('atomically consumes once and revokes every session', async () => {
    await repository.issue(email, hash('single-use'));
    await sql`INSERT INTO session (id,"userId") VALUES (${randomUUID()},${userId}),(${randomUUID()},${userId})`.execute(
      db,
    );
    const results = await Promise.allSettled([
      repository.consume(hash('single-use'), 'new-credential'),
      repository.consume(hash('single-use'), 'other-credential'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const accepted = results.find((result) => result.status === 'fulfilled');
    if (accepted?.status === 'fulfilled') expect(accepted.value.sessionIds).toHaveLength(2);
    expect(await db.selectFrom('session').selectAll().execute()).toHaveLength(0);
    expect(await repository.isValid(hash('single-use'))).toBe(false);
    const user = await db
      .selectFrom('user')
      .select('shouldChangePassword')
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
    expect(user.shouldChangePassword).toBe(false);
  });
  it('rejects expired tokens and tokens issued before a different password change', async () => {
    await repository.issue(email, hash('expired'));
    await db
      .updateTable('pholy_password_reset')
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .execute();
    expect(await repository.isValid(hash('expired'))).toBe(false);
    await expect(repository.consume(hash('expired'), 'never-applied')).rejects.toThrow();
    await db
      .updateTable('pholy_password_reset')
      .set({ expiresAt: new Date(Date.now() + 30_000) })
      .execute();
    await db.updateTable('user').set({ password: 'changed-elsewhere' }).where('id', '=', userId).execute();
    expect(await repository.isValid(hash('expired'))).toBe(false);
    await expect(repository.consume(hash('expired'), 'never-applied')).rejects.toThrow();
  });
});
