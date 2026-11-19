"use client";

// Pictures that say what a community item is before it's opened: a frame
// drawn around an empty slot ("Your QR code") instead of a code, and a
// close-up of a theme's code (one eye and a patch of its dots). Drawn in the
// browser as they near the screen, like the cards' designs (./design-qr.tsx).

import { CANONICAL_ORIGIN } from "@repo/config";
import { cn } from "@repo/design-system/lib/utils";
import { Scanning } from "iconsax-reactjs";
import { getColorString, QRCode, QRFrameSVG } from "qrdx";
import { swatchStyle } from "@/lib/community/design-parts";
import { useNearViewport } from "@/lib/hooks/use-infinite-scroll";
import { styleEngineOptions } from "@/lib/qr-design/engine-options";
import type { ThemeStyles } from "@/types/theme";

/** The slot's own units (its viewBox): a 100 × 100 square. */
const SLOT = 100;

/**
 * What stands in for the code in a frame's slot, placed and sized by the
 * engine as the code would be (it gives the slot's <svg> its x, y, width
 * and height): the code's background, then a quiet dashed holder with a
 * scan mark and `label`.
 */
function CodeSlot({
  label,
  background,
  ...placement
}: {
  label: string;
  background: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}) {
  return (
    <svg {...placement} viewBox={`0 0 ${SLOT} ${SLOT}`}>
      <rect fill={background} height={SLOT} width={SLOT} />
      <rect
        fill="#f4f4f5"
        height={84}
        rx={6}
        stroke="#a1a1aa"
        strokeDasharray="3.5 2.5"
        strokeWidth={1}
        width={84}
        x={8}
        y={8}
      />
      <Scanning color="#71717a" size={24} x={38} y={25} />
      <text
        fill="#71717a"
        fontSize={10.5}
        fontWeight={500}
        textAnchor="middle"
        x={SLOT / 2}
        y={67}
      >
        {label}
      </text>
    </svg>
  );
}

/** A frame (`style.frame`) with an empty slot where the code goes. */
export function FrameSlot({
  style,
  label,
  className,
}: {
  style: ThemeStyles;
  /** The slot's words ("Your QR code") */
  label: string;
  className?: string;
}) {
  if (!style.frame) return null;
  return (
    <div
      className={cn(
        "flex items-center justify-center [&>svg]:size-full",
        className,
      )}
    >
      <QRFrameSVG
        aria-hidden
        bgColor={style.bgColor}
        frame={style.frame}
        slot={
          <CodeSlot
            background={getColorString(style.bgColor, "#ffffff")}
            label={label}
          />
        }
      />
    </div>
  );
}

/** FrameSlot drawn once it nears the screen (`eager`: on the server too). */
export function LazyFrameSlot({
  eager = false,
  className,
  ...props
}: {
  style: ThemeStyles;
  label: string;
  className?: string;
  eager?: boolean;
}) {
  const [ref, near] = useNearViewport<HTMLDivElement>({ initial: eager });
  if (near) return <FrameSlot className={className} {...props} />;
  return <div aria-hidden className={className} ref={ref} />;
}

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
 * The part of it a swatch shows: the margin, the top-left eye and the dots
 * beside and under it, short of the top-right eye (4:3).
 */
export const SWATCH_VIEW_BOX = "0 0 180 135";

/** A close-up of a theme's code: one eye and a patch of its dots. */
export function SwatchCrop({
  style,
  className,
}: {
  style: ThemeStyles;
  className?: string;
}) {
  const look = swatchStyle(style);
  return (
    <div className={cn("[&>svg]:size-full", className)}>
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
        preserveAspectRatio="xMinYMin slice"
        size={SWATCH_CODE.size}
        value={SWATCH_CODE.value}
        viewBox={SWATCH_VIEW_BOX}
        {...styleEngineOptions(look)}
      />
    </div>
  );
}

/** SwatchCrop drawn once it nears the screen (`eager`: on the server too). */
export function LazySwatchCrop({
  eager = false,
  className,
  ...props
}: {
  style: ThemeStyles;
  className?: string;
  eager?: boolean;
}) {
  const [ref, near] = useNearViewport<HTMLDivElement>({ initial: eager });
  if (near) return <SwatchCrop className={className} {...props} />;
  return <div aria-hidden className={className} ref={ref} />;
}
