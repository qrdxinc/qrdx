import { Button } from "@repo/design-system/components/ui/button";
import { Brush2 } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CommunitySearch } from "@/components/community/community-search";
import { CommunityTabs } from "@/components/community/community-tabs";
import { DeferredRow } from "@/components/community/deferred-community";
import { homeRow } from "@/components/community/home-rows";
import { RowSection } from "@/components/community/row-section";
import { readsDatabaseWhileRendering } from "@/lib/build-without-database";
import { getCommunityHome, homeSizes } from "@/lib/community/home";
import { pickSections } from "@/lib/community/home-sections";
import {
  COMMUNITY_LICENSE_NAME,
  COMMUNITY_LICENSE_URL,
} from "@/lib/community/licence";
import { MIN_GATE_SCORE } from "@/lib/community/scan-samples";
import { createMetadata } from "@/lib/metadata";
import { playgroundHref } from "@/lib/playground-links";

export const metadata: Metadata = createMetadata({
  title: "Community QR Code Frames & Themes",
  description:
    "Free QR code frames and themes shared by QRdx and its users. Every one scans, and every one is free under CC0. Open any of them in the QR code generator.",
  keywords: [
    "qr code frames",
    "qr code designs",
    "qr code themes",
    "custom qr code styles",
    "community qr codes",
  ],
  path: "/community",
  ownOgImage: true,
});

/** Rows drawn in the page's HTML; the rest load as they near the screen. */
const SERVER_ROWS = 2;

/** Cards of the first row whose designs are in the HTML too. */
const EAGER_CARDS = 4;

export default async function CommunityPage() {
  await readsDatabaseWhileRendering();
  const [home, t] = await Promise.all([
    getCommunityHome(),
    getTranslations("community.more"),
  ]);
  const labels = {
    load: t("load"),
    loading: t("loading"),
    failed: t("failed"),
  };
  const sections = pickSections(homeSizes(home));

  return (
    <main className="w-full border-b">
      <header className="mx-6 px-4 pt-12 pb-8 sm:px-6 md:pt-16 md:pb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
          Frames, themes and pages for your QR codes
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-pretty md:text-lg">
          Made by QRdx and the people who use it. Every one scans, and every one
          is free to use.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <CommunitySearch className="sm:max-w-md" />
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
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
        </div>
      </header>

      <CommunityTabs
        active="home"
        showCollections={home.collections.length > 0}
        showTemplates={home.templates.length > 0}
        wide
      />

      <div className="mx-6 space-y-12 px-4 py-10 sm:px-6 md:space-y-14 md:py-12">
        {sections.map((id, index) => {
          const row = homeRow(id, home);
          return (
            <RowSection
              badge={row.badge}
              href={row.href}
              id={id}
              key={id}
              sub={row.sub}
              title={row.title}
            >
              {index < SERVER_ROWS ? (
                row.cards(index === 0 ? EAGER_CARDS : 0)
              ) : (
                <DeferredRow
                  count={row.count}
                  kind={row.kind}
                  labels={labels}
                  row={id}
                />
              )}
            </RowSection>
          );
        })}
      </div>

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
    </main>
  );
}
