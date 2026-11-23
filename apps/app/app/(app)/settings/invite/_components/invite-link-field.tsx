"use client";

import { track } from "@repo/analytics";
import { toast } from "@repo/design-system";
import { Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Copy } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** The invite link, read-only, with a copy button. */
export function InviteLinkField({ link }: { link: string }) {
  const t = useTranslations("app.settings.inviteFriends.inviteLinkField");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      track("invite_link_copied", { surface: "settings" });
      toast.success(t("linkCopied"));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("couldntCopy"));
    }
  };
  // Text that wraps rather than an input, so the code at the end is never
  // cut off on a phone.
  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
      <code className="bg-muted/40 min-w-0 flex-1 rounded-md border px-3 py-2 font-mono text-sm break-all select-all">
        <span className="sr-only">{t("yourInviteLink")} </span>
        {link}
      </code>
      <Button
        className="self-start"
        onClick={copy}
        type="button"
        variant="outline"
      >
        {copied ? <Tick aria-hidden /> : <Copy aria-hidden />}
        {copied ? t("copied") : t("copy")}
      </Button>
    </div>
  );
}
