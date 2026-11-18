import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { auth } from "@repo/auth/server";
import { SUPPORT_EMAIL } from "@repo/config";
import { database as db, subscription } from "@repo/database";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { pickMessages } from "@repo/i18n/messages";
import { desc, eq } from "drizzle-orm";
import {
  ArrowRight,
  Clock,
  Global,
  type Icon,
  InfoCircle,
  Profile2User,
  ScanBarcode,
  TickCircle,
} from "iconsax-reactjs";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { scanAlertsOfferFor } from "@/app/(app)/dashboard/_components/home/pro-moments";
import { ScanAlertsOffer } from "@/app/(app)/dashboard/_components/home/scan-alerts-offer";
import { AsciiField, Aurora, Backdrop } from "@/components/fx";
import { PRESSABLE } from "@/components/mockups/motion";
import { SoundCue } from "@/components/sound/sound-cue";
import { isPathAvailable } from "@/lib/feature-availability";
import { getAppLocale, getAppTranslations } from "@/lib/i18n/app-locale";
import { loadMessages } from "@/lib/i18n/messages";
import { isBillingConfigured, polar } from "@/lib/polar";
import { PLAN_NAMES, planForProductId } from "@/lib/pricing";
import { signInPath } from "@/lib/safe-redirect";
import { logError } from "@/lib/shared";
import { dashboardEntry } from "@/lib/workspace-paths";
import {
  type CheckoutClient,
  type CheckoutOutcome,
  checkoutIdFrom,
  resolveCheckoutOutcome,
} from "./_lib/outcome";
import { CheckAgain, CheckNowButton } from "./check-again";

export const metadata: Metadata = {
  title: "Your upgrade",
  robots: { index: false, follow: false },
};

const NEXT_STEPS: {
  icon: Icon;
  title: "codesTitle" | "domainTitle" | "teamTitle";
  description: "codesBody" | "domainBody" | "teamBody";
  href: string;
}[] = [
  {
    icon: ScanBarcode,
    title: "codesTitle",
    description: "codesBody",
    href: dashboardEntry("codes"),
  },
  {
    icon: Global,
    title: "domainTitle",
    description: "domainBody",
    href: dashboardEntry("settings/domains"),
  },
  {
    icon: Profile2User,
    title: "teamTitle",
    description: "teamBody",
    href: dashboardEntry("settings/team"),
  },
];

async function signedInUserId(): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** The person's subscription rows, newest first (the Polar webhook writes them). */
async function subscriptionsOf(userId: string) {
  return db
    .select({
      checkoutId: subscription.checkoutId,
      customerId: subscription.customerId,
      productId: subscription.productId,
      status: subscription.status,
    })
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .orderBy(desc(subscription.createdAt))
    .limit(10);
}

/**
 * Where Polar sends a buyer after checkout (actions/checkout.ts success_url).
 * It says the plan is active only once the webhook's subscription row does,
 * and otherwise what happened to the checkout (_lib/outcome.ts).
 */
export default async function SuccessPage({
  searchParams,
}: PageProps<"/success">) {
  const checkoutId = checkoutIdFrom((await searchParams).checkout_id);
  const userId = await signedInUserId();
  let outcome: CheckoutOutcome;
  try {
    outcome = await resolveCheckoutOutcome({
      checkoutId,
      userId,
      client: isBillingConfigured ? (polar as CheckoutClient) : null,
      subscriptions: userId ? await subscriptionsOf(userId) : [],
      planOf: planForProductId,
      onFailure: (failure) =>
        logError(new Error("Checkout check failed"), {
          action: "success.checkout",
          ...failure,
        }),
    });
  } catch (error) {
    // The subscription read failed: say so rather than guess.
    logError(error as Error, { action: "success.subscriptions" });
    outcome = { kind: "unverified" };
  }

  const t = await getAppTranslations("app.success");
  const here = checkoutId
    ? `/success?checkout_id=${encodeURIComponent(checkoutId)}`
    : "/success";
  const own = userId ? ownWorkspaceId(userId) : null;
  const offerAlerts =
    outcome.kind === "active" && userId && own
      ? await scanAlertsOfferFor({
          userId,
          organizationId: own,
          plan: outcome.plan,
          // Their own workspace: they own it.
          canManage: true,
        }).catch(() => false)
      : false;
  const locale = offerAlerts ? await getAppLocale() : null;
  const offerMessages = locale
    ? pickMessages(await loadMessages(locale), [
        "app.dashboard.home.scanAlertsOffer",
      ])
    : null;
  // No step for a feature this deployment can't offer (custom domains).
  const steps =
    outcome.kind === "active"
      ? NEXT_STEPS.filter((step) => isPathAvailable(step.href))
      : [];

  let title: string;
  let body: ReactNode;
  switch (outcome.kind) {
    case "active":
      title = t("activeTitle");
      body = t("activeBody", { plan: PLAN_NAMES[outcome.plan] });
      break;
    case "signed-out":
      title = t("signedOutTitle");
      body = t("signedOutBody");
      break;
    case "unknown":
      title = t("unknownTitle");
      body = t.rich("unknownBody", {
        email: SUPPORT_EMAIL,
        mail: (chunks) => (
          <a
            className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
            href={`mailto:${SUPPORT_EMAIL}`}
          >
            {chunks}
          </a>
        ),
      });
      break;
    default:
      title = t(`${outcome.kind}Title`);
      body = t(`${outcome.kind}Body`);
  }

  return (
    <main className="relative w-full overflow-hidden">
      {outcome.kind === "active" && <SoundCue name="success" />}
      <Backdrop>
        <Aurora tone="neutral" />
        <AsciiField
          variant="halo"
          focus={[0.5, 0.3]}
          className="[mask-image:radial-gradient(ellipse_70%_70%_at_50%_35%,black_40%,transparent_85%)]"
        />
      </Backdrop>
      <div className="relative mx-auto flex min-h-[70vh] max-w-[50rem] flex-col items-center justify-center gap-10 px-10 py-20 text-center">
        <div className="flex flex-col items-center gap-4">
          <OutcomeIcon kind={outcome.kind} />
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            {title}
          </h1>
          <p className="max-w-md text-pretty text-muted-foreground">{body}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <OutcomeActions
              kind={outcome.kind}
              labels={{
                goToDashboard: t("goToDashboard"),
                manageSubscription: t("manageSubscription"),
                checkNow: t("checkNow"),
                backToPricing: t("backToPricing"),
                signIn: t("signIn"),
              }}
              signInHref={signInPath(here)}
            />
          </div>
        </div>

        {own && locale && offerMessages && (
          <div className="w-full max-w-xl">
            <NextIntlClientProvider locale={locale} messages={offerMessages}>
              <ScanAlertsOffer organizationId={own} />
            </NextIntlClientProvider>
          </div>
        )}

        {steps.length > 0 && (
          <ul
            className={cn(
              "grid w-full gap-4 text-left",
              steps.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
            )}
          >
            {steps.map((step) => (
              <li key={step.href}>
                <Link
                  className="group block h-full rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  href={step.href}
                >
                  <Card
                    className={cn(
                      "h-full gap-3 p-5 shadow-xs group-hover:border-foreground/15 group-hover:bg-accent/40",
                      PRESSABLE,
                    )}
                  >
                    <span className="grid size-9 place-items-center rounded-full border bg-muted/40">
                      <step.icon
                        aria-hidden
                        className="size-4 text-foreground/80"
                      />
                    </span>
                    <div className="flex flex-col gap-1">
                      <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                        {t(`steps.${step.title}`)}
                        <ArrowRight
                          aria-hidden
                          className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        />
                      </h2>
                      <p className="text-sm text-pretty text-muted-foreground">
                        {t(`steps.${step.description}`)}
                      </p>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {outcome.kind === "pending" && <CheckAgain />}
    </main>
  );
}

const ICONS: Record<CheckoutOutcome["kind"], Icon> = {
  active: TickCircle,
  pending: Clock,
  incomplete: InfoCircle,
  failed: InfoCircle,
  unverified: Clock,
  unknown: InfoCircle,
  "signed-out": InfoCircle,
};

function OutcomeIcon({ kind }: { kind: CheckoutOutcome["kind"] }) {
  const Glyph = ICONS[kind];
  return (
    <span
      className={cn(
        "grid size-14 place-items-center rounded-full ring-1",
        kind === "active"
          ? "bg-emerald-500/10 ring-emerald-500/20"
          : "bg-muted/60 ring-border",
      )}
    >
      <Glyph
        aria-hidden
        className={cn(
          "size-7",
          kind === "active"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-foreground/70",
        )}
        variant="Bold"
      />
    </span>
  );
}

function OutcomeActions({
  kind,
  labels,
  signInHref,
}: {
  kind: CheckoutOutcome["kind"];
  labels: Record<
    | "goToDashboard"
    | "manageSubscription"
    | "checkNow"
    | "backToPricing"
    | "signIn",
    string
  >;
  signInHref: string;
}) {
  const dashboard = (
    <Button asChild variant={kind === "active" ? "default" : "outline"}>
      <Link href="/dashboard">
        {labels.goToDashboard}
        <ArrowRight aria-hidden />
      </Link>
    </Button>
  );
  switch (kind) {
    case "active":
      return (
        <>
          {dashboard}
          <Button asChild variant="outline">
            {/* Route handler that redirects to the billing portal. */}
            <a href="/settings/portal">{labels.manageSubscription}</a>
          </Button>
        </>
      );
    case "pending":
    case "unverified":
      return (
        <>
          <CheckNowButton label={labels.checkNow} />
          {dashboard}
        </>
      );
    case "signed-out":
      return (
        <Button asChild>
          <a href={signInHref}>{labels.signIn}</a>
        </Button>
      );
    default:
      return (
        <>
          <Button asChild>
            {/* The pricing page is the marketing site's: a full page load. */}
            <a href="/pricing">{labels.backToPricing}</a>
          </Button>
          {dashboard}
        </>
      );
  }
}
