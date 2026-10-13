import { useCallback, useEffect, useRef, useState } from "react";

export type Direction = "forward" | "reverse" | "pingpong";

type Options = {
  /** Inclusive frame range to loop over. */
  from: number;
  to: number;
  direction: Direction;
  durationOf: (frame: number) => number;
  speed: number;
};

/** Drives a looping frame index with per-frame durations, like Aseprite's preview. */
export function useFramePlayer({ from, to, direction, durationOf, speed }: Options) {
  const [frame, setFrame] = useState(from);
  const [playing, setPlaying] = useState(true);
  const state = useRef({ frame: from, step: 1, elapsed: 0 });
  const durationRef = useRef(durationOf);
  durationRef.current = durationOf;

  useEffect(() => {
    const start = direction === "reverse" ? to : from;
    state.current = { frame: start, step: direction === "reverse" ? -1 : 1, elapsed: 0 };
    setFrame(start);
  }, [from, to, direction]);

  const advance = useCallback(
    (s: { frame: number; step: number }) => {
      if (from === to) return from;
      let next = s.frame + s.step;
      if (direction === "pingpong") {
        if (next > to || next < from) {
          s.step = -s.step;
          next = s.frame + s.step;
        }
      } else if (next > to) {
        next = from;
      } else if (next < from) {
        next = to;
      }
      return next;
    },
    [from, to, direction],
  );

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const s = state.current;
      s.elapsed += (now - last) * speed;
      last = now;
      let changed = false;
      for (let guard = 0; guard < 64; guard++) {
        const d = Math.max(16, durationRef.current(s.frame));
        if (s.elapsed < d) break;
        s.elapsed -= d;
        s.frame = advance(s);
        changed = true;
      }
      if (changed) setFrame(s.frame);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, advance]);

  const seek = useCallback(
    (f: number) => {
      const clamped = Math.min(to, Math.max(from, f));
      state.current.frame = clamped;
      state.current.elapsed = 0;
      setFrame(clamped);
    },
    [from, to],
  );

  return {
    frame,
    playing,
    toggle: () => setPlaying((p) => !p),
    setPlaying,
    seek,
    step: (delta: number) => {
      setPlaying(false);
      const span = to - from + 1;
      seek(from + ((((state.current.frame - from + delta) % span) + span) % span));
    },
  };
}
