import {
  errorCodeForStatus,
  IntegrationApiError,
  type IntegrationErrorCode,
  isIntegrationApiError,
  providerRequest,
} from "../../core/http-client";
import { SALESFORCE_LOGIN_HOSTS, type SalesforceEnvironment } from "./config";

/** The REST API version every call uses (Summer '25). */
export const SALESFORCE_API_VERSION = "v64.0";
const API = `/services/data/${SALESFORCE_API_VERSION}`;
const PROVIDER = { slug: "salesforce", name: "Salesforce" };
/** sObject Collections take at most 200 records per call. */
export const SALESFORCE_COLLECTION_SIZE = 200;
/** Emails per lookup query, and the most characters their list may take. */
const LOOKUP_EMAILS = 100;
const LOOKUP_LIST_CHARS = 6000;
/** Query pages (2,000 records each) read before giving up. */
const MAX_QUERY_PAGES = 20;
/** Token refreshes one client may make (one per rejected call). */
const MAX_REFRESHES = 2;

const INSTANCE_HOST =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:salesforce\.com|force\.com|cloudforce\.com|salesforce\.mil|sfcrmproducts\.cn)$/i;
const RECORD_ID = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;
const NEXT_RECORDS = /^\/services\/data\/v\d+\.\d+\/query\/[A-Za-z0-9-]{1,64}$/;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;

/**
 * The org's API origin from a token response's instance_url: https on a
 * Salesforce host only, so a token is never sent anywhere else.
 */
export function salesforceInstanceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !INSTANCE_HOST.test(url.hostname)
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/** The sign-in host a connection uses, from its metadata.oauthVariant. */
export function salesforceEnvironment(
  metadata: Record<string, unknown> | null | undefined
): SalesforceEnvironment {
  return metadata?.oauthVariant === "sandbox" ? "sandbox" : "production";
}

/**
 * Account details kept after OAuth, all from the token response (no call):
 * the org's API origin, its id and a name to show. Never a token or the
 * person's email.
 */
export function salesforceAccountMetadata(
  tokenResponse: Record<string, unknown> | undefined
): { name: string; instanceUrl: string; orgId: string | null } {
  const instanceUrl = salesforceInstanceUrl(tokenResponse?.instance_url);
  if (!instanceUrl) {
    throw new IntegrationApiError({
      provider: PROVIDER.slug,
      status: 502,
      code: "server",
      message: "Salesforce didn't say which org to use. Connect again.",
    });
  }
  const identity =
    typeof tokenResponse?.id === "string" ? tokenResponse.id : "";
  const orgId = /\/id\/(00D[A-Za-z0-9]{12,15})\//.exec(identity)?.[1] ?? null;
  return { name: new URL(instanceUrl).hostname, instanceUrl, orgId };
}

const SOQL_ESCAPES: Record<string, string> = {
  "\\": "\\\\",
  "'": "\\'",
  '"': '\\"',
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\b": "\\b",
  "\f": "\\f",
};

/** A SOQL string literal: quotes, backslashes and control characters escaped. */
export function soqlString(value: string): string {
  return `'${value.replace(/[\\'"\n\r\t\b\f]/g, (char) => SOQL_ESCAPES[char] ?? char)}'`;
}

/** Emails split so each lookup query stays well under the URL limit. */
export function lookupChunks(emails: string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let length = 0;
  for (const email of emails) {
    const literal = soqlString(email).length + 2;
    if (
      current.length >= LOOKUP_EMAILS ||
      (current.length > 0 && length + literal > LOOKUP_LIST_CHARS)
    ) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(email);
    length += literal;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

/** One Salesforce error: its code and fields. Its message isn't kept, since it can quote the answer. */
export interface SalesforceErrorInfo {
  code: string;
  fields: string[];
  /** Only for validation rules: the admin's own error text */
  ruleMessage?: string;
}

/**
 * Reads the first error from a REST error body (`[{errorCode, message,
 * fields}]`) or a record result (`{errors: [{statusCode, ...}]}`).
 */
export function readSalesforceError(body: unknown): SalesforceErrorInfo | null {
  const list = Array.isArray(body)
    ? body
    : Array.isArray((body as { errors?: unknown } | null)?.errors)
      ? (body as { errors: unknown[] }).errors
      : [];
  const first = list[0] as
    | {
        errorCode?: unknown;
        statusCode?: unknown;
        message?: unknown;
        fields?: unknown;
      }
    | undefined;
  if (!first || typeof first !== "object") return null;
  const raw = first.errorCode ?? first.statusCode;
  const code =
    typeof raw === "string" && ERROR_CODE.test(raw) ? raw : "UNKNOWN_ERROR";
  const fields = Array.isArray(first.fields)
    ? first.fields
        .filter(
          (field): field is string =>
            typeof field === "string" && FIELD_NAME.test(field)
        )
        .slice(0, 3)
    : [];
  // Validation rule messages are the admin's own static text, the most
  // useful part; every other message can quote the person's answer.
  const ruleMessage =
    code === "FIELD_CUSTOM_VALIDATION_EXCEPTION" &&
    typeof first.message === "string"
      ? first.message.replace(/\s+/g, " ").trim().slice(0, 120)
      : undefined;
  return { code, fields, ...(ruleMessage ? { ruleMessage } : {}) };
}

const REASONS: Record<string, string> = {
  DUPLICATES_DETECTED:
    "a duplicate rule blocked a lead; set the rule's action to Allow, then retry",
  FIELD_CUSTOM_VALIDATION_EXCEPTION: "a validation rule rejected a lead",
  REQUIRED_FIELD_MISSING:
    "a required lead field wasn't sent; map a question to it, then retry",
  INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST:
    "a value isn't allowed by a restricted picklist",
  INVALID_FIELD:
    "a mapped lead field doesn't exist or the connected user can't see it",
  INVALID_FIELD_FOR_INSERT_UPDATE:
    "the connected user can't write a mapped lead field",
  FIELD_INTEGRITY_EXCEPTION:
    "a value doesn't fit its field (for example with state and country picklists)",
  STRING_TOO_LONG: "a value is too long for its field",
  INVALID_TYPE_ON_FIELD_IN_RECORD: "a value has the wrong type for its field",
  CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY: "a flow or trigger failed on a lead",
  INSUFFICIENT_ACCESS_OR_READONLY:
    "the connected user can't create or edit leads",
  INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY:
    "the connected user can't use a record the lead refers to",
  INSUFFICIENT_ACCESS: "the connected user doesn't have access",
  API_DISABLED_FOR_ORG: "this Salesforce edition has no API access",
  API_CURRENTLY_DISABLED: "the connected user isn't allowed to use the API",
  REQUEST_LIMIT_EXCEEDED: "the org's API request limit is used up",
  UNABLE_TO_LOCK_ROW: "a lead was locked by another update",
  INVALID_SESSION_ID: "the session ended; reconnect Salesforce",
  UNKNOWN_ERROR: "sent an error QRdx couldn't read",
};

/** Safe text for the sync status: the reason, the code and the fields. */
export function describeSalesforceError(error: SalesforceErrorInfo): string {
  const leadSource =
    error.code === "INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST" &&
    error.fields.includes("LeadSource");
  const reason = leadSource
    ? "the lead source isn't a value its picklist allows; pick another in the sync settings, then retry"
    : (REASONS[error.code] ?? "Salesforce rejected a lead");
  const fields = error.fields.length > 0 ? `: ${error.fields.join(", ")}` : "";
  const rule = error.ruleMessage ? ` “${error.ruleMessage}”` : "";
  return `Salesforce: ${reason}${rule} (${error.code}${fields})`;
}

/** Retried with backoff: limits, locks and Salesforce's own failures. */
const RETRYABLE: Record<string, IntegrationErrorCode> = {
  REQUEST_LIMIT_EXCEEDED: "rate_limited",
  UNABLE_TO_LOCK_ROW: "server",
  SERVER_UNAVAILABLE: "server",
  UNKNOWN_EXCEPTION: "server",
  // A record result without a readable error
  UNKNOWN_ERROR: "server",
};

const FORBIDDEN = new Set([
  "API_DISABLED_FOR_ORG",
  "API_CURRENTLY_DISABLED",
  "INSUFFICIENT_ACCESS",
  "INSUFFICIENT_ACCESS_OR_READONLY",
  "INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY",
]);

/** The error a Salesforce error code (and HTTP status, 0 for a record) becomes. */
export function salesforceError(
  info: SalesforceErrorInfo,
  status: number,
  retryAfterSeconds?: number
): IntegrationApiError {
  const code: IntegrationErrorCode =
    RETRYABLE[info.code] ??
    (status === 401 || info.code === "INVALID_SESSION_ID"
      ? "unauthorized"
      : FORBIDDEN.has(info.code)
        ? "forbidden"
        : status >= 400
          ? errorCodeForStatus(status)
          : "bad_request");
  const detail = describeSalesforceError(info);
  return new IntegrationApiError({
    provider: PROVIDER.slug,
    status,
    code,
    message: detail,
    retryAfterSeconds,
    detail,
  });
}

/** A 2xx QRdx can't read: retried like an outage. */
function unexpectedResponse(): IntegrationApiError {
  return new IntegrationApiError({
    provider: PROVIDER.slug,
    status: 502,
    code: "server",
    message: "Salesforce sent a response QRdx didn't expect.",
    detail: "Salesforce: sent a response QRdx didn't expect",
  });
}

/** Request errors with Salesforce's codes; bodies (which can quote answers) dropped. */
function toSalesforceError(error: unknown): unknown {
  if (!isIntegrationApiError(error) || error.provider !== PROVIDER.slug) {
    return error;
  }
  const info = readSalesforceError(error.body);
  if (info) return salesforceError(info, error.status, error.retryAfterSeconds);
  return new IntegrationApiError({
    provider: error.provider,
    status: error.status,
    code: error.code,
    message: error.message,
    retryAfterSeconds: error.retryAfterSeconds,
  });
}

const quietDescription = (body: unknown) => {
  const info = readSalesforceError(body);
  return info ? describeSalesforceError(info) : undefined;
};

// ─── Client ─────────────────────────────────────────────────────────────────

export interface SalesforceSession {
  accessToken: string;
  instanceUrl: string;
  /** Only when the org rotates refresh tokens */
  refreshToken?: string;
}

export interface SalesforceClientOptions {
  accessToken: string;
  /** The org's API origin (the token response's instance_url) */
  instanceUrl: string;
  /**
   * A new access token after a 401 (Salesforce tokens carry no expiry, so a
   * rejected call is the signal). The caller stores it.
   */
  refresh?: () => Promise<SalesforceSession>;
}

export interface SalesforceSaveResult {
  id?: string | null;
  success: boolean;
  errors?: unknown[];
}

interface QueryPage<T> {
  done?: boolean;
  nextRecordsUrl?: string;
  records?: T[];
}

/** REST API on the org's instance with an OAuth token (scope `api`). */
export class SalesforceClient {
  private accessToken: string;
  private instanceUrl: string;
  private readonly refresh?: () => Promise<SalesforceSession>;
  private refreshes = 0;

  constructor(options: SalesforceClientOptions) {
    const instanceUrl = salesforceInstanceUrl(options.instanceUrl);
    if (!instanceUrl) {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 401,
        code: "unauthorized",
        message: "The Salesforce org address is missing. Reconnect Salesforce.",
      });
    }
    this.accessToken = options.accessToken;
    this.instanceUrl = instanceUrl;
    this.refresh = options.refresh;
  }

  /** One call; a 401 refreshes the token and tries once more. */
  private async request<T>(
    path: string,
    init: RequestInit = {},
    retried = false
  ): Promise<T> {
    try {
      return await providerRequest<T>(PROVIDER, `${this.instanceUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
          ...(init.body
            ? {
                "Content-Type": "application/json",
                // Duplicate rules set to Allow let the lead in, as they do
                // in Salesforce's own screens; Block still blocks.
                "Sforce-Duplicate-Rule-Header": "allowSave=true",
              }
            : {}),
          ...init.headers,
        },
        describeError: quietDescription,
      });
    } catch (error) {
      if (
        !retried &&
        this.refresh &&
        this.refreshes < MAX_REFRESHES &&
        isIntegrationApiError(error) &&
        error.status === 401
      ) {
        this.refreshes++;
        const session = await this.refresh();
        const instanceUrl = salesforceInstanceUrl(session.instanceUrl);
        if (!(session.accessToken && instanceUrl)) throw unexpectedResponse();
        this.accessToken = session.accessToken;
        this.instanceUrl = instanceUrl;
        return this.request<T>(path, init, true);
      }
      throw toSalesforceError(error);
    }
  }

  /** Every record a SOQL query returns, following its pages. */
  private async queryAll<T>(soql: string): Promise<T[]> {
    const records: T[] = [];
    let path: string | null =
      `${API}/query?${new URLSearchParams({ q: soql })}`;
    for (let page = 0; path; page++) {
      if (page >= MAX_QUERY_PAGES) {
        throw new IntegrationApiError({
          provider: PROVIDER.slug,
          status: 400,
          code: "bad_request",
          message: "Too many Salesforce leads share these emails.",
          detail: "Salesforce: too many open leads share these emails",
        });
      }
      const result: QueryPage<T> = await this.request<QueryPage<T>>(path);
      if (!Array.isArray(result?.records)) throw unexpectedResponse();
      records.push(...result.records);
      if (result.done !== false) break;
      if (
        !(result.nextRecordsUrl && NEXT_RECORDS.test(result.nextRecordsUrl))
      ) {
        throw unexpectedResponse();
      }
      path = result.nextRecordsUrl;
    }
    return records;
  }

  /**
   * The newest open (not converted) lead for each email, by email in
   * lowercase. SOQL compares emails without regard to case.
   */
  async findOpenLeadIds(emails: string[]): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    const unique = [...new Set(emails.map((email) => email.toLowerCase()))];
    for (const chunk of lookupChunks(unique)) {
      const soql = `SELECT Id, Email FROM Lead WHERE Email IN (${chunk
        .map(soqlString)
        .join(
          ", "
        )}) AND IsConverted = false ORDER BY CreatedDate DESC, Id DESC`;
      const records = await this.queryAll<{ Id?: unknown; Email?: unknown }>(
        soql
      );
      for (const record of records) {
        const email =
          typeof record.Email === "string" ? record.Email.toLowerCase() : "";
        if (
          email &&
          !found.has(email) &&
          typeof record.Id === "string" &&
          RECORD_ID.test(record.Id)
        ) {
          found.set(email, record.Id);
        }
      }
    }
    return found;
  }

  private async saveLeads(
    method: "POST" | "PATCH",
    records: Record<string, string>[]
  ): Promise<SalesforceSaveResult[]> {
    if (records.length > SALESFORCE_COLLECTION_SIZE) {
      throw new RangeError(
        `At most ${SALESFORCE_COLLECTION_SIZE} leads per call`
      );
    }
    if (records.length === 0) return [];
    const results = await this.request<unknown>(`${API}/composite/sobjects`, {
      method,
      body: JSON.stringify({
        allOrNone: false,
        records: records.map((record) => ({
          attributes: { type: "Lead" },
          ...record,
        })),
      }),
    });
    if (
      !Array.isArray(results) ||
      results.length !== records.length ||
      results.some(
        (result) =>
          !result ||
          typeof (result as { success?: unknown }).success !== "boolean"
      )
    ) {
      throw unexpectedResponse();
    }
    return results as SalesforceSaveResult[];
  }

  /** Creates leads; one result per record, in order (allOrNone off). */
  createLeads(
    records: Record<string, string>[]
  ): Promise<SalesforceSaveResult[]> {
    return this.saveLeads("POST", records);
  }

  /** Updates leads by id; one result per record, in order (allOrNone off). */
  updateLeads(
    records: ({ id: string } & Record<string, string>)[]
  ): Promise<SalesforceSaveResult[]> {
    return this.saveLeads("PATCH", records);
  }
}

export function createSalesforceClient(
  options: SalesforceClientOptions
): SalesforceClient {
  return new SalesforceClient(options);
}

// ─── OAuth: refresh and revoke ──────────────────────────────────────────────

const FORM = {
  "Content-Type": "application/x-www-form-urlencoded",
  Accept: "application/json",
};

/** Token endpoint errors name the OAuth error only. */
const describeTokenError = (body: unknown) => {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === "string" && /^[a-z_]{1,40}$/.test(error)
    ? `token request failed (${error}).`
    : undefined;
};

/**
 * A new access token from the refresh token, on the host the person signed
 * in on. A refused refresh (revoked, expired, app blocked) means reconnect.
 */
export async function refreshSalesforceToken(options: {
  environment: SalesforceEnvironment;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<SalesforceSession> {
  let data: {
    access_token?: unknown;
    instance_url?: unknown;
    refresh_token?: unknown;
  };
  try {
    data = await providerRequest(
      PROVIDER,
      `${SALESFORCE_LOGIN_HOSTS[options.environment]}/services/oauth2/token`,
      {
        method: "POST",
        headers: FORM,
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: options.refreshToken,
          client_id: options.clientId,
          client_secret: options.clientSecret,
        }).toString(),
        describeError: describeTokenError,
      }
    );
  } catch (error) {
    if (
      isIntegrationApiError(error) &&
      (error.status === 400 || error.status === 401)
    ) {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 401,
        code: "unauthorized",
        message: "Salesforce ended the connection. Reconnect Salesforce.",
        detail:
          "Salesforce: the connection was revoked or expired; reconnect Salesforce",
      });
    }
    throw error;
  }
  const instanceUrl = salesforceInstanceUrl(data?.instance_url);
  if (!(typeof data?.access_token === "string" && data.access_token)) {
    throw unexpectedResponse();
  }
  if (!instanceUrl) throw unexpectedResponse();
  return {
    accessToken: data.access_token,
    instanceUrl,
    ...(typeof data.refresh_token === "string" && data.refresh_token
      ? { refreshToken: data.refresh_token }
      : {}),
  };
}

/** Revokes the refresh token, which ends its access tokens too. */
export async function revokeSalesforceToken(options: {
  environment: SalesforceEnvironment;
  token: string;
}): Promise<void> {
  await providerRequest(
    PROVIDER,
    `${SALESFORCE_LOGIN_HOSTS[options.environment]}/services/oauth2/revoke`,
    {
      method: "POST",
      headers: FORM,
      body: new URLSearchParams({ token: options.token }).toString(),
      describeError: describeTokenError,
    }
  );
}
