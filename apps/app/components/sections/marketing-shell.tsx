import { JsonLd } from "@repo/design-system/components/seo/json-ld";
import type { ReactNode } from "react";
import {
  SeasonalLayer,
  SeasonCharacters,
} from "@/components/seasonal/seasonal-layer";
import { CTASection } from "@/components/sections/cta-section";
import { FooterSection } from "@/components/sections/footer-section";
import { Navbar } from "@/components/sections/navbar";
import { organizationSchema } from "@/lib/seo-schema";

/**
 * The frame every marketing page sits in: the header, the page, the closing
 * band and the footer, between two ruled edges. Both (home) layouts use it:
 * app/[lang]/(home) for translated pages, app/(app)/(home) for the pages
 * that are English only so far.
 */
export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-7xl border-x">
      <JsonLd data={organizationSchema} />
      <div className="absolute top-0 left-6 z-10 block h-full w-px border-l border-border" />
      <div className="absolute top-0 right-6 z-10 block h-full w-px border-r border-border" />
      <SeasonalLayer />
      <Navbar />
      {children}
      <CTASection />
      <FooterSection />
      {/* Last: the characters are buttons, after the page in tab order. */}
      <SeasonCharacters />
    </div>
  );
}
