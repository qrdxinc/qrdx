import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Button } from "@repo/design-system/components/ui/button";
import { Card as CreditCard, Warning2 } from "iconsax-reactjs";
import { getAppLocale, getAppTranslations } from "@/lib/i18n/app-locale";
import { getPastDueNotice } from "@/lib/past-due";
import { PLAN_NAMES } from "@/lib/pricing";
import { getCurrentUserId, logError } from "@/lib/shared";

/**
 * Above every page of the signed-in app while the person's own
 * subscription has a failed payment (lib/past-due.ts): their codes keep
 * working, and one button opens the billing portal to update the card.
 * Nothing otherwise, and nothing when it can't be read.
 */
export async function PastDueBanner() {
  // Signed out: the pages around it handle that.
  const userId = await getCurrentUserId().catch(() => null);
  if (!userId) return null;
  let notice: Awaited<ReturnType<typeof getPastDueNotice>> = null;
  try {
    notice = await getPastDueNotice(userId);
  } catch (error) {
    logError(error as Error, { action: "app-shell.pastDue" });
    return null;
  }
  if (!notice) return null;
  const [t, locale] = await Promise.all([
    getAppTranslations("app.shell.pastDueBanner"),
    getAppLocale(),
  ]);
  const plan = PLAN_NAMES[notice.plan];
  const body =
    notice.inGrace && notice.graceEndsAt
      ? t("grace", {
          plan,
          date: new Intl.DateTimeFormat(locale, {
            dateStyle: "long",
            timeZone: "UTC",
          }).format(notice.graceEndsAt),
        })
      : t("ended", { plan });
  return (
    <Alert className="mb-6">
      <Warning2 aria-hidden />
      <AlertTitle>{t("title")}</AlertTitle>
      <AlertDescription>
        <p>{body}</p>
        <Button asChild className="mt-2" size="sm" variant="outline">
          {/* A route handler that redirects to Polar, so no <Link>. */}
          <a href="/settings/portal">
            <CreditCard aria-hidden />
            {t("updateCard")}
          </a>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
