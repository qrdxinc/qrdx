import { IntegrationApiError, providerRequest } from "../../core/http-client";

const PROVIDER = { slug: "pipedrive", name: "Pipedrive" };
export const PIPEDRIVE_REVOKE_URL = "https://oauth.pipedrive.com/oauth/revoke";

/** One label of letters, digits and dashes in front of pipedrive.com. */
const API_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.pipedrive\.com$/;
/** The longest `term` /v2/persons/search takes (maxLength in Pipedrive's spec). */
export const PIPEDRIVE_MAX_SEARCH_TERM = 100;
/** Search results read per call; the oldest person (lowest id) is used. */
const SEARCH_LIMIT = 10;
const MAX_TITLE_LENGTH = 255;

/**
 * The `api_domain` of a token response as an origin, or null when it isn't a
 * company address on pipedrive.com. The access token is sent to this host, so
 * anything else (another domain, a port, a path, credentials) is refused.
 */
export function parsePipedriveApiDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const plain =
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    !url.search &&
    !url.hash &&
    url.pathname === "/";
  return plain && API_HOST.test(url.hostname) ? url.origin : null;
}

/** A phone number as Pipedrive lists it on a person. */
export interface PipedrivePhone {
  value: string;
  primary: boolean;
  label?: string;
}

export interface PipedriveNewPerson {
  name: string;
  email: string;
  /** Distinct numbers, the first one primary */
  phones: string[];
}

export interface PipedrivePersonPatch {
  name?: string;
  /** The person's whole list: what is there already, then the new ones */
  phones?: PipedrivePhone[];
}

/**
 * Pipedrive answered 2xx with something other than what its docs describe.
 * Retried like a server error: nothing QRdx sent was refused, and a passing
 * glitch (a proxy's page, a half-sent body) shouldn't stop the stream for good.
 */
function unexpected(what: string): never {
  throw new IntegrationApiError({
    provider: PROVIDER.slug,
    status: 200,
    code: "server",
    message: `Pipedrive sent a ${what} QRdx didn't expect.`,
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const dataOf = (body: unknown, what: string): unknown => {
  if (!(isRecord(body) && body.success === true && "data" in body)) {
    unexpected(what);
  }
  return body.data;
};

const idOf = (value: unknown, what: string): number => {
  if (!(typeof value === "number" && Number.isInteger(value) && value > 0)) {
    unexpected(what);
  }
  return value;
};

/**
 * Pipedrive's API (persons and search on v2, leads on v1) with an OAuth
 * token, on the company address the token response named.
 *
 * Pipedrive's error text can quote what was sent (names, emails), so errors
 * carry our own wording and the status only.
 */
export class PipedriveClient {
  private readonly accessToken: string;
  private readonly baseUrl: string;

  constructor(accessToken: string, apiDomain: string) {
    const origin = parsePipedriveApiDomain(apiDomain);
    if (!origin) {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 400,
        code: "bad_request",
        message: "Pipedrive account address is invalid. Reconnect Pipedrive.",
      });
    }
    this.accessToken = accessToken;
    this.baseUrl = origin;
  }

  private async request(
    path: string,
    init: RequestInit = {}
  ): Promise<unknown> {
    try {
      return await providerRequest<unknown>(
        PROVIDER,
        `${this.baseUrl}${path}`,
        {
          ...init,
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            Accept: "application/json",
            ...(init.body ? { "Content-Type": "application/json" } : {}),
          },
          describeError: () => undefined,
        }
      );
    } catch (error) {
      // A 2xx answer that isn't JSON (a proxy's page, say)
      if (error instanceof SyntaxError) unexpected("answer");
      throw error;
    }
  }

  /**
   * The person with this email, or null. Pipedrive lets several persons share
   * an address; the oldest (lowest id) is the one updated.
   */
  async findPersonByEmail(email: string): Promise<number | null> {
    const query = new URLSearchParams({
      term: email,
      fields: "email",
      exact_match: "true",
      limit: String(SEARCH_LIMIT),
    });
    const data = dataOf(
      await this.request(`/api/v2/persons/search?${query}`),
      "search result"
    );
    const items = isRecord(data) ? data.items : undefined;
    if (!Array.isArray(items)) unexpected("search result");
    const ids = items.map((entry) => {
      const item = isRecord(entry) ? entry.item : undefined;
      return idOf(isRecord(item) ? item.id : undefined, "search result");
    });
    return ids.length > 0 ? Math.min(...ids) : null;
  }

  /** The numbers on a person, as Pipedrive lists them. */
  async getPersonPhones(personId: number): Promise<PipedrivePhone[]> {
    const data = dataOf(
      await this.request(`/api/v2/persons/${personId}`),
      "person"
    );
    const phones = isRecord(data) ? data.phones : undefined;
    if (!Array.isArray(phones)) unexpected("person");
    return phones.map((phone) => {
      if (!(isRecord(phone) && typeof phone.value === "string")) {
        unexpected("person");
      }
      return {
        value: phone.value,
        primary: phone.primary === true,
        ...(typeof phone.label === "string" ? { label: phone.label } : {}),
      };
    });
  }

  async createPerson(input: PipedriveNewPerson): Promise<number> {
    const body = {
      name: input.name,
      emails: [{ value: input.email, primary: true }],
      ...(input.phones.length > 0
        ? {
            phones: input.phones.map((value, index) => ({
              value,
              primary: index === 0,
            })),
          }
        : {}),
    };
    const data = dataOf(
      await this.request("/api/v2/persons", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      "new person"
    );
    return idOf(isRecord(data) ? data.id : undefined, "new person");
  }

  async updatePerson(
    personId: number,
    patch: PipedrivePersonPatch
  ): Promise<void> {
    dataOf(
      await this.request(`/api/v2/persons/${personId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
      "person update"
    );
  }

  /**
   * A lead on the person. No `origin_id` is sent: for a lead an OAuth app
   * creates, Pipedrive stores the app's client id there instead (checked on a
   * sandbox account), so it can't carry the response id. QRdx keeps its own
   * record of which responses got a lead (see syncResponsesToPipedrive).
   */
  async createLead(input: { title: string; personId: number }): Promise<void> {
    dataOf(
      await this.request("/api/v1/leads", {
        method: "POST",
        body: JSON.stringify({
          title: input.title.slice(0, MAX_TITLE_LENGTH),
          person_id: input.personId,
        }),
      }),
      "new lead"
    );
  }
}

export function createPipedriveClient(
  accessToken: string,
  apiDomain: string
): PipedriveClient {
  return new PipedriveClient(accessToken, apiDomain);
}

/**
 * Revokes the refresh token: Pipedrive then removes the app's OAuth data and
 * marks the app uninstalled (sending only the access token would leave it
 * installed). Pipedrive answers 200 even for a token it doesn't know.
 */
export async function revokePipedriveToken(options: {
  token: string;
  clientId: string;
  clientSecret: string;
}): Promise<void> {
  await providerRequest(PROVIDER, PIPEDRIVE_REVOKE_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${options.clientId}:${options.clientSecret}`
      ).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      token: options.token,
      token_type_hint: "refresh_token",
    }).toString(),
  });
}
