import {
  IntegrationApiError,
  isIntegrationApiError,
  providerRequest,
} from "../../core/http-client";
import { zohoDataCentreByAccounts, zohoDataCentreByApi } from "./data-centres";

const PROVIDER = { slug: "zoho-crm", name: "Zoho CRM" };
/** Zoho's limit on records in one upsert call. */
export const ZOHO_CRM_BATCH_SIZE = 100;
export const ZOHO_REVOKE_PATH = "/oauth/v2/revoke/token";
const API_VERSION = "v8";

/** A lead's fields by Zoho API name; `Email` is always there. */
export type ZohoLeadFields = Record<string, string> & { Email: string };

/** Zoho's answer for one record of an upsert, in the order sent. */
export type ZohoUpsertResult =
  | { status: "success"; action: "insert" | "update" | null }
  | {
      status: "error";
      /** Zoho's code, e.g. MANDATORY_NOT_FOUND */
      code: string;
      /** The field it's about (details.api_name), when Zoho names one */
      field: string | null;
    };

const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const FIELD = /^[A-Za-z][A-Za-z0-9_]{0,99}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Zoho's code only: its messages can quote what was sent. */
const describeZohoError = (body: unknown) => {
  const first = isRecord(body)
    ? Array.isArray(body.data) && isRecord(body.data[0])
      ? body.data[0].code
      : body.code
    : undefined;
  return typeof first === "string" && CODE.test(first)
    ? `request failed (${first}).`
    : undefined;
};

/**
 * Zoho answered with something other than what its docs describe. Retried
 * like a server error: nothing QRdx sent was refused.
 */
function unexpected(): never {
  throw new IntegrationApiError({
    provider: PROVIDER.slug,
    status: 200,
    code: "server",
    message: "Zoho CRM sent an answer QRdx didn't expect.",
  });
}

/** The per-record list of an upsert answer, or null when there isn't one. */
function recordList(body: unknown, count: number): unknown[] | null {
  const data = isRecord(body) ? body.data : undefined;
  return Array.isArray(data) && data.length === count ? data : null;
}

function readResult(entry: unknown): ZohoUpsertResult {
  if (!isRecord(entry)) unexpected();
  if (entry.status === "success") {
    const action =
      entry.action === "insert" || entry.action === "update"
        ? entry.action
        : null;
    return { status: "success", action };
  }
  if (entry.status === "error" && typeof entry.code === "string") {
    const field = isRecord(entry.details) ? entry.details.api_name : undefined;
    return {
      status: "error",
      code: CODE.test(entry.code) ? entry.code : "UNKNOWN",
      field: typeof field === "string" && FIELD.test(field) ? field : null,
    };
  }
  unexpected();
}

/**
 * Zoho CRM's API (v8) with an OAuth token, on the data centre the token
 * response named (`api_domain`). Errors carry Zoho's code, never its text.
 */
export class ZohoCrmClient {
  private readonly accessToken: string;
  private readonly baseUrl: string;

  constructor(accessToken: string, apiDomain: string) {
    const dc = zohoDataCentreByApi(apiDomain);
    if (!dc) {
      // Nothing is sent; a reconnect stores the data centre again, so the
      // row is flagged for one (as for a refused token).
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 401,
        code: "unauthorized",
        message: "Zoho CRM account address is invalid. Reconnect Zoho CRM.",
      });
    }
    this.accessToken = accessToken;
    this.baseUrl = dc.api;
  }

  /**
   * Inserts or updates leads, matched by email (duplicate_check_fields).
   * Zoho's workflow rules run as for any new or edited lead (no `trigger`
   * is sent). Callers send each email once per call.
   */
  async upsertLeads(leads: ZohoLeadFields[]): Promise<ZohoUpsertResult[]> {
    if (leads.length > ZOHO_CRM_BATCH_SIZE) {
      throw new RangeError(`At most ${ZOHO_CRM_BATCH_SIZE} leads per call`);
    }
    let body: unknown;
    try {
      body = await providerRequest<unknown>(
        PROVIDER,
        `${this.baseUrl}/crm/${API_VERSION}/Leads/upsert`,
        {
          method: "POST",
          headers: {
            Authorization: `Zoho-oauthtoken ${this.accessToken}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            data: leads,
            duplicate_check_fields: ["Email"],
          }),
          describeError: describeZohoError,
        }
      );
    } catch (error) {
      // When every record is refused, Zoho can answer 400 with the same
      // per-record list it sends (as 207) when only some are.
      if (
        isIntegrationApiError(error) &&
        error.status === 400 &&
        recordList(error.body, leads.length)
      ) {
        body = error.body;
      } else if (error instanceof SyntaxError) {
        unexpected();
      } else {
        throw error;
      }
    }
    const list = recordList(body, leads.length);
    if (!list) unexpected();
    return list.map(readResult);
  }
}

export function createZohoCrmClient(
  accessToken: string,
  apiDomain: string
): ZohoCrmClient {
  return new ZohoCrmClient(accessToken, apiDomain);
}

/**
 * Revokes the refresh token on the connection's accounts server, which ends
 * the access tokens made from it too. Throws for a server that isn't one of
 * Zoho's data centres, so the token never goes anywhere else.
 */
export async function revokeZohoToken(options: {
  token: string;
  clientId: string;
  clientSecret: string;
  accountsOrigin: string;
}): Promise<void> {
  const dc = zohoDataCentreByAccounts(options.accountsOrigin);
  if (!dc) {
    throw new IntegrationApiError({
      provider: PROVIDER.slug,
      status: 400,
      code: "bad_request",
      message: "Zoho CRM's accounts server is unknown.",
    });
  }
  await providerRequest(PROVIDER, `${dc.accounts}${ZOHO_REVOKE_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${options.clientId}:${options.clientSecret}`
      ).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      token: options.token,
      token_type: "refresh_token",
    }).toString(),
    ignoreBody: true,
  });
}
