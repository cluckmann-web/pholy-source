import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "pholy_community_profile" (
    "userId" uuid PRIMARY KEY REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "slug" character varying NOT NULL UNIQUE,
    "displayName" character varying NOT NULL,
    "bio" text NOT NULL DEFAULT '',
    "published" boolean NOT NULL DEFAULT false,
    "blocked" boolean NOT NULL DEFAULT false,
    "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
  )`.execute(db);
  await sql`CREATE TABLE "pholy_community_asset" (
    "userId" uuid NOT NULL REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "assetId" uuid NOT NULL REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "selected" boolean NOT NULL DEFAULT true,
    "hidden" boolean NOT NULL DEFAULT false,
    "position" integer NOT NULL DEFAULT 0,
    PRIMARY KEY ("userId", "assetId")
  )`.execute(db);
  await sql`CREATE INDEX "pholy_community_asset_assetId_idx" ON "pholy_community_asset" ("assetId")`.execute(db);
  await sql`CREATE TABLE "pholy_community_follow" (
    "followerId" uuid NOT NULL REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "userId" uuid NOT NULL REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY ("followerId", "userId"), CHECK ("followerId" <> "userId")
  )`.execute(db);
  await sql`CREATE INDEX "pholy_community_follow_userId_idx" ON "pholy_community_follow" ("userId")`.execute(db);
  await sql`CREATE TABLE "pholy_community_report" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "reporterId" uuid NOT NULL REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "userId" uuid NOT NULL REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "assetId" uuid REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
    "reason" character varying NOT NULL,
    "details" text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
    "resolvedAt" timestamp with time zone,
    "resolvedBy" uuid REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
    "action" character varying
  )`.execute(db);
  await sql`CREATE INDEX "pholy_community_report_reporterId_createdAt_idx" ON "pholy_community_report" ("reporterId", "createdAt")`.execute(db);
  await sql`CREATE INDEX "pholy_community_report_userId_idx" ON "pholy_community_report" ("userId")`.execute(db);
  await sql`CREATE INDEX "pholy_community_report_assetId_idx" ON "pholy_community_report" ("assetId")`.execute(db);
  await sql`CREATE INDEX "pholy_community_report_resolvedBy_idx" ON "pholy_community_report" ("resolvedBy")`.execute(db);
}
export async function down(db: Kysely<any>): Promise<void> {
  for (const table of ['pholy_community_report', 'pholy_community_follow', 'pholy_community_asset', 'pholy_community_profile']) {
    await db.schema.dropTable(table).execute();
  }
}
