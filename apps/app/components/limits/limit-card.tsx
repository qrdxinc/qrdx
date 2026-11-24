"use client";

import { track } from "@repo/analytics";
import { Button } from "@repo/design-system/components/ui/button";
import { Progress } from "@repo/design-system/components/ui/progress";
import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import type { LimitCopy } from "@/app/(app)/settings/usage/_lib/limit-copy";
import {
  type Meter,
  meterPercent,
} from "@/app/(app)/settings/usage/_lib/meters";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import type { KnownCheckoutSurface } from "@/lib/checkout-surface";
import { INVITE_BONUS_CODES } from "@/lib/invites/terms";
import { usePlanLimits } from "./plan-limits-provider";
import { UpgradeButton } from "./upgrade-button";

/**
 * One limit at 90% or more: the count against the cap, why, and the one
 * thing to do about it (upgrade, when this person can and checkout sells
 * that plan). `usageHref` adds a link to Plan & usage.
 */
export function LimitCard({
  meter,
  copy,
  usageHref,
  source,
  surface,
  onNavigate,
  onDismiss,
  showStatus = true,
  className,
}: {
  meter: Meter;
  copy: LimitCopy;
  usageHref?: string | null;
  /** Leads the reason with "Limit reached." (off under a title saying so) */
  showStatus?: boolean;
  /** The invite line's analytics (invite_offer_clicked), e.g. "limit_dialog" */
  source: string;
  /** Recorded on the payment (lib/checkout-surface.ts) */
  surface: KnownCheckoutSurface;
  onNavigate?: () => void;
  /** Adds "Not now" at the end (in a dialog) */
  onDismiss?: () => void;
  className?: string;
}) {
  const t = useTranslations("limits.limitCard");
  const upgrade = copy.upgrade;
  // Dynamic codes in the person's own workspace: inviting a friend raises
  // the limit too (lib/invites), said under the upgrade, never instead of it.
  const limits = usePlanLimits();
  const invite = meter.id === "dynamicCodes" && limits?.inviteOffer === true;
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="min-w-0 truncate text-sm font-medium">{meter.label}</p>
        <p className="text-primary shrink-0 text-sm font-medium tabular-nums">
          {copy.value}
        </p>
      </div>
      <Progress
        aria-label={t("labelUsed", { label: meter.label })}
        className="h-1.5"
        value={meterPercent(meter)}
      />
      <p className="text-muted-foreground text-sm text-pretty">
        {showStatus && (
          <span className="text-foreground font-medium">{copy.status}. </span>
        )}
        {copy.reason}
      </p>
      {meter.note && (
        <p className="text-muted-foreground text-xs">{meter.note}</p>
      )}
      {upgrade && (
        <div className="pt-1">
          <UpgradeButton
            checkout
            onNavigate={onNavigate}
            surface={surface}
            upgrade={upgrade}
          />
        </div>
      )}
      {invite && (
        <p className="text-muted-foreground text-xs text-pretty">
          {t.rich("inviteForMore", {
            count: INVITE_BONUS_CODES,
            link: (chunks) => (
              <Link
                className="text-foreground underline underline-offset-2"
                href="/settings/invite"
                onClick={() => {
                  track("invite_offer_clicked", { surface: source });
                  onNavigate?.();
                }}
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}
      {(usageHref || onDismiss) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {usageHref && (
            <Button asChild size="sm" variant={upgrade ? "ghost" : "outline"}>
              <Link href={usageHref} onClick={onNavigate}>
                {t("planUsage")}
              </Link>
            </Button>
          )}
          {onDismiss && (
            <Button
              className="text-muted-foreground ml-auto"
              onClick={onDismiss}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("notNow")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
