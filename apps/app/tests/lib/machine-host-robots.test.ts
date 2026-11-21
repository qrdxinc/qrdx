// api.qrdx.dev and mcp.qrdx.dev serve a robots.txt of their own
// (app/api/machine-robots, lib/agents/robots-rules.ts): crawlers stay out
// of the endpoints, assistants fetching a URL for a person may still.
// Before, /robots.txt there redirected to an HTML page, which leaves
// crawlers no rules at all.

import type { NextConfig } from "next";
import {
  getRedirectUrl,
  getRewrittenUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/machine-robots/route";
import {
  AI_CRAWLERS,
  ASSISTANT_FETCHERS,
  machineHostRobots,
} from "@/lib/agents/robots-rules";

/** The groups of a robots.txt: each group's agents and its rules. */
function groups(text: string) {
  const parsed: { agents: string[]; rules: string[] }[] = [];
  let current: { agents: string[]; rules: string[] } | null = null;
  for (const line of text.split("\n").map((l) => l.trim())) {
    if (!line || line.startsWith("#")) continue;
    const [field, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (field?.toLowerCase() === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        parsed.push(current);
      }
      current.agents.push(value);
    } else {
      current?.rules.push(`${field}: ${value}`);
    }
  }
  return parsed;
}

describe("machineHostRobots", () => {
  const parsed = groups(machineHostRobots());

  it("keeps every crawler out", () => {
    expect(parsed[0]).toEqual({ agents: ["*"], rules: ["Disallow: /"] });
  });

  it("lets assistants fetching for a person in, and no crawler", () => {
    expect(parsed[1]).toEqual({
      agents: [...ASSISTANT_FETCHERS],
      rules: ["Allow: /"],
    });
    expect(parsed).toHaveLength(2);
    for (const agent of ASSISTANT_FETCHERS) {
      expect(AI_CRAWLERS).toContain(agent);
      expect(agent).toMatch(/-User$/);
    }
  });

  it("is served as plain text", async () => {
    const response = GET();
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(await response.text()).toBe(machineHostRobots());
  });
});

// The real next.config.ts.
describe("next.config.ts", () => {
  let nextConfig: NextConfig;

  beforeAll(async () => {
    process.env.CSP_DEV = "1";
    vi.resetModules();
    // createMDX() rewrites .source/*.ts in the background; the routes don't
    // depend on MDX (tests/lib/csp.test.ts explains the race).
    vi.doMock("fumadocs-mdx/next", () => ({
      createMDX: () => (config: unknown) => config,
    }));
    nextConfig = (await import("@/next.config"))
      .default as unknown as NextConfig;
  }, 120_000);

  afterAll(() => {
    vi.doUnmock("fumadocs-mdx/next");
  });

  const respond = (url: string) =>
    unstable_getResponseFromNextConfig({ url, nextConfig });

  it.each(["https://api.qrdx.dev", "https://mcp.qrdx.dev"])(
    "%s/robots.txt is the machine hosts' robots.txt",
    async (origin) => {
      const response = await respond(`${origin}/robots.txt`);
      expect(getRedirectUrl(response)).toBeNull();
      expect(new URL(getRewrittenUrl(response) ?? "").pathname).toBe(
        "/api/machine-robots",
      );
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    },
  );

  it("leaves qrdx.dev/robots.txt to app/robots.ts", async () => {
    const response = await respond("https://qrdx.dev/robots.txt");
    expect(getRedirectUrl(response)).toBeNull();
    expect(getRewrittenUrl(response)).toBeNull();
  });

  it("still sends the hosts' other addresses to their pages", async () => {
    for (const [url, location] of [
      [
        "https://api.qrdx.dev/robots",
        "https://qrdx.dev/docs/developers/rest-api",
      ],
      ["https://api.qrdx.dev/", "https://qrdx.dev/docs/developers/rest-api"],
      ["https://mcp.qrdx.dev/robots.txt.bak", "https://qrdx.dev/mcp"],
    ] as const) {
      expect(getRedirectUrl(await respond(url)), url).toBe(location);
    }
  });

  it("still serves the API on api.qrdx.dev/v1", async () => {
    const response = await respond(
      "https://api.qrdx.dev/v1/barcode?format=upce&data=06543217",
    );
    expect(getRedirectUrl(response)).toBeNull();
    expect(new URL(getRewrittenUrl(response) ?? "").pathname).toBe(
      "/api/v1/barcode",
    );
  });
});
