import { QrdxLogo } from "@repo/design-system/components/brand/qrdx-logo";
import {
  ADMIN_CONSOLE_CONFIRM_PATH,
  adminConsoleAddress,
  adminConsoleReturnUrl,
} from "@repo/next-config/console-zone";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/app/(app)/admin/_lib/guard";
import { ConfirmIdentityProvider } from "@/components/confirm-identity/provider";
import { env } from "@/env";
import { CONFIRMATION_MINUTES } from "@/lib/account/confirmation";
import { currentSession } from "@/lib/account/confirmation-server";
import { sessionCheckPath } from "@/lib/account/session-origin";
import { twoFactorEnabledFor } from "@/lib/account/two-factor-server";
import { signInPath } from "@/lib/safe-redirect";
import { AuthorizeShell } from "../authorize/oauth-consent";
import { ConsoleConfirm, TwoFactorFirst } from "./console-confirm";

// "Confirm it's you" for the back-office console at its own address
// (ADMIN_CONSOLE_URL). The console can't run this app's dialog, so an action
// there that needs a strong confirmation links here with ?next=<its page>,
// and the admin comes back once this browser's qrdx.dev session has one. The
// confirmation is the same record as anywhere in this app (a `verification`
// row for the session, lib/account/confirmation-server.tsx), which the
// console checks for the session it signed in with.
//
// Only for the console: a 404 while it isn't set up here, and `next` must be
// a page at exactly its address (adminConsoleReturnUrl), else the admin goes
// back to its front page. Signed out: sign in, then back here. A held
// session: the session check first. Anyone but an admin: a 404. An admin
// without two-step verification is told to turn it on: the console's
// confirmations take a passkey, an authenticator code or a backup code.
// Not under /admin, which goes to the console once it's set up.

export const metadata: Metadata = {
  title: "Confirm it's you",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ConsoleConfirmPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const consoleUrl = adminConsoleAddress({
    adminConsoleUrl: env.ADMIN_CONSOLE_URL,
    secret: env.CONSOLE_ZONE_KEY,
  });
  if (!consoleUrl) notFound();

  const { next } = await searchParams;
  const back =
    adminConsoleReturnUrl(typeof next === "string" ? next : null, consoleUrl) ??
    `${consoleUrl}/`;
  const here = `${ADMIN_CONSOLE_CONFIRM_PATH}?next=${encodeURIComponent(back)}`;

  // Held or not: a held session isn't signed out, it confirms first.
  const session = await currentSession();
  if (!session) redirect(signInPath(here));
  if (session.held) redirect(sessionCheckPath(here));
  const admin = await requireAdmin();
  if (admin.id !== session.userId) notFound();
  const twoFactorOn = await twoFactorEnabledFor(admin.id);
  const consoleHost = new URL(consoleUrl).host;

  return (
    <ConfirmIdentityProvider>
      <AuthorizeShell>
        <div className="flex flex-col items-center text-center">
          <span className="bg-foreground text-background flex size-16 items-center justify-center rounded-2xl border p-4">
            <QrdxLogo />
          </span>
          <h1 className="mt-6 text-lg font-semibold text-balance">
            {twoFactorOn
              ? "Confirm it's you"
              : "Turn on two-step verification first"}
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm text-pretty">
            {twoFactorOn
              ? `This change in the console needs a passkey, an authenticator code or a backup code from the last ${CONFIRMATION_MINUTES} minutes. Once you've confirmed, you go back to ${consoleHost}.`
              : "Changes in the console that need a confirmation are open only to admins with two-step verification on their own account. Turn it on in your account settings, then try the change again."}
          </p>
        </div>

        <div className="mt-6 rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Signed in to QRdx as</p>
          <p className="truncate text-sm font-medium">{admin.email}</p>
        </div>

        <div className="mt-6">
          {twoFactorOn ? (
            <ConsoleConfirm next={back} />
          ) : (
            <TwoFactorFirst next={back} />
          )}
        </div>
      </AuthorizeShell>
    </ConfirmIdentityProvider>
  );
}
