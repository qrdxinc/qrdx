import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchDataAccountMetadata,
  revokeDataProviderToken,
} from "../src/capabilities/data-factory";
import type { IntegrationApiError } from "../src/core/http-client";
import { createOAuthHandler } from "../src/core/oauth";
import {
  createPipedriveClient,
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
  ONE_BY_ONE_BATCH_SIZE,
  SYNC_BATCH_SIZE,
  syncBatchSize,
} from "../src/sinks/state";
import type { SinkFormResponse } from "../src/sinks/types";
import { SINK_PROVIDERS, SINK_STREAMS } from "../src/sinks/types";
import { bodyOf, json, mockFetch, networkError } from "./helpers";

// The response bodies below follow Pipedrive's API reference for persons and
// search (v2) and leads (v1). Pipedrive's reference pages don't print their
// response examples, so each shape is pinned in the helpers here: a real
// response from a sandbox account replaces them if one differs.

const DOMAIN = "https://acme.pipedrive.com";
const TOKEN = "pd-access-token";

const search = (...ids: number[]) =>
  json({
    success: true,
    data: { items: ids.map((id) => ({ result_score: 1, item: { id } })) },
    additional_data: { next_cursor: null },
  });
const created = (id: number) => json({ success: true, data: { id } });
const person = (phones: Array<{ value: string; primary: boolean }> = []) =>
  json({ success: true, data: { id: 7, phones } });
const updated = () => json({ success: true, data: { id: 7 } });
const leadCreated = () =>
  json({ success: true, data: { id: "c9a1f2e4-0000-4000-8000-000000000001" } });
const leads = (
  origins: Array<string | null>,
  pagination: Record<string, unknown> = { more_items_in_collection: false }
) =>
  json({
    success: true,
    data: origins.map((origin_id, index) => ({
      id: `lead-${index}`,
      origin_id,
    })),
    additional_data: { pagination },
  });

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
  ])("fails loudly on a search answer with %s", async (_name, answerBody) => {
    mockFetch(answerBody);
    const error = await rejection(client().findPersonByEmail("a@b.co"));
    expect(error.code).toBe("bad_request");
  });

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
    expect(error.code).toBe("bad_request");
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
    expect(error.code).toBe("bad_request");
  });

  it("updates a person with PATCH", async () => {
    const { calls } = mockFetch(updated());
    await client().updatePerson(7, { name: "Ada King" });
    expect(calls[0]?.url).toBe(`${DOMAIN}/api/v2/persons/7`);
    expect(calls[0]?.method).toBe("PATCH");
    expect(bodyOf(calls[0])).toEqual({ name: "Ada King" });
  });

  it("collects lead origins across pages, ignoring leads without one", async () => {
    const { calls } = mockFetch(
      leads(["r1", null], { more_items_in_collection: true, next_start: 100 }),
      leads(["r2"])
    );
    const origins = await client().listLeadOrigins(7);
    expect([...origins].sort()).toEqual(["r1", "r2"]);
    const first = new URL(calls[0]?.url ?? "");
    expect(first.pathname).toBe("/api/v1/leads");
    expect(Object.fromEntries(first.searchParams)).toEqual({
      person_id: "7",
      limit: "100",
      start: "0",
    });
    expect(new URL(calls[1]?.url ?? "").searchParams.get("start")).toBe("100");
  });

  it("stops at a short page when Pipedrive sends no pagination", async () => {
    mockFetch(json({ success: true, data: [{ id: "l1", origin_id: "r1" }] }));
    expect([...(await client().listLeadOrigins(7))]).toEqual(["r1"]);
  });

  it("won't treat a full page without pagination as the last one", async () => {
    mockFetch(
      json({
        success: true,
        data: Array.from({ length: 100 }, (_, i) => ({
          id: `l${i}`,
          origin_id: `r${i}`,
        })),
      })
    );
    const error = await rejection(client().listLeadOrigins(7));
    expect(error.code).toBe("bad_request");
  });

  it("gives up loudly on a person with an endless lead list", async () => {
    mockFetch(
      ...Array.from({ length: 50 }, (_, page) =>
        leads(["x"], { more_items_in_collection: true, next_start: page + 1 })
      )
    );
    const error = await rejection(client().listLeadOrigins(7));
    expect(error.message).toMatch(/too many leads/);
  });

  it("creates a lead on the person with the response id as its origin", async () => {
    const { calls } = mockFetch(leadCreated());
    await client().createLead({
      title: "x".repeat(400),
      personId: 7,
      originId: "resp_9",
    });
    expect(calls[0]?.url).toBe(`${DOMAIN}/api/v1/leads`);
    expect(calls[0]?.method).toBe("POST");
    const body = bodyOf(calls[0]) as Record<string, unknown>;
    expect(body).toMatchObject({ person_id: 7, origin_id: "resp_9" });
    expect((body.title as string).length).toBe(255);
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
    const bad = await rejection(
      c.createLead({ title: "t", personId: 1, originId: "o" })
    );
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
    expect(error.code).toBe("bad_request");
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

  it("adds one lead per response, titled by page and person, linked by response id", async () => {
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
      { sleep: noWait }
    );
    const posts = calls.filter((call) => call.url.endsWith("/api/v1/leads"));
    expect(posts.map((call) => bodyOf(call))).toEqual([
      { title: "Spring: Ada Lovelace", person_id: 7, origin_id: "r1" },
      { title: "Spring: ada@example.com", person_id: 7, origin_id: "r2" },
      { title: "Form response", person_id: 7, origin_id: "r3" },
    ]);
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

  it("reads no leads on a first delivery, so it makes no needless calls", async () => {
    const { calls } = mockFetch(search(7), updated(), leadCreated());
    await syncResponsesToPipedrive(
      client(),
      { ...settings, createLead: true },
      [ada()],
      { sleep: noWait, isRetry: false }
    );
    expect(
      calls.some((call) => call.method === "GET" && call.url.includes("/leads"))
    ).toBe(false);
  });

  it("on a retry, gives no second lead to a response that already has one", async () => {
    const { calls } = mockFetch(
      search(7),
      updated(),
      leads(["r1", "someone-elses"]),
      leadCreated()
    );
    const result = await syncResponsesToPipedrive(
      client(),
      { ...settings, createLead: true },
      [
        ada("r1"),
        response("r2", [answer("e", "email", "ada@example.com", "Email")]),
      ],
      { sleep: noWait, isRetry: true }
    );
    const posts = calls.filter(
      (call) => call.method === "POST" && call.url.endsWith("/leads")
    );
    expect(
      posts.map((call) => (bodyOf(call) as { origin_id: string }).origin_id)
    ).toEqual(["r2"]);
    expect(result.delivered).toBe(2);
    expect(new URL(calls[2]?.url ?? "").searchParams.get("person_id")).toBe(
      "7"
    );
  });

  it("skips leads on a retry without asking for them", async () => {
    const { calls } = mockFetch(search(7), updated());
    await syncResponsesToPipedrive(client(), settings, [ada()], {
      sleep: noWait,
      isRetry: true,
    });
    expect(calls.some((call) => call.url.includes("/leads"))).toBe(false);
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
    expect(SINK_STREAMS.pipedrive).toBe("responses");
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
