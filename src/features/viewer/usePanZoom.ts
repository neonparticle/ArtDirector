import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type View = { zoom: number; x: number; y: number };

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 96;

/** Above 1×, zoom moves in whole multiples so pixel art never resamples unevenly. */
function snapStep(z: number, factor: number): number {
  const raw = z * factor;
  if (raw < 1 && z <= 1) return raw;
  if (factor > 1) return Math.max(Math.floor(z) + 1, Math.round(raw));
  const down = Math.min(Math.ceil(z) - 1, Math.round(raw));
  return down >= 1 ? down : raw;
}

/**
 * Pan/zoom state for a `contentW`×`contentH` image inside a container.
 * `x`/`y` offset the content center from the container center, in screen pixels.
 * With `pixelSnap`, fitted zoom levels above 1 snap down to whole multiples.
 */
export function usePanZoom(contentW: number, contentH: number, pixelSnap: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const drag = useRef<{ id: number; sx: number; sy: number; vx: number; vy: number } | null>(null);
  const fitted = useRef(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitZoom = useCallback(() => {
    if (!contentW || !contentH || !size.w || !size.h) return 1;
    let z = Math.min((size.w * 0.88) / contentW, (size.h * 0.88) / contentH);
    if (pixelSnap && z > 1) z = Math.floor(z);
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  }, [contentW, contentH, size.w, size.h, pixelSnap]);

  const fit = useCallback(() => setView({ zoom: fitZoom(), x: 0, y: 0 }), [fitZoom]);
  const oneToOne = useCallback(() => setView({ zoom: 1, x: 0, y: 0 }), []);

  // Fit once the content and container sizes are known, and again when the content changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refit only on content change
  useEffect(() => {
    fitted.current = false;
  }, [contentW, contentH]);
  useEffect(() => {
    if (!fitted.current && contentW && size.w) {
      fitted.current = true;
      fit();
    }
  }, [fit, contentW, size.w]);

  const zoomAt = useCallback(
    (factor: number, cx = 0, cy = 0) =>
      setView((v) => {
        const next = pixelSnap ? snapStep(v.zoom, factor) : v.zoom * factor;
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
        const k = zoom / v.zoom;
        return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
      }),
    [pixelSnap],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, cx, cy);
    },
    [zoomAt],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    },
    [view.x, view.y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  }, []);

  return {
    containerRef,
    view,
    fit,
    oneToOne,
    zoomIn: () => zoomAt(1.25),
    zoomOut: () => zoomAt(1 / 1.25),
    bind: { onWheel, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    /** Absolute-position style for the content element. */
    contentStyle: {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: contentW * view.zoom,
      height: contentH * view.zoom,
      transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px)`,
    } satisfies React.CSSProperties,
  };
}
