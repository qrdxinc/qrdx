import type { Metadata, Viewport } from "next";
import { getTranslations } from "next-intl/server";
import { RootDocument } from "@/components/root-document";
import { rootMetadata, rootViewport } from "@/lib/root-metadata";

// The docs site's root layout. The docs are English only.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return rootMetadata({
    title: t("siteTitle"),
    description: t("siteDescription"),
  });
}

export const viewport: Viewport = rootViewport;

export default function Layout({ children }: LayoutProps<"/">) {
  return <RootDocument>{children}</RootDocument>;
}
