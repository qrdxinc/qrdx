"use client";

import { cn } from "@repo/design-system/lib/utils";
import Image from "next/image";
import { useState } from "react";
import type { PluginShot } from "./plugin-data";

// A plugin's real screenshots (./plugin-data.ts): one at a time, with
// thumbnails to switch when there are more. They all share one grid cell at
// the height of the widest, a narrower one centred, so switching never moves
// the page; each keeps its width and height, so nothing shifts as it loads.

/** The screenshot column: 7/12 of the 1280 px shell, less its padding. */
const SIZES = "(min-width: 1024px) 600px, 100vw";

export function PluginShots({ shots }: { shots: PluginShot[] }) {
  const [active, setActive] = useState(0);
  const widest = Math.max(...shots.map((shot) => shot.width / shot.height));
  const current = shots[active] ?? shots[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid">
        {shots.map((shot, index) => (
          <Image
            key={shot.src}
            src={shot.src}
            alt={shot.alt}
            width={shot.width}
            height={shot.height}
            sizes={SIZES}
            aria-hidden={index === active ? undefined : true}
            style={{
              width: `${(shot.width / shot.height / widest) * 100}%`,
            }}
            className={cn(
              "col-start-1 row-start-1 h-auto self-center justify-self-center transition-opacity duration-300 ease-out motion-reduce:transition-none",
              !shot.window && "rounded-lg border shadow-xs dark:shadow-none",
              index === active
                ? "opacity-100"
                : "pointer-events-none opacity-0",
            )}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {shots.length > 1 && (
          <div className="flex gap-2">
            {shots.map((shot, index) => (
              <button
                key={shot.src}
                type="button"
                aria-label={shot.caption}
                aria-pressed={index === active}
                onClick={() => setActive(index)}
                className={cn(
                  "relative h-11 w-16 shrink-0 overflow-hidden rounded-md border bg-muted transition-[opacity,border-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
                  index === active
                    ? "border-foreground/40"
                    : "opacity-50 hover:opacity-100",
                )}
              >
                <Image
                  src={shot.src}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-contain p-0.5"
                />
              </button>
            ))}
          </div>
        )}
        {current && (
          <p
            aria-live="polite"
            className="min-w-0 flex-1 basis-48 text-sm text-muted-foreground text-pretty"
          >
            {current.caption}
          </p>
        )}
      </div>
    </div>
  );
}
