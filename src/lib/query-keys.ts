import type { AssetQuery } from "@/lib/bindings";

export const qk = {
  projects: ["projects"] as const,
  assets: (q: AssetQuery) => ["assets", q] as const,
  assetsAll: ["assets"] as const,
  asset: (id: number) => ["asset", id] as const,
  assetAll: ["asset"] as const,
  folders: (projectId: number) => ["folders", projectId] as const,
  foldersAll: ["folders"] as const,
  kinds: (projectId: number | null) => ["kinds", projectId] as const,
  kindsAll: ["kinds"] as const,
  tags: (projectId: number | null) => ["tags", projectId] as const,
  tagsAll: ["tags"] as const,
  settings: ["settings"] as const,
  blender: ["blender"] as const,
  cache: ["cache"] as const,
  aseprite: (id: number, mtime: number) => ["aseprite", id, mtime] as const,
  sheet: (id: number) => ["sheet", id] as const,
  blend: (id: number) => ["blend", id] as const,
};
