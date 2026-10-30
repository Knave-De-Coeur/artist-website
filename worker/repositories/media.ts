import { z } from 'zod';
import {
  EditorEmailSchema,
  type MediaAssetInput,
  MediaAssetInputSchema,
} from '../../src/lib/content/schema';

type MediaAssetRow = {
  id: string;
  object_key: string;
  original_filename: string;
  mime_type: MediaAssetInput['mimeType'];
  byte_size: number;
  width: number;
  height: number;
  checksum: string;
  alt_text: string;
  created_at: string;
  created_by: string;
  deleted_at: string | null;
};

export type MediaAsset = {
  id: string;
  objectKey: string;
  originalFilename: string;
  mimeType: MediaAssetInput['mimeType'];
  byteSize: number;
  width: number;
  height: number;
  checksum: string;
  altText: string;
  createdAt: string;
  createdBy: string;
  deletedAt: string | null;
};

function mediaAssetFromRow(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    objectKey: row.object_key,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    checksum: row.checksum,
    altText: row.alt_text,
    createdAt: row.created_at,
    createdBy: row.created_by,
    deletedAt: row.deleted_at,
  };
}

export class MediaRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: MediaAssetInput & {
    actorEmail: string;
    id?: string;
    now?: Date;
  }): Promise<MediaAsset> {
    const { actorEmail: rawActorEmail, id: rawId, now, ...rawAsset } = input;
    const asset = MediaAssetInputSchema.parse(rawAsset);
    const actorEmail = EditorEmailSchema.parse(rawActorEmail);
    const id = z.uuid().parse(rawId ?? crypto.randomUUID());
    const createdAt = (now ?? new Date()).toISOString();

    await this.db.prepare(`
      INSERT INTO media_assets (
        id, object_key, original_filename, mime_type, byte_size, width,
        height, checksum, alt_text, created_at, created_by
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
    `).bind(
      id,
      asset.objectKey,
      asset.originalFilename,
      asset.mimeType,
      asset.byteSize,
      asset.width,
      asset.height,
      asset.checksum,
      asset.altText,
      createdAt,
      actorEmail,
    ).run();

    const created = await this.get(id);
    if (!created) {
      throw new Error(`Media asset was not persisted: ${id}`);
    }
    return created;
  }

  async get(id: string): Promise<MediaAsset | null> {
    const row = await this.db.prepare(`
      SELECT * FROM media_assets WHERE id = ?1 LIMIT 1
    `).bind(id).first<MediaAssetRow>();

    return row ? mediaAssetFromRow(row) : null;
  }

  async listActive(): Promise<MediaAsset[]> {
    const result = await this.db.prepare(`
      SELECT * FROM media_assets
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `).all<MediaAssetRow>();

    return result.results.map(mediaAssetFromRow);
  }

  async softDelete(id: string, now?: Date): Promise<boolean> {
    const result = await this.db.prepare(`
      UPDATE media_assets
      SET deleted_at = ?1
      WHERE id = ?2 AND deleted_at IS NULL
    `).bind((now ?? new Date()).toISOString(), id).run();

    return result.meta.changes === 1;
  }
}
