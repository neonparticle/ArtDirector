import { useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  ClipboardCopy,
  Copy,
  ExternalLink,
  Film,
  FolderOpen,
  ImagePlus,
} from "lucide-react";
import type { ReactNode } from "react";
import { type AssetSummary, commands, type OpenWith } from "@/lib/bindings";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { notify } from "@/stores/notice";
import { copyImage } from "./copyImage";

export type AssetAction = {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  run: () => void;
};

/** Actions available for an asset, shared by the info panel and the viewer toolbar. */
export function useAssetActions(asset: AssetSummary | undefined, absPath?: string): AssetAction[] {
  const qc = useQueryClient();
  if (!asset) return [];
  const open = (with_: OpenWith) => () => {
    commands.openAsset(asset.id, with_).catch((e) => notify(String(e), "error"));
  };
  const actions: AssetAction[] = [
    {
      id: "reveal",
      label: "Show in Explorer",
      icon: <FolderOpen />,
      run: () => commands.revealAsset(asset.id),
    },
    { id: "open", label: "Open in default app", icon: <ExternalLink />, run: open("default") },
  ];
  if (asset.kind === "aseprite" || asset.ext === "png" || asset.kind === "sheet") {
    actions.push({
      id: "aseprite",
      label: "Open in Aseprite",
      icon: <Film />,
      run: open("aseprite"),
    });
  }
  if (asset.kind === "blend" || asset.kind === "model") {
    actions.push({
      id: "blender",
      label: "Open in Blender",
      icon: <Boxes />,
      run: open("blender"),
    });
  }
  if (asset.kind !== "source") {
    actions.push({
      id: "copy-image",
      label: "Copy image",
      icon: <ClipboardCopy />,
      shortcut: "Ctrl+C",
      run: () => copyImage(asset),
    });
  }
  if (absPath) {
    actions.push({
      id: "copy",
      label: "Copy path",
      icon: <Copy />,
      run: () => navigator.clipboard.writeText(absPath),
    });
  }
  if (asset.thumbReady) {
    actions.push({
      id: "cover",
      label: "Use as project cover",
      icon: <ImagePlus />,
      run: () =>
        commands
          .setProjectCover(asset.projectId, asset.id)
          .then(() => qc.invalidateQueries({ queryKey: qk.projects })),
    });
  }
  return actions;
}

export function Shortcut({ keys }: { keys: string }) {
  return <span className="ml-auto pl-4 font-mono text-[10px] text-dust">{keys}</span>;
}

export function ActionList({ actions, className }: { actions: AssetAction[]; className?: string }) {
  return (
    <div className={cn("grid gap-0.5", className)}>
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={a.run}
          className="flex h-8 items-center gap-2.5 rounded-sm px-2 text-left text-[13px] text-bone/80 transition-colors hover:bg-iron-700/70 hover:text-gold [&_svg]:size-4 [&_svg]:text-dust hover:[&_svg]:text-ember"
        >
          {a.icon}
          {a.label}
          {a.shortcut && <Shortcut keys={a.shortcut} />}
        </button>
      ))}
    </div>
  );
}
