import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FolderCount } from "@/lib/bindings";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";

type Node = {
  name: string;
  path: string;
  count: number;
  children: Map<string, Node>;
};

function buildTree(folders: FolderCount[]): Node {
  const root: Node = { name: "", path: "", count: 0, children: new Map() };
  for (const { dir, count } of folders) {
    root.count += count;
    if (!dir) continue;
    let node = root;
    let path = "";
    for (const part of dir.split("/")) {
      path = path ? `${path}/${part}` : part;
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, path, count: 0, children: new Map() };
        node.children.set(part, child);
      }
      child.count += count;
      node = child;
    }
  }
  return root;
}

/** Collapses single-child chains ("art/sprites/units") so deep repos stay readable. */
function compact(node: Node): Node {
  const children = new Map<string, Node>();
  for (const [key, child] of node.children) {
    let c = child;
    while (c.children.size === 1) {
      const only = [...c.children.values()][0];
      if (only.count !== c.count) break;
      c = { ...only, name: `${c.name}/${only.name}` };
    }
    children.set(key, compact(c));
  }
  return { ...node, children };
}

function ancestors(path: string | null): string[] {
  if (!path) return [];
  const parts = path.split("/");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

export function FolderTree({ folders }: { folders: FolderCount[] }) {
  const tree = useMemo(() => compact(buildTree(folders)), [folders]);
  const folder = useUi((s) => s.folder);
  const selectFolder = useUi((s) => s.selectFolder);
  const [open, setOpen] = useState<Set<string>>(() => new Set(ancestors(folder)));

  useEffect(() => {
    setOpen((prev) => new Set([...prev, ...ancestors(folder)]));
  }, [folder]);

  const toggle = (path: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <div className="flex flex-col py-1 text-[13px]">
      <Row
        depth={0}
        label="All folders"
        count={tree.count}
        active={!folder}
        onSelect={() => selectFolder(null)}
      />
      {[...tree.children.values()].map((n) => (
        <Branch
          key={n.path}
          node={n}
          depth={0}
          open={open}
          toggle={toggle}
          selected={folder}
          onSelect={selectFolder}
        />
      ))}
    </div>
  );
}

function Branch({
  node,
  depth,
  open,
  toggle,
  selected,
  onSelect,
}: {
  node: Node;
  depth: number;
  open: Set<string>;
  toggle: (path: string) => void;
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const expanded = open.has(node.path);
  const hasChildren = node.children.size > 0;
  return (
    <>
      <Row
        depth={depth}
        label={node.name}
        count={node.count}
        active={selected === node.path}
        expandable={hasChildren}
        expanded={expanded}
        onToggle={() => toggle(node.path)}
        onSelect={() => {
          onSelect(node.path);
          if (hasChildren && !expanded) toggle(node.path);
        }}
      />
      {expanded &&
        [...node.children.values()].map((c) => (
          <Branch
            key={c.path}
            node={c}
            depth={depth + 1}
            open={open}
            toggle={toggle}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

function Row({
  depth,
  label,
  count,
  active,
  expandable,
  expanded,
  onToggle,
  onSelect,
}: {
  depth: number;
  label: string;
  count: number;
  active: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onSelect: () => void;
}) {
  const Icon = expanded ? FolderOpen : Folder;
  return (
    <div
      className={cn(
        "group flex h-7 items-center gap-1 rounded-sm pr-2 transition-colors",
        active ? "bg-rust/30 text-gold" : "text-bone/75 hover:bg-iron-700/60 hover:text-bone",
      )}
      style={{ paddingLeft: 6 + depth * 12 }}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={onToggle}
        className={cn(
          "flex size-4 items-center justify-center text-dust",
          !expandable && "invisible",
        )}
      >
        <ChevronRight className={cn("size-3 transition-transform", expanded && "rotate-90")} />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        title={label}
      >
        <Icon className={cn("size-3.5 shrink-0", active ? "text-ember" : "text-dust")} />
        <span className="truncate">{label}</span>
      </button>
      <span className="font-mono text-[10px] text-dust tabular-nums">{formatCount(count)}</span>
    </div>
  );
}
