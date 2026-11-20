"use client";

// "How it looks" on a frame's or theme's page: a bento of tiles, each
// showing the design somewhere real, each with its own motion when hovered,
// or tapped on a touch screen (./item-previews.module.css). Every design
// draws in the browser as it nears the screen (LazyDesignQr), so the page's
// HTML carries none of them. The tiles are pictures: their names are for
// screen readers only.

import { CANONICAL_ORIGIN } from "@repo/config";
import { cn } from "@repo/design-system/lib/utils";
import { Link21, TickCircle } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { getColorString, getFrameDimensions } from "qrdx";
import type { AnyQRFrame } from "qrdx/types";
import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
} from "react";
import type { ThemeStyles } from "@/types/theme";
import { LazyDesignQr } from "./design-qr";
import s from "./item-previews.module.css";

/** What the sample codes open (DesignQr's default value), as shown. */
const SAMPLE_LINK = `${new URL(CANONICAL_ORIGIN).host}/community`;

/** Hue, saturation and lightness (0-1) of a #rgb or #rrggbb color. */
function hsl(hex: string): { s: number; l: number } | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map(
    (i) => Number.parseInt(h.slice(i, i + 2), 16) / 255,
  );
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s: sat, l };
}

/** A silver for designs with no color in them (black on white). */
const NEUTRAL_TONE = "#b8b8c0";

/**
 * The color a design's tiles are lit with: its most colorful color (of the
 * background, dots, eyes and foreground), so a theme on white still lights
 * its tiles in its own hue. Black and white designs get a quiet silver.
 */
export function toneOf(style: ThemeStyles): string {
  let best = { color: NEUTRAL_TONE, score: 0.12 };
  for (const config of [
    style.bgColor,
    style.dotColor,
    style.eyeColor,
    style.fgColor,
  ]) {
    if (!config) continue;
    const color = getColorString(config, "");
    const parts = hsl(color);
    if (!parts) continue;
    const score = parts.s * (1 - Math.abs(parts.l - 0.5) * 1.2);
    if (score > best.score) best = { color, score };
  }
  return best.color;
}

/** A design without the frame it may carry. */
const unframed = (style: ThemeStyles): ThemeStyles => {
  const { frame: _frame, ...look } = style;
  return look;
};

/**
 * A design's width over its height: 1 for a code, a frame's own shape
 * otherwise (tall table tents, wide banners), so each tile sizes the
 * design to fit it whole.
 */
export function aspectOf(style: ThemeStyles): number {
  if (!style.frame) return 1;
  const { width, height } = getFrameDimensions(256, style.frame);
  return width > 0 && height > 0 ? width / height : 1;
}

/** The CSS custom property that carries a design's shape to its tile. */
const shape = (style: ThemeStyles) =>
  ({ "--fa": aspectOf(style).toFixed(4) }) as CSSProperties;

/**
 * The tiles' grid. A glow in the design's color follows the pointer round
 * every tile's edge.
 */
function Bento({ tone, children }: { tone: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const tiles = () =>
    ref.current
      ? [...ref.current.querySelectorAll<HTMLElement>("[data-tile]")]
      : [];
  const onPointerMove = (event: ReactPointerEvent) => {
    if (event.pointerType === "touch") return;
    for (const tile of tiles()) {
      const box = tile.getBoundingClientRect();
      tile.style.setProperty("--mx", `${event.clientX - box.left}px`);
      tile.style.setProperty("--my", `${event.clientY - box.top}px`);
    }
  };
  const onPointerLeave = () => {
    for (const tile of tiles()) {
      tile.style.removeProperty("--mx");
      tile.style.removeProperty("--my");
    }
  };
  return (
    <div
      className={s.grid}
      onPointerLeave={onPointerLeave}
      onPointerMove={onPointerMove}
      ref={ref}
      style={{ "--tone": tone } as CSSProperties}
    >
      {children}
    </div>
  );
}

/**
 * One tile: a lit stage. Hovering plays its motion; on a touch screen a tap
 * plays it and another tap puts it back.
 */
function Tile({
  label,
  className,
  children,
  tileRef,
  design,
}: {
  label: string;
  className?: string;
  children: ReactNode;
  tileRef?: React.Ref<HTMLElement>;
  /** The design it shows, for its shape (--fa) */
  design?: ThemeStyles;
}) {
  return (
    <figure
      className={cn(s.tile, className)}
      data-tile=""
      style={design ? shape(design) : undefined}
      onPointerUp={(event) => {
        if (event.pointerType !== "mouse") {
          event.currentTarget.toggleAttribute("data-on");
        }
      }}
      ref={tileRef}
    >
      <figcaption className="sr-only">{label}</figcaption>
      <div aria-hidden className="contents">
        {children}
      </div>
    </figure>
  );
}

/** Bars that stand for lines of text. */
function Bars({ widths, dark = 0 }: { widths: number[]; dark?: number }) {
  return widths.map((width, index) => (
    <span
      className={cn(s.bar, index < dark && s.barDark)}
      key={index}
      style={{ width: `${width}%` }}
    />
  ));
}

/** Two springs (Holo Card's: stiff, a little underdamped) chase a target. */
const spring = () => ({
  x: 0,
  v: 0,
  t: 0,
  step(dt: number) {
    const a = 120 * (this.t - this.x) - 10 * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
  },
});

/**
 * The design as a die-cut sticker (the wide tile): it tilts toward the
 * pointer on springs while the foil and the glare follow the pointer at
 * once, its corner peels on hover, and it sways a little on its own.
 */
function StickerTile({ style, label }: { style: ThemeStyles; label: string }) {
  const tileRef = useRef<HTMLElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const tile = tileRef.current;
    const rig = rigRef.current;
    const ground = groundRef.current;
    if (!tile || !rig || !ground) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const sx = spring();
    const sy = spring();
    let hovering = false;
    let visible = false;
    let raf = 0;
    let last = 0;
    let clock = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.04, (now - (last || now)) / 1000);
      last = now;
      clock += dt;
      if (!hovering) {
        sx.t = Math.sin(clock * 0.9) * 3;
        sy.t = Math.cos(clock * 0.7) * 6;
        tile.style.setProperty(
          "--px",
          (0.55 + Math.cos(clock * 0.7) * 0.25).toFixed(3),
        );
        tile.style.setProperty(
          "--py",
          (0.35 + Math.sin(clock * 0.9) * 0.15).toFixed(3),
        );
      }
      sx.step(dt);
      sy.step(dt);
      rig.style.transform = `rotateX(${sx.x.toFixed(2)}deg) rotateY(${sy.x.toFixed(2)}deg)`;
      tile.style.setProperty("--hue", (sy.x * 5).toFixed(1));
      ground.style.transform = `translate(${(-sy.x * 1.5).toFixed(1)}px, ${sx.x.toFixed(1)}px)`;
      raf = visible ? requestAnimationFrame(frame) : 0;
      if (!raf) last = 0;
    };
    const kick = () => {
      if (!raf && visible) raf = requestAnimationFrame(frame);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const box = tile.getBoundingClientRect();
      const px = (event.clientX - box.left) / box.width;
      const py = (event.clientY - box.top) / box.height;
      tile.style.setProperty("--px", px.toFixed(3));
      tile.style.setProperty("--py", py.toFixed(3));
      sx.t = -(py - 0.5) * 22;
      sy.t = (px - 0.62) * 34;
      hovering = true;
      kick();
    };
    const onLeave = () => {
      hovering = false;
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      kick();
    });
    observer.observe(tile);
    tile.addEventListener("pointermove", onMove);
    tile.addEventListener("pointerleave", onLeave);
    return () => {
      observer.disconnect();
      tile.removeEventListener("pointermove", onMove);
      tile.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <Tile className={s.hero} design={style} label={label} tileRef={tileRef}>
      <span className={s.ground} ref={groundRef} />
      {/* Two more from the same sheet, scattered behind it */}
      <div className={cn(s.sticker, s.sideSticker, s.sideLeft)}>
        <LazyDesignQr style={style} />
      </div>
      <div className={cn(s.sticker, s.sideSticker, s.sideRight)}>
        <LazyDesignQr style={style} />
      </div>
      <div className={s.center}>
        <div className={s.stickerRig} ref={rigRef}>
          <div className={s.sticker}>
            <LazyDesignQr style={style} />
            <span className={s.foil} />
            <span className={s.glare} />
            <span className={s.peel} />
          </div>
        </div>
      </div>
    </Tile>
  );
}

/** The design on its hosted page: it scrolls to the code and taps it. */
function PhoneTile({ style, label }: { style: ThemeStyles; label: string }) {
  return (
    <Tile className={s.tall} design={style} label={label}>
      <span className={s.floor} />
      <span className={s.ground} style={{ width: "40%", bottom: "22%" }} />
      <div className={s.center}>
        <div className={s.phone}>
          <div className={s.screen}>
            <span className={s.island} />
            <span className={s.done}>
              <TickCircle size={16} variant="Bold" />
            </span>
            <div className={s.page}>
              <span className={s.avatar} />
              <Bars dark={1} widths={[46, 62]} />
              <span className={s.photo} />
              <span className={s.button} />
              <span className={s.button} />
              <span className={s.codeOnPage}>
                <LazyDesignQr className="size-full" style={style} />
                <span className={s.tap} />
              </span>
              <span className={cn(s.button, s.buttonInk)} />
              <span className={s.button} />
              <span className={s.button} />
              <Bars widths={[70, 52]} />
            </div>
          </div>
        </div>
      </div>
    </Tile>
  );
}

/** A business card: hovering flips it to the code on its back. */
function CardTile({ style, label }: { style: ThemeStyles; label: string }) {
  return (
    <Tile design={style} label={label}>
      <span className={s.floor} />
      <span className={cn(s.ground, s.flipGround)} style={{ bottom: "22%" }} />
      <div className={s.center}>
        <div className={s.cards}>
          <div className={s.flipper}>
            <div className={cn(s.face, s.front)}>
              <span className={s.mark} />
              <span className={s.lines}>
                <Bars dark={1} widths={[52, 70, 44]} />
              </span>
            </div>
            <div
              className={cn(s.face, s.back)}
              style={{ background: getColorString(style.bgColor, "#ffffff") }}
            >
              <LazyDesignQr style={style} />
              <span className={s.lines}>
                <Bars dark={1} widths={[80, 60, 70]} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </Tile>
  );
}

/** A table tent with the design in a frame; a phone rises and scans it. */
function TentTile({
  framed,
  look,
  label,
}: {
  framed: ThemeStyles;
  look: ThemeStyles;
  label: string;
}) {
  return (
    <Tile design={framed} label={label}>
      <span className={s.floor} />
      <span className={s.ground} style={{ width: "42%", bottom: "22%" }} />
      <div className={cn(s.center, s.onFloor)}>
        <div className={s.tent}>
          <span className={s.tentBack} />
          <LazyDesignQr className={s.tentFace} style={framed} />
        </div>
      </div>
      <div className={s.scanner}>
        <div className={s.view}>
          <LazyDesignQr style={look} />
          <span className={s.brackets} />
        </div>
      </div>
      <span className={s.link}>
        <span className={s.linkDot}>
          <Link21 size={11} />
        </span>
        {SAMPLE_LINK}
      </span>
    </Tile>
  );
}

/** A poster in a shop window: the lights come on and the poster swings. */
function WindowTile({
  style,
  label,
  wide = false,
}: {
  style: ThemeStyles;
  label: string;
  wide?: boolean;
}) {
  return (
    <Tile className={cn(wide && s.wide)} design={style} label={label}>
      <div className={s.window}>
        <span className={s.lights} />
        <span className={s.sill} />
      </div>
      <div className={s.hanger}>
        <span className={s.strings} />
        <div className={s.poster}>
          <Bars dark={1} widths={[82, 60, 46]} />
          <LazyDesignQr style={style} />
        </div>
      </div>
      <span className={s.reflect} />
    </Tile>
  );
}

/** The design in frames, held like a hand of cards that fans out. */
function FanTile({
  look,
  frames,
  label,
}: {
  look: ThemeStyles;
  frames: AnyQRFrame[];
  label: string;
}) {
  return (
    <Tile label={label}>
      <span className={s.floor} />
      <span className={s.ground} style={{ width: "44%", bottom: "22%" }} />
      <div className={cn(s.center, s.onFloor)}>
        <div className={s.fan}>
          {frames.slice(0, 3).map((frame, index) => (
            <LazyDesignQr
              className={s.fanCard}
              key={index}
              style={{ ...look, frame }}
            />
          ))}
        </div>
      </div>
    </Tile>
  );
}

/** A name badge on a lanyard that swings. */
function BadgeTile({ style, label }: { style: ThemeStyles; label: string }) {
  return (
    <Tile design={style} label={label}>
      <span className={s.floor} />
      <div className={s.badgeRig}>
        <span className={s.lanyard} />
        <span className={s.clip} />
        <div className={s.badge}>
          <Bars dark={1} widths={[60]} />
          <LazyDesignQr style={style} />
          <span className={s.stripe} />
        </div>
      </div>
    </Tile>
  );
}

/** Characters the ASCII code is made of: dense ones, so dark squares stay dark. */
const GLYPHS = "QRDX01#@%&$*+";
/** Characters across the tile's field, and across the code. */
const FIELD_COLUMNS = 130;
const CODE_COLUMNS = 64;

/** A line of `length` random characters. */
const glyphLine = (length: number) =>
  Array.from(
    { length },
    () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
  ).join("");

/**
 * The design as ASCII art (the full-width tile): the code made only of
 * characters flowing in the design's colors, glowing on black, in a dim
 * field of characters that keeps changing; hovering speeds it up.
 *
 * How: the code is drawn white on black, and a black sheet of colored
 * characters is multiplied over it, so color survives only where a
 * character falls on one of the code's squares. Characters are drawn in
 * the browser.
 */
function AsciiTile({ style, label }: { style: ThemeStyles; label: string }) {
  const tileRef = useRef<HTMLElement>(null);
  const fieldRef = useRef<HTMLPreElement>(null);
  const codeRef = useRef<HTMLPreElement>(null);
  // White squares on black: the multiply keeps color only on the squares
  const mask: ThemeStyles = {
    ...unframed(style),
    bgColor: "#000000",
    fgColor: "#ffffff",
    dotColor: "#ffffff",
    eyeColor: "#ffffff",
    eyeColors: undefined,
  };

  useEffect(() => {
    const tile = tileRef.current;
    const field = fieldRef.current;
    const code = codeRef.current;
    if (!tile || !field || !code) return;
    const rows = 40;
    const fill = (pre: HTMLPreElement, columns: number, lines: number) => {
      pre.textContent = Array.from({ length: lines }, () =>
        glyphLine(columns),
      ).join("\n");
    };
    fill(field, FIELD_COLUMNS, rows);
    fill(code, CODE_COLUMNS, CODE_COLUMNS);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let visible = false;
    let hovering = false;
    let timer = 0;
    // Swap a share of the characters, more of them while hovered
    const tick = () => {
      for (const pre of [field, code]) {
        const text = [...(pre.textContent ?? "")];
        const swaps = Math.floor(text.length * (hovering ? 0.12 : 0.025));
        for (let i = 0; i < swaps; i++) {
          const at = Math.floor(Math.random() * text.length);
          if (text[at] !== "\n")
            text[at] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
        pre.textContent = text.join("");
      }
      timer = visible ? window.setTimeout(tick, hovering ? 70 : 160) : 0;
    };
    const start = () => {
      if (!timer && visible) timer = window.setTimeout(tick, 160);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      start();
    });
    observer.observe(tile);
    const enter = () => {
      hovering = true;
    };
    const leave = () => {
      hovering = false;
    };
    tile.addEventListener("pointerenter", enter);
    tile.addEventListener("pointerleave", leave);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      tile.removeEventListener("pointerenter", enter);
      tile.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <Tile className={s.ascii} label={label} tileRef={tileRef}>
      <pre className={s.field} ref={fieldRef} />
      <div className={s.asciiCode}>
        <LazyDesignQr className="size-full" style={mask} />
        <div className={s.asciiInk}>
          <pre className={s.glyphs} ref={codeRef} />
        </div>
      </div>
    </Tile>
  );
}

/**
 * A frame in use: as a sticker, on its hosted page, on a business card, on
 * a table tent (scanned), in a shop window, on a badge and as ASCII art.
 */
export function FrameInUse({ style }: { style: ThemeStyles }) {
  const t = useTranslations("community.itemPreviews");
  return (
    <Bento tone={toneOf(style)}>
      <StickerTile label={t("asASticker")} style={style} />
      <PhoneTile label={t("onAPhone")} style={style} />
      <CardTile label={t("onABusinessCard")} style={style} />
      <TentTile
        framed={style}
        label={t("onATableTent")}
        look={unframed(style)}
      />
      <WindowTile label={t("onAPoster")} style={style} wide />
      <BadgeTile label={t("onABadge")} style={style} />
      <AsciiTile label={t("asAsciiArt")} style={style} />
    </Bento>
  );
}

/**
 * A theme in use: as a sticker, on its hosted page, on a business card, in
 * a frame on a table tent (its own frame if it has one), in a shop window,
 * in frames, on a badge and as ASCII art.
 */
export function ThemeInUse({
  look,
  frames,
}: {
  /** The theme without a frame */
  look: ThemeStyles;
  /** Frames to show it in, its own first if it has one */
  frames: { name: string | null; frame: AnyQRFrame }[];
}) {
  const t = useTranslations("community.itemPreviews");
  const first = frames[0]?.frame;
  return (
    <Bento tone={toneOf(look)}>
      <StickerTile label={t("asASticker")} style={look} />
      <PhoneTile label={t("onAPhone")} style={look} />
      <CardTile label={t("onABusinessCard")} style={look} />
      <TentTile
        framed={first ? { ...look, frame: first } : look}
        label={t("onATableTent")}
        look={look}
      />
      <WindowTile label={t("onAPoster")} style={look} />
      <FanTile
        frames={frames.map((entry) => entry.frame)}
        label={t("inFrames")}
        look={look}
      />
      <BadgeTile label={t("onABadge")} style={look} />
      <AsciiTile label={t("asAsciiArt")} style={look} />
    </Bento>
  );
}
