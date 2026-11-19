import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CommunityContent } from "@/components/community/community-content";
import { OVERVIEW_ROWS } from "@/components/community/community-skeletons";
import { DeferredRow } from "@/components/community/deferred-community";
import { homeRow } from "@/components/community/home-rows";
import { RowSection } from "@/components/community/row-section";
import { readsDatabaseWhileRendering } from "@/lib/build-without-database";
import { getCommunityHome, homeSizes } from "@/lib/community/home";
import { pickSections } from "@/lib/community/home-sections";
import { createMetadata } from "@/lib/metadata";

// The overview's rows. Its header, tabs and licence line are the shared
// community frame (../layout.tsx); its loading placeholder is ./loading.tsx.

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
    <CommunityContent className={OVERVIEW_ROWS}>
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
    </CommunityContent>
  );
}
