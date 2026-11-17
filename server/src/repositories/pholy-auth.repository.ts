import { BadRequestException, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { createHash } from 'node:crypto';
import { UserStatus } from 'src/enum.js';
import { DB } from 'src/schema/index.js';

export const PHOLY_RESET_INVALID =
  'Dieser Link ist ungültig, abgelaufen oder bereits verwendet. Fordere einen neuen Link an.';
const fingerprint = (password: string) => createHash('sha256').update(password).digest();

@Injectable()
export class PholyAuthRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async issue(email: string, tokenHash: Buffer) {
    return this.db.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 1))`.execute(trx);
      const user = await trx
        .selectFrom('user')
        .select(['id', 'email', 'password'])
        .where('email', '=', email)
        .where('deletedAt', 'is', null)
        .where('status', '=', UserStatus.Active)
        .executeTakeFirst();
      if (!user?.password) return;
      const previous = await trx
        .selectFrom('pholy_password_reset')
        .select('createdAt')
        .where('userId', '=', user.id)
        .executeTakeFirst();
      if (previous && previous.createdAt.getTime() > Date.now() - 60_000) return;
      const value = {
        userId: user.id,
        tokenHash,
        credentialHash: fingerprint(user.password),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60_000),
        usedAt: null,
      };
      await trx
        .insertInto('pholy_password_reset')
        .values(value)
        .onConflict((oc) => oc.column('userId').doUpdateSet(value))
        .execute();
      return { email: user.email };
    });
  }

  async isValid(tokenHash: Buffer) {
    const record = await this.db
      .selectFrom('pholy_password_reset as reset')
      .innerJoin('user', 'user.id', 'reset.userId')
      .select(['reset.credentialHash', 'user.password'])
      .where('reset.tokenHash', '=', tokenHash)
      .where('reset.usedAt', 'is', null)
      .where('reset.expiresAt', '>', sql<Date>`clock_timestamp()`)
      .where('user.deletedAt', 'is', null)
      .where('user.status', '=', UserStatus.Active)
      .executeTakeFirst();
    return !!record?.password && fingerprint(record.password).equals(record.credentialHash);
  }

  async consume(tokenHash: Buffer, password: string) {
    return this.db.transaction().execute(async (trx) => {
      const candidate = await trx
        .selectFrom('pholy_password_reset')
        .select('userId')
        .where('tokenHash', '=', tokenHash)
        .executeTakeFirst();
      if (!candidate) throw new BadRequestException(PHOLY_RESET_INVALID);
      // Lock the account before the token to serialize with other credential/account changes.
      const user = await trx
        .selectFrom('user')
        .select(['id', 'password', 'deletedAt', 'status'])
        .where('id', '=', candidate.userId)
        .forUpdate()
        .executeTakeFirst();
      const reset = await trx
        .selectFrom('pholy_password_reset')
        .selectAll()
        .where('tokenHash', '=', tokenHash)
        .forUpdate()
        .executeTakeFirst();
      if (
        !user?.password ||
        user.deletedAt ||
        user.status !== UserStatus.Active ||
        !reset ||
        reset.usedAt ||
        reset.expiresAt.getTime() <= Date.now() ||
        !fingerprint(user.password).equals(reset.credentialHash)
      )
        throw new BadRequestException(PHOLY_RESET_INVALID);
      await trx.updateTable('user').set({ password, shouldChangePassword: false }).where('id', '=', user.id).execute();
      await trx.updateTable('pholy_password_reset').set({ usedAt: new Date() }).where('id', '=', reset.id).execute();
      const sessions = await trx.deleteFrom('session').where('userId', '=', user.id).returning('id').execute();
      return { userId: user.id, sessionIds: sessions.map(({ id }) => id) };
    });
  }
}
