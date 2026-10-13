import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Boxes, Loader2, RefreshCw, Settings } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { derivedUrl } from "@/lib/asset-url";
import { type AssetSummary, commands } from "@/lib/bindings";
import { qk } from "@/lib/query-keys";
import { useUi } from "@/stores/ui";
import { ModelViewer } from "./ModelViewer";
import { Stage } from "./Stage";

export function BlendViewer({ asset }: { asset: AssetSummary }) {
  const qc = useQueryClient();
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const status = useQuery({
    queryKey: qk.blend(asset.id),
    queryFn: () => commands.blendStatus(asset.id),
  });
  const state = status.data?.state;

  const request = () =>
    commands.requestBlendExport(asset.id).then((s) => qc.setQueryData(qk.blend(asset.id), s));

  // biome-ignore lint/correctness/useExhaustiveDependencies: kick off the export once per asset
  useEffect(() => {
    if (state === "idle") request();
  }, [state, asset.id]);

  if (state === "ready") {
    return <ModelViewer assetId={asset.id} url={derivedUrl(asset, "glb")} format="glb" />;
  }

  return (
    <Stage>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
        {state === "noBlender" ? (
          <>
            <Boxes className="size-12 text-ember/60" strokeWidth={1.25} />
            <p className="font-display text-3xl text-bone">Blender not found</p>
            <p className="max-w-sm text-sm text-dust">
              ArtDirector previews .blend files by exporting them to glTF with Blender in the
              background. Install Blender or point Settings at blender.exe.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                <Settings /> Open settings
              </Button>
              <Button variant="ghost" size="sm" onClick={request}>
                <RefreshCw /> Retry
              </Button>
            </div>
          </>
        ) : state === "failed" ? (
          <>
            <AlertTriangle className="size-10 text-arc" strokeWidth={1.25} />
            <p className="font-display text-3xl text-bone">Export failed</p>
            <p className="max-w-lg font-mono text-xs text-dust" data-selectable>
              {status.data?.message}
            </p>
            <Button variant="outline" size="sm" onClick={request}>
              <RefreshCw /> Try again
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="size-10 animate-spin text-ember" />
            <p className="font-display text-3xl text-bone">
              {state === "running" ? "Exporting with Blender…" : "Queued for export…"}
            </p>
            <p className="text-sm text-dust">The first preview of a .blend file takes a moment.</p>
          </>
        )}
      </div>
    </Stage>
  );
}
