import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  PrimaryGeneratedColumn,
  Table,
  type Generated,
  type Timestamp,
} from '@immich/sql-tools';
import { ColumnType } from 'kysely';
import { UserTable } from 'src/schema/tables/user.table.js';

@Table('pholy_invitation')
export class PholyInvitationTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;
  @Column()
  email!: string;
  @Column({ type: 'bytea', unique: true })
  tokenHash!: Buffer;
  @ForeignKeyColumn(() => UserTable, { onUpdate: 'CASCADE', onDelete: 'SET NULL', nullable: true })
  createdBy!: string | null;
  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
  @Column({ type: 'timestamp with time zone' })
  expiresAt!: Timestamp;
  @Column({ type: 'timestamp with time zone', nullable: true })
  usedAt!: Timestamp | null;
  @Column({ type: 'timestamp with time zone', nullable: true })
  revokedAt!: Timestamp | null;
  @ForeignKeyColumn(() => UserTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE', nullable: true })
  acceptedUserId!: string | null;
  @Column({ type: 'bigint', nullable: true })
  quotaSizeInBytes!: ColumnType<number> | null;
  @Column({ default: 'not_sent' })
  mailStatus!: Generated<string>;
  @Column({ type: 'timestamp with time zone', nullable: true })
  mailAttemptedAt!: Timestamp | null;
  @Column({ type: 'timestamp with time zone', nullable: true })
  mailAcceptedAt!: Timestamp | null;
  @Column({ nullable: true })
  termsVersion!: string | null;
}
