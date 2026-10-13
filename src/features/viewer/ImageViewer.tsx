import { Grid3x3 } from "lucide-react";
import { useState } from "react";
import { useHotkeys } from "@/app/hotkeys";
import { fileUrl } from "@/lib/asset-url";
import type { AssetSummary } from "@/lib/bindings";
import { isPixelArt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { PixelGrid, Stage, ZoomReadout } from "./Stage";
import { usePanZoom } from "./usePanZoom";

export function ImageViewer({ asset, onSlice }: { asset: AssetSummary; onSlice?: () => void }) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const smoothing = useUi((s) => s.smoothing);
  const w = asset.width ?? natural?.w ?? 0;
  const h = asset.height ?? natural?.h ?? 0;
  const pixel = isPixelArt(asset) || Math.max(w, h) <= 1024;
  const pz = usePanZoom(w, h, pixel && !smoothing);
  const crisp = !smoothing && (pz.view.zoom >= 1 || isPixelArt(asset));

  useHotkeys({ "0": pz.fit, "1": pz.oneToOne, "+": pz.zoomIn, "=": pz.zoomIn, "-": pz.zoomOut });

  return (
    <Stage ref={pz.containerRef} {...pz.bind} className="cursor-grab active:cursor-grabbing">
      <img
        key={asset.id}
        src={fileUrl(asset)}
        alt={asset.name}
        draggable={false}
        onLoad={(e) =>
          setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
        }
        className={cn(
          "max-w-none select-none shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]",
          crisp && "pixelated",
        )}
        style={pz.contentStyle}
      />
      <PixelGrid zoom={pz.view.zoom} style={pz.contentStyle} />

      <ZoomReadout
        zoom={pz.view.zoom}
        onFit={pz.fit}
        onOneToOne={pz.oneToOne}
        onIn={pz.zoomIn}
        onOut={pz.zoomOut}
      >
        {onSlice && (
          <>
            <span className="mx-1 h-4 w-px bg-iron-500" />
            <button
              type="button"
              onClick={onSlice}
              className="flex h-7 items-center gap-1.5 rounded-sm px-2 text-[11px] text-bone/80 hover:bg-iron-700 hover:text-gold"
            >
              <Grid3x3 className="size-3.5" />
              Slice as sheet
            </button>
          </>
        )}
      </ZoomReadout>
    </Stage>
  );
}
