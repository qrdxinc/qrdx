// Adapters from the integration clients in packages/integrations (the shared
// ShortLinkClient of Bitly, Rebrandly and Short.io; Uniqode's UniqodeClient;
// Dub's DubClient for undo only) to the importer's MigrationSource, plus
// plain-words provider errors. No database or env access, so tests can pass
// fake clients.

import type {
  DubClient,
  ShortLink,
  ShortLinkClient,
  ShortLinkDomain,
  UniqodeClient,
  UniqodeQrCode,
} from "@repo/integrations";
// The module, not the package index, so tests don't load the database client.
import { isIntegrationApiError } from "@repo/integrations/src/core/http-client";
import { uniqodeWebsiteDestination } from "@repo/integrations/src/integrations/uniqode/client";
import { absoluteShortLink, splitShortLink } from "./normalize";
import { API_PROVIDERS, type ApiProviderId, retiredMessage } from "./providers";
import type {
  LinkFilters,
  LinkPage,
  MigrationSource,
  SourceLink,
} from "./types";

export const LIST_PAGE_SIZE = 50;

/** Filters a page for providers without that filter (search, domain, tag). */
export function filterPage(
  links: SourceLink[],
  filters: LinkFilters,
  native: { search?: boolean; domain?: boolean },
): SourceLink[] {
  const q = native.search ? "" : (filters.search?.trim().toLowerCase() ?? "");
  const domain = native.domain ? "" : (filters.domain ?? "");
  const tag = filters.tag?.trim().toLowerCase() ?? "";
  return links.filter(
    (link) =>
      (!q ||
        [link.shortLink ?? "", link.destinationUrl, link.title ?? ""].some(
          (value) => value.toLowerCase().includes(q),
        )) &&
      (!domain || link.domain === domain) &&
      (!tag || link.tags.some((name) => name.toLowerCase() === tag)),
  );
}

export function fromShortLink(link: ShortLink): SourceLink {
  const shortLink = absoluteShortLink(link.shortUrl);
  const parts = splitShortLink(shortLink);
  return {
    id: link.id,
    shortLink,
    domain: (link.domain || parts.domain)?.toLowerCase() ?? null,
    backHalf: parts.backHalf,
    destinationUrl: link.longUrl,
    title: link.title?.trim() || null,
    tags: link.tags ?? [],
    clicks: typeof link.clicks === "number" ? link.clicks : null,
    createdAt: link.createdAt ?? null,
    archived: false,
  };
}

/** Bitly, Rebrandly and Short.io through their shared ShortLinkClient. */
export function shortLinkSource(
  provider: Exclude<ApiProviderId, "dub" | "uniqode-api">,
  client: ShortLinkClient,
): MigrationSource {
  let domains: Promise<ShortLinkDomain[]> | null = null;
  const loadDomains = () => {
    domains ??= client.listDomains();
    return domains;
  };
  // Bitly lists every domain at once; Rebrandly and Short.io take a domain
  // id (Short.io lists one domain at a time).
  const nativeDomain = provider !== "bitly";

  return {
    provider,
    async listDomains() {
      return (await loadDomains()).map((domain) =>
        domain.hostname.toLowerCase(),
      );
    },
    async listLinks(cursor, filters): Promise<LinkPage> {
      let domainId: string | undefined;
      if (filters.domain && nativeDomain) {
        domainId = (await loadDomains()).find(
          (domain) => domain.hostname.toLowerCase() === filters.domain,
        )?.id;
        if (!domainId) return { links: [], nextCursor: null, total: 0 };
      }
      const page = await client.listLinks({
        cursor: cursor ?? undefined,
        search: filters.search?.trim() || undefined,
        domainId,
        limit: LIST_PAGE_SIZE,
      });
      return {
        links: filterPage(page.links.map(fromShortLink), filters, {
          // The clients already filter by search (server-side or per page).
          search: true,
          domain: nativeDomain,
        }),
        nextCursor: page.nextCursor ?? null,
        total: null,
      };
    },
    async updateDestination(id, url) {
      await client.updateLinkDestination(id, url);
    },
  };
}

/** Uniqode's `created` timestamp as an ISO date (string or epoch). */
function isoDate(value: UniqodeQrCode["created"]): string | null {
  if (value === null || value === undefined || value === "") return null;
  // Epoch seconds or milliseconds; the reference doesn't say which.
  const date =
    typeof value === "number"
      ? new Date(value < 1e11 ? value * 1000 : value)
      : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A dynamic website code as a link; null for every other kind of code. */
export function fromUniqodeCode(code: UniqodeQrCode): SourceLink | null {
  const destinationUrl = uniqodeWebsiteDestination(code);
  if (!destinationUrl) return null;
  const encoded = typeof code.url === "string" ? code.url.trim() : "";
  // `url` is the address the printed code opens. If it ever reads as the
  // destination itself, there is no old short link to keep.
  const shortLink =
    /^https?:\/\//i.test(encoded) && encoded !== destinationUrl
      ? encoded
      : null;
  const parts = splitShortLink(shortLink);
  return {
    id: String(code.id),
    shortLink,
    domain: parts.domain,
    backHalf: parts.backHalf,
    destinationUrl,
    title: code.name?.trim() || null,
    tags: (code.tag_data ?? []).flatMap((tag) =>
      typeof tag?.name === "string" && tag.name.trim() ? [tag.name.trim()] : [],
    ),
    clicks: null,
    createdAt: isoDate(code.created),
    // Sleeping (deactivated) codes don't redirect until they're reactivated.
    archived: code.state === "S",
  };
}

/** Pages read in one call while they hold no website codes. */
const UNIQODE_MAX_PAGES = 4;

/**
 * Uniqode's dynamic website codes through UniqodeClient. Other kinds (PDFs,
 * vCard Plus, forms…) are pages Uniqode hosts, so they aren't listed.
 */
export function uniqodeSource(client: UniqodeClient): MigrationSource {
  // The code read for the undo record, so the update needn't read it again.
  const read = new Map<string, UniqodeQrCode>();
  return {
    provider: "uniqode-api",
    async listLinks(cursor, filters): Promise<LinkPage> {
      let next = cursor ?? undefined;
      const links: SourceLink[] = [];
      for (let page = 0; page < UNIQODE_MAX_PAGES; page++) {
        const result = await client.listQrCodes({
          cursor: next,
          pageSize: LIST_PAGE_SIZE,
        });
        for (const code of result.codes) {
          const link = fromUniqodeCode(code);
          if (link) links.push(link);
        }
        next = result.nextCursor;
        if (links.length > 0 || !next) break;
      }
      return {
        links: filterPage(links, filters, {}),
        nextCursor: next ?? null,
        total: null,
      };
    },
    async getLink(id) {
      const code = await client.getQrCode(id);
      read.set(id, code);
      return fromUniqodeCode(code);
    },
    async updateDestination(id, url) {
      const current = read.get(id);
      read.delete(id);
      await client.updateDestination(id, url, current);
    },
  };
}

/**
 * Dub no longer takes new imports (RETIRED_PROVIDER_IDS). Its earlier jobs
 * only need undo: putting an old link's recorded destination back.
 */
export function dubUndoSource(client: DubClient): MigrationSource {
  return {
    provider: "dub",
    async listLinks() {
      throw new Error(retiredMessage(API_PROVIDERS.dub.name));
    },
    async updateDestination(id, url) {
      await client.updateLink(id, { url });
    },
  };
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export type ProviderErrorKind =
  | "plan"
  | "quota"
  | "auth"
  | "rate"
  | "not-found"
  /** QRdx can't use this code or answer (its message says why) */
  | "unsupported"
  | "other";

export interface ExplainedError {
  kind: ProviderErrorKind;
  message: string;
  /** Stop the run: every following link would fail the same way */
  stop: boolean;
}

function statusOf(error: unknown): number | null {
  if (isIntegrationApiError(error)) return error.status;
  // DubClient: "Dub API error: 403 - message"
  const match = /API error: (\d{3})/.exec(String((error as Error)?.message));
  return match ? Number(match[1]) : null;
}

const PLAN_MESSAGES: Record<ApiProviderId, string> = {
  dub: "Dub refused to change this link for your plan or role.",
  bitly:
    "Your Bitly plan doesn't allow more destination changes (Bitly calls them link redirects: none on Free, 5 a month on Core, 20 on Growth, 110 on Premium). Upgrade in Bitly or wait for next month's allowance; the remaining links were left unchanged.",
  rebrandly:
    "Your Rebrandly plan has no destination edits left (none on Free, 10 a month on Essentials, 50 on Professional, 150 on Growth). The remaining links were left unchanged.",
  "short-io": "Short.io refused to change this link for your plan or role.",
  "uniqode-api":
    "Uniqode refused the change for your plan or role: its API comes with the Core plan and above, for Owners and Admins. The remaining codes were left unchanged.",
};

/** A provider failure in plain words, without tokens or URLs. */
export function explainProviderError(
  provider: ApiProviderId,
  error: unknown,
): ExplainedError {
  const name = API_PROVIDERS[provider].name;
  const status = statusOf(error);
  const code = isIntegrationApiError(error) ? error.code : null;
  const body = isIntegrationApiError(error)
    ? JSON.stringify(error.body ?? "")
    : "";

  if (status === 401 || code === "unauthorized") {
    return {
      kind: "auth",
      message: `${name} rejected the saved connection. Reconnect ${name} and try again.`,
      stop: true,
    };
  }
  if (
    status === 402 ||
    code === "upgrade_required" ||
    /UPGRADE_REQUIRED/.test(body)
  ) {
    return { kind: "plan", message: PLAN_MESSAGES[provider], stop: true };
  }
  if (status === 429 && /MONTHLY_LIMIT|LIMIT_EXCEEDED|quota/i.test(body)) {
    return { kind: "quota", message: PLAN_MESSAGES[provider], stop: true };
  }
  if (status === 429 || code === "rate_limited") {
    return {
      kind: "rate",
      message: `${name} is limiting requests. Wait a minute, then continue.`,
      stop: true,
    };
  }
  if (status === 403 || code === "forbidden") {
    return { kind: "plan", message: PLAN_MESSAGES[provider], stop: true };
  }
  if (status === 404 || code === "not_found") {
    return {
      kind: "not-found",
      message: `${name} no longer has this link.`,
      stop: false,
    };
  }
  if (status === 400) {
    // No body: the client's own words (a code QRdx can't change, or an
    // answer it doesn't recognize). With one: the provider refused the value.
    return isIntegrationApiError(error) && error.body === undefined
      ? { kind: "unsupported", message: error.message, stop: false }
      : {
          kind: "other",
          message: `${name} didn't accept the change for this link.`,
          stop: false,
        };
  }
  return {
    kind: "other",
    message: `${name} couldn't update this link. Try again later.`,
    stop: false,
  };
}
