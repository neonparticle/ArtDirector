import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { type ReactNode, useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { commands, events } from "@/lib/bindings";
import { qk } from "@/lib/query-keys";
import { useScans } from "@/stores/scan";
import { useUi } from "@/stores/ui";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <AppEvents />
        {children}
      </TooltipProvider>
    </QueryClientProvider>
  );
}

/** Bridges backend events into React Query and the scan store. Mounted once. */
function AppEvents() {
  const qc = useQueryClient();
  const updateScan = useScans((s) => s.update);

  useEffect(() => {
    const unlisten = [
      events.scanProgress.listen(({ payload }) => {
        updateScan(payload);
        if (payload.phase === "done" || payload.phase === "failed") {
          qc.invalidateQueries({ queryKey: qk.projects });
        }
      }),
      events.assetsChanged.listen(() => {
        for (const key of [qk.assetsAll, qk.foldersAll, qk.kindsAll, qk.projects, qk.assetAll]) {
          qc.invalidateQueries({ queryKey: key });
        }
      }),
      events.blendStatus.listen(({ payload }) => {
        qc.setQueryData(qk.blend(payload.assetId), payload);
      }),
    ];
    return () => {
      for (const p of unlisten) p.then((off) => off());
    };
  }, [qc, updateScan]);

  // Drop folders anywhere on the window to add them as projects.
  useEffect(() => {
    const off = getCurrentWebview().onDragDropEvent(async (e) => {
      if (e.payload.type !== "drop") return;
      let last: number | null = null;
      for (const path of e.payload.paths) {
        try {
          last = (await commands.addProject(path)).id;
        } catch {
          // Dropped files (not folders) are ignored.
        }
      }
      if (last != null) {
        qc.invalidateQueries({ queryKey: qk.projects });
        useUi.getState().selectProject(last);
      }
    });
    return () => {
      off.then((f) => f());
    };
  }, [qc]);

  return null;
}
