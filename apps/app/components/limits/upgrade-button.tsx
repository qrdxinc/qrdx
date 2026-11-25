"use client";

import { track } from "@repo/analytics";
import { Button } from "@repo/design-system/components/ui/button";
import type { ComponentProps } from "react";
import type { UpgradeAction } from "@/app/(app)/settings/usage/_lib/meters";
import { CheckoutButtons } from "@/components/billing/checkout-buttons";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { type KnownCheckoutSurface, withSurface } from "@/lib/checkout-surface";

/**
 * An upgrade link from a limit (limitCopy's `upgrade`) to the pricing page,
 * tracked on click (pricing_opened). With `checkout`, monthly and yearly
 * buttons that open checkout straight away instead, where they can (signed
 * in, not paying yet); the link otherwise.
 */
export function UpgradeButton({
  upgrade,
  surface,
  onNavigate,
  checkout = false,
  className,
  ...props
}: {
  upgrade: UpgradeAction;
  /** Recorded on the payment, through the pricing page for the link */
  surface: KnownCheckoutSurface;
  onNavigate?: () => void;
  checkout?: boolean;
} & Omit<ComponentProps<typeof Button>, "asChild" | "children">) {
  const link = (
    <Button asChild className={className} size="sm" {...props}>
      <Link
        href={withSurface(upgrade.href, surface)}
        onClick={() => {
          track("pricing_opened", { surface });
          onNavigate?.();
        }}
      >
        {upgrade.label}
      </Link>
    </Button>
  );
  if (!checkout) return link;
  return (
    <CheckoutButtons
      className={className}
      fallback={link}
      onNavigate={onNavigate}
      plan={upgrade.plan}
      size="sm"
      surface={surface}
    />
  );
}
