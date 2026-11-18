import { cn } from "@repo/design-system/lib/utils";
import { type LoaderProps, LoaderSvg } from "./loader-svg";

// A 3×3 patch of modules, each [column, row]. The wave runs along the
// diagonals, so a module's delay is its diagonal's place in the wave.
const PATCH: [number, number][] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [0, 1],
  [1, 1],
  [2, 1],
  [0, 2],
  [1, 2],
  [2, 2],
];

/**
 * The inline loader, for lists, table rows and "loading more" lines: a 3×3
 * patch of modules lights up in a diagonal wave (1.2 s), the centre module
 * in the brand accent.
 */
export function ModuleWave({ size = 16, ...props }: LoaderProps) {
  return (
    <LoaderSvg size={size} viewBox="0 0 48 48" {...props}>
      {PATCH.map(([column, row]) => (
        <rect
          className={cn(
            "qrdx-loader-wave",
            column === 1 && row === 1 && "qrdx-loader-accent"
          )}
          height="10"
          key={`${column}-${row}`}
          rx="2.6"
          style={{ animationDelay: `${(column + row) * 0.12}s` }}
          width="10"
          x={5 + column * 14}
          y={5 + row * 14}
        />
      ))}
    </LoaderSvg>
  );
}
