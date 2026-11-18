"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { SignInOptions } from "@/lib/auth/sign-in-options";
import { SignInPanel } from "../components/sign-in-panel";
import { type SocialSignIn, signInErrorMessage } from "./_lib/error-message";
import type { SignInPageMode } from "./_lib/params";

function Heading({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return <h1 className={className}>{children}</h1>;
}

function Lead({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return <p className={className}>{children}</p>;
}

/**
 * The sign-in panel on a page: centered, with a way back to the site.
 * Google, GitHub and the email code all land on `next` (already checked by
 * lib/safe-redirect on the server). `mode` "signup" shows it as the dialog's
 * sign-up (?mode=signup). `options` are the ways in the server offers for
 * this request; without them the panel asks.
 */
export function SignInPage({
  next,
  signedOut,
  error = null,
  via = null,
  mode = "signin",
  options,
}: {
  next: string;
  signedOut: boolean;
  /** "signup" for ?mode=signup; a sign-in otherwise. */
  mode?: SignInPageMode;
  /** Code from a failed sign-in; its description isn't shown (it's from the URL). */
  error?: string | null;
  /** Google or GitHub; otherwise single sign-on. */
  via?: SocialSignIn | null;
  options?: SignInOptions;
}) {
  const t = useTranslations("app.signIn.signInPage");
  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 px-4 py-10">
      <div className="bg-card w-full max-w-sm overflow-hidden rounded-xl border shadow-sm">
        <SignInPanel
          callbackURL={() => next}
          Description={Lead}
          mode={mode}
          notice={
            error
              ? signInErrorMessage(error, via)
              : signedOut
                ? "You're signed out."
                : undefined
          }
          options={options}
          redirectTo={next}
          Title={Heading}
        />
      </div>
      <Link
        className="text-muted-foreground hover:text-foreground inline-flex min-h-10 items-center rounded-sm px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        href="/"
      >
        {t("backToQrdx")}
      </Link>
    </main>
  );
}
