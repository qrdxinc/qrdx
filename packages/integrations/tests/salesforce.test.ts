// Salesforce: form responses to leads. Salesforce's REST API is a faked fetch
// (tests/helpers.ts), so nothing here reaches a real org. Covered: the field
// mapping and Salesforce's required fields, the email lookup on every
// delivery and the run's email → lead id map (no duplicate leads), record
// errors as readable, safe sync text (retryable or not), the 401 → refresh →
// retry path, the production and sandbox sign-in hosts, and revoke.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { revokeDataProviderToken } from "../src/capabilities/data-factory";
import {
  IntegrationApiError,
  isIntegrationApiError,
} from "../src/core/http-client";
import {
  createOAuthHandler,
  oauthVariantName,
  withOAuthVariant,
} from "../src/core/oauth";
import {
  createSalesforceClient,
  describeSalesforceError,
  lookupChunks,
  readSalesforceError,
  refreshSalesforceToken,
  revokeSalesforceToken,
  SALESFORCE_API_VERSION,
  salesforceAccountMetadata,
  salesforceEnvironment,
  salesforceInstanceUrl,
  soqlString,
} from "../src/integrations/salesforce/client";
import {
  newLeadRecord,
  SALESFORCE_NO_COMPANY,
  type SalesforceSettings,
  salesforceLeads,
  syncResponsesToSalesforce,
} from "../src/integrations/salesforce/sink";
import {
  getIntegrationConfigWithEnv,
  registerAllIntegrations,
} from "../src/registry/loader";
import {
  describeSyncError,
  initialSyncState,
  isRetryableSyncError,
  nextSyncState,
} from "../src/sinks/state";
import type { SinkFormResponse } from "../src/sinks/types";
import { bodyOf, json, mockFetch, type RecordedCall } from "./helpers";

const INSTANCE = "https://acme.my.salesforce.com";
const API = `${INSTANCE}/services/data/${SALESFORCE_API_VERSION}`;
const LEAD_A = "00Q5g00000AbCdEAAA";
const LEAD_B = "00Q5g00000AbCdFAAA";

const answer = (
  id: string,
  type: string,
  value: string | boolean,
  label = id
) => ({
  id,
  label,
  type,
  value,
  text: typeof value === "boolean" ? (value ? "Yes" : "No") : String(value),
});

let seq = 0;
const response = (
  answers: SinkFormResponse["answers"],
  pageId = "p1"
): SinkFormResponse => {
  seq++;
  return {
    id: `r${seq}`,
    createdAt: new Date(Date.UTC(2026, 10, 1, 10, 0, seq)).toISOString(),
    pageId,
    pageTitle: "Spring",
    formId: "f1",
    codeSlug: "aB3dE5f",
    answers,
  };
};

const settings: SalesforceSettings = {
  pageIds: null,
  forms: {},
  leadSource: "Web",
};

const client = (
  refresh?: () => Promise<{ accessToken: string; instanceUrl: string }>
) =>
  createSalesforceClient({
    accessToken: "sf-token",
    instanceUrl: INSTANCE,
    refresh,
  });

/** The SOQL a lookup call sent. */
const soqlOf = (call: RecordedCall | undefined) =>
  new URL(call?.url ?? "https://x").searchParams.get("q") ?? "";

const sent = (call: RecordedCall | undefined) =>
  bodyOf(call) as {
    allOrNone: boolean;
    records: Record<string, unknown>[];
  };

const query = (rows: { Id: string; Email: string }[]) =>
  json({ totalSize: rows.length, done: true, records: rows });
const saved = (...ids: string[]) =>
  json(ids.map((id) => ({ id, success: true, errors: [] })));
const failed = (statusCode: string, message = "", fields: string[] = []) => ({
  success: false,
  errors: [{ statusCode, message, fields }],
});

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as IntegrationApiError;
  }
  throw new Error("expected a rejection");
}

describe("Salesforce: leads from responses", () => {
  it("suggests the mapping and fills what Salesforce requires", () => {
    const { leads, skipped } = salesforceLeads(
      [
        response([
          answer("n", "text", "Ada King Lovelace", "Name"),
          answer("e", "email", " Ada@Example.com ", "Email"),
          answer("p", "phone", "+44 20 7946 0000", "Phone"),
          answer("c", "text", "Analytical Engines", "Company"),
          answer("j", "text", "Founder", "Job title"),
          answer("m", "text", "Call me", "Message"),
          answer("x", "text", "Scotland", "Country"),
        ]),
      ],
      settings
    );
    expect(skipped).toBe(0);
    expect(leads).toEqual([
      {
        email: "ada@example.com",
        fields: {
          FirstName: "Ada",
          LastName: "King Lovelace",
          Phone: "+44 20 7946 0000",
          Company: "Analytical Engines",
          Title: "Founder",
          Description: "Call me",
        },
      },
    ]);
    // Country isn't suggested: with state and country picklists on,
    // Salesforce only takes its own names.
    expect(leads[0]?.fields.Country).toBeUndefined();
  });

  it("uses a single name as the last name", () => {
    const { leads } = salesforceLeads(
      [
        response([
          answer("n", "text", "Ada", "Name"),
          answer("e", "email", "ada@example.com", "Email"),
        ]),
      ],
      settings
    );
    expect(leads[0]?.fields).toEqual({ LastName: "Ada" });
  });

  it("keeps one lead per email (the latest answer) and skips responses without one", () => {
    const { leads, skipped } = salesforceLeads(
      [
        response([
          answer("e", "email", "a@b.co", "Email"),
          answer("p", "phone", "1", "Phone"),
        ]),
        response([answer("n", "text", "No email", "Name")]),
        response([
          answer("e", "email", "A@B.co", "Email"),
          answer("p", "phone", "2", "Phone"),
        ]),
        response([answer("e", "email", "x@y.co", "Email")], "other-page"),
      ],
      { ...settings, pageIds: ["p1"] }
    );
    expect(leads).toEqual([{ email: "a@b.co", fields: { Phone: "2" } }]);
    // No email, a duplicate, and a page that isn't included
    expect(skipped).toBe(3);
  });

  it("sends only the standard fields it offers, cut to their length", () => {
    const local = "a".repeat(70);
    const { leads, skipped } = salesforceLeads(
      [
        response([
          answer("e", "email", "ada@example.com", "Email"),
          answer("o", "text", "005000000000001", "Owner"),
          answer("f", "text", "F".repeat(60), "First name"),
          answer("l", "text", "L".repeat(10), "Last name"),
          answer("z", "text", "1".repeat(30), "Postal code"),
        ]),
        // Lead.Email holds 80 characters
        response([answer("e", "email", `${local}@example.com`, "Email")]),
      ],
      {
        ...settings,
        forms: {
          "p1:f1": {
            fields: {
              e: "email",
              o: "OwnerId",
              f: "FirstName",
              l: "LastName",
              z: "PostalCode",
            },
          },
        },
      }
    );
    expect(skipped).toBe(1);
    expect(leads[0]?.fields).toEqual({
      FirstName: "F".repeat(40),
      LastName: "L".repeat(10),
      PostalCode: "1".repeat(20),
    });
  });

  it("gives new leads a last name, a company and the lead source", () => {
    const lead = { email: "ada.lovelace@example.com", fields: {} };
    expect(newLeadRecord(lead, settings)).toEqual({
      Email: "ada.lovelace@example.com",
      LastName: "ada.lovelace",
      Company: SALESFORCE_NO_COMPANY,
      LeadSource: "Web",
    });
    const named = {
      email: "a@b.co",
      fields: { LastName: "Lovelace", Company: "Engines" },
    };
    expect(newLeadRecord(named, { leadSource: "  " })).toEqual({
      Email: "a@b.co",
      LastName: "Lovelace",
      Company: "Engines",
    });
  });
});

describe("Salesforce: SOQL", () => {
  it("escapes quotes, backslashes and control characters in emails", () => {
    expect(soqlString("o'brien@example.com")).toBe("'o\\'brien@example.com'");
    expect(soqlString("a\\b@example.com")).toBe("'a\\\\b@example.com'");
    expect(soqlString('"x"@example.com')).toBe("'\\\"x\\\"@example.com'");
    expect(soqlString("a\nb")).toBe("'a\\nb'");
    // A quote can't end the literal early
    expect(soqlString("x' OR Name LIKE '%")).toBe("'x\\' OR Name LIKE \\'%'");
  });

  it("splits lookups so the query stays short", () => {
    const many = Array.from({ length: 250 }, (_, i) => `p${i}@x.co`);
    expect(lookupChunks(many).map((chunk) => chunk.length)).toEqual([
      100, 100, 50,
    ]);
    const long = Array.from(
      { length: 100 },
      (_, i) => `${"a".repeat(70)}${i}@x.co`
    );
    const chunks = lookupChunks(long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toEqual(long);
    for (const chunk of chunks) {
      expect(chunk.map(soqlString).join(", ").length).toBeLessThanOrEqual(6000);
    }
  });
});

describe("Salesforce: delivery without duplicates", () => {
  it("looks the email up, then creates a lead with the required fields", async () => {
    const { calls } = mockFetch(query([]), saved(LEAD_A));
    const responses = [
      response([
        answer("e", "email", "o'brien@example.com", "Email"),
        answer("c", "text", "Acme", "Company"),
      ]),
    ];
    const leadIds = new Map<string, string>();
    const result = await syncResponsesToSalesforce(
      client(),
      settings,
      responses,
      leadIds
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url.startsWith(`${API}/query?`)).toBe(true);
    expect(soqlOf(calls[0])).toBe(
      "SELECT Id, Email FROM Lead WHERE Email IN ('o\\'brien@example.com') AND IsConverted = false ORDER BY CreatedDate DESC, Id DESC"
    );
    expect(calls[0]?.headers.authorization).toBe("Bearer sf-token");

    expect(calls[1]?.method).toBe("POST");
    expect(calls[1]?.url).toBe(`${API}/composite/sobjects`);
    expect(calls[1]?.headers["sforce-duplicate-rule-header"]).toBe(
      "allowSave=true"
    );
    expect(sent(calls[1])).toEqual({
      allOrNone: false,
      records: [
        {
          attributes: { type: "Lead" },
          Company: "Acme",
          Email: "o'brien@example.com",
          LastName: "o'brien",
          LeadSource: "Web",
        },
      ],
    });
    expect(result).toEqual({
      delivered: 1,
      skipped: 0,
      cursor: { at: responses[0]?.createdAt, id: responses[0]?.id },
    });
    expect(leadIds.get("o'brien@example.com")).toBe(LEAD_A);
  });

  it("updates the open lead with that email instead of creating one", async () => {
    const { calls } = mockFetch(
      // Salesforce compares emails without case; the stored one keeps its own
      query([{ Id: LEAD_A, Email: "Ada@Example.com" }]),
      saved(LEAD_A)
    );
    const result = await syncResponsesToSalesforce(client(), settings, [
      response([
        answer("e", "email", "ada@example.com", "Email"),
        answer("p", "phone", "+1 555 0100", "Phone"),
      ]),
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.method).toBe("PATCH");
    // Only the answers: no email rewrite, no placeholders, no lead source
    expect(sent(calls[1]).records).toEqual([
      { attributes: { type: "Lead" }, id: LEAD_A, Phone: "+1 555 0100" },
    ]);
    expect(result.delivered).toBe(1);
  });

  it("collapses one delivery's responses from the same email into one lead", async () => {
    const { calls } = mockFetch(query([]), saved(LEAD_A));
    const result = await syncResponsesToSalesforce(client(), settings, [
      response([
        answer("e", "email", "a@b.co", "Email"),
        answer("p", "phone", "1", "Phone"),
      ]),
      response([
        answer("e", "email", "A@b.co", "Email"),
        answer("p", "phone", "2", "Phone"),
      ]),
    ]);
    expect(sent(calls[1]).records).toHaveLength(1);
    expect(sent(calls[1]).records[0]?.Phone).toBe("2");
    expect(result).toMatchObject({ delivered: 1, skipped: 1 });
  });

  it("shares the email → lead map across a run's batches", async () => {
    const { calls } = mockFetch(query([]), saved(LEAD_A), saved(LEAD_A));
    const leadIds = new Map<string, string>();
    const sf = client();
    await syncResponsesToSalesforce(
      sf,
      settings,
      [response([answer("e", "email", "a@b.co", "Email")])],
      leadIds
    );
    // The next batch of the same run: the map answers, nothing is created
    await syncResponsesToSalesforce(
      sf,
      settings,
      [
        response([
          answer("e", "email", "a@b.co", "Email"),
          answer("p", "phone", "2", "Phone"),
        ]),
      ],
      leadIds
    );
    expect(calls.map((call) => call.method)).toEqual(["GET", "POST", "PATCH"]);
    expect(sent(calls[2]).records[0]?.id).toBe(LEAD_A);
  });

  it("looks emails up on every delivery, so a re-run finds the leads it made", async () => {
    // A delivery that timed out after creating the lead runs again with a
    // new map and the same `attempts`: the lookup finds the lead.
    const { calls } = mockFetch(
      query([{ Id: LEAD_A, Email: "a@b.co" }]),
      saved(LEAD_A)
    );
    await syncResponsesToSalesforce(client(), settings, [
      response([
        answer("e", "email", "a@b.co", "Email"),
        answer("c", "text", "Acme", "Company"),
      ]),
    ]);
    expect(calls.map((call) => call.method)).toEqual(["GET", "PATCH"]);
  });

  it("makes no update call when only the email was answered", async () => {
    const { calls } = mockFetch(query([{ Id: LEAD_A, Email: "a@b.co" }]));
    const result = await syncResponsesToSalesforce(client(), settings, [
      response([answer("e", "email", "a@b.co", "Email")]),
    ]);
    expect(calls).toHaveLength(1);
    expect(result.delivered).toBe(1);
  });

  it("creates a lead when the one it found was converted or deleted meanwhile", async () => {
    const { calls } = mockFetch(
      query([{ Id: LEAD_A, Email: "a@b.co" }]),
      json([failed("CANNOT_UPDATE_CONVERTED_LEAD")]),
      saved(LEAD_B)
    );
    const leadIds = new Map<string, string>();
    await syncResponsesToSalesforce(
      client(),
      settings,
      [
        response([
          answer("e", "email", "a@b.co", "Email"),
          answer("p", "phone", "1", "Phone"),
        ]),
      ],
      leadIds
    );
    expect(calls.map((call) => call.method)).toEqual(["GET", "PATCH", "POST"]);
    expect(leadIds.get("a@b.co")).toBe(LEAD_B);
  });

  it("follows query pages", async () => {
    const { calls } = mockFetch(
      json({
        done: false,
        nextRecordsUrl: `/services/data/${SALESFORCE_API_VERSION}/query/01gD0000002HU6KIAW-2000`,
        records: [{ Id: LEAD_A, Email: "a@b.co" }],
      }),
      json({ done: true, records: [{ Id: LEAD_B, Email: "b@b.co" }] })
    );
    const found = await client().findOpenLeadIds(["a@b.co", "b@b.co"]);
    expect(found).toEqual(
      new Map([
        ["a@b.co", LEAD_A],
        ["b@b.co", LEAD_B],
      ])
    );
    expect(calls[1]?.url).toBe(`${API}/query/01gD0000002HU6KIAW-2000`);
  });

  it("keeps the newest open lead when an email has several", async () => {
    mockFetch(
      query([
        { Id: LEAD_B, Email: "a@b.co" },
        { Id: LEAD_A, Email: "A@B.CO" },
      ])
    );
    expect((await client().findOpenLeadIds(["a@b.co"])).get("a@b.co")).toBe(
      LEAD_B
    );
  });
});

describe("Salesforce: errors", () => {
  const one = () => [
    response([answer("e", "email", "ada@example.com", "Email")]),
  ];

  it("fails on a duplicate rule with a readable, final reason", async () => {
    mockFetch(
      query([]),
      json([failed("DUPLICATES_DETECTED", "Use one of these records?")])
    );
    const error = await rejection(
      syncResponsesToSalesforce(client(), settings, one())
    );
    expect(error.code).toBe("bad_request");
    expect(isRetryableSyncError(error)).toBe(false);
    const state = nextSyncState(
      initialSyncState(null),
      { ok: false, error },
      new Date("2026-11-01T10:00:00.000Z")
    );
    expect(state.status).toBe("failed");
    expect(state.lastError).toBe(
      "Salesforce: a duplicate rule blocked a lead; set the rule's action to Allow, then retry (DUPLICATES_DETECTED)"
    );
  });

  it("names a refused lead source", async () => {
    mockFetch(
      query([]),
      json([
        failed(
          "INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST",
          "Lead Source: bad value for restricted picklist field: QR",
          ["LeadSource"]
        ),
      ])
    );
    const error = await rejection(
      syncResponsesToSalesforce(
        client(),
        { ...settings, leadSource: "QR" },
        one()
      )
    );
    expect(isRetryableSyncError(error)).toBe(false);
    expect(describeSyncError(error)).toBe(
      "Salesforce: the lead source isn't a value its picklist allows; pick another in the sync settings, then retry (INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST: LeadSource)"
    );
  });

  it("shows a validation rule's own text, but never Salesforce's other messages", async () => {
    expect(
      describeSalesforceError(
        readSalesforceError({
          errors: [
            {
              statusCode: "FIELD_CUSTOM_VALIDATION_EXCEPTION",
              message: "Phone must have 10 digits",
              fields: [],
            },
          ],
        }) ?? { code: "", fields: [] }
      )
    ).toBe(
      "Salesforce: a validation rule rejected a lead “Phone must have 10 digits” (FIELD_CUSTOM_VALIDATION_EXCEPTION)"
    );
    mockFetch(
      query([]),
      json([
        failed(
          "STRING_TOO_LONG",
          "Description: data value too large: ada@example.com said hello",
          ["Description"]
        ),
      ])
    );
    const error = await rejection(
      syncResponsesToSalesforce(client(), settings, one())
    );
    expect(error.message).not.toContain("ada@");
    expect(describeSyncError(error)).not.toContain("ada@");
    expect(describeSyncError(error)).toContain("STRING_TOO_LONG: Description");
    expect(error.body).toBeUndefined();
  });

  it("names required fields and field errors", async () => {
    mockFetch(
      query([]),
      json([
        failed("REQUIRED_FIELD_MISSING", "Required fields are missing", [
          "Industry",
        ]),
      ])
    );
    const error = await rejection(
      syncResponsesToSalesforce(client(), settings, one())
    );
    expect(describeSyncError(error)).toBe(
      "Salesforce: a required lead field wasn't sent; map a question to it, then retry (REQUIRED_FIELD_MISSING: Industry)"
    );
  });

  it("records the leads a call made before failing on another", async () => {
    mockFetch(
      query([]),
      json([
        { id: LEAD_A, success: true, errors: [] },
        failed("FIELD_INTEGRITY_EXCEPTION", "", ["Country"]),
      ])
    );
    const leadIds = new Map<string, string>();
    const error = await rejection(
      syncResponsesToSalesforce(
        client(),
        settings,
        [
          response([answer("e", "email", "a@b.co", "Email")]),
          response([answer("e", "email", "b@b.co", "Email")]),
        ],
        leadIds
      )
    );
    expect(error.detail).toContain("FIELD_INTEGRITY_EXCEPTION: Country");
    expect(leadIds.get("a@b.co")).toBe(LEAD_A);
  });

  it("skips an email Salesforce calls invalid", async () => {
    mockFetch(
      query([]),
      json([
        { id: LEAD_A, success: true, errors: [] },
        failed("INVALID_EMAIL_ADDRESS", "Email: invalid email address: x@y.zz"),
      ])
    );
    const result = await syncResponsesToSalesforce(client(), settings, [
      response([answer("e", "email", "a@b.co", "Email")]),
      response([answer("e", "email", "x@y.zz", "Email")]),
    ]);
    expect(result).toMatchObject({ delivered: 1, skipped: 1 });
  });

  it("retries limits, locks and outages; stops on missing API access", async () => {
    mockFetch(
      json(
        [
          {
            errorCode: "REQUEST_LIMIT_EXCEEDED",
            message: "TotalRequests Limit exceeded.",
          },
        ],
        403
      ),
      json(
        [
          {
            errorCode: "API_DISABLED_FOR_ORG",
            message: "API is not enabled for this Organization or Partner",
          },
        ],
        403
      ),
      json([{ errorCode: "SERVER_UNAVAILABLE", message: "Try again" }], 503),
      json({ unexpected: true })
    );
    const limited = await rejection(client().findOpenLeadIds(["a@b.co"]));
    expect(limited.code).toBe("rate_limited");
    expect(isRetryableSyncError(limited)).toBe(true);
    expect(describeSyncError(limited)).toBe(
      "Salesforce: the org's API request limit is used up (REQUEST_LIMIT_EXCEEDED)"
    );
    const disabled = await rejection(client().findOpenLeadIds(["a@b.co"]));
    expect(disabled.code).toBe("forbidden");
    expect(isRetryableSyncError(disabled)).toBe(false);
    const down = await rejection(client().findOpenLeadIds(["a@b.co"]));
    expect(down.code).toBe("server");
    expect(isRetryableSyncError(down)).toBe(true);
    // A 2xx QRdx can't read is retried like an outage
    const odd = await rejection(client().findOpenLeadIds(["a@b.co"]));
    expect(odd.code).toBe("server");

    mockFetch(query([]), json([failed("UNABLE_TO_LOCK_ROW")]));
    const locked = await rejection(
      syncResponsesToSalesforce(client(), settings, one())
    );
    expect(isRetryableSyncError(locked)).toBe(true);
  });
});

describe("Salesforce: expired sessions", () => {
  const invalidSession = () =>
    json(
      [
        {
          errorCode: "INVALID_SESSION_ID",
          message: "Session expired or invalid",
        },
      ],
      401
    );

  it("refreshes on a 401 and tries the call once more with the new token", async () => {
    const refresh = vi.fn(async () => ({
      accessToken: "fresh-token",
      instanceUrl: "https://acme2.my.salesforce.com",
    }));
    const { calls } = mockFetch(invalidSession(), query([]), saved(LEAD_A));
    await syncResponsesToSalesforce(client(refresh), settings, [
      response([answer("e", "email", "a@b.co", "Email")]),
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls[1]?.headers.authorization).toBe("Bearer fresh-token");
    // The org moved: later calls go to the new address
    expect(calls[1]?.url.startsWith("https://acme2.my.salesforce.com/")).toBe(
      true
    );
    expect(calls[2]?.url.startsWith("https://acme2.my.salesforce.com/")).toBe(
      true
    );
  });

  it("asks for a reconnect when the new token is refused too, or without a refresh", async () => {
    const refresh = vi.fn(async () => ({
      accessToken: "fresh-token",
      instanceUrl: INSTANCE,
    }));
    mockFetch(invalidSession(), invalidSession());
    const error = await rejection(client(refresh).findOpenLeadIds(["a@b.co"]));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(error.code).toBe("unauthorized");
    expect(isRetryableSyncError(error)).toBe(false);

    mockFetch(invalidSession());
    expect((await rejection(client().findOpenLeadIds(["a@b.co"]))).code).toBe(
      "unauthorized"
    );
  });

  it("refreshes on the sign-in host, keeping a rotated refresh token", async () => {
    const { calls } = mockFetch(
      json({
        access_token: "new-access",
        instance_url: "https://acme--dev.sandbox.my.salesforce.com",
        refresh_token: "rotated",
        token_type: "Bearer",
      })
    );
    const session = await refreshSalesforceToken({
      environment: "sandbox",
      refreshToken: "old-refresh",
      clientId: "sf-id",
      clientSecret: "sf-secret",
    });
    expect(calls[0]?.url).toBe(
      "https://test.salesforce.com/services/oauth2/token"
    );
    expect(Object.fromEntries(new URLSearchParams(calls[0]?.body))).toEqual({
      grant_type: "refresh_token",
      refresh_token: "old-refresh",
      client_id: "sf-id",
      client_secret: "sf-secret",
    });
    expect(session).toEqual({
      accessToken: "new-access",
      instanceUrl: "https://acme--dev.sandbox.my.salesforce.com",
      refreshToken: "rotated",
    });
  });

  it("treats a refused refresh as 'reconnect', without echoing tokens", async () => {
    mockFetch(
      json(
        {
          error: "invalid_grant",
          error_description: "expired access/refresh token",
        },
        400
      )
    );
    const error = await rejection(
      refreshSalesforceToken({
        environment: "production",
        refreshToken: "secret-refresh",
        clientId: "sf-id",
        clientSecret: "sf-secret",
      })
    );
    expect(error.code).toBe("unauthorized");
    expect(error.message).not.toContain("secret");
  });
});

describe("Salesforce: org, sign-in hosts and revoke", () => {
  beforeAll(() => registerAllIntegrations());

  it("accepts only https Salesforce hosts as the org address", () => {
    expect(salesforceInstanceUrl("https://acme.my.salesforce.com/")).toBe(
      "https://acme.my.salesforce.com"
    );
    expect(
      salesforceInstanceUrl("https://acme--uat.sandbox.my.salesforce.com")
    ).toBe("https://acme--uat.sandbox.my.salesforce.com");
    for (const bad of [
      "http://acme.my.salesforce.com",
      "https://evil.com",
      "https://salesforce.com.evil.com",
      "https://evil.com/.salesforce.com",
      "https://user:pass@acme.my.salesforce.com",
      "https://acme.my.salesforce.com:8443",
      "",
      null,
    ]) {
      expect(salesforceInstanceUrl(bad), String(bad)).toBeNull();
    }
    expect(() =>
      createSalesforceClient({
        accessToken: "t",
        instanceUrl: "https://evil.com",
      })
    ).toThrow(IntegrationApiError);
  });

  it("keeps the org's address and id from the token response, nothing else", () => {
    const metadata = salesforceAccountMetadata({
      access_token: "secret",
      refresh_token: "secret-too",
      instance_url: INSTANCE,
      id: "https://login.salesforce.com/id/00D5g000004XyZaEAK/0055g00000AbCdEAAA",
      token_type: "Bearer",
    });
    expect(metadata).toEqual({
      name: "acme.my.salesforce.com",
      instanceUrl: INSTANCE,
      orgId: "00D5g000004XyZaEAK",
    });
    expect(JSON.stringify(metadata)).not.toContain("secret");
    expect(() =>
      salesforceAccountMetadata({ instance_url: "https://evil.com" })
    ).toThrow();
  });

  it("signs in on login.salesforce.com, or test.salesforce.com for a sandbox", () => {
    const env = {
      SALESFORCE_CLIENT_ID: "sf-id",
      SALESFORCE_CLIENT_SECRET: "sf-secret",
    };
    vi.stubEnv("NODE_ENV", "development");
    const config = getIntegrationConfigWithEnv("salesforce", env);
    const url = new URL(
      createOAuthHandler(config).generateAuthUrl("verifier", "state-1")
    );
    expect(url.origin + url.pathname).toBe(
      "https://login.salesforce.com/services/oauth2/authorize"
    );
    expect(url.searchParams.get("scope")).toBe("api refresh_token");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/integrations/salesforce/callback"
    );

    const sandbox = withOAuthVariant(config, "sandbox");
    expect(sandbox.oauth?.tokenUrl).toBe(
      "https://test.salesforce.com/services/oauth2/token"
    );
    expect(
      new URL(createOAuthHandler(sandbox).generateAuthUrl("v", "s")).origin
    ).toBe("https://test.salesforce.com");
    // Unknown names keep the default host
    expect(oauthVariantName(config, "https://evil.com")).toBeNull();
    expect(withOAuthVariant(config, "evil")).toBe(config);
    expect(() => getIntegrationConfigWithEnv("salesforce", {})).toThrow(
      /SALESFORCE_CLIENT_ID/
    );
  });

  it("revokes the refresh token on the host the connection signed in on", async () => {
    expect(salesforceEnvironment({ oauthVariant: "sandbox" })).toBe("sandbox");
    expect(salesforceEnvironment({})).toBe("production");
    const { calls } = mockFetch(
      new Response(null, { status: 200 }),
      new Response(null, { status: 200 })
    );
    expect(
      await revokeDataProviderToken(
        "salesforce",
        { accessToken: "at", refreshToken: "rt" },
        undefined,
        { oauthVariant: "sandbox", instanceUrl: INSTANCE }
      )
    ).toBe(true);
    expect(calls[0]?.url).toBe(
      "https://test.salesforce.com/services/oauth2/revoke"
    );
    expect(Object.fromEntries(new URLSearchParams(calls[0]?.body))).toEqual({
      token: "rt",
    });
    await revokeSalesforceToken({ environment: "production", token: "rt" });
    expect(calls[1]?.url).toBe(
      "https://login.salesforce.com/services/oauth2/revoke"
    );
  });

  it("reports a refused revoke as an error (disconnect still goes ahead)", async () => {
    mockFetch(json({ error: "unsupported_token_type" }, 400));
    const error = await rejection(
      revokeSalesforceToken({ environment: "production", token: "rt" })
    );
    expect(isIntegrationApiError(error)).toBe(true);
  });
});
