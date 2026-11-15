import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CommunityWall } from "@/components/showcase/community-wall";
import { createMetadata } from "@/lib/metadata";

// The "Made with QRdx" wall: real codes QRdx made with sample content, in
// every theme, art style and content type. The home page's wall leads here
// (components/showcase/wall-heading.tsx, WALL_PATH).

export const metadata: Metadata = createMetadata({
  title: "Made with QRdx: QR code design examples",
  description:
    "Real QR codes made with QRdx: every theme, art style, frame and content type, with sample content. Scan any of them, or open one in the generator.",
  keywords: [
    "qr code examples",
    "qr code design ideas",
    "custom qr code examples",
    "styled qr codes",
  ],
  path: "/community/made-with-qrdx",
});

export default async function MadeWithQrdxPage() {
  const t = await getTranslations("community.more");
  return (
    <main className="w-full border-b">
      <CommunityWall
        labels={{ load: t("load"), loading: t("loading"), failed: t("failed") }}
      />
    </main>
  );
}
