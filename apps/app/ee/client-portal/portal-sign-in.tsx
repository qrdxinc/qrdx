"use client";

// The client portal's sign-in (agency tools): the app's email-code sign-in,
// under the portal's branding. Signing in for the first time also makes the
// person a free QRdx account of their own; the portal never shows it.

import { authClient } from "@repo/auth/client";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import { Logout } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmailCodeSignIn } from "@/app/(app)/(auth)/components/email-code-sign-in";
import { useSignInOptions } from "@/app/(app)/(auth)/components/use-sign-in-options";

export function PortalSignIn() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [sentTo, setSentTo] = useState<string | null>(null);
  // Whether a code can reach anyone here, as the running server says (the
  // main sign-in's answer). Codes are the portal's only way in.
  const { options, confirmed, failed } = useSignInOptions(undefined, true);
  if (!options.email && confirmed) {
    return (
      <p className="text-muted-foreground text-sm text-pretty" role="status">
        {t("emailCodeSignIn.emailSignInIsntSet")}
      </p>
    );
  }
  // The page's guess had no codes and the server hasn't answered yet. If it
  // can't be asked, the form stays: its send answers what the server can do.
  if (!(options.email || failed)) {
    return (
      <div aria-busy="true" className="flex justify-center" role="status">
        <ModuleOrbit aria-hidden className="size-5" />
        <span className="sr-only">{t("signInPanel.loading")}</span>
      </div>
    );
  }
  // The form brings its own side padding (the sign-in panel's); the card
  // around it here already has some.
  return (
    <div className="-mx-6">
      <EmailCodeSignIn
        onSentToChange={setSentTo}
        onSignedIn={() => router.refresh()}
        sentTo={sentTo}
      />
    </div>
  );
}

export function PortalSignOut({ label = "Sign out" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await authClient.signOut().catch(() => {});
        router.refresh();
        setBusy(false);
      }}
      size="sm"
      type="button"
      variant="ghost"
    >
      <Logout aria-hidden />
      {label}
    </Button>
  );
}
