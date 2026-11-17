import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Index,
  PrimaryGeneratedColumn,
  Table,
  Unique,
  type Generated,
  type Timestamp,
} from '@immich/sql-tools';
import type { ColumnType } from 'kysely';
import { AssetTable } from 'src/schema/tables/asset.table.js';
import { UserTable } from 'src/schema/tables/user.table.js';

export type PholyHistoryStatus = 'processing' | 'ready' | 'processing-error' | 'duplicate' | 'cancelled' | 'failed';

@Table('pholy_upload_history')
@Unique({ columns: ['userId', 'eventKey'] })
@Index({ columns: ['userId', 'createdAt'] })
export class PholyUploadHistoryTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;
  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  userId!: string;
  @ForeignKeyColumn(() => AssetTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: true })
  assetId!: string | null;
  @Column()
  eventKey!: string;
  @Column()
  fileName!: string;
  @Column({ type: 'bigint' })
  fileSize!: ColumnType<number>;
  @Column()
  status!: PholyHistoryStatus;
  @Column({ nullable: true })
  processingStep!: string | null;
  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  updatedAt!: Generated<Timestamp>;
}

@Table('pholy_alert_state')
@Unique({ columns: ['userId', 'alertKey'] })
export class PholyAlertStateTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;
  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  userId!: string;
  @Column()
  alertKey!: string;
  @Column({ type: 'timestamp with time zone' })
  notifiedAt!: Timestamp;
}
