import { z } from 'zod';
import {
  CONTENT_SCHEMA_VERSION,
  type ContentPayloadByType,
  type ContentType,
  ContentTypeSchema,
  EditorEmailSchema,
  type HomePage,
  parseContentPayload,
  parseStoredContentPayload,
  serializeContentPayload,
} from '../../src/lib/content/schema';
import { sanitizeRichText } from '../lib/sanitize-rich-text';

const SINGLETON_IDS = new Set<ContentType>(['siteSettings', 'homePage']);

type PublicationState = 'never_published' | 'published' | 'archived';
type RevisionEvent = 'created' | 'saved' | 'published' | 'restored' | 'archived';

type ContentDocumentRow = {
  id: string;
  content_type: string;
  publication_state: PublicationState;
  schema_version: number;
  draft_json: string;
  published_json: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  updated_by: string;
  published_at: string | null;
  published_by: string | null;
  version: number;
  published_version: number | null;
};

type ContentRevisionRow = {
  id: string;
  document_id: string;
  version: number;
  event_type: RevisionEvent;
  schema_version: number;
  snapshot_json: string;
  created_at: string;
  actor_email: string;
};

export type ContentDocument<T extends ContentType = ContentType> = {
  id: string;
  contentType: T;
  publicationState: PublicationState;
  schemaVersion: number;
  draft: ContentPayloadByType[T];
  published: ContentPayloadByType[T] | null;
  sortOrder: number | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  publishedAt: string | null;
  publishedBy: string | null;
  version: number;
  publishedVersion: number | null;
};

export type ContentRevision<T extends ContentType = ContentType> = {
  id: string;
  documentId: string;
  version: number;
  eventType: RevisionEvent;
  schemaVersion: number;
  snapshot: ContentPayloadByType[T];
  createdAt: string;
  actorEmail: string;
};

export class ContentNotFoundError extends Error {
  constructor(id: string) {
    super(`Content document not found: ${id}`);
    this.name = 'ContentNotFoundError';
  }
}

export class StaleContentVersionError extends Error {
  constructor(id: string, expectedVersion: number) {
    super(`Content document ${id} is no longer at version ${expectedVersion}`);
    this.name = 'StaleContentVersionError';
  }
}

export class ArchivedContentError extends Error {
  constructor(id: string) {
    super(`Content document is archived: ${id}`);
    this.name = 'ArchivedContentError';
  }
}

export class UnsupportedContentSchemaVersionError extends Error {
  constructor(version: number) {
    super(`Unsupported content schema version: ${version}`);
    this.name = 'UnsupportedContentSchemaVersionError';
  }
}

function timestamp(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function sortOrder<T extends ContentType>(
  contentType: T,
  data: ContentPayloadByType[T],
): number | null {
  if (contentType === 'track' || contentType === 'video') {
    return (data as ContentPayloadByType['track'] | ContentPayloadByType['video']).sortOrder;
  }

  return null;
}

async function normalizePayload<T extends ContentType>(
  contentType: T,
  value: unknown,
): Promise<ContentPayloadByType[T]> {
  const parsed = parseContentPayload(contentType, value);
  if (contentType !== 'homePage') {
    return parsed;
  }

  const homePage = parsed as HomePage;
  return parseContentPayload(contentType, {
    ...homePage,
    about: {
      ...homePage.about,
      bodyHtml: await sanitizeRichText(homePage.about.bodyHtml),
    },
  });
}

function documentFromRow<T extends ContentType>(
  row: ContentDocumentRow,
  contentType: T,
): ContentDocument<T> {
  if (row.schema_version !== CONTENT_SCHEMA_VERSION) {
    throw new UnsupportedContentSchemaVersionError(row.schema_version);
  }

  return {
    id: row.id,
    contentType,
    publicationState: row.publication_state,
    schemaVersion: row.schema_version,
    draft: parseStoredContentPayload(contentType, row.draft_json),
    published: row.published_json
      ? parseStoredContentPayload(contentType, row.published_json)
      : null,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    version: row.version,
    publishedVersion: row.published_version,
  };
}

function revisionFromRow<T extends ContentType>(
  row: ContentRevisionRow,
  contentType: T,
): ContentRevision<T> {
  if (row.schema_version !== CONTENT_SCHEMA_VERSION) {
    throw new UnsupportedContentSchemaVersionError(row.schema_version);
  }

  return {
    id: row.id,
    documentId: row.document_id,
    version: row.version,
    eventType: row.event_type,
    schemaVersion: row.schema_version,
    snapshot: parseStoredContentPayload(contentType, row.snapshot_json),
    createdAt: row.created_at,
    actorEmail: row.actor_email,
  };
}

export class ContentRepository {
  constructor(private readonly db: D1Database) {}

  async create<T extends ContentType>(input: {
    contentType: T;
    data: ContentPayloadByType[T];
    actorEmail: string;
    id?: string;
    now?: Date;
  }): Promise<ContentDocument<T>> {
    const actorEmail = EditorEmailSchema.parse(input.actorEmail);
    const data = await normalizePayload(input.contentType, input.data);
    const id = SINGLETON_IDS.has(input.contentType)
      ? input.contentType
      : z.uuid().parse(input.id ?? crypto.randomUUID());
    const createdAt = timestamp(input.now);
    const snapshot = serializeContentPayload(input.contentType, data);

    await this.db.batch([
      this.db.prepare(`
        INSERT INTO content_documents (
          id, content_type, publication_state, schema_version, draft_json,
          sort_order, created_at, updated_at, updated_by, version
        ) VALUES (?1, ?2, 'never_published', ?3, ?4, ?5, ?6, ?6, ?7, 1)
      `).bind(
        id,
        input.contentType,
        CONTENT_SCHEMA_VERSION,
        snapshot,
        sortOrder(input.contentType, data),
        createdAt,
        actorEmail,
      ),
      this.db.prepare(`
        INSERT INTO content_revisions (
          id, document_id, version, event_type, schema_version,
          snapshot_json, created_at, actor_email
        ) VALUES (?1, ?2, 1, 'created', ?3, ?4, ?5, ?6)
      `).bind(
        crypto.randomUUID(),
        id,
        CONTENT_SCHEMA_VERSION,
        snapshot,
        createdAt,
        actorEmail,
      ),
    ]);

    const created = await this.get(id, input.contentType);
    if (!created) {
      throw new ContentNotFoundError(id);
    }
    return created;
  }

  async get<T extends ContentType>(
    id: string,
    expectedType: T,
  ): Promise<ContentDocument<T> | null> {
    const row = await this.db.prepare(`
      SELECT * FROM content_documents WHERE id = ?1 LIMIT 1
    `).bind(id).first<ContentDocumentRow>();

    if (!row) {
      return null;
    }

    const contentType = ContentTypeSchema.parse(row.content_type);
    if (contentType !== expectedType) {
      throw new TypeError(`Expected ${expectedType} content but found ${contentType}`);
    }

    return documentFromRow(row, expectedType);
  }

  async saveDraft<T extends ContentType>(input: {
    id: string;
    contentType: T;
    expectedVersion: number;
    data: ContentPayloadByType[T];
    actorEmail: string;
    now?: Date;
  }): Promise<ContentDocument<T>> {
    const current = await this.requireCurrent(input.id, input.contentType, input.expectedVersion);
    if (current.publicationState === 'archived') {
      throw new ArchivedContentError(input.id);
    }

    const actorEmail = EditorEmailSchema.parse(input.actorEmail);
    const data = await normalizePayload(input.contentType, input.data);
    const snapshot = serializeContentPayload(input.contentType, data);
    const nextVersion = input.expectedVersion + 1;
    const updatedAt = timestamp(input.now);

    await this.runVersionedBatch(input.id, input.expectedVersion, [
      this.db.prepare(`
        UPDATE content_documents
        SET schema_version = ?1, draft_json = ?2, sort_order = ?3,
            updated_at = ?4, updated_by = ?5, version = ?6
        WHERE id = ?7 AND version = ?8
      `).bind(
        CONTENT_SCHEMA_VERSION,
        snapshot,
        sortOrder(input.contentType, data),
        updatedAt,
        actorEmail,
        nextVersion,
        input.id,
        input.expectedVersion,
      ),
      this.revisionStatement({
        documentId: input.id,
        version: nextVersion,
        eventType: 'saved',
        snapshot,
        createdAt: updatedAt,
        actorEmail,
      }),
    ]);

    return this.requireDocument(input.id, input.contentType);
  }

  async publish<T extends ContentType>(input: {
    id: string;
    contentType: T;
    expectedVersion: number;
    actorEmail: string;
    now?: Date;
  }): Promise<ContentDocument<T>> {
    const current = await this.requireCurrent(input.id, input.contentType, input.expectedVersion);
    if (current.publicationState === 'archived') {
      throw new ArchivedContentError(input.id);
    }

    const actorEmail = EditorEmailSchema.parse(input.actorEmail);
    const snapshot = serializeContentPayload(input.contentType, current.draft);
    const nextVersion = input.expectedVersion + 1;
    const publishedAt = timestamp(input.now);

    await this.runVersionedBatch(input.id, input.expectedVersion, [
      this.db.prepare(`
        UPDATE content_documents
        SET publication_state = 'published', published_json = draft_json,
            published_at = ?1, published_by = ?2, updated_at = ?1,
            updated_by = ?2, version = ?3, published_version = ?3
        WHERE id = ?4 AND version = ?5
      `).bind(
        publishedAt,
        actorEmail,
        nextVersion,
        input.id,
        input.expectedVersion,
      ),
      this.revisionStatement({
        documentId: input.id,
        version: nextVersion,
        eventType: 'published',
        snapshot,
        createdAt: publishedAt,
        actorEmail,
      }),
    ]);

    return this.requireDocument(input.id, input.contentType);
  }

  async restore<T extends ContentType>(input: {
    id: string;
    contentType: T;
    revisionVersion: number;
    expectedVersion: number;
    actorEmail: string;
    now?: Date;
  }): Promise<ContentDocument<T>> {
    await this.requireCurrent(input.id, input.contentType, input.expectedVersion);
    const revision = await this.getRevision(input.id, input.contentType, input.revisionVersion);
    if (!revision) {
      throw new ContentNotFoundError(`${input.id}@${input.revisionVersion}`);
    }

    const actorEmail = EditorEmailSchema.parse(input.actorEmail);
    const data = await normalizePayload(input.contentType, revision.snapshot);
    const snapshot = serializeContentPayload(input.contentType, data);
    const nextVersion = input.expectedVersion + 1;
    const restoredAt = timestamp(input.now);

    await this.runVersionedBatch(input.id, input.expectedVersion, [
      this.db.prepare(`
        UPDATE content_documents
        SET publication_state = CASE
              WHEN published_json IS NULL THEN 'never_published'
              ELSE 'published'
            END,
            schema_version = ?1, draft_json = ?2, sort_order = ?3,
            updated_at = ?4, updated_by = ?5, version = ?6
        WHERE id = ?7 AND version = ?8
      `).bind(
        CONTENT_SCHEMA_VERSION,
        snapshot,
        sortOrder(input.contentType, data),
        restoredAt,
        actorEmail,
        nextVersion,
        input.id,
        input.expectedVersion,
      ),
      this.revisionStatement({
        documentId: input.id,
        version: nextVersion,
        eventType: 'restored',
        snapshot,
        createdAt: restoredAt,
        actorEmail,
      }),
    ]);

    return this.requireDocument(input.id, input.contentType);
  }

  async archive<T extends ContentType>(input: {
    id: string;
    contentType: T;
    expectedVersion: number;
    actorEmail: string;
    now?: Date;
  }): Promise<ContentDocument<T>> {
    const current = await this.requireCurrent(input.id, input.contentType, input.expectedVersion);
    const actorEmail = EditorEmailSchema.parse(input.actorEmail);
    const snapshot = serializeContentPayload(input.contentType, current.draft);
    const nextVersion = input.expectedVersion + 1;
    const archivedAt = timestamp(input.now);

    await this.runVersionedBatch(input.id, input.expectedVersion, [
      this.db.prepare(`
        UPDATE content_documents
        SET publication_state = 'archived', updated_at = ?1,
            updated_by = ?2, version = ?3
        WHERE id = ?4 AND version = ?5
      `).bind(
        archivedAt,
        actorEmail,
        nextVersion,
        input.id,
        input.expectedVersion,
      ),
      this.revisionStatement({
        documentId: input.id,
        version: nextVersion,
        eventType: 'archived',
        snapshot,
        createdAt: archivedAt,
        actorEmail,
      }),
    ]);

    return this.requireDocument(input.id, input.contentType);
  }

  async listRevisions<T extends ContentType>(
    documentId: string,
    contentType: T,
  ): Promise<ContentRevision<T>[]> {
    await this.requireDocument(documentId, contentType);
    const result = await this.db.prepare(`
      SELECT * FROM content_revisions
      WHERE document_id = ?1
      ORDER BY version DESC
    `).bind(documentId).all<ContentRevisionRow>();

    return result.results.map((row) => revisionFromRow(row, contentType));
  }

  private async getRevision<T extends ContentType>(
    documentId: string,
    contentType: T,
    version: number,
  ): Promise<ContentRevision<T> | null> {
    const row = await this.db.prepare(`
      SELECT * FROM content_revisions
      WHERE document_id = ?1 AND version = ?2
      LIMIT 1
    `).bind(documentId, version).first<ContentRevisionRow>();

    return row ? revisionFromRow(row, contentType) : null;
  }

  private async requireCurrent<T extends ContentType>(
    id: string,
    contentType: T,
    expectedVersion: number,
  ): Promise<ContentDocument<T>> {
    const current = await this.requireDocument(id, contentType);
    if (current.version !== expectedVersion) {
      throw new StaleContentVersionError(id, expectedVersion);
    }
    return current;
  }

  private async requireDocument<T extends ContentType>(
    id: string,
    contentType: T,
  ): Promise<ContentDocument<T>> {
    const document = await this.get(id, contentType);
    if (!document) {
      throw new ContentNotFoundError(id);
    }
    return document;
  }

  private revisionStatement(input: {
    documentId: string;
    version: number;
    eventType: RevisionEvent;
    snapshot: string;
    createdAt: string;
    actorEmail: string;
  }): D1PreparedStatement {
    return this.db.prepare(`
      INSERT INTO content_revisions (
        id, document_id, version, event_type, schema_version,
        snapshot_json, created_at, actor_email
      )
      SELECT ?1, id, ?2, ?3, ?4, ?5, ?6, ?7
      FROM content_documents
      WHERE id = ?8 AND version = ?2
    `).bind(
      crypto.randomUUID(),
      input.version,
      input.eventType,
      CONTENT_SCHEMA_VERSION,
      input.snapshot,
      input.createdAt,
      input.actorEmail,
      input.documentId,
    );
  }

  private async runVersionedBatch(
    id: string,
    expectedVersion: number,
    statements: D1PreparedStatement[],
  ): Promise<void> {
    try {
      const [update] = await this.db.batch(statements);
      if (update.meta.changes === 1) {
        return;
      }
    } catch (error) {
      const row = await this.db.prepare(`
        SELECT version FROM content_documents WHERE id = ?1 LIMIT 1
      `).bind(id).first<{ version: number }>();
      if (!row || row.version === expectedVersion) {
        throw error;
      }
    }

    throw new StaleContentVersionError(id, expectedVersion);
  }
}
