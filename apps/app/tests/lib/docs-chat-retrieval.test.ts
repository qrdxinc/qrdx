// How the docs assistant and the MCP docs tools read the docs
// (lib/docs-chat/retrieval.ts): through the docs site's search route and
// .md pages, behind a fake fetch. The docs are English only: nothing asks
// for a language, and a path kept from the translated docs (/es/docs/a)
// names the English page. Hidden pages never come back, pages are cut at the
// cap, and repeat reads come from the cache.
import { describe, expect, it, vi } from "vitest";
import { DOCS_CHAT } from "@/lib/docs-chat/config";
import {
  createDocsRetriever,
  DocsRetrievalError,
  groupSearchResults,
  normalizeDocsPath,
  parseMarkdownPage,
} from "@/lib/docs-chat/retrieval";

const DOCS = "https://docs.example.test";
const PUBLIC = "https://qrdx.example.test";

type Row = {
  id: string;
  url: string;
  type: "page" | "heading" | "text";
  content: string;
};

const page = (url: string, title: string): Row => ({
  id: url,
  url,
  type: "page",
  content: title,
});
const heading = (url: string, text: string): Row => ({
  id: `${url}#h`,
  url: `${url}#heading`,
  type: "heading",
  content: text,
});
const passage = (url: string, text: string): Row => ({
  id: `${url}#t`,
  url: `${url}#heading`,
  type: "text",
  content: text,
});

/** A fake docs site: search answers by query, pages by path. */
function fakeDocs(
  searches: Record<string, Row[]>,
  pages: Record<string, string>,
) {
  const calls: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}${url.search}`);
    if (url.origin !== DOCS) {
      throw new Error(`Unexpected origin in a test: ${url.origin}`);
    }
    if (url.pathname === "/api/search") {
      const query = url.searchParams.get("query") ?? "";
      return Response.json(searches[query] ?? []);
    }
    const text = pages[url.pathname];
    if (text === undefined) return new Response("not found", { status: 404 });
    return new Response(text, {
      headers: { "content-type": "text/markdown; charset=utf-8" },
    });
  });
  return { fetch: fetcher as unknown as typeof fetch, calls };
}

const MCP_PAGE = `# MCP server (Developers)

URL: ${PUBLIC}/docs/developers/mcp
Source: https://github.com/qrdxinc/qrdx/blob/main/apps/docs/content/docs/developers/mcp.mdx

Connect QRdx to any MCP client.

## Connect

Add the server URL.
`;

describe("normalizeDocsPath", () => {
  it("accepts docs paths, with or without .md", () => {
    expect(normalizeDocsPath("/docs/developers/mcp")).toBe(
      "/docs/developers/mcp",
    );
    expect(normalizeDocsPath("docs/developers/mcp.md")).toBe(
      "/docs/developers/mcp",
    );
    expect(normalizeDocsPath("/docs/help/contact.mdx#top")).toBe(
      "/docs/help/contact",
    );
    expect(normalizeDocsPath("/docs?x=1")).toBe("/docs");
    expect(normalizeDocsPath("/docs/index")).toBe("/docs");
  });

  it("reads a path from the translated docs as the English page", () => {
    expect(normalizeDocsPath("/es/docs/help/contact.mdx#top")).toBe(
      "/docs/help/contact",
    );
    expect(normalizeDocsPath("/pt-br/docs?x=1")).toBe("/docs");
    expect(normalizeDocsPath("/zh-hans/docs/angular.md")).toBe("/docs/angular");
  });

  it("accepts URLs on the docs' origins only", () => {
    expect(
      normalizeDocsPath(`${PUBLIC}/docs/developers/mcp`, [PUBLIC, DOCS]),
    ).toBe("/docs/developers/mcp");
    expect(
      normalizeDocsPath(`${DOCS}/ja/docs/getting-started`, [PUBLIC, DOCS]),
    ).toBe("/docs/getting-started");
    expect(normalizeDocsPath("https://evil.example/docs/x", [PUBLIC])).toBe(
      null,
    );
    expect(normalizeDocsPath(`${PUBLIC}/docs/x`)).toBe(null);
  });

  it("rejects anything outside the docs or with odd characters", () => {
    for (const bad of [
      "",
      "/pricing",
      "/docs/../api",
      "/docs/%2e%2e/x",
      "/fr-ca/docs/a",
      "/docs/A/B",
      "/docs/a b",
      "/zz/docs/a",
      "/docs//a",
      "/api/search",
    ]) {
      expect(normalizeDocsPath(bad), bad).toBe(null);
    }
  });
});

describe("groupSearchResults", () => {
  it("groups rows by page in rank order, with the first snippet, up to the limit", () => {
    const hits = groupSearchResults(
      [
        page("/docs/developers/mcp", "MCP server"),
        heading("/docs/developers/mcp", "Connect"),
        passage("/docs/developers/mcp", "Add the server URL."),
        page("/docs/developers/cli", "CLI"),
        passage("/docs/developers/rest-api", "The REST API."),
        page("/docs/developers/rest-api", "REST API"),
      ],
      { publicOrigin: PUBLIC, limit: 2, isPathAvailable: () => true },
    );
    expect(hits).toEqual([
      {
        title: "MCP server",
        path: "/docs/developers/mcp",
        url: `${PUBLIC}/docs/developers/mcp`,
        snippet: "Connect",
        section: "Developers",
      },
      {
        title: "CLI",
        path: "/docs/developers/cli",
        url: `${PUBLIC}/docs/developers/cli`,
        snippet: "",
        section: "Developers",
      },
    ]);
  });

  it("leaves out pages this deployment hides and rows that aren't docs", () => {
    const hits = groupSearchResults(
      [
        page("/docs/help/teams/single-sign-on", "Single sign-on"),
        page("/pricing", "Pricing"),
        page("/docs/help/contact", "Contact"),
      ],
      {
        publicOrigin: PUBLIC,
        limit: 8,
        isPathAvailable: (path) => path !== "/docs/help/teams/single-sign-on",
      },
    );
    expect(hits.map((hit) => hit.path)).toEqual(["/docs/help/contact"]);
  });

  it("lists a row at a translated docs URL as the English page", () => {
    // What an old docs deployment's index could still hold.
    const seen: string[] = [];
    const hits = groupSearchResults(
      [page("/es/docs/help/contact", "Contacto")],
      {
        publicOrigin: PUBLIC,
        limit: 8,
        isPathAvailable: (path) => {
          seen.push(path);
          return true;
        },
      },
    );
    expect(hits[0]).toMatchObject({
      path: "/docs/help/contact",
      url: `${PUBLIC}/docs/help/contact`,
      section: "Help",
    });
    expect(seen).toEqual(["/docs/help/contact"]);
  });

  it("cuts long snippets", () => {
    const long = "word ".repeat(100);
    const [hit] = groupSearchResults(
      [page("/docs/a", "A"), passage("/docs/a", long)],
      { publicOrigin: PUBLIC, limit: 8, isPathAvailable: () => true },
    );
    expect(hit?.snippet.length).toBeLessThanOrEqual(DOCS_CHAT.snippetChars);
    expect(hit?.snippet.endsWith("…")).toBe(true);
  });
});

describe("parseMarkdownPage", () => {
  it("takes the title without its section and drops the header lines", () => {
    expect(parseMarkdownPage(MCP_PAGE)).toEqual({
      title: "MCP server",
      body: "Connect QRdx to any MCP client.\n\n## Connect\n\nAdd the server URL.",
    });
  });

  it("copes with a page without a header", () => {
    expect(parseMarkdownPage("Just text.")).toEqual({
      title: "",
      body: "Just text.",
    });
  });
});

describe("createDocsRetriever", () => {
  it("searches the docs site, with no language, and shapes the hits", async () => {
    const docs = fakeDocs(
      {
        mcp: [
          page("/docs/developers/mcp", "MCP server"),
          passage("/docs/developers/mcp", "Connect QRdx."),
        ],
      },
      {},
    );
    const retriever = createDocsRetriever({
      docsOrigin: `${DOCS}/`,
      publicOrigin: PUBLIC,
      fetch: docs.fetch,
    });
    const result = await retriever.search("mcp");
    expect(result).toEqual({
      hits: [
        {
          title: "MCP server",
          path: "/docs/developers/mcp",
          url: `${PUBLIC}/docs/developers/mcp`,
          snippet: "Connect QRdx.",
          section: "Developers",
        },
      ],
    });
    expect(docs.calls).toEqual(["/api/search?query=mcp"]);
  });

  it("caches a search, and one that found nothing isn't asked again", async () => {
    const docs = fakeDocs(
      { webhooks: [page("/docs/webhooks", "Webhooks")] },
      {},
    );
    const retriever = createDocsRetriever({
      docsOrigin: DOCS,
      publicOrigin: PUBLIC,
      fetch: docs.fetch,
    });
    const first = await retriever.search("webhooks");
    expect(first.hits.map((hit) => hit.path)).toEqual(["/docs/webhooks"]);
    expect(await retriever.search("  Webhooks ")).toEqual(first);
    expect(await retriever.search("ウェブフック")).toEqual({ hits: [] });
    expect(await retriever.search("ウェブフック")).toEqual({ hits: [] });
    expect(docs.calls).toEqual([
      "/api/search?query=webhooks",
      `/api/search?query=${encodeURIComponent("ウェブフック")}`,
    ]);
  });

  it("caps the query and the number of hits", async () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      page(`/docs/page-${i}`, `Page ${i}`),
    );
    const longQuery = "a".repeat(DOCS_CHAT.maxQueryChars + 50);
    const docs = fakeDocs({ ["a".repeat(DOCS_CHAT.maxQueryChars)]: rows }, {});
    const retriever = createDocsRetriever({
      docsOrigin: DOCS,
      publicOrigin: PUBLIC,
      fetch: docs.fetch,
    });
    const result = await retriever.search(longQuery, 50);
    expect(result.hits).toHaveLength(DOCS_CHAT.searchLimit);
  });

  it("returns nothing for an empty query without calling the docs", async () => {
    const docs = fakeDocs({}, {});
    const retriever = createDocsRetriever({
      docsOrigin: DOCS,
      publicOrigin: PUBLIC,
      fetch: docs.fetch,
    });
    expect(await retriever.search("   ")).toEqual({ hits: [] });
    expect(docs.calls).toEqual([]);
  });

  it("reads a page's Markdown, keeps its title and URL, and caches it", async () => {
    const docs = fakeDocs({}, { "/docs/developers/mcp.md": MCP_PAGE });
    const retriever = createDocsRetriever({
      docsOrigin: DOCS,
      publicOrigin: PUBLIC,
      fetch: docs.fetch,
    });
    const page = await retriever.readPage("/docs/developers/mcp");
    expect(page).toEqual({
      title: "MCP server",
      path: "/docs/developers/mcp",
      url: `${PUBLIC}/docs/developers/mcp`,
      markdown:
        "Connect QRdx to any MCP client.\n\n## Connect\n\nAdd the server URL.",
      truncated: false,
    });
    await retriever.readPage(`${PUBLIC}/docs/developers/mcp.md`);
    expect(docs.calls).toEqual(["/docs/developers/mcp.md"]);
  });

  it("reads the English page for a path from the translated docs", async () => {
    const docs = fakeDocs(
      {},
      { "/docs/help/contact.md": "# Contact (Help)\n\nWrite to us." },
    );
    const retriever = createDocsRetriever({
      docsOrigin: DOCS,
      publicOrigin: PUBLIC,
      fetch: docs.fetch,
    });
    const page = await retriever.readPage("/es/docs/help/contact");
    expect(page).toMatchObject({
      title: "Contact",
      path: "/docs/help/contact",
      url: `${PUBLIC}/docs/help/contact`,
      markdown: "Write to us.",
    });
    // One request, for the English page; the same cache entry either way.
    await retriever.readPage(`${PUBLIC}/pt-br/docs/help/contact.md`);
    await retriever.readPage("/docs/help/contact");
    expect(docs.calls).toEqual(["/docs/help/contact.md"]);
  });

  it("cuts a long page at the cap and says where the rest is", async () => {
    const body = "x".repeat(DOCS_CHAT.maxPageChars + 500);
    const docs = fakeDocs({}, { "/docs/long.md": `# Long\n\n${body}` });
    const retriever = createDocsRetriever({
      docsOrigin: DOCS,
      publicOrigin: PUBLIC,
      fetch: docs.fetch,
    });
    const page = await retriever.readPage("/docs/long");
    expect(page.truncated).toBe(true);
    expect(page.markdown.length).toBeLessThan(DOCS_CHAT.maxPageChars + 200);
    expect(page.markdown).toContain(`${PUBLIC}/docs/long`);
  });

  it("refuses paths outside the docs, hidden pages and missing pages", async () => {
    const docs = fakeDocs({}, {});
    const retriever = createDocsRetriever({
      docsOrigin: DOCS,
      publicOrigin: PUBLIC,
      fetch: docs.fetch,
      isPathAvailable: (path) => path !== "/docs/slack-bot",
    });
    await expect(retriever.readPage("/pricing")).rejects.toMatchObject({
      code: "invalid_path",
    });
    await expect(
      retriever.readPage("https://evil.example/docs/a"),
    ).rejects.toMatchObject({ code: "invalid_path" });
    await expect(retriever.readPage("/docs/slack-bot")).rejects.toMatchObject({
      code: "unavailable",
    });
    await expect(retriever.readPage("/docs/nope")).rejects.toMatchObject({
      code: "not_found",
    });
    // Nothing was fetched for the refused paths; the missing one was tried once.
    expect(docs.calls).toEqual(["/docs/nope.md"]);
    // A miss is cached too.
    await expect(retriever.readPage("/docs/nope")).rejects.toBeInstanceOf(
      DocsRetrievalError,
    );
    expect(docs.calls).toEqual(["/docs/nope.md"]);
  });

  it("reports a docs site that doesn't answer", async () => {
    const fetcher = vi.fn(async () => {
      throw new DOMException("timeout", "TimeoutError");
    });
    const retriever = createDocsRetriever({
      docsOrigin: DOCS,
      publicOrigin: PUBLIC,
      fetch: fetcher as unknown as typeof fetch,
    });
    await expect(retriever.search("mcp")).rejects.toMatchObject({
      code: "fetch_failed",
    });
    await expect(retriever.readPage("/docs/a")).rejects.toMatchObject({
      code: "fetch_failed",
    });
  });

  it("forgets cached pages after the TTL", async () => {
    let now = 1_000_000;
    const docs = fakeDocs({}, { "/docs/a.md": "# A\n\nText." });
    const retriever = createDocsRetriever({
      docsOrigin: DOCS,
      publicOrigin: PUBLIC,
      fetch: docs.fetch,
      now: () => now,
      cacheTtlMs: 1000,
    });
    await retriever.readPage("/docs/a");
    now += 500;
    await retriever.readPage("/docs/a");
    expect(docs.calls).toHaveLength(1);
    now += 600;
    await retriever.readPage("/docs/a");
    expect(docs.calls).toHaveLength(2);
  });
});
