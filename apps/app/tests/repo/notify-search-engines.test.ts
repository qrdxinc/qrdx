// scripts/notify-search-engines.mjs, which tells IndexNow, Bing and Google
// about changed pages after a deploy, and works through the Bing backlog
// daily (.github/workflows/notify-search-engines.yml). Only the pure parts
// run here; nothing is sent anywhere.
import { createVerify, generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BING_BACKLOG_STEP,
  changedUrls,
  googleAssertion,
  IMPORTANT_PATHS,
  INDEXNOW_KEY,
  inSitemap,
  main,
  mergeEntries,
  normalizeUrl,
  onSite,
  parseRobotsSitemaps,
  parseServiceAccount,
  parseSitemap,
  parseSitemapIndex,
  pickBingSite,
  rotate,
  statusSummary,
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

  it("makes a snapshot of the main sitemap alone show the other sitemaps' pages as new", () => {
    // The first deploy after this change compares against a snapshot taken
    // before it: the marketing site's pages are then sent once.
    const main = parseSitemap(SITEMAP);
    const site = [{ url: "https://qrdx.dev/qr-codes-for/restaurants" }];
    const { entries } = mergeEntries([main, site]);
    expect(changedUrls(main, entries)).toEqual([
      "https://qrdx.dev/qr-codes-for/restaurants",
    ]);
  });
});

describe("statusSummary", () => {
  it("says one status once, and counts each when they differ", () => {
    expect(statusSummary([200, 200, 200])).toBe("HTTP 200");
    expect(statusSummary([200, 500, 200])).toBe("HTTP 200 ×2, HTTP 500 ×1");
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
    // hashFiles can see it).
    expect(workflow).toContain("uses: actions/cache/restore@v4");
    expect(workflow).toContain("uses: actions/cache/save@v4");
    expect(workflow.match(/path: \.sitemap-sweep\.xml/g)).toHaveLength(2);
    expect(schedule).toContain('sweep=".sitemap-sweep.xml"');
    expect(workflow).toContain("restore-keys: sitemap-sweep-");
  });
});
