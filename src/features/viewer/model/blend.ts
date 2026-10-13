import { type BlendStatus, commands, events } from "@/lib/bindings";

const TIMEOUT_MS = 5 * 60_000;

/**
 * Requests a `.blend` → GLB export and resolves once it settles.
 * Resolves with the final status; callers check for "ready".
 */
export async function ensureBlendExport(id: number): Promise<BlendStatus> {
  const initial = await commands.requestBlendExport(id);
  if (initial.state !== "queued" && initial.state !== "running") return initial;

  return new Promise<BlendStatus>((resolve) => {
    let done = false;
    const finish = (s: BlendStatus) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unlisten.then((off) => off());
      resolve(s);
    };
    const timer = setTimeout(
      () => finish({ assetId: id, state: "failed", message: "Timed out waiting for Blender" }),
      TIMEOUT_MS,
    );
    const unlisten = events.blendStatus.listen(({ payload }) => {
      if (payload.assetId !== id) return;
      if (payload.state !== "queued" && payload.state !== "running") finish(payload);
    });
    // Covers an export that finished between the request and the listener attaching.
    commands.blendStatus(id).then((s) => {
      if (s.state !== "queued" && s.state !== "running") finish(s);
    });
  });
}
