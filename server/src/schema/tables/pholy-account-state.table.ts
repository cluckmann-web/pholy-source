import { Column, ForeignKeyColumn, Index, Table, type Timestamp } from '@immich/sql-tools';
import { SessionTable } from 'src/schema/tables/session.table.js';
import { UserTable } from 'src/schema/tables/user.table.js';

@Table('pholy_account_state')
@Index({ columns: ['closeAfter'] })
export class PholyAccountStateTable {
  @ForeignKeyColumn(() => UserTable, { primary: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  userId!: string;
  @ForeignKeyColumn(() => SessionTable, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  exportSessionId!: string | null;
  @Column({ type: 'timestamp with time zone', nullable: true })
  exportExpiresAt!: Timestamp | null;
  @Column({ type: 'timestamp with time zone', nullable: true })
  exportBefore!: Timestamp | null;
  @Column({ type: 'timestamp with time zone', nullable: true })
  closeRequestedAt!: Timestamp | null;
  @Column({ type: 'timestamp with time zone', nullable: true })
  closeAfter!: Timestamp | null;
}
