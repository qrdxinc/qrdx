import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import type { BreakdownMark as Mark } from "@/app/(app)/dashboard/codes/_lib/breakdown-marks";
import { BreakdownMark } from "./breakdown-mark";
import { formatNumber } from "./format";

export interface BreakdownItem {
  label: string;
  count: number;
  /** The flag, brand mark or icon before the label (_lib/breakdown-marks.ts) */
  mark?: Mark;
}

/** Top-N list with proportional bars (share of all scans in the range). */
export function BreakdownCard({
  title,
  items,
  total,
  empty = "No scans in this period",
}: {
  title: string;
  items: BreakdownItem[];
  total: number;
  empty?: string;
}) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        {items.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            {empty}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item, index) => {
              const share = total > 0 ? (item.count / total) * 100 : 0;
              return (
                <li
                  className="relative flex items-center justify-between gap-3 overflow-hidden rounded-md px-2 py-1 text-sm"
                  key={`${item.label}-${index}`}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 rounded-md bg-foreground/[0.07]"
                    style={{ width: `${share}%` }}
                  />
                  <span className="relative flex min-w-0 items-center gap-2">
                    {item.mark && (
                      <span
                        aria-hidden="true"
                        className="text-foreground/80 flex size-4 shrink-0 items-center justify-center"
                      >
                        <BreakdownMark mark={item.mark} />
                      </span>
                    )}
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="text-muted-foreground relative shrink-0 tabular-nums">
                    {formatNumber(item.count)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
