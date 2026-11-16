"use client";

import { authClient } from "@repo/auth/client";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { DEFAULT_NEXT_PATH } from "@/lib/safe-redirect";
import { useAuthStore } from "@/store/auth-store";

const SIGN_IN = `/sign-in?next=${encodeURIComponent(DEFAULT_NEXT_PATH)}`;
const EDITOR = "/playground";

/** The bar's buttons: 32 px, a little tighter than the page's. */
const BAR_BUTTON = "h-[2rem] px-3.5 text-sm";

/**
 * "Sign in" opens the sign-in dialog and lands on the dashboard; a modified
 * click opens /sign-in, like any link.
 */
function useSignInClick(onNavigate?: () => void) {
  const openAuthDialog = useAuthStore((state) => state.openAuthDialog);
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    onNavigate?.();
    openAuthDialog("nav", {
      callbackURL: DEFAULT_NEXT_PATH,
      surface: "header",
    });
  };
}

/**
 * The bar's actions. Visitors get "Sign in" (from `lg`; phones find it at
 * the end of the menu) and the one primary action, "Create a QR code", which
 * opens the free editor. Signed in, the pair becomes "Dashboard". While the
 * session loads, the visitor pair holds its place invisibly.
 */
export function HeaderAccountLinks({ className }: { className?: string }) {
  const t = useTranslations("nav.account");
  const { data: session, isPending } = authClient.useSession();
  const onSignIn = useSignInClick();

  if (session?.user) {
    return (
      <Button asChild className={cn(BAR_BUTTON, className)}>
        <Link href={DEFAULT_NEXT_PATH}>{t("dashboard")}</Link>
      </Button>
    );
  }

  return (
    <div
      aria-hidden={isPending || undefined}
      className={cn(
        "flex items-center gap-2",
        isPending && "invisible",
        className,
      )}
    >
      <Button
        asChild
        variant="outline"
        className={cn(BAR_BUTTON, "hidden shadow-none lg:inline-flex")}
      >
        <Link
          href={SIGN_IN}
          onClick={onSignIn}
          tabIndex={isPending ? -1 : undefined}
        >
          {t("signIn")}
        </Link>
      </Button>
      {/* Tighter on small phones; under 360 px the menu has it instead. */}
      <Button
        asChild
        className={cn(
          BAR_BUTTON,
          "max-[379px]:px-2.5 max-[379px]:text-[13px] max-[359px]:hidden",
        )}
      >
        <Link href={EDITOR} tabIndex={isPending ? -1 : undefined}>
          {t("create")}
        </Link>
      </Button>
    </div>
  );
}

/**
 * The mobile menu's last row: "Sign in" for visitors (and, on the narrowest
 * phones, the bar's "Create a QR code"); nothing once signed in.
 */
export function HeaderSignInRow({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav.account");
  const { data: session, isPending } = authClient.useSession();
  const onSignIn = useSignInClick(onNavigate);
  if (isPending || session?.user) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Button asChild className="h-11 w-full min-[360px]:hidden">
        <Link href={EDITOR} onClick={onNavigate}>
          {t("create")}
        </Link>
      </Button>
      <Button asChild variant="outline" className="h-11 w-full">
        <Link href={SIGN_IN} onClick={onSignIn}>
          {t("signIn")}
        </Link>
      </Button>
    </div>
  );
}
