// Which tools the public MCP server (app/api/mcp/route.ts) offers, as
// apps/docs/content/docs/developers/mcp.mdx describes it: save_template,
// save_barcode and generate_ai_art act on an API key's workspace, so they're
// listed only when the request sends `Authorization: Bearer qrdx_…`. Only the
// header's shape decides; each tool still checks the key when it's called,
// so a wrong key sees them and gets the key's error. The instructions a
// connection without a key gets say what a key adds, never to call them.
// The key lookup is faked: no database, no network.
import { describe, expect, it, vi } from "vitest";

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
// No key is known: every qrdx_… key on these requests is a wrong one.
vi.mock("@/lib/api-keys/service", () => ({
  authenticateApiKey: async () => null,
}));

const route = await import("@/app/api/mcp/route");
const { KEYED_MCP_TOOLS, MCP_INSTRUCTIONS, MCP_KEYLESS_INSTRUCTIONS } =
  await import("@/app/api/mcp/tools");

const PROTOCOL = "2025-06-18";
const TEST_KEY = "qrdx_test0000000000000000000000000000000000";

let rpcId = 0;
async function rpc(
  method: string,
  params: Record<string, unknown>,
  authorization?: string,
) {
  const response = await route.POST(
    new Request("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": PROTOCOL,
        ...(authorization ? { authorization } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    }),
  );
  expect(response.status).toBe(200);
  const text = await response.text();
  const json = response.headers.get("content-type")?.includes("event-stream")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("")
    : text;
  return JSON.parse(json) as {
    result?: Record<string, any>;
    error?: { code: number; message: string };
  };
}

async function listTools(authorization?: string) {
  const { result } = await rpc("tools/list", {}, authorization);
  return result?.tools as { name: string; description?: string }[];
}

async function instructions(authorization?: string): Promise<string> {
  const { result } = await rpc(
    "initialize",
    {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: "vitest", version: "1.0.0" },
    },
    authorization,
  );
  return result?.instructions;
}

const names = (tools: { name: string }[]) => tools.map((tool) => tool.name);

describe("tools/list", () => {
  it("leaves out save_template, save_barcode and generate_ai_art without a key", async () => {
    const tools = names(await listTools());
    expect(tools).toContain("design_qr");
    expect(tools).toContain("generate_barcode");
    for (const name of KEYED_MCP_TOOLS) expect(tools).not.toContain(name);
  });

  it("lists them, and nothing else more, with Authorization: Bearer qrdx_…", async () => {
    const keyless = names(await listTools());
    const keyed = names(await listTools(`Bearer ${TEST_KEY}`));
    expect(keyed.sort()).toEqual([...keyless, ...KEYED_MCP_TOOLS].sort());
  });

  it("goes by the header's shape: other credentials get the keyless list", async () => {
    for (const authorization of [
      "Bearer an-oauth-access-token",
      "Basic cXJkeDpzZWNyZXQ=",
      `Token ${TEST_KEY}`,
      "Bearer ",
    ]) {
      const tools = names(await listTools(authorization));
      for (const name of KEYED_MCP_TOOLS) {
        expect(tools, authorization).not.toContain(name);
      }
    }
  });

  it("keeps design_qr's description from pointing a keyless client at save_template", async () => {
    const description = (tools: { name: string; description?: string }[]) =>
      tools.find((tool) => tool.name === "design_qr")?.description ?? "";
    expect(description(await listTools())).not.toContain("save_template");
    expect(description(await listTools(`Bearer ${TEST_KEY}`))).toContain(
      "ready for save_template and generate_qr_code",
    );
  });
});

describe("instructions", () => {
  it("with a key, describe every tool as before", async () => {
    const text = await instructions(`Bearer ${TEST_KEY}`);
    expect(text).toBe(MCP_INSTRUCTIONS);
    expect(text).toContain("save_template saves a design as a theme");
    expect(text).toContain("save_barcode keeps one");
    expect(text).toContain("generate_ai_art paints a QR code");
  });

  it("without a key, name the keyed tools only as what adding a key adds", async () => {
    const text = await instructions();
    expect(text).toBe(MCP_KEYLESS_INSTRUCTIONS);
    const mentions = text
      .split(/(?<=\.) (?=[A-Z])/)
      .filter((sentence) =>
        KEYED_MCP_TOOLS.some((name) => sentence.includes(name)),
      );
    expect(mentions).toEqual([
      expect.stringMatching(
        /^Adding one to the connection \(Authorization: Bearer qrdx_…\) adds save_template, save_barcode and generate_ai_art/,
      ),
    ]);
    expect(text).not.toMatch(
      /call (save_template|save_barcode|generate_ai_art)/,
    );
    // The tools a keyless client can call are still described.
    expect(text).toContain("call generate_barcode");
    expect(text).toContain("search_docs and read_docs_page");
  });
});

describe("calling a keyed tool", () => {
  it("without a key, the server has no such tool", async () => {
    for (const name of KEYED_MCP_TOOLS) {
      const { result, error } = await rpc("tools/call", {
        name,
        arguments: {},
      });
      expect(result, name).toBeUndefined();
      expect(error?.message, name).toContain(`Tool ${name} not found`);
    }
  });

  it("with a wrong key, the call-time check answers as before", async () => {
    const save = await rpc(
      "tools/call",
      {
        name: "save_barcode",
        arguments: { format: "ean13", value: "590123412345" },
      },
      `Bearer ${TEST_KEY}`,
    );
    expect(save.result?.isError).toBe(true);
    expect(save.result?.structuredContent).toMatchObject({
      code: "INVALID_TOKEN",
      status: 401,
    });
    const template = await rpc(
      "tools/call",
      {
        name: "save_template",
        arguments: { name: "Brand", style: { fgColor: "#155DFC" } },
      },
      `Bearer ${TEST_KEY}`,
    );
    expect(template.result?.structuredContent).toMatchObject({
      code: "INVALID_TOKEN",
      status: 401,
    });
  });
});
