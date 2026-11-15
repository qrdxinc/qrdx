"use client";

import { CANONICAL_HOST, CANONICAL_ORIGIN } from "@repo/config";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight, Scan } from "iconsax-reactjs";
import { useFormatter } from "next-intl";
import { QRCode } from "qrdx";
import type { QRProps } from "qrdx/types";
import { useEffect, useState } from "react";
import {
  SHOWCASE_ACCENT as ACCENT,
  SHOWCASE_INK as INK,
} from "@/lib/landing/showcase-styles";
import type { HeaderLink } from "./header-nav";
import styles from "./header-nav.module.css";
import { PanelLink } from "./header-nav-panel";

// The Product menu: one card per product with a small live picture of it,
// drawn in code. The codes are real (the qrdx engine renders them, so they
// scan); the numbers are examples. Color comes only from the codes and the
// one accent. Loaded lazily by header-nav.tsx, so the engine reaches a page
// only when someone heads for the menus.

/** Ticks while the panel is open; stays at 0 with reduced motion. */
function useTick(ms: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setTick((value) => value + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return tick;
}

const FADE = "transition-[opacity,transform] duration-500 ease-out";

// ── QR code generator: one code restyled as its color changes ──────────────

type Look = Pick<
  QRProps,
  | "fgColor"
  | "eyeColor"
  | "dotColor"
  | "bodyPattern"
  | "cornerEyePattern"
  | "cornerEyeDotPattern"
> & { swatch: string };

const LOOKS: Look[] = [
  {
    fgColor: INK,
    eyeColor: INK,
    dotColor: INK,
    bodyPattern: "rounded",
    cornerEyePattern: "rounded",
    cornerEyeDotPattern: "rounded",
    swatch: INK,
  },
  {
    fgColor: ACCENT,
    eyeColor: ACCENT,
    dotColor: ACCENT,
    bodyPattern: "circle",
    cornerEyePattern: "extra-rounded",
    cornerEyeDotPattern: "circle",
    swatch: ACCENT,
  },
  {
    fgColor: {
      type: "linear",
      angle: 135,
      stops: [
        { color: INK, offset: 0 },
        { color: ACCENT, offset: 100 },
      ],
    },
    eyeColor: INK,
    dotColor: ACCENT,
    bodyPattern: "rounded",
    cornerEyePattern: "rounded",
    cornerEyeDotPattern: "rounded",
    swatch: `linear-gradient(135deg, ${INK}, ${ACCENT})`,
  },
  {
    fgColor: "#52525b",
    eyeColor: INK,
    dotColor: INK,
    bodyPattern: "square",
    cornerEyePattern: "square",
    cornerEyeDotPattern: "square",
    swatch: "#52525b",
  },
];

function GeneratorArt() {
  const active = useTick(1800) % LOOKS.length;
  const look = LOOKS[active] ?? LOOKS[0];
  return (
    <span className="flex items-center gap-4">
      <span className={cn(styles.paper, "rounded-[14px] p-2.5 shadow-sm")}>
        <QRCode
          value={CANONICAL_ORIGIN}
          size={112}
          level="Q"
          hideLogo
          bgColor="#ffffff"
          fgColor={look?.fgColor}
          eyeColor={look?.eyeColor}
          dotColor={look?.dotColor}
          bodyPattern={look?.bodyPattern}
          cornerEyePattern={look?.cornerEyePattern}
          cornerEyeDotPattern={look?.cornerEyeDotPattern}
        />
      </span>
      <span className="flex flex-col gap-2">
        {LOOKS.map((item, index) => (
          <span
            key={item.swatch}
            className={cn(
              "size-4 rounded-full border border-foreground/15 ring-offset-2 ring-offset-[var(--card-bg)] transition-shadow duration-300",
              index === active
                ? "ring-[1.5px] ring-foreground/60"
                : "ring-0 ring-transparent",
            )}
            style={{ background: item.swatch }}
          />
        ))}
      </span>
    </span>
  );
}

// ── Dynamic QR codes: the link changes, the code and its scans stay ────────

const SCANS = [18, 24, 21, 30, 27, 36, 33, 42, 39, 48, 45, 56];
const CHART_W = 220;
const CHART_H = 64;

function chartPath(values: readonly number[]) {
  const max = Math.max(...values) * 1.15;
  const step = CHART_W / (values.length - 1);
  const points = values.map((value, i) => [
    i * step,
    CHART_H - (value / max) * CHART_H,
  ]);
  const line = points
    .map(([x, y], i) => `${i ? "L" : "M"}${x?.toFixed(1)} ${y?.toFixed(1)}`)
    .join(" ");
  return { line, area: `${line} L${CHART_W} ${CHART_H} L0 ${CHART_H} Z` };
}

const CHART = chartPath(SCANS);
const DESTINATIONS = ["/spring-menu.pdf", "/summer-menu.pdf"];

function DynamicArt() {
  const format = useFormatter();
  const tick = useTick(3200);
  const scans = 1284 + tick * 3;
  return (
    <span className="flex w-full max-w-[16rem] flex-col gap-2.5">
      <span className="flex items-center gap-2.5 rounded-[10px] border border-[var(--card-border)] bg-background px-2.5 py-2 shadow-xs">
        <span className={cn(styles.paper, "rounded-[5px] p-0.5")}>
          <QRCode value={`${CANONICAL_ORIGIN}/q/menu`} size={26} hideLogo />
        </span>
        <span className="flex min-w-0 flex-col font-mono text-[11px] leading-4">
          <span className="whitespace-nowrap text-foreground">
            {CANONICAL_HOST}/q/menu
          </span>
          {/* Stacked in one grid cell, so the box is as wide as the longest. */}
          <span className="grid overflow-hidden text-muted-foreground">
            {DESTINATIONS.map((destination, index) => (
              <span
                key={destination}
                className={cn(
                  "col-start-1 row-start-1 flex items-center gap-1 whitespace-nowrap",
                  FADE,
                  index === tick % DESTINATIONS.length
                    ? "translate-y-0 opacity-100"
                    : "translate-y-2 opacity-0",
                )}
              >
                <ArrowRight aria-hidden className="size-3" />
                {destination}
              </span>
            ))}
          </span>
        </span>
      </span>
      <span className="relative block">
        <svg
          aria-hidden
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="block h-16 w-full overflow-visible"
          preserveAspectRatio="none"
        >
          <path d={CHART.area} fill={ACCENT} opacity={0.08} />
          <path
            d={CHART.line}
            fill="none"
            stroke={ACCENT}
            strokeWidth={1.75}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="absolute top-0 right-0 flex items-center gap-1 rounded-full border border-[var(--card-border)] bg-background px-2 py-0.5 font-mono text-[11px] tabular-nums text-foreground shadow-xs">
          <Scan aria-hidden className="size-3 text-muted-foreground" />
          {format.number(scans)}
        </span>
      </span>
    </span>
  );
}

// ── AI QR art: three real art codes, one in front at a time ────────────────

const ART = ["coral-reef", "botanical-watercolor", "alpine-village"];

function ArtArt() {
  const active = useTick(2600) % ART.length;
  return (
    <span className="flex items-center gap-2.5">
      {ART.map((id, index) => (
        <img
          key={id}
          alt=""
          src={`/images/ai-art-styles/${id}.webp`}
          width={256}
          height={256}
          decoding="async"
          className={cn(
            "size-[84px] rounded-[10px] border border-[var(--paper-border)] object-cover",
            FADE,
            index === active ? "scale-100 opacity-100" : "scale-95 opacity-45",
          )}
        />
      ))}
    </span>
  );
}

// ── Barcodes: a real EAN-13, encoded here ──────────────────────────────────

const EAN_L = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011",
];
const invert = (bits: string) =>
  Array.from(bits, (bit) => (bit === "1" ? "0" : "1")).join("");
const EAN_R = EAN_L.map(invert);
const EAN_G = EAN_R.map((bits) => Array.from(bits).reverse().join(""));
const EAN_PARITY = [
  "LLLLLL",
  "LLGLGG",
  "LLGGLG",
  "LLGGGL",
  "LGLLGG",
  "LGGLLG",
  "LGGGLL",
  "LGLGLG",
  "LGLGGL",
  "LGGLGL",
];

/** The 95 modules of an EAN-13 ("1" = bar). */
function ean13(code: string): string {
  const digits = Array.from(code, Number);
  const parity = EAN_PARITY[digits[0] ?? 0] ?? "LLLLLL";
  const left = digits
    .slice(1, 7)
    .map((d, i) => (parity[i] === "G" ? EAN_G[d] : EAN_L[d]))
    .join("");
  const right = digits
    .slice(7)
    .map((d) => EAN_R[d])
    .join("");
  return `101${left}01010${right}101`;
}

const EAN = "4006381333931";
const EAN_BARS = Array.from(ean13(EAN)).flatMap((bit, x) =>
  bit === "1" ? [x] : [],
);
/** The guard bars run longer, like on a printed code. */
const isGuard = (x: number) => x < 3 || (x >= 45 && x < 50) || x >= 92;

function BarcodeArt() {
  return (
    <span className={cn(styles.paper, "rounded-[8px] px-2.5 pt-2 pb-1")}>
      <svg
        aria-hidden
        viewBox="0 0 95 34"
        className="block h-[38px] w-[106px]"
        shapeRendering="crispEdges"
      >
        {EAN_BARS.map((x) => (
          <rect
            key={x}
            x={x}
            y={0}
            width={1}
            height={isGuard(x) ? 34 : 30}
            fill="currentColor"
          />
        ))}
      </svg>
      <span className="block text-center font-mono text-[9px] leading-3 tracking-[0.18em]">
        {EAN}
      </span>
    </span>
  );
}

// ── Bulk generator: rows of a CSV turned into codes ────────────────────────

const ROWS = [62, 48, 56];

function BulkArt() {
  return (
    <span className="flex w-[8.5rem] flex-col gap-1">
      {ROWS.map((width, index) => (
        <span
          key={width}
          className="flex h-[22px] items-center gap-2 rounded-[6px] border border-[var(--card-border)] bg-background px-1 shadow-xs"
        >
          <span className={cn(styles.paper, "rounded-[3px] p-px")}>
            <QRCode
              value={`${CANONICAL_ORIGIN}/q/table-${index + 1}`}
              size={14}
              hideLogo
            />
          </span>
          <span
            className="h-1.5 rounded-full bg-foreground/15"
            style={{ width }}
          />
          <span className="ml-auto size-1.5 rounded-full bg-[var(--accent-dot)]" />
        </span>
      ))}
    </span>
  );
}

// ── Community: frames people share ─────────────────────────────────────────

const FRAMES: NonNullable<QRProps["frame"]>[] = [
  { style: "rounded-border", text: "", color: INK },
  { style: "phone", text: "", color: INK },
  { style: "rounded-border", text: "", color: ACCENT },
];

function CommunityArt() {
  return (
    <span className="flex items-end gap-2">
      {FRAMES.map((frame, index) => (
        <span
          key={index}
          className={cn(styles.paper, "rounded-[8px] p-1 shadow-xs")}
        >
          <QRCode
            value={`${CANONICAL_ORIGIN}/community`}
            size={38}
            hideLogo
            fgColor={frame.color}
            bodyPattern={index === 1 ? "circle" : "rounded"}
            cornerEyePattern="rounded"
            frame={frame}
          />
        </span>
      ))}
    </span>
  );
}

const ARTS = {
  generator: GeneratorArt,
  dynamic: DynamicArt,
  art: ArtArt,
  barcodes: BarcodeArt,
  bulk: BulkArt,
  community: CommunityArt,
} as const;

/** A card's name and promise; the link stretches over the whole card. */
function CardText({ link, pathname }: { link: HeaderLink; pathname: string }) {
  const Icon = link.icon;
  return (
    <PanelLink
      link={link}
      pathname={pathname}
      className="static gap-1 rounded-none p-0 after:absolute after:inset-0 after:rounded-[11px] after:content-[''] hover:bg-transparent focus:bg-transparent focus-visible:ring-0 focus-visible:outline-none"
    >
      <span className="flex items-center gap-2 text-sm font-medium leading-5 text-foreground">
        <Icon aria-hidden className="size-4 text-foreground/70" />
        {link.name}
      </span>
      <span className="text-[13px] leading-[18px] text-muted-foreground text-pretty">
        {link.description}
      </span>
    </PanelLink>
  );
}

/** The cards with a tall picture; the rest sit in a shorter row under them. */
const TALL = new Set<HeaderLink["art"]>(["generator", "dynamic", "art"]);

/** Up to three equal columns, so a row stays even when a card is hidden. */
const COLUMNS = ["grid-cols-1", "grid-cols-1", "grid-cols-2", "grid-cols-3"];

export default function ProductPanel({
  cards,
  pathname,
}: {
  cards: HeaderLink[];
  pathname: string;
}) {
  const tall = cards.filter((link) => TALL.has(link.art));
  const short = cards.filter((link) => !TALL.has(link.art));
  const art = (link: HeaderLink) => {
    const Art = link.art ? ARTS[link.art] : null;
    return Art ? <Art /> : null;
  };

  return (
    <div className="flex flex-col gap-3 p-3 [--accent-dot:var(--color-primary)]">
      {tall.length > 0 && (
        <ul className={cn("grid gap-3", COLUMNS[tall.length])}>
          {tall.map((link) => (
            <li
              key={link.href}
              className={cn(
                styles.card,
                "relative flex h-[15.5rem] flex-col overflow-hidden",
              )}
            >
              <span className="px-4 pt-4">
                <CardText link={link} pathname={pathname} />
              </span>
              <span
                aria-hidden
                className={cn(
                  styles.fade,
                  "pointer-events-none flex flex-1 items-start justify-center px-4 pt-4",
                )}
              >
                {art(link)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {short.length > 0 && (
        <ul className={cn("grid gap-3", COLUMNS[short.length])}>
          {short.map((link) => (
            <li
              key={link.href}
              className={cn(
                styles.card,
                "relative flex h-[6rem] items-center gap-3 overflow-hidden pl-4",
              )}
            >
              <span className="min-w-0 flex-1">
                <CardText link={link} pathname={pathname} />
              </span>
              <span
                aria-hidden
                className="pointer-events-none flex shrink-0 items-center justify-end pr-4"
              >
                {art(link)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
