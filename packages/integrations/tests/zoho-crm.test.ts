// Zoho CRM: form responses to leads. Zoho's API is a stubbed fetch with the
// shapes its docs describe (upsert-records, multi-dc, revoke); nothing here
// has met a real Zoho account.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchDataAccountMetadata,
  revokeDataProviderToken,
} from "../src/capabilities/data-factory";
import { IntegrationApiError } from "../src/core/http-client";
import {
  createZohoCrmClient,
  revokeZohoToken,
  ZOHO_CRM_BATCH_SIZE,
  type ZohoLeadFields,
} from "../src/integrations/zoho-crm/client";
import {
  ZOHO_DATA_CENTRES,
  zohoDataCentreByAccounts,
  zohoDataCentreByApi,
} from "../src/integrations/zoho-crm/data-centres";
import {
  upsertResponsesToZohoCrm,
  withFallbackLastName,
  ZOHO_CRM_TARGETS,
  zohoLeads,
} from "../src/integrations/zoho-crm/sink";
import {
  getIntegrationConfigWithEnv,
  registerAllIntegrations,
} from "../src/registry/loader";
import {
  describeSyncError,
  initialSyncState,
  isRetryableSyncError,
  nextSyncState,
  SYNC_BATCH_SIZE,
  syncBatchSize,
} from "../src/sinks/state";
import {
  SINK_PROVIDERS,
  SINK_STREAMS,
  type SinkAnswer,
  type SinkFormResponse,
} from "../src/sinks/types";
import { bodyOf, json, mockFetch, type RecordedCall } from "./helpers";

const API = "https://www.zohoapis.in";
const UPSERT = `${API}/crm/v8/Leads/upsert`;
const NO_FILTER = { pageIds: null, forms: {} };

let seq = 0;
function answer(
  label: string,
  type: string,
  text: string,
  id = label.toLowerCase().replace(/\W+/g, "_")
): SinkAnswer {
  return { id, label, type, value: text, text };
}
function response(
  answers: SinkAnswer[],
  overrides: Partial<SinkFormResponse> = {}
): SinkFormResponse {
  seq++;
  return {
    id: `resp_${seq}`,
    createdAt: new Date(Date.UTC(2026, 10, 28, 9, 0, seq)).toISOString(),
    pageId: "page_1",
    pageTitle: "Spring open day",
    formId: "form_1",
    codeSlug: "spring",
    answers,
    ...overrides,
  };
}
const email = (value: string) => answer("Email", "email", value);

/** Zoho's answer to an upsert: one entry per record sent, in order. */
type Outcome =
  | "insert"
  | "update"
  | { code: string; field?: string; status?: number };
function zohoAnswer(outcomes: Outcome[], status?: number) {
  const data = outcomes.map((outcome) =>
    typeof outcome === "string"
      ? {
          code: "SUCCESS",
          duplicate_field: outcome === "update" ? "Email" : null,
          action: outcome,
          details: { id: "5725767000000524157" },
          message: outcome === "update" ? "record updated" : "record added",
          status: "success",
        }
      : {
          code: outcome.code,
          details: outcome.field
            ? { api_name: outcome.field, json_path: "$.data[0]" }
            : {},
          message: "the value the person typed: ada@example.com",
          status: "error",
        }
  );
  const failed = outcomes.filter((outcome) => typeof outcome !== "string");
  const code =
    status ??
    (failed.length === 0 ? 200 : failed.length === outcomes.length ? 400 : 207);
  return json({ data }, code);
}
const sentLeads = (call: RecordedCall | undefined) =>
  (bodyOf(call) as { data: ZohoLeadFields[] }).data;

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("Zoho's data centres", () => {
  it("knows each data centre by its accounts server and its CRM API", () => {
    for (const dc of ZOHO_DATA_CENTRES) {
      expect(zohoDataCentreByAccounts(dc.accounts)).toBe(dc);
      expect(zohoDataCentreByAccounts(`${dc.accounts}/`)).toBe(dc);
      expect(zohoDataCentreByApi(dc.api)).toBe(dc);
    }
    expect(ZOHO_DATA_CENTRES.map((dc) => dc.id)).toEqual([
      "us",
      "eu",
      "in",
      "au",
      "jp",
      "ca",
      "sa",
      "uk",
    ]);
  });

  it.each([
    "https://evil.example",
    "http://www.zohoapis.in",
    "https://www.zohoapis.in.evil.example",
    "https://www.zohoapis.in:444",
    "https://www.zohoapis.in/crm",
    "https://x@www.zohoapis.in",
    "https://api.zoho.in",
    "https://www.zohoapis.com.cn",
    "",
    null,
    42,
  ])("refuses %j as an API domain", (value) => {
    expect(zohoDataCentreByApi(value)).toBeNull();
    expect(zohoDataCentreByAccounts(value)).toBeNull();
  });
});

describe("Zoho CRM as a sink", () => {
  it("carries form responses in metadata.sync, read in full batches", () => {
    expect(SINK_PROVIDERS).toContain("zoho-crm");
    expect(SINK_STREAMS["zoho-crm"]).toEqual([
      { stream: "responses", key: "sync" },
    ]);
    expect(syncBatchSize("zoho-crm")).toBe(SYNC_BATCH_SIZE);
  });

  it("is 'not configured' without its credentials, naming them", () => {
    registerAllIntegrations();
    expect(() => getIntegrationConfigWithEnv("zoho-crm", {})).toThrow(
      /ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET/
    );
  });
});

describe("zohoLeads (mapping)", () => {
  it("suggests email, name, phone and company, by type and label", () => {
    const { leads, skipped } = zohoLeads(
      [
        response([
          email("Ada@Example.com "),
          answer("Full name", "text", "Ada King Lovelace"),
          answer("Phone", "phone", "+44 20 7946 0000"),
          answer("Company", "text", "Analytical Engines"),
          answer("Job title", "text", "Engineer"),
          answer("Favourite colour", "text", "green"),
        ]),
      ],
      NO_FILTER
    );
    expect(skipped).toBe(0);
    expect(leads).toEqual([
      {
        Email: "ada@example.com",
        First_Name: "Ada",
        Last_Name: "King Lovelace",
        Phone: "+44 20 7946 0000",
        Company: "Analytical Engines",
        Designation: "Engineer",
      },
    ]);
  });

  it("keeps one lead per email, the latest answers winning", () => {
    const { leads, skipped } = zohoLeads(
      [
        response([email("ada@example.com"), answer("City", "text", "London")]),
        response([email("bob@example.com")]),
        response([email("ADA@example.com"), answer("City", "text", "Paris")]),
      ],
      NO_FILTER
    );
    expect(leads).toEqual([
      { Email: "bob@example.com" },
      { Email: "ada@example.com", City: "Paris" },
    ]);
    expect(skipped).toBe(1);
  });

  it("skips responses without a valid email, from other pages, or with an email Zoho can't hold", () => {
    const long = `${"a".repeat(95)}@example.com`;
    const { leads, skipped } = zohoLeads(
      [
        response([answer("Name", "text", "No email")]),
        response([email("not an email")]),
        response([email(long)]),
        response([email("ada@example.com")], { pageId: "page_2" }),
        response([email("bob@example.com")]),
      ],
      { pageIds: ["page_1"], forms: {} }
    );
    expect(leads).toEqual([{ Email: "bob@example.com" }]);
    expect(skipped).toBe(4);
  });

  it("cuts values to Zoho's field lengths, never inside a character", () => {
    const { leads } = zohoLeads(
      [
        response([
          email("ada@example.com"),
          answer("First name", "text", "😀".repeat(50)),
          answer("City", "text", "C".repeat(60)),
          answer("Phone", "phone", "1".repeat(40)),
        ]),
      ],
      NO_FILTER
    );
    const [lead] = leads;
    expect(Array.from(lead?.First_Name ?? "")).toHaveLength(40);
    expect(lead?.City).toHaveLength(30);
    expect(lead?.Phone).toHaveLength(30);
  });

  it("writes only standard lead fields, whatever a saved mapping names", () => {
    const { leads } = zohoLeads(
      [
        response([
          email("ada@example.com"),
          answer("Owner", "text", "123", "f1"),
          answer("Status", "text", "Junk Lead", "f2"),
          answer("Mobile", "text", "07700 900000", "f3"),
        ]),
      ],
      {
        pageIds: null,
        forms: {
          "page_1:form_1": {
            fields: {
              email: "email",
              f1: "Owner",
              f2: "Lead_Status",
              f3: "Mobile",
            },
          },
        },
      }
    );
    expect(leads).toEqual([
      { Email: "ada@example.com", Mobile: "07700 900000" },
    ]);
  });

  it("offers only fields QRdx writes in the mapping UI", () => {
    for (const target of ZOHO_CRM_TARGETS) {
      if (target.id === "__fullname" || target.id === "email") continue;
      const { leads } = zohoLeads(
        [response([email("a@example.com"), answer("X", "text", "v", "x")])],
        {
          pageIds: null,
          forms: {
            "page_1:form_1": { fields: { email: "email", x: target.id } },
          },
        }
      );
      expect(leads[0], target.id).toHaveProperty(target.id, "v");
    }
  });
});

describe("withFallbackLastName", () => {
  it("moves a lone first name to the last name", () => {
    expect(
      withFallbackLastName({ Email: "ada@example.com", First_Name: "Ada" })
    ).toEqual({ Email: "ada@example.com", Last_Name: "Ada" });
  });

  it("uses the part of the email before the @ when there's no name", () => {
    expect(
      withFallbackLastName({ Email: "ada.lovelace@example.com", City: "X" })
    ).toEqual({
      Email: "ada.lovelace@example.com",
      City: "X",
      Last_Name: "ada.lovelace",
    });
  });
});

describe("upsertResponsesToZohoCrm", () => {
  const client = () => createZohoCrmClient("zoho-token", API);

  it("upserts leads by email on the data centre's API, with Zoho's token header", async () => {
    const { calls } = mockFetch(zohoAnswer(["insert", "update"]));
    const responses = [
      response([
        email("ada@example.com"),
        answer("Last name", "text", "Byron"),
      ]),
      response([email("bob@example.com")]),
    ];
    const result = await upsertResponsesToZohoCrm(
      client(),
      NO_FILTER,
      responses
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(UPSERT);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers.authorization).toBe("Zoho-oauthtoken zoho-token");
    expect(bodyOf(calls[0])).toEqual({
      data: [
        { Email: "ada@example.com", Last_Name: "Byron" },
        { Email: "bob@example.com" },
      ],
      duplicate_check_fields: ["Email"],
    });
    expect(result).toEqual({
      delivered: 2,
      skipped: 0,
      cursor: {
        at: responses[1]?.createdAt,
        id: responses[1]?.id,
      },
    });
  });

  it("sends at most 100 leads a call", async () => {
    const responses = Array.from({ length: 150 }, (_, index) =>
      response([email(`p${index}@example.com`), answer("Surname", "text", "X")])
    );
    const { calls } = mockFetch(
      zohoAnswer(Array.from({ length: 100 }, () => "insert" as const)),
      zohoAnswer(Array.from({ length: 50 }, () => "insert" as const))
    );
    const result = await upsertResponsesToZohoCrm(
      client(),
      NO_FILTER,
      responses
    );
    expect(sentLeads(calls[0])).toHaveLength(ZOHO_CRM_BATCH_SIZE);
    expect(sentLeads(calls[1])).toHaveLength(50);
    expect(result.delivered).toBe(150);
  });

  it("gives a new lead without a last name a stand-in, and only a new one", async () => {
    const { calls } = mockFetch(
      // ada: Zoho can't insert without a last name; bob: an existing lead,
      // updated without one; cy: has a last name
      zohoAnswer([
        { code: "MANDATORY_NOT_FOUND", field: "Last_Name" },
        "update",
        "insert",
      ]),
      zohoAnswer(["insert"])
    );
    const result = await upsertResponsesToZohoCrm(client(), NO_FILTER, [
      response([email("ada@example.com"), answer("First name", "text", "Ada")]),
      response([email("bob@example.com")]),
      response([email("cy@example.com"), answer("Surname", "text", "Young")]),
    ]);

    // First call: nobody gets a stand-in
    expect(sentLeads(calls[0])).toEqual([
      { Email: "ada@example.com", First_Name: "Ada" },
      { Email: "bob@example.com" },
      { Email: "cy@example.com", Last_Name: "Young" },
    ]);
    // Second call: only the lead Zoho couldn't insert
    expect(sentLeads(calls[1])).toEqual([
      { Email: "ada@example.com", Last_Name: "Ada" },
    ]);
    expect(result).toMatchObject({ delivered: 3, skipped: 0 });
  });

  it("uses the email's local part when the new lead has no name at all", async () => {
    const { calls } = mockFetch(
      zohoAnswer([{ code: "MANDATORY_NOT_FOUND", field: "Last_Name" }]),
      zohoAnswer(["insert"])
    );
    await upsertResponsesToZohoCrm(client(), NO_FILTER, [
      response([email("grace.hopper@example.com")]),
    ]);
    expect(sentLeads(calls[1])).toEqual([
      { Email: "grace.hopper@example.com", Last_Name: "grace.hopper" },
    ]);
  });

  it("skips a response whose values Zoho refuses, and delivers the rest", async () => {
    mockFetch(
      zohoAnswer([
        "insert",
        { code: "INVALID_DATA", field: "Website" },
        { code: "DUPLICATE_DATA", field: "Secondary_Email" },
      ])
    );
    const result = await upsertResponsesToZohoCrm(client(), NO_FILTER, [
      response([email("a@example.com"), answer("Surname", "text", "A")]),
      response([email("b@example.com"), answer("Surname", "text", "B")]),
      response([email("c@example.com"), answer("Surname", "text", "C")]),
    ]);
    expect(result).toMatchObject({ delivered: 1, skipped: 2 });
  });

  it("reads Zoho's per-record list when every lead is refused (HTTP 400)", async () => {
    mockFetch(zohoAnswer([{ code: "INVALID_DATA", field: "Phone" }], 400));
    const result = await upsertResponsesToZohoCrm(client(), NO_FILTER, [
      response([email("a@example.com"), answer("Surname", "text", "A")]),
    ]);
    expect(result).toMatchObject({ delivered: 0, skipped: 1 });
  });

  it("stops the stream, naming the field, when Zoho needs one QRdx doesn't fill", async () => {
    mockFetch(zohoAnswer([{ code: "MANDATORY_NOT_FOUND", field: "Company" }]));
    const error = await rejection(
      upsertResponsesToZohoCrm(client(), NO_FILTER, [
        response([email("ada@example.com"), answer("Surname", "text", "L")]),
      ])
    );
    expect(error).toBeInstanceOf(IntegrationApiError);
    const apiError = error as IntegrationApiError;
    expect(apiError.code).toBe("bad_request");
    expect(isRetryableSyncError(apiError)).toBe(false);
    expect(describeSyncError(apiError)).toBe(
      "Zoho CRM: a new lead needs a value for Company; map a question to it or make it optional in Zoho CRM, then retry (MANDATORY_NOT_FOUND)"
    );
    // Zoho's own message (which can quote the person's answers) isn't kept
    expect(JSON.stringify(apiError.detail)).not.toContain("ada@example.com");
    expect(apiError.message).not.toContain("ada@example.com");
  });

  it("stops when the stand-in last name is refused too", async () => {
    mockFetch(
      zohoAnswer([{ code: "MANDATORY_NOT_FOUND", field: "Last_Name" }]),
      zohoAnswer([{ code: "MANDATORY_NOT_FOUND", field: "Last_Name" }])
    );
    const error = (await rejection(
      upsertResponsesToZohoCrm(client(), NO_FILTER, [
        response([email("ada@example.com")]),
      ])
    )) as IntegrationApiError;
    expect(error.detail).toContain("Last_Name");
  });

  it("retries a lead Zoho failed on its side", async () => {
    mockFetch(zohoAnswer([{ code: "INTERNAL_ERROR" }], 207));
    const error = (await rejection(
      upsertResponsesToZohoCrm(client(), NO_FILTER, [
        response([email("ada@example.com"), answer("Surname", "text", "L")]),
      ])
    )) as IntegrationApiError;
    expect(error.code).toBe("server");
    expect(isRetryableSyncError(error)).toBe(true);
  });

  it.each([
    [401, { code: "INVALID_TOKEN", status: "error" }, "unauthorized", false],
    [
      401,
      { code: "OAUTH_SCOPE_MISMATCH", status: "error" },
      "unauthorized",
      false,
    ],
    [403, { code: "NO_PERMISSION", status: "error" }, "forbidden", false],
    [429, { code: "TOO_MANY_REQUESTS", status: "error" }, "rate_limited", true],
    [500, { code: "INTERNAL_ERROR", status: "error" }, "server", true],
  ] as const)(
    "maps HTTP %i (%j) to %s",
    async (status, body, code, retried) => {
      mockFetch(json(body, status));
      const error = (await rejection(
        upsertResponsesToZohoCrm(client(), NO_FILTER, [
          response([email("ada@example.com")]),
        ])
      )) as IntegrationApiError;
      expect(error.code).toBe(code);
      expect(isRetryableSyncError(error)).toBe(retried);
      expect(error.message).toContain(body.code);
    }
  );

  it("retries an answer that isn't what Zoho's docs describe", async () => {
    mockFetch(json({ data: [] }));
    const error = (await rejection(
      upsertResponsesToZohoCrm(client(), NO_FILTER, [
        response([email("ada@example.com")]),
      ])
    )) as IntegrationApiError;
    expect(error.code).toBe("server");
    expect(isRetryableSyncError(error)).toBe(true);
  });

  it("sends nothing for a batch with no leads, and still moves the cursor", async () => {
    const { calls } = mockFetch();
    const responses = [response([answer("Name", "text", "No email")])];
    const result = await upsertResponsesToZohoCrm(
      client(),
      NO_FILTER,
      responses
    );
    expect(calls).toEqual([]);
    expect(result).toEqual({
      delivered: 0,
      skipped: 1,
      cursor: { at: responses[0]?.createdAt, id: responses[0]?.id },
    });
  });

  it("counts what went through after a retry, like the other sinks", () => {
    const state = nextSyncState(initialSyncState(null), {
      ok: true,
      result: { delivered: 2, skipped: 1, cursor: { at: "x", id: "y" } },
    });
    expect(state).toMatchObject({ delivered: 2, skipped: 1, status: "ok" });
  });
});

describe("ZohoCrmClient", () => {
  it("refuses a data centre off Zoho's list before sending anything, asking for a reconnect", () => {
    const { calls } = mockFetch();
    for (const domain of [
      "",
      "https://evil.example",
      "http://www.zohoapis.in",
    ]) {
      let error: unknown;
      try {
        createZohoCrmClient("zoho-token", domain);
      } catch (caught) {
        error = caught;
      }
      expect((error as IntegrationApiError).code, domain).toBe("unauthorized");
    }
    expect(calls).toEqual([]);
  });

  it("refuses more than 100 leads in one call", async () => {
    const leads = Array.from({ length: 101 }, (_, index) => ({
      Email: `p${index}@example.com`,
    }));
    await expect(
      createZohoCrmClient("t", API).upsertLeads(leads)
    ).rejects.toBeInstanceOf(RangeError);
  });
});

describe("Zoho CRM connection details and disconnect", () => {
  const client = { clientId: "zoho-id", clientSecret: "zoho-secret" };

  it("saves the data centre from the token response, and no tokens", async () => {
    const metadata = await fetchDataAccountMetadata("zoho-crm", "z-access", {
      access_token: "z-access",
      refresh_token: "z-refresh",
      api_domain: "https://www.zohoapis.eu",
      token_type: "Bearer",
      expires_in: 3600,
    });
    expect(metadata).toEqual({
      name: "Zoho CRM (EU data centre)",
      apiDomain: "https://www.zohoapis.eu",
      dataCentre: "eu",
    });
    expect(JSON.stringify(metadata)).not.toContain("z-");
  });

  it.each([
    ["another host", { api_domain: "https://evil.example" }],
    ["Zoho's generic API host", { api_domain: "https://api.zoho.com" }],
    ["no api_domain", {}],
  ])(
    "refuses to connect when the token response has %s",
    async (_name, extra) => {
      const error = (await rejection(
        fetchDataAccountMetadata("zoho-crm", "z-access", {
          access_token: "z-access",
          ...extra,
        })
      )) as IntegrationApiError;
      expect(error).toBeInstanceOf(IntegrationApiError);
      expect(error.code).toBe("bad_request");
    }
  );

  it("revokes the refresh token on the connection's accounts server", async () => {
    const { calls } = mockFetch(new Response(null, { status: 200 }));
    await expect(
      revokeDataProviderToken(
        "zoho-crm",
        { accessToken: "z-access", refreshToken: "z-refresh" },
        client,
        { oauthTokenOrigin: "https://accounts.zoho.in", apiDomain: API }
      )
    ).resolves.toBe(true);
    expect(calls[0]?.url).toBe(
      "https://accounts.zoho.in/oauth/v2/revoke/token"
    );
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from("zoho-id:zoho-secret").toString("base64")}`
    );
    expect(Object.fromEntries(new URLSearchParams(calls[0]?.body))).toEqual({
      token: "z-refresh",
      token_type: "refresh_token",
    });
  });

  it("revokes on accounts.zoho.com when the connection named no data centre", async () => {
    const { calls } = mockFetch(new Response(null, { status: 200 }));
    await revokeDataProviderToken(
      "zoho-crm",
      { accessToken: "a", refreshToken: "r" },
      client,
      { apiDomain: "https://www.zohoapis.com" }
    );
    expect(calls[0]?.url).toBe(
      "https://accounts.zoho.com/oauth/v2/revoke/token"
    );
  });

  it("never sends the token to an accounts server off Zoho's list", async () => {
    const { calls } = mockFetch();
    const error = await rejection(
      revokeZohoToken({
        token: "z-refresh",
        ...client,
        accountsOrigin: "https://evil.example",
      })
    );
    expect(error).toBeInstanceOf(IntegrationApiError);
    expect(calls).toEqual([]);
  });

  it("has nothing to revoke without a refresh token or the app's credentials", async () => {
    const { calls } = mockFetch();
    expect(
      await revokeDataProviderToken("zoho-crm", { accessToken: "a" }, client)
    ).toBe(false);
    expect(
      await revokeDataProviderToken("zoho-crm", {
        accessToken: "a",
        refreshToken: "r",
      })
    ).toBe(false);
    expect(calls).toEqual([]);
  });
});

beforeAll(() => {
  registerAllIntegrations();
});
