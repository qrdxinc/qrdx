"use client";

import { cn } from "@repo/design-system/lib/utils";
import { memo, useEffect, useRef } from "react";
import { observeVisibility, REDUCED_MOTION } from "@/components/fx/engine";
import { RAMP } from "@/components/fx/glyphs";

// The ASCII field behind the community header, drawn as text: the server
// sends its rows (./header-field.ts) in a <pre>, so the first frame is in
// the HTML and never shifts. In the browser a slow diagonal wave crosses it
// and re-rolls a few glyphs at a time to a neighbouring density, then lets
// them settle back: at most eight small updates a second, each rewriting
// only the rows it touched. It stops off screen and in a hidden tab, and
// never starts with reduced motion.

/** ms between updates: at most eight a second. */
const STEP = 125;
/** Glyphs the wave re-rolls per update, at most. */
const PER_STEP = 3;
/** How long a re-rolled glyph stays changed, ms (a range). */
const HOLD_MS = [600, 1400] as const;
/** One crossing of the wave, ms. */
const SWEEP_MS = 9000;
/** The wave's width, in columns. */
const BAND = 12;
/** The densest glyph's index in RAMP. */
const TOP = RAMP.length - 1;

/** A glyph's width over the font size (Geist Mono's advance). */
const ADVANCE = 0.6;
/** Line height over the font size: a module (two glyphs) is square. */
const LINE = ADVANCE * 2;

export const HeaderFieldArt = memo(function HeaderFieldArt({
  rows,
  className,
}: {
  /** The field's rows, every one as long */
  rows: readonly string[];
  className?: string;
}) {
  const ref = useRef<HTMLPreElement>(null);
  const cols = rows[0]?.length ?? 0;

  useEffect(() => {
    const pre = ref.current;
    if (!pre) return;
    const lines = Array.from(pre.children, (line) => line.firstChild).filter(
      (node): node is Text => node instanceof Text,
    );
    if (lines.length !== rows.length) return;
    const live = rows.map((row) => row.split(""));
    const changed: { row: number; col: number; until: number }[] = [];
    const motion = matchMedia(REDUCED_MOTION);
    const started = performance.now();
    let timer = 0;
    let running = false;
    let onScreen = false;

    const write = (touched: Set<number>) => {
      for (const row of touched) {
        const node = lines[row];
        const glyphs = live[row];
        if (node && glyphs) node.nodeValue = glyphs.join("");
      }
    };

    const settle = (now: number, touched: Set<number>) => {
      for (let i = changed.length - 1; i >= 0; i--) {
        const cell = changed[i];
        if (!cell || cell.until > now) continue;
        const glyphs = live[cell.row];
        const base = rows[cell.row]?.[cell.col];
        if (glyphs && base) glyphs[cell.col] = base;
        touched.add(cell.row);
        changed.splice(i, 1);
      }
    };

    const tick = () => {
      const now = performance.now();
      const touched = new Set<number>();
      settle(now, touched);
      // The wave's leading edge, leaning one column per row.
      const reach = cols + rows.length + BAND;
      const front = (((now - started) % SWEEP_MS) / SWEEP_MS) * reach - BAND;
      for (let i = 0; i < PER_STEP; i++) {
        const row = Math.floor(Math.random() * rows.length);
        const col =
          Math.floor(front + Math.random() * BAND) - (rows.length - row);
        const glyphs = live[row];
        const level = RAMP.indexOf(rows[row]?.[col] ?? " ");
        // Blank cells stay blank, so the field keeps its shape.
        if (!glyphs || level <= 0 || glyphs[col] !== rows[row]?.[col]) continue;
        const step =
          (Math.random() < 0.5 ? -1 : 1) * (1 + Math.round(Math.random()));
        glyphs[col] = RAMP[Math.min(TOP, Math.max(1, level + step))] ?? " ";
        const [low, high] = HOLD_MS;
        changed.push({
          row,
          col,
          until: now + low + Math.random() * (high - low),
        });
        touched.add(row);
      }
      write(touched);
      timer = window.setTimeout(tick, STEP);
    };

    const sync = () => {
      const run = onScreen && !document.hidden && !motion.matches;
      if (run && !running) {
        running = true;
        timer = window.setTimeout(tick, STEP);
      } else if (!run && running) {
        running = false;
        window.clearTimeout(timer);
      }
      if (motion.matches && changed.length > 0) {
        // Reduced motion turned on mid-wave: back to the still frame.
        const touched = new Set<number>();
        settle(Number.POSITIVE_INFINITY, touched);
        write(touched);
      }
    };

    const stopWatching = observeVisibility(
      pre,
      (visible) => {
        onScreen = visible;
        sync();
      },
      "0px",
    );
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    return () => {
      stopWatching();
      document.removeEventListener("visibilitychange", sync);
      motion.removeEventListener("change", sync);
      window.clearTimeout(timer);
    };
  }, [rows, cols]);

  return (
    <pre
      aria-hidden
      className={cn(
        "pointer-events-none shrink-0 overflow-hidden font-mono whitespace-pre select-none [contain:strict]",
        className,
      )}
      ref={ref}
      // Sized in em from the face's advance, so the box keeps its size (and
      // its place) while the web font loads.
      style={{
        width: `${cols * ADVANCE}em`,
        height: `${rows.length * LINE}em`,
        lineHeight: LINE,
      }}
    >
      {rows.map((row, index) => (
        <span className="block" key={index}>
          {row}
        </span>
      ))}
    </pre>
  );
});
