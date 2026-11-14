// How the docs assistant and the MCP docs tools read the docs
// (lib/docs-chat/retrieval.ts): through the docs site's search route and
// .md pages, behind a fake fetch. Hidden pages never come back, a language
// without a match or a translation falls back to English, pages are cut at
// the cap, and repeat reads come from the cache.
import { describe, expect, it, vi } from "vitest";
import { DOCS_CHAT } from "@/lib/docs-chat/config";
import {
  createDocsRetriever,
  DocsRetrievalError,
  docsLang,
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

/** A fake docs site: search answers by locale, pages by path. */
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
      const locale = url.searchParams.get("locale") ?? "en";
      const query = url.searchParams.get("query") ?? "";
      const rows = searches[`${locale}:${query}`] ?? [];
      return Response.json(rows);
    }
    const text = pages[url.pathname];
    if (text === undefined) return new Response("not found", { status: 404 });
    const english = url.pathname.startsWith("/docs/");
    return new Response(text, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        // The docs app says which language it served (docs-md route).
        "content-language": english ? "en" : (url.pathname.split("/")[1] ?? ""),
      },
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
  it("accepts docs paths, with or without a language prefix or .md", () => {
    expect(normalizeDocsPath("/docs/developers/mcp")).toEqual({
      path: "/docs/developers/mcp",
      lang: "en",
    });
    expect(normalizeDocsPath("docs/developers/mcp.md")).toEqual({
      path: "/docs/developers/mcp",
      lang: "en",
    });
    expect(normalizeDocsPath("/es/docs/help/contact.mdx#top")).toEqual({
      path: "/docs/help/contact",
      lang: "es",
    });
    expect(normalizeDocsPath("/pt-br/docs?x=1")).toEqual({
      path: "/docs",
      lang: "pt-BR",
    });
    expect(normalizeDocsPath("/docs/index")).toEqual({
      path: "/docs",
      lang: "en",
    });
  });

  it("accepts URLs on the docs' origins only", () => {
    expect(
      normalizeDocsPath(`${PUBLIC}/docs/developers/mcp`, [PUBLIC, DOCS]),
    ).toEqual({ path: "/docs/developers/mcp", lang: "en" });
    expect(
      normalizeDocsPath(`${DOCS}/ja/docs/getting-started`, [PUBLIC, DOCS]),
    ).toEqual({ path: "/docs/getting-started", lang: "ja" });
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

describe("docsLang", () => {
  it("takes a docs locale or its URL segment, else English", () => {
    expect(docsLang("es")).toBe("es");
    expect(docsLang("pt-BR")).toBe("pt-BR");
    expect(docsLang("pt-br")).toBe("pt-BR");
    expect(docsLang("zh-hans")).toBe("zh-Hans");
    expect(docsLang("xx")).toBe("en");
    expect(docsLang(undefined)).toBe("en");
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

  it("keeps a translated page's own URL and checks its English path", () => {
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
      path: "/es/docs/help/contact",
      url: `${PUBLIC}/es/docs/help/contact`,
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
  it("searches the docs site in the asked language and shapes the hits", async () => {
    const docs = fakeDocs(
      {
        "es:mcp": [
          page("/es/docs/developers/mcp", "Servidor MCP"),
          passage("/es/docs/developers/mcp", "Conecta QRdx."),
        ],
      },
      {},
    );
    const retriever = createDocsRetriever({
      docsOrigin: `${DOCS}/`,
      publicOrigin: PUBLIC,
      fetch: docs.fetch,
    });
    const result = await retriever.search("mcp", "es");
    expect(result.lang).toBe("es");
    expect(result.hits).toEqual([
      {
        title: "Servidor MCP",
        path: "/es/docs/developers/mcp",
        url: `${PUBLIC}/es/docs/developers/mcp`,
        snippet: "Conecta QRdx.",
        section: "Developers",
      },
    ]);
    expect(docs.calls).toEqual(["/api/search?query=mcp&locale=es"]);
  });

  it("falls back to English when the language has no match, and caches the answer", async () => {
    const docs = fakeDocs(
      { "en:webhooks": [page("/docs/webhooks", "Webhooks")] },
      {},
    );
    const retriever = createDocsRetriever({
      docsOrigin: DOCS,
      publicOrigin: PUBLIC,
      fetch: docs.fetch,
    });
    const first = await retriever.search("webhooks", "ja");
    expect(first.lang).toBe("en");
    expect(first.hits.map((hit) => hit.path)).toEqual(["/docs/webhooks"]);
    const second = await retriever.search("  Webhooks ", "ja");
    expect(second).toEqual(first);
    expect(docs.calls).toEqual([
      "/api/search?query=webhooks&locale=ja",
      "/api/search?query=webhooks&locale=en",
    ]);
  });

  it("caps the query and the number of hits", async () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      page(`/docs/page-${i}`, `Page ${i}`),
    );
    const longQuery = "a".repeat(DOCS_CHAT.maxQueryChars + 50);
    const docs = fakeDocs(
      { [`en:${"a".repeat(DOCS_CHAT.maxQueryChars)}`]: rows },
      {},
    );
    const retriever = createDocsRetriever({
      docsOrigin: DOCS,
      publicOrigin: PUBLIC,
      fetch: docs.fetch,
    });
    const result = await retriever.search(longQuery, "en", 50);
    expect(result.hits).toHaveLength(DOCS_CHAT.searchLimit);
  });

  it("returns nothing for an empty query without calling the docs", async () => {
    const docs = fakeDocs({}, {});
    const retriever = createDocsRetriever({
      docsOrigin: DOCS,
      publicOrigin: PUBLIC,
      fetch: docs.fetch,
    });
    expect(await retriever.search("   ", "en")).toEqual({
      hits: [],
      lang: "en",
    });
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
      lang: "en",
      markdown:
        "Connect QRdx to any MCP client.\n\n## Connect\n\nAdd the server URL.",
      truncated: false,
    });
    await retriever.readPage(`${PUBLIC}/docs/developers/mcp.md`);
    expect(docs.calls).toEqual(["/docs/developers/mcp.md"]);
  });

  it("reads a translation when there is one, else the English page at the English URL", async () => {
    const docs = fakeDocs(
      {},
      {
        "/es/docs/help/contact.md": "# Contacto (Ayuda)\n\nEscríbenos.",
        "/docs/webhooks.md": "# Webhooks\n\nEnglish only.",
      },
    );
    const retriever = createDocsRetriever({
      docsOrigin: DOCS,
      publicOrigin: PUBLIC,
      fetch: docs.fetch,
    });
    const spanish = await retriever.readPage("/docs/help/contact", "es");
    expect(spanish).toMatchObject({
      title: "Contacto",
      path: "/es/docs/help/contact",
      lang: "es",
      markdown: "Escríbenos.",
    });
    const fallback = await retriever.readPage("/docs/webhooks", "es");
    expect(fallback).toMatchObject({
      title: "Webhooks",
      path: "/docs/webhooks",
      url: `${PUBLIC}/docs/webhooks`,
      lang: "en",
    });
    expect(docs.calls).toEqual([
      "/es/docs/help/contact.md",
      "/es/docs/webhooks.md",
      "/docs/webhooks.md",
    ]);
  });

  it("marks a page the docs app served in English at a translated URL", async () => {
    // The docs-md route answers an untranslated page with the English
    // text and Content-Language: en.
    const fetcher = vi.fn(
      async () =>
        new Response("# Webhooks\n\nEnglish text.", {
          headers: { "content-language": "en" },
        }),
    );
    const retriever = createDocsRetriever({
      docsOrigin: DOCS,
      publicOrigin: PUBLIC,
      fetch: fetcher as unknown as typeof fetch,
    });
    const page = await retriever.readPage("/docs/webhooks", "de");
    expect(page.lang).toBe("en");
    expect(page.path).toBe("/docs/webhooks");
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
    await expect(retriever.search("mcp", "en")).rejects.toMatchObject({
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
