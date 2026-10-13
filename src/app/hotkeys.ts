import { useEffect, useRef } from "react";

type Handler = (e: KeyboardEvent) => void;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/**
 * Window-level key bindings keyed by `KeyboardEvent.key` (e.g. "ArrowLeft", "f", " "),
 * or "mod+<key>" for Ctrl/Cmd combos. Ignored while typing in a field, and mod combos
 * yield to the browser while text is selected so native copy keeps working.
 * Handlers can stay inline; the latest ones are always used.
 */
export function useHotkeys(map: Record<string, Handler>, enabled = true) {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && window.getSelection()?.toString()) return;
      const handler = mod
        ? ref.current[`mod+${e.key.toLowerCase()}`]
        : (ref.current[e.key] ?? ref.current[e.key.toLowerCase()]);
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
