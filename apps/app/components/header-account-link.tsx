"use client";

import { authClient } from "@repo/auth/client";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { DEFAULT_NEXT_PATH } from "@/lib/safe-redirect";
import { useAuthStore } from "@/store/auth-store";

/** One grid cell for both labels; the hidden one still holds its width. */
const LABEL = "col-start-1 row-start-1";

/**
 * The bar's calls to action: "Try the Playground" for visitors, with a
 * quiet "Sign in" beside it, and "Dashboard" once signed in. Both main
 * labels are always laid out in the same cell, so the button is one width
 * in every state; "Sign in" holds its place while the session loads, so a
 * visitor's bar doesn't move when it arrives after the first paint.
 */
export function HeaderAccountLink({
  className,
  compact = false,
  onNavigate,
}: {
  className?: string;
  /** Shortens the visitor label on phones, where the bar is narrow. */
  compact?: boolean;
  /** Called before leaving (e.g. to close a drawer). */
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav.account");
  const { data: session, isPending } = authClient.useSession();
  const signedIn = Boolean(session?.user);
  const openAuthDialog = useAuthStore((state) => state.openAuthDialog);

  return (
    <>
      {!signedIn && (
        <Button
          asChild
          // On phones the bar has no room: the drawer has it.
          className={cn(
            "text-muted-foreground hover:text-foreground",
            compact && "max-sm:hidden",
            isPending && "invisible",
          )}
          variant="ghost"
        >
          <Link
            aria-hidden={isPending || undefined}
            href={`/sign-in?next=${encodeURIComponent(DEFAULT_NEXT_PATH)}`}
            onClick={(event) => {
              // Modified clicks open the sign-in page, like any link.
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
            }}
            tabIndex={isPending ? -1 : undefined}
          >
            {t("signIn")}
          </Link>
        </Button>
      )}
      <Button
        asChild
        // Keeps its place while the session loads.
        className={cn(isPending && "invisible", className)}
      >
        <Link
          aria-hidden={isPending || undefined}
          href={signedIn ? DEFAULT_NEXT_PATH : "/playground"}
          onClick={onNavigate}
          tabIndex={isPending ? -1 : undefined}
        >
          <span className="grid justify-items-center">
            <span className={cn(LABEL, signedIn && "invisible")}>
              {compact ? (
                <>
                  <span className="sm:hidden">{t("playground")}</span>
                  <span className="hidden sm:inline">{t("tryPlayground")}</span>
                </>
              ) : (
                t("tryPlayground")
              )}
            </span>
            <span className={cn(LABEL, !signedIn && "invisible")}>
              {t("dashboard")}
            </span>
          </span>
        </Link>
      </Button>
    </>
  );
}
