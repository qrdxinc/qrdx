"use client";

import { authClient } from "@repo/auth/client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { executePostLoginAction } from "@/lib/hooks/use-post-login-action";
import { useAuthStore } from "@/store/auth-store";

// The dialog (sign-in UI, icon set, logo animation) loads the first time it
// opens, so it stays out of every page's first load.
const AuthDialog = dynamic(
  () =>
    import("@/app/(app)/(auth)/components/auth-dialog").then(
      (m) => m.AuthDialog,
    ),
  { ssr: false },
);

/** The dialog's closing animation, and a little more. */
const DIALOG_CLOSE_MS = 350;

export function AuthDialogWrapper() {
  const {
    isOpen,
    mode,
    reason,
    closeAuthDialog,
    dismissAuthDialog,
    postLoginAction,
    clearPostLoginAction,
    callbackURL,
  } = useAuthStore();
  const { data: session } = authClient.useSession();

  useEffect(() => {
    if (isOpen && session) {
      closeAuthDialog();
    }
  }, [session, isOpen, closeAuthDialog]);

  // Analytics identity (by user id, never email): lib/analytics/identity.ts.

  // The interrupted action runs once the dialog has finished closing: as it
  // goes it hands focus back to the page, which would dismiss a dialog the
  // action opens (Save, the code builder) the moment it appeared.
  useEffect(() => {
    if (!(session && postLoginAction) || isOpen) return;
    const timer = window.setTimeout(() => {
      // Handlers that aren't mounted yet pick it up when they are.
      executePostLoginAction(postLoginAction);
      clearPostLoginAction();
    }, DIALOG_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [session, isOpen, postLoginAction, clearPostLoginAction]);

  // Once opened, keep it mounted so closing still animates.
  const [hasOpened, setHasOpened] = useState(isOpen);
  if (isOpen && !hasOpened) setHasOpened(true);
  if (!hasOpened) return null;

  return (
    <AuthDialog
      callbackURL={callbackURL ?? undefined}
      initialMode={mode}
      onOpenChange={(open) => {
        if (!open) dismissAuthDialog();
      }}
      onSignedIn={closeAuthDialog}
      open={isOpen}
      reason={reason}
    />
  );
}
