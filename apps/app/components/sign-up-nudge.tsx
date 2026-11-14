"use client";

import {
  type AuthPromptReason,
  trackAuthPromptDismissed,
  trackAuthPromptShown,
} from "@repo/analytics/auth-prompt";
import { authClient } from "@repo/auth/client";
import { Close } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { authPromptSurface } from "@/lib/analytics/auth-prompt";
import {
  dismissNudge,
  isNudgeDismissed,
  markNudgeShown,
  type SignUpNudge as SignUpNudgeId,
  wasNudgeShown,
} from "@/lib/sign-up-nudges";

/**
 * Whether a sign-up line may show: `wanted` (the moment came), the session
 * has loaded with nobody signed in, this browser hasn't waved it off, and
 * it hasn't appeared in this tab yet (or is on screen now). Decided after
 * mount, so the server HTML never differs.
 */
export function useSignUpNudge(id: SignUpNudgeId, wanted: boolean) {
  const { data: session, isPending } = authClient.useSession();
  const signedOut = !(isPending || session?.user);
  const [state, setState] = useState<"unknown" | "allowed" | "blocked">(
    "unknown",
  );

  useEffect(() => {
    if (!(wanted && signedOut) || state !== "unknown") return;
    setState(isNudgeDismissed(id) || wasNudgeShown(id) ? "blocked" : "allowed");
  }, [id, wanted, signedOut, state]);
  // Once its moment has passed, it doesn't come back in this tab.
  useEffect(() => {
    if (!wanted && state === "allowed") setState("blocked");
  }, [wanted, state]);

  return {
    shown: wanted && signedOut && state === "allowed",
    /** Waved off for good in this browser. */
    dismiss: () => {
      dismissNudge(id);
      setState("blocked");
    },
  };
}

/**
 * One quiet line offering a free account: the text, a small button that
 * opens the sign-in dialog, and a way to wave it off for good. Monochrome,
 * never in the way of what the visitor came to do. Render it only while
 * `useSignUpNudge(id, …).shown`.
 */
export function SignUpNudge({
  id,
  reason,
  text,
  cta,
  onCta,
  onDismiss,
  stacked = false,
  className,
}: {
  id: SignUpNudgeId;
  reason: AuthPromptReason;
  text: string;
  cta: string;
  onCta: () => void;
  /** The line was waved off (useSignUpNudge's `dismiss`). */
  onDismiss: () => void;
  /** The buttons under the text, for a narrow column. */
  stacked?: boolean;
  className?: string;
}) {
  const t = useTranslations("auth.nudge");
  const pathname = usePathname();
  const surface = authPromptSurface(pathname);

  // Counted once when it appears; it then stays put for this tab.
  useEffect(() => {
    markNudgeShown(id);
    trackAuthPromptShown({ reason, surface }, "nudge");
  }, [id, reason, surface]);

  return (
    <div
      className={cn(
        "text-muted-foreground flex gap-3 text-xs text-pretty",
        stacked ? "flex-col items-start gap-2" : "items-start",
        className,
      )}
      role="note"
    >
      <p className={cn("min-w-0 flex-1", !stacked && "pt-1.5")}>{text}</p>
      <div
        className={cn(
          "flex shrink-0 items-center gap-0.5",
          stacked && "w-full justify-between",
        )}
      >
        <Button
          className="h-7 px-2.5 text-xs"
          onClick={onCta}
          size="sm"
          type="button"
          variant="outline"
        >
          {cta}
        </Button>
        <Button
          aria-label={t("dismiss")}
          className="text-muted-foreground hover:text-foreground size-7"
          onClick={() => {
            trackAuthPromptDismissed({ reason, surface }, "nudge");
            onDismiss();
          }}
          size="icon"
          title={t("dismiss")}
          type="button"
          variant="ghost"
        >
          <Close aria-hidden className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
