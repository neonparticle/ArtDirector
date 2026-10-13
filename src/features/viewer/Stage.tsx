import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";

/** The viewer canvas area, painted with the user's chosen backdrop. */
export const Stage = forwardRef<
  HTMLDivElement,
  { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>
>(function Stage({ children, className, style, ...rest }, ref) {
  const bg = useUi((s) => s.stageBg);
  const custom = useUi((s) => s.customBg);
  return (
    <div
      ref={ref}
      className={cn(
        "relative h-full w-full overflow-hidden",
        bg === "checker" && "bg-checker",
        bg === "void" && "bg-void",
        bg === "bone" && "bg-bone",
        className,
      )}
      style={{ ...(bg === "custom" ? { backgroundColor: custom } : null), ...style }}
      {...rest}
    >
      {bg === "void" && <div className="forge-grid pointer-events-none absolute inset-0" />}
      {children}
    </div>
  );
});

/** Pixel grid drawn over content when zoomed far enough to see individual pixels. */
export function PixelGrid({ zoom, style }: { zoom: number; style: React.CSSProperties }) {
  const enabled = useUi((s) => s.pixelGrid);
  if (!enabled || zoom < 6) return null;
  return (
    <div
      className="pointer-events-none"
      style={{
        ...style,
        backgroundImage:
          "linear-gradient(to right, rgba(0,0,0,0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.35) 1px, transparent 1px)",
        backgroundSize: `${zoom}px ${zoom}px`,
      }}
    />
  );
}

export function ZoomReadout({
  zoom,
  onFit,
  onOneToOne,
  onIn,
  onOut,
  children,
}: {
  zoom: number;
  onFit: () => void;
  onOneToOne: () => void;
  onIn: () => void;
  onOut: () => void;
  children?: ReactNode;
}) {
  const btn =
    "h-7 rounded-sm px-2 font-mono text-[11px] text-bone/80 transition-colors hover:bg-iron-700 hover:text-gold";
  return (
    <div className="forge-panel absolute bottom-4 left-4 z-10 flex items-center gap-0.5 rounded-md p-1 shadow-lg backdrop-blur">
      <button type="button" className={btn} onClick={onOut}>
        −
      </button>
      <span className="w-14 text-center font-mono text-[11px] text-gold tabular-nums">
        {zoom >= 1 ? `${+zoom.toFixed(2)}×` : `${Math.round(zoom * 100)}%`}
      </span>
      <button type="button" className={btn} onClick={onIn}>
        +
      </button>
      <span className="mx-1 h-4 w-px bg-iron-500" />
      <button type="button" className={btn} onClick={onFit} title="Fit (0)">
        Fit
      </button>
      <button type="button" className={btn} onClick={onOneToOne} title="Actual size (1)">
        1:1
      </button>
      {children}
    </div>
  );
}
