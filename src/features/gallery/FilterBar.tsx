import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronRight,
  Grid2x2,
  PanelRight,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Hint } from "@/components/ui/tooltip";
import { useProjects } from "@/features/projects/useProjects";
import type { SortKey } from "@/lib/bindings";
import { formatCount, KIND_META, KIND_ORDER } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DEFAULT_FILTERS, useUi } from "@/stores/ui";
import { useKindCounts, useTags } from "./useAssets";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "path", label: "Path" },
  { key: "name", label: "Name" },
  { key: "modified", label: "Modified" },
  { key: "size", label: "File size" },
  { key: "dimensions", label: "Dimensions" },
];

const MIN_PX = [null, 32, 64, 128, 256, 512, 1024] as const;

export function FilterBar() {
  const projectId = useUi((s) => s.projectId);
  const folder = useUi((s) => s.folder);
  const filters = useUi((s) => s.filters);
  const setFilters = useUi((s) => s.setFilters);
  const toggleKind = useUi((s) => s.toggleKind);
  const selectFolder = useUi((s) => s.selectFolder);
  const tileSize = useUi((s) => s.tileSize);
  const setTileSize = useUi((s) => s.setTileSize);
  const infoOpen = useUi((s) => s.infoOpen);
  const toggleInfo = useUi((s) => s.toggleInfo);
  const { data: projects } = useProjects();
  const { data: kindCounts = [] } = useKindCounts(projectId);
  const { data: tags = [] } = useTags(projectId);

  const [search, setSearch] = useState(filters.search);
  useEffect(() => setSearch(filters.search), [filters.search]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== useUi.getState().filters.search) setFilters({ search });
    }, 180);
    return () => clearTimeout(t);
  }, [search, setFilters]);

  const project = projects?.find((p) => p.id === projectId);
  const counts = useMemo(() => new Map(kindCounts.map((k) => [k.kind, k.count])), [kindCounts]);
  const crumbs = folder ? folder.split("/") : [];
  const activeExtras =
    Number(filters.favoritesOnly) +
    Number(filters.hideArtifacts) +
    Number(filters.hideDuplicates !== DEFAULT_FILTERS.hideDuplicates) +
    Number(filters.minPx != null);

  return (
    <div className="relative z-10 border-b border-iron-700 bg-void/70 backdrop-blur-sm">
      <div className="flex items-end gap-4 px-5 pt-4 pb-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-[34px] leading-none text-bone">
            {project ? project.name : "All projects"}
          </h2>
          <div className="mt-1.5 flex min-h-4 items-center gap-1 overflow-hidden font-mono text-[11px] text-dust">
            {project ? (
              <>
                <button
                  type="button"
                  onClick={() => selectFolder(null)}
                  className="shrink-0 hover:text-ember"
                >
                  root
                </button>
                {crumbs.map((c, i) => {
                  const path = crumbs.slice(0, i + 1).join("/");
                  return (
                    <span key={path} className="flex min-w-0 items-center gap-1">
                      <ChevronRight className="size-3 shrink-0 text-iron-500" />
                      <button
                        type="button"
                        onClick={() => selectFolder(path)}
                        className={cn(
                          "truncate hover:text-ember",
                          i === crumbs.length - 1 && "text-gold",
                        )}
                      >
                        {c}
                      </button>
                    </span>
                  );
                })}
              </>
            ) : (
              <span>{formatCount(kindCounts.reduce((n, k) => n + k.count, 0))} assets indexed</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 pb-0.5">
          <Grid2x2 className="size-3.5 text-dust" />
          <Slider
            className="w-28"
            min={96}
            max={320}
            step={8}
            value={[tileSize]}
            onValueChange={([v]) => setTileSize(v)}
          />
          <Hint label={infoOpen ? "Hide details (I)" : "Show details (I)"}>
            <Button variant={infoOpen ? "secondary" : "ghost"} size="icon-sm" onClick={toggleInfo}>
              <PanelRight />
            </Button>
          </Hint>
        </div>
      </div>

      <div className="flex items-center gap-2 px-5 pb-3">
        <div className="relative w-64 shrink-0">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-dust" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search paths and tags"
            className="h-8 pr-7 pl-8 text-[13px]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-dust hover:text-bone"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <KindChip
            label="All"
            active={filters.kinds.length === 0}
            onClick={() => setFilters({ kinds: [] })}
          />
          {KIND_ORDER.filter((k) => counts.get(k)).map((kind) => {
            const Icon = KIND_META[kind].icon;
            return (
              <KindChip
                key={kind}
                label={KIND_META[kind].plural}
                count={counts.get(kind)}
                icon={<Icon className="size-3.5" />}
                active={filters.kinds.includes(kind)}
                onClick={() => toggleKind(kind)}
              />
            );
          })}
        </div>

        {tags.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant={filters.tag ? "secondary" : "ghost"} size="sm">
                <Tag />
                {filters.tag ?? "Tags"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
              <DropdownMenuRadioGroup
                value={filters.tag ?? ""}
                onValueChange={(v) => setFilters({ tag: v || null })}
              >
                <DropdownMenuRadioItem value="">Any tag</DropdownMenuRadioItem>
                {tags.map((t) => (
                  <DropdownMenuRadioItem key={t.tag} value={t.tag}>
                    <span className="flex-1">{t.tag}</span>
                    <span className="font-mono text-[10px] text-dust">{t.count}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              {filters.desc ? <ArrowDownWideNarrow /> : <ArrowUpNarrowWide />}
              {SORTS.find((s) => s.key === filters.sort)?.label}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={filters.sort}
              onValueChange={(v) => setFilters({ sort: v as SortKey })}
            >
              {SORTS.map((s) => (
                <DropdownMenuRadioItem key={s.key} value={s.key}>
                  {s.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={filters.desc}
              onCheckedChange={(desc) => setFilters({ desc: !!desc })}
            >
              Descending
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant={activeExtras ? "secondary" : "ghost"} size="sm">
              <SlidersHorizontal />
              Filters
              {activeExtras > 0 && (
                <span className="rounded-sm bg-ember px-1 font-mono text-[10px] text-void">
                  {activeExtras}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuCheckboxItem
              checked={filters.favoritesOnly}
              onCheckedChange={(v) => setFilters({ favoritesOnly: !!v })}
            >
              Favorites only
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={filters.hideDuplicates}
              onCheckedChange={(v) => setFilters({ hideDuplicates: !!v })}
            >
              Hide duplicates
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={filters.hideArtifacts}
              onCheckedChange={(v) => setFilters({ hideArtifacts: !!v })}
            >
              Hide artifacts/ folders
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Minimum size</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={String(filters.minPx ?? "")}
              onValueChange={(v) => setFilters({ minPx: v ? Number(v) : null })}
            >
              {MIN_PX.map((px) => (
                <DropdownMenuRadioItem key={px ?? "any"} value={String(px ?? "")}>
                  {px ? `≥ ${px}px` : "Any size"}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function KindChip({
  label,
  count,
  icon,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
        active
          ? "border-ember/70 bg-rust/35 text-gold shadow-[0_0_14px_-6px_rgba(196,84,40,0.9)]"
          : "border-iron-700 text-bone/70 hover:border-iron-500 hover:text-bone",
      )}
    >
      {icon}
      {label}
      {count != null && (
        <span className="font-mono text-[10px] text-dust">{formatCount(count)}</span>
      )}
    </button>
  );
}
