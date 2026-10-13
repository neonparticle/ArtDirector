import { create } from "zustand";

export type Notice = { id: number; text: string; tone: "info" | "error" };

type NoticeState = {
  notice: Notice | null;
  dismiss: (id: number) => void;
};

export const useNotice = create<NoticeState>()((set) => ({
  notice: null,
  dismiss: (id) => set((s) => (s.notice?.id === id ? { notice: null } : s)),
}));

let nextId = 0;

/** Shows a short-lived message near the top of the window, replacing any current one. */
export function notify(text: string, tone: Notice["tone"] = "info") {
  const id = ++nextId;
  useNotice.setState({ notice: { id, text, tone } });
  setTimeout(() => useNotice.getState().dismiss(id), tone === "error" ? 5000 : 1800);
}
