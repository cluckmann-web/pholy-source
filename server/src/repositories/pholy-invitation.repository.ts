import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema/index.js';

export const PHOLY_INVITATION_INVALID = 'Diese Einladung ist ungültig, abgelaufen oder bereits verwendet.';
const visibleColumns = ['id', 'email', 'createdAt', 'expiresAt', 'usedAt', 'revokedAt', 'quotaSizeInBytes'] as const;

@Injectable()
export class PholyInvitationRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async create(input: {
    email: string;
    tokenHash: Buffer;
    createdBy: string;
    expiresAt: Date;
    quotaSizeInBytes: number | null;
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
