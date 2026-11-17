import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import type { PholySupportCreateDto, PholySupportListDto } from 'src/dtos/pholy-support.dto.js';
import type { DB } from 'src/schema/index.js';

@Injectable()
export class PholySupportRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  cleanupResolved() {
    return this.db
      .deleteFrom('pholy_support_ticket')
      .where('status', '=', 'resolved')
      .where('updatedAt', '<', sql<Date>`now() - interval '90 days'`)
      .execute();
  }

  async list(userId: string | undefined, { offset, status }: PholySupportListDto) {
    let query = this.db
      .selectFrom('pholy_support_ticket as ticket')
      .innerJoin('user', 'user.id', 'ticket.userId')
      .selectAll('ticket')
      .select(['user.name as userName', 'user.email as userEmail']);
    if (userId) query = query.where('ticket.userId', '=', userId);
    if (status) query = query.where('ticket.status', '=', status);
    const rows = await query
      .orderBy('ticket.updatedAt', 'desc')
      .orderBy('ticket.id', 'desc')
      .offset(offset)
      .limit(51)
      .execute();
    return { items: rows.slice(0, 50), hasMore: rows.length > 50 };
  }

  async get(id: string, userId?: string) {
    let query = this.db
      .selectFrom('pholy_support_ticket as ticket')
      .innerJoin('user', 'user.id', 'ticket.userId')
      .selectAll('ticket')
      .select(['user.name as userName', 'user.email as userEmail'])
      .where('ticket.id', '=', id);
    if (userId) query = query.where('ticket.userId', '=', userId);
    const ticket = await query.executeTakeFirst();
    if (!ticket) throw new NotFoundException('Anfrage nicht gefunden.');
    const messages = await this.db
      .selectFrom('pholy_support_message')
      .select(['id', 'isStaff', 'message', 'createdAt'])
      .where('ticketId', '=', id)
      .orderBy('createdAt')
      .orderBy('id')
      .limit(201)
      .execute();
    // A thread is capped at 200 messages when writing, so the full conversation remains bounded.
    return { ...ticket, messages };
  }

  create(userId: string, dto: PholySupportCreateDto) {
    return this.db.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`pholy-support:${userId}`}, 0))`.execute(trx);
      const recent = await trx
        .selectFrom('pholy_support_ticket')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('userId', '=', userId)
        .where('createdAt', '>', sql<Date>`now() - interval '1 hour'`)
        .executeTakeFirstOrThrow();
      const active = await trx
        .selectFrom('pholy_support_ticket')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('userId', '=', userId)
        .where('status', '!=', 'resolved')
        .executeTakeFirstOrThrow();
      if (Number(recent.count) >= 5 || Number(active.count) >= 20) {
        throw new HttpException(
          'Bitte ergänze eine bestehende Anfrage oder versuche es später erneut.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const ticket = await trx
        .insertInto('pholy_support_ticket')
        .values({ userId, category: dto.category, subject: dto.subject })
        .returningAll()
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('pholy_support_message')
        .values({ ticketId: ticket.id, authorId: userId, isStaff: false, message: dto.message })
        .execute();
      return { id: ticket.id };
    });
  }

  reply(id: string, actorId: string, isStaff: boolean, message: string) {
    return this.db.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`pholy-support:${actorId}`}, 0))`.execute(trx);
      let query = trx.selectFrom('pholy_support_ticket').select('id').where('id', '=', id);
      if (!isStaff) query = query.where('userId', '=', actorId);
      const ticket = await query.forUpdate().executeTakeFirst();
      if (!ticket) throw new NotFoundException('Anfrage nicht gefunden.');
      const recent = await trx
        .selectFrom('pholy_support_message')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('authorId', '=', actorId)
        .where('createdAt', '>', sql<Date>`now() - interval '1 hour'`)
        .executeTakeFirstOrThrow();
      const thread = await trx
        .selectFrom('pholy_support_message')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('ticketId', '=', id)
        .executeTakeFirstOrThrow();
      if (Number(recent.count) >= (isStaff ? 120 : 30) || Number(thread.count) >= 200) {
        throw new HttpException(
          'Zu viele Nachrichten. Bitte versuche es später oder eröffne für ein neues Anliegen eine neue Anfrage.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      await trx
        .insertInto('pholy_support_message')
        .values({ ticketId: id, authorId: actorId, isStaff, message })
        .execute();
      await trx
        .updateTable('pholy_support_ticket')
        .set({ status: isStaff ? 'waiting' : 'open', updatedAt: new Date() })
        .where('id', '=', id)
        .execute();
      return { id };
    });
  }

  async update(id: string, status: string) {
    const ticket = await this.db
      .updateTable('pholy_support_ticket')
      .set({ status, updatedAt: new Date() })
      .where('id', '=', id)
      .returning('id')
      .executeTakeFirst();
    if (!ticket) throw new NotFoundException('Anfrage nicht gefunden.');
    return ticket;
  }
}
