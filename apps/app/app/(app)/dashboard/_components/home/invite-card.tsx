"use client";

import { track } from "@repo/analytics";
import { toast } from "@repo/design-system";
import { Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { Copy } from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useSpotlightsSeen } from "@/components/app-shell/feature-spotlight";
import { INVITE_BONUS_CODES } from "@/lib/invites/terms";

type Copied = "link" | "message" | null;

/**
 * Home, once one of the workspace's codes has been scanned
 * (first-run-rules.ts): the person's invite link and a message to send
 * with it, each with a copy button. Hidden for good once hidden (the
 * account remembers it with the spotlights).
 */
export function InviteCard({ link }: { link: string }) {
  const t = useTranslations("app.dashboard.home.inviteCard");
  const spotlights = useSpotlightsSeen();
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState<Copied>(null);
  // Nothing until this browser's copy of what was hidden is read.
  if (!spotlights || hidden || spotlights.seen.has("home-invite")) return null;

  const message = t("message", { count: INVITE_BONUS_CODES, link });
  const copy = async (what: Exclude<Copied, null>) => {
    try {
      await navigator.clipboard.writeText(what === "link" ? link : message);
      setCopied(what);
      track("invite_link_copied", {
        surface: what === "link" ? "home_card" : "home_card_message",
      });
      toast.success(what === "link" ? t("linkCopied") : t("messageCopied"));
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error(t("couldntCopy"));
    }
  };

  return (
    <Card className="gap-3 p-5 shadow-xs">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold tracking-tight">{t("title")}</h2>
        <p className="text-muted-foreground text-sm text-pretty">
          {t("body", { count: INVITE_BONUS_CODES })}
        </p>
      </div>
      {/* Text that wraps rather than a field, so nothing is cut off on a phone. */}
      <p className="bg-muted/40 rounded-md border px-3 py-2 text-sm text-pretty break-words select-all">
        <span className="sr-only">{t("messageLabel")} </span>
        {message}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => copy("message")} size="sm" type="button">
          {copied === "message" ? <Tick aria-hidden /> : <Copy aria-hidden />}
          {copied === "message" ? t("copied") : t("copyMessage")}
        </Button>
        <Button
          onClick={() => copy("link")}
          size="sm"
          type="button"
          variant="outline"
        >
          {copied === "link" ? <Tick aria-hidden /> : <Copy aria-hidden />}
          {copied === "link" ? t("copied") : t("copyLink")}
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href="/settings/invite">{t("howItWorks")}</Link>
        </Button>
        <Button
          className="text-muted-foreground ml-auto"
          onClick={() => {
            setHidden(true);
            spotlights.markSeen("home-invite");
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("hide")}
        </Button>
      </div>
    </Card>
  );
}
