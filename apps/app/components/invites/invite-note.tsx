"use client";

import {
  trackAuthPromptDismissed,
  trackAuthPromptShown,
} from "@repo/analytics/auth-prompt";
import { authClient } from "@repo/auth/client";
import { Close } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Gift } from "iconsax-reactjs";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useAvailability } from "@/components/availability-provider";
import { authPromptSurface } from "@/lib/analytics/auth-prompt";
import { pendingInviteCode } from "@/lib/invites/invite-client";
import { INVITE_BONUS_CODES, INVITE_QUALIFY_DAYS } from "@/lib/invites/terms";
import { useAuthStore } from "@/store/auth-store";

// Waved off in this tab: in memory only, like the invite code itself.
// Nothing is written to the device, so a new visit shows it again only if it
// comes through an invite link again.
let dismissedThisVisit = false;

/** Forgets the dismissal (tests). */
export function resetInviteNote(): void {
  dismissedThisVisit = false;
}

/**
 * Whether the note shows: invites work here, the visit came through
 * someone's invite link (/i/<code>), nobody is signed in and it hasn't been
 * waved off in this tab. Decided after mount, so the server HTML never
 * differs.
 */
export function useInviteNote(): {
  shown: boolean;
  dismiss: () => void;
} {
  const offered = useAvailability().has("inviteRewards");
  const { data: session, isPending } = authClient.useSession();
  const [invited, setInvited] = useState(false);
  const [dismissed, setDismissed] = useState(dismissedThisVisit);

  useEffect(() => {
    if (offered) setInvited(pendingInviteCode() !== null);
  }, [offered]);

  return {
    shown: offered && invited && !dismissed && !isPending && !session?.user,
    dismiss: () => {
      dismissedThisVisit = true;
      setDismissed(true);
    },
  };
}

/**
 * A slim note for a visitor who came through a friend's invite link: signing
 * up in this visit gives them extra dynamic codes once they make their
 * first one. It never names who invited them: an invite link can be shared
 * publicly. Monochrome, one line, out of the editor's way.
 */
export function InviteNote() {
  const { shown, dismiss } = useInviteNote();
  if (!shown) return null;
  return <InviteNoteLine onDismiss={dismiss} />;
}

export function InviteNoteLine({ onDismiss }: { onDismiss: () => void }) {
  const t = useTranslations("auth.inviteNote");
  const pathname = usePathname();
  const surface = authPromptSurface(pathname);
  const openAuthDialog = useAuthStore((state) => state.openAuthDialog);

  // Counted once when it appears.
  useEffect(() => {
    trackAuthPromptShown({ reason: "invite", surface }, "nudge");
  }, [surface]);

  return (
    <div
      className="bg-muted/40 text-muted-foreground flex items-center gap-3 border-b px-4 py-2 text-xs text-pretty sm:text-sm"
      role="note"
    >
      <Gift aria-hidden className="text-foreground size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        {t("text", { count: INVITE_BONUS_CODES, days: INVITE_QUALIFY_DAYS })}
      </p>
      <Button
        className="h-7 shrink-0 px-2.5 text-xs"
        onClick={() => openAuthDialog("invite", { mode: "signup", surface })}
        size="sm"
        type="button"
        variant="outline"
      >
        {t("signUp")}
      </Button>
      <Button
        aria-label={t("dismiss")}
        className="text-muted-foreground hover:text-foreground size-7 shrink-0"
        onClick={() => {
          trackAuthPromptDismissed({ reason: "invite", surface }, "nudge");
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
  );
}
