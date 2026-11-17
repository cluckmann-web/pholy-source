import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema/index.js';

export const PHOLY_INVITATION_INVALID = 'Diese Einladung ist ungültig, abgelaufen oder bereits verwendet.';
const visibleColumns = [
  'id',
  'email',
  'createdAt',
  'expiresAt',
  'usedAt',
  'revokedAt',
  'quotaSizeInBytes',
  'mailStatus',
  'mailAttemptedAt',
  'mailAcceptedAt',
] as const;

@Injectable()
export class PholyInvitationRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async create(input: {
    email: string;
    tokenHash: Buffer;
    createdBy: string;
    expiresAt: Date;
    quotaSizeInBytes: number | null;
    mailStatus?: string;
    mailAttemptedAt?: Date | null;
  }) {
    return this.db.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.email}, 0))`.execute(trx);
      const existing = await trx.selectFrom('user').select('id').where('email', '=', input.email).executeTakeFirst();
      if (existing) throw new ConflictException('Für diese E-Mail-Adresse besteht bereits ein Konto.');
      await trx
        .updateTable('pholy_invitation')
        .set({ revokedAt: new Date() })
        .where('email', '=', input.email)
        .where('usedAt', 'is', null)
        .where('revokedAt', 'is', null)
        .execute();
      return trx.insertInto('pholy_invitation').values(input).returning(visibleColumns).executeTakeFirstOrThrow();
    });
  }

  list() {
    return this.db
      .selectFrom('pholy_invitation')
      .select(visibleColumns)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .execute();
  }

  async rotateForMail(id: string, tokenHash: Buffer) {
    return this.db.transaction().execute(async (trx) => {
      const candidate = await trx
        .selectFrom('pholy_invitation')
        .select('email')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!candidate) throw new BadRequestException(PHOLY_INVITATION_INVALID);
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${candidate.email}, 0))`.execute(trx);
      const invitation = await trx
        .selectFrom('pholy_invitation')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!invitation || invitation.usedAt || invitation.revokedAt)
        throw new BadRequestException(PHOLY_INVITATION_INVALID);
      if (invitation.mailAttemptedAt && invitation.mailAttemptedAt.getTime() > Date.now() - 60_000)
        throw new ConflictException('Bitte warte eine Minute, bevor du erneut sendest.');
      if (await trx.selectFrom('user').select('id').where('email', '=', invitation.email).executeTakeFirst())
        throw new ConflictException('Für diese E-Mail-Adresse besteht bereits ein Konto.');
      return trx
        .updateTable('pholy_invitation')
        .set({
          tokenHash,
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
          mailStatus: 'sending',
          mailAttemptedAt: new Date(),
          mailAcceptedAt: null,
        })
        .where('id', '=', id)
        .returning(visibleColumns)
        .executeTakeFirstOrThrow();
    });
  }

  async finishMail(id: string, tokenHash: Buffer, status: 'accepted' | 'disabled' | 'failed') {
    const invitation = await this.db
      .updateTable('pholy_invitation')
      .set({ mailStatus: status, mailAcceptedAt: status === 'accepted' ? new Date() : null })
      .where('id', '=', id)
      .where('tokenHash', '=', tokenHash)
      .returning(visibleColumns)
      .executeTakeFirst();
    if (!invitation) {
      // A later send owns the current token/status; never return the earlier secret URL.
      throw new ConflictException(
        'Die Einladung wurde inzwischen geändert oder entfernt. Bitte aktualisiere die Übersicht.',
      );
    }
    return invitation;
  }

  findValid(tokenHash: Buffer) {
    return this.db
      .selectFrom('pholy_invitation')
      .select(['id', 'email', 'expiresAt', 'quotaSizeInBytes'])
      .where('tokenHash', '=', tokenHash)
      .where('usedAt', 'is', null)
      .where('revokedAt', 'is', null)
      .where('expiresAt', '>', sql<Date>`clock_timestamp()`)
      .executeTakeFirst();
  }

  async revoke(id: string) {
    return this.db
      .updateTable('pholy_invitation')
      .set({ revokedAt: new Date() })
      .where('id', '=', id)
      .where('usedAt', 'is', null)
      .returning('id')
      .executeTakeFirst();
  }

  async accept(input: { tokenHash: Buffer; name: string; passwordHash: string; termsVersion: string }) {
    return this.db.transaction().execute(async (trx) => {
      const candidate = await trx
        .selectFrom('pholy_invitation')
        .select('email')
        .where('tokenHash', '=', input.tokenHash)
        .executeTakeFirst();
      if (!candidate) throw new BadRequestException(PHOLY_INVITATION_INVALID);
      // Use the same email-before-row lock order as create to avoid deadlocks.
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${candidate.email}, 0))`.execute(trx);
      const invitation = await trx
        .selectFrom('pholy_invitation')
        .selectAll()
        .where('tokenHash', '=', input.tokenHash)
        .forUpdate()
        .executeTakeFirst();
      if (!invitation || invitation.usedAt || invitation.revokedAt || invitation.expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException(PHOLY_INVITATION_INVALID);
      }
      if (await trx.selectFrom('user').select('id').where('email', '=', invitation.email).executeTakeFirst()) {
        throw new BadRequestException(PHOLY_INVITATION_INVALID);
      }
      const group = await trx.insertInto('cluster_group').defaultValues().returning('id').executeTakeFirstOrThrow();
      const user = await trx
        .insertInto('user')
        .values({
          email: invitation.email,
          name: input.name,
          password: input.passwordHash,
          clusterGroupId: group.id,
          isAdmin: false,
          shouldChangePassword: false,
          quotaSizeInBytes: invitation.quotaSizeInBytes,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await trx
        .updateTable('pholy_invitation')
        .set({
          usedAt: new Date(),
          acceptedUserId: user.id,
          termsVersion: input.termsVersion,
        })
        .where('id', '=', invitation.id)
        .execute();
      return { id: user.id };
    });
  }
}
