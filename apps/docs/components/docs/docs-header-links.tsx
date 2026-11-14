import { ArrowRight } from "iconsax-reactjs";
import { LocaleLink } from "@/components/i18n/locale-link";

/**
 * The header's primary button: into the main app's dashboard (a full page
 * load, through ZoneLink; the dashboard belongs to apps/app). fumadocs
 * renders the same element in the header on wide screens and at the top of
 * the mobile menu, so it fills the width there.
 */
export function DashboardLink({ label }: { label: string }) {
  return (
    <LocaleLink
      // In the mobile menu (a dialog) it fills the width.
      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-fd-primary px-3.5 text-sm font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2 focus-visible:ring-offset-fd-background in-[[role=dialog]]:mb-2 in-[[role=dialog]]:h-9 in-[[role=dialog]]:w-full"
      href="/dashboard"
      prefetch={false}
    >
      {label}
      <ArrowRight aria-hidden className="size-3.5" />
    </LocaleLink>
  );
}
