import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useEffect } from "react";
import { create } from "zustand";
import { notify } from "./notice";

type UpdateState = {
  status: "idle" | "checking" | "current" | "available" | "installing";
  update: Update | null;
  /** Download progress from 0 to 1, or null while the size is unknown. */
  progress: number | null;
};

export const useUpdate = create<UpdateState>()(() => ({
  status: "idle",
  update: null,
  progress: null,
}));

const RECHECK_MS = 6 * 60 * 60 * 1000;

/** Silent checks swallow failures so an offline launch doesn't nag. */
export async function checkForUpdate({ silent = false } = {}) {
  const { status } = useUpdate.getState();
  if (status === "checking" || status === "installing") return;
  useUpdate.setState({ status: "checking" });
  try {
    const update = await check();
    useUpdate.setState({ status: update ? "available" : "current", update });
  } catch (e) {
    useUpdate.setState({ status: "idle" });
    if (!silent) notify(`Update check failed: ${e}`, "error");
  }
}

export async function installUpdate() {
  const { update, status } = useUpdate.getState();
  if (!update || status === "installing") return;
  useUpdate.setState({ status: "installing", progress: null });
  let total = 0;
  let received = 0;
  try {
    await update.downloadAndInstall((e) => {
      if (e.event === "Started") total = e.data.contentLength ?? 0;
      if (e.event === "Progress") {
        received += e.data.chunkLength;
        useUpdate.setState({ progress: total ? received / total : null });
      }
    });
    await relaunch();
  } catch (e) {
    useUpdate.setState({ status: "available", progress: null });
    notify(`Update failed: ${e}`, "error");
  }
}

export function useAutoUpdateCheck() {
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const first = setTimeout(() => checkForUpdate({ silent: true }), 4000);
    const again = setInterval(() => checkForUpdate({ silent: true }), RECHECK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(again);
    };
  }, []);
}
