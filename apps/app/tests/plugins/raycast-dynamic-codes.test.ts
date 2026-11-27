// The Raycast extension's dynamic-code commands call the REST API with a
// client of their own (plugins/raycast/src/qrdx-api.ts) and draw each code
// with a copy of the editor's style mapping (plugins/raycast/src/code-style.ts),
// since the extension can't import the app. These tests hold both copies to
// the app: the client to the published OpenAPI document and the dashboard's
// links, the mapping to editorCodeProps.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CANONICAL_ORIGIN } from "@repo/config";
import { describe, expect, it } from "vitest";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { editorCodeProps } from "@/lib/qr-design/props";
import {
  dashboardEntry,
  entryPath,
  workspaceLink,
} from "@/lib/workspace-paths";
import type { ThemeStyles } from "@/types/theme";
import { defaultPresets } from "@/utils/qr-presets";
import {
  codeProps,
  QRDX_LOGO,
} from "../../../../plugins/raycast/src/code-style";
import {
  API_URL,
  CREATE_API_KEY_URL,
  createCode,
  type DynamicCode,
  dashboardLink,
  destinationError,
  getScans,
  listCodes,
  QRdxApiError,
  SCAN_RANGES,
  updateCode,
} from "../../../../plugins/raycast/src/qrdx-api";

const openapi = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../public/openapi.json"), "utf8"),
) as {
  servers: { url: string }[];
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: {
    schemas: Record<
      string,
      { required?: string[]; properties?: Record<string, unknown> }
    >;
  };
};

interface OpenApiOperation {
  parameters?: {
    name: string;
    in: string;
    schema: { enum?: string[]; maximum?: number; maxLength?: number };
  }[];
}

/** A fetch that records each request and answers with `reply`. */
function fakeFetch(reply: { status?: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    const text =
      typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body);
    return Promise.resolve(
      new Response(text, {
        status: reply.status ?? 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const KEY = "qrdx_test0000000000000000000000000000000000";

const CODE: DynamicCode = {
  id: "c1",
  slug: "abc1234",
  shortLink: "https://qrdx.dev/q/abc1234",
  destinationUrl: "https://example.com/menu",
  title: "Menu",
  kind: "redirect",
  status: "active",
  style: null,
  scanCount: 3,
  lastScannedAt: null,
  createdAt: "2026-11-27T00:00:00.000Z",
  updatedAt: "2026-11-27T00:00:00.000Z",
};

describe("Raycast dynamic codes: the API client", () => {
  it("calls the API at its published address", () => {
    expect(openapi.servers[0]?.url).toBe(API_URL);
  });

  it("reads only fields every code and scan response has", () => {
    const code = openapi.components.schemas.Code?.required ?? [];
    expect(Object.keys(CODE).filter((field) => !code.includes(field))).toEqual(
      [],
    );
    const scans = openapi.components.schemas.ScanAnalytics?.required ?? [];
    const read = [
      "codeId",
      "range",
      "retentionDays",
      "from",
      "days",
      "total",
      "unique",
      "interval",
      "series",
      "countries",
      "cities",
      "devices",
      "os",
      "browsers",
      "referrers",
    ];
    expect(read.filter((field) => !scans.includes(field))).toEqual([]);
  });

  it("sends only parameters and fields the API documents", () => {
    const list = openapi.paths["/codes"]?.get?.parameters ?? [];
    const param = (name: string) => list.find((p) => p.name === name)?.schema;
    expect(param("status")?.enum).toContain("active");
    expect(param("q")?.maxLength).toBeGreaterThanOrEqual(200);
    expect(param("limit")?.maximum).toBeGreaterThanOrEqual(100);

    const ranges =
      openapi.paths["/codes/{id}/scans"]?.get?.parameters?.find(
        (p) => p.name === "range",
      )?.schema.enum ?? [];
    expect(SCAN_RANGES.filter((range) => !ranges.includes(range))).toEqual([]);

    for (const schema of ["CodeInput", "CodeUpdate"]) {
      const fields = Object.keys(
        openapi.components.schemas[schema]?.properties ?? {},
      );
      expect(fields).toEqual(
        expect.arrayContaining(["destinationUrl", "title"]),
      );
    }
  });

  it("lists active codes with the key, a search and the total", async () => {
    const { impl, calls } = fakeFetch({
      body: { data: [CODE], pagination: { total: 120, limit: 100, offset: 0 } },
    });
    const result = await listCodes(KEY, "  menu ", impl);
    expect(result).toEqual({ codes: [CODE], total: 120 });
    const url = new URL(calls[0]?.url ?? "");
    expect(`${url.origin}${url.pathname}`).toBe(`${API_URL}/codes`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      status: "active",
      limit: "100",
      q: "menu",
    });
    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: `Bearer ${KEY}`,
    });
  });

  it("creates, edits and reads scans with JSON bodies", async () => {
    const created = fakeFetch({ status: 201, body: { data: CODE } });
    await createCode(
      KEY,
      { destinationUrl: " https://example.com/menu ", title: "  " },
      created.impl,
    );
    expect(created.calls[0]?.url).toBe(`${API_URL}/codes`);
    expect(created.calls[0]?.init.method).toBe("POST");
    expect(created.calls[0]?.init.headers).toMatchObject({
      "Content-Type": "application/json",
    });
    // A blank title is left out, so the code gets none.
    expect(JSON.parse(String(created.calls[0]?.init.body))).toEqual({
      destinationUrl: "https://example.com/menu",
    });

    const edited = fakeFetch({ body: { data: CODE } });
    await updateCode(
      KEY,
      "c/1",
      { destinationUrl: "https://example.com/new" },
      edited.impl,
    );
    expect(edited.calls[0]?.url).toBe(`${API_URL}/codes/c%2F1`);
    expect(edited.calls[0]?.init.method).toBe("PATCH");
    expect(JSON.parse(String(edited.calls[0]?.init.body))).toEqual({
      destinationUrl: "https://example.com/new",
    });

    const scans = fakeFetch({ body: { data: { total: 0 } } });
    await getScans(KEY, "c1", "7d", scans.impl);
    expect(scans.calls[0]?.url).toBe(`${API_URL}/codes/c1/scans?range=7d`);
  });

  it("turns the API's errors into messages, and says what to do about a bad key", async () => {
    const unauthorized = fakeFetch({
      status: 401,
      body: {
        code: "UNAUTHORIZED",
        message: "Invalid or revoked API key.",
        status: 401,
      },
    });
    const error = await listCodes(KEY, undefined, unauthorized.impl).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(QRdxApiError);
    expect(error).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect((error as Error).message).toMatch(
      /^Invalid or revoked API key\. The key is in this extension's preferences\.$/,
    );

    const down = fakeFetch({ status: 502, body: "<html>Bad gateway</html>" });
    await expect(getScans(KEY, "c1", "30d", down.impl)).rejects.toThrow(
      "QRdx answered with HTTP 502",
    );
  });

  it("links to the dashboard pages the app serves", () => {
    expect(dashboardLink("c1")).toBe(
      `${CANONICAL_ORIGIN}${workspaceLink(null, "/codes/c1")}`,
    );
    expect(entryPath("codes/c1")).toBe("/codes/c1");
    expect(CREATE_API_KEY_URL).toBe(
      `${CANONICAL_ORIGIN}${dashboardEntry("settings/developers", { new: "1" })}`,
    );
  });

  it("asks for a full web address before calling the API", () => {
    expect(destinationError("https://example.com/menu")).toBeUndefined();
    expect(destinationError(" http://example.com ")).toBeUndefined();
    expect(destinationError("")).toBeDefined();
    expect(destinationError("example.com")).toBeDefined();
    expect(destinationError("mailto:a@example.com")).toBeDefined();
    expect(destinationError(`https://example.com/${"a".repeat(2048)}`)).toBe(
      "The address is too long",
    );
  });
});

describe("Raycast dynamic codes: drawing a code's design", () => {
  const LINK = "https://qrdx.dev/q/abc1234";

  /** Styles that use every option the mapping copies. */
  const options: Record<string, Partial<ThemeStyles>> = {
    "no design": {},
    "logo without one of its own": { showLogo: true },
    "logo of its own, placed": {
      showLogo: true,
      customLogo: "https://assets.qrdx.dev/logo.png",
      logoOptions: { size: 0.2, padding: 1, shape: "circle" },
    },
    "per-eye colors and shapes": {
      eyeColors: { topLeft: { outer: "#e11d48", inner: "#111111" } },
      eyeShapes: { topRight: { outer: "rounded", inner: "circle" } },
      eyeGradient: "code",
    },
    "looks around the shapes": {
      moduleScale: 0.8,
      autoLevel: true,
      bgRadius: 24,
      backdrop: "#f4f4f5",
      halo: { color: "#ffffff", width: 0.2 },
      shadow: { color: "#000000", opacity: 0.3, dx: 0.2, dy: 0.2 },
    },
    "a named outline": { shape: "circle" },
    "options set to nothing": {
      moduleScale: 1,
      bgRadius: 0,
      backdrop: "#ffffff",
      eyeColors: { topLeft: {} },
      eyeShapes: {},
      logoOptions: {},
    },
    frame: {
      frame: { style: "banner-bottom", text: "Scan me", color: "#111111" },
    } as Partial<ThemeStyles>,
  };

  const presets = Object.entries(defaultPresets).map(
    ([name, preset]) => [`preset ${name}`, preset.styles] as const,
  );

  it.each([...Object.entries(options), ...presets])(
    "%s: the editor's props",
    (_name, style) => {
      const extension = codeProps(
        LINK,
        style as unknown as Parameters<typeof codeProps>[1],
      );
      expect(extension).toEqual(editorCodeProps(style, LINK));
    },
  );

  it("draws QRdx's own logo when a design shows one without its own", () => {
    expect(QRDX_LOGO).toBe(DEFAULT_QR_LOGO);
  });
});
