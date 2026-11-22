// The link and app content types added on 2026-11-22: chats and calls,
// creator and social profiles, music, documents and forms, reviews, stays
// and app stores. Most are a link built from a username, or a link people
// copy from the app, checked to be on the service's own hosts. FaceTime
// calls by number or email are app links (facetime:, facetime-audio:).
//
// LINK_TYPES describes each type: linkTypeIssue checks content the way its
// form does (lib/validations/qr-content.ts), encodeLinkType builds the
// payload and returns "" while the check fails, and linkTypeFromUrl is
// smart paste for the services' links (utils/url-parser.ts).

import type {
  AppStoreContent,
  FaceTimeContent,
  GooglePlayContent,
  HandleLinkContent,
  HandleLinkType,
  MicrosoftTeamsContent,
  PastedLinkContent,
  PastedLinkType,
  TrustpilotContent,
  ViberContent,
} from "@/types/qr-content";
import {
  type ContentIssue,
  httpsLink,
  internationalDigits,
  internationalPhoneIssue,
  normalizePhone,
  normalizeWebUrl,
  problem,
} from "./qr-content-encoder";

export type LinkTypeContent =
  | HandleLinkContent
  | PastedLinkContent
  | ViberContent
  | MicrosoftTeamsContent
  | FaceTimeContent
  | AppStoreContent
  | GooglePlayContent
  | TrustpilotContent;

export type LinkType = LinkTypeContent["type"];

interface LinkTypeSpec<C extends LinkTypeContent> {
  /** The problem with the content, as its form shows it, or null */
  issue: (content: Partial<C>) => ContentIssue | null;
  /** The payload, for content without an issue */
  encode: (content: C) => string;
  /** The form's fields for a pasted link of this service, or null */
  fromLink: (url: URL, raw: string) => Omit<C, "type"> | null;
}

type Specs = {
  [T in LinkType]: LinkTypeSpec<Extract<LinkTypeContent, { type: T }>>;
};

// ─── Hosts ──────────────────────────────────────────────────────────────────

/** True when `host` is `domain` or below it. */
const under = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`);

/** The URL's hostname, lowercase, without a trailing dot. */
const hostOf = (url: URL) => url.hostname.toLowerCase().replace(/\.$/, "");

/** A service on country domains: brand.com, brand.co.uk, brand.com.au, brand.de… */
const countryDomains = (brand: string) =>
  new RegExp(
    `(?:^|\\.)${brand}\\.(?:com|co\\.[a-z]{2}|com\\.[a-z]{2}|[a-z]{2})$`,
  );

/** The text as an http(s) URL whose host passes `test`, else null. */
function linkWhere(raw: string, test: (host: string) => boolean): URL | null {
  const value = raw.trim();
  if (!/[./]/.test(value) || /\s/.test(value)) return null;
  try {
    const url = new URL(normalizeWebUrl(value));
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return test(hostOf(url)) ? url : null;
  } catch {
    return null;
  }
}

/** Whether the text was meant as a link (it has a dot or a scheme). */
const looksLikeLink = (raw: string) => /\.|:\/\//.test(raw.trim());

// ─── Types that take a username or a profile link ──────────────────────────

interface HandleSpec {
  /** Accepts a pasted link on one of the service's hosts */
  accepts: (url: URL) => boolean;
  hosts: (host: string) => boolean;
  /** The handle as typed ("@" removed) */
  handle: RegExp;
  /** The link a typed handle becomes */
  build: (handle: string) => string;
  /** The link a handle typed with "@" becomes, when that's another page */
  at?: (handle: string) => string;
  required: string;
  /** Shown for a handle that doesn't fit `handle` */
  rule: string;
  /** Shown for a link that isn't one of the service's profile links */
  wrongLink: string;
}

/** The profile link for a typed handle or pasted link, else null. */
function readHandle(spec: HandleSpec, raw: string): string | null {
  const value = raw.trim();
  const link = linkWhere(value, spec.hosts);
  if (link) return spec.accepts(link) ? httpsLink(link) : null;
  const handle = value.replace(/^@/, "");
  if (!spec.handle.test(handle)) return null;
  return value.startsWith("@") && spec.at
    ? spec.at(handle)
    : spec.build(handle);
}

function handleType<T extends HandleLinkType>(
  spec: HandleSpec,
): LinkTypeSpec<Extract<HandleLinkContent, { type: T }>> {
  return {
    issue: (content) => {
      const value = content.username?.trim() ?? "";
      if (!value) return problem("username", spec.required);
      if (readHandle(spec, value)) return null;
      return problem(
        "username",
        linkWhere(value, spec.hosts) || looksLikeLink(value)
          ? spec.wrongLink
          : spec.rule,
      );
    },
    encode: (content) => readHandle(spec, content.username) ?? "",
    fromLink: (url, raw) =>
      spec.hosts(hostOf(url)) && spec.accepts(url)
        ? ({ username: raw } as Omit<
            Extract<HandleLinkContent, { type: T }>,
            "type"
          >)
        : null,
  };
}

/** Any page below the root: a profile, post or item. */
const hasPath = (url: URL) => url.pathname.replace(/\/+$/, "").length > 1;

/** A page on a subdomain (name.service.com), or a path on the main site. */
const subdomainOrPath = (domain: string) => (url: URL) => {
  const host = hostOf(url);
  return (host !== domain && host !== `www.${domain}`) || hasPath(url);
};

// ─── Types that take a pasted link ─────────────────────────────────────────

interface PastedSpec {
  hosts: (host: string) => boolean;
  /** The link is one this type opens (a document, not the home page) */
  accepts: (url: URL) => boolean;
  required: string;
  wrongLink: string;
  /** Something typed instead of a link, and the link it becomes */
  typed?: { pattern: RegExp; build: (value: string) => string };
}

function readPasted(spec: PastedSpec, raw: string): string | null {
  const value = raw.trim();
  const link = linkWhere(value, spec.hosts);
  if (link) return spec.accepts(link) ? httpsLink(link) : null;
  return spec.typed?.pattern.test(value) ? spec.typed.build(value) : null;
}

function pastedType<T extends PastedLinkType>(
  spec: PastedSpec,
): LinkTypeSpec<Extract<PastedLinkContent, { type: T }>> {
  return {
    issue: (content) => {
      const value = content.url?.trim() ?? "";
      if (!value) return problem("url", spec.required);
      return readPasted(spec, value) ? null : problem("url", spec.wrongLink);
    },
    encode: (content) => readPasted(spec, content.url) ?? "",
    fromLink: (url, raw) =>
      spec.hosts(hostOf(url)) && spec.accepts(url)
        ? ({ url: raw } as Omit<
            Extract<PastedLinkContent, { type: T }>,
            "type"
          >)
        : null,
  };
}

const onHosts =
  (...domains: string[]) =>
  (host: string) =>
    domains.some((domain) => under(host, domain));

const pathMatches = (pattern: RegExp) => (url: URL) =>
  pattern.test(url.pathname);

// ─── Domains (Trustpilot) ───────────────────────────────────────────────────

const DOMAIN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** "Example.com", "https://www.example.com/shop" → "example.com". */
function websiteDomain(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  let host = value;
  if (/[/:]/.test(value)) {
    try {
      host = new URL(normalizeWebUrl(value)).hostname;
    } catch {
      return null;
    }
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  return DOMAIN.test(host) ? host : null;
}

const TRUSTPILOT_PAGE = /^\/(?:review|evaluate)\/([^/?#]+)/;

/** The reviewed business's domain, from a domain or a Trustpilot link. */
function trustpilotDomain(raw: string): string | null {
  const link = linkWhere(raw, onHosts("trustpilot.com"));
  if (link) {
    const match = TRUSTPILOT_PAGE.exec(link.pathname);
    return match ? websiteDomain(decodeURIComponent(match[1] as string)) : null;
  }
  return websiteDomain(raw);
}

// ─── App Store and Google Play ─────────────────────────────────────────────

const APPLE_APP_HOSTS = onHosts("apps.apple.com", "itunes.apple.com");
const APP_STORE_ID = /\/id(\d{6,12})(?:[/?#]|$)/;

/** An App Store link (kept as pasted) or the app ID, as a URL. */
function appStoreUrl(raw: string): URL | null {
  const value = raw.trim();
  const link = linkWhere(value, APPLE_APP_HOSTS);
  if (link) return APP_STORE_ID.test(link.pathname) ? link : null;
  const id = /^(?:id)?(\d{6,12})$/i.exec(value)?.[1];
  return id ? new URL(`https://apps.apple.com/app/id${id}`) : null;
}

/** Java package names: two or more parts, each starting with a letter. */
const PACKAGE_NAME = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;

/** A Google Play app or developer link, or a package name, as a URL. */
function googlePlayUrl(raw: string): URL | null {
  const value = raw.trim();
  const link = linkWhere(value, onHosts("play.google.com"));
  if (link) {
    const id = link.searchParams.get("id") ?? "";
    if (link.pathname.startsWith("/store/apps/details")) {
      return PACKAGE_NAME.test(id) ? link : null;
    }
    return /^\/store\/apps\/dev(?:eloper)?\/?$/.test(link.pathname) && id
      ? link
      : null;
  }
  return PACKAGE_NAME.test(value)
    ? new URL(
        `https://play.google.com/store/apps/details?id=${encodeURIComponent(value)}`,
      )
    : null;
}

// ─── Viber, Teams and FaceTime ─────────────────────────────────────────────

const VIBER_INVITE_HOSTS = onHosts("invite.viber.com", "vb.me");

/** A community or channel invite link, as the app's Invite URL gives it. */
function viberLink(raw: string): URL | null {
  const link = linkWhere(raw, VIBER_INVITE_HOSTS);
  if (!link) return null;
  return hasPath(link) || link.search.length > 1 ? link : null;
}

const TEAMS_HOSTS = onHosts("teams.microsoft.com", "teams.live.com");
const TEAMS_PATHS = /^\/(?:l\/(?:meetup-join|meet|chat|team|channel)\/|meet\/)/;

const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

/** Comma-separated work or school addresses, trimmed. */
const teamsUsers = (raw: string) =>
  raw
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);

const FACETIME_HOSTS = onHosts("facetime.apple.com");

/** A FaceTime call target: an email, or a phone number (RFC 3966 digits). */
function faceTimeTarget(raw: string): string | null {
  const value = raw.trim();
  if (EMAIL.test(value)) return value;
  const digits = normalizePhone(value).number;
  const count = digits.replace(/\D/g, "").length;
  return /^[+\d\s().-]+$/.test(value) && count >= 3 && count <= 15
    ? digits
    : null;
}

// ─── The types ──────────────────────────────────────────────────────────────

/** 1-30 characters for most services' usernames. */
const NAME = (max: number, extra = "") =>
  new RegExp(`^[A-Za-z0-9_${extra}]{1,${max}}$`);

export const LINK_TYPES: Specs = {
  // ── Messaging and calls ──
  messenger: handleType({
    hosts: onHosts("m.me", "messenger.com"),
    accepts: (url) =>
      under(hostOf(url), "m.me")
        ? hasPath(url)
        : url.pathname.startsWith("/t/"),
    handle: /^[A-Za-z0-9.]{5,50}$/,
    build: (handle) => `https://m.me/${handle}`,
    required: "Facebook username or m.me link is required",
    rule: 'Usernames are at least 5 letters, digits and "."',
    wrongLink: "Paste an m.me link, like m.me/yourname",
  }),
  // Chat links by number (viber.me) are for Viber Business accounts.
  viber: {
    issue: (content) => {
      if (content.link?.trim()) {
        return viberLink(content.link)
          ? null
          : problem(
              "link",
              "Paste the community's or channel's Invite URL from Viber",
            );
      }
      if (content.phoneNumber?.trim()) {
        return internationalPhoneIssue(content.phoneNumber, "phoneNumber");
      }
      return { message: "Viber business number or invite link is required" };
    },
    encode: (content) => {
      const link = content.link?.trim() ? viberLink(content.link) : null;
      if (link) return httpsLink(link);
      const draft = content.message?.trim();
      return `https://viber.me/${internationalDigits(content.phoneNumber ?? "")}${
        draft ? `?draft=${encodeURIComponent(draft)}` : ""
      }`;
    },
    fromLink: (url, raw) => {
      if (viberLink(url.toString())) return { link: raw };
      const number = /^\/(\d{6,15})\/?$/.exec(url.pathname)?.[1];
      return under(hostOf(url), "viber.me") && number
        ? {
            phoneNumber: `+${number}`,
            ...(url.searchParams.get("draft")
              ? { message: url.searchParams.get("draft") as string }
              : {}),
          }
        : null;
    },
  },
  kakaotalk: pastedType({
    hosts: onHosts("open.kakao.com", "pf.kakao.com"),
    accepts: (url) =>
      under(hostOf(url), "pf.kakao.com")
        ? /^\/_[A-Za-z0-9]+/.test(url.pathname)
        : /^\/(?:o|me)\/[^/]+/.test(url.pathname),
    typed: {
      pattern: /^_[A-Za-z0-9]{4,20}$/,
      build: (id) => `https://pf.kakao.com/${id}`,
    },
    required: "KakaoTalk open chat or channel link is required",
    wrongLink:
      "Paste an open chat link (open.kakao.com/o/…) or a channel link (pf.kakao.com/_…)",
  }),
  zalo: pastedType({
    hosts: onHosts("zalo.me"),
    accepts: hasPath,
    // An Official Account's numeric ID (zalo.me/<OA ID>).
    typed: {
      pattern: /^[1-9]\d{14,19}$/,
      build: (id) => `https://zalo.me/${id}`,
    },
    required: "Zalo Official Account ID or link is required",
    wrongLink:
      "Paste a zalo.me link, or enter the Official Account's numeric ID",
  }),
  facetime: {
    issue: (content) => {
      if (content.url?.trim()) {
        const link = linkWhere(content.url, FACETIME_HOSTS);
        return link?.pathname.startsWith("/join")
          ? null
          : problem(
              "url",
              "Paste a FaceTime link (facetime.apple.com/join…) from the FaceTime app",
            );
      }
      if (content.contact?.trim()) {
        return faceTimeTarget(content.contact)
          ? null
          : problem(
              "contact",
              "Enter a phone number or the email of an Apple Account",
            );
      }
      return { message: "FaceTime phone number, email or link is required" };
    },
    encode: (content) => {
      if (content.url?.trim()) {
        const link = linkWhere(content.url, FACETIME_HOSTS);
        return link ? httpsLink(link) : "";
      }
      const scheme = content.audioOnly ? "facetime-audio" : "facetime";
      return `${scheme}:${faceTimeTarget(content.contact ?? "") ?? ""}`;
    },
    fromLink: (url, raw) =>
      under(hostOf(url), "facetime.apple.com") &&
      url.pathname.startsWith("/join")
        ? { url: raw }
        : null,
  },
  "microsoft-teams": {
    issue: (content) => {
      if (content.url?.trim()) {
        const link = linkWhere(content.url, TEAMS_HOSTS);
        return link && TEAMS_PATHS.test(link.pathname)
          ? null
          : problem(
              "url",
              "Paste the meeting's join link (teams.microsoft.com/…) from the invite",
            );
      }
      if (content.users?.trim()) {
        return teamsUsers(content.users).every((address) => EMAIL.test(address))
          ? null
          : problem(
              "users",
              "Enter work or school email addresses, separated by commas",
            );
      }
      return { message: "Teams meeting link or email address is required" };
    },
    encode: (content) => {
      if (content.url?.trim()) {
        const link = linkWhere(content.url, TEAMS_HOSTS);
        return link ? httpsLink(link) : "";
      }
      const users = teamsUsers(content.users ?? "")
        .map((address) => encodeURIComponent(address).replace(/%40/g, "@"))
        .join(",");
      const message = content.message?.trim();
      return `https://teams.microsoft.com/l/chat/0/0?users=${users}${
        message ? `&message=${encodeURIComponent(message)}` : ""
      }`;
    },
    fromLink: (url, raw) =>
      TEAMS_HOSTS(hostOf(url)) && TEAMS_PATHS.test(url.pathname)
        ? { url: raw }
        : null,
  },
  webex: pastedType({
    hosts: onHosts("webex.com"),
    accepts: (url) => hostOf(url) !== "www.webex.com" && hasPath(url),
    required: "Webex meeting link is required",
    wrongLink: "Paste the meeting link from the invite (yoursite.webex.com/…)",
  }),

  // ── Social and creators ──
  vk: pastedType({
    hosts: onHosts("vk.com", "vk.ru"),
    accepts: hasPath,
    required: "VK profile, page or group link is required",
    wrongLink: "Paste a profile, page or group link from vk.com",
  }),
  weibo: pastedType({
    hosts: onHosts("weibo.com", "weibo.cn"),
    accepts: hasPath,
    required: "Weibo profile link is required",
    wrongLink: "Paste a profile link from weibo.com",
  }),
  tumblr: handleType({
    hosts: onHosts("tumblr.com"),
    accepts: subdomainOrPath("tumblr.com"),
    handle: /^[A-Za-z0-9-]{1,32}$/,
    build: (blog) => `https://www.tumblr.com/${blog.toLowerCase()}`,
    required: "Tumblr blog name or link is required",
    rule: 'Blog names are up to 32 letters, digits and "-"',
    wrongLink: "Paste a blog or post link from tumblr.com",
  }),
  medium: handleType({
    hosts: onHosts("medium.com"),
    accepts: subdomainOrPath("medium.com"),
    handle: NAME(50, ".-"),
    build: (user) => `https://medium.com/@${user}`,
    required: "Medium username or link is required",
    rule: 'Medium usernames are letters, digits, "_" and "."',
    wrongLink: "Paste a profile, publication or story link from medium.com",
  }),
  substack: handleType({
    hosts: onHosts("substack.com"),
    accepts: subdomainOrPath("substack.com"),
    handle: /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i,
    build: (name) => `https://${name.toLowerCase()}.substack.com`,
    // "@name" is a profile (substack.com/@name).
    at: (handle) => `https://substack.com/@${handle}`,
    required: "Substack publication name or link is required",
    rule: 'Publication names are the part before .substack.com: letters, digits and "-"',
    wrongLink: "Paste your publication's link (yourname.substack.com)",
  }),
  github: handleType({
    hosts: onHosts("github.com"),
    accepts: hasPath,
    // A user or organization (single hyphens, up to 39), optionally /repo.
    handle:
      /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}(?:\/[A-Za-z0-9._-]{1,100})?$/,
    build: (path) => `https://github.com/${path}`,
    required: "GitHub username, repository or link is required",
    rule: "Enter a username like octocat, or a repository like octocat/hello-world",
    wrongLink:
      "Paste a profile, organization or repository link from github.com",
  }),
  behance: handleType({
    hosts: onHosts("behance.net"),
    accepts: hasPath,
    handle: /^[A-Za-z0-9_-]{3,40}$/,
    build: (user) => `https://www.behance.net/${user}`,
    required: "Behance username or link is required",
    rule: 'Behance usernames are 3-40 letters, digits, "_" and "-"',
    wrongLink: "Paste a profile or project link from behance.net",
  }),
  dribbble: handleType({
    hosts: onHosts("dribbble.com"),
    accepts: hasPath,
    handle: NAME(40, "-"),
    build: (user) => `https://dribbble.com/${user}`,
    required: "Dribbble username or link is required",
    rule: 'Dribbble usernames are letters, digits, "_" and "-"',
    wrongLink: "Paste a profile or shot link from dribbble.com",
  }),
  linktree: handleType({
    hosts: onHosts("linktr.ee"),
    accepts: hasPath,
    handle: NAME(30, "."),
    build: (user) => `https://linktr.ee/${user}`,
    required: "Linktree username or link is required",
    rule: 'Linktree usernames are letters, digits, "_" and "."',
    wrongLink: "Paste your link from linktr.ee",
  }),
  patreon: handleType({
    hosts: onHosts("patreon.com"),
    accepts: hasPath,
    handle: NAME(64, "-"),
    build: (name) => `https://www.patreon.com/${name}`,
    required: "Patreon page name or link is required",
    rule: 'Page names are letters, digits, "_" and "-"',
    wrongLink: "Paste your creator page link from patreon.com",
  }),
  kofi: handleType({
    hosts: onHosts("ko-fi.com"),
    accepts: hasPath,
    handle: NAME(40),
    build: (name) => `https://ko-fi.com/${name}`,
    required: "Ko-fi page name or link is required",
    rule: 'Ko-fi page names are letters, digits and "_"',
    wrongLink: "Paste your page link from ko-fi.com",
  }),
  buymeacoffee: handleType({
    hosts: onHosts("buymeacoffee.com", "bmc.link"),
    accepts: hasPath,
    handle: NAME(50, "-"),
    build: (name) => `https://buymeacoffee.com/${name}`,
    required: "Buy Me a Coffee page name or link is required",
    rule: 'Page names are letters, digits, "_" and "-"',
    wrongLink: "Paste your page link from buymeacoffee.com",
  }),

  // ── Music and podcasts ──
  "apple-music": pastedType({
    hosts: onHosts("music.apple.com"),
    accepts: hasPath,
    required: "Apple Music link is required",
    wrongLink:
      "Paste a song, album, artist or playlist link from music.apple.com",
  }),
  "youtube-music": pastedType({
    hosts: onHosts("music.youtube.com"),
    accepts: hasPath,
    required: "YouTube Music link is required",
    wrongLink:
      "Paste a song, album, artist or playlist link from music.youtube.com",
  }),
  "apple-podcasts": pastedType({
    hosts: onHosts("podcasts.apple.com"),
    accepts: pathMatches(/\/id\d+/),
    required: "Apple Podcasts link is required",
    wrongLink: "Paste a show or episode link from podcasts.apple.com",
  }),
  "amazon-music": pastedType({
    hosts: (host) =>
      /^music\.amazon\.(?:com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/.test(host),
    accepts: hasPath,
    required: "Amazon Music link is required",
    wrongLink:
      "Paste a song, album, playlist or podcast link from music.amazon.com",
  }),
  deezer: pastedType({
    hosts: onHosts("deezer.com"),
    accepts: (url) =>
      under(hostOf(url), "link.deezer.com")
        ? hasPath(url)
        : /\/(?:track|album|playlist|artist|show|episode|profile)\/\d+/.test(
            url.pathname,
          ),
    required: "Deezer link is required",
    wrongLink: "Paste a track, album, playlist or artist link from deezer.com",
  }),
  tidal: pastedType({
    hosts: onHosts("tidal.com"),
    accepts: pathMatches(/\/(?:track|album|playlist|artist|video|mix)\/[^/]+/),
    required: "TIDAL link is required",
    wrongLink: "Paste a track, album, playlist or artist link from tidal.com",
  }),
  bandcamp: handleType({
    hosts: onHosts("bandcamp.com"),
    accepts: subdomainOrPath("bandcamp.com"),
    handle: /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i,
    build: (name) => `https://${name.toLowerCase()}.bandcamp.com`,
    required: "Bandcamp name or link is required",
    rule: "Enter the part before .bandcamp.com, or paste an album or track link",
    wrongLink: "Paste an artist, album or track link from bandcamp.com",
  }),

  // ── Documents, forms and classes ──
  "google-docs": pastedType({
    hosts: onHosts("docs.google.com"),
    accepts: pathMatches(/^\/document\/(?:u\/\d+\/)?d\/[^/]+/),
    required: "Google Docs link is required",
    wrongLink: "Paste a document link (docs.google.com/document/d/…)",
  }),
  "google-sheets": pastedType({
    hosts: onHosts("docs.google.com"),
    accepts: pathMatches(/^\/spreadsheets\/(?:u\/\d+\/)?d\/[^/]+/),
    required: "Google Sheets link is required",
    wrongLink: "Paste a spreadsheet link (docs.google.com/spreadsheets/d/…)",
  }),
  "google-slides": pastedType({
    hosts: onHosts("docs.google.com"),
    accepts: pathMatches(/^\/presentation\/(?:u\/\d+\/)?d\/[^/]+/),
    required: "Google Slides link is required",
    wrongLink: "Paste a presentation link (docs.google.com/presentation/d/…)",
  }),
  "google-forms": pastedType({
    hosts: onHosts("docs.google.com", "forms.gle"),
    accepts: (url) =>
      under(hostOf(url), "forms.gle")
        ? hasPath(url)
        : /^\/forms\/(?:u\/\d+\/)?d\/[^/]+/.test(url.pathname),
    required: "Google Forms link is required",
    wrongLink: "Paste the form's link (forms.gle/… or docs.google.com/forms/…)",
  }),
  "microsoft-forms": pastedType({
    hosts: onHosts("forms.office.com", "forms.cloud.microsoft"),
    accepts: hasPath,
    required: "Microsoft Forms link is required",
    wrongLink: "Paste the form's share link (forms.office.com/…)",
  }),
  notion: pastedType({
    hosts: onHosts("notion.site", "notion.so"),
    accepts: hasPath,
    required: "Notion page link is required",
    wrongLink: "Paste a public page link (….notion.site/…)",
  }),
  canva: pastedType({
    hosts: onHosts("canva.com", "canva.link"),
    accepts: (url) =>
      under(hostOf(url), "canva.link")
        ? hasPath(url)
        : url.pathname.startsWith("/design/"),
    required: "Canva design link is required",
    wrongLink: "Paste a design's share link (canva.com/design/…)",
  }),
  "google-classroom": pastedType({
    hosts: onHosts("classroom.google.com"),
    // Classroom's "Copy invite link", kept as it is.
    accepts: (url) => hasPath(url) || url.searchParams.has("cjc"),
    required: "Google Classroom invite link is required",
    wrongLink: "Paste the class invite link (classroom.google.com/c/…)",
  }),
  calendly: handleType({
    hosts: onHosts("calendly.com"),
    accepts: hasPath,
    handle: /^[A-Za-z0-9_-]{1,64}(?:\/[A-Za-z0-9_-]{1,64})?$/,
    build: (path) => `https://calendly.com/${path}`,
    required: "Calendly username or link is required",
    rule: "Enter your Calendly name, like yourname or yourname/30min",
    wrongLink: "Paste your booking link from calendly.com",
  }),

  // ── App stores ──
  "app-store": {
    issue: (content) => {
      if (!content.app?.trim()) {
        return problem("app", "App Store link or app ID is required");
      }
      return appStoreUrl(content.app)
        ? null
        : problem(
            "app",
            "Paste the app's link (apps.apple.com/…/id123456789) or its ID",
          );
    },
    encode: (content) => {
      const url = appStoreUrl(content.app);
      if (!url) return "";
      if (content.writeReview) url.searchParams.set("action", "write-review");
      return httpsLink(url);
    },
    fromLink: (url, raw) =>
      APPLE_APP_HOSTS(hostOf(url)) && APP_STORE_ID.test(url.pathname)
        ? { app: raw }
        : null,
  },
  "google-play": {
    issue: (content) => {
      if (!content.app?.trim()) {
        return problem("app", "Google Play link or package name is required");
      }
      return googlePlayUrl(content.app)
        ? null
        : problem(
            "app",
            "Paste the app's link (play.google.com/store/apps/details?id=…) or its package name",
          );
    },
    encode: (content) => {
      const url = googlePlayUrl(content.app);
      return url ? httpsLink(url) : "";
    },
    fromLink: (url, raw) =>
      under(hostOf(url), "play.google.com") && googlePlayUrl(url.toString())
        ? { app: raw }
        : null,
  },

  // ── Reviews and stays ──
  tripadvisor: pastedType({
    hosts: (host) => countryDomains("tripadvisor").test(host),
    accepts: hasPath,
    required: "Tripadvisor listing link is required",
    wrongLink: "Paste your listing's link from tripadvisor.com",
  }),
  trustpilot: {
    issue: (content) => {
      if (!content.website?.trim()) {
        return problem("website", "Your website's domain is required");
      }
      return trustpilotDomain(content.website)
        ? null
        : problem(
            "website",
            "Enter the domain your Trustpilot page is for, like example.com",
          );
    },
    encode: (content) => {
      const domain = trustpilotDomain(content.website);
      if (!domain) return "";
      const page = content.writeReview === false ? "review" : "evaluate";
      return `https://www.trustpilot.com/${page}/${domain}`;
    },
    fromLink: (url, raw) =>
      under(hostOf(url), "trustpilot.com") && TRUSTPILOT_PAGE.test(url.pathname)
        ? {
            website: raw,
            writeReview: url.pathname.startsWith("/evaluate/"),
          }
        : null,
  },
  yelp: pastedType({
    hosts: (host) => countryDomains("yelp").test(host),
    accepts: pathMatches(/^\/biz\/[^/]+/),
    required: "Yelp business link is required",
    wrongLink: "Paste your business page link (yelp.com/biz/…)",
  }),
  airbnb: pastedType({
    hosts: (host) =>
      countryDomains("airbnb").test(host) || under(host, "abnb.me"),
    accepts: (url) =>
      under(hostOf(url), "abnb.me")
        ? hasPath(url)
        : /^\/(?:rooms|experiences|h)\/[^/]+/.test(url.pathname),
    required: "Airbnb listing link is required",
    wrongLink: "Paste a listing or experience link (airbnb.com/rooms/…)",
  }),
  "booking-com": pastedType({
    hosts: onHosts("booking.com"),
    accepts: pathMatches(/^\/(?:hotel\/[a-z]{2}\/[^/]+|Share-[^/]+)/),
    required: "Booking.com property link is required",
    wrongLink: "Paste your property's link (booking.com/hotel/…)",
  }),
};

export const LINK_TYPE_IDS = Object.keys(LINK_TYPES) as LinkType[];

const IDS = new Set<string>(LINK_TYPE_IDS);

export function isLinkType(type: string): type is LinkType {
  return IDS.has(type);
}

/** True for content of a type in this module. */
export function isLinkTypeContent(content: {
  type: string;
}): content is LinkTypeContent {
  return isLinkType(content.type);
}

type AnySpec = LinkTypeSpec<LinkTypeContent>;

export function linkTypeIssue(
  content: Partial<LinkTypeContent> & { type: LinkType },
): ContentIssue | null {
  return (LINK_TYPES[content.type] as AnySpec).issue(content);
}

export function encodeLinkType(content: LinkTypeContent): string {
  if (linkTypeIssue(content)) return "";
  return (LINK_TYPES[content.type] as AnySpec).encode(content);
}

/**
 * The type and form fields for a pasted link of one of these services, or
 * null. The first type that takes it wins, so the order of LINK_TYPES only
 * matters for hosts two types share (docs.google.com).
 */
export function linkTypeFromUrl(url: URL, raw: string): LinkTypeContent | null {
  for (const type of LINK_TYPE_IDS) {
    const fields = (LINK_TYPES[type] as AnySpec).fromLink(url, raw);
    if (fields) return { type, ...fields } as LinkTypeContent;
  }
  return null;
}
