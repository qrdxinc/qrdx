// Segment: scans and form responses as Track calls through the HTTP Tracking
// API. Fetch is faked: no test reaches Segment.
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCatalogEntry } from "../src/catalog";
import {
  IntegrationApiError,
  isIntegrationApiError,
} from "../src/core/http-client";
import {
  createSegmentClient,
  jsonBytes,
  SEGMENT_ENDPOINTS,
  SEGMENT_MAX_BATCH_BYTES,
  SEGMENT_MAX_BATCH_EVENTS,
  SEGMENT_MAX_EVENT_BYTES,
  SegmentClient,
  type SegmentTrackEvent,
  verifySegmentWriteKey,
} from "../src/integrations/segment/client";
import {
  fittedResponseEvent,
  responseTrackEvent,
  scanTrackEvent,
  segmentAnswers,
  segmentBatches,
  segmentMessageId,
  testTrackEvent,
} from "../src/integrations/segment/events";
import {
  normalizeSegmentEventName,
  readSegmentSettings,
  SEGMENT_DEFAULT_EVENTS,
} from "../src/integrations/segment/settings";
import {
  sendResponsesToSegment,
  sendScansToSegment,
  sendSegmentTestEvent,
} from "../src/integrations/segment/sink";
import { getIntegrationRegistry } from "../src/registry";
import { registerAllIntegrations } from "../src/registry/loader";
import {
  initialSyncState,
  isRetryableSyncError,
  nextSyncState,
} from "../src/sinks/state";
import {
  SINK_PROVIDERS,
  SINK_STREAMS,
  type SinkAnswer,
  type SinkFormResponse,
  type SinkScan,
  SYNC_STATE_KEYS,
  sinkStreamSlot,
} from "../src/sinks/types";
import { bodyOf, json, mockFetch, networkError } from "./helpers";

const KEY = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const CONNECTION = "3f2b9c1e-7a4d-4e8b-9c0f-1d2e3f4a5b6c";
const OPTIONS = { event: "QR Code Scanned", connectionId: CONNECTION };

const scan = (n: number, overrides: Partial<SinkScan> = {}): SinkScan => ({
  id: `scan_${n}`,
  scannedAt: `2026-11-25T09:0${n}:00.000Z`,
  code: { id: "code_1", slug: "aB3dE5f", title: "Spring menu" },
  country: "DE",
  city: "Berlin",
  deviceType: "mobile",
  os: "iOS",
  browser: "Safari",
  referer: "instagram.com",
  language: "de-de",
  region: "BE",
  variant: "rule_1:var_b",
  source: "qr",
  ...overrides,
});

const answer = (
  id: string,
  type: string,
  value: SinkAnswer["value"],
  label = id
): SinkAnswer => ({
  id,
  label,
  type,
  value,
  text:
    typeof value === "boolean"
      ? value
        ? "Yes"
        : "No"
      : Array.isArray(value)
        ? value.join(", ")
        : String(value),
});

const response = (
  n: number,
  answers: SinkAnswer[] = [
    answer("f_email", "email", "ada@example.com", "Email"),
  ]
): SinkFormResponse => ({
  id: `resp_${n}`,
  createdAt: `2026-11-25T10:0${n}:00.000Z`,
  pageId: "page_1",
  pageTitle: "Spring menu",
  formId: "form_1",
  codeSlug: "aB3dE5f",
  answers,
});

const batchOf = (call: { body?: string } | undefined) =>
  (bodyOf(call as never) as { batch: SegmentTrackEvent[]; sentAt: string })
    .batch;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SegmentClient", () => {
  it("posts a batch with the write key as the Basic auth username", async () => {
    const { calls } = mockFetch(json({ success: true }));
    const client = createSegmentClient(KEY);
    const sentAt = new Date("2026-11-25T12:00:00.000Z");
    await client.batch([testTrackEvent("t1", sentAt)], sentAt);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("https://api.segment.io/v1/batch");
    expect(calls[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from(`${KEY}:`).toString("base64")}`
    );
    expect(calls[0]?.headers["content-type"]).toBe("application/json");
    const body = bodyOf(calls[0]) as Record<string, unknown>;
    expect(body.sentAt).toBe(sentAt.toISOString());
    // The key only travels in the header
    expect(calls[0]?.body).not.toContain(KEY);
  });

  it("sends to the EU endpoint for an EU workspace", async () => {
    const { calls } = mockFetch(json({ success: true }));
    await createSegmentClient(KEY, "eu").batch([]);
    expect(calls[0]?.url).toBe("https://events.eu1.segmentapis.com/v1/batch");
    expect(SEGMENT_ENDPOINTS.us).toBe("https://api.segment.io/v1");
  });

  it("refuses a batch over Segment's limits before sending", async () => {
    const { calls } = mockFetch();
    const client = new SegmentClient(KEY);
    const many = Array.from({ length: SEGMENT_MAX_BATCH_EVENTS + 1 }, (_, i) =>
      testTrackEvent(String(i), new Date())
    );
    await expect(client.batch(many)).rejects.toBeInstanceOf(RangeError);
    const big = Array.from({ length: 20 }, (_, i) => ({
      ...testTrackEvent(String(i), new Date()),
      properties: { blob: "x".repeat(30_000) },
    }));
    await expect(client.batch(big)).rejects.toBeInstanceOf(RangeError);
    expect(calls).toHaveLength(0);
  });

  it.each([
    [400, "bad_request", false],
    [429, "rate_limited", true],
    [500, "server", true],
    [503, "server", true],
  ] as const)(
    "turns HTTP %i into %s without the key or the body in the message",
    async (status, code, retryable) => {
      mockFetch(
        json(
          { message: "Rejected: ada@example.com said hello" },
          status,
          status === 429 ? { "retry-after": "30" } : {}
        )
      );
      const error = await createSegmentClient(KEY)
        .batch([])
        .catch((caught: unknown) => caught);
      expect(isIntegrationApiError(error)).toBe(true);
      const apiError = error as IntegrationApiError;
      expect(apiError.code).toBe(code);
      expect(apiError.message).not.toContain(KEY);
      expect(apiError.message).not.toContain("ada@example.com");
      expect(isRetryableSyncError(apiError)).toBe(retryable);
      if (status === 429) expect(apiError.retryAfterSeconds).toBe(30);
    }
  );

  it("reports a network failure as retryable", async () => {
    mockFetch(networkError());
    const error = await createSegmentClient(KEY)
      .batch([])
      .catch((caught: unknown) => caught);
    expect((error as IntegrationApiError).code).toBe("network");
    expect(isRetryableSyncError(error)).toBe(true);
  });
});

describe("checking a pasted write key", () => {
  it("checks the format, then that Segment answers, with an empty batch", async () => {
    const { calls } = mockFetch(json({ success: true }));
    await expect(verifySegmentWriteKey(KEY)).resolves.toEqual({});
    expect(calls).toHaveLength(1);
    expect(bodyOf(calls[0])).toMatchObject({ batch: [] });
  });

  it("makes no call where calls to connected tools are off", async () => {
    const { calls } = mockFetch();
    await verifySegmentWriteKey(KEY, { reachOut: false });
    expect(calls).toHaveLength(0);
  });

  it.each([
    "short",
    "has spaces in it, which keys never do",
    "x".repeat(65),
    "wk_with:colon_aaaaaaaaaaaaaaaaaa",
  ])("refuses %j without calling Segment or quoting it", async (bad) => {
    const { calls } = mockFetch();
    const error = await verifySegmentWriteKey(bad).catch(
      (caught: unknown) => caught
    );
    expect((error as IntegrationApiError).code).toBe("bad_request");
    expect((error as Error).message).not.toContain(bad);
    expect(calls).toHaveLength(0);
  });
});

describe("scans as Track calls", () => {
  it("carries the code, place, device, variant and source, at the scan's time", () => {
    const event = scanTrackEvent(scan(1), OPTIONS);
    expect(event).toEqual({
      type: "track",
      event: "QR Code Scanned",
      anonymousId: "qrdx-code-code_1",
      messageId: `qrdx-scan-scan_1-${CONNECTION.slice(0, 8)}`,
      timestamp: "2026-11-25T09:01:00.000Z",
      properties: {
        scan_id: "scan_1",
        code_id: "code_1",
        code_slug: "aB3dE5f",
        code_title: "Spring menu",
        source: "qr",
        country: "DE",
        region: "BE",
        city: "Berlin",
        device_type: "mobile",
        os: "iOS",
        browser: "Safari",
        referrer: "instagram.com",
        language: "de-de",
        variant: "rule_1:var_b",
      },
      context: { library: { name: "qrdx", version: "1" } },
    });
  });

  it("leaves out what QRdx doesn't have, and calls an old scan a QR scan", () => {
    const event = scanTrackEvent(
      scan(1, {
        city: null,
        referer: null,
        variant: null,
        region: undefined,
        source: null,
        code: { id: "code_1", slug: "aB3dE5f", title: null },
      }),
      OPTIONS
    );
    expect(event.properties).not.toHaveProperty("city");
    expect(event.properties).not.toHaveProperty("referrer");
    expect(event.properties).not.toHaveProperty("variant");
    expect(event.properties).not.toHaveProperty("region");
    expect(event.properties).not.toHaveProperty("code_title");
    expect(event.properties.source).toBe("qr");
    expect(
      scanTrackEvent(scan(2, { source: "nfc" }), OPTIONS).properties.source
    ).toBe("nfc");
  });

  it("never carries an IP address, a visitor hash or a precise location", () => {
    // Even when a row has more than the scan pipeline's fields
    const raw = {
      ...scan(1),
      ip: "203.0.113.9",
      visitorHash: "abc123",
      latitude: 52.52,
      longitude: 13.405,
    } as SinkScan;
    const text = JSON.stringify(scanTrackEvent(raw, OPTIONS));
    expect(text).not.toContain("203.0.113.9");
    expect(text).not.toContain("abc123");
    expect(text).not.toMatch(/"ip"|visitor|latitude|longitude/i);
  });
});

describe("messageId", () => {
  it("is the same for the same item and connection, so a retry isn't counted twice", () => {
    expect(scanTrackEvent(scan(1), OPTIONS).messageId).toBe(
      scanTrackEvent(scan(1), OPTIONS).messageId
    );
    expect(responseTrackEvent(response(1), OPTIONS).messageId).toBe(
      `qrdx-response-resp_1-${CONNECTION.slice(0, 8)}`
    );
  });

  it("differs between connections, since Segment dedupes across workspaces", () => {
    expect(segmentMessageId("scan", "scan_1", "aaaaaaaa-1")).not.toBe(
      segmentMessageId("scan", "scan_1", "bbbbbbbb-1")
    );
    expect(segmentMessageId("scan", "scan_1", CONNECTION)).not.toBe(
      segmentMessageId("response", "scan_1", CONNECTION)
    );
  });

  it("stays under Segment's 100 characters", () => {
    expect(
      segmentMessageId("response", "r".repeat(300), CONNECTION).length
    ).toBeLessThan(100);
  });
});

describe("form responses as Track calls", () => {
  it("carries the page, the form and the answers, keyed by label", () => {
    const event = responseTrackEvent(
      response(1, [
        answer("f_email", "email", "ada@example.com", "Email"),
        answer("f_rate", "stars", 4, "How was it?"),
        answer("f_ok", "consent", true, "Keep me posted"),
        answer("f_pick", "choice", ["Lunch", "Dinner"], "Which menus?"),
      ]),
      { event: "Form Submitted", connectionId: CONNECTION }
    );
    expect(event).toMatchObject({
      type: "track",
      event: "Form Submitted",
      anonymousId: "qrdx-page-page_1",
      timestamp: "2026-11-25T10:01:00.000Z",
      properties: {
        response_id: "resp_1",
        page_id: "page_1",
        page_title: "Spring menu",
        form_id: "form_1",
        code_slug: "aB3dE5f",
        answers: {
          Email: "ada@example.com",
          "How was it?": 4,
          "Keep me posted": true,
          "Which menus?": "Lunch, Dinner",
        },
      },
    });
  });

  it("skips unanswered questions and tells same-label questions apart", () => {
    expect(
      segmentAnswers([
        answer("f_a", "text", "Ada", "Name"),
        answer("f_b", "text", "Lovelace", "Name"),
        answer("f_c", "text", "   ", "Comments"),
        answer("f_d", "text", "Hi", "  "),
      ])
    ).toEqual({ "Name (f_a)": "Ada", "Name (f_b)": "Lovelace", f_d: "Hi" });
  });

  it("shortens answers to 1,000 characters", () => {
    const answers = segmentAnswers([answer("f_m", "text", "y".repeat(5000))]);
    expect(answers.f_m).toHaveLength(1000);
  });

  it("shortens long answers further to fit 32 KB, or skips the response", () => {
    const long = Array.from({ length: 60 }, (_, i) =>
      answer(`f_${i}`, "text", "z".repeat(1000), `Question ${i}`)
    );
    const fitted = fittedResponseEvent(response(1, long), OPTIONS);
    expect(fitted).not.toBeNull();
    expect(jsonBytes(fitted)).toBeLessThanOrEqual(SEGMENT_MAX_EVENT_BYTES);
    const answers = (fitted?.properties.answers ?? {}) as Record<
      string,
      string
    >;
    expect(answers["Question 0"]).toHaveLength(200);

    const huge = Array.from({ length: 400 }, (_, i) =>
      answer(`f_${i}`, "text", "z".repeat(1000), `Question ${i}`)
    );
    expect(fittedResponseEvent(response(2, huge), OPTIONS)).toBeNull();
  });
});

describe("segmentBatches", () => {
  const event = (n: number, bytes = 0) => ({
    ...scanTrackEvent(scan(1, { id: `scan_${n}` }), OPTIONS),
    properties: bytes ? { blob: "x".repeat(bytes) } : { n },
  });

  it("keeps a small batch in one request", () => {
    const events = [event(1), event(2), event(3)];
    expect(segmentBatches(events)).toEqual([events]);
    expect(segmentBatches([])).toEqual([]);
  });

  it("splits at 500 KB, every request within the limit with its envelope", () => {
    const events = Array.from({ length: 40 }, (_, i) => event(i, 30_000));
    const batches = segmentBatches(events);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flat()).toEqual(events);
    for (const batch of batches) {
      const body = {
        batch,
        sentAt: new Date().toISOString(),
      };
      expect(jsonBytes(body)).toBeLessThanOrEqual(SEGMENT_MAX_BATCH_BYTES);
    }
  });

  it("splits at 2,500 calls", () => {
    // Small enough that 2,500 stay well under 500 KB
    const events = Array.from(
      { length: 2600 },
      (_, i): SegmentTrackEvent => ({
        type: "track",
        event: "e",
        anonymousId: "a",
        messageId: String(i),
        timestamp: "t",
        properties: {},
        context: { library: { name: "qrdx", version: "1" } },
      })
    );
    const batches = segmentBatches(events);
    expect(batches.map((batch) => batch.length)).toEqual([2500, 100]);
  });
});

describe("sendScansToSegment", () => {
  it("sends a batch in one request and moves the cursor to its last scan", async () => {
    const { calls } = mockFetch(json({ success: true }));
    const result = await sendScansToSegment(
      createSegmentClient(KEY),
      [scan(1), scan(2), scan(3)],
      OPTIONS
    );
    expect(calls).toHaveLength(1);
    expect(batchOf(calls[0]).map((e) => e.properties.scan_id)).toEqual([
      "scan_1",
      "scan_2",
      "scan_3",
    ]);
    expect(batchOf(calls[0]).every((e) => e.event === "QR Code Scanned")).toBe(
      true
    );
    expect(result).toEqual({
      delivered: 3,
      skipped: 0,
      cursor: { at: "2026-11-25T09:03:00.000Z", id: "scan_3" },
    });
  });

  it("sends a scan read twice only once", async () => {
    const { calls } = mockFetch(json({ success: true }));
    const result = await sendScansToSegment(
      createSegmentClient(KEY),
      [scan(1), scan(1), scan(2)],
      OPTIONS
    );
    expect(batchOf(calls[0])).toHaveLength(2);
    expect(result).toMatchObject({ delivered: 2, skipped: 1 });
  });

  it("sends nothing for an empty batch", async () => {
    const { calls } = mockFetch();
    const result = await sendScansToSegment(
      createSegmentClient(KEY),
      [],
      OPTIONS
    );
    expect(calls).toHaveLength(0);
    expect(result).toEqual({ delivered: 0, skipped: 0, cursor: null });
  });

  it("fails the whole batch when a request fails, and a retry sends the same messageIds", async () => {
    const scans = [scan(1), scan(2)];
    mockFetch(json({}, 503));
    await expect(
      sendScansToSegment(createSegmentClient(KEY), scans, OPTIONS)
    ).rejects.toMatchObject({ code: "server" });

    // The worker's backoff: retrying, cursor kept
    const state = initialSyncState(null);
    const failed = nextSyncState(state, {
      ok: false,
      error: new IntegrationApiError({
        provider: "segment",
        status: 503,
        code: "server",
        message: "Segment had a server error.",
      }),
    });
    expect(failed.status).toBe("retrying");
    expect(failed.cursor).toEqual(state.cursor);

    const { calls } = mockFetch(json({ success: true }));
    await sendScansToSegment(createSegmentClient(KEY), scans, OPTIONS);
    expect(batchOf(calls[0]).map((e) => e.messageId)).toEqual(
      scans.map((s) => scanTrackEvent(s, OPTIONS).messageId)
    );
  });
});

describe("sendResponsesToSegment", () => {
  it("sends responses with the response event name", async () => {
    const { calls } = mockFetch(json({ success: true }));
    const result = await sendResponsesToSegment(
      createSegmentClient(KEY, "eu"),
      [response(1), response(2)],
      { event: "Lead Captured", connectionId: CONNECTION }
    );
    expect(calls[0]?.url).toBe("https://events.eu1.segmentapis.com/v1/batch");
    expect(batchOf(calls[0]).map((e) => e.event)).toEqual([
      "Lead Captured",
      "Lead Captured",
    ]);
    expect(result).toEqual({
      delivered: 2,
      skipped: 0,
      cursor: { at: "2026-11-25T10:02:00.000Z", id: "resp_2" },
    });
  });

  it("skips a response too big for Segment, and still moves past it", async () => {
    const huge = Array.from({ length: 400 }, (_, i) =>
      answer(`f_${i}`, "text", "z".repeat(1000), `Question ${i}`)
    );
    const { calls } = mockFetch(json({ success: true }));
    const result = await sendResponsesToSegment(
      createSegmentClient(KEY),
      [response(1), response(2, huge)],
      OPTIONS
    );
    expect(batchOf(calls[0]).map((e) => e.properties.response_id)).toEqual([
      "resp_1",
    ]);
    expect(result).toEqual({
      delivered: 1,
      skipped: 1,
      cursor: { at: "2026-11-25T10:02:00.000Z", id: "resp_2" },
    });
  });
});

describe("the test event", () => {
  it("is one call named QRdx Test Event", async () => {
    const { calls } = mockFetch(json({ success: true }));
    const now = new Date("2026-11-25T12:00:00.000Z");
    await sendSegmentTestEvent(createSegmentClient(KEY), "abc", now);
    expect(batchOf(calls[0])).toEqual([
      {
        type: "track",
        event: "QRdx Test Event",
        anonymousId: "qrdx-test",
        messageId: "qrdx-test-abc",
        timestamp: now.toISOString(),
        properties: { source: "QRdx" },
        context: { library: { name: "qrdx", version: "1" } },
      },
    ]);
  });
});

describe("Segment settings", () => {
  it("falls back to the US region and the default event names", () => {
    expect(readSegmentSettings(undefined)).toEqual({
      region: "us",
      scanEvent: SEGMENT_DEFAULT_EVENTS.scans,
      responseEvent: SEGMENT_DEFAULT_EVENTS.responses,
    });
    expect(
      readSegmentSettings({
        region: "eu",
        scanEvent: "  Scan  ",
        responseEvent: "",
      })
    ).toEqual({
      region: "eu",
      scanEvent: "Scan",
      responseEvent: SEGMENT_DEFAULT_EVENTS.responses,
    });
    expect(readSegmentSettings({ region: "apac" }).region).toBe("us");
  });

  it("takes event names of 1 to 200 characters without control characters", () => {
    expect(normalizeSegmentEventName(" Menu Scanned ")).toBe("Menu Scanned");
    expect(normalizeSegmentEventName("")).toBeNull();
    expect(normalizeSegmentEventName("x".repeat(201))).toBeNull();
    expect(normalizeSegmentEventName("Bad\nname")).toBeNull();
    expect(normalizeSegmentEventName(42)).toBeNull();
  });
});

describe("Segment as a data-out integration", () => {
  it("has two streams with their own state keys; the others keep metadata.sync", () => {
    expect(SINK_PROVIDERS).toContain("segment");
    expect(SINK_STREAMS.segment).toEqual([
      { stream: "scans", key: "scansSync" },
      { stream: "responses", key: "responsesSync" },
    ]);
    expect(sinkStreamSlot("segment", "responses")?.key).toBe("responsesSync");
    expect(sinkStreamSlot("hubspot", "scans")).toBeUndefined();
    for (const provider of SINK_PROVIDERS) {
      const keys = SINK_STREAMS[provider].map((slot) => slot.key);
      expect(new Set(keys).size, provider).toBe(keys.length);
      for (const key of keys) expect(SYNC_STATE_KEYS).toContain(key);
      if (provider !== "segment") expect(keys).toEqual(["sync"]);
    }
  });

  it("connects with a write key that QRdx can only check the format of", () => {
    registerAllIntegrations();
    const definition = getIntegrationRegistry().get("segment");
    expect(definition?.type).toBe("api_key");
    expect(definition?.apiKey?.check).toBe("format");
    expect(definition?.oauth).toBeUndefined();
  });

  it("has setup steps in the catalogue, and no logo (Twilio asks for written permission)", () => {
    const entry = getCatalogEntry("segment");
    expect(entry?.surface).toBe("integrations");
    expect(entry?.kind).toBe("connect");
    expect(entry?.steps.length).toBeGreaterThanOrEqual(3);
    expect(entry?.steps.map((step) => step.title)).toContain(
      "Send a test event"
    );
    expect(entry?.logo.type).toBe("feature");
  });
});
