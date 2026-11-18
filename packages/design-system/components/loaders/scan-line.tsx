import { type LoaderProps, LoaderSvg } from "./loader-svg";

// Two rows of three modules with a gap between them, where the line rests
// when nothing moves. The line passes the top row on its way down and the
// bottom row a moment later; the bottom row's blink runs half a cycle
// (one sweep) ahead, which mirrors it.
const MODULES = [
  { x: 14, y: 14, delay: undefined },
  { x: 21, y: 14, delay: undefined },
  { x: 28, y: 14, delay: undefined },
  { x: 14, y: 28, delay: "-0.8s" },
  { x: 21, y: 28, delay: "-0.8s" },
  { x: 28, y: 28, delay: "-0.8s" },
];

/**
 * The loader for scanning: the scanner, checking a code, checking links on
 * import. The mark's four corner brackets hold still while a line in the
 * brand accent sweeps down and up through them (1.6 s), and each row of
 * modules blinks as the line passes.
 */
export function ScanLine({ size = 40, ...props }: LoaderProps) {
  return (
    <LoaderSvg size={size} viewBox="0 0 48 48" {...props}>
      <path className="qrdx-loader-bracket" d="M4 16V10a6 6 0 0 1 6-6h6" />
      <path className="qrdx-loader-bracket" d="M32 4h6a6 6 0 0 1 6 6v6" />
      <path className="qrdx-loader-bracket" d="M44 32v6a6 6 0 0 1-6 6h-6" />
      <path className="qrdx-loader-bracket" d="M16 44h-6a6 6 0 0 1-6-6v-6" />
      {MODULES.map((module) => (
        <rect
          className="qrdx-loader-blink"
          height="6"
          key={`${module.x}-${module.y}`}
          rx="1.6"
          style={{ animationDelay: module.delay }}
          width="6"
          x={module.x}
          y={module.y}
        />
      ))}
      <rect
        className="qrdx-loader-accent qrdx-loader-sweep"
        height="2"
        rx="1"
        width="28"
        x="10"
        y="23"
      />
    </LoaderSvg>
  );
}
