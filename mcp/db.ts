// Read/write access to the ArtDirector index. Mirrors `src-tauri/src/index/queries.rs`
// so results match what the app shows; the app and this server share one SQLite
// file in WAL mode, which is safe across processes.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const IDENTIFIER = "dev.hawkk.artdirector";

export type AssetKind = "image" | "aseprite" | "sheet" | "model" | "blend" | "source";
export const ASSET_KINDS: AssetKind[] = ["image", "aseprite", "sheet", "model", "blend", "source"];
export type SortKey = "path" | "name" | "modified" | "size" | "dimensions";

export interface Project {
  id: number;
  name: string;
  root: string;
  addedAt: number;
  lastScanAt: number | null;
  coverAssetId: number | null;
  assetCount: number;
  excludes: string[];
}

export interface AssetSummary {
  id: number;
  projectId: number;
  name: string;
  relPath: string;
  dir: string;
  ext: string;
  kind: AssetKind;
  size: number;
  mtime: number;
  width: number | null;
  height: number | null;
  frameCount: number | null;
  favorite: boolean;
  tags: string[];
}

export interface AssetDetail extends AssetSummary {
  absPath: string;
  projectName: string;
  projectRoot: string;
  hash: string | null;
  sheet: SheetMeta | null;
  duplicateIds: number[];
}

export interface SheetMeta {
  mode: string;
  cols: number | null;
  rows: number | null;
  frameW: number | null;
  frameH: number | null;
  fps: number;
  sourceJson: string | null;
}

export interface AssetQuery {
  projectId?: number;
  kinds?: AssetKind[];
  folder?: string;
  search?: string;
  tag?: string;
  favoritesOnly?: boolean;
  hideDuplicates?: boolean;
  minPx?: number;
  sort?: SortKey;
  desc?: boolean;
  limit?: number;
  offset?: number;
}

/** Where Tauri puts `app_data_dir()` / `app_cache_dir()` for this identifier. */
export function defaultDirs(): { data: string; cache: string } {
  const env = process.env;
  if (env.ARTDIRECTOR_DATA_DIR && env.ARTDIRECTOR_CACHE_DIR) {
    return { data: env.ARTDIRECTOR_DATA_DIR, cache: env.ARTDIRECTOR_CACHE_DIR };
  }
  const home = homedir();
  let data: string;
  let cache: string;
  if (process.platform === "win32") {
    data = join(env.APPDATA ?? join(home, "AppData", "Roaming"), IDENTIFIER);
    cache = join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), IDENTIFIER);
  } else if (process.platform === "darwin") {
    data = join(home, "Library", "Application Support", IDENTIFIER);
    cache = join(home, "Library", "Caches", IDENTIFIER);
  } else {
    data = join(env.XDG_DATA_HOME ?? join(home, ".local", "share"), IDENTIFIER);
    cache = join(env.XDG_CACHE_HOME ?? join(home, ".cache"), IDENTIFIER);
  }
  return {
    data: env.ARTDIRECTOR_DATA_DIR ?? data,
    cache: env.ARTDIRECTOR_CACHE_DIR ?? cache,
  };
}

/** Same join as `index::abs_path` in Rust: root plus forward-slash parts, native separators. */
export function absPath(root: string, relPath: string): string {
  const base = root.replace(/[\\/]+$/, "");
  const parts = relPath.split("/").filter(Boolean);
  return parts.length ? `${base}${sep}${parts.join(sep)}` : root;
}

function i64le(n: number): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigInt64(0, BigInt(n), true);
  return buf;
}

/** Thumbnail cache key, identical to `thumbs::cache::key`. */
export function cacheKey(
  row: { root: string; relPath: string; size: number; mtime: number },
  salt: string,
): string {
  const h = blake3.create();
  h.update(new TextEncoder().encode(absPath(row.root, row.relPath)));
  h.update(i64le(row.size));
  h.update(i64le(row.mtime));
  h.update(new TextEncoder().encode(salt));
  return bytesToHex(h.digest()).slice(0, 32);
}

export function thumbPath(cacheDir: string, key: string): string {
  return join(cacheDir, "thumbs", key.slice(0, 2), `${key}.webp`);
}

const ASSET_COLUMNS = `
a.id, a.project_id, a.name, a.rel_path, a.dir, a.ext, a.kind, a.size, a.mtime,
a.width, a.height, a.frame_count,
EXISTS (SELECT 1 FROM favorites f WHERE f.asset_id = a.id) AS favorite,
(SELECT group_concat(t.tag, char(31)) FROM (SELECT tag FROM tags WHERE asset_id = a.id ORDER BY tag) t) AS tags`;

function likeEscape(s: string): string {
  return `%${s.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
}

// biome-ignore lint/suspicious/noExplicitAny: node:sqlite rows are untyped
type Row = Record<string, any>;

function summaryFromRow(r: Row): AssetSummary {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    relPath: r.rel_path,
    dir: r.dir,
    ext: r.ext,
    kind: r.kind,
    size: r.size,
    mtime: r.mtime,
    width: r.width,
    height: r.height,
    frameCount: r.frame_count,
    favorite: r.favorite === 1,
    tags: r.tags ? String(r.tags).split("\x1f") : [],
  };
}

export class ArtDirectorDb {
  readonly dataDir: string;
  readonly cacheDir: string;
  private db: DatabaseSync | null = null;

  constructor(dirs = defaultDirs()) {
    this.dataDir = dirs.data;
    this.cacheDir = dirs.cache;
  }

  get indexPath(): string {
    return join(this.dataDir, "index.sqlite");
  }

  private conn(): DatabaseSync {
    if (this.db) return this.db;
    if (!existsSync(this.indexPath)) {
      throw new Error(
        `ArtDirector index not found at ${this.indexPath}. Launch ArtDirector and add a project first, or set ARTDIRECTOR_DATA_DIR.`,
      );
    }
    const db = new DatabaseSync(this.indexPath);
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    this.db = db;
    return db;
  }

  /** The thumbnail size the app renders at, from its settings store. */
  thumbSize(): number {
    try {
      const raw = JSON.parse(readFileSync(join(this.dataDir, "settings.json"), "utf8"));
      const n = Number(raw?.settings?.thumbSize);
      if (Number.isFinite(n) && n > 0) return Math.min(512, Math.max(96, n));
    } catch {
      // Defaults below.
    }
    return 256;
  }

  listProjects(): Project[] {
    const rows = this.conn()
      .prepare(
        `SELECT p.id, p.name, p.root, p.added_at, p.last_scan_at, p.cover_asset_id, p.excludes,
                (SELECT COUNT(*) FROM assets WHERE project_id = p.id AND hidden = 0) AS asset_count
         FROM projects p ORDER BY p.name COLLATE NOCASE`,
      )
      .all() as Row[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      root: r.root,
      addedAt: r.added_at,
      lastScanAt: r.last_scan_at,
      coverAssetId: r.cover_asset_id,
      assetCount: r.asset_count,
      excludes: safeJson(r.excludes, []),
    }));
  }

  queryAssets(q: AssetQuery): { total: number; assets: AssetSummary[] } {
    const where: string[] = ["a.hidden = 0"];
    const args: (string | number)[] = [];

    if (q.projectId != null) {
      where.push("a.project_id = ?");
      args.push(q.projectId);
    }
    if (q.kinds?.length) {
      where.push(`a.kind IN (${q.kinds.map(() => "?").join(",")})`);
      args.push(...q.kinds);
    }
    const folder = q.folder?.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (folder) {
      where.push("(a.dir = ? OR substr(a.dir, 1, length(?) + 1) = ? || '/')");
      args.push(folder, folder, folder);
    }
    const search = q.search?.trim();
    if (search) {
      const pat = likeEscape(search);
      where.push(
        `(a.rel_path LIKE ? ESCAPE '\\'
          OR EXISTS (SELECT 1 FROM tags t WHERE t.asset_id = a.id AND t.tag LIKE ? ESCAPE '\\'))`,
      );
      args.push(pat, pat);
    }
    if (q.tag) {
      where.push("EXISTS (SELECT 1 FROM tags t WHERE t.asset_id = a.id AND t.tag = ?)");
      args.push(q.tag.trim().toLowerCase());
    }
    if (q.favoritesOnly) {
      where.push("EXISTS (SELECT 1 FROM favorites f WHERE f.asset_id = a.id)");
    }
    if (q.minPx && q.minPx > 0) {
      where.push("(a.width IS NULL OR max(a.width, a.height) >= ?)");
      args.push(q.minPx);
    }
    const order = {
      path: "a.rel_path COLLATE NOCASE",
      name: "a.name COLLATE NOCASE",
      modified: "a.mtime",
      size: "a.size",
      dimensions: "(coalesce(a.width, 0) * coalesce(a.height, 0))",
    }[q.sort ?? "path"];
    const dir = q.desc ? "DESC" : "ASC";
    const limit = Math.min(500, Math.max(1, q.limit ?? 50));
    const offset = Math.max(0, q.offset ?? 0);
    const clause = where.join(" AND ");
    // Pick each hash's representative among the rows that already match, so a
    // folder never goes empty because its twin with a shorter path lives elsewhere.
    const source = q.hideDuplicates
      ? `(SELECT a.*, row_number() OVER (
           PARTITION BY a.hash ORDER BY length(a.rel_path), a.id) AS dup_rank
         FROM assets a WHERE ${clause}) a
         WHERE a.hash IS NULL OR a.dup_rank = 1`
      : `assets a WHERE ${clause}`;

    const db = this.conn();
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM ${source}`).get(...args) as Row)
      .n as number;
    const rows = db
      .prepare(
        `SELECT ${ASSET_COLUMNS} FROM ${source}
         ORDER BY ${order} ${dir}, a.id ${dir} LIMIT ? OFFSET ?`,
      )
      .all(...args, limit, offset) as Row[];
    return { total, assets: rows.map(summaryFromRow) };
  }

  getAsset(id: number): AssetDetail {
    const db = this.conn();
    const r = db
      .prepare(
        `SELECT ${ASSET_COLUMNS}, a.hash, p.name AS project_name, p.root AS project_root
         FROM assets a JOIN projects p ON p.id = a.project_id WHERE a.id = ?`,
      )
      .get(id) as Row | undefined;
    if (!r) throw new Error(`asset ${id} not found`);

    const duplicateIds = r.hash
      ? (
          db
            .prepare("SELECT id FROM assets WHERE hash = ? AND id != ? AND hidden = 0 ORDER BY id")
            .all(r.hash, id) as Row[]
        ).map((d) => d.id as number)
      : [];

    const s = db
      .prepare(
        "SELECT mode, cols, rows, frame_w, frame_h, fps, source_json FROM sheet_meta WHERE asset_id = ?",
      )
      .get(id) as Row | undefined;

    return {
      ...summaryFromRow(r),
      absPath: absPath(r.project_root, r.rel_path),
      projectName: r.project_name,
      projectRoot: r.project_root,
      hash: r.hash ?? null,
      sheet: s
        ? {
            mode: s.mode,
            cols: s.cols,
            rows: s.rows,
            frameW: s.frame_w,
            frameH: s.frame_h,
            fps: s.fps,
            sourceJson: s.source_json,
          }
        : null,
      duplicateIds,
    };
  }

  listFolders(projectId: number): { dir: string; count: number }[] {
    return this.conn()
      .prepare(
        `SELECT dir, COUNT(*) AS count FROM assets WHERE project_id = ? AND hidden = 0
         GROUP BY dir ORDER BY dir COLLATE NOCASE`,
      )
      .all(projectId) as { dir: string; count: number }[];
  }

  kindCounts(projectId?: number): { kind: AssetKind; count: number }[] {
    return this.conn()
      .prepare(
        `SELECT kind, COUNT(*) AS count FROM assets
         WHERE hidden = 0 AND (? IS NULL OR project_id = ?) GROUP BY kind ORDER BY count DESC`,
      )
      .all(projectId ?? null, projectId ?? null) as { kind: AssetKind; count: number }[];
  }

  listTags(projectId?: number): { tag: string; count: number }[] {
    return this.conn()
      .prepare(
        `SELECT t.tag, COUNT(*) AS count FROM tags t JOIN assets a ON a.id = t.asset_id
         WHERE (? IS NULL OR a.project_id = ?) GROUP BY t.tag ORDER BY count DESC, t.tag`,
      )
      .all(projectId ?? null, projectId ?? null) as { tag: string; count: number }[];
  }

  findDuplicates(projectId?: number): { hash: string; assets: AssetSummary[] }[] {
    const rows = this.conn()
      .prepare(
        `SELECT ${ASSET_COLUMNS}, a.hash FROM assets a
         WHERE a.hidden = 0 AND a.hash IS NOT NULL
           AND (? IS NULL OR a.project_id = ?)
           AND a.hash IN (SELECT hash FROM assets WHERE hidden = 0 GROUP BY hash HAVING COUNT(*) > 1)
         ORDER BY a.hash, length(a.rel_path), a.id`,
      )
      .all(projectId ?? null, projectId ?? null) as Row[];
    const groups = new Map<string, AssetSummary[]>();
    for (const r of rows) {
      const list = groups.get(r.hash) ?? [];
      list.push(summaryFromRow(r));
      groups.set(r.hash, list);
    }
    return [...groups].map(([hash, assets]) => ({ hash, assets }));
  }

  setFavorite(id: number, favorite: boolean): void {
    this.requireAsset(id);
    const db = this.conn();
    if (favorite) db.prepare("INSERT OR IGNORE INTO favorites (asset_id) VALUES (?)").run(id);
    else db.prepare("DELETE FROM favorites WHERE asset_id = ?").run(id);
  }

  addTag(id: number, tag: string): string {
    const t = tag.trim().toLowerCase();
    if (!t) throw new Error("empty tag");
    this.requireAsset(id);
    this.conn().prepare("INSERT OR IGNORE INTO tags (asset_id, tag) VALUES (?, ?)").run(id, t);
    return t;
  }

  removeTag(id: number, tag: string): void {
    this.conn()
      .prepare("DELETE FROM tags WHERE asset_id = ? AND tag = ?")
      .run(id, tag.trim().toLowerCase());
  }

  private requireAsset(id: number): void {
    const r = this.conn().prepare("SELECT 1 FROM assets WHERE id = ?").get(id);
    if (!r) throw new Error(`asset ${id} not found`);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}

function safeJson<T>(s: unknown, fallback: T): T {
  try {
    return typeof s === "string" ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}
