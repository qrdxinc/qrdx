// The MCP server's docs tools (app/api/mcp/docs.ts): search_docs and
// read_docs_page read the docs site behind a fake fetch, through the same
// retrieval as the docs assistant. Called in-process with JSON-RPC, like
// tests/api/mcp.test.ts.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const DOCS = "http://docs.test";

vi.hoisted(() => {
  process.env.DOCS_ZONE_URL = "http://docs.test";
});

vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 120,
      remaining: 119,
      reset: Date.now() + 30_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const docsCalls: string[] = [];
let docsDown = false;

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.origin !== DOCS) {
      throw new Error(`Unexpected fetch in a test: ${url.href}`);
    }
    docsCalls.push(`${url.pathname}${url.search}`);
    if (docsDown) throw new DOMException("timeout", "TimeoutError");
    if (url.pathname === "/api/search") {
      return Response.json([
        { id: "1", url: "/docs/webhooks", type: "page", content: "Webhooks" },
        {
          id: "2",
          url: "/docs/webhooks#events",
          type: "text",
          content: "Every event QRdx sends.",
        },
        { id: "3", url: "/docs/slack-bot", type: "page", content: "Slack bot" },
      ]);
    }
    if (url.pathname === "/docs/webhooks.md") {
      return new Response(
        "# Webhooks (Guides)\n\nURL: http://localhost:3000/docs/webhooks\n\nQRdx calls your URL when a code is scanned.",
        { headers: { "content-type": "text/markdown" } },
      );
    }
    return new Response("not found", { status: 404 });
  }),
);

const route = await import("@/app/api/mcp/route");

beforeEach(() => {
  docsCalls.length = 0;
  docsDown = false;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

let rpcId = 0;
async function rpc(method: string, params: Record<string, unknown> = {}) {
  const response = await route.POST(
    new Request("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    }),
  );
  const text = await response.text();
  const json = response.headers.get("content-type")?.includes("event-stream")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("")
    : text;
  return JSON.parse(json) as Record<string, any>;
}

const call = (name: string, args: Record<string, unknown>) =>
  rpc("tools/call", { name, arguments: args });

describe("the MCP docs tools", () => {
  it("are listed as read-only, keyless tools with the server at 1.6.0", async () => {
    const init = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "vitest", version: "1.0.0" },
    });
    expect(init.result.serverInfo.version).toBe("1.6.0");
    expect(init.result.instructions).toContain(
      "search_docs and read_docs_page",
    );
    const { result } = await rpc("tools/list");
    const tools = result.tools as {
      name: string;
      annotations?: Record<string, unknown>;
      inputSchema: { properties: Record<string, unknown> };
    }[];
    for (const name of ["search_docs", "read_docs_page"]) {
      const tool = tools.find((candidate) => candidate.name === name);
      expect(tool, name).toBeDefined();
      expect(tool?.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
      });
      expect(Object.keys(tool?.inputSchema.properties ?? {})).toContain(
        "language",
      );
    }
  });

  it("search_docs returns titles, URLs, paths and snippets, without hidden pages", async () => {
    const { result } = await call("search_docs", { query: "webhooks" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body).toEqual({
      language: "en",
      total: 1,
      results: [
        {
          title: "Webhooks",
          path: "/docs/webhooks",
          url: "http://localhost:3000/docs/webhooks",
          snippet: "Every event QRdx sends.",
        },
      ],
    });
    expect(docsCalls).toEqual(["/api/search?query=webhooks"]);
  });

  it("read_docs_page returns the page as Markdown with its title and URL", async () => {
    const { result } = await call("read_docs_page", { path: "/docs/webhooks" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe(
      "# Webhooks\nURL: http://localhost:3000/docs/webhooks\n\nQRdx calls your URL when a code is scanned.",
    );
    expect(result.structuredContent).toEqual({
      title: "Webhooks",
      url: "http://localhost:3000/docs/webhooks",
      path: "/docs/webhooks",
      language: "en",
      truncated: false,
    });
    // The same page by URL comes from the cache.
    const again = await call("read_docs_page", {
      path: "http://localhost:3000/docs/webhooks",
    });
    expect(again.result.isError).toBeFalsy();
    expect(docsCalls).toEqual(["/docs/webhooks.md"]);
  });

  it("still takes `language`, and ignores it: the docs are English only", async () => {
    const { result } = await call("search_docs", {
      query: "webhook events",
      language: "es",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body.language).toBe("en");
    expect(body.total).toBe(1);
    expect(body.results[0].url).toBe("http://localhost:3000/docs/webhooks");
    expect(docsCalls).toEqual(["/api/search?query=webhook+events"]);

    docsCalls.length = 0;
    const read = await call("read_docs_page", {
      path: "/es/docs/webhooks",
      language: "es",
    });
    expect(read.result.isError).toBeFalsy();
    expect(read.result.structuredContent).toMatchObject({
      url: "http://localhost:3000/docs/webhooks",
      path: "/docs/webhooks",
      language: "en",
    });
    // The English page, already read above: nothing asked for /es/docs/….
    expect(docsCalls).toEqual([]);
  });

  it("read_docs_page refuses paths outside the docs, hidden pages and missing pages", async () => {
    for (const [path, code] of [
      ["/pricing", "docs_invalid_path"],
      ["https://evil.example/docs/webhooks", "docs_invalid_path"],
      ["/docs/slack-bot", "docs_unavailable"],
      ["/docs/missing", "docs_not_found"],
    ]) {
      const { result } = await call("read_docs_page", { path });
      expect(result.isError, path).toBe(true);
      expect(result.structuredContent.code, path).toBe(code);
    }
  });

  it("says so when the docs site doesn't answer", async () => {
    docsDown = true;
    const { result } = await call("search_docs", { query: "anything" });
    expect(result.isError).toBe(true);
    expect(result.structuredContent.code).toBe("docs_fetch_failed");
  });
});
