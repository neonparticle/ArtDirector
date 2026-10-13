import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "@/app/hotkeys";
import { derivedUrl } from "@/lib/asset-url";
import { type AssetSummary, commands } from "@/lib/bindings";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { PlaybackBar } from "./PlaybackBar";
import { PixelGrid, Stage, ZoomReadout } from "./Stage";
import { type Direction, useFramePlayer } from "./useFramePlayer";
import { usePanZoom } from "./usePanZoom";

export function AsepriteViewer({ asset }: { asset: AssetSummary }) {
  const info = useQuery({
    queryKey: qk.aseprite(asset.id, asset.mtime),
    queryFn: () => commands.asepriteInfo(asset.id),
  });
  const [strip, setStrip] = useState<HTMLImageElement | null>(null);
  const [tag, setTag] = useState<number | null>(null);
  const [speed, setSpeed] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setStrip(null);
    const img = new Image();
    img.onload = () => setStrip(img);
    img.src = derivedUrl(asset, "strip");
  }, [asset]);

  const data = info.data;
  const frames = data?.durations.length ?? 1;
  const activeTag = tag != null ? data?.tags[tag] : undefined;
  const from = activeTag?.from ?? 0;
  const to = Math.min(activeTag?.to ?? frames - 1, frames - 1);
  const player = useFramePlayer({
    from,
    to,
    direction: (activeTag?.direction as Direction) ?? "forward",
    durationOf: (f) => data?.durations[f] ?? 100,
    speed,
  });
  const pz = usePanZoom(data?.width ?? 0, data?.height ?? 0, true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !data || !strip) return;
    const { width: w, height: h, cols } = data;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    const f = player.frame;
    ctx.drawImage(strip, (f % cols) * w, Math.floor(f / cols) * h, w, h, 0, 0, w, h);
  }, [data, strip, player.frame]);

  useHotkeys({
    " ": player.toggle,
    ",": () => player.step(-1),
    ".": () => player.step(1),
    "0": pz.fit,
    "1": pz.oneToOne,
  });

  if (info.error) {
    return (
      <Stage>
        <p className="absolute inset-0 flex items-center justify-center text-sm text-arc">
          {String(info.error)}
        </p>
      </Stage>
    );
  }

  return (
    <Stage ref={pz.containerRef} {...pz.bind} className="cursor-grab active:cursor-grabbing">
      {(!data || !strip) && (
        <Loader2 className="absolute top-1/2 left-1/2 size-8 -translate-1/2 animate-spin text-ember" />
      )}
      {data && (
        <canvas
          ref={canvasRef}
          width={data.width}
          height={data.height}
          className={cn("pixelated", !strip && "opacity-0")}
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

      {data && (
        <div
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {data.tags.length > 0 && (
            <div className="forge-panel flex max-w-[60vw] flex-wrap justify-center gap-1 rounded-md p-1">
              <TagButton active={tag == null} onClick={() => setTag(null)}>
                All frames
              </TagButton>
              {data.tags.map((t, i) => (
                <TagButton key={`${t.name}-${t.from}`} active={tag === i} onClick={() => setTag(i)}>
                  {t.name}
                  <span className="ml-1 font-mono text-[9px] text-dust">
                    {t.from}–{t.to}
                  </span>
                </TagButton>
              ))}
            </div>
          )}
          <PlaybackBar
            frame={player.frame}
            from={from}
            to={to}
            playing={player.playing}
            speed={speed}
            duration={data.durations[player.frame]}
            onToggle={player.toggle}
            onStep={player.step}
            onSeek={(f) => {
              player.setPlaying(false);
              player.seek(f);
            }}
            onSpeed={setSpeed}
          >
            <span className="px-1 font-mono text-[10px] text-dust">
              {data.layers.length} layers
            </span>
          </PlaybackBar>
        </div>
      )}
    </Stage>
  );
}

function TagButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-6 items-center rounded-sm px-2 text-[11px] transition-colors",
        active ? "bg-rust/50 text-gold" : "text-bone/70 hover:bg-iron-700 hover:text-bone",
      )}
    >
      {children}
    </button>
  );
}
