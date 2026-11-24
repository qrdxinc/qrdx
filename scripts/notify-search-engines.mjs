#!/usr/bin/env node
// Tells search engines which qrdx.dev pages changed. Node 22, no packages.
//
// IndexNow always: Bing, Yandex, Seznam, Naver and the other IndexNow engines
// share what one of them receives. The Bing Webmaster API too, when
// BING_WEBMASTER_API_KEY is set: it submits the URLs, up to the site's daily
// quota, then resubmits the sitemaps. And Google, when
// GSC_SERVICE_ACCOUNT_JSON is set (a service account with access to the
// Search Console property): it resubmits the sitemaps. Google has no API to
// request indexing of ordinary pages, so the sitemaps are all it gets.
//
//   node scripts/notify-search-engines.mjs --all           every sitemap URL
//   node scripts/notify-search-engines.mjs --important     the priority pages
//   node scripts/notify-search-engines.mjs --urls <file>   paths or URLs, one per line
//   node scripts/notify-search-engines.mjs --snapshot <file>
//       saves the live sitemaps as one file, before a deploy
//   node scripts/notify-search-engines.mjs --changed-since <file>
//       the URLs that are new or have a new lastmod since that saved sitemap
//   node scripts/notify-search-engines.mjs --backlog
//       Bing only: today's share of the priority pages (each once a week),
//       then today's slice of the rest of the sitemap, so every page reaches
//       the Bing API every few days, including pages whose lastmod never
//       changes. Run late in the UTC day, it uses the quota deploys left.
//   node scripts/notify-search-engines.mjs --check
//       reads only: can every sitemap be read, is each important page in
//       one, and does a sample of each sitemap's pages answer 200 (not a
//       redirect or an error); is the IndexNow key file live, does the Bing
//       key work, is qrdx.dev verified for it and what's today's quota; can
//       the Google service account see the property and when Google last
//       read each sitemap
//
// "The sitemap" is every sitemap robots.txt lists: the main app's
// /sitemap.xml and the marketing site's own (/qr-code-generator/sitemap.xml
// and the rest, for the groups it serves; apps/app/app/robots.ts), read as
// one list. A sitemap that can't be read is a warning, and its pages aren't
// sent that run.
//
// Bing's URL API takes about 100 URLs a day, so what it gets is chosen
// (bingUrls): the priority pages first (IMPORTANT_PATHS, every blog post
// and every comparison), then the rest, and never the community's item
// pages or the translated pages. Those go to IndexNow and stay in the
// sitemaps, which Bing reads too.
//
// Add --dry-run to print what would be sent without sending anything. Only
// URLs in the live sitemaps are sent. A search engine error is a warning and
// never fails a run that sends; bad arguments exit with 2, and --check with
// 1 when Bing or Google rejects the key or the site, when an important page
// is in no sitemap, or when a sampled sitemap URL doesn't answer 200.
// .github/workflows/notify-search-engines.yml runs it after every
// production deploy, daily for the sitemaps' changes and the Bing backlog,
// from the Actions tab, and with --check on pull requests that change it.
import { createSign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const SITE = "https://qrdx.dev";
/** Lists the sitemaps; read first. */
export const ROBOTS_URL = `${SITE}/robots.txt`;
/** The main app's sitemap: the one read when robots.txt can't be. */
export const SITEMAP_URL = `${SITE}/sitemap.xml`;

/**
 * The IndexNow key. apps/app/public/<key>.txt serves it, which proves the
 * submissions come from the site's owner (tests/repo checks the two match).
 */
export const INDEXNOW_KEY = "16c804a6f4ac077e1778c4c29c898228";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** IndexNow takes up to 10,000 URLs per request. */
export const INDEXNOW_MAX = 10_000;

const BING_API = "https://ssl.bing.com/webmaster/api.svc/json";
/** SubmitUrlBatch takes up to 500 URLs, and no more than the daily quota. */
export const BING_BATCH_MAX = 500;

/**
 * Bing's usual daily quota: what one --backlog run sends. The slice of the
 * pages after the priority ones moves by what they leave of it each day
 * (backlogUrls), so consecutive days send consecutive slices.
 */
export const BING_BACKLOG_STEP = 100;

/** The Search Console property, as the service account was given it. */
export const GOOGLE_PROPERTY = "sc-domain:qrdx.dev";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/webmasters";
const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const GSC_API = "https://searchconsole.googleapis.com/webmasters/v3";

/**
 * The English generators people look for most, by search demand and the
 * pages assistants send people to: Bing gets them with the priority pages.
 * Each must be a type in the generator sitemap (IMPORTANT_PATHS).
 */
export const TOP_GENERATORS = [
  "url",
  "wifi",
  "vcard",
  "pdf",
  "whatsapp",
  "google-review",
  "email",
  "phone",
  "sms",
  "text",
  "instagram",
  "facebook",
  "linkedin",
  "youtube",
  "tiktok",
  "maps",
  "location",
  "business-card",
  "app-download",
  "upi",
  "paypal",
  "pix",
  "spotify",
  "google-forms",
  "google-drive",
  "zoom",
  "telegram",
  "twitter",
  "venmo",
  "guest-wifi",
];

/**
 * The answer pages, which Bing gets before any other (bingUrls), with
 * every blog post and comparison (PRIORITY_PATTERNS). They're also what
 * --important sends, and what Bing gets when the changed pages can't be
 * worked out. Each must be in a sitemap: a missing one is a warning on
 * every run and fails --check.
 */
export const IMPORTANT_PATHS = [
  "/",
  "/playground",
  "/pricing",
  "/qr-code-api",
  "/mcp",
  "/barcode-generator",
  "/qr-code-generator",
  "/compare",
  "/dynamic-qr-code",
  "/qr-code-tracking",
  "/custom-domain-qr-codes",
  "/open-source-qr-code-generator",
  "/ai",
  "/ai/art",
  "/guarantee",
  "/scan",
  "/tools",
  "/tools/bulk",
  "/tools/print-size",
  "/tools/scan-checker",
  "/qr-codes-for",
  "/qr-codes-on",
  "/blog",
  ...TOP_GENERATORS.map((type) => `/qr-code-generator/${type}`),
];

/**
 * Priority pages found in the sitemaps rather than named: every blog post
 * and every comparison (the guides and research assistants quote, and the
 * pages that answer "X or Y?"). Blog categories and authors aren't posts.
 */
export const PRIORITY_PATTERNS = [
  /^\/blog\/(?!category$|authors$)[^/]+$/,
  /^\/compare\/[^/]+$/,
];

/**
 * The URL segments of the translated languages (packages/i18n/config.ts
 * LOCALE_INFO, which tests/repo/notify-search-engines.test.ts checks this
 * against: the workflow runs this file on its own, without the package).
 */
export const TRANSLATED_SEGMENTS = [
  "es",
  "pt-br",
  "fr",
  "de",
  "it",
  "ja",
  "ko",
  "zh-hans",
  "id",
  "hi",
];

/**
 * A community item page (/community/frames/<slug> and the other types,
 * apps/app/lib/community/types.ts TYPE_SEGMENTS) or a creator's profile
 * (/community/@<handle>). The galleries aren't items.
 */
const COMMUNITY_ITEM =
  /^\/community\/(?:@[^/]+|(?:frames|themes|templates|collections|kits)\/[^/]+)$/;

/** How many days apart the backlog sends each priority page to Bing. */
export const PRIORITY_RESEND_DAYS = 7;

const TIMEOUT_MS = 30_000;
const inActions = process.env.GITHUB_ACTIONS === "true";

function warn(message) {
  console.log(inActions ? `::warning::${message}` : `Warning: ${message}`);
}

function notice(message) {
  console.log(inActions ? `::notice::${message}` : message);
}

/** A URL without a trailing slash (the root keeps its "/"), for comparing. */
export function normalizeUrl(value) {
  const url = new URL(value);
  const path = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}${url.search}`;
}

const XML_ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};
const decodeXml = (text) =>
  text.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity]);

const encodeXml = (text) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char]
  );

/** Whether `value` is a URL on `site`'s origin. */
export function onSite(value, site = SITE) {
  try {
    return new URL(value).origin === new URL(site).origin;
  } catch {
    return false;
  }
}

/** The sitemaps robots.txt lists, on this site only and without repeats. */
export function parseRobotsSitemaps(text, site = SITE) {
  const found = new Set();
  for (const [, value] of text.matchAll(
    /^[ \t]*sitemap[ \t]*:[ \t]*(\S+)/gim
  )) {
    if (onSite(value, site)) found.add(new URL(value).toString());
  }
  return [...found];
}

/** The `{ url, lastmod }` of every <url> in a sitemap. */
export function parseSitemap(xml) {
  const entries = [];
  for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(block)?.[1];
    if (!loc) continue;
    const lastmod = /<lastmod>\s*([^<]+?)\s*<\/lastmod>/.exec(block)?.[1];
    entries.push({ url: decodeXml(loc), lastmod });
  }
  return entries;
}

/**
 * "index" for a sitemap index, "urlset" for a sitemap of pages, undefined
 * for anything else (an HTML error page answering 200, say).
 */
export function sitemapKind(xml) {
  if (/<sitemapindex[\s>]/.test(xml)) return "index";
  if (/<urlset[\s>]/.test(xml)) return "urlset";
}

/** The sitemaps a sitemap index lists, or none when `xml` isn't an index. */
export function parseSitemapIndex(xml) {
  if (sitemapKind(xml) !== "index") return [];
  const urls = [];
  for (const [, block] of xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/g)) {
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(block)?.[1];
    if (loc) urls.push(decodeXml(loc));
  }
  return urls;
}

/**
 * Several sitemaps' entries as one list: this site's URLs only, each once
 * (the first sitemap that lists it wins). `skipped` counts the other hosts'.
 */
export function mergeEntries(lists, site = SITE) {
  const seen = new Set();
  const entries = [];
  let skipped = 0;
  for (const entry of lists.flat()) {
    if (!onSite(entry.url, site)) {
      skipped += 1;
      continue;
    }
    const key = normalizeUrl(entry.url);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return { entries, skipped };
}

/**
 * `entries` as one sitemap (what --snapshot saves), which parseSitemap reads
 * back as they were.
 */
export function toUrlset(entries) {
  const urls = entries.map(
    ({ url, lastmod }) =>
      `<url><loc>${encodeXml(url)}</loc>${lastmod ? `<lastmod>${encodeXml(lastmod)}</lastmod>` : ""}</url>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

/** URLs in `after` that `before` doesn't have, or whose lastmod changed. */
export function changedUrls(before, after) {
  const old = new Map(before.map((e) => [normalizeUrl(e.url), e.lastmod]));
  return after
    .filter((e) => {
      const key = normalizeUrl(e.url);
      return !old.has(key) || old.get(key) !== e.lastmod;
    })
    .map((e) => e.url);
}

/**
 * Paths or URLs as the sitemap writes them, in the order given and without
 * repeats. Anything not in the sitemap is returned as `dropped`.
 */
export function inSitemap(items, sitemapUrls, site = SITE) {
  const live = new Map(sitemapUrls.map((url) => [normalizeUrl(url), url]));
  const kept = new Set();
  const dropped = [];
  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;
    let url;
    try {
      url = live.get(normalizeUrl(new URL(item, site).toString()));
    } catch {
      url = undefined;
    }
    if (url) kept.add(url);
    else dropped.push(item);
  }
  return { kept: [...kept], dropped };
}

/**
 * `urls` starting at day `day`'s slice and wrapping around, so slices of
 * `step` on consecutive days cover every URL.
 */
export function rotate(urls, day, step = BING_BACKLOG_STEP) {
  if (urls.length === 0) return [];
  const start = (((day * step) % urls.length) + urls.length) % urls.length;
  return [...urls.slice(start), ...urls.slice(0, start)];
}

/** Days since 1970-01-01, UTC: Bing's quota resets at UTC midnight. */
export const utcDay = (now = Date.now()) => Math.floor(now / 86_400_000);

/** A URL's path without a trailing slash ("/" for the home page). */
const pathOf = (url) => new URL(normalizeUrl(url)).pathname;

/**
 * Whether Bing's URL API should get `url`: not a translated page and not a
 * community item or profile. They still go to IndexNow and the sitemaps.
 */
export function forBing(url) {
  const path = pathOf(url);
  const first = path.split("/")[1]?.toLowerCase();
  return !(TRANSLATED_SEGMENTS.includes(first) || COMMUNITY_ITEM.test(path));
}

const IMPORTANT_RANK = new Map(
  IMPORTANT_PATHS.map((path, index) => [path, index])
);

/**
 * The priority pages among `urls`, each once: IMPORTANT_PATHS in its own
 * order, then the posts and comparisons PRIORITY_PATTERNS finds, in the
 * order given.
 */
export function priorityUrls(urls) {
  const seen = new Set();
  const named = [];
  const found = [];
  for (const url of urls) {
    const key = normalizeUrl(url);
    if (seen.has(key)) continue;
    seen.add(key);
    const path = pathOf(url);
    if (IMPORTANT_RANK.has(path)) named.push(url);
    else if (PRIORITY_PATTERNS.some((pattern) => pattern.test(path))) {
      found.push(url);
    }
  }
  named.sort(
    (a, b) => IMPORTANT_RANK.get(pathOf(a)) - IMPORTANT_RANK.get(pathOf(b))
  );
  return [...named, ...found];
}

/** `urls` that Bing's URL API should get (forBing), priority pages first. */
export function bingUrls(urls) {
  const eligible = urls.filter(forBing);
  const first = priorityUrls(eligible);
  const sent = new Set(first.map(normalizeUrl));
  return [...first, ...eligible.filter((url) => !sent.has(normalizeUrl(url)))];
}

/**
 * The day of the week (0 to 6, of PRIORITY_RESEND_DAYS) the backlog sends
 * a priority page on: from a hash of its path (FNV-1a), so adding or
 * removing a page never moves another.
 */
export function resendDay(url) {
  let hash = 0x81_1c_9d_c5;
  for (const char of pathOf(url)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
  }
  return hash % PRIORITY_RESEND_DAYS;
}

/**
 * Day `day`'s Bing backlog, in the order to send it: the priority pages
 * whose resend day it is (each once a week, about a seventh of them a day),
 * then the rest of the sitemap from that day's slice on. The slices move by
 * the quota the priority pages leave on an average day, so consecutive days
 * still cover every page. Translations and community items stay out
 * (forBing).
 */
export function backlogUrls(urls, day) {
  const ordered = bingUrls(urls);
  const priority = new Set(priorityUrls(ordered).map(normalizeUrl));
  const today = ordered.filter(
    (url) =>
      priority.has(normalizeUrl(url)) &&
      resendDay(url) === day % PRIORITY_RESEND_DAYS
  );
  const rest = ordered.filter((url) => !priority.has(normalizeUrl(url)));
  const step = Math.max(
    1,
    BING_BACKLOG_STEP - Math.ceil(priority.size / PRIORITY_RESEND_DAYS)
  );
  return [...today, ...rotate(rest, day, step)];
}

/** How many of each sitemap's URLs --check asks for. */
export const SITEMAP_SAMPLE_SIZE = 10;

/**
 * `size` of `urls`, spread evenly from first to last and starting a little
 * further in each day, so repeated checks see different pages; all of them
 * when there are no more.
 */
export function sampleUrls(urls, size = SITEMAP_SAMPLE_SIZE, day = utcDay()) {
  if (urls.length <= size) return [...urls];
  const gap = Math.floor(urls.length / size);
  const start = day % gap;
  return Array.from({ length: size }, (_, i) => urls[start + i * gap]);
}

/** The parts of a service account key file the token exchange needs. */
export function parseServiceAccount(json) {
  let account;
  try {
    account = JSON.parse(json);
  } catch {
    return;
  }
  if (
    typeof account?.client_email !== "string" ||
    typeof account?.private_key !== "string"
  ) {
    return;
  }
  return {
    clientEmail: account.client_email,
    privateKey: account.private_key,
    tokenUri: account.token_uri ?? GOOGLE_TOKEN_URI,
  };
}

/** A signed JWT that trades for an access token (OAuth 2.0 JWT bearer). */
export function googleAssertion(account, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: account.clientEmail,
    scope: GOOGLE_SCOPE,
    aud: account.tokenUri,
    iat,
    exp: iat + 3600,
  })}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(account.privateKey, "base64url");
  return `${unsigned}.${signature}`;
}

/** The site's URL as Bing Webmaster Tools registered it, if it's verified. */
export function pickBingSite(sites, site = SITE) {
  const host = new URL(site).hostname;
  const matches = (sites ?? []).filter((s) => {
    try {
      return new URL(s.Url).hostname === host;
    } catch {
      return false;
    }
  });
  const verified = matches.filter((s) => s.IsVerified);
  const https = verified.find((s) => s.Url.startsWith("https:"));
  return (https ?? verified[0])?.Url;
}

async function request(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return {
    status: response.status,
    ok: response.ok,
    text: await response.text(),
  };
}

/** The sitemaps robots.txt lists, or /sitemap.xml alone when it can't say. */
export async function listSitemaps() {
  let robots;
  try {
    robots = await request(ROBOTS_URL);
  } catch (error) {
    warn(
      `Couldn't read ${ROBOTS_URL} (${error.message}); reading ${SITEMAP_URL} only.`
    );
    return [SITEMAP_URL];
  }
  if (!robots.ok) {
    warn(
      `${ROBOTS_URL} answered HTTP ${robots.status}; reading ${SITEMAP_URL} only.`
    );
    return [SITEMAP_URL];
  }
  const listed = parseRobotsSitemaps(robots.text);
  if (listed.length === 0) {
    warn(`${ROBOTS_URL} lists no sitemaps; reading ${SITEMAP_URL} only.`);
    return [SITEMAP_URL];
  }
  return listed;
}

/**
 * Every page in the sitemaps robots.txt lists (a sitemap index is followed
 * one level), the sitemaps read, and each one's own pages on this site
 * (`bySitemap`, which --check samples). A sitemap that can't be read is a
 * warning naming it; the run goes on with the rest. Throws when none can be.
 */
export async function loadSitemaps() {
  const queue = await listSitemaps();
  const seen = new Set();
  const sitemaps = [];
  const lists = [];
  while (queue.length > 0) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    let response;
    try {
      response = await request(url);
    } catch (error) {
      warn(`Couldn't read ${url} (${error.message}); its pages aren't sent.`);
      continue;
    }
    if (!response.ok) {
      warn(
        `${url} answered HTTP ${response.status}; its pages aren't sent this run.`
      );
      continue;
    }
    const kind = sitemapKind(response.text);
    if (!kind) {
      warn(
        `${url} answered HTTP ${response.status} without a sitemap (no <urlset> or <sitemapindex>); skipped this run.`
      );
      continue;
    }
    if (kind === "index") {
      queue.push(...parseSitemapIndex(response.text).filter((u) => onSite(u)));
      continue;
    }
    sitemaps.push(url);
    lists.push(parseSitemap(response.text));
  }
  if (sitemaps.length === 0) throw new Error("no sitemap could be read");
  const { entries, skipped } = mergeEntries(lists);
  if (skipped > 0) {
    warn(`Left out ${skipped} sitemap URLs that aren't on ${SITE}.`);
  }
  const bySitemap = sitemaps.map((sitemap, i) => ({
    sitemap,
    urls: lists[i].map((entry) => entry.url).filter((url) => onSite(url)),
  }));
  return { sitemaps, entries, bySitemap };
}

/**
 * The HTTP status `url` answers with, without following a redirect: HEAD
 * first, then GET when the server doesn't take HEAD (its body is never
 * read).
 */
export async function pageStatus(url) {
  const ask = (method) =>
    fetch(url, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  let response = await ask("HEAD");
  if (response.status === 405 || response.status === 501) {
    await response.body?.cancel();
    response = await ask("GET");
  }
  await response.body?.cancel();
  return response.status;
}

/**
 * --check: asks for a sample of each sitemap's pages (sampleUrls), a few
 * at a time. Every one must answer 200 itself: a sitemap that lists a
 * redirect, a missing page or an error sends search engines somewhere they
 * won't index (translated barcode pages once redirected to English while
 * their sitemap listed them). The ones that didn't come back in sample
 * order, with what they answered.
 */
export async function checkSitemapSamples(bySitemap, day = utcDay()) {
  const sample = bySitemap.flatMap(({ urls }) =>
    sampleUrls(urls, SITEMAP_SAMPLE_SIZE, day)
  );
  const answers = new Array(sample.length);
  let next = 0;
  const worker = async () => {
    while (next < sample.length) {
      const index = next;
      next += 1;
      try {
        const status = await pageStatus(sample[index]);
        answers[index] = status === 200 ? undefined : `HTTP ${status}`;
      } catch (error) {
        answers[index] =
          error.name === "TimeoutError" ? "timed out" : error.message;
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  const failures = sample.flatMap((url, i) =>
    answers[i] ? [{ url, answer: answers[i] }] : []
  );
  return { checked: sample.length, failures };
}

/** A short, key-free description of an error response. */
function errorText(text, secret) {
  let message = text;
  try {
    const json = JSON.parse(text);
    // Bing, then Google APIs, then Google's token endpoint.
    message =
      json.Message ??
      json.message ??
      json.error?.message ??
      json.error_description ??
      text;
  } catch {
    // Not JSON: keep the text.
  }
  const short = String(message).replace(/\s+/g, " ").trim().slice(0, 200);
  return secret ? short.replaceAll(secret, "***") : short;
}

const KEY_LOCATION = `${SITE}/${INDEXNOW_KEY}.txt`;

/** Whether the site serves the IndexNow key file (IndexNow rejects us if not). */
async function keyFileServed() {
  const keyFile = await request(KEY_LOCATION).catch((error) => ({
    ok: false,
    status: error.name,
    text: "",
  }));
  return {
    served: keyFile.ok && keyFile.text.trim() === INDEXNOW_KEY,
    status: keyFile.status,
  };
}

async function sendIndexNow(urls, results) {
  if (urls.length === 0) {
    results.push(["IndexNow", "0 URLs", "nothing to send"]);
    return;
  }
  const keyFile = await keyFileServed();
  if (!keyFile.served) {
    warn(
      `IndexNow: ${KEY_LOCATION} doesn't serve the key (HTTP ${keyFile.status}); skipped.`
    );
    results.push(["IndexNow", `${urls.length} URLs`, "skipped: key file"]);
    return;
  }
  const urlList = urls.slice(0, INDEXNOW_MAX);
  const response = await request(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: new URL(SITE).host,
      key: INDEXNOW_KEY,
      keyLocation: KEY_LOCATION,
      urlList,
    }),
  });
  // 200: accepted. 202: accepted, key check pending.
  if (!response.ok) {
    warn(
      `IndexNow answered HTTP ${response.status}: ${errorText(response.text)}`
    );
  }
  results.push([
    "IndexNow",
    `${urlList.length} URLs`,
    `HTTP ${response.status}`,
  ]);
}

async function callBing(method, key, { query = {}, body } = {}) {
  const url = new URL(`${BING_API}/${method}`);
  for (const [name, value] of Object.entries(query)) {
    url.searchParams.set(name, value);
  }
  url.searchParams.set("apikey", key);
  const response = await request(url, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = JSON.parse(response.text)?.d;
  } catch {
    data = undefined;
  }
  return { ...response, data, error: errorText(response.text, key) };
}

/**
 * One outcome when every call ended the same ("HTTP 200"), else each with
 * its count: "HTTP 200 ×6, timed out ×1".
 */
export function statusSummary(outcomes) {
  const counts = new Map();
  for (const outcome of outcomes) {
    counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
  }
  if (counts.size === 1) return outcomes[0];
  return [...counts]
    .map(([outcome, count]) => `${outcome} ×${count}`)
    .join(", ");
}

/**
 * `submit` for each sitemap in turn, as one results row. A sitemap whose
 * call throws (a timeout, a dropped connection) is a warning and its own
 * outcome; the others still go.
 */
export async function submitSitemaps(engine, sitemaps, submit) {
  const outcomes = [];
  for (const sitemap of sitemaps) {
    try {
      const response = await submit(sitemap);
      if (!response.ok) {
        warn(
          `${engine}: submitting ${sitemap} answered HTTP ${response.status}: ${response.error}`
        );
      }
      outcomes.push(`HTTP ${response.status}`);
    } catch (error) {
      warn(`${engine}: submitting ${sitemap} failed: ${error.message}`);
      outcomes.push(error.name === "TimeoutError" ? "timed out" : "failed");
    }
  }
  return [engine, `${sitemaps.length} sitemaps`, statusSummary(outcomes)];
}

/**
 * The URLs, up to today's quota, then every sitemap. The URLs go first and
 * on their own: a failure there still leaves the sitemaps to send, and a
 * sitemap that fails leaves the rest.
 */
export async function sendBing(urls, results, sitemaps) {
  const key = process.env.BING_WEBMASTER_API_KEY?.trim();
  if (!key) {
    notice(
      "Bing: BING_WEBMASTER_API_KEY isn't set; skipped the Bing Webmaster API."
    );
    results.push(["Bing", "-", "skipped: no API key"]);
    return;
  }

  const sites = await callBing("GetUserSites", key);
  const siteUrl = sites.ok ? pickBingSite(sites.data) : undefined;
  if (!siteUrl) {
    warn(
      sites.ok
        ? `Bing: ${SITE} isn't a verified site for this API key; skipped.`
        : `Bing GetUserSites answered HTTP ${sites.status}: ${sites.error}`
    );
    results.push(["Bing", "-", `skipped: GetUserSites HTTP ${sites.status}`]);
    return;
  }

  try {
    await sendBingUrls(key, siteUrl, urls, results);
  } catch (error) {
    warn(`Bing: submitting the URLs failed: ${error.message}`);
    results.push(["Bing", `${urls.length} URLs`, "failed"]);
  }
  results.push(
    await submitSitemaps("Bing", sitemaps, (feedUrl) =>
      callBing("SubmitFeed", key, { body: { siteUrl, feedUrl } })
    )
  );
}

/** Today's quota, then up to that many of `urls`. */
async function sendBingUrls(key, siteUrl, urls, results) {
  if (urls.length === 0) {
    results.push(["Bing", "0 URLs", "nothing to send"]);
    return;
  }
  const quota = await callBing("GetUrlSubmissionQuota", key, {
    query: { siteUrl },
  });
  const daily = quota.ok ? Number(quota.data?.DailyQuota) : Number.NaN;
  if (!Number.isFinite(daily)) {
    warn(
      `Bing GetUrlSubmissionQuota answered HTTP ${quota.status}: ${quota.error}`
    );
    results.push(["Bing", `${urls.length} URLs`, "skipped: quota unknown"]);
    return;
  }
  const urlList = urls.slice(0, Math.min(daily, BING_BATCH_MAX));
  if (urlList.length === 0) {
    warn(
      "Bing: today's URL submission quota is used up; sending the sitemaps only."
    );
    results.push(["Bing", `${urls.length} URLs`, "skipped: quota 0"]);
    return;
  }
  const batch = await callBing("SubmitUrlBatch", key, {
    body: { siteUrl, urlList },
  });
  if (!batch.ok) {
    warn(`Bing SubmitUrlBatch answered HTTP ${batch.status}: ${batch.error}`);
  }
  results.push([
    "Bing",
    `${urlList.length} of ${urls.length} URLs (quota ${daily})`,
    `HTTP ${batch.status}`,
  ]);
}

/**
 * The service account from GSC_SERVICE_ACCOUNT_JSON and an access token for
 * it, or why there isn't one. `missing` means the secret isn't set.
 */
async function googleAccess() {
  const json = process.env.GSC_SERVICE_ACCOUNT_JSON?.trim();
  if (!json) return { missing: true };
  const account = parseServiceAccount(json);
  if (!account) {
    return { error: "GSC_SERVICE_ACCOUNT_JSON isn't a service account key" };
  }
  const response = await request(account.tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: googleAssertion(account),
    }),
  });
  let token;
  try {
    token = JSON.parse(response.text)?.access_token;
  } catch {
    token = undefined;
  }
  if (!(response.ok && token)) {
    return {
      error: `token HTTP ${response.status}: ${errorText(response.text)}`,
    };
  }
  return { account, token };
}

async function callGoogle(token, path, method = "GET") {
  const response = await request(`${GSC_API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
  });
  let data;
  try {
    data = response.text ? JSON.parse(response.text) : undefined;
  } catch {
    data = undefined;
  }
  return { ...response, data, error: errorText(response.text, token) };
}

const googleSitemapPath = (sitemap) =>
  `/sites/${encodeURIComponent(GOOGLE_PROPERTY)}/sitemaps/${encodeURIComponent(sitemap)}`;

async function sendGoogle(results, sitemaps) {
  const access = await googleAccess();
  if (access.missing) {
    notice(
      "Google: GSC_SERVICE_ACCOUNT_JSON isn't set; skipped Search Console."
    );
    results.push(["Google", "-", "skipped: no service account"]);
    return;
  }
  if (access.error) {
    warn(`Google: ${access.error}`);
    results.push(["Google", "sitemap", `skipped: ${access.error}`]);
    return;
  }
  results.push(
    await submitSitemaps("Google", sitemaps, (sitemap) =>
      callGoogle(access.token, googleSitemapPath(sitemap), "PUT")
    )
  );
}

/**
 * --check for Google: can the service account see the property, and when
 * did Google last read the sitemap. False when Google refuses the key or the
 * property; a missing secret is fine.
 */
async function checkGoogle(results, sitemaps) {
  const access = await googleAccess();
  if (access.missing) {
    notice("Google: GSC_SERVICE_ACCOUNT_JSON isn't set; nothing to check.");
    results.push(["Google", "service account", "not set"]);
    return true;
  }
  if (access.error) {
    warn(`Google: ${access.error}`);
    results.push(["Google", "service account", access.error]);
    return false;
  }
  results.push(["Google", "service account", "accepted"]);
  const site = await callGoogle(
    access.token,
    `/sites/${encodeURIComponent(GOOGLE_PROPERTY)}`
  );
  if (!site.ok) {
    warn(
      `Google Search Console sites.get answered HTTP ${site.status}: ${site.error}`
    );
    results.push(["Google", "property", `HTTP ${site.status}: ${site.error}`]);
    return false;
  }
  results.push([
    "Google",
    "property",
    `${GOOGLE_PROPERTY}: ${site.data?.permissionLevel ?? "unknown permission"}`,
  ]);
  for (const url of sitemaps) {
    const sitemap = await callGoogle(access.token, googleSitemapPath(url));
    results.push([
      "Google",
      new URL(url).pathname,
      sitemap.ok
        ? `last read ${sitemap.data?.lastDownloaded ?? "never"}${sitemap.data?.isPending ? ", pending" : ""}, ${sitemap.data?.errors ?? 0} errors, ${sitemap.data?.warnings ?? 0} warnings`
        : `not submitted yet (HTTP ${sitemap.status})`,
    ]);
  }
  return true;
}

/** At most this many of the URLs that failed the sample, in a results row. */
const FAILURES_SHOWN = 5;

/**
 * --check. Reads only, never submits: the sitemaps, the important pages in
 * them and a sample of their pages, IndexNow and Bing, then Google. False
 * when no sitemap can be read, an important page is in none, a sampled page
 * doesn't answer 200, or an engine rejects its key or the site.
 */
export async function checkSetup(results) {
  let sitemaps = [SITEMAP_URL];
  let pages = false;
  let sampled = false;
  try {
    const loaded = await loadSitemaps();
    sitemaps = loaded.sitemaps;
    const all = loaded.entries.map((entry) => entry.url);
    results.push([
      "Sitemaps",
      `${sitemaps.length} read`,
      `${all.length} pages: ${sitemaps.map((url) => new URL(url).pathname).join(", ")}`,
    ]);
    const { dropped } = inSitemap(IMPORTANT_PATHS, all);
    if (dropped.length > 0) {
      warn(`Important pages in no sitemap: ${dropped.join(", ")}`);
    }
    results.push([
      "Sitemaps",
      "important pages",
      dropped.length === 0
        ? `all ${IMPORTANT_PATHS.length} listed`
        : `missing: ${dropped.join(", ")}`,
    ]);
    pages = dropped.length === 0;
    const toBing = bingUrls(all);
    const priority = priorityUrls(toBing).length;
    results.push([
      "Sitemaps",
      "for Bing",
      `${priority} priority pages (each once a week), then ${toBing.length - priority} more in turn; ${all.length - toBing.length} translations and community items left to IndexNow`,
    ]);
    const { checked, failures } = await checkSitemapSamples(loaded.bySitemap);
    if (failures.length > 0) {
      warn(
        `Sitemap pages that didn't answer HTTP 200: ${failures
          .map(({ url, answer }) => `${url} (${answer})`)
          .join(", ")}`
      );
    }
    const shown = failures
      .slice(0, FAILURES_SHOWN)
      .map(({ url, answer }) => `${new URL(url).pathname} (${answer})`)
      .join(", ");
    const more =
      failures.length > FAILURES_SHOWN
        ? ` and ${failures.length - FAILURES_SHOWN} more`
        : "";
    results.push([
      "Sitemaps",
      `sample of ${checked} pages`,
      failures.length === 0
        ? "every one answered HTTP 200"
        : `${failures.length} didn't answer HTTP 200: ${shown}${more}`,
    ]);
    sampled = failures.length === 0;
  } catch (error) {
    warn(`Couldn't read the sitemaps: ${error.message}`);
    results.push(["Sitemaps", "-", `failed: ${error.message}`]);
  }
  const bing = await checkIndexNowAndBing(results);
  let google = false;
  try {
    google = await checkGoogle(results, sitemaps);
  } catch (error) {
    warn(`Google check failed: ${error.message}`);
  }
  return pages && sampled && bing && google;
}

/**
 * The IndexNow key file, then the Bing key, the site's verification and
 * today's quota. False when Bing rejects the key or the site; a missing key
 * or an undeployed key file is fine.
 */
async function checkIndexNowAndBing(results) {
  const keyFile = await keyFileServed();
  results.push([
    "IndexNow",
    "key file",
    keyFile.served
      ? `served at ${KEY_LOCATION}`
      : `not served yet (HTTP ${keyFile.status}); it goes live with the deploy`,
  ]);

  const key = process.env.BING_WEBMASTER_API_KEY?.trim();
  if (!key) {
    notice("Bing: BING_WEBMASTER_API_KEY isn't set; nothing to check.");
    results.push(["Bing", "API key", "not set"]);
    return true;
  }

  const sites = await callBing("GetUserSites", key);
  if (!sites.ok) {
    warn(`Bing GetUserSites answered HTTP ${sites.status}: ${sites.error}`);
    results.push(["Bing", "API key", `HTTP ${sites.status}: ${sites.error}`]);
    return false;
  }
  results.push(["Bing", "API key", "accepted"]);
  const siteUrl = pickBingSite(sites.data);
  const listed = (sites.data ?? []).find((s) => {
    try {
      return new URL(s.Url).hostname === new URL(SITE).hostname;
    } catch {
      return false;
    }
  });
  results.push([
    "Bing",
    "site",
    siteUrl
      ? `${siteUrl} verified`
      : listed
        ? `${listed.Url} added but not verified`
        : `${SITE} not added to Bing Webmaster Tools`,
  ]);

  const quota = await callBing("GetUrlSubmissionQuota", key, {
    query: { siteUrl: siteUrl ?? `${SITE}/` },
  });
  if (!quota.ok) {
    warn(
      `Bing GetUrlSubmissionQuota answered HTTP ${quota.status}: ${quota.error}`
    );
    results.push(["Bing", "quota", `HTTP ${quota.status}: ${quota.error}`]);
    return false;
  }
  results.push([
    "Bing",
    "quota",
    `${quota.data?.DailyQuota} URLs today, ${quota.data?.MonthlyQuota} this month`,
  ]);
  return Boolean(siteUrl);
}

function report(results, { title = "Search engines", column = "Sent" } = {}) {
  const width = Math.max(...results.map(([, sent]) => sent.length));
  for (const [engine, sent, outcome] of results) {
    console.log(`${engine.padEnd(9)} ${sent.padEnd(width)}  ${outcome}`);
  }
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    const rows = results.map((row) => `| ${row.join(" | ")} |`).join("\n");
    writeFileSync(
      summary,
      `### ${title}\n\n| Engine | ${column} | Result |\n| --- | --- | --- |\n${rows}\n`,
      { flag: "a" }
    );
  }
}

const USAGE =
  "Usage: notify-search-engines.mjs (--all | --important | --urls <file> | --changed-since <file> | --backlog | --snapshot <file> | --check) [--dry-run]";

export async function main(argv = process.argv.slice(2)) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        all: { type: "boolean" },
        important: { type: "boolean" },
        urls: { type: "string" },
        "changed-since": { type: "string" },
        backlog: { type: "boolean" },
        snapshot: { type: "string" },
        check: { type: "boolean" },
        "dry-run": { type: "boolean" },
      },
    }));
  } catch (error) {
    console.error(`${error.message}\n${USAGE}`);
    return 2;
  }
  const modes = [
    "all",
    "important",
    "urls",
    "changed-since",
    "backlog",
    "snapshot",
    "check",
  ].filter((mode) => values[mode] !== undefined);
  if (modes.length !== 1) {
    console.error(USAGE);
    return 2;
  }

  if (values.check) {
    const results = [];
    let ok = false;
    try {
      ok = await checkSetup(results);
    } catch (error) {
      warn(`Check failed: ${error.message}`);
    }
    report(results, { title: "Search engine setup", column: "Checked" });
    return ok ? 0 : 1;
  }

  let loaded;
  try {
    loaded = await loadSitemaps();
  } catch (error) {
    warn(`Couldn't read the sitemaps: ${error.message}. Nothing sent.`);
    return 0;
  }
  const { sitemaps, entries: sitemap } = loaded;

  if (values.snapshot) {
    writeFileSync(values.snapshot, toUrlset(sitemap));
    console.log(
      `Saved ${sitemap.length} URLs from ${sitemaps.length} sitemaps to ${values.snapshot}.`
    );
    return 0;
  }

  const all = sitemap.map((entry) => entry.url);
  const { dropped: missing } = inSitemap(IMPORTANT_PATHS, all);
  if (missing.length > 0) {
    warn(
      `Important pages in no sitemap, so not sent: ${missing.join(", ")}. Fix IMPORTANT_PATHS in scripts/notify-search-engines.mjs or the sitemaps.`
    );
  }
  const important = priorityUrls(all.filter(forBing));
  // What each engine gets. IndexNow has no quota; Bing's is small, so it
  // gets the priority pages first and no translations or community items
  // (bingUrls), except for a list of URLs given by hand. Google gets the
  // sitemap whenever pages are sent, but not for the Bing backlog.
  let plan;
  if (values.all) {
    plan = { indexNow: all, bing: bingUrls(all), source: "every sitemap URL" };
  } else if (values.important) {
    plan = {
      indexNow: important,
      bing: important,
      source: "the priority pages",
    };
  } else if (values.backlog) {
    plan = {
      indexNow: [],
      bing: backlogUrls(all, utcDay()).slice(0, BING_BATCH_MAX),
      google: false,
      source:
        "today's priority pages and slice of the sitemap, for Bing, as far as the quota left goes",
    };
  } else if (values.urls) {
    let lines;
    try {
      lines = readFileSync(values.urls, "utf8").split(/\s+/);
    } catch (error) {
      console.error(`Couldn't read ${values.urls}: ${error.message}`);
      return 2;
    }
    const { kept, dropped } = inSitemap(lines, all);
    if (dropped.length > 0) {
      warn(`In no sitemap, so not sent: ${dropped.join(", ")}`);
    }
    plan = { indexNow: kept, bing: kept, source: values.urls };
  } else {
    let before = [];
    try {
      before = parseSitemap(readFileSync(values["changed-since"], "utf8"));
    } catch {
      before = [];
    }
    if (before.length === 0) {
      warn(
        "No saved sitemap to compare with: sending every URL to IndexNow and the main pages to Bing."
      );
      plan = { indexNow: all, bing: important, source: "fallback" };
    } else {
      const changed = changedUrls(before, sitemap);
      plan = {
        indexNow: changed,
        bing: bingUrls(changed),
        source: "changed since the last deploy",
      };
    }
  }

  // The backlog sends from the front of the rotation until the quota runs
  // out, usually no more than one step.
  const listed = values.backlog
    ? plan.bing.slice(0, BING_BACKLOG_STEP)
    : plan.indexNow;
  console.log(
    `${listed.length} URLs (${plan.source}) of ${all.length} in ${sitemaps.length} sitemaps.`
  );
  for (const url of listed.slice(0, 50)) console.log(`  ${url}`);
  if (listed.length > 50) {
    console.log(`  … and ${listed.length - 50} more`);
  }
  if (values["dry-run"]) {
    console.log("Dry run: nothing sent.");
    return 0;
  }

  const results = [];
  if (!values.backlog) {
    try {
      await sendIndexNow(plan.indexNow, results);
    } catch (error) {
      warn(`IndexNow failed: ${error.message}`);
      results.push(["IndexNow", `${plan.indexNow.length} URLs`, "failed"]);
    }
  }
  try {
    await sendBing(plan.bing, results, sitemaps);
  } catch (error) {
    warn(`Bing failed: ${error.message}`);
    results.push(["Bing", `${plan.bing.length} URLs`, "failed"]);
  }
  if (plan.google !== false) {
    try {
      await sendGoogle(results, sitemaps);
    } catch (error) {
      warn(`Google failed: ${error.message}`);
      results.push(["Google", "sitemap", "failed"]);
    }
  }
  report(results);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await main();
}
