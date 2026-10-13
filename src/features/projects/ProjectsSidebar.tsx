import {
  FolderPlus,
  Library,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Settings as SettingsIcon,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Hint } from "@/components/ui/tooltip";
import { coverUrl } from "@/lib/asset-url";
import type { Project, ScanProgress } from "@/lib/bindings";
import { formatCount, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isScanning, useScans } from "@/stores/scan";
import { useUi } from "@/stores/ui";
import { AddProjectDialog } from "./AddProjectDialog";
import { EditProjectDialog } from "./EditProjectDialog";
import { FolderTree } from "./FolderTree";
import { useFolders, useProjects, useRemoveProject, useRescan } from "./useProjects";

export function ProjectsSidebar() {
  const { data: projects = [] } = useProjects();
  const projectId = useUi((s) => s.projectId);
  const selectProject = useUi((s) => s.selectProject);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const folders = useFolders(projectId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const total = projects.reduce((n, p) => n + p.assetCount, 0);

  return (
    <aside className="relative z-10 flex w-72 shrink-0 flex-col border-r border-iron-700 bg-iron-950/80">
      <header className="flex items-center gap-3 px-5 pt-5 pb-4">
        <img
          src="/icon.svg"
          alt=""
          className="size-9 drop-shadow-[0_0_12px_rgba(196,84,40,0.45)]"
        />
        <div className="leading-none">
          <h1 className="font-display text-[28px] tracking-tight text-bone text-glow">
            Art<span className="text-ember italic">Director</span>
          </h1>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.3em] text-dust">
            forge gallery
          </p>
        </div>
      </header>
      <div className="forge-rule mx-4" />

      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-dust">
          Projects
        </span>
        <Hint label="Add project">
          <Button variant="ghost" size="icon-sm" onClick={() => setAdding(true)}>
            <FolderPlus />
          </Button>
        </Hint>
      </div>

      <nav className="flex max-h-[46%] flex-col gap-0.5 overflow-y-auto px-2 pb-2">
        <button
          type="button"
          onClick={() => selectProject(null)}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
            projectId == null
              ? "bg-rust/25 text-gold shadow-[inset_2px_0_0_var(--color-ember)]"
              : "text-bone/80 hover:bg-iron-700/60",
          )}
        >
          <span className="flex size-9 items-center justify-center rounded-sm border border-iron-500 bg-iron-900">
            <Library className="size-4 text-ember" />
          </span>
          <span className="flex-1 text-sm font-medium">All projects</span>
          <span className="font-mono text-[10px] text-dust">{formatCount(total)}</span>
        </button>

        {projects.map((p) => (
          <ProjectRow
            key={p.id}
            project={p}
            active={p.id === projectId}
            onSelect={() => selectProject(p.id)}
            onEdit={() => setEditing(p)}
          />
        ))}

        {projects.length === 0 && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mx-1 mt-2 rounded-md border border-dashed border-iron-500 px-4 py-6 text-center text-xs text-dust transition-colors hover:border-ember/60 hover:text-bone"
          >
            No projects yet.
            <br />
            Add a folder or drop one here.
          </button>
        )}
      </nav>

      {projectId != null && (
        <>
          <div className="forge-rule mx-4 opacity-60" />
          <div className="px-5 pt-3 pb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-dust">
            Folders
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            <FolderTree folders={folders.data ?? []} />
          </div>
        </>
      )}
      {projectId == null && <div className="flex-1" />}

      <footer className="flex items-center gap-2 border-t border-iron-700 p-3">
        <Button className="flex-1" size="sm" onClick={() => setAdding(true)}>
          <FolderPlus />
          Add project
        </Button>
        <Hint label="Settings">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon />
          </Button>
        </Hint>
      </footer>

      <AddProjectDialog open={adding} onOpenChange={setAdding} />
      <EditProjectDialog project={editing} onOpenChange={(o) => !o && setEditing(null)} />
    </aside>
  );
}

function ProjectRow({
  project,
  active,
  onSelect,
  onEdit,
}: {
  project: Project;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const scan = useScans((s) => s.progress[project.id]);
  const thumbEpoch = useUi((s) => s.thumbEpoch);
  const rescan = useRescan();
  const remove = useRemoveProject();
  const scanning = isScanning(scan);

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 overflow-hidden rounded-md px-3 py-2 transition-colors",
        active
          ? "bg-rust/25 text-gold shadow-[inset_2px_0_0_var(--color-ember)]"
          : "text-bone/85 hover:bg-iron-700/60",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="bg-checker-subtle relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-iron-500">
          {project.coverAssetId != null ? (
            <img
              src={coverUrl(project.coverAssetId, project.coverMtime, thumbEpoch)}
              alt=""
              loading="lazy"
              className="pixelated size-full object-cover"
            />
          ) : (
            <span className="font-display text-lg text-ember">{project.name.slice(0, 1)}</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{project.name}</span>
          <span className="block truncate font-mono text-[10px] text-dust">
            {scanning
              ? scanLabel(scan)
              : `${formatCount(project.assetCount)} · ${formatRelative(project.lastScanAt)}`}
          </span>
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => rescan.mutate(project.id)}>
            <RefreshCw /> Rescan
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => remove.mutate(project.id)}>
            <Trash2 /> Remove from library
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {scanning && (
        <div className="absolute inset-x-0 bottom-0 h-px overflow-hidden bg-iron-700">
          {scan.total > 0 ? (
            <div
              className="h-full bg-gradient-to-r from-rust via-ember to-gold transition-[width]"
              style={{ width: `${Math.min(100, (scan.done / scan.total) * 100)}%` }}
            />
          ) : (
            <div className="animate-scan-sweep h-full w-1/3 bg-gradient-to-r from-transparent via-ember to-transparent" />
          )}
        </div>
      )}
    </div>
  );
}

function scanLabel(p: ScanProgress): string {
  switch (p.phase) {
    case "walking":
      return "walking folders…";
    case "indexing":
      return `indexing ${formatCount(p.done)} / ${formatCount(p.total)}`;
    case "writing":
      return "writing index…";
    default:
      return p.phase;
  }
}
