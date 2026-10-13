import { useVirtualizer } from "@tanstack/react-virtual";
import { FolderPlus, SearchX } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useHotkeys } from "@/app/hotkeys";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/features/projects/useProjects";
import { useUi } from "@/stores/ui";
import { AssetTile } from "./AssetTile";
import { useAssets, useToggleFavorite } from "./useAssets";

const GAP = 12;
const PAD = 18;
const CAPTION = 30;

export function VirtualGrid() {
  const { data: assets = [], isFetching, isPending } = useAssets();
  const { data: projects } = useProjects();
  const tileSize = useUi((s) => s.tileSize);
  const selectedId = useUi((s) => s.selectedId);
  const viewerOpen = useUi((s) => s.viewerOpen);
  const epoch = useUi((s) => s.thumbEpoch);
  const select = useUi((s) => s.select);
  const openViewer = useUi((s) => s.openViewer);
  const resetFilters = useUi((s) => s.resetFilters);
  const favorite = useToggleFavorite();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const inner = Math.max(0, width - PAD * 2);
  const cols = Math.max(1, Math.floor((inner + GAP) / (tileSize + GAP)));
  const cell = Math.max(64, Math.floor((inner - GAP * (cols - 1)) / cols));
  const rowHeight = cell + CAPTION + GAP;
  const rows = Math.ceil(assets.length / cols);

  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
    paddingStart: PAD,
    paddingEnd: PAD,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: estimateSize closes over rowHeight, so cached row sizes must be dropped when it changes
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, rowHeight]);

  const selectedIndex = selectedId == null ? -1 : assets.findIndex((a) => a.id === selectedId);

  const moveSelection = useCallback(
    (delta: number) => {
      if (assets.length === 0) return;
      const from = selectedIndex < 0 ? 0 : selectedIndex + delta;
      const next = Math.min(assets.length - 1, Math.max(0, from));
      select(assets[next].id);
      virtualizer.scrollToIndex(Math.floor(next / cols), { align: "auto" });
    },
    [assets, selectedIndex, select, virtualizer, cols],
  );

  useHotkeys(
    {
      ArrowRight: () => moveSelection(1),
      ArrowLeft: () => moveSelection(-1),
      ArrowDown: () => moveSelection(cols),
      ArrowUp: () => moveSelection(-cols),
      Home: () => moveSelection(-assets.length),
      End: () => moveSelection(assets.length),
      Enter: () => selectedId != null && openViewer(selectedId),
      " ": () => selectedId != null && openViewer(selectedId),
      f: () => {
        const a = assets[selectedIndex];
        if (a) favorite.mutate({ id: a.id, favorite: !a.favorite });
      },
      i: useUi.getState().toggleInfo,
    },
    !viewerOpen,
  );

  const onSelect = useCallback((id: number) => select(id), [select]);
  const onOpen = useCallback((id: number) => openViewer(id), [openViewer]);
  const onFavorite = useCallback(
    (id: number, fav: boolean) => favorite.mutate({ id, favorite: fav }),
    [favorite],
  );

  const noProjects = projects && projects.length === 0;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: clicking empty space clears the selection; keys go through window-level hotkeys
    // biome-ignore lint/a11y/useKeyWithClickEvents: same as above
    <div
      ref={scrollRef}
      className="relative min-w-0 flex-1 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && select(null)}
    >
      {isFetching && !isPending && (
        <div className="pointer-events-none sticky top-0 z-10 h-px overflow-hidden">
          <div className="animate-scan-sweep h-full w-1/3 bg-gradient-to-r from-transparent via-ember to-transparent" />
        </div>
      )}

      {noProjects ? (
        <EmptyLibrary />
      ) : !isPending && assets.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-dust">
          <SearchX className="size-10 text-ember/50" strokeWidth={1.25} />
          <p className="font-display text-2xl text-bone/80">Nothing in the forge matches.</p>
          <Button variant="outline" size="sm" onClick={resetFilters}>
            Reset filters
          </Button>
        </div>
      ) : (
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((row) => {
            const start = row.index * cols;
            return (
              <div
                key={row.key}
                className="absolute left-0 flex"
                style={{
                  top: row.start,
                  height: rowHeight,
                  paddingLeft: PAD,
                  gap: GAP,
                }}
              >
                {assets.slice(start, start + cols).map((asset) => (
                  <AssetTile
                    key={asset.id}
                    asset={asset}
                    size={cell}
                    epoch={epoch}
                    selected={asset.id === selectedId}
                    onSelect={onSelect}
                    onOpen={onOpen}
                    onFavorite={onFavorite}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyLibrary() {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-6 px-8 text-center">
      <div className="forge-grid pointer-events-none absolute inset-0 opacity-60" />
      <img
        src="/icon.svg"
        alt=""
        className="animate-ember-pulse relative size-24 drop-shadow-[0_0_40px_rgba(196,84,40,0.6)]"
      />
      <div className="relative">
        <h2 className="font-display text-5xl text-bone text-glow">
          Light the <span className="text-ember italic">forge</span>
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-dust">
          Drop a game repo or art folder anywhere on this window, or add one from the sidebar.
          ArtDirector indexes images, sprite sheets, Aseprite files and 3D models, skipping build
          output along the way.
        </p>
      </div>
      <div className="relative flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-dust/80">
        <FolderPlus className="size-3.5 text-ember" /> drag a folder here
      </div>
    </div>
  );
}
