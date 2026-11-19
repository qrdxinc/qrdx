"use client";

import { track } from "@repo/analytics";
import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { useAvailability } from "@/components/availability-provider";
import { useSubscription } from "@/lib/hooks/use-subscription";
import { type BillingInterval, type PaidPlan, PLAN_NAMES } from "@/lib/pricing";
import { startCheckout } from "@/lib/widget-routes/client";
import type { UpgradePayer } from "@/store/get-pro-dialog-store";
import {
  checkoutChoice,
  checkoutErrorKey,
  payerCanUpgrade,
} from "./checkout-choice";
import { useFreshWorkspaceUpgrade } from "./fresh-upgrade";

const PORTAL_HREF = "/settings/portal";

/**
 * What CheckoutButtons will show for `plan` (checkout-choice.ts), and
 * whether it's still waiting for the person's plan. Callers use it to
 * decide what else to show next to the buttons.
 */
export function useCheckoutChoice(plan: PaidPlan) {
  const locale = useLocale();
  const { has } = useAvailability();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const signedIn = Boolean(session?.user);
  const { subscriptionStatus, isError } = useSubscription();
  // Until the plan is known, the buttons wait rather than sell Pro to
  // someone who has it. A failed read ends the wait: checkout itself
  // refuses a second subscription.
  const waiting =
    sessionPending || (signedIn && !subscriptionStatus && !isError);
  const choice = checkoutChoice({
    plan,
    billing: has("billing"),
    signedIn: signedIn || sessionPending,
    currentPlan: subscriptionStatus?.plan ?? null,
    currency: subscriptionStatus?.currency ?? null,
    locale,
  });
  return { choice, waiting };
}

/**
 * What an upgrade dialog shows for a gate: the checkout buttons (waiting
 * until the person's right to buy is confirmed), or a line that an owner
 * or billing member has to upgrade. Outside the app shell the answer is
 * read again each time the dialog opens (useFreshWorkspaceUpgrade).
 */
export function useGateCheckout({
  open,
  plan,
  payer,
  shellCanUpgrade,
}: {
  open: boolean;
  plan: PaidPlan;
  payer: UpgradePayer;
  /** The app shell's answer for the open workspace; null outside it */
  shellCanUpgrade: boolean | null;
}) {
  const server = useFreshWorkspaceUpgrade(
    open && payer === "workspace" && shellCanUpgrade === null,
  );
  const answer = payerCanUpgrade({ payer, shell: shellCanUpgrade, server });
  const sells = useCheckoutChoice(plan).choice.kind !== "none";
  return {
    buttons: sells && (answer === "yes" || answer === "waiting"),
    waiting: answer === "waiting",
    askOwner: answer === "no",
  };
}

/**
 * Monthly and yearly buttons that open Polar's checkout for `plan` straight
 * away, priced in the currency checkout will charge. Where that can't
 * happen here (signed out, no billing, already on the plan) it shows
 * `fallback`; someone already paying gets the billing portal, where plan
 * changes happen.
 */
export function CheckoutButtons({
  plan = "pro",
  source,
  fallback = null,
  onNavigate,
  size,
  className,
  waiting: held = false,
}: {
  plan?: PaidPlan;
  /** For analytics, e.g. "dialog", "limit_dialog", "ai_art" */
  source: string;
  fallback?: ReactNode;
  /** Called before leaving for checkout or the portal (close a dialog). */
  onNavigate?: () => void;
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
  /** Shown but not clickable yet: the caller is still confirming they may buy. */
  waiting?: boolean;
}) {
  const t = useTranslations("nav.checkoutButtons");
  const { choice, waiting } = useCheckoutChoice(plan);
  const [pending, setPending] = useState<BillingInterval | null>(null);
  // Back from Polar, the browser may show this page from its back/forward
  // cache, still waiting on the button that left: let it be clicked again.
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(null);
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);

  if (choice.kind === "none") return fallback;
  if (choice.kind === "portal") {
    if (held) {
      return (
        <Button className={className} disabled size={size} variant="outline">
          {t("switchTo", { plan: PLAN_NAMES[plan] })}
        </Button>
      );
    }
    return (
      <Button asChild className={className} size={size} variant="outline">
        {/* A route handler that redirects to Polar, so no <Link>. */}
        <a href={PORTAL_HREF} onClick={onNavigate}>
          {t("switchTo", { plan: PLAN_NAMES[plan] })}
        </a>
      </Button>
    );
  }

  const start = async (interval: BillingInterval) => {
    track("upgrade_clicked", { source, plan });
    setPending(interval);
    try {
      const result = await startCheckout({ plan, interval });
      if ("url" in result) {
        track("checkout_started", { plan, interval });
        onNavigate?.();
        window.location.assign(result.url);
        return;
      }
      setPending(null);
      if (result.reason === "sign_in") {
        // The pricing page signs them in and carries on to checkout.
        window.location.assign(`/pricing?interval=${interval}`);
        return;
      }
      // The server's message is English; the page may not be.
      const message = t(checkoutErrorKey(result.reason));
      if (result.reason === "subscribed") {
        toast.error(message, {
          action: {
            label: t("openPortal"),
            onClick: () => window.location.assign(PORTAL_HREF),
          },
        });
        return;
      }
      toast.error(message);
    } catch {
      setPending(null);
      toast.error(t("failed"));
    }
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap gap-2">
        {choice.options.map(({ interval, price }, index) => (
          <Button
            className="grow"
            disabled={held || waiting || pending !== null}
            key={interval}
            onClick={() => start(interval)}
            size={size}
            type="button"
            variant={index === 0 ? "default" : "outline"}
          >
            {pending === interval && <ModuleOrbit aria-hidden />}
            {price
              ? t(interval, { plan: PLAN_NAMES[plan], price })
              : t(interval === "month" ? "monthNoPrice" : "yearNoPrice", {
                  plan: PLAN_NAMES[plan],
                })}
          </Button>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">{t("note")}</p>
    </div>
  );
}
