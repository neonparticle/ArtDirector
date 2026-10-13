import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eraser, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "@/app/hotkeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { fileUrl } from "@/lib/asset-url";
import { type AssetSummary, commands, type SheetFrame, type SheetMeta } from "@/lib/bindings";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { PlaybackBar } from "./PlaybackBar";
import { Stage, ZoomReadout } from "./Stage";
import { type Direction, useFramePlayer } from "./useFramePlayer";
import { usePanZoom } from "./usePanZoom";

type GridDraft = {
  by: "count" | "size";
  cols: number;
  rows: number;
  frameW: number;
  frameH: number;
};

function guessGrid(w: number, h: number): GridDraft {
  // Most game sheets use square cells sized to the shorter side or a power of two.
  const side = [16, 24, 32, 48, 64, 96, 128].find((s) => w % s === 0 && h % s === 0 && w / s > 1);
  const cell = side ?? Math.min(w, h);
  return {
    by: "size",
    frameW: cell,
    frameH: cell,
    cols: Math.max(1, Math.floor(w / cell)),
    rows: Math.max(1, Math.floor(h / cell)),
  };
}

function gridFrames(d: GridDraft, w: number, h: number): SheetFrame[] {
  const fw = d.by === "size" ? d.frameW : Math.floor(w / Math.max(1, d.cols));
  const fh = d.by === "size" ? d.frameH : Math.floor(h / Math.max(1, d.rows));
  if (fw <= 0 || fh <= 0) return [];
  const cols = Math.floor(w / fw);
  const rows = Math.floor(h / fh);
  const frames: SheetFrame[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++)
      frames.push({
        x: c * fw,
        y: r * fh,
        w: fw,
        h: fh,
        offsetX: 0,
        offsetY: 0,
        sourceW: fw,
        sourceH: fh,
        duration: null,
      });
  }
  return frames;
}

export function SpriteSheetViewer({ asset }: { asset: AssetSummary }) {
  const qc = useQueryClient();
  const info = useQuery({
    queryKey: qk.sheet(asset.id),
    queryFn: () => commands.sheetInfo(asset.id),
  });
  const w = asset.width ?? 0;
  const h = asset.height ?? 0;
  const meta = info.data?.meta ?? null;
  const fromJson = meta != null && meta.mode !== "grid";

  const [draft, setDraft] = useState<GridDraft>(() => guessGrid(w, h));
  const [fps, setFps] = useState(8);
  const [speed, setSpeed] = useState(1);
  const [tag, setTag] = useState<number | null>(null);
  const [row, setRow] = useState<number | null>(null);

  useEffect(() => {
    if (!info.data) return;
    const m = info.data.meta;
    if (m?.mode === "grid") {
      setDraft({
        by: m.frameW ? "size" : "count",
        frameW: m.frameW ?? Math.floor(w / (m.cols || 1)),
        frameH: m.frameH ?? Math.floor(h / (m.rows || 1)),
        cols: m.cols ?? Math.floor(w / (m.frameW || w)),
        rows: m.rows ?? Math.floor(h / (m.frameH || h)),
      });
    } else if (!m) {
      setDraft(guessGrid(w, h));
    }
    if (m?.fps) setFps(m.fps);
  }, [info.data, w, h]);

  const allFrames = useMemo(
    () => (fromJson ? (info.data?.frames ?? []) : gridFrames(draft, w, h)),
    [fromJson, info.data, draft, w, h],
  );
  const cols = useMemo(() => {
    if (fromJson || allFrames.length === 0) return allFrames.length;
    return Math.max(1, Math.floor(w / allFrames[0].w));
  }, [fromJson, allFrames, w]);
  const rowCount = fromJson ? 0 : Math.ceil(allFrames.length / Math.max(1, cols));

  const tags = info.data?.tags ?? [];
  const activeTag = tag != null ? tags[tag] : undefined;
  let from = 0;
  let to = Math.max(0, allFrames.length - 1);
  if (activeTag) {
    from = activeTag.from;
    to = Math.min(activeTag.to, to);
  } else if (row != null && !fromJson) {
    from = row * cols;
    to = Math.min(from + cols - 1, allFrames.length - 1);
  }

  const player = useFramePlayer({
    from,
    to,
    direction: (activeTag?.direction as Direction) ?? "forward",
    durationOf: (f) => allFrames[f]?.duration ?? 1000 / Math.max(1, fps),
    speed,
  });
  const current = allFrames[player.frame];

  const pz = usePanZoom(w, h, true);
  useHotkeys({
    " ": player.toggle,
    ",": () => player.step(-1),
    ".": () => player.step(1),
    "0": pz.fit,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.sheet(asset.id) });
    qc.invalidateQueries({ queryKey: qk.assetsAll });
    qc.invalidateQueries({ queryKey: qk.asset(asset.id) });
    qc.invalidateQueries({ queryKey: qk.kindsAll });
  };
  const save = useMutation({
    mutationFn: () => {
      const next: SheetMeta = fromJson
        ? { ...(meta as SheetMeta), fps }
        : {
            mode: "grid",
            cols: draft.by === "count" ? draft.cols : null,
            rows: draft.by === "count" ? draft.rows : null,
            frameW: draft.by === "size" ? draft.frameW : null,
            frameH: draft.by === "size" ? draft.frameH : null,
            fps,
            sourceJson: null,
          };
      return commands.saveSheet(asset.id, next);
    },
    onSuccess: invalidate,
  });
  const clear = useMutation({
    mutationFn: () => commands.clearSheet(asset.id),
    onSuccess: invalidate,
  });

  return (
    <div className="flex h-full">
      <Stage
        ref={pz.containerRef}
        {...pz.bind}
        className="flex-1 cursor-grab active:cursor-grabbing"
      >
        <div style={pz.contentStyle}>
          <img
            src={fileUrl(asset)}
            alt={asset.name}
            draggable={false}
            className="pixelated absolute inset-0 size-full max-w-none"
          />
          <svg
            className="pointer-events-none absolute inset-0 size-full"
            viewBox={`0 0 ${w || 1} ${h || 1}`}
            preserveAspectRatio="none"
            aria-hidden
          >
            {allFrames.map((f, i) => {
              const inRange = i >= from && i <= to;
              return (
                <rect
                  // biome-ignore lint/suspicious/noArrayIndexKey: frames are positional
                  key={i}
                  x={f.x}
                  y={f.y}
                  width={f.w}
                  height={f.h}
                  fill={i === player.frame ? "rgba(196,84,40,0.22)" : "transparent"}
                  stroke={
                    i === player.frame
                      ? "#e8aa00"
                      : inRange
                        ? "rgba(196,84,40,0.75)"
                        : "rgba(122,110,88,0.35)"
                  }
                  strokeWidth={i === player.frame ? 2 : 1}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
        </div>
        <ZoomReadout
          zoom={pz.view.zoom}
          onFit={pz.fit}
          onOneToOne={pz.oneToOne}
          onIn={pz.zoomIn}
          onOut={pz.zoomOut}
        />
      </Stage>

      <aside className="flex w-80 shrink-0 flex-col gap-5 overflow-y-auto border-l border-iron-700 bg-iron-950/90 p-4">
        <div>
          <Label>Preview</Label>
          <FramePreview src={fileUrl(asset)} frame={current} />
          <PlaybackBar
            className="mt-2 flex-wrap justify-center"
            frame={player.frame}
            from={from}
            to={to}
            playing={player.playing}
            speed={speed}
            onToggle={player.toggle}
            onStep={player.step}
            onSeek={(f) => {
              player.setPlaying(false);
              player.seek(f);
            }}
            onSpeed={setSpeed}
          />
        </div>

        {tags.length > 0 && (
          <div className="grid gap-2">
            <Label>Animations</Label>
            <div className="flex flex-wrap gap-1">
              <Chip active={tag == null} onClick={() => setTag(null)}>
                All
              </Chip>
              {tags.map((t, i) => (
                <Chip key={`${t.name}-${t.from}`} active={tag === i} onClick={() => setTag(i)}>
                  {t.name}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {!fromJson && rowCount > 1 && (
          <div className="grid gap-2">
            <Label>Row</Label>
            <div className="flex flex-wrap gap-1">
              <Chip active={row == null} onClick={() => setRow(null)}>
                All
              </Chip>
              {Array.from({ length: rowCount }, (_, r) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
                <Chip key={r} active={row === r} onClick={() => setRow(r)}>
                  {r + 1}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {!activeTag && !allFrames.some((f) => f.duration != null) && (
          <div className="grid gap-2">
            <Label>
              Frame rate <span className="ml-auto font-mono text-gold">{fps} fps</span>
            </Label>
            <Slider min={1} max={30} step={1} value={[fps]} onValueChange={([v]) => setFps(v)} />
          </div>
        )}

        {fromJson ? (
          <p className="rounded-md border border-iron-700 bg-void/50 p-3 text-xs text-dust">
            Frames come from{" "}
            <span className="font-mono text-bone/80" data-selectable>
              {meta?.sourceJson}
            </span>{" "}
            ({meta?.mode === "asepriteJson" ? "Aseprite export" : "atlas JSON"}).
          </p>
        ) : (
          <div className="grid gap-3">
            <Label>Slice grid</Label>
            <div className="flex rounded-md border border-iron-700 p-0.5">
              {(["size", "count"] as const).map((by) => (
                <button
                  key={by}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, by }))}
                  className={cn(
                    "h-7 flex-1 rounded-sm text-xs transition-colors",
                    draft.by === by ? "bg-rust/50 text-gold" : "text-dust hover:text-bone",
                  )}
                >
                  {by === "size" ? "By cell size" : "By count"}
                </button>
              ))}
            </div>
            {draft.by === "size" ? (
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Cell W"
                  value={draft.frameW}
                  onChange={(frameW) => setDraft((d) => ({ ...d, frameW }))}
                />
                <NumberField
                  label="Cell H"
                  value={draft.frameH}
                  onChange={(frameH) => setDraft((d) => ({ ...d, frameH }))}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Columns"
                  value={draft.cols}
                  onChange={(cols) => setDraft((d) => ({ ...d, cols }))}
                />
                <NumberField
                  label="Rows"
                  value={draft.rows}
                  onChange={(rows) => setDraft((d) => ({ ...d, rows }))}
                />
              </div>
            )}
            <p className="font-mono text-[10px] text-dust">
              {allFrames.length} frames · {allFrames[0]?.w ?? 0}×{allFrames[0]?.h ?? 0} px
            </p>
          </div>
        )}

        <div className="mt-auto flex gap-2">
          <Button
            className="flex-1"
            size="sm"
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            <Save />
            {meta ? "Save sheet" : "Mark as sheet"}
          </Button>
          {meta && !fromJson && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => clear.mutate()}
              title="Not a sprite sheet"
            >
              <Eraser />
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}

function FramePreview({ src, frame }: { src: string; frame: SheetFrame | undefined }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = src;
  }, [src]);
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !img || !frame) return;
    c.width = frame.sourceW;
    c.height = frame.sourceH;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(
      img,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      frame.offsetX,
      frame.offsetY,
      frame.w,
      frame.h,
    );
  }, [img, frame]);

  return (
    <div className="bg-checker mt-2 flex h-56 items-center justify-center overflow-hidden rounded-md border border-iron-700">
      <canvas
        ref={canvas}
        className="pixelated max-h-full max-w-full"
        style={{ height: "85%", objectFit: "contain" }}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="grid gap-1">
      <span className="text-[10px] uppercase tracking-wider text-dust">{label}</span>
      <Input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
        className="h-8 font-mono text-xs"
      />
    </div>
  );
}

function Chip({
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
        "h-6 rounded-sm border px-2 text-[11px] transition-colors",
        active
          ? "border-ember/60 bg-rust/40 text-gold"
          : "border-iron-700 text-bone/70 hover:border-iron-500",
      )}
    >
      {children}
    </button>
  );
}
