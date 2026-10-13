import { create } from "zustand";
import type { ScanProgress } from "@/lib/bindings";

type ScanState = {
  progress: Record<number, ScanProgress>;
  update: (p: ScanProgress) => void;
  clear: (projectId: number) => void;
};

export const useScans = create<ScanState>()((set) => ({
  progress: {},
  update: (p) => set((s) => ({ progress: { ...s.progress, [p.projectId]: p } })),
  clear: (projectId) =>
    set((s) => {
      const { [projectId]: _, ...rest } = s.progress;
      return { progress: rest };
    }),
}));

export function isScanning(p: ScanProgress | undefined): boolean {
  return !!p && p.phase !== "done" && p.phase !== "failed";
}
