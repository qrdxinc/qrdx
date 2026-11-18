// What a customer's custom domain serves (app/(app)/dashboard/domains/_lib
// host-routing.ts, used by proxy.ts), as apps/docs/content/docs/custom-domains.mdx
// describes it: `/<slug>` (generated or a custom back-half) is the short link,
// `/p/<slug>` its hosted page, the page APIs pass through, `/` is a small page,
// path aliases (migrate.mdx) go to their lookup on domains that have any,
// and nothing else of QRdx is reachable. Runs against in-memory tables.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
// Which domains had their path aliases looked up (back-halves never should).
const aliasChecks = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/path-alias-store", async (importOriginal) => {
  const store = await importOriginal<typeof import("@/lib/path-alias-store")>();
  return {
    ...store,
    domainHasAliases: (domainId: string) => {
      aliasChecks.push(domainId);
      return store.domainHasAliases(domainId);
    },
  };
});

const { routeCustomDomain } = await import(
  "@/app/(app)/dashboard/domains/_lib/host-routing"
);

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.seed("customDomain", [
    { id: "dom_brand", hostname: "go.brand.com", verified: true },
  ]);
});

const get = (path: string, host = "go.brand.com") =>
  routeCustomDomain(
    new NextRequest(new URL(path, `https://${host}`), { headers: { host } }),
  );

/** Where a rewrite sends the request (Next's middleware header). */
const rewrittenTo = (response: Response | null) => {
  const target = response?.headers.get("x-middleware-rewrite");
  return target ? new URL(target).pathname : null;
};

describe("a verified custom domain", () => {
  it("sends generated slugs and custom back-halves to the short link", async () => {
    for (const slug of [
      "Ab3xK9q",
      "spring-menu",
      "Spring_Menu",
      "pricing",
      "abc",
    ]) {
      const response = await get(`/${slug}`);
      expect(rewrittenTo(response), slug).toBe(`/q/${slug}`);
      expect(
        response?.headers.get("x-middleware-request-x-qrdx-custom-domain"),
      ).toBe("dom_brand");
    }
  });

  it("sends /p/<slug> to the hosted page", async () => {
    expect(rewrittenTo(await get("/p/spring-menu"))).toBe("/p/spring-menu");
  });

  it("sends GS1 Digital Links to the product page lookup", async () => {
    for (const path of [
      "/01/09506000134352",
      "/01/09506000134352/10/LOT42/21/0007",
    ]) {
      const response = await get(path);
      expect(rewrittenTo(response), path).toBe(`/gs1${path}`);
      expect(
        response?.headers.get("x-middleware-request-x-qrdx-custom-domain"),
      ).toBe("dom_brand");
    }
  });

  it("lets the hosted pages' APIs through untouched", async () => {
    const response = await get("/api/events");
    expect(response?.headers.get("x-middleware-next")).toBe("1");
    expect(rewrittenTo(response)).toBeNull();
  });

  // Agency tools: client-branded stats pages assigned to this domain
  // (lib/public-stats.ts answers only for those).
  it("lets shared stats pages and their preview image through, tagged", async () => {
    const token = "A".repeat(16) + "b_-9".repeat(4);
    for (const path of [`/stats/${token}`, `/stats/${token}/og`]) {
      const response = await get(path);
      expect(response?.headers.get("x-middleware-next"), path).toBe("1");
      expect(
        response?.headers.get("x-middleware-request-x-qrdx-custom-domain"),
      ).toBe("dom_brand");
    }
    for (const path of ["/stats/short", `/stats/${token}/raw`, "/stats"]) {
      const response = await get(path);
      expect(response?.headers.get("x-middleware-next"), path).toBeNull();
    }
  });

  it("serves nothing else of QRdx", async () => {
    for (const path of [
      "/favicon.ico",
      "/robots.txt",
      "/dashboard/codes",
      "/api/v1/codes",
      "/ab",
      "/-menu",
    ]) {
      const response = await get(path);
      expect(rewrittenTo(response), path).toBeNull();
      expect(response?.status, path).toBe(404);
    }
    expect((await get("/"))?.status).toBe(200);
  });
});

// Path aliases (lib/path-aliases.ts): another provider's paths kept on the
// domain go to app/path-alias, on domains that have any; everything QRdx
// serves there comes first.
describe("path aliases on a verified custom domain", () => {
  beforeEach(() => {
    aliasChecks.length = 0;
    fakeDb.seed("customDomain", [
      { id: "dom_switch", hostname: "qr.switch.com", verified: true },
      { id: "dom_fast", hostname: "qr.fast.com", verified: true },
      { id: "dom_nosql", hostname: "qr.nosql.com", verified: true },
    ]);
    fakeDb.seed("qrCode", [{ id: "code_r", domainId: "dom_switch" }]);
    fakeDb.seed("linkPathAlias", [
      { id: "pa_1", domainId: "dom_switch", qrCodeId: "code_r", path: "/r/X" },
    ]);
  });

  const switched = (path: string) => get(path, "qr.switch.com");
  const target = (response: Response | null) => {
    const url = response?.headers.get("x-middleware-rewrite");
    return url ? `${new URL(url).pathname}${new URL(url).search}` : null;
  };

  it("sends other providers' paths to the alias lookup, tagged", async () => {
    for (const path of [
      "/r/X",
      "/r/fhoxePqJ_X",
      "/s/4f1c2a9e-6b7d-4e1a-9c3f-2d8e7b6a5c41/code_batch-1/0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b",
      "/a/cbey7J",
      "/l/spring-menu",
      "/object/12345",
      "/code-of-conduct/clip",
      "/p/X",
      "/ab",
    ]) {
      const response = await switched(path);
      expect(target(response), path).toBe(`/path-alias${path}`);
      expect(
        response?.headers.get("x-middleware-request-x-qrdx-custom-domain"),
      ).toBe("dom_switch");
    }
  });

  it("matches without the query string or a trailing slash, keeping ?nfc", async () => {
    expect(target(await switched("/r/X?utm_source=flyer&qr=1"))).toBe(
      "/path-alias/r/X",
    );
    expect(target(await switched("/r/X/"))).toBe("/path-alias/r/X");
    expect(target(await switched("/r/X?nfc"))).toBe("/path-alias/r/X?nfc");
  });

  it("never lets an escaped slash reach an alias or skip the hosted page", async () => {
    for (const path of ["/r%2FX", "/r%2fX", "/p%2FQNA8kOWzd", "/r%5CX"]) {
      const response = await switched(path);
      expect(rewrittenTo(response), path).toBeNull();
      expect(response?.status, path).toBe(404);
    }
  });

  it("passes ?nfc (only) to the hosted page route, for its /p/ alias fallback", async () => {
    expect(target(await switched("/p/QNA8kOWzd?nfc"))).toBe("/p/QNA8kOWzd?nfc");
    expect(target(await switched("/p/QNA8kOWzd?utm_source=flyer"))).toBe(
      "/p/QNA8kOWzd",
    );
  });

  it("puts back-halves, hosted pages and QRdx's own paths first", async () => {
    expect(rewrittenTo(await switched("/spring-menu"))).toBe("/q/spring-menu");
    // /p/<back-half> is the hosted page; its route answers /p/ aliases
    // when no page has that back-half (app/(app)/p/[slug]/page.tsx).
    expect(rewrittenTo(await switched("/p/QNA8kOWzd"))).toBe("/p/QNA8kOWzd");
    expect(rewrittenTo(await switched("/01/09506000134352"))).toBe(
      "/gs1/01/09506000134352",
    );
    for (const path of [
      "/api/v1/codes",
      "/favicon.ico",
      "/robots.txt",
      "/q/abc",
      "/.env",
      "/r//X",
    ]) {
      const response = await switched(path);
      expect(rewrittenTo(response), path).toBeNull();
      expect(response?.status, path).toBe(404);
    }
  });

  it("never looks aliases up for back-halves or hosted pages", async () => {
    await get("/spring-menu", "qr.fast.com");
    await get("/p/spring-menu", "qr.fast.com");
    await get("/robots.txt", "qr.fast.com");
    expect(aliasChecks).toEqual([]);
    // A domain without aliases: the old 404, after one (cached) check.
    const response = await get("/r/abc", "qr.fast.com");
    expect(rewrittenTo(response)).toBeNull();
    expect(response?.status).toBe(404);
    await get("/r/def", "qr.fast.com");
    expect(aliasChecks).toEqual(["dom_fast"]);
  });

  it("answers as before when link_path_alias doesn't exist yet", async () => {
    fakeDb.missing("linkPathAlias");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await get("/r/X", "qr.nosql.com");
    expect(rewrittenTo(response)).toBeNull();
    expect(response?.status).toBe(404);
    expect(await response?.text()).toContain("QR code not found");
    expect(rewrittenTo(await get("/spring-menu", "qr.nosql.com"))).toBe(
      "/q/spring-menu",
    );
    warn.mockRestore();
  });
});

describe("QRdx's own hosts", () => {
  it("are left to the app", async () => {
    expect(await get("/spring-menu", "localhost:3000")).toBeNull();
  });
});
