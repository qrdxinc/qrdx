// scripts/notify-search-engines.mjs, which tells IndexNow, Bing and Google
// about changed pages after a deploy, and works through the Bing backlog
// daily (.github/workflows/notify-search-engines.yml). Only the pure parts
// run here; nothing is sent anywhere.
import { createVerify, generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LOCALE_INFO, TRANSLATED_LOCALES } from "@repo/i18n/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TYPE_SEGMENTS } from "@/lib/community/types";
import { QR_TYPE_SLUGS } from "@/lib/qr-types-content";
import { HOSTED_TYPE_SLUGS } from "@/lib/qr-types-content-hosted";
import {
  BING_BACKLOG_STEP,
  backlogUrls,
  bingUrls,
  changedUrls,
  checkSitemapSamples,
  forBing,
  googleAssertion,
  IMPORTANT_PATHS,
  INDEXNOW_KEY,
  inSitemap,
  listSitemaps,
  loadSitemaps,
  main,
  mergeEntries,
  normalizeUrl,
  onSite,
  PRIORITY_RESEND_DAYS,
  pageStatus,
  parseRobotsSitemaps,
  parseServiceAccount,
  parseSitemap,
  parseSitemapIndex,
  pickBingSite,
  priorityUrls,
  resendDay,
  rotate,
  SITEMAP_SAMPLE_SIZE,
  SITEMAP_URL,
  sampleUrls,
  sendBing,
  sitemapKind,
  statusSummary,
  submitSitemaps,
  TOP_GENERATORS,
  TRANSLATED_SEGMENTS,
  toUrlset,
  utcDay,
} from "../../../../scripts/notify-search-engines.mjs";

const APP = join(import.meta.dirname, "../..");
const REPO = join(APP, "../..");

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<url>
<loc>https://qrdx.dev</loc>
<xhtml:link rel="alternate" hreflang="en" href="https://qrdx.dev" />
<changefreq>monthly</changefreq>
</url>
<url>
<loc>https://qrdx.dev/pricing</loc>
<lastmod>2026-11-10T10:00:00.000Z</lastmod>
</url>
<url>
<loc>https://qrdx.dev/docs/a?x=1&amp;y=2</loc>
<lastmod>2026-11-01T00:00:00.000Z</lastmod>
</url>
</urlset>`;

describe("IndexNow key", () => {
  it("is served from public/<key>.txt with the same key", () => {
    expect(INDEXNOW_KEY).toMatch(/^[0-9a-f]{32}$/);
    const file = join(APP, "public", `${INDEXNOW_KEY}.txt`);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8").trim()).toBe(INDEXNOW_KEY);
  });

  it("has no Bing verification file or tag next to it", () => {
    // The owner verifies Bing by DNS.
    expect(existsSync(join(APP, "public", "BingSiteAuth.xml"))).toBe(false);
    const layouts = ["lib/root-metadata.ts", "lib/metadata.ts"].map((file) =>
      readFileSync(join(APP, file), "utf8"),
    );
    for (const text of layouts) expect(text).not.toContain("msvalidate");
  });
});

describe("parseSitemap", () => {
  it("reads each URL and its lastmod, decoding entities", () => {
    expect(parseSitemap(SITEMAP)).toEqual([
      { url: "https://qrdx.dev", lastmod: undefined },
      { url: "https://qrdx.dev/pricing", lastmod: "2026-11-10T10:00:00.000Z" },
      {
        url: "https://qrdx.dev/docs/a?x=1&y=2",
        lastmod: "2026-11-01T00:00:00.000Z",
      },
    ]);
  });
});

describe("parseRobotsSitemaps", () => {
  it("reads every Sitemap line on this site, once, in order", () => {
    const robots = [
      "User-Agent: *",
      "Allow: /",
      "Disallow: /api/",
      "",
      "Sitemap: https://qrdx.dev/sitemap.xml",
      "sitemap:https://qrdx.dev/blog/sitemap.xml\r",
      "  SITEMAP :  https://qrdx.dev/qr-code-generator/sitemap.xml  ",
      "Sitemap: https://qrdx.dev/sitemap.xml",
      "Sitemap: https://example.com/sitemap.xml",
      "Sitemap: not a url",
      "# Sitemap: https://qrdx.dev/commented.xml",
    ].join("\n");
    expect(parseRobotsSitemaps(robots)).toEqual([
      "https://qrdx.dev/sitemap.xml",
      "https://qrdx.dev/blog/sitemap.xml",
      "https://qrdx.dev/qr-code-generator/sitemap.xml",
    ]);
    expect(parseRobotsSitemaps("User-Agent: *\nAllow: /")).toEqual([]);
  });
});

describe("parseSitemapIndex", () => {
  it("lists an index's sitemaps, and nothing for an ordinary sitemap", () => {
    const index = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>https://qrdx.dev/a.xml</loc><lastmod>2026-11-19</lastmod></sitemap>
<sitemap>
  <loc> https://qrdx.dev/b.xml?x=1&amp;y=2 </loc>
</sitemap>
</sitemapindex>`;
    expect(parseSitemapIndex(index)).toEqual([
      "https://qrdx.dev/a.xml",
      "https://qrdx.dev/b.xml?x=1&y=2",
    ]);
    expect(parseSitemapIndex(SITEMAP)).toEqual([]);
  });
});

describe("mergeEntries", () => {
  it("joins sitemaps into one list of this site's pages, each once", () => {
    const main = parseSitemap(SITEMAP);
    const site = [
      {
        url: "https://qrdx.dev/qr-code-generator/pdf",
        lastmod: "2026-11-17T00:00:00.000Z",
      },
      // Also in the main sitemap: the first one listed wins.
      { url: "https://qrdx.dev/pricing/", lastmod: "2026-11-19T00:00:00.000Z" },
      { url: "https://elsewhere.example/page", lastmod: undefined },
    ];
    const { entries, skipped } = mergeEntries([main, site]);
    expect(entries.map((entry) => entry.url)).toEqual([
      "https://qrdx.dev",
      "https://qrdx.dev/pricing",
      "https://qrdx.dev/docs/a?x=1&y=2",
      "https://qrdx.dev/qr-code-generator/pdf",
    ]);
    expect(entries[1]?.lastmod).toBe("2026-11-10T10:00:00.000Z");
    expect(skipped).toBe(1);
  });

  it("keeps only URLs on qrdx.dev", () => {
    expect(onSite("https://qrdx.dev/x")).toBe(true);
    expect(onSite("http://qrdx.dev/x")).toBe(false);
    expect(onSite("https://api.qrdx.dev/v1")).toBe(false);
    expect(onSite("::")).toBe(false);
  });
});

describe("toUrlset (the --snapshot file)", () => {
  it("reads back exactly as it was written, entities and missing lastmods included", () => {
    const entries = [
      ...parseSitemap(SITEMAP),
      {
        url: "https://qrdx.dev/q?a=<b>&c='d'\"",
        lastmod: "2026-11-19T00:00:00.000Z",
      },
    ];
    const xml = toUrlset(entries);
    expect(xml).toContain("&amp;y=2");
    expect(parseSitemap(xml)).toEqual(entries);
    expect(changedUrls(entries, parseSitemap(xml))).toEqual([]);
  });

  it("still reads a snapshot in the old one-sitemap form, other sitemaps' pages showing as new", () => {
    // Only a file saved by hand before this change looks like this: the
    // deploy job's own snapshot runs the new script, so it already has every
    // sitemap. The marketing site's pages go out first through the daily
    // sweep, whose first run has no snapshot and sends everything
    // ("falls back to every URL" below).
    const main = parseSitemap(SITEMAP);
    const site = [{ url: "https://qrdx.dev/qr-codes-for/restaurants" }];
    const { entries } = mergeEntries([main, site]);
    expect(changedUrls(main, entries)).toEqual([
      "https://qrdx.dev/qr-codes-for/restaurants",
    ]);
  });
});

describe("statusSummary", () => {
  it("says one outcome once, and counts each when they differ", () => {
    expect(statusSummary(["HTTP 200", "HTTP 200", "HTTP 200"])).toBe(
      "HTTP 200",
    );
    expect(statusSummary(["HTTP 200", "timed out", "HTTP 200"])).toBe(
      "HTTP 200 ×2, timed out ×1",
    );
  });
});

describe("sitemapKind", () => {
  it("tells a sitemap of pages from an index, and from anything else", () => {
    expect(sitemapKind(SITEMAP)).toBe("urlset");
    expect(
      sitemapKind(
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>',
      ),
    ).toBe("index");
    expect(sitemapKind("<!doctype html><html><body>Error</body></html>")).toBe(
      undefined,
    );
    expect(sitemapKind("")).toBe(undefined);
  });
});

describe("changedUrls", () => {
  const before = parseSitemap(SITEMAP);

  it("finds new URLs and new lastmods, and nothing else", () => {
    const after = [
      ...before.slice(0, 1),
      { url: "https://qrdx.dev/pricing", lastmod: "2026-11-13T09:00:00.000Z" },
      before[2],
      { url: "https://qrdx.dev/qr-code-api", lastmod: undefined },
    ];
    expect(changedUrls(before, after)).toEqual([
      "https://qrdx.dev/pricing",
      "https://qrdx.dev/qr-code-api",
    ]);
    expect(changedUrls(before, before)).toEqual([]);
  });
});

describe("inSitemap", () => {
  const live = parseSitemap(SITEMAP).map((entry) => entry.url);

  it("keeps paths and URLs in the sitemap, as the sitemap writes them", () => {
    const { kept, dropped } = inSitemap(
      ["/", "/pricing/", "https://qrdx.dev/pricing", "/nope", "", "::"],
      live,
    );
    expect(kept).toEqual(["https://qrdx.dev", "https://qrdx.dev/pricing"]);
    expect(dropped).toEqual(["/nope", "::"]);
  });

  it("leaves out important pages that don't exist yet", () => {
    expect(inSitemap(IMPORTANT_PATHS, live).kept).toEqual([
      "https://qrdx.dev",
      "https://qrdx.dev/pricing",
    ]);
  });
});

describe("normalizeUrl", () => {
  it("compares URLs with or without a trailing slash", () => {
    expect(normalizeUrl("https://qrdx.dev")).toBe("https://qrdx.dev/");
    expect(normalizeUrl("https://qrdx.dev/a/")).toBe("https://qrdx.dev/a");
  });
});

describe("pickBingSite", () => {
  it("uses the verified site's URL exactly as Bing has it", () => {
    expect(
      pickBingSite([
        { Url: "https://example.com/", IsVerified: true },
        { Url: "http://qrdx.dev/", IsVerified: true },
        { Url: "https://qrdx.dev/", IsVerified: true },
      ]),
    ).toBe("https://qrdx.dev/");
  });

  it("finds nothing for an unverified or missing site", () => {
    expect(
      pickBingSite([{ Url: "https://qrdx.dev/", IsVerified: false }]),
    ).toBeUndefined();
    expect(pickBingSite([])).toBeUndefined();
    expect(pickBingSite(undefined)).toBeUndefined();
  });
});

describe("rotate (the daily Bing backlog)", () => {
  const urls = Array.from({ length: 368 }, (_, i) => `https://qrdx.dev/p${i}`);

  it("covers every URL in consecutive daily slices", () => {
    const sent = new Set<string>();
    const days = Math.ceil(urls.length / BING_BACKLOG_STEP);
    for (let day = 20_405; day < 20_405 + days; day += 1) {
      for (const url of rotate(urls, day).slice(0, BING_BACKLOG_STEP)) {
        sent.add(url);
      }
    }
    expect(sent.size).toBe(urls.length);
  });

  it("keeps every URL once, wrapping around", () => {
    const rotated = rotate(["a", "b", "c"], 1, 2);
    expect(rotated).toEqual(["c", "a", "b"]);
    expect(rotate([], 5)).toEqual([]);
  });

  it("counts days in UTC", () => {
    expect(utcDay(Date.UTC(2026, 10, 13, 23, 59))).toBe(
      utcDay(Date.UTC(2026, 10, 13, 0, 0)),
    );
    expect(utcDay(Date.UTC(2026, 10, 14))).toBe(
      utcDay(Date.UTC(2026, 10, 13)) + 1,
    );
  });
});

// What Bing's URL API gets, about 100 URLs a day: the priority pages first
// (each once a week in the backlog), never translations or community items.
const abs = (path: string) => `https://qrdx.dev${path}`;
const POSTS = ["/blog/qr-code-scan-study", "/blog/do-qr-codes-expire"];
const COMPARISONS = ["/compare/qr-tiger", "/compare/uniqode"];
const SKIPPED = [
  "/es/qr-code-generator/wifi",
  "/pt-br/barcode-generator",
  "/zh-hans/playground",
  "/community/frames/library-ebooks",
  "/community/themes/sunset",
  "/community/templates/menu",
  "/community/collections/autumn",
  "/community/kits/cafe",
  "/community/@qrdx",
];
const OTHERS = Array.from(
  { length: 400 },
  (_, i) => `/qr-codes-for/topic-${i}`,
);
/** A sitemap in the order the live one has: priority pages mixed in. */
const LIVE = [
  ...OTHERS.slice(0, 100),
  ...POSTS,
  "/blog/category/education",
  "/blog/authors/ritesh-bucha",
  ...[...IMPORTANT_PATHS].reverse(),
  ...SKIPPED,
  ...OTHERS.slice(100),
  ...COMPARISONS,
].map(abs);

describe("forBing", () => {
  it("leaves out every translated language's pages", () => {
    // The segments are copied from @repo/i18n (the workflow runs the script
    // on its own, without the package).
    expect([...TRANSLATED_SEGMENTS].sort()).toEqual(
      TRANSLATED_LOCALES.map((locale) => LOCALE_INFO[locale].segment).sort(),
    );
    for (const segment of TRANSLATED_SEGMENTS) {
      expect(forBing(abs(`/${segment}`)), segment).toBe(false);
      expect(forBing(abs(`/${segment}/qr-code-generator/wifi`))).toBe(false);
    }
  });

  it("leaves out community items and profiles, but not the galleries", () => {
    for (const segment of Object.values(TYPE_SEGMENTS)) {
      expect(forBing(abs(`/community/${segment}/some-item`)), segment).toBe(
        false,
      );
      expect(forBing(abs(`/community/${segment}`)), segment).toBe(true);
    }
    expect(forBing(abs("/community/@ana"))).toBe(false);
    expect(forBing(abs("/community"))).toBe(true);
    expect(forBing(abs("/community/all"))).toBe(true);
    expect(forBing(abs("/community/made-with-qrdx"))).toBe(true);
  });

  it("keeps the English pages", () => {
    for (const path of ["/", "/pricing", "/qr-code-generator/wifi", "/esim"]) {
      expect(forBing(abs(path)), path).toBe(true);
    }
  });
});

describe("priority pages", () => {
  it("name about 80 answer pages, each once, and real generator types", () => {
    expect(new Set(IMPORTANT_PATHS).size).toBe(IMPORTANT_PATHS.length);
    expect(TOP_GENERATORS).toHaveLength(30);
    // The marketing site's own hosted type has no copy here.
    const types = new Set<string>([
      ...QR_TYPE_SLUGS,
      ...HOSTED_TYPE_SLUGS,
      "app-download",
    ]);
    for (const type of TOP_GENERATORS) expect(types, type).toContain(type);
    for (const path of [
      "/dynamic-qr-code",
      "/qr-code-tracking",
      "/custom-domain-qr-codes",
      "/open-source-qr-code-generator",
      "/ai",
      "/ai/art",
      "/guarantee",
      "/scan",
      "/tools/bulk",
      "/tools/print-size",
      "/tools/scan-checker",
      "/qr-codes-for",
      "/qr-codes-on",
    ]) {
      expect(IMPORTANT_PATHS, path).toContain(path);
    }
  });

  it("come in IMPORTANT_PATHS's order, then every post and comparison", () => {
    const found = priorityUrls(LIVE);
    expect(found).toEqual(
      [...IMPORTANT_PATHS, ...POSTS, ...COMPARISONS].map(abs),
    );
    // Categories and authors aren't posts; a repeat counts once.
    expect(priorityUrls([abs("/blog/category/education")])).toEqual([]);
    expect(priorityUrls([abs("/pricing"), abs("/pricing/")])).toEqual([
      abs("/pricing"),
    ]);
  });
});

describe("bingUrls", () => {
  it("puts the priority pages first and drops translations and community items", () => {
    const urls = bingUrls(LIVE);
    const priority = [...IMPORTANT_PATHS, ...POSTS, ...COMPARISONS].map(abs);
    expect(urls.slice(0, priority.length)).toEqual(priority);
    expect(urls.slice(priority.length)).toEqual(
      [
        ...OTHERS.slice(0, 100),
        "/blog/category/education",
        "/blog/authors/ritesh-bucha",
        ...OTHERS.slice(100),
      ].map(abs),
    );
    for (const path of SKIPPED) expect(urls).not.toContain(abs(path));
  });
});

describe("backlogUrls (the daily Bing backlog)", () => {
  const priority = priorityUrls(LIVE);
  const week = Array.from({ length: PRIORITY_RESEND_DAYS }, (_, i) =>
    backlogUrls(LIVE, 20_412 + i),
  );

  it("sends each priority page once a week, at the front of its day", () => {
    const sent = new Map<string, number>();
    for (const day of week) {
      const head = day.filter((url: string) => priority.includes(url));
      // Today's priority pages come first, then no other priority page.
      expect(day.slice(0, head.length)).toEqual(head);
      for (const url of head) sent.set(url, (sent.get(url) ?? 0) + 1);
    }
    expect([...sent.keys()].sort()).toEqual([...priority].sort());
    expect(new Set(sent.values())).toEqual(new Set([1]));
    // About a seventh a day, never most of the quota.
    for (const day of week) {
      const count = day.filter((url: string) => priority.includes(url)).length;
      expect(count).toBeLessThan(BING_BACKLOG_STEP / 2);
    }
  });

  it("covers the rest within the week in what fits each day's quota", () => {
    const sent = new Set(
      week.flatMap((day) => day.slice(0, BING_BACKLOG_STEP)),
    );
    for (const url of bingUrls(LIVE)) expect(sent, url).toContain(url);
    for (const path of SKIPPED) expect(sent).not.toContain(abs(path));
  });

  it("gives a page the same day of the week however the list changes", () => {
    for (const url of priority) {
      const day = resendDay(url);
      expect(day).toBeGreaterThanOrEqual(0);
      expect(day).toBeLessThan(PRIORITY_RESEND_DAYS);
      expect(resendDay(`${url}/`)).toBe(day);
    }
    const withNewPost = [...LIVE, abs("/blog/a-new-post")];
    const today = (urls: string[], day: number) =>
      backlogUrls(urls, day).filter((url: string) => priority.includes(url));
    for (let day = 20_412; day < 20_412 + PRIORITY_RESEND_DAYS; day += 1) {
      expect(today(withNewPost, day)).toEqual(today(LIVE, day));
    }
  });
});

describe("sampleUrls (what --check asks for)", () => {
  const urls = Array.from({ length: 253 }, (_, i) => `https://qrdx.dev/p${i}`);

  it("spreads the sample through the sitemap, starting further in each day", () => {
    const sample = sampleUrls(urls, 10, 0);
    expect(sample).toHaveLength(10);
    expect(sample[0]).toBe(urls[0]);
    expect(sample[9]).toBe(urls[225]);
    const tomorrow = sampleUrls(urls, 10, 1);
    expect(tomorrow[0]).toBe(urls[1]);
    for (let day = 0; day < 60; day += 1) {
      const each = sampleUrls(urls, SITEMAP_SAMPLE_SIZE, day);
      expect(new Set(each).size).toBe(SITEMAP_SAMPLE_SIZE);
      for (const url of each) expect(urls).toContain(url);
    }
  });

  it("takes every URL of a short sitemap", () => {
    expect(sampleUrls(urls.slice(0, 4), 10, 7)).toEqual(urls.slice(0, 4));
    expect(sampleUrls([], 10, 7)).toEqual([]);
  });
});

describe("Google service account", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const keyFile = JSON.stringify({
    type: "service_account",
    client_email: "notify@example.iam.gserviceaccount.com",
    private_key: privateKey,
    token_uri: "https://oauth2.googleapis.com/token",
  });

  it("reads a key file and rejects anything else", () => {
    expect(parseServiceAccount(keyFile)).toEqual({
      clientEmail: "notify@example.iam.gserviceaccount.com",
      privateKey,
      tokenUri: "https://oauth2.googleapis.com/token",
    });
    expect(parseServiceAccount("not json")).toBeUndefined();
    expect(parseServiceAccount('{"client_email":"x"}')).toBeUndefined();
  });

  it("signs a JWT bearer assertion for the Search Console scope", () => {
    const account = parseServiceAccount(keyFile);
    if (!account) throw new Error("key file didn't parse");
    const now = Date.UTC(2026, 10, 13, 12);
    const [header, payload, signature] = googleAssertion(account, now).split(
      ".",
    );
    const decode = (part = "") =>
      JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(payload)).toEqual({
      iss: "notify@example.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/webmasters",
      aud: "https://oauth2.googleapis.com/token",
      iat: now / 1000,
      exp: now / 1000 + 3600,
    });
    const verified = createVerify("RSA-SHA256")
      .update(`${header}.${payload}`)
      .verify(publicKey, signature ?? "", "base64url");
    expect(verified).toBe(true);
  });
});

// The network parts, against a stubbed fetch: nothing leaves the machine.
type Answer = Response | Error;
type Route = (url: URL, body: Record<string, unknown> | undefined) => Answer;

const timeout = () =>
  new DOMException("The operation was aborted due to timeout", "TimeoutError");
const json = (data: unknown) => new Response(JSON.stringify(data));
const urlset = (...paths: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths
    .map((p) => `<url><loc>https://qrdx.dev${p}</loc></url>`)
    .join("")}</urlset>`;

/** Every URL fetched; `route` answers each (an Error is thrown). */
function stubFetch(route: Route) {
  const fetched: string[] = [];
  vi.stubGlobal(
    "fetch",
    async (input: string | URL, init?: { body?: unknown }) => {
      const url = new URL(String(input));
      fetched.push(url.toString());
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      const answer = route(url, body);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  );
  return fetched;
}

/** The script's console output, one string per line. */
function captureOutput() {
  const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  return () => spy.mock.calls.map((call) => String(call[0]));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendBing (stubbed fetch)", () => {
  const sitemaps = Array.from(
    { length: 7 },
    (_, i) => `https://qrdx.dev/s${i + 1}/sitemap.xml`,
  );
  const urls = ["https://qrdx.dev/a", "https://qrdx.dev/b"];

  /**
   * Bing's API: a verified site and a quota of 100. `answer` replies first,
   * by API method name; undefined leaves the call to these defaults.
   */
  const bing =
    (
      answer: (
        method: string,
        body: Record<string, unknown> | undefined,
      ) => Answer | undefined = () => undefined,
    ): Route =>
    (url, body) => {
      const method = url.pathname.split("/").pop() ?? "";
      const answered = answer(method, body);
      if (answered) return answered;
      if (method === "GetUserSites") {
        return json({ d: [{ Url: "https://qrdx.dev/", IsVerified: true }] });
      }
      if (method === "GetUrlSubmissionQuota") {
        return json({ d: { DailyQuota: 100, MonthlyQuota: 2800 } });
      }
      if (method === "SubmitUrlBatch" || method === "SubmitFeed") {
        return json({ d: null });
      }
      return new Error(`unexpected call to ${url.pathname}`);
    };

  it("sends the URL batch and the other six sitemaps when sitemap 3 times out", async () => {
    vi.stubEnv("BING_WEBMASTER_API_KEY", "fake-bing-key");
    const output = captureOutput();
    const batches: unknown[] = [];
    const fed: unknown[] = [];
    stubFetch(
      bing((method, body) => {
        if (method === "SubmitUrlBatch") batches.push(body?.urlList);
        if (method !== "SubmitFeed") return;
        if (body?.feedUrl === sitemaps[2]) return timeout();
        fed.push(body?.feedUrl);
        return;
      }),
    );
    const results: string[][] = [];
    await sendBing(urls, results, sitemaps);

    expect(batches).toEqual([urls]);
    expect(fed).toEqual(sitemaps.filter((_, i) => i !== 2));
    expect(results).toEqual([
      ["Bing", "2 of 2 URLs (quota 100)", "HTTP 200"],
      ["Bing", "7 sitemaps", "HTTP 200 ×6, timed out ×1"],
    ]);
    expect(
      output().some(
        (line) => line.includes(sitemaps[2] ?? "") && line.includes("timeout"),
      ),
    ).toBe(true);
    // The key never reaches the output.
    expect(output().join("\n")).not.toContain("fake-bing-key");
  });

  it("still sends every sitemap when the URL batch fails", async () => {
    vi.stubEnv("BING_WEBMASTER_API_KEY", "fake-bing-key");
    captureOutput();
    const fed: unknown[] = [];
    stubFetch(
      bing((method, body) => {
        if (method === "SubmitUrlBatch") return new TypeError("fetch failed");
        if (method === "SubmitFeed") fed.push(body?.feedUrl);
        return;
      }),
    );
    const results: string[][] = [];
    await sendBing(urls, results, sitemaps);

    expect(fed).toEqual(sitemaps);
    expect(results).toEqual([
      ["Bing", "2 URLs", "failed"],
      ["Bing", "7 sitemaps", "HTTP 200"],
    ]);
  });
});

describe("submitSitemaps", () => {
  it("records each sitemap's outcome, an error answer or a throw included", async () => {
    const output = captureOutput();
    const row = await submitSitemaps(
      "Google",
      [
        "https://qrdx.dev/a.xml",
        "https://qrdx.dev/b.xml",
        "https://qrdx.dev/c.xml",
      ],
      async (sitemap: string) => {
        if (sitemap.endsWith("b.xml")) throw new TypeError("fetch failed");
        if (sitemap.endsWith("c.xml")) {
          return { ok: false, status: 403, error: "no access" };
        }
        return { ok: true, status: 204 };
      },
    );
    expect(row).toEqual([
      "Google",
      "3 sitemaps",
      "HTTP 204 ×1, failed ×1, HTTP 403 ×1",
    ]);
    expect(output().filter((line) => line.startsWith("Warning:"))).toHaveLength(
      2,
    );
  });
});

describe("loadSitemaps (stubbed fetch)", () => {
  it("reads every sitemap robots.txt lists, skipping one that times out and one that isn't a sitemap", async () => {
    const output = captureOutput();
    const fetched = stubFetch((url) => {
      switch (url.pathname) {
        case "/robots.txt":
          return new Response(
            [
              "User-Agent: *",
              "Allow: /",
              "Sitemap: https://qrdx.dev/sitemap.xml",
              "Sitemap: https://qrdx.dev/blog/sitemap.xml",
              "Sitemap: https://qrdx.dev/slow/sitemap.xml",
              "Sitemap: https://qrdx.dev/html/sitemap.xml",
              "Sitemap: https://qrdx.dev/index.xml",
            ].join("\n"),
          );
        case "/sitemap.xml":
          return new Response(urlset("/", "/pricing"));
        case "/blog/sitemap.xml":
          return new Response(urlset("/blog", "/pricing/"));
        case "/slow/sitemap.xml":
          return timeout();
        case "/html/sitemap.xml":
          return new Response("<!doctype html><html><body>Hi</body></html>");
        case "/index.xml":
          return new Response(
            `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://qrdx.dev/child.xml</loc></sitemap><sitemap><loc>https://elsewhere.example/x.xml</loc></sitemap></sitemapindex>`,
          );
        case "/child.xml":
          return new Response(urlset("/child"));
        default:
          return new Response("Not found", { status: 404 });
      }
    });

    const { sitemaps, entries } = await loadSitemaps();
    expect(sitemaps).toEqual([
      "https://qrdx.dev/sitemap.xml",
      "https://qrdx.dev/blog/sitemap.xml",
      "https://qrdx.dev/child.xml",
    ]);
    expect(entries.map((entry: { url: string }) => entry.url)).toEqual([
      "https://qrdx.dev/",
      "https://qrdx.dev/pricing",
      "https://qrdx.dev/blog",
      "https://qrdx.dev/child",
    ]);
    const warnings = output().filter((line) => line.startsWith("Warning:"));
    expect(warnings.some((w) => w.includes("/slow/sitemap.xml"))).toBe(true);
    expect(
      warnings.some(
        (w) =>
          w.includes("/html/sitemap.xml") && w.includes("without a sitemap"),
      ),
    ).toBe(true);
    // An index's sitemap on another host is never fetched.
    expect(fetched.some((url) => url.includes("elsewhere.example"))).toBe(
      false,
    );
  });

  it("falls back to /sitemap.xml when robots.txt fails, can't be read or lists none", async () => {
    captureOutput();
    const answers: Answer[] = [
      new Response("Server error", { status: 500 }),
      new TypeError("fetch failed"),
      new Response("User-Agent: *\nAllow: /"),
    ];
    for (const answer of answers) {
      stubFetch(() => answer);
      expect(await listSitemaps()).toEqual([SITEMAP_URL]);
    }
  });

  it("throws when no sitemap can be read", async () => {
    captureOutput();
    stubFetch((url) =>
      url.pathname === "/robots.txt"
        ? new Response("Sitemap: https://qrdx.dev/sitemap.xml")
        : new Response("Unavailable", { status: 503 }),
    );
    await expect(loadSitemaps()).rejects.toThrow("no sitemap could be read");
  });
});

describe("pageStatus and checkSitemapSamples (stubbed fetch)", () => {
  /** Every request as "METHOD url", answered by `route` by path. */
  function stubPages(route: (path: string, method: string) => Answer) {
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      async (
        input: string | URL,
        init?: { method?: string; redirect?: string },
      ) => {
        const url = new URL(String(input));
        const method = init?.method ?? "GET";
        // A redirect is the answer itself, never followed.
        expect(init?.redirect).toBe("manual");
        asked.push(`${method} ${url.pathname}`);
        const answer = route(url.pathname, method);
        if (answer instanceof Error) throw answer;
        return answer;
      },
    );
    return asked;
  }

  it("asks with HEAD, and with GET only when HEAD isn't allowed", async () => {
    const asked = stubPages((path, method) => {
      if (path === "/old") {
        return new Response(null, {
          status: 307,
          headers: { location: "/new" },
        });
      }
      if (path === "/no-head" && method === "HEAD") {
        return new Response(null, { status: 405 });
      }
      return new Response(method === "HEAD" ? null : "page");
    });
    expect(await pageStatus(abs("/"))).toBe(200);
    expect(await pageStatus(abs("/old"))).toBe(307);
    expect(await pageStatus(abs("/no-head"))).toBe(200);
    expect(asked).toEqual([
      "HEAD /",
      "HEAD /old",
      "HEAD /no-head",
      "GET /no-head",
    ]);
  });

  it("finds the sampled pages that redirect, are missing or don't answer, in order", async () => {
    stubPages((path) => {
      if (path.startsWith("/de/")) {
        return new Response(null, {
          status: 307,
          headers: { location: path.slice(3) },
        });
      }
      if (path === "/gone") return new Response(null, { status: 404 });
      if (path === "/slow") return timeout();
      return new Response(null);
    });
    const { checked, failures } = await checkSitemapSamples(
      [
        {
          sitemap: abs("/sitemap.xml"),
          urls: ["/", "/pricing", "/gone", "/slow"].map(abs),
        },
        {
          sitemap: abs("/barcode-generator/sitemap.xml"),
          urls: [
            "/barcode-generator",
            "/de/barcode-generator",
            "/de/barcode-generator/ean-13",
          ].map(abs),
        },
      ],
      0,
    );
    expect(checked).toBe(7);
    expect(failures).toEqual([
      { url: abs("/gone"), answer: "HTTP 404" },
      { url: abs("/slow"), answer: "timed out" },
      { url: abs("/de/barcode-generator"), answer: "HTTP 307" },
      { url: abs("/de/barcode-generator/ean-13"), answer: "HTTP 307" },
    ]);
  });

  /** robots.txt, two sitemaps holding every important page, the key file. */
  const site =
    (page: (path: string) => Answer | undefined) =>
    (url: URL): Answer => {
      if (url.pathname === "/robots.txt") {
        return new Response(
          "Sitemap: https://qrdx.dev/sitemap.xml\nSitemap: https://qrdx.dev/barcode-generator/sitemap.xml",
        );
      }
      if (url.pathname === "/sitemap.xml") {
        return new Response(urlset(...IMPORTANT_PATHS, ...POSTS));
      }
      if (url.pathname === "/barcode-generator/sitemap.xml") {
        return new Response(
          urlset("/barcode-generator/ean-13", "/de/barcode-generator/ean-13"),
        );
      }
      if (url.pathname === `/${INDEXNOW_KEY}.txt`) {
        return new Response(INDEXNOW_KEY);
      }
      return page(url.pathname) ?? new Response(null);
    };

  it("fails --check when a sitemap lists a page that redirects", async () => {
    const output = captureOutput();
    stubFetch(
      site((path) =>
        path.startsWith("/de/")
          ? new Response(null, {
              status: 307,
              headers: { location: path.slice(3) },
            })
          : undefined,
      ),
    );
    expect(await main(["--check"])).toBe(1);
    const lines = output();
    expect(
      lines.some(
        (line) =>
          line.includes("1 didn't answer HTTP 200") &&
          line.includes("/de/barcode-generator/ean-13 (HTTP 307)"),
      ),
    ).toBe(true);
  });

  it("passes --check when every sampled page answers 200", async () => {
    const output = captureOutput();
    stubFetch(site(() => undefined));
    expect(await main(["--check"])).toBe(0);
    const lines = output();
    expect(
      lines.some((line) => line.includes("every one answered HTTP 200")),
    ).toBe(true);
    expect(
      lines.some((line) =>
        line.includes(
          `${IMPORTANT_PATHS.length + POSTS.length} priority pages (each once a week), then 1 more in turn; 1 translations and community items left to IndexNow`,
        ),
      ),
    ).toBe(true);
  });
});

describe("the first daily sweep (stubbed fetch, dry run)", () => {
  it("falls back to every URL when there's no snapshot from yesterday", async () => {
    const output = captureOutput();
    stubFetch((url) => {
      if (url.pathname === "/robots.txt") {
        return new Response(
          "Sitemap: https://qrdx.dev/sitemap.xml\nSitemap: https://qrdx.dev/qr-code-generator/sitemap.xml",
        );
      }
      if (url.pathname === "/sitemap.xml") {
        return new Response(urlset("/", "/pricing"));
      }
      if (url.pathname === "/qr-code-generator/sitemap.xml") {
        return new Response(
          urlset("/qr-code-generator", "/qr-code-generator/pdf"),
        );
      }
      return new Error(`unexpected fetch of ${url}`);
    });
    const code = await main([
      "--changed-since",
      join(REPO, "no-such-snapshot.xml"),
      "--dry-run",
    ]);
    expect(code).toBe(0);
    const lines = output();
    expect(lines).toContain("4 URLs (fallback) of 4 in 2 sitemaps.");
    expect(lines).toContain("  https://qrdx.dev/qr-code-generator/pdf");
    expect(lines).toContain("Dry run: nothing sent.");
  });
});

describe("arguments", () => {
  it("wants exactly one mode", async () => {
    expect(await main([])).toBe(2);
    expect(await main(["--all", "--check"])).toBe(2);
    expect(await main(["--backlog", "--important"])).toBe(2);
    expect(await main(["--nope"])).toBe(2);
  });
});

describe("workflow", () => {
  const workflow = readFileSync(
    join(REPO, ".github/workflows/notify-search-engines.yml"),
    "utf8",
  );

  it("never fails main, and checks the setup on pull requests", () => {
    expect(workflow).toContain("continue-on-error: true");
    expect(workflow).toContain("--check");
    expect(workflow).toContain("scripts/notify-search-engines.mjs");
  });

  it("passes the Bing key and Google account only through the environment", () => {
    expect(workflow).toMatch(
      /BING_WEBMASTER_API_KEY: \$\{\{ secrets\.BING_WEBMASTER_API_KEY \}\}/,
    );
    expect(workflow).toMatch(
      /GSC_SERVICE_ACCOUNT_JSON: \$\{\{ secrets\.GSC_SERVICE_ACCOUNT_JSON \}\}/,
    );
    expect(workflow).not.toMatch(/run:.*secrets\./);
  });

  it("works through the Bing backlog daily, before the quota resets", () => {
    expect(workflow).toMatch(/schedule:\n\s+- cron: "15 23 \* \* \*"/);
    expect(workflow).toContain("--backlog");
  });

  it("sweeps the day's sitemap changes from yesterday's cached snapshot, before the backlog", () => {
    const schedule = workflow.slice(
      workflow.indexOf('elif [ "$GITHUB_EVENT_NAME" = "schedule" ]'),
      workflow.indexOf('elif [ "$SCOPE" = "urls" ]'),
    );
    const snapshot = schedule.indexOf('--snapshot "$sweep"');
    const changed = schedule.indexOf('--changed-since "$yesterday"');
    const backlog = schedule.indexOf("--backlog");
    expect(snapshot).toBeGreaterThan(-1);
    expect(changed).toBeGreaterThan(snapshot);
    expect(backlog).toBeGreaterThan(changed);
    // The same file is restored and saved, from inside the workspace (where
    // hashFiles can see it). Actions are pinned to a commit, with the
    // version in a comment.
    expect(workflow).toMatch(
      /uses: actions\/cache\/restore@[0-9a-f]{40} # v4\.\d+\.\d+$/m,
    );
    expect(workflow).toMatch(
      /uses: actions\/cache\/save@[0-9a-f]{40} # v4\.\d+\.\d+$/m,
    );
    expect(workflow.match(/path: \.sitemap-sweep\.xml/g)).toHaveLength(2);
    expect(schedule).toContain('sweep=".sitemap-sweep.xml"');
    expect(workflow).toContain("restore-keys: sitemap-sweep-");
  });
});
