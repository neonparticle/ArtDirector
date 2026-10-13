import { ExternalLink, FolderOpen, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type AssetSummary, commands } from "@/lib/bindings";
import { formatBytes } from "@/lib/format";
import { Stage } from "./Stage";

const LABELS: Record<string, string> = {
  psd: "Photoshop document",
  afphoto: "Affinity Photo document",
  kra: "Krita document",
  xcf: "GIMP image",
};

export function SourceViewer({ asset }: { asset: AssetSummary }) {
  return (
    <Stage>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-ember/20 blur-2xl" />
          <Layers className="relative size-16 text-ember" strokeWidth={1.1} />
        </div>
        <p className="font-display text-4xl text-bone">{LABELS[asset.ext] ?? "Source file"}</p>
        <p className="font-mono text-xs text-dust">
          .{asset.ext} · {formatBytes(asset.size)} · no in-app preview yet
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => commands.openAsset(asset.id, "default")}>
            <ExternalLink /> Open in default app
          </Button>
          <Button variant="outline" size="sm" onClick={() => commands.revealAsset(asset.id)}>
            <FolderOpen /> Show in folder
          </Button>
        </div>
      </div>
    </Stage>
  );
}
