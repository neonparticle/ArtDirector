import { useEffect } from "react";
import { create } from "zustand";
import type { AssetSummary } from "@/lib/bindings";
import { useUi } from "@/stores/ui";

export type CaptureState = "queued" | "working" | "failed" | "noBlender";

type CaptureStore = {
  states: Record<number, CaptureState>;
  errors: Record<number, string>;
  /** Most recently requested last; the capturer pops from the end so visible tiles go first. */
  queue: AssetSummary[];
  enqueue: (a: AssetSummary) => void;
  dequeue: (id: number) => void;
  take: () => AssetSummary | undefined;
  setState: (id: number, s: CaptureState | null) => void;
  fail: (id: number, message: string) => void;
  retry: (a: AssetSummary) => void;
};

export const useCaptureStore = create<CaptureStore>()((set, get) => ({
  states: {},
  errors: {},
  queue: [],
  enqueue: (a) => {
    const { states, queue } = get();
    if (states[a.id] && states[a.id] !== "queued") return;
    set({
      queue: [...queue.filter((q) => q.id !== a.id), a],
      states: { ...states, [a.id]: "queued" },
    });
  },
  dequeue: (id) => {
    const { states, queue } = get();
    if (states[id] !== "queued") return;
    const { [id]: _, ...rest } = states;
    set({ queue: queue.filter((q) => q.id !== id), states: rest });
  },
  take: () => {
    const { queue } = get();
    const next = queue[queue.length - 1];
    if (next) set({ queue: queue.slice(0, -1) });
    return next;
  },
  setState: (id, s) =>
    set((st) => {
      if (s == null) {
        const { [id]: _, ...states } = st.states;
        const { [id]: __, ...errors } = st.errors;
        return { states, errors };
      }
      return { states: { ...st.states, [id]: s } };
    }),
  fail: (id, message) =>
    set((st) => ({
      states: { ...st.states, [id]: "failed" },
      errors: { ...st.errors, [id]: message },
    })),
  retry: (a) => {
    const { [a.id]: _, ...states } = get().states;
    const { [a.id]: __, ...errors } = get().errors;
    set({ states, errors });
    get().enqueue(a);
  },
}));

export function useCaptureError(id: number): string | undefined {
  return useCaptureStore((s) => s.errors[id]);
}

export function needsCapture(a: Pick<AssetSummary, "kind" | "thumbReady">): boolean {
  return (a.kind === "model" || a.kind === "blend") && !a.thumbReady;
}

/** Requests a 3D thumbnail while the tile is mounted; returns the capture state, if any. */
export function useCaptureState(asset: AssetSummary): CaptureState | null {
  const needs = needsCapture(asset);
  const state = useCaptureStore((s) => s.states[asset.id]);
  const epoch = useUi((s) => s.thumbEpoch);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-request only when the file version or thumbnail epoch changes
  useEffect(() => {
    if (!needs) return;
    const store = useCaptureStore.getState();
    store.enqueue(asset);
    return () => store.dequeue(asset.id);
  }, [needs, asset.id, asset.mtime, epoch]);

  return needs ? (state ?? "queued") : null;
}
