import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "pholy_support_ticket" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    "userId" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "category" character varying NOT NULL CHECK ("category" IN ('upload','account','storage','app','privacy','other')),
    "subject" character varying NOT NULL,
    "status" character varying NOT NULL DEFAULT 'open' CHECK ("status" IN ('open','waiting','resolved')),
    "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
    "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
  )`.execute(db);
  await sql`CREATE INDEX "pholy_support_ticket_user_idx" ON "pholy_support_ticket" ("userId", "updatedAt" DESC)`.execute(db);
  await sql`CREATE INDEX "pholy_support_ticket_status_idx" ON "pholy_support_ticket" ("status", "updatedAt" DESC)`.execute(db);
  await sql`CREATE TABLE "pholy_support_message" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    "ticketId" uuid NOT NULL REFERENCES "pholy_support_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "authorId" uuid REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "isStaff" boolean NOT NULL,
    "message" text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL DEFAULT now()
  )`.execute(db);
  await sql`CREATE INDEX "pholy_support_message_ticket_idx" ON "pholy_support_message" ("ticketId", "createdAt")`.execute(db);
  await sql`CREATE INDEX "pholy_support_message_author_idx" ON "pholy_support_message" ("authorId", "createdAt")`.execute(db);
}
export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "pholy_support_message"`.execute(db);
  await sql`DROP TABLE "pholy_support_ticket"`.execute(db);
}
