import { Maximize2, Plus, Star, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAssetDetail, useTagMutations, useToggleFavorite } from "@/features/gallery/useAssets";
import { thumbUrl } from "@/lib/asset-url";
import type { AssetDetail } from "@/lib/bindings";
import { formatBytes, formatDate, formatDims, isPixelArt, KIND_META } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { ActionList, useAssetActions } from "./AssetActions";

export function InfoPanel({ embedded = false }: { embedded?: boolean }) {
  const selectedId = useUi((s) => s.selectedId);
  const { data: detail } = useAssetDetail(selectedId);

  return (
    <aside
      className={cn(
        "relative z-10 flex w-80 shrink-0 flex-col overflow-y-auto border-l border-iron-700",
        embedded ? "bg-iron-950/95" : "bg-iron-950/70",
      )}
    >
      {detail && detail.asset.id === selectedId ? (
        <Details detail={detail} embedded={embedded} />
      ) : (
        <div className="forge-dotgrid flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-dust">
          <p className="font-display text-2xl text-bone/70">Nothing selected</p>
          <p className="text-xs">
            Pick a piece to inspect it. Double-click or press Enter to open.
          </p>
        </div>
      )}
    </aside>
  );
}

function Details({ detail, embedded }: { detail: AssetDetail; embedded: boolean }) {
  const { asset } = detail;
  const epoch = useUi((s) => s.thumbEpoch);
  const openViewer = useUi((s) => s.openViewer);
  const favorite = useToggleFavorite();
  const actions = useAssetActions(asset, detail.absPath);
  const meta = KIND_META[asset.kind];
  const dims = formatDims(asset);

  const rows: [string, string | null][] = [
    ["Kind", meta.label],
    ["Format", asset.ext.toUpperCase()],
    ["Dimensions", dims],
    ["Frames", asset.frameCount ? String(asset.frameCount) : null],
    ["File size", formatBytes(asset.size)],
    ["Modified", formatDate(asset.mtime)],
    ["Project", detail.projectName],
    [
      "Duplicates",
      detail.duplicates > 0
        ? `${detail.duplicates} other cop${detail.duplicates > 1 ? "ies" : "y"}`
        : null,
    ],
    [
      "Sheet",
      detail.sheet
        ? detail.sheet.mode === "grid"
          ? "manual grid"
          : detail.sheet.mode === "asepriteJson"
            ? "Aseprite JSON"
            : "atlas JSON"
        : null,
    ],
  ];

  return (
    <div className="flex flex-col gap-5 p-4">
      {!embedded && (
        <button
          type="button"
          onClick={() => openViewer(asset.id)}
          className="group bg-checker relative flex aspect-square items-center justify-center overflow-hidden rounded-md border border-iron-700"
        >
          {asset.thumbReady ? (
            <img
              src={thumbUrl(asset, epoch)}
              alt=""
              className={cn(
                "max-h-full max-w-full object-contain",
                isPixelArt(asset) && "pixelated size-full",
              )}
            />
          ) : (
            <meta.icon className="size-12 text-ember/50" strokeWidth={1.25} />
          )}
          <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-sm bg-void/80 px-2 py-1 text-[11px] text-bone opacity-0 transition-opacity group-hover:opacity-100">
            <Maximize2 className="size-3" /> Open
          </span>
        </button>
      )}

      <div>
        <div className="flex items-start gap-2">
          <h3
            className="min-w-0 flex-1 font-display text-2xl leading-tight break-words text-bone"
            data-selectable
          >
            {asset.name}
          </h3>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => favorite.mutate({ id: asset.id, favorite: !asset.favorite })}
            title="Favorite (F)"
          >
            <Star className={cn(asset.favorite ? "fill-gold text-gold" : "text-dust")} />
          </Button>
        </div>
        <p className="mt-1 font-mono text-[10.5px] break-all text-dust" data-selectable>
          {asset.relPath}
        </p>
      </div>

      <div className="forge-rule opacity-70" />

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-dust">{k}</dt>
              <dd className="truncate text-right text-bone/90" data-selectable>
                {v}
              </dd>
            </div>
          ))}
      </dl>

      <TagEditor id={asset.id} tags={detail.tags} />

      <div>
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-dust">
          Actions
        </div>
        <ActionList actions={actions} />
      </div>
    </div>
  );
}

function TagEditor({ id, tags }: { id: number; tags: string[] }) {
  const [value, setValue] = useState("");
  const { add, remove } = useTagMutations(id);
  const submit = () => {
    const tag = value.trim();
    if (!tag) return;
    add.mutate(tag);
    setValue("");
  };
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-dust">
        Tags
      </div>
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <span
            key={t}
            className="group flex h-6 items-center gap-1 rounded-sm border border-iron-500 bg-iron-900 pr-1 pl-2 text-[11px] text-bone/85"
          >
            {t}
            <button
              type="button"
              onClick={() => remove.mutate(t)}
              className="text-dust opacity-60 hover:text-arc group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="relative mt-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Add a tag"
          className="h-8 pr-8 text-xs"
        />
        <button
          type="button"
          onClick={submit}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-dust hover:text-ember"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}
