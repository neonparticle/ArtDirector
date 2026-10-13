import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import type { ReactNode } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const SPEEDS = [0.25, 0.5, 1, 2];

export function PlaybackBar({
  frame,
  from,
  to,
  playing,
  speed,
  duration,
  onToggle,
  onStep,
  onSeek,
  onSpeed,
  children,
  className,
}: {
  frame: number;
  from: number;
  to: number;
  playing: boolean;
  speed: number;
  duration?: number;
  onToggle: () => void;
  onStep: (delta: number) => void;
  onSeek: (frame: number) => void;
  onSpeed: (speed: number) => void;
  children?: ReactNode;
  className?: string;
}) {
  const iconBtn =
    "flex size-8 items-center justify-center rounded-sm text-bone/80 transition-colors hover:bg-iron-700 hover:text-gold";
  return (
    <div
      className={cn(
        "forge-panel flex items-center gap-2 rounded-md px-2 py-1.5 shadow-lg backdrop-blur",
        className,
      )}
    >
      <button
        type="button"
        className={iconBtn}
        onClick={() => onStep(-1)}
        title="Previous frame (,)"
      >
        <SkipBack className="size-4" />
      </button>
      <button
        type="button"
        className={cn(iconBtn, "text-ember")}
        onClick={onToggle}
        title="Play / pause (Space)"
      >
        {playing ? (
          <Pause className="size-4 fill-current" />
        ) : (
          <Play className="size-4 fill-current" />
        )}
      </button>
      <button type="button" className={iconBtn} onClick={() => onStep(1)} title="Next frame (.)">
        <SkipForward className="size-4" />
      </button>

      <Slider
        className="mx-2 w-48"
        min={from}
        max={Math.max(from, to)}
        step={1}
        value={[frame]}
        onValueChange={([v]) => onSeek(v)}
        disabled={from === to}
      />
      <span className="w-24 font-mono text-[11px] text-bone/80 tabular-nums">
        {frame - from + 1}/{to - from + 1}
        {duration != null && <span className="ml-1.5 text-dust">{Math.round(duration)}ms</span>}
      </span>

      <div className="flex items-center rounded-sm border border-iron-700">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeed(s)}
            className={cn(
              "h-6 px-1.5 font-mono text-[10px] transition-colors",
              s === speed ? "bg-rust/50 text-gold" : "text-dust hover:text-bone",
            )}
          >
            {s}×
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
