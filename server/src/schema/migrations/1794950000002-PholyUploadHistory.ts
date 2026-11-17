import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "pholy_upload_history" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" uuid NOT NULL REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "assetId" uuid REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "eventKey" varchar NOT NULL,
    "fileName" varchar NOT NULL,
    "fileSize" bigint NOT NULL,
    "status" varchar NOT NULL,
    "processingStep" varchar,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "pholy_upload_history_user_event_uq" UNIQUE ("userId", "eventKey"),
    CONSTRAINT "pholy_upload_history_size_check" CHECK ("fileSize" >= 0),
    CONSTRAINT "pholy_upload_history_status_check" CHECK ("status" IN ('processing', 'ready', 'processing-error', 'duplicate', 'cancelled', 'failed'))
  )`.execute(db);
  await sql`CREATE INDEX "pholy_upload_history_user_created_idx" ON "pholy_upload_history" ("userId", "createdAt" DESC)`.execute(db);
  await sql`CREATE INDEX "pholy_upload_history_asset_idx" ON "pholy_upload_history" ("assetId")`.execute(db);
  await sql`CREATE TABLE "pholy_alert_state" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" uuid NOT NULL REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "alertKey" varchar NOT NULL,
    "notifiedAt" timestamptz NOT NULL,
    CONSTRAINT "pholy_alert_state_user_key_uq" UNIQUE ("userId", "alertKey")
  )`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "pholy_alert_state"`.execute(db);
  await sql`DROP TABLE "pholy_upload_history"`.execute(db);
}
