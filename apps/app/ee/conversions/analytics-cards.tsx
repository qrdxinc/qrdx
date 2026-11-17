import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { use } from "react";
import { BreakdownCard } from "@/app/(app)/dashboard/codes/_components/breakdown-card";
import { formatNumber } from "@/app/(app)/dashboard/codes/_components/format";
import type { ConversionSummary } from "@/ee/conversions/queries";
import { getAppTranslations } from "@/lib/i18n/app-locale";

// Conversions in the dashboard's analytics (ee/conversions): the code page's
// card (app/(app)/dashboard/codes/[id]/_components/analytics-extra.tsx) and
// the workspace's summary (app/(app)/dashboard/[workspace]/analytics). Shown
// only where the server has the licence key and there is something to show.

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-xl font-bold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

function formatMoney(total: string, currency: string | null): string {
  const amount = Number(total);
  if (!currency)
    return amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  try {
    return amount.toLocaleString("en-US", { style: "currency", currency });
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** The code page's conversions: totals, revenue and the most common types. */
export function ConversionsCard({
  conversions,
}: {
  conversions: ConversionSummary;
}) {
  const t = use(getAppTranslations("app.dashboard.codes.analyticsExtra"));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle>{t("conversions")}</CardTitle>
          <CardDescription>{t("attributedToScansOfThis")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6 px-4">
          <Stat
            label={t("conversions")}
            value={formatNumber(conversions.count)}
          />
          {conversions.revenue
            .filter((row) => Number(row.total) > 0)
            .map((row) => (
              <Stat
                key={row.currency ?? "none"}
                label={`Revenue${row.currency ? ` (${row.currency})` : ""}`}
                value={formatMoney(row.total, row.currency)}
              />
            ))}
        </CardContent>
      </Card>
      <BreakdownCard
        items={conversions.names.map((row) => ({
          label: row.name,
          count: row.count,
        }))}
        title={t("conversionTypes")}
        total={conversions.count}
      />
    </div>
  );
}

/** The workspace's conversions and revenue, under its analytics. */
export function ConversionsSummary({
  conversions,
}: {
  conversions: ConversionSummary;
}) {
  const t = use(getAppTranslations("app.dashboard.analytics.page"));
  const revenue = conversions.revenue.filter((row) => Number(row.total) > 0);
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle>{t("conversions")}</CardTitle>
        <CardDescription>{t("salesAndSignUpsAttributed")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-6 px-4">
        <div>
          <p className="text-muted-foreground text-xs">{t("conversions")}</p>
          <p className="text-xl font-bold tabular-nums">
            {formatNumber(conversions.count)}
          </p>
        </div>
        {revenue.map((row) => (
          <div key={row.currency ?? "none"}>
            <p className="text-muted-foreground text-xs">
              {t("revenue")}
              {row.currency ? ` (${row.currency})` : ""}
            </p>
            <p className="text-xl font-bold tabular-nums">
              {Number(row.total).toLocaleString("en-US", {
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
