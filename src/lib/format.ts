import { Box, Boxes, FileImage, Film, Grid3x3, Layers, type LucideIcon } from "lucide-react";
import type { AssetKind, AssetSummary } from "@/lib/bindings";

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(ms: number | null | undefined): string {
  return ms ? dateFmt.format(new Date(ms)) : "-";
}

export function formatRelative(ms: number | null | undefined): string {
  if (!ms) return "never";
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function formatDims(a: Pick<AssetSummary, "width" | "height">): string | null {
  return a.width && a.height ? `${a.width}×${a.height}` : null;
}

export function formatCount(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : n.toLocaleString();
}

export const KIND_META: Record<AssetKind, { label: string; plural: string; icon: LucideIcon }> = {
  image: { label: "Image", plural: "Images", icon: FileImage },
  sheet: { label: "Sheet", plural: "Sheets", icon: Grid3x3 },
  aseprite: { label: "Aseprite", plural: "Aseprite", icon: Film },
  model: { label: "Model", plural: "Models", icon: Box },
  blend: { label: "Blend", plural: "Blend", icon: Boxes },
  source: { label: "Source", plural: "Sources", icon: Layers },
};

export const KIND_ORDER: AssetKind[] = ["image", "sheet", "aseprite", "model", "blend", "source"];

/** Small sources are pixel art; render them with hard pixel edges. */
export function isPixelArt(a: Pick<AssetSummary, "width" | "height" | "kind">): boolean {
  if (a.kind === "aseprite") return true;
  const longest = Math.max(a.width ?? 0, a.height ?? 0);
  return longest > 0 && longest <= 256;
}
