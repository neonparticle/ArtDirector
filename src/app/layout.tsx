import { AnimatePresence } from "motion/react";
import { FilterBar } from "@/features/gallery/FilterBar";
import { StatusBar } from "@/features/gallery/StatusBar";
import { VirtualGrid } from "@/features/gallery/VirtualGrid";
import { ProjectsSidebar } from "@/features/projects/ProjectsSidebar";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import { InfoPanel } from "@/features/viewer/InfoPanel";
import { ThumbCapturer } from "@/features/viewer/model/ThumbCapturer";
import { ViewerRouter } from "@/features/viewer/ViewerRouter";
import { useUi } from "@/stores/ui";

export function AppLayout() {
  const infoOpen = useUi((s) => s.infoOpen);
  const viewerOpen = useUi((s) => s.viewerOpen);

  return (
    <div className="relative flex h-full overflow-hidden bg-void">
      <div className="forge-coalglow pointer-events-none absolute inset-0" />

      <ProjectsSidebar />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <FilterBar />
        <div className="relative flex min-h-0 flex-1">
          <VirtualGrid />
          {infoOpen && <InfoPanel />}
        </div>
        <StatusBar />
      </main>

      <AnimatePresence>{viewerOpen && <ViewerRouter key="viewer" />}</AnimatePresence>

      <SettingsDialog />
      <ThumbCapturer />

      <div className="forge-scanlines pointer-events-none fixed inset-0 z-[70]" />
      <div className="forge-vignette pointer-events-none fixed inset-0 z-[70]" />
    </div>
  );
}
