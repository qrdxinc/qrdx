"use client";

import { track } from "@repo/analytics";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/design-system/components/ui/tooltip";
import { cn } from "@repo/design-system/lib/utils";
import { Crown1 } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  type CheckoutOpen,
  upgradeTo,
} from "@/app/(app)/settings/usage/_lib/meters";
import { LocaleLink } from "@/components/i18n/locale-link";
import type { Plan } from "@/lib/pricing";

/**
 * The sidebar's Upgrade row: Free workspaces, for the people who can change
 * the plan (owners and billing members), while checkout sells Pro.
 */
export function showsSidebarUpgrade({
  plan,
  canUpgrade,
  checkoutOpen,
}: {
  plan: Plan;
  canUpgrade: boolean;
  checkoutOpen: CheckoutOpen;
}): boolean {
  return plan === "free" && upgradeTo("pro", canUpgrade, checkoutOpen) !== null;
}

/** A quiet row above the workspace switcher, linking to /pricing. */
export function UpgradeRow({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("app.shell.appSidebar");
  const link = (
    <LocaleLink
      aria-label={collapsed ? t("upgradeToPro") : undefined}
      className={cn(
        "hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-ring/50 text-muted-foreground flex shrink-0 items-center rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-inset",
        collapsed ? "size-9 justify-center" : "h-8 w-full gap-2.5 px-2.5",
      )}
      href="/pricing"
      onClick={() => {
        track("upgrade_clicked", { source: "sidebar", plan: "pro" });
        onNavigate?.();
      }}
    >
      <Crown1 aria-hidden className="size-4 shrink-0" />
      {!collapsed && (
        <span className="flex-1 truncate text-left">{t("upgrade")}</span>
      )}
    </LocaleLink>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{t("upgradeToPro")}</TooltipContent>
    </Tooltip>
  );
}
