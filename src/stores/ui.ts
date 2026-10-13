import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AssetKind, SortKey } from "@/lib/bindings";

export type StageBackground = "checker" | "void" | "bone" | "custom";

export type Filters = {
  kinds: AssetKind[];
  search: string;
  tag: string | null;
  favoritesOnly: boolean;
  hideDuplicates: boolean;
  hideArtifacts: boolean;
  minPx: number | null;
  sort: SortKey;
  desc: boolean;
};

export const DEFAULT_FILTERS: Filters = {
  kinds: [],
  search: "",
  tag: null,
  favoritesOnly: false,
  hideDuplicates: true,
  hideArtifacts: false,
  minPx: null,
  sort: "path",
  desc: false,
};

type UiState = {
  projectId: number | null;
  folder: string | null;
  filters: Filters;
  tileSize: number;
  selectedId: number | null;
  viewerOpen: boolean;
  infoOpen: boolean;
  settingsOpen: boolean;
  stageBg: StageBackground;
  customBg: string;
  pixelGrid: boolean;
  smoothing: boolean;
  /** Bumped when thumbnails are invalidated wholesale (cache cleared, thumb size changed). */
  thumbEpoch: number;

  selectProject: (id: number | null) => void;
  selectFolder: (folder: string | null) => void;
  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  toggleKind: (kind: AssetKind) => void;
  setTileSize: (n: number) => void;
  select: (id: number | null) => void;
  openViewer: (id: number) => void;
  closeViewer: () => void;
  toggleInfo: () => void;
  setSettingsOpen: (open: boolean) => void;
  setStageBg: (bg: StageBackground) => void;
  setCustomBg: (color: string) => void;
  togglePixelGrid: () => void;
  toggleSmoothing: () => void;
  bumpThumbEpoch: () => void;
};

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      projectId: null,
      folder: null,
      filters: DEFAULT_FILTERS,
      tileSize: 168,
      selectedId: null,
      viewerOpen: false,
      infoOpen: true,
      settingsOpen: false,
      stageBg: "checker",
      customBg: "#24302a",
      pixelGrid: false,
      smoothing: false,
      thumbEpoch: 0,

      selectProject: (projectId) => set({ projectId, folder: null, selectedId: null }),
      selectFolder: (folder) => set({ folder }),
      setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),
      toggleKind: (kind) =>
        set((s) => {
          const has = s.filters.kinds.includes(kind);
          return {
            filters: {
              ...s.filters,
              kinds: has ? s.filters.kinds.filter((k) => k !== kind) : [...s.filters.kinds, kind],
            },
          };
        }),
      setTileSize: (tileSize) => set({ tileSize }),
      select: (selectedId) => set({ selectedId }),
      openViewer: (id) => set({ selectedId: id, viewerOpen: true }),
      closeViewer: () => set({ viewerOpen: false }),
      toggleInfo: () => set((s) => ({ infoOpen: !s.infoOpen })),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setStageBg: (stageBg) => set({ stageBg }),
      setCustomBg: (customBg) => set({ customBg, stageBg: "custom" }),
      togglePixelGrid: () => set((s) => ({ pixelGrid: !s.pixelGrid })),
      toggleSmoothing: () => set((s) => ({ smoothing: !s.smoothing })),
      bumpThumbEpoch: () => set((s) => ({ thumbEpoch: s.thumbEpoch + 1 })),
    }),
    {
      name: "art-director.ui",
      version: 1,
      partialize: (s) => ({
        projectId: s.projectId,
        filters: s.filters,
        tileSize: s.tileSize,
        infoOpen: s.infoOpen,
        stageBg: s.stageBg,
        customBg: s.customBg,
        pixelGrid: s.pixelGrid,
        smoothing: s.smoothing,
        thumbEpoch: s.thumbEpoch,
      }),
    },
  ),
);
