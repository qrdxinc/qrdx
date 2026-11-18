import { clampLimit } from "../../capabilities/short-links";
import {
  IntegrationApiError,
  isIntegrationApiError,
  providerRequest,
} from "../../core/http-client";
import type { UniqodeQrCode, UniqodeQrCodeList } from "./types";

const API_HOST = "api.uniqode.com";
const BASE_URL = `https://${API_HOST}/api/2.0`;
const PROVIDER = { slug: "uniqode", name: "Uniqode" };
const CODE_ID = /^\d{1,12}$/;
/** "Custom URL" campaigns: a dynamic code that opens one website. */
const CUSTOM_URL = 1;
const DYNAMIC = 2;
/** Uniqode's lowest API plan (Core) allows 10 requests a second. */
const MIN_INTERVAL_MS = 150;
/** One short wait on a 429; anything longer stops and asks the user. */
const MAX_RETRY_WAIT_SECONDS = 5;

export interface UniqodeQrCodePage {
  codes: UniqodeQrCode[];
  /** Pass back as `cursor` for the next page; absent on the last page. */
  nextCursor?: string;
  /** Total the list endpoint reports, when it does */
  count?: number;
}

function unsupported(message: string): IntegrationApiError {
  // No body: these are QRdx's own words, not Uniqode's.
  return new IntegrationApiError({
    provider: PROVIDER.slug,
    status: 400,
    code: "bad_request",
    message,
  });
}

/** DRF errors: `{"detail": "…"}` or `{"field": ["…"]}`. */
function describeError(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return;
  const record = body as Record<string, unknown>;
  if (typeof record.detail === "string") return record.detail.slice(0, 200);
  for (const value of Object.values(record)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string" && first.trim()) {
      return first.trim().slice(0, 200);
    }
  }
}

/**
 * The website a dynamic Custom URL code opens; null for every other kind
 * (static codes, PDFs, vCard Plus, forms…), which QRdx can't re-point.
 */
export function uniqodeWebsiteDestination(code: UniqodeQrCode): string | null {
  const url = code.campaign?.custom_url;
  if (
    code.qr_type !== DYNAMIC ||
    code.campaign?.content_type !== CUSTOM_URL ||
    typeof url !== "string" ||
    !url.trim()
  ) {
    return null;
  }
  return url.trim();
}

function isCode(value: unknown): value is UniqodeQrCode {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "number"
  );
}

/**
 * The `next` link as a cursor: only its query string, and only when it is
 * Uniqode's own list address, so a cursor can never send the key elsewhere.
 */
function cursorFrom(next: unknown): string | undefined {
  if (typeof next !== "string" || !next) return;
  try {
    const url = new URL(next, BASE_URL);
    if (url.hostname !== API_HOST || !/\/qrcodes\/?$/.test(url.pathname)) {
      return;
    }
    return url.search.slice(1) || undefined;
  } catch {
    // An address QRdx can't read ends the list.
  }
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Uniqode API 2.0 client, authenticated with the user's API key
 * (`Authorization: Token <key>`). Lists dynamic website codes and changes
 * their destination; requests are spaced to stay under the plan's rate.
 */
export class UniqodeClient {
  private readonly apiKey: string;
  private readonly minIntervalMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private nextAt = 0;

  constructor(
    apiKey: string,
    options: {
      minIntervalMs?: number;
      sleep?: (ms: number) => Promise<void>;
    } = {}
  ) {
    this.apiKey = apiKey;
    this.minIntervalMs = options.minIntervalMs ?? MIN_INTERVAL_MS;
    this.sleep = options.sleep ?? wait;
  }

  private async pace() {
    const now = Date.now();
    const delay = this.nextAt - now;
    this.nextAt = Math.max(now, this.nextAt) + this.minIntervalMs;
    if (delay > 0) await this.sleep(delay);
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    retried = false
  ): Promise<T> {
    await this.pace();
    try {
      return await providerRequest<T>(PROVIDER, `${BASE_URL}${path}`, {
        ...init,
        headers: {
          Authorization: `Token ${this.apiKey}`,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
        describeError,
      });
    } catch (error) {
      // A 429 is never processed, so one retry after a short wait is safe.
      if (
        !retried &&
        isIntegrationApiError(error) &&
        error.status === 429 &&
        error.retryAfterSeconds !== undefined &&
        error.retryAfterSeconds <= MAX_RETRY_WAIT_SECONDS
      ) {
        await this.sleep(error.retryAfterSeconds * 1000);
        return this.request<T>(path, init, true);
      }
      throw error;
    }
  }

  /**
   * One page of dynamic website codes. Filters by type on Uniqode's side and
   * again here, in case the list answers without them.
   */
  async listQrCodes(
    options: { cursor?: string; pageSize?: number } = {}
  ): Promise<UniqodeQrCodePage> {
    const params = new URLSearchParams(options.cursor ?? "");
    params.set("qr_type", String(DYNAMIC));
    params.set("campaign__content_type", String(CUSTOM_URL));
    if (!params.has("page_size")) {
      params.set("page_size", String(clampLimit(options.pageSize, 100)));
    }
    const data = await this.request<UniqodeQrCodeList | UniqodeQrCode[]>(
      `/qrcodes/?${params}`
    );
    // Documented: { count, next, previous, results }. A bare array is read
    // as a single page.
    const list = Array.isArray(data) ? null : data;
    const results = Array.isArray(data) ? data : list?.results;
    if (!Array.isArray(results)) {
      throw unsupported(
        "Uniqode answered in a way QRdx doesn't recognize, so nothing was listed. Export a CSV from Uniqode and import that instead."
      );
    }
    if (results.length > 0 && !results.some(isCode)) {
      throw unsupported(
        "Uniqode listed codes in a shape QRdx doesn't recognize, so nothing was listed. Export a CSV from Uniqode and import that instead."
      );
    }
    return {
      codes: results.filter(isCode),
      nextCursor: cursorFrom(list?.next),
      count: typeof list?.count === "number" ? list.count : undefined,
    };
  }

  async getQrCode(id: string): Promise<UniqodeQrCode> {
    if (!CODE_ID.test(id)) throw unsupported("Uniqode code id is invalid.");
    const code = await this.request<unknown>(`/qrcodes/${id}/`);
    if (!isCode(code)) {
      throw unsupported(
        "Uniqode answered in a way QRdx doesn't recognize, so this code was left unchanged."
      );
    }
    return code;
  }

  /**
   * Points a dynamic website code at `url`. Sends the documented update
   * (name, type and the Custom URL campaign) built from the code as it is
   * now; `current` skips reading it again when the caller just did.
   */
  async updateDestination(
    id: string,
    url: string,
    current?: UniqodeQrCode
  ): Promise<UniqodeQrCode> {
    const code =
      current && String(current.id) === id ? current : await this.getQrCode(id);
    if (!uniqodeWebsiteDestination(code)) {
      throw unsupported(
        "This Uniqode code isn't a dynamic website code, so QRdx left it unchanged."
      );
    }
    return await this.request<UniqodeQrCode>(`/qrcodes/${id}/`, {
      method: "PUT",
      body: JSON.stringify({
        name: code.name,
        qr_type: DYNAMIC,
        ...(typeof code.organization === "number"
          ? { organization: code.organization }
          : {}),
        campaign: { content_type: CUSTOM_URL, custom_url: url },
      }),
    });
  }
}

export function createUniqodeClient(
  apiKey: string,
  options?: ConstructorParameters<typeof UniqodeClient>[1]
): UniqodeClient {
  return new UniqodeClient(apiKey, options);
}
