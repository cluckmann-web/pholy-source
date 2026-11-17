import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  PrimaryGeneratedColumn,
  Table,
  type Generated,
  type Timestamp,
} from '@immich/sql-tools';
import { UserTable } from 'src/schema/tables/user.table.js';

@Table('pholy_password_reset')
export class PholyPasswordResetTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;
  @ForeignKeyColumn(() => UserTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE', unique: true })
  userId!: string;
  @Column({ type: 'bytea', unique: true })
  tokenHash!: Buffer;
  @Column({ type: 'bytea' })
  credentialHash!: Buffer;
  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
  @Column({ type: 'timestamp with time zone' })
  expiresAt!: Timestamp;
  @Column({ type: 'timestamp with time zone', nullable: true })
  usedAt!: Timestamp | null;
}
