import { AlertTriangle, Loader2, RotateCcw, Star } from "lucide-react";
import { memo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/ui/tooltip";
import {
  useCaptureError,
  useCaptureState,
  useCaptureStore,
} from "@/features/viewer/model/captureQueue";
import { thumbUrl } from "@/lib/asset-url";
import type { AssetSummary } from "@/lib/bindings";
import { formatDims, isPixelArt, KIND_META } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  asset: AssetSummary;
  size: number;
  selected: boolean;
  epoch: number;
  onSelect: (id: number) => void;
  onOpen: (id: number) => void;
  onFavorite: (id: number, favorite: boolean) => void;
};

export const AssetTile = memo(function AssetTile({
  asset,
  size,
  selected,
  epoch,
  onSelect,
  onOpen,
  onFavorite,
}: Props) {
  const version = `${asset.mtime}.${epoch}`;
  const [failedVersion, setFailedVersion] = useState<string | null>(null);
  const Icon = KIND_META[asset.kind].icon;
  const pixel = isPixelArt(asset);
  const dims = formatDims(asset);
  const capture = useCaptureState(asset);
  const captureError = useCaptureError(asset.id);
  const showThumb = asset.thumbReady && failedVersion !== version;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keyboard navigation is handled by the grid's window-level hotkeys
    // biome-ignore lint/a11y/useKeyWithClickEvents: same as above
    <div
      data-asset-id={asset.id}
      onClick={() => onSelect(asset.id)}
      onDoubleClick={() => onOpen(asset.id)}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-md bg-iron-900/70 transition-[box-shadow,transform] duration-150",
        selected ? "tile-glow" : "hover:tile-hover shadow-[0_0_0_1px_var(--color-iron-700)]",
      )}
      style={{ width: size }}
    >
      <div
        className="bg-checker-subtle relative flex items-center justify-center overflow-hidden"
        style={{ height: size }}
      >
        {showThumb ? (
          <img
            src={thumbUrl(asset, epoch)}
            alt={asset.name}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setFailedVersion(version)}
            className={cn(
              "max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-[1.04]",
              pixel && "pixelated",
              pixel ? "h-full w-full" : "",
            )}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-dust">
            {capture === "working" ? (
              <Loader2 className="size-7 animate-spin text-ember/70" />
            ) : capture === "failed" ? (
              <AlertTriangle className="size-7 text-arc/80" strokeWidth={1.5} />
            ) : (
              <Icon className="size-8 text-ember/60" strokeWidth={1.25} />
            )}
            {capture === "failed" ? (
              <Hint label={captureError ?? "Thumbnail failed"}>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    useCaptureStore.getState().retry(asset);
                  }}
                  className="flex items-center gap-1 rounded-sm border border-iron-500 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-bone/80 hover:border-ember/70 hover:text-gold"
                >
                  <RotateCcw className="size-3" /> retry
                </button>
              </Hint>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-widest">
                {capture === "noBlender" ? "no blender" : asset.ext}
              </span>
            )}
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-void/70 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

        <div className="absolute top-1.5 left-1.5 flex gap-1">
          {asset.kind !== "image" && (
            <Badge
              variant={asset.kind === "model" || asset.kind === "blend" ? "plasma" : "default"}
            >
              {asset.kind === "aseprite" && asset.frameCount
                ? `${asset.frameCount}f`
                : KIND_META[asset.kind].label}
            </Badge>
          )}
        </div>

        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onFavorite(asset.id, !asset.favorite);
          }}
          className={cn(
            "absolute top-1 right-1 rounded-sm p-1 transition-opacity",
            asset.favorite ? "opacity-100" : "opacity-0 group-hover:opacity-80 hover:!opacity-100",
          )}
        >
          <Star
            className={cn(
              "size-4 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]",
              asset.favorite ? "fill-gold text-gold" : "text-bone",
            )}
          />
        </button>
      </div>

      <div className="flex h-[30px] items-center gap-2 border-t border-iron-700/80 px-2">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[11.5px]",
            selected ? "text-gold" : "text-bone/85",
          )}
          title={asset.relPath}
        >
          {asset.name}
        </span>
        {dims && <span className="shrink-0 font-mono text-[9.5px] text-dust">{dims}</span>}
      </div>
    </div>
  );
});
