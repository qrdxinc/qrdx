"use client";

import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import { useTranslations } from "next-intl";
import { useId } from "react";
import type { CodeMarketingSettings } from "@/actions/code-marketing";
import { PlanLock } from "@/app/(app)/dashboard/codes/[id]/_components/routing-panel";
import { CopyButton } from "@/components/copy-button";
import { type PaidPlan, PLAN_NAMES } from "@/lib/pricing";

// A website link's conversion tracking switch and its snippets (ee/conversions),
// inside the code's tracking panel
// (app/(app)/dashboard/codes/[id]/_components/pixels-panel.tsx), which shows
// it only where the server has the QRdx licence key.

function Snippet({ code, label }: { code: string; label: string }) {
  const t = useTranslations("app.dashboard.codes.pixelsPanel");
  return (
    <div className="relative">
      <pre className="bg-muted max-h-64 overflow-auto rounded-md p-3 pr-10 font-mono text-xs leading-relaxed">
        {code}
      </pre>
      <CopyButton
        aria-label={t("copyLabel", { label: label.toLowerCase() })}
        className="absolute top-2 right-2"
        textToCopy={code}
      />
    </div>
  );
}

export function ConversionsSection({
  settings,
  enabled,
  onEnabledChange,
  plan,
}: {
  settings: CodeMarketingSettings;
  /** The switch in the unsaved draft */
  enabled: boolean;
  onEnabledChange: (on: boolean) => void;
  plan: PaidPlan | null;
}) {
  const t = useTranslations("app.dashboard.codes.pixelsPanel");
  const id = useId();
  const locked = !settings.features.conversions;
  const browserSnippet = `<script async src="${settings.origin}/conversions.js"></script>
<script>
  window.qrdx = window.qrdx || function () {
    (window.qrdx.q = window.qrdx.q || []).push(arguments);
  };
  // Where the conversion happens, e.g. your order confirmation page:
  qrdx("conversion", { name: "purchase", value: 49.99, currency: "USD", id: "ORDER-1234" });
</script>`;
  const serverSnippet = `curl -X POST ${settings.origin}/api/v1/conversions \\
  -H "Authorization: Bearer $QRDX_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"sid": "<qrdx_sid>", "name": "purchase", "value": 49.99, "currency": "USD", "id": "ORDER-1234"}'`;

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {t("conversionTracking")}
            {plan && ` (${PLAN_NAMES[plan]})`}
          </p>
          <p className="text-muted-foreground text-sm">
            {t.rich("addsASignedQrdxSid", {
              code: (chunks) => (
                <code className="font-mono text-xs">{chunks}</code>
              ),
            })}
          </p>
        </div>
        <Label
          className="flex items-center gap-2 text-sm font-normal"
          htmlFor={`${id}-on`}
        >
          <Switch
            checked={enabled}
            disabled={locked && !enabled}
            id={`${id}-on`}
            onCheckedChange={onEnabledChange}
          />
          {enabled ? t("on") : t("off")}
        </Label>
      </div>
      {locked && plan && !settings.pixels?.conversions && (
        <PlanLock plan={plan}>
          {t("conversionTrackingAndRevenueAttribution", {
            value: PLAN_NAMES[plan],
          })}
        </PlanLock>
      )}
      {enabled && (
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs">
            {t.rich("n1AddThisToThe", {
              code: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </p>
          <Snippet code={browserSnippet} label={t("browserSnippet")} />
          <p className="text-muted-foreground text-xs">
            {t.rich("n2OrReportFromYour", {
              code: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </p>
          <Snippet code={serverSnippet} label={t("serverExample")} />
        </div>
      )}
    </div>
  );
}
