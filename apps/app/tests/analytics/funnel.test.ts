// The funnel's client-side steps (lib/analytics/funnel.ts, used by the hooks
// in lib/analytics/react.tsx): where an editor was opened from, and when a
// QR code or a barcode counts as generated. "Make dynamic" puts a short link
// in the editor; that's QRdx's doing, never a generated code.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  countsAsBarcode,
  countsAsGenerated,
  editorOpenedProps,
  editorOpenSource,
  fromPage,
  playgroundHandoffProps,
} from "@/lib/analytics/funnel";
import { sanitizeProps } from "@/lib/analytics/privacy";

const root = join(import.meta.dirname, "../..");

describe("editor_opened", () => {
  it("names where the visit came from, never an address", () => {
    expect(
      editorOpenSource({
        href: "https://qrdx.dev/playground?ref=chrome-extension#url=https://x.example",
        referrer: "",
        previousPath: null,
      }),
    ).toBe("chrome-extension");
    expect(
      editorOpenSource({
        href: "https://qrdx.dev/playground",
        referrer: "https://www.google.com/",
        previousPath: null,
      }),
    ).toBe("external");
    expect(
      editorOpenSource({
        href: "https://qrdx.dev/playground",
        referrer: "",
        previousPath: null,
      }),
    ).toBe("direct");
    // An in-app link: the tab's previous page, not the visit's first referrer.
    expect(
      editorOpenSource({
        href: "https://qrdx.dev/playground",
        referrer: "https://www.google.com/",
        previousPath: "/qr-code-generator/wifi",
      }),
    ).toBe("qr-code-generator");
    // A customer page the tab passed through isn't named.
    expect(
      editorOpenSource({
        href: "https://qrdx.dev/playground",
        referrer: "",
        previousPath: "/p/menu",
      }),
    ).toBe("direct");
  });

  it("sends only the surface and the source, which survive sanitizing", () => {
    const props = editorOpenedProps("barcode", {
      href: "https://qrdx.dev/barcode-generator?ref=mcp",
      referrer: "",
      previousPath: null,
    });
    expect(props).toEqual({ surface: "barcode", source: "mcp" });
    expect(sanitizeProps(props)).toEqual(props);
  });

  it("names the public page it came from (from_page), which survives sanitizing", () => {
    const props = editorOpenedProps("playground", {
      href: "https://qrdx.dev/playground?ref=not-found",
      referrer:
        "https://qrdx.dev/blog/qr-codes-for-restaurant-menus?utm_source=x#faq",
      previousPath: null,
    });
    expect(props).toEqual({
      surface: "playground",
      source: "not-found",
      from_page: "/blog/qr-codes-for-restaurant-menus",
    });
    expect(sanitizeProps(props)).toEqual(props);
    // An in-app link: the tab's previous page.
    expect(
      editorOpenedProps("type_tool", {
        href: "https://qrdx.dev/qr-code-generator/wifi",
        referrer: "https://www.google.com/",
        previousPath: "/es/qr-code-generator",
      }).from_page,
    ).toBe("/es/qr-code-generator");
  });

  it("is sent by every editor surface", () => {
    for (const [file, surface] of [
      ["components/editor.tsx", "playground"],
      ["components/sections/tools/type-generator.tsx", "type_tool"],
      ["components/sections/tools/barcode-generator.tsx", "barcode"],
      ["components/sections/ai-art/ai-art-studio.tsx", "ai_art"],
      ["components/sections/tools/bulk-generator.tsx", "bulk_tool"],
    ]) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source, file).toContain(`useTrackEditorOpened("${surface}"`);
    }
  });
});

describe("qr_generated", () => {
  const base = {
    content: "https://example.com/menu",
    initial: "https://qrdx.dev",
    contentType: "url",
    counted: new Set<string>(),
    programmatic: new Set<string>(),
  };

  it("counts content the visitor changed, once per content type", () => {
    expect(countsAsGenerated(base)).toBe(true);
    expect(countsAsGenerated({ ...base, counted: new Set(["url"]) })).toBe(
      false,
    );
    expect(
      countsAsGenerated({
        ...base,
        contentType: "wifi",
        counted: new Set(["url"]),
      }),
    ).toBe(true);
  });

  it("doesn't count the page's own content, or nothing", () => {
    expect(countsAsGenerated({ ...base, content: base.initial })).toBe(false);
    expect(countsAsGenerated({ ...base, content: "  " })).toBe(false);
    expect(countsAsGenerated({ ...base, content: null })).toBe(false);
  });

  it("doesn't count a dynamic code's short link QRdx put in the editor", () => {
    const shortLink = "https://qrdx.dev/q/abc1234";
    expect(
      countsAsGenerated({
        ...base,
        content: shortLink,
        programmatic: new Set([shortLink]),
      }),
    ).toBe(false);
    // Make dynamic, loading a saved code and the builder all mark it first.
    for (const file of [
      "components/editor/dynamic-link-toggle.tsx",
      "components/code-builder/in-place.ts",
    ]) {
      const source = readFileSync(join(root, file), "utf8");
      const sets = source.match(/setValue\([^)]*shortLink\)/g) ?? [];
      const marks = source.match(/markProgrammaticQrContent\(/g) ?? [];
      expect(sets.length, file).toBeGreaterThan(0);
      expect(marks.length, file).toBeGreaterThanOrEqual(sets.length);
    }
  });
});

describe("barcode_generated", () => {
  const base = {
    rendered: true,
    symbology: "ean13",
    value: "4006381333931",
    initial: { symbology: "ean13", value: "590123412345" },
    counted: new Set<string>(),
  };

  it("counts a drawn barcode other than the page's own, once per symbology", () => {
    expect(countsAsBarcode(base)).toBe(true);
    expect(countsAsBarcode({ ...base, counted: new Set(["ean13"]) })).toBe(
      false,
    );
    // Another symbology's example counts: the visitor picked it.
    expect(
      countsAsBarcode({ ...base, symbology: "qrcode", value: "QRdx" }),
    ).toBe(true);
  });

  it("doesn't count the page's own barcode, or one that didn't draw", () => {
    expect(countsAsBarcode({ ...base, value: base.initial.value })).toBe(false);
    expect(countsAsBarcode({ ...base, rendered: false })).toBe(false);
    expect(countsAsBarcode({ ...base, value: " " })).toBe(false);
  });
});

describe("Umami", () => {
  it("loads right after hydration, so quick visits are counted", () => {
    const source = readFileSync(
      join(root, "../../packages/analytics/analytics.tsx"),
      "utf8",
    );
    expect(source).toContain('strategy="afterInteractive"');
    expect(source).not.toContain('strategy="lazyOnload"');
  });
});

describe("from_page", () => {
  const ORIGIN = "https://qrdx.dev";

  it("is a public page's path on this origin, at most 64 characters", () => {
    expect(fromPage("https://qrdx.dev/", ORIGIN)).toBe("/");
    expect(fromPage("https://qrdx.dev/tools/bulk?x=1", ORIGIN)).toBe(
      "/tools/bulk",
    );
    const long = `/blog/${"a".repeat(80)}`;
    expect(fromPage(`https://qrdx.dev${long}`, ORIGIN)).toBe(long.slice(0, 64));
  });

  it("is nothing for another site, the signed-in app, a customer page or a broken address", () => {
    for (const referrer of [
      "",
      "https://www.google.com/search?q=qr",
      "https://qrdx.dev.example.com/blog/x",
      "https://qrdx.dev/dashboard/acme/codes/abc123",
      "https://qrdx.dev/settings/account",
      "https://qrdx.dev/admin/users",
      "https://qrdx.dev/invite/AbC123",
      "https://qrdx.dev/join/tok_123",
      "https://qrdx.dev/sign-in",
      "https://qrdx.dev/success?checkout_id=chk_1",
      "https://qrdx.dev/p/menu",
      "https://qrdx.dev/q/aB3dE5f",
      "https://qrdx.dev/stats/tok_1",
      "https://qrdx.dev/portal/acme",
      "https://qrdx.dev/templates/menu/bistro",
      "https://qrdx.dev/es/scan",
      "not a url",
    ]) {
      expect(fromPage(referrer, ORIGIN), referrer).toBeUndefined();
    }
  });
});

describe("playground_handoff", () => {
  it("names the tag or section, the page and what the link applied", () => {
    const props = playgroundHandoffProps({
      referrer: "https://qrdx.dev/qr-code-generator/wifi",
      origin: "https://qrdx.dev",
      ref: null,
      applied: ["type", "open"],
    });
    expect(props).toEqual({
      source: "qr-code-generator",
      target: "type+open",
      from_page: "/qr-code-generator/wifi",
    });
    expect(sanitizeProps(props)).toEqual(props);
    expect(
      playgroundHandoffProps({
        referrer: "https://www.figma.com/",
        origin: "https://qrdx.dev",
        ref: "figma-plugin",
        applied: ["style"],
      }),
    ).toEqual({ source: "figma-plugin", target: "style" });
  });
});
