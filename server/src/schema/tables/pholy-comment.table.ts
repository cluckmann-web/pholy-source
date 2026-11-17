import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  PrimaryGeneratedColumn,
  Table,
  type Generated,
  type Timestamp,
} from '@immich/sql-tools';
import { AlbumTable } from 'src/schema/tables/album.table.js';
import { AssetTable } from 'src/schema/tables/asset.table.js';
import { UserTable } from 'src/schema/tables/user.table.js';

@Table('pholy_comment')
export class PholyCommentTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;
  @ForeignKeyColumn(() => AssetTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  assetId!: string;
  @Column()
  contextKind!: 'private' | 'album' | 'community';
  @Column({ type: 'uuid' })
  contextId!: string;
  @ForeignKeyColumn(() => AlbumTable, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  albumId!: string | null;
  @ForeignKeyColumn(() => UserTable, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  profileId!: string | null;
  @ForeignKeyColumn(() => UserTable, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  authorId!: string | null;
  @ForeignKeyColumn(() => PholyCommentTable, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  parentId!: string | null;
  @Column({ type: 'text' })
  body!: string;
  @Column({ type: 'timestamp with time zone', nullable: true })
  deletedAt!: Timestamp | null;
  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
  @CreateDateColumn()
  updatedAt!: Generated<Timestamp>;
}

@Table('pholy_comment_like')
export class PholyCommentLikeTable {
  @ForeignKeyColumn(() => PholyCommentTable, { primary: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  commentId!: string;
  @ForeignKeyColumn(() => UserTable, { primary: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  userId!: string;
  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
}

@Table('pholy_comment_rate')
export class PholyCommentRateTable {
  @ForeignKeyColumn(() => UserTable, { primary: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  userId!: string;
  @CreateDateColumn()
  windowStartedAt!: Generated<Timestamp>;
  @Column({ type: 'integer', default: 0 })
  count!: Generated<number>;
}
