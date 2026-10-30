PRAGMA foreign_keys = ON;

CREATE TABLE content_documents (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL
    CHECK (content_type IN ('siteSettings', 'homePage', 'track', 'video')),
  publication_state TEXT NOT NULL DEFAULT 'never_published'
    CHECK (publication_state IN ('never_published', 'published', 'archived')),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  draft_json TEXT NOT NULL CHECK (json_valid(draft_json)),
  published_json TEXT CHECK (published_json IS NULL OR json_valid(published_json)),
  sort_order INTEGER CHECK (sort_order IS NULL OR sort_order >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  published_at TEXT,
  published_by TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  published_version INTEGER,
  CHECK (
    (content_type = 'siteSettings' AND id = 'siteSettings' AND sort_order IS NULL)
    OR (content_type = 'homePage' AND id = 'homePage' AND sort_order IS NULL)
    OR (content_type IN ('track', 'video') AND sort_order IS NOT NULL)
  ),
  CHECK (
    published_version IS NULL
    OR (published_version >= 1 AND published_version <= version)
  )
);

CREATE UNIQUE INDEX idx_content_singletons
  ON content_documents(content_type)
  WHERE content_type IN ('siteSettings', 'homePage');

CREATE INDEX idx_content_type_state_sort
  ON content_documents(content_type, publication_state, sort_order, updated_at DESC);

CREATE UNIQUE INDEX idx_content_featured_sort
  ON content_documents(content_type, sort_order)
  WHERE content_type IN ('track', 'video')
    AND publication_state != 'archived'
    AND json_extract(draft_json, '$.data.featured') = 1;

CREATE TABLE content_revisions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  event_type TEXT NOT NULL
    CHECK (event_type IN ('created', 'saved', 'published', 'restored', 'archived')),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  created_at TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES content_documents(id) ON DELETE RESTRICT,
  UNIQUE (document_id, version)
);

CREATE INDEX idx_content_revisions_document
  ON content_revisions(document_id, version DESC);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  checksum TEXT NOT NULL,
  alt_text TEXT NOT NULL CHECK (length(trim(alt_text)) > 0),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX idx_media_assets_active_created
  ON media_assets(deleted_at, created_at DESC);
