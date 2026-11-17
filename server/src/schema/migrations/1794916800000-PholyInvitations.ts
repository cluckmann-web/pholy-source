import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "pholy_invitation" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "email" character varying NOT NULL,
    "tokenHash" bytea NOT NULL,
    "createdBy" uuid,
    "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
    "expiresAt" timestamp with time zone NOT NULL,
    "usedAt" timestamp with time zone,
    "revokedAt" timestamp with time zone,
    "acceptedUserId" uuid,
    "quotaSizeInBytes" bigint,
    "termsVersion" character varying,
    CONSTRAINT "pholy_invitation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pholy_invitation_tokenHash_uq" UNIQUE ("tokenHash"),
    CONSTRAINT "pholy_invitation_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT "pholy_invitation_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE
  )`.execute(db);
  await sql`CREATE INDEX "pholy_invitation_createdBy_idx" ON "pholy_invitation" ("createdBy")`.execute(db);
  await sql`CREATE INDEX "pholy_invitation_acceptedUserId_idx" ON "pholy_invitation" ("acceptedUserId")`.execute(db);
}
export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "pholy_invitation"`.execute(db);
}
