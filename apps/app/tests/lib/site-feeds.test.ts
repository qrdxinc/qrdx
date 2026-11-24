// What llms.txt reads of the marketing site's pages (lib/agents/site-feeds.ts):
// the blog's RSS feed and the comparisons' sitemap.
import { describe, expect, it } from "vitest";
import {
  comparePages,
  parseRssPosts,
  parseSitemapPaths,
} from "@/lib/agents/site-feeds";

const QRDX = new URL("https://qrdx.dev");

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>QRdx Blog</title>
    <link>https://qrdx.dev/blog</link>
    <description>QR code guides.</description>
    <item>
      <title>What stops a QR code from scanning? A test of 12,108 images</title>
      <link>https://qrdx.dev/blog/qr-code-scan-study</link>
      <description>How big a logo can be, how much contrast and margin a code needs.</description>
      <category>Education</category>
    </item>
    <item>
      <title><![CDATA[How to make a QR code with ChatGPT & Claude]]></title>
      <link>https://qrdx.dev/blog/qr-code-with-chatgpt-or-claude/</link>
      <description>Image models draw QR codes that don&apos;t hold
        your link.</description>
    </item>
    <item>
      <title>Elsewhere</title>
      <link>https://example.com/blog/x</link>
    </item>
    <item>
      <title>No link</title>
    </item>
  </channel>
</rss>`;

describe("parseRssPosts", () => {
  it("reads each post's title, path and one-line description, in the feed's order", () => {
    expect(parseRssPosts(RSS, QRDX)).toEqual([
      {
        title: "What stops a QR code from scanning? A test of 12,108 images",
        url: "/blog/qr-code-scan-study",
        description:
          "How big a logo can be, how much contrast and margin a code needs.",
      },
      {
        title: "How to make a QR code with ChatGPT & Claude",
        url: "/blog/qr-code-with-chatgpt-or-claude",
        description: "Image models draw QR codes that don't hold your link.",
      },
    ]);
  });

  it("reads nothing from a page that isn't a feed", () => {
    expect(parseRssPosts("<!doctype html><html></html>", QRDX)).toEqual([]);
    expect(parseRssPosts("", QRDX)).toEqual([]);
  });
});

describe("parseSitemapPaths and comparePages", () => {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://qrdx.dev/compare</loc></url>
<url><loc>https://qrdx.dev/compare/qr-tiger</loc><lastmod>2026-11-20</lastmod></url>
<url><loc>https://qrdx.dev/compare/new-tool</loc></url>
<url><loc>https://elsewhere.example/compare/x</loc></url>
</urlset>`;

  it("reads the site's paths on this host", () => {
    expect(parseSitemapPaths(sitemap, QRDX)).toEqual([
      "/compare",
      "/compare/qr-tiger",
      "/compare/new-tool",
    ]);
  });

  it("titles each comparison from this app's copy, and a new one by its slug", () => {
    const known = [
      {
        title: "QRdx vs QR Tiger",
        url: "/compare/qr-tiger",
        description: "Two dynamic QR code platforms compared.",
      },
      { title: "QRdx vs Gone", url: "/compare/gone" },
    ];
    expect(comparePages(parseSitemapPaths(sitemap, QRDX), known)).toEqual([
      known[0],
      { title: "QRdx vs new-tool", url: "/compare/new-tool" },
    ]);
  });
});
