// The Google Workspace add-on (plugins/google-workspace) is plain Apps
// Script and can't import the app, so it keeps its own copies of the image
// API's parameters and the payload formats. These tests hold the copies to
// the real thing: the image API's query schema, the MCP server's payload
// builders and the editor's encoders, and the sign-up analytics' tags.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import {
  buildEmailPayload,
  buildSmsPayload,
  buildWifiPayload,
  emailPayloadSchema,
  smsPayloadSchema,
  wifiPayloadSchema,
} from "@/app/api/mcp/payloads";
import { qrImageQuerySchema, STYLED_PARAMS } from "@/app/api/v1/qr/_lib/query";
import { acquisitionChannel } from "@/lib/analytics/channel";
import { PLUGIN_REFS } from "@/lib/analytics/handoff-tags";
import { readLanding } from "@/lib/analytics/landing";
import { encodePhone, normalizeWebUrl } from "@/utils/qr-content-encoder";

const ADDON = join(import.meta.dirname, "../../../../plugins/google-workspace");

/** The add-on's files run as Apps Script runs them: one shared scope. */
function loadAddon() {
  const context = vm.createContext({});
  const src = join(ADDON, "src");
  for (const file of readdirSync(src).sort()) {
    if (!file.endsWith(".js")) continue;
    vm.runInContext(readFileSync(join(src, file), "utf8"), context, {
      filename: file,
    });
  }
  return <T>(name: string) => vm.runInContext(name, context) as T;
}

const get = loadAddon();

interface Preset {
  id: string;
  params: Record<string, string>;
}
type Payload =
  | { ok: true; data: string }
  | { ok: false; field: string; message: string };

const presets = JSON.parse(
  JSON.stringify(get<Preset[]>("STYLE_PRESETS")),
) as Preset[];
const qrImageUrl =
  get<(data: string, preset: string, pixels: number) => string>("qrImageUrl");
const buildPayload =
  get<(type: string, fields: Record<string, unknown>) => Payload>(
    "buildPayload",
  );

function dataOf(type: string, fields: Record<string, unknown>): string {
  const result = buildPayload(type, fields);
  if (!result.ok) throw new Error(result.message);
  return result.data;
}

describe("the add-on's image addresses", () => {
  const knownParams = new Set(Object.keys(qrImageQuerySchema.shape));

  it.each(presets.map((preset) => [preset.id, preset] as const))(
    "%s: every parameter is one GET /v1/qr takes, and it accepts the values",
    (_id, preset) => {
      const url = new URL(
        qrImageUrl("https://example.com/menu", preset.id, 512),
      );
      expect(url.origin + url.pathname).toBe("https://api.qrdx.dev/v1/qr");
      const query = Object.fromEntries(url.searchParams);
      for (const name of Object.keys(query)) {
        expect(knownParams.has(name), name).toBe(true);
      }
      // Flat parameters only: the original renderer's short, cacheable URLs.
      for (const name of STYLED_PARAMS) expect(query).not.toHaveProperty(name);
      const parsed = qrImageQuerySchema.safeParse(query);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(parsed.data).toMatchObject({
        data: "https://example.com/menu",
        format: "png",
        size: 512,
        ...(preset.params.body ? { body: preset.params.body } : {}),
        ...(preset.params.eye ? { eye: preset.params.eye } : {}),
        ...(preset.params.dot ? { dot: preset.params.dot } : {}),
      });
    },
  );

  it("are fetched only from the host the manifest allows", () => {
    const manifest = JSON.parse(
      readFileSync(join(ADDON, "src/appsscript.json"), "utf8"),
    ) as { urlFetchWhitelist: string[] };
    const url = qrImageUrl("x", "plain", 512);
    expect(
      manifest.urlFetchWhitelist.some((prefix) => url.startsWith(prefix)),
    ).toBe(true);
  });
});

describe("the add-on's payloads match the MCP server's", () => {
  it.each([
    { ssid: "Home", password: "hunter2hunter2", security: "WPA" as const },
    {
      ssid: 'Café; "Guest", 2:4',
      password: "p\\ss;word,1",
      security: "WPA" as const,
      hidden: true,
    },
    { ssid: "Lobby", security: "nopass" as const },
    { ssid: "Old", password: "abcde", security: "WEP" as const },
    { ssid: "New", password: "pw", security: "SAE" as const },
  ])("Wi-Fi $ssid ($security)", (input) => {
    expect(dataOf("wifi", input)).toBe(
      buildWifiPayload(wifiPayloadSchema.parse(input)),
    );
  });

  it.each([
    { to: "ana@example.com" },
    { to: "ana+menu@example.com", subject: "Table 4 & more" },
    { to: "ana@example.com", subject: "Hi", body: "Two\nlines, & more?" },
  ])("email to $to", (input) => {
    expect(dataOf("email", input)).toBe(
      buildEmailPayload(emailPayloadSchema.parse(input)),
    );
  });

  it.each([
    { phone: "+14155550123" },
    { phone: "+1 (415) 555-0123", message: "Book table 4 & 5?" },
  ])("SMS to $phone", (input) => {
    expect(dataOf("sms", input)).toBe(
      buildSmsPayload(smsPayloadSchema.parse(input)),
    );
  });
});

describe("the add-on's payloads match the editor's", () => {
  it.each([
    "example.com/menu",
    "https://example.com/a?b=1",
    "http://example.com",
    "localhost:3000/path",
  ])("link %s", (url) => {
    expect(dataOf("url", { url })).toBe(normalizeWebUrl(url));
  });

  it.each(["+1 (415) 555-0123", "+44 20 7946 0958"])("phone %s", (phone) => {
    expect(dataOf("phone", { phone })).toBe(
      encodePhone({ type: "phone", phoneNumber: phone }),
    );
  });
});

describe("the add-on's dynamic-code link", () => {
  it("counts sign-ups as the plugin channel", () => {
    const link = get<string>("DYNAMIC_CODE_URL");
    const ref = new URL(link).searchParams.get("ref");
    expect(PLUGIN_REFS).toContain(ref);
    const landing = readLanding({ href: link, referrer: "" });
    expect(acquisitionChannel(landing, { affiliate: false })).toBe("plugin");
    expect(landing?.utm_campaign).toBe("sidebar");
  });
});
