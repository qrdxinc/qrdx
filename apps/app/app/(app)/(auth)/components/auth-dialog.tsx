"use client";

import type { AuthPromptReason } from "@repo/analytics/auth-prompt";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { AuthDialogMode } from "@/lib/analytics/auth-prompt";
import { safeNextPath } from "@/lib/safe-redirect";
import { SignInPanel } from "./sign-in-panel";
import { reasonLine } from "./sign-in-reasons";

interface AuthDialogProps {
  open: boolean;
  /** Closed by the visitor (Escape, the backdrop, the close button). */
  onOpenChange: (open: boolean) => void;
  /** Signed in from the dialog; defaults to closing it like onOpenChange. */
  onSignedIn?: () => void;
  initialMode?: AuthDialogMode;
  /** Why it opened: one line above the buttons says so. */
  reason?: AuthPromptReason;
  trigger?: React.ReactNode; // Optional trigger element
  /** Same-site path to land on after sign-in (defaults to the current page) */
  callbackURL?: string;
}

/** Sign-in over the current page. The /sign-in page renders the same panel. */
export function AuthDialog({
  open,
  onOpenChange,
  onSignedIn,
  initialMode = "signin",
  reason,
  trigger,
  callbackURL,
}: AuthDialogProps) {
  const t = useTranslations("auth.reasons");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Only a path on this site, never another origin (lib/safe-redirect).
  const redirectTo = safeNextPath(callbackURL, "") || undefined;

  const getCallbackUrl = () => {
    if (redirectTo) return redirectTo;
    const baseUrl = pathname || "/playground";
    const queryString = searchParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger}
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-sm">
        <SignInPanel
          callbackURL={getCallbackUrl}
          Description={DialogDescription}
          mode={initialMode}
          notice={reason ? reasonLine(reason, t) : undefined}
          onSignedIn={onSignedIn ?? (() => onOpenChange(false))}
          redirectTo={redirectTo}
          shown={open}
          Title={DialogTitle}
        />
      </DialogContent>
    </Dialog>
  );
}
