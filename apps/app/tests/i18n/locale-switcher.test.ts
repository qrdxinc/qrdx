// The language menu (components/i18n/locale-switcher.tsx): each language
// links to the same page in that language, or, on an English-only page, to
// the QR code designer in that language. A page the site zone serves in
// every language (the generators, owner decision 23 Nov 2026) passes its
// own addresses, and every language opens that page.
import { LOCALES } from "@repo/i18n/config";
import { localizeSitePath } from "@repo/i18n/paths";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/locale-cookie", () => ({ rememberLocale: () => {} }));

const { switcherLinks } = await import("@/components/i18n/locale-switcher");

describe("switcherLinks", () => {
  it("keeps a translated page in every language", () => {
    const { translated, hrefFor } = switcherLinks("/es/playground", "es");
    expect(translated).toBe(true);
    expect(hrefFor("en")).toBe("/playground");
    expect(hrefFor("ja")).toBe("/ja/playground");
  });

  it("opens the designer from an English-only page", () => {
    const { translated, hrefFor } = switcherLinks("/pricing", "en");
    expect(translated).toBe(false);
    expect(hrefFor("en")).toBe("/pricing");
    expect(hrefFor("ja")).toBe("/ja/playground");
  });

  it("opens the same generator page in each language when given its addresses", () => {
    const path = "/qr-code-generator/wifi";
    const hrefs = Object.fromEntries(
      LOCALES.map((locale) => [locale, localizeSitePath(path, locale)]),
    ) as Record<(typeof LOCALES)[number], string>;
    for (const pathname of [path, "/es/qr-code-generator/wifi"]) {
      const { translated, hrefFor } = switcherLinks(pathname, "es", hrefs);
      expect(translated).toBe(true);
      expect(hrefFor("en")).toBe("/qr-code-generator/wifi");
      expect(hrefFor("es")).toBe("/es/qr-code-generator/wifi");
      expect(hrefFor("zh-Hans")).toBe("/zh-hans/qr-code-generator/wifi");
    }
  });
});
