import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "pholy_password_reset" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    "userId" uuid NOT NULL UNIQUE REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "tokenHash" bytea NOT NULL UNIQUE,
    "credentialHash" bytea NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "expiresAt" timestamptz NOT NULL,
    "usedAt" timestamptz
  )`.execute(db);
  await sql`ALTER TABLE "pholy_invitation"
    ADD COLUMN "mailStatus" varchar NOT NULL DEFAULT 'not_sent',
    ADD COLUMN "mailAttemptedAt" timestamptz,
    ADD COLUMN "mailAcceptedAt" timestamptz`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "pholy_invitation" DROP COLUMN "mailAcceptedAt", DROP COLUMN "mailAttemptedAt", DROP COLUMN "mailStatus"`.execute(db);
  await sql`DROP TABLE "pholy_password_reset"`.execute(db);
}
