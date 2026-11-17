import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "pholy_comment" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "assetId" uuid NOT NULL REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "contextKind" character varying NOT NULL CHECK ("contextKind" IN ('private','album','community')),
    "contextId" uuid NOT NULL,
    "albumId" uuid REFERENCES "album" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "profileId" uuid REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "authorId" uuid REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
    "parentId" uuid REFERENCES "pholy_comment" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "body" text NOT NULL CHECK (length("body") <= 2000),
    "deletedAt" timestamp with time zone,
    "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
    "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
    CHECK (("contextKind" = 'private' AND "albumId" IS NULL AND "profileId" IS NULL)
      OR ("contextKind" = 'album' AND "albumId" IS NOT NULL AND "albumId" = "contextId" AND "profileId" IS NULL)
      OR ("contextKind" = 'community' AND "profileId" IS NOT NULL AND "profileId" = "contextId" AND "albumId" IS NULL))
  )`.execute(db);
  await sql`CREATE INDEX "pholy_comment_context_idx" ON "pholy_comment" ("assetId", "contextKind", "contextId", "createdAt", "id")`.execute(db);
  await sql`CREATE INDEX "pholy_comment_author_created_idx" ON "pholy_comment" ("authorId", "createdAt")`.execute(db);
  await sql`CREATE INDEX "pholy_comment_parent_idx" ON "pholy_comment" ("parentId")`.execute(db);
  await sql`CREATE INDEX "pholy_comment_album_idx" ON "pholy_comment" ("albumId")`.execute(db);
  await sql`CREATE INDEX "pholy_comment_profile_idx" ON "pholy_comment" ("profileId")`.execute(db);
  await sql`CREATE TABLE "pholy_comment_like" (
    "commentId" uuid NOT NULL REFERENCES "pholy_comment" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "userId" uuid NOT NULL REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY ("commentId", "userId")
  )`.execute(db);
  await sql`CREATE INDEX "pholy_comment_like_user_idx" ON "pholy_comment_like" ("userId")`.execute(db);
  await sql`CREATE TABLE "pholy_comment_rate" (
    "userId" uuid PRIMARY KEY REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "windowStartedAt" timestamp with time zone NOT NULL DEFAULT now(),
    "count" integer NOT NULL DEFAULT 0
  )`.execute(db);
  // A deleted account must not leave its comment text behind. FK SET NULL keeps
  // replies by other members while this trigger removes the deleted author's text.
  await sql`CREATE FUNCTION pholy_comment_anonymize_author() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW."authorId" IS NULL AND OLD."authorId" IS NOT NULL THEN
        NEW.body := ''; NEW."deletedAt" := COALESCE(NEW."deletedAt", now()); NEW."updatedAt" := now();
      END IF;
      RETURN NEW;
    END;
  $$`.execute(db);
  await sql`CREATE TRIGGER pholy_comment_anonymize_author BEFORE UPDATE OF "authorId" ON "pholy_comment"
    FOR EACH ROW EXECUTE FUNCTION pholy_comment_anonymize_author()`.execute(db);
}
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('pholy_comment_rate').execute();
  await db.schema.dropTable('pholy_comment_like').execute();
  await db.schema.dropTable('pholy_comment').execute();
  await sql`DROP FUNCTION pholy_comment_anonymize_author()`.execute(db);
}
