"use client";

import { useTranslations } from "next-intl";
import { SignUpNudge, useSignUpNudge } from "@/components/sign-up-nudge";
import { designRestoredThisVisit } from "@/lib/sign-up-nudges";
import { useAuthStore } from "@/store/auth-store";

/**
 * Under the toolbar, for a signed-out visitor whose last design came back
 * from this browser (a return visit, never the first): keep designs on
 * every device with a free account. After sign-in, Save opens.
 */
export function KeepDesignsNudge() {
  const t = useTranslations("editor.actionBar.keepDesigns");
  const openAuthDialog = useAuthStore((state) => state.openAuthDialog);
  const nudge = useSignUpNudge("keep_designs", designRestoredThisVisit());

  if (!nudge.shown) return null;
  return (
    <SignUpNudge
      className="border-t px-4 py-2"
      cta={t("cta")}
      id="keep_designs"
      onCta={() => openAuthDialog("keep_designs", { action: "SAVE_THEME" })}
      onDismiss={nudge.dismiss}
      reason="keep_designs"
      text={t("text")}
    />
  );
}
