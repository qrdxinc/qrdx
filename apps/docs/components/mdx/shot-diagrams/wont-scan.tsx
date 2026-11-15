import { Mobile } from "iconsax-reactjs";
import {
  Canvas,
  contrastRatio,
  type DiagramProps,
  INK,
  LINE,
  MUTED,
  Note,
  SampleCode,
  Verdict,
} from "./parts";

// The pictures on help/troubleshooting/wont-scan: each cause next to its
// fix. Every code in them is drawn by the engine with the props named here.

const WHITE = "#ffffff";
const DARK = "#111827";
const PALE = "#c9ccd1";
/** The artwork a code sits on in the quiet-zone picture. */
const ARTWORK = "#475569";

/** A light plate with a hairline, so a white code reads as a tile in both themes. */
function Plate({
  x,
  y,
  size,
  fill = WHITE,
}: {
  x: number;
  y: number;
  size: number;
  fill?: string;
}) {
  return (
    <rect
      fill={fill}
      height={size}
      rx="10"
      stroke={LINE}
      width={size}
      x={x}
      y={y}
    />
  );
}

/** Dark on light scans; light gray on white doesn't. */
export function WontScanContrast({ labels }: DiagramProps) {
  const ratio = (color: string) =>
    labels.ratio.replace("{ratio}", contrastRatio(color, WHITE));
  return (
    <Canvas height={252} title={labels.title} width={600}>
      <Plate size={176} x={40} y={16} />
      <SampleCode fgColor={DARK} margin={2} size={160} x={48} y={24} />
      <Verdict label={labels.good} note={ratio(DARK)} ok x={40} y={218} />

      <Plate size={176} x={340} y={16} />
      <SampleCode fgColor={PALE} margin={2} size={160} x={348} y={24} />
      <Verdict
        label={labels.bad}
        note={ratio(PALE)}
        ok={false}
        x={340}
        y={218}
      />
    </Canvas>
  );
}

/** Artwork touching the code hides its edges; four modules of empty space show them. */
export function WontScanQuietZone({ labels }: DiagramProps) {
  const artwork = (x: number) => (
    <g>
      <Plate fill={ARTWORK} size={176} x={x} y={16} />
      <rect
        fill={WHITE}
        height={8}
        opacity="0.5"
        rx="4"
        width={96}
        x={x + 14}
        y={172}
      />
    </g>
  );
  return (
    <Canvas height={252} title={labels.title} width={600}>
      {artwork(40)}
      <SampleCode fgColor={DARK} margin={0} size={132} x={62} y={30} />
      <Verdict
        label={labels.bad}
        note={labels.badNote}
        ok={false}
        x={40}
        y={218}
      />

      {artwork(340)}
      <SampleCode fgColor={DARK} margin={4} size={132} x={362} y={30} />
      <Verdict label={labels.good} note={labels.goodNote} ok x={340} y={218} />
    </Canvas>
  );
}

/** A code scans from about ten times its width. */
export function WontScanPrintSize({ labels }: DiagramProps) {
  const row = (
    y: number,
    size: number,
    width: string,
    distance: string,
    note: string,
  ) => {
    const left = 30;
    const start = left + size + 14;
    const end = start + size * 10;
    const middle = y + size / 2;
    return (
      <g>
        <Plate size={size + 8} x={left - 4} y={y - 4} />
        <SampleCode fgColor={DARK} margin={1} size={size} x={left} y={y} />
        <text
          fill={INK}
          fontSize="12"
          fontWeight="600"
          textAnchor="middle"
          x={left + size / 2}
          y={y + size + 22}
        >
          {width}
        </text>
        <line
          stroke={MUTED}
          strokeDasharray="4 4"
          strokeWidth="1.5"
          x1={start}
          x2={end}
          y1={middle}
          y2={middle}
        />
        <line
          stroke={MUTED}
          strokeWidth="1.5"
          x1={start}
          x2={start}
          y1={middle - 6}
          y2={middle + 6}
        />
        <line
          stroke={MUTED}
          strokeWidth="1.5"
          x1={end}
          x2={end}
          y1={middle - 6}
          y2={middle + 6}
        />
        <text
          fill={INK}
          fontSize="13.5"
          fontWeight="600"
          textAnchor="middle"
          x={(start + end) / 2}
          y={middle - 10}
        >
          {distance}
        </text>
        <text
          fill={MUTED}
          fontSize="12"
          textAnchor="middle"
          x={(start + end) / 2}
          y={middle + 22}
        >
          {note}
        </text>
        <g color={INK} transform={`translate(${end + 10}, ${middle - 13})`}>
          <Mobile aria-hidden color="currentColor" size={26} variant="Linear" />
        </g>
      </g>
    );
  };
  return (
    <Canvas height={212} title={labels.title} width={600}>
      {row(22, 22, labels.cardWidth, labels.cardDistance, labels.cardNote)}
      {row(
        100,
        44,
        labels.posterWidth,
        labels.posterDistance,
        labels.posterNote,
      )}
      <Note x={16} y={200}>
        {labels.footnote}
      </Note>
    </Canvas>
  );
}

/** Square, rounded and gear eyes scan everywhere; circle and curly ones fail in some apps. */
export function WontScanEyes({ labels }: DiagramProps) {
  const eyes = [
    { pattern: "square", label: labels.square, ok: true },
    { pattern: "rounded", label: labels.rounded, ok: true },
    { pattern: "gear", label: labels.gear, ok: true },
    { pattern: "circle", label: labels.circle, ok: false },
    { pattern: "curly", label: labels.curly, ok: false },
  ] as const;
  const tile = 96;
  const x = (index: number) => 16 + index * (tile + 14) + (index > 2 ? 36 : 0);
  return (
    <Canvas height={200} title={labels.title} width={600}>
      <Verdict label={labels.good} ok x={x(0)} y={30} />
      <Verdict label={labels.bad} ok={false} x={x(3)} y={30} />
      <line stroke={LINE} x1={x(3) - 25} x2={x(3) - 25} y1={14} y2={186} />
      {eyes.map((eye, index) => (
        <g key={eye.pattern}>
          <Plate size={tile} x={x(index)} y={48} />
          <SampleCode
            cornerEyeDotPattern="square"
            cornerEyePattern={eye.pattern}
            crop={104}
            fgColor={DARK}
            margin={2}
            show={tile - 8}
            size={260}
            x={x(index) + 4}
            y={52}
          />
          <text
            fill={eye.ok ? INK : MUTED}
            fontSize="12.5"
            textAnchor="middle"
            x={x(index) + tile / 2}
            y={166}
          >
            {eye.label}
          </text>
        </g>
      ))}
    </Canvas>
  );
}
