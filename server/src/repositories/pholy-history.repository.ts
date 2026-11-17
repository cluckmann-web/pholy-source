import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { columns } from 'src/database.js';
import { PHOLY_HISTORY_PAGE_SIZE, PHOLY_HISTORY_RETENTION_DAYS } from 'src/dtos/pholy-history.dto.js';
import { AssetFileType, AssetVisibility, NotificationLevel, NotificationType } from 'src/enum.js';
import type { DB } from 'src/schema/index.js';
import type { PholyHistoryStatus } from 'src/schema/tables/pholy-upload-history.table.js';

const cutoff = () => new Date(Date.now() - PHOLY_HISTORY_RETENTION_DAYS * 86_400_000);

@Injectable()
export class PholyHistoryRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  record(input: {
    userId: string;
    assetId: string | null;
    eventKey: string;
    fileName: string;
    fileSize: number;
    status: PholyHistoryStatus;
  }) {
    return this.db
      .insertInto('pholy_upload_history')
      .values(input)
      .onConflict((oc) =>
        oc.columns(['userId', 'eventKey']).doUpdateSet({
          assetId: input.assetId,
          fileName: input.fileName,
          fileSize: input.fileSize,
          status: input.status,
          processingStep: null,
          updatedAt: new Date(),
        }),
      )
      .execute();
  }

  accepted(input: { userId: string; assetId: string; fileName: string; fileSize: number }) {
    // Never reset a processing failure or a ready state when AssetCreate is delivered twice.
    return this.db
      .insertInto('pholy_upload_history')
      .values({ ...input, eventKey: `asset:${input.assetId}`, status: 'processing' })
      .onConflict((oc) => oc.columns(['userId', 'eventKey']).doNothing())
      .execute();
  }

  removeAttempt(userId: string, id: string) {
    return this.db
      .deleteFrom('pholy_upload_history')
      .where('userId', '=', userId)
      .where('eventKey', '=', `client:${id}`)
      .execute();
  }

  async list(userId: string, page: number) {
    const rows = await this.db
      .selectFrom('pholy_upload_history as h')
      .leftJoin('asset as a', 'a.id', 'h.assetId')
      .select(['h.id', 'h.fileName', 'h.fileSize', 'h.status', 'h.processingStep', 'h.createdAt', 'h.updatedAt'])
      .select((eb) => [
        eb.case().when('a.deletedAt', 'is', null).then(eb.ref('h.assetId')).else(null).end().as('assetId'),
        eb
          .exists(
            eb
              .selectFrom('asset_file')
              .select('id')
              .whereRef('assetId', '=', 'h.assetId')
              .where('type', '=', AssetFileType.Preview),
          )
          .as('previewReady'),
        eb
          .exists(
            eb
              .selectFrom('asset_file')
              .select('id')
              .whereRef('assetId', '=', 'h.assetId')
              .where('type', '=', AssetFileType.Thumbnail),
          )
          .as('thumbnailReady'),
      ])
      .where('h.userId', '=', userId)
      .where((eb) => eb.or([eb('a.id', 'is', null), eb('a.ownerId', '=', userId)]))
      .where('h.createdAt', '>=', cutoff())
      .where((eb) =>
        eb.or([eb('a.id', 'is', null), eb('a.visibility', 'in', [AssetVisibility.Timeline, AssetVisibility.Archive])]),
      )
      .orderBy('h.createdAt', 'desc')
      .orderBy('h.id', 'desc')
      .offset(page * PHOLY_HISTORY_PAGE_SIZE)
      .limit(PHOLY_HISTORY_PAGE_SIZE + 1)
      .execute();
    return { items: rows.slice(0, PHOLY_HISTORY_PAGE_SIZE), hasMore: rows.length > PHOLY_HISTORY_PAGE_SIZE };
  }

  processingFailure(assetId: string, step: string) {
    return this.db
      .updateTable('pholy_upload_history')
      .set({ status: 'processing-error', processingStep: step, updatedAt: new Date() })
      .where('eventKey', '=', `asset:${assetId}`)
      .where('assetId', '=', assetId)
      .where('createdAt', '>=', cutoff())
      .returning(['userId', 'fileName'])
      .executeTakeFirst();
  }

  processingRecovered(assetId: string, step: string) {
    return this.db
      .updateTable('pholy_upload_history')
      .set({ status: 'processing', processingStep: null, updatedAt: new Date() })
      .where('eventKey', '=', `asset:${assetId}`)
      .where('assetId', '=', assetId)
      .where('processingStep', '=', step)
      .execute();
  }

  async notifyOnce(
    userId: string,
    alertKey: string,
    input: { title: string; description: string; level: NotificationLevel },
    hours = 24,
  ) {
    return this.db.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`pholy-alert:${userId}:${alertKey}`}, 0))`.execute(trx);
      const previous = await trx
        .selectFrom('pholy_alert_state')
        .select('notifiedAt')
        .where('userId', '=', userId)
        .where('alertKey', '=', alertKey)
        .executeTakeFirst();
      if (previous && previous.notifiedAt.getTime() > Date.now() - hours * 3_600_000) return;
      await trx
        .insertInto('pholy_alert_state')
        .values({ userId, alertKey, notifiedAt: new Date() })
        .onConflict((oc) => oc.columns(['userId', 'alertKey']).doUpdateSet({ notifiedAt: new Date() }))
        .execute();
      return trx
        .insertInto('notification')
        .values({
          userId,
          ...input,
          type: NotificationType.SystemMessage,
          data: { pholy: true, path: '/upload-history' },
        })
        .returning(columns.notification)
        .executeTakeFirstOrThrow();
    });
  }

  async cleanup() {
    await this.db.deleteFrom('pholy_upload_history').where('createdAt', '<', cutoff()).execute();
    await this.db.deleteFrom('pholy_alert_state').where('notifiedAt', '<', cutoff()).execute();
  }
}
