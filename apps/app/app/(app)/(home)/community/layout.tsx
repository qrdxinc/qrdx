import { appOrigin } from "@repo/config/origins";
import { Button } from "@repo/design-system/components/ui/button";
import { Brush2 } from "iconsax-reactjs";
import Link from "next/link";
import { CommunityShell } from "@/components/community/community-shell";
import { visibleTabs } from "@/components/community/community-views";
import { fieldRows, qrModules } from "@/components/community/header-field";
import { HeaderFieldArt } from "@/components/community/header-field-art";
import { readsDatabaseWhileRendering } from "@/lib/build-without-database";
import { hasCollections, hasKits, hasTemplates } from "@/lib/community/home";
import {
  COMMUNITY_LICENSE_NAME,
  COMMUNITY_LICENSE_URL,
} from "@/lib/community/licence";
import { MIN_GATE_SCORE } from "@/lib/community/scan-samples";
import { logError } from "@/lib/log-error";
import { playgroundHref } from "@/lib/playground-links";

// Every community page. The tabbed views (the overview, "All" and the
// galleries) share one frame, drawn here so it stays put while they switch:
// the header, the tabs and the licence line (CommunityShell). The tab set
// is decided here, once, from what's published, so it's the same on every
// view. Other pages under /community draw their own.
//
// The @modal slot: "Make a collection or kit" opens as a modal over the
// community page it was opened from (see @modal/(.)new). A direct visit to
// /community/new still gets the full page.

/** The header's ASCII field, for the community's own address. */
let field: Promise<string[]> | null = null;
let fieldFor = "";

/**
 * The field's rows, built once per address. A field that can't be built is
 * logged and left out (it's decoration), and tried again next time.
 */
function communityField(): Promise<string[]> {
  const url = new URL("/community", appOrigin()).toString();
  if (!field || fieldFor !== url) {
    fieldFor = url;
    field = qrModules(url)
      .then((modules) => fieldRows(modules))
      .catch((error: unknown) => {
        field = null;
        logError(error instanceof Error ? error : new Error(String(error)), {
          where: "community header field",
        });
        return [];
      });
  }
  return field;
}

export default async function CommunityLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  await readsDatabaseWhileRendering();
  const [collections, templates, kits, rows] = await Promise.all([
    hasCollections(),
    hasTemplates(),
    hasKits(),
    communityField(),
  ]);

  return (
    <>
      <CommunityShell
        actions={
          // Side by side from 390px; on a narrower phone "Make your own"
          // doesn't fit half the row, so the buttons stack.
          <div className="grid shrink-0 gap-2 min-[24.375rem]:grid-cols-2 sm:flex">
            <Button asChild className="h-10 rounded-full px-3 sm:px-4">
              <Link href={playgroundHref({ tab: "design" })}>
                <Brush2 aria-hidden />
                Make your own
              </Link>
            </Button>
            <Button
              asChild
              className="h-10 rounded-full px-3 sm:px-4"
              variant="outline"
            >
              <Link href="/community/new">Make a collection</Link>
            </Button>
          </div>
        }
        field={rows.length > 0 && <HeaderFieldArt rows={rows} />}
        footer={
          <p className="text-muted-foreground mx-6 border-t px-4 py-6 text-xs sm:px-6">
            Everything here is free under{" "}
            <a
              className="hover:text-foreground underline underline-offset-2"
              href={COMMUNITY_LICENSE_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              {COMMUNITY_LICENSE_NAME}
            </a>
            : use it for anything, no credit needed. New items must scan Great (
            {MIN_GATE_SCORE}+) to be published.
          </p>
        }
        tabs={visibleTabs({ collections, templates, kits })}
      >
        {children}
      </CommunityShell>
      {modal}
    </>
  );
}
