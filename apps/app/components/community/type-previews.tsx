"use client";

// A theme's swatch: a close-up of its code (one eye and a patch of its
// dots), drawn in the browser as it nears the screen, like the cards'
// designs (./design-qr.tsx). How it moves on a card is ./stage.module.css.

import { CANONICAL_ORIGIN } from "@repo/config";
import { cn } from "@repo/design-system/lib/utils";
import { QRCode } from "qrdx";
import type { CSSProperties } from "react";
import { swatchStyle } from "@/lib/community/design-parts";
import { useNearViewport } from "@/lib/hooks/use-infinite-scroll";
import { styleEngineOptions } from "@/lib/qr-design/engine-options";
import type { ThemeStyles } from "@/types/theme";
import stage from "./stage.module.css";

/**
 * The code a swatch is cut from: this link at level L with a one-module
 * margin is 25 modules across (27 with the margin), drawn 10 units a
 * module, so the top-left eye spans 10–80 and the top-right one starts at
 * 190 (tests/community/type-previews.test.tsx checks it).
 */
export const SWATCH_CODE = {
  value: `${CANONICAL_ORIGIN}/community`,
  level: "L",
  margin: 1,
  size: 270,
} as const;

/**
 * How close a swatch is at rest: this many of the code's units across its
 * box (the top-left eye and the dots beside it, short of the next eye).
 */
export const SWATCH_UNITS = 180;

/**
 * Where the close-up starts, in the code's units: a little before its
 * corner, so the corner shows with room around it (the type's label sits
 * there on a card).
 */
const SWATCH_START = -24;

/** The whole code's share of the box's shorter side, pulled back. */
const SWATCH_PULLED_BACK = 0.68;

/**
 * The swatch code's two transforms for a box of `aspect` (width / height),
 * as CSS variables: the close-up at rest, and the whole code centred on its
 * background when the card is hovered (./stage.module.css). Both are
 * transforms of one element, so one transition carries it from one to the
 * other. The element is SWATCH_CODE.size / SWATCH_UNITS box widths across,
 * so the close-up draws at its full size; pulling back scales it down.
 */
export function swatchTransforms(aspect: number): CSSProperties {
  const side = SWATCH_CODE.size / SWATCH_UNITS;
  const rest = (-SWATCH_START / SWATCH_UNITS / side) * 100;
  const whole = SWATCH_PULLED_BACK * Math.min(1, 1 / aspect);
  const x = ((1 - whole) / 2 / side) * 100;
  const y = ((1 / aspect - whole) / 2 / side) * 100;
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    "--swatch-rest": `translate(${round(rest)}%, ${round(rest)}%) scale(1)`,
    "--swatch-full": `translate(${round(x)}%, ${round(y)}%) scale(${round(whole / side)})`,
  } as CSSProperties;
}

/**
 * A close-up of a theme's code, one eye and a patch of its dots, filling a
 * box of `aspect` (width / height) that clips it. The whole code is drawn;
 * a transform crops it, so a hovered card can pull back to all of it.
 */
export function SwatchCrop({
  style,
  aspect = 4 / 3,
  className,
}: {
  style: ThemeStyles;
  aspect?: number;
  className?: string;
}) {
  const look = swatchStyle(style);
  return (
    <div
      className={cn(
        "absolute top-0 left-0 aspect-square [&>svg]:size-full",
        stage.swatchCode,
        className,
      )}
      data-swatch-code=""
      style={{
        width: `${(SWATCH_CODE.size / SWATCH_UNITS) * 100}%`,
        ...swatchTransforms(aspect),
      }}
    >
      <QRCode
        aria-hidden
        bgColor={look.bgColor}
        bodyPattern={look.bodyPattern}
        cornerEyeDotPattern={look.cornerEyeDotPattern}
        cornerEyePattern={look.cornerEyePattern}
        dotColor={look.dotColor}
        eyeColor={look.eyeColor}
        fgColor={look.fgColor}
        hideLogo
        level={SWATCH_CODE.level}
        margin={SWATCH_CODE.margin}
        size={SWATCH_CODE.size}
        value={SWATCH_CODE.value}
        {...styleEngineOptions(look)}
      />
    </div>
  );
}

/** SwatchCrop drawn once it nears the screen (`eager`: on the server too). */
export function LazySwatchCrop({
  eager = false,
  ...props
}: {
  style: ThemeStyles;
  aspect?: number;
  className?: string;
  eager?: boolean;
}) {
  const [ref, near] = useNearViewport<HTMLDivElement>({ initial: eager });
  if (near) return <SwatchCrop {...props} />;
  return <div aria-hidden className="absolute inset-0" ref={ref} />;
}
