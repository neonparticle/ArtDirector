CREATE TABLE IF NOT EXISTS projects (
  id             INTEGER PRIMARY KEY,
  name           TEXT    NOT NULL,
  root           TEXT    NOT NULL UNIQUE,
  added_at       INTEGER NOT NULL,
  last_scan_at   INTEGER,
  cover_asset_id INTEGER,
  excludes       TEXT    NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS assets (
  id          INTEGER PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rel_path    TEXT    NOT NULL,
  dir         TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  ext         TEXT    NOT NULL,
  kind        TEXT    NOT NULL,
  size        INTEGER NOT NULL,
  mtime       INTEGER NOT NULL,
  width       INTEGER,
  height      INTEGER,
  frame_count INTEGER,
  hash        TEXT,
  hidden      INTEGER NOT NULL DEFAULT 0,
  ext_thumb   INTEGER,
  UNIQUE (project_id, rel_path)
);

CREATE INDEX IF NOT EXISTS assets_project_kind ON assets(project_id, kind);
CREATE INDEX IF NOT EXISTS assets_project_dir ON assets(project_id, dir);
CREATE INDEX IF NOT EXISTS assets_hash ON assets(hash);

CREATE TABLE IF NOT EXISTS sheet_meta (
  asset_id    INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  mode        TEXT    NOT NULL,
  cols        INTEGER,
  rows        INTEGER,
  frame_w     INTEGER,
  frame_h     INTEGER,
  fps         REAL    NOT NULL DEFAULT 8,
  source_json TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tag      TEXT    NOT NULL,
  PRIMARY KEY (asset_id, tag)
);

CREATE INDEX IF NOT EXISTS tags_tag ON tags(tag);

CREATE TABLE IF NOT EXISTS favorites (
  asset_id INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
