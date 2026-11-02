import { useEffect, useRef, useState } from "react";
import { derivedUrl } from "@/lib/asset-url";
import type { AssetSummary } from "@/lib/bindings";
import { useUi } from "@/stores/ui";

/** Playback rate for animations without a saved one. */
export const DEFAULT_FPS = 8;

/** Mirrors `formats::sequence::layout`: frames packed row-major into a near-square grid. */
export function reelLayout(frames: number): { cols: number; rows: number } {
  const n = Math.max(1, frames);
  const cols = Math.ceil(Math.sqrt(n));
  return { cols, rows: Math.ceil(n / cols) };
}

type Tick = (now: number) => void;

const ticks = new Set<Tick>();
let raf = 0;

function loop(now: number) {
  for (const tick of ticks) tick(now);
  raf = ticks.size > 0 ? requestAnimationFrame(loop) : 0;
}

/** One animation-frame loop drives every reel, so tiles at the same rate stay in step. */
function onTick(tick: Tick): () => void {
  ticks.add(tick);
  if (!raf) raf = requestAnimationFrame(loop);
  return () => {
    ticks.delete(tick);
  };
}

type Props = {
  asset: Pick<AssetSummary, "id" | "mtime" | "size" | "frameCount" | "fps">;
  /** Paused reels hold the first frame. */
  playing?: boolean;
  className?: string;
  onError?: () => void;
};

/** Loops an animation's thumbnail-sized frame strip on a canvas. */
export function Reel({ asset, playing = true, className, onError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strip, setStrip] = useState<HTMLImageElement | null>(null);
  const frames = Math.max(1, asset.frameCount ?? 1);
  const fps = asset.fps ?? DEFAULT_FPS;
  // Reels are rendered at the thumbnail size, so they go stale with the thumbnails.
  const epoch = useUi((s) => s.thumbEpoch);
  const url = derivedUrl(asset, "reel", epoch);
  const errorRef = useRef(onError);
  errorRef.current = onError;

  useEffect(() => {
    const img = new Image();
    img.onload = () => setStrip(img);
    img.onerror = () => errorRef.current?.();
    img.src = url;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [url]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !strip) return;
    const { cols, rows } = reelLayout(frames);
    const w = Math.floor(strip.naturalWidth / cols);
    const h = Math.floor(strip.naturalHeight / rows);
    canvas.width = w;
    canvas.height = h;
    let shown = -1;
    const draw = (now: number) => {
      const f = playing ? Math.floor((now * fps) / 1000) % frames : 0;
      if (f === shown) return;
      shown = f;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(strip, (f % cols) * w, Math.floor(f / cols) * h, w, h, 0, 0, w, h);
    };
    draw(performance.now());
    return playing ? onTick(draw) : undefined;
  }, [strip, frames, fps, playing]);

  return <canvas ref={canvasRef} className={className} />;
}
