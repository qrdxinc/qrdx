import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchDataAccountMetadata,
  revokeDataProviderToken,
} from "../src/capabilities/data-factory";
import type { IntegrationApiError } from "../src/core/http-client";
import { createOAuthHandler } from "../src/core/oauth";
import {
  createPipedriveClient,
  PIPEDRIVE_MAX_SEARCH_TERM,
  PIPEDRIVE_REVOKE_URL,
  parsePipedriveApiDomain,
  revokePipedriveToken,
} from "../src/integrations/pipedrive/client";
import {
  PIPEDRIVE_SEARCH_SPACING_MS,
  type PipedriveSettings,
  pipedrivePeople,
  syncResponsesToPipedrive,
} from "../src/integrations/pipedrive/sink";
import {
  getIntegrationConfigWithEnv,
  registerAllIntegrations,
} from "../src/registry/loader";
import {
  initialSyncState,
  isRetryableSyncError,
  nextSyncState,
  ONE_BY_ONE_BATCH_SIZE,
  resumeSyncState,
  SYNC_BATCH_SIZE,
  syncBatchSize,
} from "../src/sinks/state";
import type { SinkFormResponse } from "../src/sinks/types";
import { SINK_PROVIDERS, SINK_STREAMS } from "../src/sinks/types";
import {
  bodyOf,
  json,
  mockFetch,
  networkError,
  type RecordedCall,
} from "./helpers";

// The response bodies below follow the examples and schemas in Pipedrive's
// OpenAPI files (openapi-v2.yaml for persons and search, openapi.yaml for
// leads), checked against a real developer sandbox: the search, new-person,
// person and new-lead shapes matched. The sandbox also showed that Pipedrive
// replaces the origin_id an OAuth app sends on a lead with the app's client id
// (origin "Marketplace"), which is why leads are de-duplicated by QRdx's own
// record rather than by reading them back. Ids and emails here are fake.

const DOMAIN = "https://acme.pipedrive.com";
const TOKEN = "pd-access-token";
const CLIENT_ID = "0123456789abcdef";

const search = (...ids: number[]) =>
  json({
    success: true,
    data: {
      items: ids.map((id) => ({
        result_score: 1,
        item: { id, type: "person", name: `Person ${id}` },
      })),
    },
    additional_data: { next_cursor: null },
  });
const created = (id: number) => json({ success: true, data: { id } });
const person = (phones: Array<{ value: string; primary: boolean }> = []) =>
  json({ success: true, data: { id: 7, phones } });
const updated = () => json({ success: true, data: { id: 7 } });
/** POST /v1/leads as an OAuth app gets it back: origin_id is the client id. */
const leadCreated = () =>
  json(
    {
      success: true,
      data: {
        id: "8918aea0-e806-11f1-9c6d-875f879429ab",
        title: "Form response",
        person_id: 7,
        source_name: "API",
        origin: "Marketplace",
        origin_id: CLIENT_ID,
      },
    },
    201
  );
const isLeadPost = (call: RecordedCall) =>
  call.method === "POST" && call.url.endsWith("/api/v1/leads");
const leadTitles = (calls: RecordedCall[]) =>
  calls
    .filter(isLeadPost)
    .map((call) => (bodyOf(call) as { title: string }).title);
/** A stand-in for the worker's record of leads made (metadata.pipedriveLeadsMade). */
function leadRecord(made: string[] = []) {
  const recorded: string[] = [];
  const leadsMade = new Set(made);
  return {
    recorded,
    leadsMade,
    onLeadCreated: (responseId: string) => {
      recorded.push(responseId);
      leadsMade.add(responseId);
      return Promise.resolve();
    },
  };
}

const answer = (
  id: string,
  type: string,
  value: string | boolean | number,
  label = id
) => ({
  id,
  label,
  type,
  value,
  text: typeof value === "boolean" ? (value ? "Yes" : "No") : String(value),
});

const response = (
  id: string,
  answers: SinkFormResponse["answers"],
  { pageId = "p1", pageTitle = "Spring" as string | null } = {}
): SinkFormResponse => ({
  id,
  createdAt: `2026-10-31T10:00:0${id.slice(-1)}.000Z`,
  pageId,
  pageTitle,
  formId: "f1",
  codeSlug: "aB3dE5f",
  answers,
});

const ada = (id = "r1", extra: SinkFormResponse["answers"] = []) =>
  response(id, [
    answer("e", "email", "Ada@Example.com", "Email"),
    answer("n", "text", "Ada Lovelace", "Your name"),
    ...extra,
  ]);

const settings: PipedriveSettings = { pageIds: null, forms: {} };
const noWait = () => Promise.resolve();
const client = () => createPipedriveClient(TOKEN, DOMAIN);

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as IntegrationApiError;
  }
  throw new Error("expected a rejection");
}

describe("Pipedrive account address", () => {
  it("accepts a company address on pipedrive.com, as an origin", () => {
    expect(parsePipedriveApiDomain("https://acme.pipedrive.com")).toBe(DOMAIN);
    expect(parsePipedriveApiDomain("https://acme.pipedrive.com/")).toBe(DOMAIN);
    expect(parsePipedriveApiDomain("https://acme-sandbox.pipedrive.com")).toBe(
      "https://acme-sandbox.pipedrive.com"
    );
  });

  it.each([
    ["not https", "http://acme.pipedrive.com"],
    ["another domain", "https://acme.example.com"],
    ["a lookalike suffix", "https://acme.pipedrive.com.evil.example"],
    ["a lookalike prefix", "https://acme.evilpipedrive.com"],
    ["a nested host", "https://a.b.pipedrive.com"],
    ["no company", "https://pipedrive.com"],
    ["credentials", "https://user:pw@acme.pipedrive.com"],
    ["a port", "https://acme.pipedrive.com:8443"],
    ["a path", "https://acme.pipedrive.com/api"],
    ["a query", "https://acme.pipedrive.com/?x=1"],
    ["a fragment", "https://acme.pipedrive.com/#x"],
    ["a backslash trick", "https://evil.example\\@acme.pipedrive.com"],
    ["not a URL", "acme.pipedrive.com"],
    ["empty", ""],
  ])("refuses %s", (_name, value) => {
    expect(parsePipedriveApiDomain(value)).toBeNull();
  });

  it.each([undefined, null, 5, {}, []])(
    "refuses a non-string (%j)",
    (value) => {
      expect(parsePipedriveApiDomain(value)).toBeNull();
    }
  );

  it("builds no client for a bad address, and sends nothing", () => {
    const { fn } = mockFetch();
    expect(() => createPipedriveClient(TOKEN, "https://evil.example")).toThrow(
      /Reconnect Pipedrive/
    );
    expect(() => createPipedriveClient(TOKEN, "")).toThrow(/Reconnect/);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("Pipedrive client", () => {
  it("searches persons by exact email and returns the oldest match", async () => {
    const { calls } = mockFetch(search(42, 9, 17));
    expect(await client().findPersonByEmail("a+b@example.com")).toBe(9);
    const url = new URL(calls[0]?.url ?? "");
    expect(url.origin).toBe(DOMAIN);
    expect(url.pathname).toBe("/api/v2/persons/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      term: "a+b@example.com",
      fields: "email",
      exact_match: "true",
      limit: "10",
    });
    // "+" is sent encoded, so it isn't read as a space
    expect(calls[0]?.url).toContain("a%2Bb%40example.com");
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]?.method).toBe("GET");
  });

  it("returns null when nobody has the email", async () => {
    mockFetch(search());
    expect(await client().findPersonByEmail("none@example.com")).toBeNull();
  });

  it.each([
    ["success false", json({ success: false, data: null })],
    ["no data", json({ success: true })],
    ["no items", json({ success: true, data: {} })],
    ["items not a list", json({ success: true, data: { items: {} } })],
    [
      "an item without an id",
      json({ success: true, data: { items: [{ item: {} }] } }),
    ],
    [
      "a text id",
      json({ success: true, data: { items: [{ item: { id: "9" } }] } }),
    ],
    ["not JSON", new Response("<html>", { status: 200 })],
  ])(
    "fails loudly on a search answer with %s, and retries it later",
    async (_name, answerBody) => {
      mockFetch(answerBody);
      const error = await rejection(client().findPersonByEmail("a@b.co"));
      // Not "the request was rejected": nothing QRdx sent was refused, so the
      // stream retries with backoff instead of failing for good.
      expect(error.code).toBe("server");
      expect(error.status).toBe(200);
      expect(isRetryableSyncError(error)).toBe(true);
      expect(
        nextSyncState(initialSyncState(null), { ok: false, error }).status
      ).toBe("retrying");
    }
  );

  it("reads a person's phones as Pipedrive lists them", async () => {
    mockFetch(
      json({
        success: true,
        data: {
          id: 7,
          phones: [
            { value: "+49 30 123", primary: true, label: "work" },
            { value: "0170 555", primary: false },
          ],
        },
      })
    );
    expect(await client().getPersonPhones(7)).toEqual([
      { value: "+49 30 123", primary: true, label: "work" },
      { value: "0170 555", primary: false },
    ]);
  });

  it("never guesses a person's phones: a missing list is an error", async () => {
    mockFetch(json({ success: true, data: { id: 7 } }));
    const error = await rejection(client().getPersonPhones(7));
    expect(error.code).toBe("server");
    expect(error.message).not.toContain("acme");
  });

  it("creates a person with the email as primary", async () => {
    const { calls } = mockFetch(created(31));
    const id = await client().createPerson({
      name: "Ada Lovelace",
      email: "ada@example.com",
      phones: ["+49 30 123", "0170 555"],
    });
    expect(id).toBe(31);
    expect(calls[0]?.url).toBe(`${DOMAIN}/api/v2/persons`);
    expect(calls[0]?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({
      name: "Ada Lovelace",
      emails: [{ value: "ada@example.com", primary: true }],
      phones: [
        { value: "+49 30 123", primary: true },
        { value: "0170 555", primary: false },
      ],
    });
  });

  it("sends no phones for a person that has none", async () => {
    const { calls } = mockFetch(created(31));
    await client().createPerson({
      name: "Ada",
      email: "ada@example.com",
      phones: [],
    });
    expect(bodyOf(calls[0])).not.toHaveProperty("phones");
  });

  it("fails loudly on a new person without an id", async () => {
    mockFetch(json({ success: true, data: { name: "Ada" } }));
    const error = await rejection(
      client().createPerson({ name: "Ada", email: "a@b.co", phones: [] })
    );
    expect(error.code).toBe("server");
  });

  it("updates a person with PATCH", async () => {
    const { calls } = mockFetch(updated());
    await client().updatePerson(7, { name: "Ada King" });
    expect(calls[0]?.url).toBe(`${DOMAIN}/api/v2/persons/7`);
    expect(calls[0]?.method).toBe("PATCH");
    expect(bodyOf(calls[0])).toEqual({ name: "Ada King" });
  });

  it("creates a lead on the person, with no origin_id (Pipedrive replaces it)", async () => {
    const { calls } = mockFetch(leadCreated());
    await client().createLead({ title: "x".repeat(400), personId: 7 });
    expect(calls[0]?.url).toBe(`${DOMAIN}/api/v1/leads`);
    expect(calls[0]?.method).toBe("POST");
    const body = bodyOf(calls[0]) as Record<string, unknown>;
    expect(body).toEqual({ title: "x".repeat(255), person_id: 7 });
  });

  it("fails loudly on a new lead answer it doesn't understand", async () => {
    mockFetch(json({ success: false, data: null }, 201));
    const error = await rejection(
      client().createLead({ title: "t", personId: 7 })
    );
    expect(error.code).toBe("server");
  });

  it("maps errors by status and never echoes what was sent", async () => {
    mockFetch(
      json(
        {
          success: false,
          error: "Invalid value for ada@example.com",
          error_info: "name: Ada Lovelace",
        },
        400
      ),
      json({ success: false, error: "unauthorized access" }, 401),
      json({ success: false }, 403),
      json({ success: false }, 429, { "retry-after": "12" }),
      json({ success: false }, 503),
      networkError()
    );
    const c = client();
    const bad = await rejection(c.createLead({ title: "t", personId: 1 }));
    expect(bad.code).toBe("bad_request");
    expect(bad.message).not.toContain("ada@");
    expect(bad.message).not.toContain("Lovelace");
    expect(bad.message).not.toContain(TOKEN);
    expect((await rejection(c.findPersonByEmail("a@b.co"))).code).toBe(
      "unauthorized"
    );
    expect((await rejection(c.findPersonByEmail("a@b.co"))).code).toBe(
      "forbidden"
    );
    const limited = await rejection(c.findPersonByEmail("a@b.co"));
    expect(limited.code).toBe("rate_limited");
    expect(limited.retryAfterSeconds).toBe(12);
    expect((await rejection(c.findPersonByEmail("a@b.co"))).code).toBe(
      "server"
    );
    expect((await rejection(c.findPersonByEmail("a@b.co"))).code).toBe(
      "network"
    );
  });

  it("revokes the refresh token with HTTP Basic, the way Pipedrive uninstalls the app", async () => {
    const { calls } = mockFetch(json({}));
    await revokePipedriveToken({
      token: "refresh-1",
      clientId: "cid",
      clientSecret: "cs",
    });
    expect(calls[0]?.url).toBe(PIPEDRIVE_REVOKE_URL);
    expect(calls[0]?.url).toBe("https://oauth.pipedrive.com/oauth/revoke");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from("cid:cs").toString("base64")}`
    );
    expect(calls[0]?.headers["content-type"]).toBe(
      "application/x-www-form-urlencoded"
    );
    // The secret is in the header only, never in the body
    expect(Object.fromEntries(new URLSearchParams(calls[0]?.body))).toEqual({
      token: "refresh-1",
      token_type_hint: "refresh_token",
    });
  });
});

describe("Pipedrive responses to people", () => {
  it("suggests email, name and phone, joins first and last names, groups by email", () => {
    const { people, skipped } = pipedrivePeople(
      [
        response("r1", [
          answer("e", "email", "ADA@example.com", "Email"),
          answer("f", "text", "Ada", "First name"),
          answer("l", "text", "Lovelace", "Last name"),
          answer("p", "phone", "+49 30 123", "Phone"),
        ]),
        response("r2", [answer("n", "text", "No Email", "Name")]),
        response("r3", [
          answer("e", "email", "ada@example.com", "Email"),
          answer("n", "text", "Ada King", "Your name"),
        ]),
      ],
      settings
    );
    expect(skipped).toBe(1); // r2 has no email
    expect(people).toHaveLength(1);
    expect(people[0]?.email).toBe("ada@example.com");
    expect(people[0]?.entries.map((entry) => entry.response.id)).toEqual([
      "r1",
      "r3",
    ]);
    expect(people[0]?.entries.map((entry) => entry.name)).toEqual([
      "Ada Lovelace",
      "Ada King",
    ]);
    expect(people[0]?.entries.map((entry) => entry.phone)).toEqual([
      "+49 30 123",
      undefined,
    ]);
  });

  it("uses a saved mapping, sends only mapped answers, respects the page filter", () => {
    const { people, skipped } = pipedrivePeople(
      [
        response("r1", [
          answer("e", "email", "a@b.co"),
          answer("secret", "text", "do not send", "Name"),
        ]),
        response("r2", [answer("e", "email", "c@d.co")], { pageId: "p2" }),
      ],
      {
        pageIds: ["p1"],
        forms: { "p1:f1": { fields: { e: "email", secret: "" } } },
      }
    );
    expect(people).toHaveLength(1);
    expect(people[0]?.entries[0]?.name).toBeUndefined();
    expect(skipped).toBe(1);
  });

  it("ignores a phone answer that holds no digits", () => {
    const { people } = pipedrivePeople(
      [
        response("r1", [
          answer("e", "email", "a@b.co"),
          answer("p", "phone", "n/a", "Phone"),
        ]),
      ],
      settings
    );
    expect(people[0]?.entries[0]?.phone).toBeUndefined();
  });
});

describe("Pipedrive sync", () => {
  it("creates a person nobody has, named from the form", async () => {
    const { calls } = mockFetch(search(), created(31));
    const result = await syncResponsesToPipedrive(
      client(),
      settings,
      [ada("r1", [answer("p", "phone", "+49 30 123", "Phone")])],
      { sleep: noWait }
    );
    expect(
      calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)
    ).toEqual(["GET /api/v2/persons/search", "POST /api/v2/persons"]);
    expect(new URL(calls[0]?.url ?? "").searchParams.get("term")).toBe(
      "ada@example.com"
    );
    expect(bodyOf(calls[1])).toEqual({
      name: "Ada Lovelace",
      emails: [{ value: "ada@example.com", primary: true }],
      phones: [{ value: "+49 30 123", primary: true }],
    });
    expect(result).toEqual({
      delivered: 1,
      skipped: 0,
      cursor: { at: "2026-10-31T10:00:01.000Z", id: "r1" },
    });
  });

  it("names a new person by their email when the form gave no name", async () => {
    const { calls } = mockFetch(search(), created(31));
    await syncResponsesToPipedrive(
      client(),
      settings,
      [response("r1", [answer("e", "email", "x@y.co", "Email")])],
      { sleep: noWait }
    );
    expect((bodyOf(calls[1]) as { name: string }).name).toBe("x@y.co");
  });

  it("updates the name of a person it finds, and never sends their emails", async () => {
    const { calls } = mockFetch(search(7), updated());
    await syncResponsesToPipedrive(client(), settings, [ada()], {
      sleep: noWait,
    });
    expect(calls.map((call) => call.method)).toEqual(["GET", "PATCH"]);
    expect(calls[1]?.url).toBe(`${DOMAIN}/api/v2/persons/7`);
    expect(bodyOf(calls[1])).toEqual({ name: "Ada Lovelace" });
  });

  it("does not touch a person's name when the form didn't give one", async () => {
    const { calls } = mockFetch(search(7));
    await syncResponsesToPipedrive(
      client(),
      settings,
      [response("r1", [answer("e", "email", "x@y.co", "Email")])],
      { sleep: noWait }
    );
    // Found, nothing to change: no read of phones, no update
    expect(calls).toHaveLength(1);
  });

  it("adds a new number after the ones a person has, keeping their primary", async () => {
    const { calls } = mockFetch(
      search(7),
      person([
        { value: "+49 30 111", primary: true },
        { value: "0170 555", primary: false },
      ]),
      updated()
    );
    await syncResponsesToPipedrive(
      client(),
      settings,
      [ada("r1", [answer("p", "phone", "+49 30 999", "Phone")])],
      { sleep: noWait }
    );
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET", "PATCH"]);
    expect(new URL(calls[1]?.url ?? "").pathname).toBe("/api/v2/persons/7");
    expect(bodyOf(calls[2])).toEqual({
      name: "Ada Lovelace",
      phones: [
        { value: "+49 30 111", primary: true },
        { value: "0170 555", primary: false },
        { value: "+49 30 999", primary: false },
      ],
    });
  });

  it("makes the new number primary when the person had none", async () => {
    const { calls } = mockFetch(search(7), person([]), updated());
    await syncResponsesToPipedrive(
      client(),
      settings,
      [
        response("r1", [
          answer("e", "email", "x@y.co", "Email"),
          answer("p", "phone", "+49 30 999", "Phone"),
        ]),
      ],
      { sleep: noWait }
    );
    expect(bodyOf(calls[2])).toEqual({
      phones: [{ value: "+49 30 999", primary: true }],
    });
  });

  it("does not add a number the person already has, however it is written", async () => {
    const { calls } = mockFetch(
      search(7),
      person([{ value: "(+49) 30-123", primary: true }])
    );
    await syncResponsesToPipedrive(
      client(),
      settings,
      [
        response("r1", [
          answer("e", "email", "x@y.co", "Email"),
          answer("p", "phone", "+49 30 123", "Phone"),
        ]),
      ],
      { sleep: noWait }
    );
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET"]);
  });

  it("sends nothing it can't read: a person without a phones list stops the batch", async () => {
    mockFetch(search(7), json({ success: true, data: { id: 7 } }));
    const error = await rejection(
      syncResponsesToPipedrive(
        client(),
        settings,
        [ada("r1", [answer("p", "phone", "+49 30 999", "Phone")])],
        { sleep: noWait }
      )
    );
    expect(error.code).toBe("server");
  });

  it("searches an email once for the whole batch, the latest name winning", async () => {
    const { calls } = mockFetch(search(7), updated());
    const result = await syncResponsesToPipedrive(
      client(),
      settings,
      [
        response("r1", [
          answer("e", "email", "ada@example.com", "Email"),
          answer("n", "text", "Ada L.", "Name"),
        ]),
        response("r2", [
          answer("e", "email", "ADA@example.com", "Email"),
          answer("n", "text", "Ada Lovelace", "Name"),
        ]),
        response("r3", [answer("e", "email", "ada@example.com", "Email")]),
      ],
      { sleep: noWait }
    );
    expect(calls).toHaveLength(2);
    expect(bodyOf(calls[1])).toEqual({ name: "Ada Lovelace" });
    expect(result.delivered).toBe(3);
    expect(result.cursor?.id).toBe("r3");
  });

  it("adds no leads unless asked", async () => {
    const { calls } = mockFetch(search(7), updated());
    await syncResponsesToPipedrive(client(), settings, [ada()], {
      sleep: noWait,
    });
    expect(calls.some((call) => call.url.includes("/leads"))).toBe(false);
  });

  it("adds one lead per response, titled by page and person", async () => {
    const record = leadRecord();
    const { calls } = mockFetch(
      search(7),
      updated(),
      leadCreated(),
      leadCreated(),
      leadCreated()
    );
    await syncResponsesToPipedrive(
      client(),
      { ...settings, createLead: true },
      [
        ada("r1"),
        response("r2", [answer("e", "email", "ada@example.com", "Email")]),
        response(
          "r3",
          [
            answer("e", "email", "ada@example.com", "Email"),
            answer("n", "text", "Ada L.", "Name"),
          ],
          { pageTitle: null }
        ),
      ],
      { sleep: noWait, ...record }
    );
    expect(calls.filter(isLeadPost).map((call) => bodyOf(call))).toEqual([
      { title: "Spring: Ada Lovelace", person_id: 7 },
      { title: "Spring: ada@example.com", person_id: 7 },
      { title: "Form response", person_id: 7 },
    ]);
    // Each lead is recorded as it's made, in order
    expect(record.recorded).toEqual(["r1", "r2", "r3"]);
    // One search for the person, however many responses
    expect(calls.filter((call) => call.url.includes("search"))).toHaveLength(1);
  });

  it("creates the person before its lead", async () => {
    const { calls } = mockFetch(search(), created(31), leadCreated());
    await syncResponsesToPipedrive(
      client(),
      { ...settings, createLead: true },
      [ada()],
      { sleep: noWait }
    );
    expect(bodyOf(calls[2])).toMatchObject({ person_id: 31 });
  });

  it("never reads leads back from Pipedrive: their origin_id can't identify a response", async () => {
    const { calls } = mockFetch(search(7), updated(), leadCreated());
    await syncResponsesToPipedrive(
      client(),
      { ...settings, createLead: true },
      [ada()],
      { sleep: noWait }
    );
    expect(
      calls.some((call) => call.method === "GET" && call.url.includes("/leads"))
    ).toBe(false);
  });

  it("gives no lead to a response already recorded as having one", async () => {
    const record = leadRecord(["r1", "r2"]);
    const { calls } = mockFetch(search(7), updated(), leadCreated());
    const result = await syncResponsesToPipedrive(
      client(),
      { ...settings, createLead: true },
      [
        ada("r1"),
        response("r2", [answer("e", "email", "ada@example.com", "Email")]),
        response("r3", [answer("e", "email", "ada@example.com", "Email")]),
      ],
      { sleep: noWait, ...record }
    );
    expect(leadTitles(calls)).toHaveLength(1);
    expect(record.recorded).toEqual(["r3"]);
    // Recorded responses still count as delivered: the person was updated
    expect(result.delivered).toBe(3);
  });

  it("records a lead only once Pipedrive has made it", async () => {
    const record = leadRecord();
    mockFetch(search(7), updated(), json({ success: false }, 400));
    await rejection(
      syncResponsesToPipedrive(
        client(),
        { ...settings, createLead: true },
        [ada("r1")],
        { sleep: noWait, ...record }
      )
    );
    expect(record.recorded).toEqual([]);
  });

  it("stops the batch, unsent, if recording a lead fails", async () => {
    // Better to stop than to go on without a record that would prevent a
    // second lead on the retry.
    mockFetch(search(7), updated(), leadCreated());
    const error = await rejection(
      syncResponsesToPipedrive(
        client(),
        { ...settings, createLead: true },
        [ada("r1"), ada("r2")],
        {
          sleep: noWait,
          onLeadCreated: () => Promise.reject(new Error("database down")),
        }
      )
    );
    expect(String(error)).toMatch(/database down/);
  });

  it("records nothing when leads are off", async () => {
    const record = leadRecord();
    const { calls } = mockFetch(search(7), updated());
    await syncResponsesToPipedrive(client(), settings, [ada()], {
      sleep: noWait,
      ...record,
    });
    expect(calls.some((call) => call.url.includes("/leads"))).toBe(false);
    expect(record.recorded).toEqual([]);
  });

  it("'Retry now' after a half-made batch adds no lead twice (fail, resume, retry)", async () => {
    // As on the sandbox: Pipedrive gives back the client id as origin_id, so
    // only QRdx's own record can tell that r1 already has its lead.
    const batch = [
      ada("r1"),
      response("r2", [answer("e", "email", "bob@example.com", "Email")]),
    ];
    const withLeads = { ...settings, createLead: true };
    const record = leadRecord();

    // First delivery: Ada's lead is made (and recorded), then Pipedrive
    // refuses Bob's.
    const first = mockFetch(
      search(7),
      updated(),
      leadCreated(),
      search(8),
      json({ success: false, error: "Invalid lead" }, 400)
    );
    const error = await rejection(
      syncResponsesToPipedrive(client(), withLeads, batch, {
        sleep: noWait,
        ...record,
      })
    );
    expect(leadTitles(first.calls)).toHaveLength(2);
    expect(record.recorded).toEqual(["r1"]);
    const start = initialSyncState(null);
    let state = nextSyncState(start, { ok: false, error });
    expect(state.status).toBe("failed");

    // "Retry now" goes through resumeSyncState, which clears the attempts:
    // nothing about the next delivery says it is a retry. The cursor didn't
    // move, so the same batch is sent again.
    state = resumeSyncState(state);
    expect(state.attempts).toBe(0);
    expect(state.cursor).toEqual(start.cursor);

    // The same batch again, with what the worker recorded: no second lead
    // for Ada, Bob's is made.
    const second = mockFetch(search(7), updated(), search(8), leadCreated());
    const result = await syncResponsesToPipedrive(client(), withLeads, batch, {
      sleep: noWait,
      leadsMade: new Set(record.recorded),
      onLeadCreated: record.onLeadCreated,
    });
    expect(second.calls.filter(isLeadPost)).toHaveLength(1);
    // The one lead made is Bob's (person 8), not a second one for Ada (7)
    expect(bodyOf(second.calls.find(isLeadPost))).toMatchObject({
      person_id: 8,
    });
    expect(record.recorded).toEqual(["r1", "r2"]);
    expect(result.delivered).toBe(2);
    expect(nextSyncState(state, { ok: true, result }).status).toBe("ok");
  });

  it("pauses between people, never before the first", async () => {
    mockFetch(search(7), updated(), search(8), updated(), search(9), updated());
    const sleep = vi.fn(() => Promise.resolve());
    await syncResponsesToPipedrive(
      client(),
      settings,
      ["a", "b", "c"].map((name, index) =>
        response(`r${index}`, [
          answer("e", "email", `${name}@example.com`, "Email"),
          answer("n", "text", name.toUpperCase(), "Name"),
        ])
      ),
      { sleep }
    );
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(PIPEDRIVE_SEARCH_SPACING_MS);
  });

  it("allows Pipedrive's search limit: at least 10 searches per 2 seconds", () => {
    expect(PIPEDRIVE_SEARCH_SPACING_MS * 10).toBeGreaterThanOrEqual(2000);
  });

  it("counts skipped responses, and moves the cursor past them", async () => {
    mockFetch();
    const result = await syncResponsesToPipedrive(
      client(),
      settings,
      [response("r1", [answer("n", "text", "No Email", "Name")])],
      { sleep: noWait }
    );
    expect(result).toEqual({
      delivered: 0,
      skipped: 1,
      cursor: { at: "2026-10-31T10:00:01.000Z", id: "r1" },
    });
  });

  it("skips an email longer than Pipedrive can search, and sends the rest", async () => {
    // Pipedrive's spec: /v2/persons/search takes a term of at most 100
    expect(PIPEDRIVE_MAX_SEARCH_TERM).toBe(100);
    const local = (length: number) =>
      "a".repeat(length - "@example.com".length);
    const longest = `${local(100)}@example.com`;
    const tooLong = `${local(101)}@example.com`;
    expect(longest).toHaveLength(100);
    expect(tooLong).toHaveLength(101);
    const { calls } = mockFetch(search(7));
    const result = await syncResponsesToPipedrive(
      client(),
      settings,
      [
        response("r1", [answer("e", "email", tooLong, "Email")]),
        response("r2", [answer("e", "email", longest, "Email")]),
      ],
      { sleep: noWait }
    );
    // Only the 100-character email is searched; nothing is sent for the other
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]?.url ?? "").searchParams.get("term")).toBe(longest);
    expect(result).toEqual({
      delivered: 1,
      skipped: 1,
      cursor: { at: "2026-10-31T10:00:02.000Z", id: "r2" },
    });
  });

  it("moves past a batch whose only response has a too-long email", async () => {
    const { calls } = mockFetch();
    const result = await syncResponsesToPipedrive(
      client(),
      { ...settings, createLead: true },
      [
        response("r1", [
          answer("e", "email", `${"b".repeat(95)}@example.com`, "Email"),
        ]),
      ],
      { sleep: noWait }
    );
    expect(calls).toHaveLength(0);
    expect(result.skipped).toBe(1);
    expect(result.cursor?.id).toBe("r1");
  });

  it("never searches again for a person an earlier batch of the run created", async () => {
    // Pipedrive's search can lag behind a create: batch 2 must not search
    // (and miss, and create) the person batch 1 just made.
    const knownPeople = new Map<string, number>();
    const withLeads = { ...settings, createLead: true };
    const first = mockFetch(search(), created(31), leadCreated());
    await syncResponsesToPipedrive(client(), withLeads, [ada("r1")], {
      sleep: noWait,
      knownPeople,
    });
    expect(knownPeople.get("ada@example.com")).toBe(31);
    expect(
      first.calls.filter((call) => call.url.includes("search"))
    ).toHaveLength(1);

    const second = mockFetch(updated(), leadCreated());
    await syncResponsesToPipedrive(client(), withLeads, [ada("r2")], {
      sleep: noWait,
      knownPeople,
    });
    expect(second.calls.some((call) => call.url.includes("search"))).toBe(
      false
    );
    expect(
      second.calls.some(
        (call) => call.method === "POST" && call.url.endsWith("/persons")
      )
    ).toBe(false);
    expect(second.calls[0]?.url).toBe(`${DOMAIN}/api/v2/persons/31`);
    // The second response's lead goes on the same person
    expect(bodyOf(second.calls.find(isLeadPost))).toMatchObject({
      person_id: 31,
    });
  });

  it("remembers people it found by search too, for the rest of the run", async () => {
    const knownPeople = new Map<string, number>();
    mockFetch(search(7), updated());
    await syncResponsesToPipedrive(client(), settings, [ada("r1")], {
      sleep: noWait,
      knownPeople,
    });
    expect([...knownPeople]).toEqual([["ada@example.com", 7]]);
    const { calls } = mockFetch(updated());
    await syncResponsesToPipedrive(client(), settings, [ada("r2")], {
      sleep: noWait,
      knownPeople,
    });
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      `PATCH ${DOMAIN}/api/v2/persons/7`,
    ]);
  });

  it("searches as before without a shared map (each call alone)", async () => {
    mockFetch(search(7), updated());
    await syncResponsesToPipedrive(client(), settings, [ada("r1")], {
      sleep: noWait,
    });
    const { calls } = mockFetch(search(7), updated());
    await syncResponsesToPipedrive(client(), settings, [ada("r2")], {
      sleep: noWait,
    });
    expect(calls[0]?.url).toContain("/api/v2/persons/search");
  });

  it("fails the whole batch, with no cursor, when Pipedrive refuses a lead", async () => {
    mockFetch(search(7), updated(), json({ success: false }, 500));
    const error = await rejection(
      syncResponsesToPipedrive(
        client(),
        { ...settings, createLead: true },
        [ada()],
        { sleep: noWait }
      )
    );
    expect(error.code).toBe("server");
  });

  it("lets a rate limit carry its wait to the worker", async () => {
    mockFetch(json({ success: false }, 429, { "retry-after": "30" }));
    const error = await rejection(
      syncResponsesToPipedrive(client(), settings, [ada()], { sleep: noWait })
    );
    expect(error.code).toBe("rate_limited");
    expect(error.retryAfterSeconds).toBe(30);
  });
});

describe("Pipedrive as a data-out stream", () => {
  it("is a form-response sink", () => {
    expect(SINK_PROVIDERS).toContain("pipedrive");
    expect(SINK_STREAMS.pipedrive).toEqual([
      { stream: "responses", key: "sync" },
    ]);
  });

  it("reads a small batch, since each response is a few requests", () => {
    expect(syncBatchSize("pipedrive")).toBe(ONE_BY_ONE_BATCH_SIZE);
    expect(ONE_BY_ONE_BATCH_SIZE).toBeLessThan(SYNC_BATCH_SIZE);
    for (const provider of SINK_PROVIDERS) {
      if (provider !== "pipedrive") {
        expect(syncBatchSize(provider)).toBe(SYNC_BATCH_SIZE);
      }
    }
  });
});

describe("Pipedrive OAuth", () => {
  const ENV = {
    PIPEDRIVE_CLIENT_ID: "pd-id",
    PIPEDRIVE_CLIENT_SECRET: "pd-secret",
  };
  const config = () => getIntegrationConfigWithEnv("pipedrive", ENV);

  beforeAll(() => registerAllIntegrations());
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
  });

  it("asks for no scope in the URL (the app's own settings decide), with state", () => {
    const url = new URL(
      createOAuthHandler(config()).generateAuthUrl("verifier", "state-1")
    );
    expect(url.origin + url.pathname).toBe(
      "https://oauth.pipedrive.com/oauth/authorize"
    );
    expect(url.searchParams.has("scope")).toBe(false);
    expect(url.searchParams.has("code_challenge")).toBe(false);
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("client_id")).toBe("pd-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/integrations/pipedrive/callback"
    );
  });

  it("exchanges the code with HTTP Basic, keeping the secret out of the body", async () => {
    const { calls } = mockFetch(
      json({
        access_token: "a",
        refresh_token: "r",
        expires_in: 3599,
        token_type: "Bearer",
        api_domain: DOMAIN,
      })
    );
    await createOAuthHandler(config()).exchangeCodeForTokens("code-1");
    expect(calls[0]?.url).toBe("https://oauth.pipedrive.com/oauth/token");
    expect(calls[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from("pd-id:pd-secret").toString("base64")}`
    );
    expect(Object.fromEntries(new URLSearchParams(calls[0]?.body))).toEqual({
      grant_type: "authorization_code",
      code: "code-1",
      redirect_uri: "http://localhost:3000/api/integrations/pipedrive/callback",
    });
  });

  it("refreshes with HTTP Basic", async () => {
    const { calls } = mockFetch(
      json({
        access_token: "a2",
        refresh_token: "r",
        expires_in: 3599,
        token_type: "Bearer",
      })
    );
    await createOAuthHandler(config()).refreshAccessToken("r");
    expect(calls[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from("pd-id:pd-secret").toString("base64")}`
    );
    expect(Object.fromEntries(new URLSearchParams(calls[0]?.body))).toEqual({
      grant_type: "refresh_token",
      refresh_token: "r",
    });
  });

  it("is 'not configured' without its credentials, naming them", () => {
    expect(() => getIntegrationConfigWithEnv("pipedrive", {})).toThrow(
      /PIPEDRIVE_CLIENT_ID, PIPEDRIVE_CLIENT_SECRET/
    );
  });

  it("saves the company address from the token response, and no tokens", async () => {
    const metadata = await fetchDataAccountMetadata("pipedrive", "tok", {
      access_token: "tok",
      refresh_token: "ref",
      api_domain: "https://acme.pipedrive.com",
    });
    expect(metadata).toEqual({
      name: "Pipedrive acme",
      apiDomain: "https://acme.pipedrive.com",
    });
    expect(JSON.stringify(metadata)).not.toContain("tok");
  });

  it.each([
    ["another host", { api_domain: "https://evil.example" }],
    ["http", { api_domain: "http://acme.pipedrive.com" }],
    ["no api_domain", {}],
  ])("refuses to connect when the token response has %s", async (_n, extra) => {
    const error = await rejection(
      fetchDataAccountMetadata("pipedrive", "tok", {
        access_token: "tok",
        ...extra,
      })
    );
    expect(error.code).toBe("bad_request");
    expect(error.message).not.toContain("evil");
  });

  it("revokes the refresh token on disconnect, and says it did", async () => {
    const { calls } = mockFetch(json({}));
    const revoked = await revokeDataProviderToken(
      "pipedrive",
      { accessToken: "acc", refreshToken: "ref" },
      { clientId: "pd-id", clientSecret: "pd-secret" }
    );
    expect(revoked).toBe(true);
    expect(Object.fromEntries(new URLSearchParams(calls[0]?.body)).token).toBe(
      "ref"
    );
  });

  it("doesn't claim a revoke it couldn't make (no refresh token, no app credentials)", async () => {
    const { fn } = mockFetch();
    expect(
      await revokeDataProviderToken(
        "pipedrive",
        { accessToken: "acc", refreshToken: null },
        { clientId: "a", clientSecret: "b" }
      )
    ).toBe(false);
    expect(
      await revokeDataProviderToken("pipedrive", {
        accessToken: "acc",
        refreshToken: "ref",
      })
    ).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });
});
