import type { AssetSummary } from "@/lib/bindings";

const isWindows = navigator.userAgent.includes("Windows");

/** Base URL for the Rust `ad://` protocol; WebView2 exposes custom schemes as http://<scheme>.localhost. */
export const AD_BASE = isWindows ? "http://ad.localhost/" : "ad://localhost/";

type Versioned = Pick<AssetSummary, "id" | "mtime">;

export function thumbUrl(asset: Versioned, epoch = 0): string {
  return `${AD_BASE}thumb/${asset.id}?v=${asset.mtime}.${epoch}`;
}

export function fileUrl(asset: Versioned): string {
  return `${AD_BASE}file/${asset.id}?v=${asset.mtime}`;
}

/**
 * URL that keeps the original file name so loaders resolve sibling files
 * (glTF buffers, textures, .mtl) relative to it.
 */
export function relUrl(asset: Versioned & Pick<AssetSummary, "name">): string {
  return `${AD_BASE}rel/${asset.id}/${encodeURIComponent(asset.name)}`;
}

/** URL of another file in the same folder as `asset` (e.g. an OBJ's .mtl). */
export function siblingUrl(asset: Pick<AssetSummary, "id">, name: string): string {
  return `${AD_BASE}rel/${asset.id}/${encodeURIComponent(name)}`;
}

export function derivedUrl(asset: Versioned, kind: "strip" | "glb"): string {
  return `${AD_BASE}derived/${asset.id}/${kind}?v=${asset.mtime}`;
}

export function coverUrl(id: number, mtime: number | null, epoch = 0): string {
  return `${AD_BASE}thumb/${id}?v=${mtime ?? 0}.${epoch}`;
}
