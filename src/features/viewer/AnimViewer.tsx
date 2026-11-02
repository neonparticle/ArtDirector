import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "@/app/hotkeys";
import { derivedUrl } from "@/lib/asset-url";
import { type AssetSummary, commands } from "@/lib/bindings";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { notify } from "@/stores/notice";
import { useFrameSource } from "./copyImage";
import { PlaybackBar } from "./PlaybackBar";
import { DEFAULT_FPS, reelLayout } from "./Reel";
import { PixelGrid, Stage, ZoomReadout } from "./Stage";
import { useFramePlayer } from "./useFramePlayer";
import { usePanZoom } from "./usePanZoom";

const MAX_FPS = 60;

export function AnimViewer({ asset }: { asset: AssetSummary }) {
  const qc = useQueryClient();
  const url = derivedUrl(asset, "strip");
  const [strip, setStrip] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [speed, setSpeed] = useState(1);
  const savedFps = asset.fps ?? DEFAULT_FPS;
  const [fps, setFps] = useState(savedFps);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setStrip(null);
    setFailed(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setStrip(img);
    img.onerror = () => setFailed(true);
    img.src = url;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [url]);

  const frames = Math.max(1, asset.frameCount ?? 1);
  const { cols, rows } = reelLayout(frames);
  const cellW = strip ? Math.floor(strip.naturalWidth / cols) : (asset.width ?? 0);
  const cellH = strip ? Math.floor(strip.naturalHeight / rows) : (asset.height ?? 0);

  const player = useFramePlayer({
    from: 0,
    to: frames - 1,
    direction: "forward",
    durationOf: () => 1000 / fps,
    speed,
  });
  const pz = usePanZoom(cellW, cellH, true);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !strip) return;
    const f = player.frame;
    ctx.clearRect(0, 0, cellW, cellH);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      strip,
      (f % cols) * cellW,
      Math.floor(f / cols) * cellH,
      cellW,
      cellH,
      0,
      0,
      cellW,
      cellH,
    );
  }, [strip, player.frame, cols, cellW, cellH]);

  useFrameSource(asset.id, () =>
    strip ? (canvasRef.current?.toDataURL("image/png") ?? null) : null,
  );

  const { mutate: persistFps } = useMutation({
    mutationFn: (v: number) => commands.setAnimFps(asset.id, v),
    onSuccess: (_, v) => {
      qc.setQueriesData<AssetSummary[]>({ queryKey: qk.assetsAll }, (list) =>
        list?.map((a) => (a.id === asset.id ? { ...a, fps: v } : a)),
      );
      qc.invalidateQueries({ queryKey: qk.asset(asset.id) });
    },
    onError: (e) => notify(`Could not save frame rate: ${String(e)}`, "error"),
  });
  // Stepping through rates with the buttons or [ ] saves once the clicking stops.
  useEffect(() => {
    if (fps === savedFps) return;
    const t = setTimeout(() => persistFps(fps), 400);
    return () => clearTimeout(t);
  }, [fps, savedFps, persistFps]);
  const nudgeFps = (delta: number) =>
    setFps((f) => Math.min(MAX_FPS, Math.max(1, Math.round(f) + delta)));

  useHotkeys({
    " ": player.toggle,
    ",": () => player.step(-1),
    ".": () => player.step(1),
    "[": () => nudgeFps(-1),
    "]": () => nudgeFps(1),
    "0": pz.fit,
    "1": pz.oneToOne,
  });

  if (failed) {
    return (
      <Stage>
        <p className="absolute inset-0 flex items-center justify-center text-sm text-arc">
          Could not load the frames in {asset.relPath}
        </p>
      </Stage>
    );
  }

  return (
    <Stage ref={pz.containerRef} {...pz.bind} className="cursor-grab active:cursor-grabbing">
      {!strip && (
        <Loader2 className="absolute top-1/2 left-1/2 size-8 -translate-1/2 animate-spin text-ember" />
      )}
      {strip && (
        <canvas
          ref={canvasRef}
          width={cellW}
          height={cellH}
          className="pixelated"
          style={pz.contentStyle}
        />
      )}
      <PixelGrid zoom={pz.view.zoom} style={pz.contentStyle} />

      <ZoomReadout
        zoom={pz.view.zoom}
        onFit={pz.fit}
        onOneToOne={pz.oneToOne}
        onIn={pz.zoomIn}
        onOut={pz.zoomOut}
      />

      {strip && (
        <div
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="forge-panel flex max-w-[60vw] gap-1 overflow-x-auto rounded-md p-1">
            {Array.from({ length: frames }, (_, i) => (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: frames are positional
                key={i}
                type="button"
                title={`Frame ${i + 1}`}
                onClick={() => {
                  player.setPlaying(false);
                  player.seek(i);
                }}
                className={cn(
                  "pixelated h-10 shrink-0 rounded-sm border bg-no-repeat transition-colors",
                  i === player.frame ? "border-gold" : "border-iron-700 hover:border-iron-500",
                )}
                style={{
                  aspectRatio: `${cellW} / ${cellH}`,
                  backgroundImage: `url("${url}")`,
                  backgroundSize: `${cols * 100}% ${rows * 100}%`,
                  backgroundPosition: `${cols > 1 ? ((i % cols) / (cols - 1)) * 100 : 0}% ${
                    rows > 1 ? (Math.floor(i / cols) / (rows - 1)) * 100 : 0
                  }%`,
                }}
              />
            ))}
          </div>
          <PlaybackBar
            frame={player.frame}
            from={0}
            to={frames - 1}
            playing={player.playing}
            speed={speed}
            duration={1000 / fps}
            onToggle={player.toggle}
            onStep={player.step}
            onSeek={(f) => {
              player.setPlaying(false);
              player.seek(f);
            }}
            onSpeed={setSpeed}
          >
            <FpsControl fps={fps} onNudge={nudgeFps} />
          </PlaybackBar>
        </div>
      )}
    </Stage>
  );
}

function FpsControl({ fps, onNudge }: { fps: number; onNudge: (delta: number) => void }) {
  const btn =
    "flex size-6 items-center justify-center rounded-sm text-dust transition-colors hover:bg-iron-700 hover:text-gold disabled:opacity-40";
  return (
    <div
      className="flex items-center gap-0.5 border-l border-iron-700 pl-2"
      title="Frame rate, saved for this animation ([ and ])"
    >
      <button type="button" className={btn} onClick={() => onNudge(-1)} disabled={fps <= 1}>
        <Minus className="size-3" />
      </button>
      <span className="w-12 text-center font-mono text-[11px] text-gold tabular-nums">
        {+fps.toFixed(1)} fps
      </span>
      <button type="button" className={btn} onClick={() => onNudge(1)} disabled={fps >= MAX_FPS}>
        <Plus className="size-3" />
      </button>
    </div>
  );
}
