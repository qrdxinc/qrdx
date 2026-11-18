// Fixtures follow Uniqode's API reference (https://apidocs.uniqode.com): the
// QRCode and Campaign objects and the paginated list (count, next, previous,
// results). The reference has no example responses and QRdx has no Uniqode
// account, so none of this was checked against the live API. The 401 body is
// the one api.uniqode.com returns to a bad token; the 403 and 429 bodies are
// Django REST framework's defaults (its responses carry `detail`).
import { describe, expect, it } from "vitest";
import { verifyMigrationSourceCredentials } from "../src/capabilities/factory";
import type { IntegrationApiError } from "../src/core/http-client";
import {
  createUniqodeClient,
  uniqodeWebsiteDestination,
} from "../src/integrations/uniqode/client";
import type { UniqodeQrCode } from "../src/integrations/uniqode/types";
import { bodyOf, json, mockFetch, networkError } from "./helpers";

const KEY = "uq-key-123";
const LIST = "https://api.uniqode.com/api/2.0/qrcodes/";

const CODE: UniqodeQrCode = {
  id: 4_100_001,
  name: "Spring menu",
  qr_type: 2,
  organization: 15_406,
  url: "https://qrcodes.pro/AbC123",
  state: "A",
  tag_data: [{ id: 859, name: "print" }],
  campaign: {
    id: 77,
    name: "Spring menu",
    content_type: 1,
    custom_url: "https://acme.test/menu",
  },
  created: "2025-03-02T10:00:00Z",
  updated: "2026-01-04T08:00:00Z",
};

const PDF_CODE: UniqodeQrCode = {
  ...CODE,
  id: 4_100_002,
  name: "Brochure",
  campaign: { id: 78, content_type: 13 },
};

const page = (
  results: unknown[],
  next: string | null = null,
  count = results.length
) => json({ count, next, previous: null, results });

/** Records waits instead of sleeping. */
function fakeSleep() {
  const waits: number[] = [];
  return {
    waits,
    sleep: (ms: number) => {
      waits.push(ms);
      return Promise.resolve();
    },
  };
}

const client = (sleep = fakeSleep().sleep) =>
  createUniqodeClient(KEY, { minIntervalMs: 0, sleep });

describe("UniqodeClient", () => {
  it("authenticates with Token and lists dynamic website codes", async () => {
    const { calls } = mockFetch(
      page(
        [CODE],
        `${LIST}?campaign__content_type=1&page=2&page_size=50&qr_type=2`,
        120
      )
    );
    const result = await client().listQrCodes({ pageSize: 50 });

    expect(calls[0]?.headers.authorization).toBe(`Token ${KEY}`);
    const url = new URL(calls[0]?.url ?? "");
    expect(`${url.origin}${url.pathname}`).toBe(LIST);
    expect(url.searchParams.get("qr_type")).toBe("2");
    expect(url.searchParams.get("campaign__content_type")).toBe("1");
    expect(url.searchParams.get("page_size")).toBe("50");
    expect(result.codes).toEqual([CODE]);
    expect(result.count).toBe(120);
    // Only the query string of `next`, never the address itself.
    expect(result.nextCursor).toBe(
      "campaign__content_type=1&page=2&page_size=50&qr_type=2"
    );
  });

  it("follows the cursor and keeps the type filters", async () => {
    const { calls } = mockFetch(page([CODE]));
    const result = await client().listQrCodes({
      cursor: "page=3&qr_type=1&page_size=50",
    });
    const url = new URL(calls[0]?.url ?? "");
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("qr_type")).toBe("2");
    expect(url.searchParams.get("campaign__content_type")).toBe("1");
    expect(result.nextCursor).toBeUndefined();
  });

  it("ends the list when `next` points anywhere but Uniqode's list", async () => {
    mockFetch(page([CODE], "https://evil.test/api/2.0/qrcodes/?page=2"));
    expect((await client().listQrCodes()).nextCursor).toBeUndefined();
    // Django behind a proxy can say http://; the host and path still match.
    mockFetch(page([CODE], "http://api.uniqode.com/api/2.0/qrcodes/?page=2"));
    expect((await client().listQrCodes()).nextCursor).toBe("page=2");
  });

  it("reads a bare array as one page", async () => {
    mockFetch(json([CODE]));
    const result = await client().listQrCodes();
    expect(result.codes).toHaveLength(1);
    expect(result.nextCursor).toBeUndefined();
  });

  it("says plainly when the list has a shape it doesn't know", async () => {
    mockFetch(json({ data: [CODE] }));
    const error = (await client()
      .listQrCodes()
      .catch((e: unknown) => e)) as IntegrationApiError;
    expect(error.code).toBe("bad_request");
    expect(error.body).toBeUndefined();
    expect(error.message).toMatch(/doesn't recognize.*CSV/);

    mockFetch(page([{ uuid: "x", link: "y" }]));
    await expect(client().listQrCodes()).rejects.toMatchObject({
      code: "bad_request",
    });
  });

  it("tells website codes from other kinds", () => {
    expect(uniqodeWebsiteDestination(CODE)).toBe("https://acme.test/menu");
    expect(uniqodeWebsiteDestination(PDF_CODE)).toBeNull();
    expect(uniqodeWebsiteDestination({ ...CODE, qr_type: 1 })).toBeNull();
    expect(
      uniqodeWebsiteDestination({
        ...CODE,
        campaign: { content_type: 1, custom_url: " " },
      })
    ).toBeNull();
  });

  it("updates a destination with the documented body", async () => {
    const { calls } = mockFetch(
      json(CODE),
      json({
        ...CODE,
        campaign: { ...CODE.campaign, custom_url: "https://qrdx.dev/q/abc" },
      })
    );
    await client().updateDestination("4100001", "https://qrdx.dev/q/abc");

    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(`${LIST}4100001/`);
    expect(calls[1]?.method).toBe("PUT");
    expect(calls[1]?.url).toBe(`${LIST}4100001/`);
    expect(calls[1]?.headers["content-type"]).toBe("application/json");
    expect(bodyOf(calls[1])).toEqual({
      name: "Spring menu",
      qr_type: 2,
      organization: 15_406,
      campaign: { content_type: 1, custom_url: "https://qrdx.dev/q/abc" },
    });
  });

  it("skips the read when the caller just read the code", async () => {
    const { calls } = mockFetch(json(CODE));
    await client().updateDestination("4100001", "https://qrdx.dev/q/abc", CODE);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("PUT");
  });

  it("leaves codes that aren't website codes unchanged", async () => {
    const { calls } = mockFetch(json(PDF_CODE));
    const error = (await client()
      .updateDestination("4100002", "https://qrdx.dev/q/abc")
      .catch((e: unknown) => e)) as IntegrationApiError;
    expect(error.message).toMatch(/isn't a dynamic website code/);
    expect(error.body).toBeUndefined();
    expect(calls.map((call) => call.method)).toEqual(["GET"]);
  });

  it("refuses ids that aren't Uniqode's numbers without calling it", async () => {
    const { calls } = mockFetch();
    await expect(client().getQrCode("../users")).rejects.toMatchObject({
      code: "bad_request",
    });
    expect(calls).toHaveLength(0);
  });

  it("keeps Uniqode's reason when it rejects a value", async () => {
    mockFetch(
      json(CODE),
      json({ campaign: { custom_url: ["Enter a valid URL."] } }, 400)
    );
    const error = (await client()
      .updateDestination("4100001", "https://qrdx.dev/q/abc")
      .catch((e: unknown) => e)) as IntegrationApiError;
    expect(error.status).toBe(400);
    expect(error.body).toBeDefined();
  });

  it.each([
    [401, { detail: "Invalid token" }, "unauthorized"],
    [
      403,
      { detail: "You do not have permission to perform this action." },
      "forbidden",
    ],
    [404, { detail: "Not found." }, "not_found"],
    [500, "<html>Server Error</html>", "server"],
  ] as const)("maps %i to %s", async (status, body, code) => {
    mockFetch(json(body, status));
    await expect(client().getQrCode("4100001")).rejects.toMatchObject({
      code,
      provider: "uniqode",
      status,
    });
  });

  it("waits once on a short 429, then tries again", async () => {
    const { waits, sleep } = fakeSleep();
    const throttled = () =>
      json(
        { detail: "Request was throttled. Expected available in 1 second." },
        429,
        { "retry-after": "1" }
      );
    const { calls } = mockFetch(throttled(), json(CODE));
    await client(sleep).getQrCode("4100001");
    expect(waits).toEqual([1000]);
    expect(calls).toHaveLength(2);

    // A second 429 in a row goes back to the caller.
    mockFetch(throttled(), throttled());
    await expect(client(sleep).getQrCode("4100001")).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("doesn't sit out a long 429", async () => {
    const { waits, sleep } = fakeSleep();
    const { calls } = mockFetch(
      json({ detail: "Request was throttled." }, 429, { "retry-after": "60" })
    );
    await expect(client(sleep).getQrCode("4100001")).rejects.toMatchObject({
      code: "rate_limited",
      retryAfterSeconds: 60,
    });
    expect(waits).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("spaces requests to stay under 10 a second", async () => {
    const { waits, sleep } = fakeSleep();
    mockFetch(json(CODE), json(CODE));
    const paced = createUniqodeClient(KEY, { sleep });
    await paced.getQrCode("4100001");
    await paced.getQrCode("4100001");
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThan(100);
    expect(waits[0]).toBeLessThanOrEqual(150);
  });

  it("maps network failures", async () => {
    mockFetch(networkError());
    await expect(client().listQrCodes()).rejects.toMatchObject({
      code: "network",
    });
  });
});

describe("connecting Uniqode", () => {
  it("checks the key by listing one code and keeps the count", async () => {
    const { calls } = mockFetch(page([CODE], null, 42));
    const metadata = await verifyMigrationSourceCredentials("uniqode", KEY);
    expect(new URL(calls[0]?.url ?? "").searchParams.get("page_size")).toBe(
      "1"
    );
    expect(metadata).toEqual({ codeCount: 42 });
  });

  it("explains a plan or role without API access", async () => {
    mockFetch(
      json(
        { detail: "You do not have permission to perform this action." },
        403
      )
    );
    await expect(
      verifyMigrationSourceCredentials("uniqode", KEY)
    ).rejects.toMatchObject({
      code: "upgrade_required",
      message: expect.stringMatching(/Core plan and above/),
    });
  });

  it("passes a rejected key through as unauthorized", async () => {
    mockFetch(json({ detail: "Invalid token" }, 401));
    await expect(
      verifyMigrationSourceCredentials("uniqode", KEY)
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
});
