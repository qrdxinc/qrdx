import { CloseCircle, type Icon, TickCircle } from "iconsax-reactjs";
import { QRCodeSVG, type QRProps } from "qrdx";
import type { ReactNode } from "react";

// The pieces the concept diagrams (./*.tsx) are drawn with: hand-written
// SVG in the docs' own monochrome, one accent (the design system's
// --primary), theme-aware through CSS variables, text from the messages
// file. No gradients, no glows, no decoration.

export const INK = "currentColor";
export const ACCENT = "var(--primary)";
export const MUTED = "var(--muted-foreground)";
export const SURFACE = "var(--card)";
export const SURFACE_2 = "var(--muted)";
export const LINE = "var(--border)";

export interface DiagramProps {
  /** The diagram's translated labels, by key (components/mdx/shot-diagram.tsx). */
  labels: Record<string, string>;
}

/** The outer <svg>: a fixed drawing box that scales with the page, markers for arrows. */
export function Canvas({
  width,
  height,
  title,
  children,
}: {
  width: number;
  height: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <svg
      aria-label={title}
      className="block h-auto w-full select-none text-fd-foreground"
      fontFamily="inherit"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <defs>
        <marker
          id="dg-arrow"
          markerHeight="8"
          markerWidth="8"
          orient="auto-start-reverse"
          refX="7"
          refY="4"
          viewBox="0 0 8 8"
        >
          <path
            d="M0 0.5 L7 4 L0 7.5"
            fill="none"
            stroke={INK}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </marker>
        <marker
          id="dg-arrow-accent"
          markerHeight="8"
          markerWidth="8"
          orient="auto-start-reverse"
          refX="7"
          refY="4"
          viewBox="0 0 8 8"
        >
          <path
            d="M0 0.5 L7 4 L0 7.5"
            fill="none"
            stroke={ACCENT}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </marker>
        <marker
          id="dg-arrow-muted"
          markerHeight="8"
          markerWidth="8"
          orient="auto-start-reverse"
          refX="7"
          refY="4"
          viewBox="0 0 8 8"
        >
          <path
            d="M0 0.5 L7 4 L0 7.5"
            fill="none"
            stroke={MUTED}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </marker>
      </defs>
      {children}
    </svg>
  );
}

/** A box with an icon, a label and an optional second line. `accent` marks the step the page is about. */
export function Node({
  x,
  y,
  width,
  height = 64,
  icon: IconComponent,
  label,
  note,
  accent = false,
  dashed = false,
}: {
  x: number;
  y: number;
  width: number;
  height?: number;
  icon?: Icon;
  label: string;
  note?: string;
  accent?: boolean;
  dashed?: boolean;
}) {
  const textX = x + (IconComponent ? 48 : 16);
  const middle = y + height / 2;
  return (
    <g>
      <rect
        fill={SURFACE}
        height={height}
        rx="12"
        stroke={accent ? ACCENT : LINE}
        strokeDasharray={dashed ? "4 4" : undefined}
        strokeWidth={accent ? 1.5 : 1}
        width={width}
        x={x}
        y={y}
      />
      {IconComponent && (
        <g
          color={accent ? ACCENT : INK}
          transform={`translate(${x + 16}, ${middle - 11})`}
        >
          <IconComponent
            aria-hidden
            color="currentColor"
            size={22}
            variant="Linear"
          />
        </g>
      )}
      <text
        fill={INK}
        fontSize="13.5"
        fontWeight="600"
        x={textX}
        y={note ? middle - 3 : middle + 5}
      >
        {label}
      </text>
      {note && (
        <text fill={MUTED} fontSize="12" x={textX} y={middle + 15}>
          {note}
        </text>
      )}
    </g>
  );
}

/** A straight arrow from (x1, y1) to (x2, y2). */
export function Arrow({
  x1,
  y1,
  x2,
  y2,
  tone = "ink",
  dashed = false,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tone?: "ink" | "accent" | "muted";
  dashed?: boolean;
}) {
  const stroke = tone === "accent" ? ACCENT : tone === "muted" ? MUTED : INK;
  const marker =
    tone === "accent"
      ? "url(#dg-arrow-accent)"
      : tone === "muted"
        ? "url(#dg-arrow-muted)"
        : "url(#dg-arrow)";
  return (
    <line
      markerEnd={marker}
      stroke={stroke}
      strokeDasharray={dashed ? "4 4" : undefined}
      strokeLinecap="round"
      strokeWidth="1.5"
      x1={x1}
      x2={x2}
      y1={y1}
      y2={y2}
    />
  );
}

/** An arrow with one right-angle turn: horizontal first, then vertical. */
export function Elbow({
  x1,
  y1,
  x2,
  y2,
  tone = "ink",
  dashed = false,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tone?: "ink" | "accent" | "muted";
  dashed?: boolean;
}) {
  const stroke = tone === "accent" ? ACCENT : tone === "muted" ? MUTED : INK;
  const marker =
    tone === "accent"
      ? "url(#dg-arrow-accent)"
      : tone === "muted"
        ? "url(#dg-arrow-muted)"
        : "url(#dg-arrow)";
  return (
    <path
      d={`M${x1} ${y1} H${x2} V${y2}`}
      fill="none"
      markerEnd={marker}
      stroke={stroke}
      strokeDasharray={dashed ? "4 4" : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  );
}

/** A short caption on the drawing, in the muted ink. */
export function Note({
  x,
  y,
  children,
  anchor = "start",
  accent = false,
}: {
  x: number;
  y: number;
  children: string;
  anchor?: "start" | "middle" | "end";
  accent?: boolean;
}) {
  return (
    <text
      fill={accent ? ACCENT : MUTED}
      fontSize="12"
      textAnchor={anchor}
      x={x}
      y={y}
    >
      {children}
    </text>
  );
}

/** A small pill with a code-like value, such as a URL. */
export function Pill({
  x,
  y,
  children,
  anchor = "start",
}: {
  x: number;
  y: number;
  children: string;
  anchor?: "start" | "middle" | "end";
}) {
  const width = children.length * 6.6 + 16;
  const left =
    anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
  return (
    <g>
      <rect
        fill={SURFACE_2}
        height="22"
        rx="11"
        width={width}
        x={left}
        y={y - 15}
      />
      <text
        fill={INK}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize="11"
        textAnchor={anchor}
        x={anchor === "middle" ? x : anchor === "end" ? x - 8 : x + 8}
        y={y}
      >
        {children}
      </text>
    </g>
  );
}

/** The link the sample codes in the drawings hold. */
const SAMPLE_VALUE = "https://qrdx.dev/docs";

/**
 * A real QR code, drawn by the engine (never a made-up pattern), placed at
 * (x, y). `crop` shows only the top-left `crop` pixels of a code drawn at
 * `size`, enlarged to `show`: a close look at one corner eye.
 */
export function SampleCode({
  x,
  y,
  size,
  crop,
  show,
  ...props
}: {
  x: number;
  y: number;
  size: number;
  crop?: number;
  show?: number;
} & Omit<QRProps, "value" | "size">) {
  const code = <QRCodeSVG size={size} value={SAMPLE_VALUE} {...props} />;
  if (crop && show) {
    return (
      <svg
        aria-hidden
        height={show}
        viewBox={`0 0 ${crop} ${crop}`}
        width={show}
        x={x}
        y={y}
      >
        {code}
      </svg>
    );
  }
  return (
    <g aria-hidden transform={`translate(${x}, ${y})`}>
      {code}
    </g>
  );
}

/** A tick or a cross with a label and an optional second line: the verdict under a sample. */
export function Verdict({
  x,
  y,
  ok,
  label,
  note,
}: {
  x: number;
  y: number;
  ok: boolean;
  label: string;
  note?: string;
}) {
  const Mark = ok ? TickCircle : CloseCircle;
  return (
    <g>
      <g color={ok ? ACCENT : MUTED} transform={`translate(${x}, ${y - 14})`}>
        <Mark aria-hidden color="currentColor" size={18} variant="Bold" />
      </g>
      <text fill={INK} fontSize="13.5" fontWeight="600" x={x + 26} y={y}>
        {label}
      </text>
      {note && (
        <text fill={MUTED} fontSize="12" x={x + 26} y={y + 18}>
          {note}
        </text>
      )}
    </g>
  );
}

/** WCAG contrast ratio of two #rrggbb colors, to one decimal ("17.7"). */
export function contrastRatio(a: string, b: string): string {
  const luminance = (hex: string) => {
    const channel = (index: number) => {
      const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
      return value <= 0.039_28
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return ((light + 0.05) / (dark + 0.05)).toFixed(1);
}
