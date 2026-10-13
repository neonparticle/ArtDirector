import { Flame } from "lucide-react";
import { formatBytes, formatCount, formatDims } from "@/lib/format";
import { isScanning, useScans } from "@/stores/scan";
import { useUi } from "@/stores/ui";
import { useAssets, useCachedAsset } from "./useAssets";

export function StatusBar() {
  const { data: assets = [] } = useAssets();
  const selectedId = useUi((s) => s.selectedId);
  const selected = useCachedAsset(selectedId);
  const scanning = useScans((s) => Object.values(s.progress).filter(isScanning).length);
  const totalBytes = assets.reduce((n, a) => n + a.size, 0);

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-iron-700 bg-iron-950/80 px-4 font-mono text-[10.5px] text-dust">
      <span>
        <span className="text-bone/80">{formatCount(assets.length)}</span> assets ·{" "}
        {formatBytes(totalBytes)}
      </span>
      {scanning > 0 && (
        <span className="flex items-center gap-1.5 text-ember">
          <Flame className="animate-ember-pulse size-3" />
          scanning {scanning} project{scanning > 1 ? "s" : ""}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-right" data-selectable>
        {selected && (
          <>
            {selected.relPath}
            <span className="ml-3 text-bone/70">
              {[formatDims(selected), formatBytes(selected.size)].filter(Boolean).join(" · ")}
            </span>
          </>
        )}
      </span>
    </footer>
  );
}
