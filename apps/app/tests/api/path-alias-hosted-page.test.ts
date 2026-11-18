// /p/<slug> on a custom domain is QRdx's hosted page first; when no page has
// that back-half, a path alias at /p/<slug> (lib/path-aliases.ts) sends the
// visitor on to its code's own back-half, which counts the scan, and an NFC
// tap (`?nfc`) stays a tap. app/(app)/p/[slug]/page.tsx, with the page
// lookup and the alias lookup stubbed.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  alias: null as { slug: string } | null,
  aliasLookups: [] as [string, string][],
}));

vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/app/(app)/p/_lib/public-page", () => ({
  loadPublicPage: async () => null,
  pageSummary: () => ({}),
}));
vi.mock("@/lib/path-alias-store", () => ({
  aliasCode: async (path: string, domainId: string) => {
    state.aliasLookups.push([path, domainId]);
    return state.alias;
  },
}));
// Rendering never happens here (no page is found); next/font doesn't load
// outside Next.
vi.mock("@/components/landing/render", () => ({ LandingRender: () => null }));
vi.mock("@/components/landing/page-footer", () => ({
  LandingPageFooter: () => null,
}));
vi.mock("@/components/landing/pixels", () => ({ Pixels: () => null }));
vi.mock("@/components/landing/precise-location", () => ({
  PreciseLocationPrompt: () => null,
}));
vi.mock("@/lib/i18n/request-locale", () => ({
  requestAppLocale: () => ({ current: "en" }),
}));

const { default: LandingPage } = await import("@/app/(app)/p/[slug]/page");

beforeEach(() => {
  state.alias = null;
  state.aliasLookups = [];
  state.headers = new Headers({
    host: "qr.switch.com",
    "x-qrdx-custom-domain": "dom_switch",
    "accept-language": "en",
  });
});

/** Where the page sends the visitor ("not found" when it doesn't). */
async function visit(slug: string, query: Record<string, string> = {}) {
  try {
    await LandingPage({
      params: Promise.resolve({ slug }),
      searchParams: Promise.resolve(query),
    });
    return "rendered";
  } catch (error) {
    const { message, url } = error as Error & { url?: string };
    return url ?? message;
  }
}

describe("a /p/ path alias behind the hosted page route", () => {
  it("sends the visitor on to the alias's code by its back-half", async () => {
    state.alias = { slug: "FlowAbc" };
    expect(await visit("QNA8kOWzd")).toBe("/FlowAbc");
    expect(state.aliasLookups).toEqual([["/p/QNA8kOWzd", "dom_switch"]]);
  });

  it("keeps an NFC tap a tap", async () => {
    state.alias = { slug: "FlowAbc" };
    expect(await visit("QNA8kOWzd", { nfc: "" })).toBe("/FlowAbc?nfc");
    // Other query parameters don't come along, as with back-halves.
    expect(await visit("QNA8kOWzd", { utm_source: "flyer" })).toBe("/FlowAbc");
  });

  it("is not found without an alias, and never looks one up off a custom domain", async () => {
    expect(await visit("QNA8kOWzd")).toBe("NEXT_NOT_FOUND");
    state.alias = { slug: "FlowAbc" };
    state.headers = new Headers({ host: "qrdx.dev", "accept-language": "en" });
    expect(await visit("QNA8kOWzd")).toBe("NEXT_NOT_FOUND");
    expect(state.aliasLookups).toHaveLength(1);
  });
});
