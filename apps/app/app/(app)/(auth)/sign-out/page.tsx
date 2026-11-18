import type { Metadata } from "next";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { SignOutScreen } from "./sign-out-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getAppTranslations("app.signOut.signOutScreen");
  return { title: t("pageTitle"), robots: { index: false, follow: false } };
}

/** Signs out (a POST from the browser), then opens /sign-in?signedOut=1. */
export default function SignOutPage() {
  return <SignOutScreen />;
}
