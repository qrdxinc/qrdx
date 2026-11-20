// The template demos (/templates/<type>/<template>) are samples: the
// gallery at /templates is the page to index. Each demo stays out of search
// with noindex (its links still followed) and names itself as canonical.
// A canonical pointing at the gallery from a noindex page sent Google two
// signals that disagree, and Search Console showed it ignored that canonical.
import { describe, expect, it, vi } from "vitest";

// next/font only works inside Next's compiler.
vi.mock("next/font/google", () => {
  const font = (options: { variable: string }) => ({
    className: "",
    variable: `font-var${options.variable}`,
    style: { fontFamily: "" },
  });
  return {
    Bricolage_Grotesque: font,
    Cormorant_Garamond: font,
    DM_Sans: font,
    Fraunces: font,
    Instrument_Serif: font,
    Space_Grotesk: font,
  };
});

import { generateMetadata } from "@/app/(app)/templates/[type]/[template]/page";
import { listTemplateDemos } from "@/lib/landing/demo";
import { baseUrl } from "@/lib/metadata";

const metadataOf = (type: string, template: string) =>
  generateMetadata({ params: Promise.resolve({ type, template }) });

describe("template demo metadata", () => {
  it("keeps every demo out of search, with itself as canonical", async () => {
    const demos = listTemplateDemos();
    expect(demos.length).toBeGreaterThan(0);
    for (const demo of demos) {
      const metadata = await metadataOf(demo.template.type, demo.variant.id);
      const url = new URL(demo.path, baseUrl).toString();
      expect(metadata.robots).toEqual({ index: false, follow: true });
      expect(metadata.alternates?.canonical).toBe(url);
      expect(metadata.openGraph?.url).toBe(url);
    }
  });
});
