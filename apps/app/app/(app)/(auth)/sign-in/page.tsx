import { auth } from "@repo/auth/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSignInOptions } from "@/lib/auth/sign-in-options-server";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { readSignInParams } from "./_lib/params";
import { SignInPage } from "./sign-in-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getAppTranslations("app.signIn.signInPage");
  return { title: t("pageTitle"), robots: { index: false, follow: false } };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The sign-in page: the same panel as the dialog, on a page of its own. It's
 * where proxy.ts and page guards send signed-out visitors (/sign-in?next=…),
 * where /sign-out lands (?signedOut=1), and the fallback when the dialog
 * can't open; ?mode=signup opens it as the dialog's sign-up does. Signed-in
 * visitors go straight to `next`. It's rendered per request, so it shows the
 * ways in this server offers now, not what the build saw.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { next, signedOut, error, via, mode } = readSignInParams(
    await searchParams,
  );

  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) redirect(next);

  return (
    <SignInPage
      error={error}
      mode={mode}
      next={next}
      options={getSignInOptions()}
      signedOut={signedOut}
      via={via}
    />
  );
}
