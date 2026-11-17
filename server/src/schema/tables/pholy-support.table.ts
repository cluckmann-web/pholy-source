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

@Table('pholy_support_ticket')
export class PholySupportTicketTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;
  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  userId!: string;
  @Column()
  category!: string;
  @Column()
  subject!: string;
  @Column({ default: 'open' })
  status!: Generated<string>;
  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
  @CreateDateColumn()
  updatedAt!: Generated<Timestamp>;
}

@Table('pholy_support_message')
export class PholySupportMessageTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;
  @ForeignKeyColumn(() => PholySupportTicketTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  ticketId!: string;
  @ForeignKeyColumn(() => UserTable, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
  authorId!: string | null;
  @Column()
  isStaff!: boolean;
  @Column({ type: 'text' })
  message!: string;
  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
}
