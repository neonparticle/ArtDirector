#!/usr/bin/env node
// MCP server exposing the ArtDirector library over stdio.
//
//   node mcp/server.ts
//
// Reads the same SQLite index and thumbnail cache the desktop app uses, so it
// works whether or not the app is running. Tag and favorite edits are written
// straight to the index; the app picks them up on its next query.

import { readFileSync, statSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { AssetDetail } from "./db.ts";
import { ArtDirectorDb, ASSET_KINDS, cacheKey, thumbPath } from "./db.ts";

const db = new ArtDirectorDb();

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

type ToolResult = {
  content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[];
  isError?: boolean;
};

function json(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function image(path: string, mimeType: string, caption: string): ToolResult {
  const bytes = readFileSync(path);
  return {
    content: [
      { type: "text", text: caption },
      { type: "image", data: bytes.toString("base64"), mimeType },
    ],
  };
}

function caption(a: AssetDetail): string {
  const dims = a.width != null ? ` ${a.width}x${a.height}` : "";
  const frames = a.frameCount != null ? ` ${a.frameCount}f` : "";
  return `#${a.id} ${a.projectName}/${a.relPath} (${a.kind}${dims}${frames})`;
}

/** Wraps a handler so thrown errors surface as tool errors instead of protocol faults. */
function guarded<A>(fn: (args: A) => ToolResult): (args: A) => ToolResult {
  return (args) => {
    try {
      return fn(args);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  };
}

const server = new McpServer({ name: "art-director", version: "0.1.0" });

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const writes = { readOnlyHint: false, destructiveHint: false, idempotentHint: true };

const projectId = z.number().int().optional().describe("Limit to one project id");

server.registerTool(
  "list_projects",
  {
    title: "List projects",
    description:
      "Projects (folders) indexed by ArtDirector with their root paths and asset counts. " +
      "Call this first to get project ids for the other tools.",
    inputSchema: {},
    annotations: readOnly,
  },
  guarded(() =>
    json(
      db.listProjects().map((p) => ({
        ...p,
        lastScanAt: p.lastScanAt ? new Date(p.lastScanAt).toISOString() : null,
      })),
    ),
  ),
);

server.registerTool(
  "search_assets",
  {
    title: "Search assets",
    description:
      "Find art assets across indexed projects. `search` matches the relative path and tags " +
      "(case-insensitive substring). Returns summaries with ids; use get_asset for full detail " +
      "and get_thumbnail / get_image to look at one.",
    inputSchema: {
      projectId,
      kinds: z
        .array(z.enum(ASSET_KINDS))
        .optional()
        .describe("image, aseprite, sheet, model, blend, source"),
      folder: z.string().optional().describe("Project-relative folder; includes subfolders"),
      search: z.string().optional().describe("Substring of the path or a tag"),
      tag: z.string().optional().describe("Exact tag"),
      favoritesOnly: z.boolean().optional(),
      hideDuplicates: z.boolean().optional().describe("Collapse byte-identical files to one"),
      minPx: z.number().int().optional().describe("Minimum of max(width, height)"),
      sort: z.enum(["path", "name", "modified", "size", "dimensions"]).optional(),
      desc: z.boolean().optional(),
      limit: z.number().int().min(1).max(500).optional().describe("Default 50"),
      offset: z.number().int().min(0).optional(),
    },
    annotations: readOnly,
  },
  guarded((q) => {
    const { total, assets } = db.queryAssets(q);
    return json({
      total,
      returned: assets.length,
      offset: q.offset ?? 0,
      assets: assets.map((a) => ({
        ...a,
        mtime: new Date(a.mtime).toISOString(),
      })),
    });
  }),
);

server.registerTool(
  "get_asset",
  {
    title: "Get asset",
    description:
      "Full detail for one asset: absolute path on disk, project, dimensions, tags, sprite sheet " +
      "layout (if any) and ids of byte-identical duplicates.",
    inputSchema: { id: z.number().int() },
    annotations: readOnly,
  },
  guarded(({ id }) => {
    const a = db.getAsset(id);
    return json({ ...a, mtime: new Date(a.mtime).toISOString() });
  }),
);

server.registerTool(
  "get_thumbnail",
  {
    title: "Get thumbnail",
    description:
      "A small preview of an asset as an image (WebP, usually 256px). Works for images, " +
      "sprite sheets and Aseprite files, and for 3D/Blender files the app has already rendered. " +
      "Falls back to the original file when the app has not cached a thumbnail yet.",
    inputSchema: { id: z.number().int() },
    annotations: readOnly,
  },
  guarded(({ id }) => {
    const a = db.getAsset(id);
    const row = { root: a.projectRoot, relPath: a.relPath, size: a.size, mtime: a.mtime };
    const cap = caption(a);

    const salt = a.kind === "model" || a.kind === "blend" ? "ext" : `t${db.thumbSize()}`;
    const cached = thumbPath(db.cacheDir, cacheKey(row, salt));
    if (a.kind !== "source" && exists(cached)) {
      return image(cached, "image/webp", cap);
    }
    const mime = IMAGE_MIME[a.ext];
    if ((a.kind === "image" || a.kind === "sheet") && mime && a.size <= MAX_IMAGE_BYTES) {
      return image(a.absPath, mime, `${cap} (original; no cached thumbnail yet)`);
    }
    return fail(
      `No thumbnail cached for ${cap}. Open it in ArtDirector once to render one. File: ${a.absPath}`,
    );
  }),
);

server.registerTool(
  "get_image",
  {
    title: "Get image",
    description:
      "The original file of a PNG/JPEG/GIF/WebP asset as an image, at full resolution " +
      "(files up to 4 MB). For other kinds use get_thumbnail or open the path from get_asset.",
    inputSchema: { id: z.number().int() },
    annotations: readOnly,
  },
  guarded(({ id }) => {
    const a = db.getAsset(id);
    const mime = IMAGE_MIME[a.ext];
    if (!mime)
      return fail(`${caption(a)} is a .${a.ext} file, not a viewable image. Path: ${a.absPath}`);
    if (a.size > MAX_IMAGE_BYTES) {
      return fail(
        `${caption(a)} is ${(a.size / 1048576).toFixed(1)} MB; use get_thumbnail. Path: ${a.absPath}`,
      );
    }
    return image(a.absPath, mime, caption(a));
  }),
);

server.registerTool(
  "list_folders",
  {
    title: "List folders",
    description: "Every folder in a project that contains assets, with counts.",
    inputSchema: { projectId: z.number().int() },
    annotations: readOnly,
  },
  guarded(({ projectId }) => json(db.listFolders(projectId))),
);

server.registerTool(
  "list_tags",
  {
    title: "List tags",
    description: "All tags in use, most common first.",
    inputSchema: { projectId },
    annotations: readOnly,
  },
  guarded(({ projectId }) => json(db.listTags(projectId))),
);

server.registerTool(
  "kind_counts",
  {
    title: "Kind counts",
    description: "How many assets of each kind (image, aseprite, sheet, model, blend, source).",
    inputSchema: { projectId },
    annotations: readOnly,
  },
  guarded(({ projectId }) => json(db.kindCounts(projectId))),
);

server.registerTool(
  "find_duplicates",
  {
    title: "Find duplicates",
    description: "Groups of byte-identical assets (same content hash), shortest path first.",
    inputSchema: { projectId },
    annotations: readOnly,
  },
  guarded(({ projectId }) => {
    const groups = db.findDuplicates(projectId);
    return json({
      groups: groups.length,
      redundantFiles: groups.reduce((n, g) => n + g.assets.length - 1, 0),
      duplicates: groups.map((g) => ({
        hash: g.hash,
        assets: g.assets.map((a) => ({ id: a.id, projectId: a.projectId, relPath: a.relPath })),
      })),
    });
  }),
);

server.registerTool(
  "set_favorite",
  {
    title: "Set favorite",
    description: "Mark or unmark an asset as a favorite in ArtDirector.",
    inputSchema: { id: z.number().int(), favorite: z.boolean() },
    annotations: writes,
  },
  guarded(({ id, favorite }) => {
    db.setFavorite(id, favorite);
    return json({ id, favorite });
  }),
);

server.registerTool(
  "add_tag",
  {
    title: "Add tag",
    description: "Tag an asset. Tags are trimmed and lower-cased, matching the app.",
    inputSchema: { id: z.number().int(), tag: z.string().min(1) },
    annotations: writes,
  },
  guarded(({ id, tag }) => {
    db.addTag(id, tag);
    return json({ id, tags: db.getAsset(id).tags });
  }),
);

server.registerTool(
  "remove_tag",
  {
    title: "Remove tag",
    description: "Remove a tag from an asset.",
    inputSchema: { id: z.number().int(), tag: z.string().min(1) },
    annotations: writes,
  },
  guarded(({ id, tag }) => {
    db.removeTag(id, tag);
    return json({ id, tags: db.getAsset(id).tags });
  }),
);

function exists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

const transport = new StdioServerTransport();
await server.connect(transport);
process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});
