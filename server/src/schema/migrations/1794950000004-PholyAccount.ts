import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "pholy_account_state" (
    "userId" uuid PRIMARY KEY REFERENCES "user" (id) ON UPDATE CASCADE ON DELETE CASCADE,
    "exportSessionId" uuid REFERENCES "session" (id) ON UPDATE CASCADE ON DELETE SET NULL,
    "exportExpiresAt" timestamptz,
    "exportBefore" timestamptz,
    "closeRequestedAt" timestamptz,
    "closeAfter" timestamptz
  )`.execute(db);
  await sql`CREATE INDEX "pholy_account_state_closeAfter_idx" ON "pholy_account_state" ("closeAfter")`.execute(db);
  await sql`CREATE INDEX "pholy_account_state_exportSessionId_idx" ON "pholy_account_state" ("exportSessionId")`.execute(db);
}
export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "pholy_account_state"`.execute(db);
}
