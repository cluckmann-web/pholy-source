import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  PrimaryGeneratedColumn,
  Table,
  type Generated,
  type Timestamp,
} from '@immich/sql-tools';
import { AssetTable } from 'src/schema/tables/asset.table.js';
import { UserTable } from 'src/schema/tables/user.table.js';

@Table('pholy_community_profile')
export class PholyCommunityProfileTable {
  @ForeignKeyColumn(() => UserTable, { primary: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  userId!: string;
  @Column({ unique: true })
  slug!: string;
  @Column()
  displayName!: string;
  @Column({ type: 'text', default: '' })
  bio!: Generated<string>;
  @Column({ type: 'boolean', default: false })
  published!: Generated<boolean>;
  @Column({ type: 'boolean', default: false })
  blocked!: Generated<boolean>;
  @CreateDateColumn()
  updatedAt!: Generated<Timestamp>;
}

@Table('pholy_community_asset')
export class PholyCommunityAssetTable {
  @ForeignKeyColumn(() => UserTable, { primary: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  userId!: string;
  @ForeignKeyColumn(() => AssetTable, { primary: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  assetId!: string;
  @Column({ type: 'boolean', default: true })
  selected!: Generated<boolean>;
  @Column({ type: 'boolean', default: false })
  hidden!: Generated<boolean>;
  @Column({ type: 'integer', default: 0 })
  position!: Generated<number>;
}

@Table('pholy_community_follow')
export class PholyCommunityFollowTable {
  @ForeignKeyColumn(() => UserTable, { primary: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  followerId!: string;
  @ForeignKeyColumn(() => UserTable, { primary: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  userId!: string;
  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
}

@Table('pholy_community_report')
export class PholyCommunityReportTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;
  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  reporterId!: string;
  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  userId!: string;
  @ForeignKeyColumn(() => AssetTable, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  assetId!: string | null;
  @Column()
  reason!: string;
  @Column({ type: 'text' })
  details!: string;
  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
  @Column({ type: 'timestamp with time zone', nullable: true })
  resolvedAt!: Timestamp | null;
  @ForeignKeyColumn(() => UserTable, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  resolvedBy!: string | null;
  @Column({ nullable: true })
  action!: string | null;
}
