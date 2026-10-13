import {
  ChevronLeft,
  ChevronRight,
  Grid2x2,
  MoreHorizontal,
  PanelRight,
  Pipette,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useHotkeys } from "@/app/hotkeys";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Hint } from "@/components/ui/tooltip";
import { useAssetDetail, useAssets, useToggleFavorite } from "@/features/gallery/useAssets";
import { relUrl, siblingUrl } from "@/lib/asset-url";
import type { AssetSummary } from "@/lib/bindings";
import { KIND_META } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type StageBackground, useUi } from "@/stores/ui";
import { AsepriteViewer } from "./AsepriteViewer";
import { Shortcut, useAssetActions } from "./AssetActions";
import { BlendViewer } from "./BlendViewer";
import { copyImage } from "./copyImage";
import { ImageViewer } from "./ImageViewer";
import { InfoPanel } from "./InfoPanel";
import { ModelViewer } from "./ModelViewer";
import type { ModelFormat } from "./model/loadModel";
import { SourceViewer } from "./SourceViewer";
import { SpriteSheetViewer } from "./SpriteSheetViewer";

export function ViewerRouter() {
  const selectedId = useUi((s) => s.selectedId);
  const infoOpen = useUi((s) => s.infoOpen);
  const { select, closeViewer, toggleInfo } = useUi.getState();
  const { data: list = [] } = useAssets();
  const { data: detail } = useAssetDetail(selectedId);
  const favorite = useToggleFavorite();

  const index = list.findIndex((a) => a.id === selectedId);
  const asset: AssetSummary | undefined =
    list[index] ?? (detail?.asset.id === selectedId ? detail?.asset : undefined);

  const step = (delta: number) => {
    if (list.length === 0) return;
    const next = (Math.max(index, 0) + delta + list.length) % list.length;
    select(list[next].id);
  };

  useHotkeys({
    Escape: closeViewer,
    ArrowLeft: () => step(-1),
    ArrowRight: () => step(1),
    f: () => asset && favorite.mutate({ id: asset.id, favorite: !asset.favorite }),
    i: toggleInfo,
    "mod+c": () => asset && asset.kind !== "source" && copyImage(asset),
  });

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-void/96 backdrop-blur-sm"
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
    >
      <Toolbar
        asset={asset}
        absPath={detail?.absPath}
        position={index >= 0 ? `${index + 1} / ${list.length}` : null}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onFavorite={() => asset && favorite.mutate({ id: asset.id, favorite: !asset.favorite })}
      />
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {asset && <KindViewer key={asset.id} asset={asset} />}
        </div>
        {infoOpen && <InfoPanel embedded />}
      </div>
    </motion.div>
  );
}

function KindViewer({ asset }: { asset: AssetSummary }) {
  const [slicing, setSlicing] = useState(false);

  switch (asset.kind) {
    case "image":
      return slicing ? (
        <SpriteSheetViewer asset={asset} />
      ) : (
        <ImageViewer asset={asset} onSlice={() => setSlicing(true)} />
      );
    case "sheet":
      return <SpriteSheetViewer asset={asset} />;
    case "aseprite":
      return <AsepriteViewer asset={asset} />;
    case "model": {
      const stem = asset.name.replace(/\.[^.]+$/, "");
      return (
        <ModelViewer
          assetId={asset.id}
          url={relUrl(asset)}
          format={asset.ext as ModelFormat}
          mtlUrl={asset.ext === "obj" ? siblingUrl(asset, `${stem}.mtl`) : undefined}
        />
      );
    }
    case "blend":
      return <BlendViewer asset={asset} />;
    case "source":
      return <SourceViewer asset={asset} />;
  }
}

const BACKDROPS: { id: StageBackground; label: string; swatch: string }[] = [
  { id: "checker", label: "Checker", swatch: "bg-checker" },
  { id: "void", label: "Void", swatch: "bg-void" },
  { id: "bone", label: "Bone", swatch: "bg-bone" },
];

function Toolbar({
  asset,
  absPath,
  position,
  onPrev,
  onNext,
  onFavorite,
}: {
  asset: AssetSummary | undefined;
  absPath: string | undefined;
  position: string | null;
  onPrev: () => void;
  onNext: () => void;
  onFavorite: () => void;
}) {
  const ui = useUi();
  const actions = useAssetActions(asset, absPath);
  const Icon = asset ? KIND_META[asset.kind].icon : null;
  const flat = asset?.kind !== "model" && asset?.kind !== "blend";

  return (
    <header className="relative z-10 flex h-12 shrink-0 items-center gap-2 border-b border-iron-700 bg-iron-950/90 px-2">
      <Hint label="Close (Esc)">
        <Button variant="ghost" size="icon-sm" onClick={ui.closeViewer}>
          <X />
        </Button>
      </Hint>
      <div className="flex items-center">
        <Hint label="Previous (←)">
          <Button variant="ghost" size="icon-sm" onClick={onPrev}>
            <ChevronLeft />
          </Button>
        </Hint>
        <Hint label="Next (→)">
          <Button variant="ghost" size="icon-sm" onClick={onNext}>
            <ChevronRight />
          </Button>
        </Hint>
      </div>
      {position && (
        <span className="font-mono text-[10.5px] text-dust tabular-nums">{position}</span>
      )}

      <div className="mx-2 flex min-w-0 flex-1 items-center gap-2">
        {Icon && <Icon className="size-4 shrink-0 text-ember" />}
        <span className="truncate font-display text-xl text-bone">{asset?.name}</span>
        <span className="hidden truncate font-mono text-[10.5px] text-dust lg:inline">
          {asset?.dir}
        </span>
      </div>

      <div className="flex items-center gap-1 rounded-md border border-iron-700 bg-iron-900/70 p-1">
        {BACKDROPS.map((b) => (
          <Hint key={b.id} label={b.label}>
            <button
              type="button"
              onClick={() => ui.setStageBg(b.id)}
              className={cn(
                "size-5 rounded-sm border",
                b.swatch,
                ui.stageBg === b.id ? "border-gold ring-1 ring-gold/50" : "border-iron-500",
              )}
            />
          </Hint>
        ))}
        <Hint label="Custom color">
          <label
            className={cn(
              "relative flex size-5 cursor-pointer items-center justify-center rounded-sm border",
              ui.stageBg === "custom" ? "border-gold ring-1 ring-gold/50" : "border-iron-500",
            )}
            style={{ backgroundColor: ui.customBg }}
          >
            <Pipette className="size-3 text-bone mix-blend-difference" />
            <input
              type="color"
              value={ui.customBg}
              onChange={(e) => ui.setCustomBg(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </Hint>
      </div>

      {flat && (
        <>
          <Hint label="Pixel grid (visible at 6× and up)">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={ui.togglePixelGrid}
              className={cn(ui.pixelGrid && "bg-rust/40 text-gold")}
            >
              <Grid2x2 />
            </Button>
          </Hint>
          <Hint label="Smooth scaling">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={ui.toggleSmoothing}
              className={cn(ui.smoothing && "bg-rust/40 text-gold")}
            >
              <Sparkles />
            </Button>
          </Hint>
        </>
      )}

      <Hint label="Favorite (F)">
        <Button variant="ghost" size="icon-sm" onClick={onFavorite}>
          <Star className={cn(asset?.favorite && "fill-gold text-gold")} />
        </Button>
      </Hint>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {actions.map((a) => (
            <DropdownMenuItem key={a.id} onSelect={a.run}>
              {a.icon}
              {a.label}
              {a.shortcut && <Shortcut keys={a.shortcut} />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Hint label="Info panel (I)">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={ui.toggleInfo}
          className={cn(ui.infoOpen && "bg-rust/40 text-gold")}
        >
          <PanelRight />
        </Button>
      </Hint>
    </header>
  );
}
