#!/usr/bin/env node
// Posts QRdx news to the QRdx Discord server through channel webhooks.
// Node 22, no packages.
//
//   node scripts/discord-notify.mjs changelog --before <sha> --after <sha>
//       #announcements: one post for each changelog entry
//       (apps/app/content/changelog/<slug>.mdx) the push from <before> to
//       <after> added, with its title, description and picture, linked to
//       qrdx.dev/changelogs#<slug>. An entry that was edited or renamed
//       posts nothing.
//   node scripts/discord-notify.mjs release --before <sha> --after <sha>
//       #releases: the pull requests the push brought to main, by title,
//       with links. Which ones count: releasePulls and isInternal below.
//   node scripts/discord-notify.mjs npm <package dir>...
//       #releases: "<name> <version> is on npm" for each package directory
//       given, read from its package.json. publish.yml runs it after it
//       publishes.
//   node scripts/discord-notify.mjs mcp-registry
//       #releases: the version in server.json is in the MCP Registry.
//       mcp-registry.yml runs it after it publishes.
//
// The webhooks are the repository secrets DISCORD_ANNOUNCEMENTS_WEBHOOK_URL
// (#announcements) and DISCORD_RELEASES_WEBHOOK_URL (#releases). Without
// the one a command needs, it prints a notice and posts nothing. Add
// --dry-run to print each post as JSON instead of sending it; that needs no
// webhook. "release" reads the GitHub API with GITHUB_TOKEN (Actions' own
// token, or `gh auth token` locally) for GITHUB_REPOSITORY (default
// qrdxinc/qrdx); "changelog" reads git, so both commits must be fetched.
//
// Nothing here may fail a deploy, a merge or a publish: a Discord, GitHub
// or git error is a warning and the exit code stays 0. Only bad arguments
// exit with 2. .github/workflows/discord-notify.yml runs the first two
// after each push to main.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const SITE = "https://qrdx.dev";
export const DEFAULT_REPOSITORY = "qrdxinc/qrdx";

/**
 * A changelog entry: <app>/content/changelog/<slug>.mdx. The main app's
 * are in apps/app (apps/docs before the app was renamed), so any app's
 * count: a folder that moves isn't news, and old pushes still read right.
 * Groups: the app's folder, and the path under content/changelog.
 */
const ENTRY_PATH = /^(apps\/[^/]+)\/content\/changelog\/(.+)\.mdx?$/;
/** The same, as a git pathspec. */
const ENTRY_PATHSPEC = ":(glob)apps/*/content/changelog/**";
/**
 * More new entries than this in one push is a move or an import, not
 * news: nothing is posted then, with a warning.
 */
export const MAX_NEW_ENTRIES = 5;

/** Who the posts come from. */
export const USERNAME = "QRdx";
/** apps/app/public/logo.png: the mark on white, 512×512. */
export const AVATAR_URL = `${SITE}/logo.png`;
/** BRAND_BLUE (#0051ff, packages/config/brand.ts) as Discord's number. */
export const COLOR = 0x00_51_ff;

/** Each channel and the secret that holds its webhook URL. */
export const CHANNELS = {
  announcements: "DISCORD_ANNOUNCEMENTS_WEBHOOK_URL",
  releases: "DISCORD_RELEASES_WEBHOOK_URL",
};

/** Discord's message and embed limits, in characters. */
export const LIMITS = {
  content: 2000,
  title: 256,
  description: 4096,
  footer: 2048,
  embeds: 10,
  /** Every embed's text in one message, together. */
  total: 6000,
};

/** A release post lists this many pull requests at most, then "and N more". */
export const RELEASE_MAX_PULLS = 10;
/** A pull request title longer than this is cut. */
const PULL_TITLE_MAX = 200;

const SHA = /^[0-9a-f]{7,40}$/i;
const ZERO_SHA = /^0+$/;

/**
 * @typedef {{ info: (text: string) => void, notice: (text: string) => void,
 *   warning: (text: string) => void, out: (text: string) => void }} Log
 * @typedef {{ number: number, title: string, html_url: string,
 *   merged_at?: string | null, merge_commit_sha?: string | null,
 *   head?: { ref?: string, repo?: { full_name?: string } | null },
 *   base?: { ref?: string } }} Pull
 * @typedef {{ sha: string, parents?: unknown[],
 *   commit?: { message?: string } }} Commit
 * @typedef {(path: string) => Promise<any>} GitHub
 * @typedef {{ username: string, avatar_url: string,
 *   allowed_mentions: { parse: string[] }, content?: string,
 *   embeds: any[] }} Payload
 */

/** @type {Log} */
const consoleLog = {
  info: (text) => console.log(text),
  // Annotations in the Actions run; plain lines anywhere else.
  notice: (text) => console.log(`::notice::${text}`),
  warning: (text) => console.log(`::warning::${text}`),
  out: (text) => console.log(text),
};

// ---------------------------------------------------------------------------
// Text

/**
 * `text` cut to `max` characters, ending in "…" when it was longer. Discord
 * counts characters; JavaScript's length counts at least as many.
 * @param {string} text
 * @param {number} max
 */
export function clip(text, max) {
  if (text.length <= max) return text;
  let cut = text.slice(0, max - 1);
  // Never leave half of an emoji.
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/**
 * `text` shown as written: Discord's markdown characters escaped, so a
 * title with `*`, `_` or brackets can't turn bold or break a link.
 * @param {string} text
 */
export function escapeMarkdown(text) {
  return text.replace(/[\\*_~`|[\]<>]/g, "\\$&").replace(/^([#>-])/gm, "\\$1");
}

/**
 * A webhook message with what every post carries: the QRdx name and logo,
 * and no mentions at all, so no text in it can ping @everyone, a role or
 * a person.
 * @param {{ embeds: any[], content?: string }} fields
 * @returns {Payload}
 */
export function message(fields) {
  return {
    username: USERNAME,
    avatar_url: AVATAR_URL,
    allowed_mentions: { parse: [] },
    ...fields,
  };
}

/**
 * `lines` joined, as many as fit in `maxLines` and `maxChars`, with
 * `more(n)` as the last line when n were left out.
 * @param {string[]} lines
 * @param {{ maxLines: number, maxChars: number, more: (n: number) => string }} limits
 */
export function fitLines(lines, { maxLines, maxChars, more }) {
  const text = (/** @type {number} */ count) => {
    const shown = lines.slice(0, count);
    if (count < lines.length) shown.push(more(lines.length - count));
    return shown.join("\n");
  };
  let count = Math.min(lines.length, maxLines);
  while (count > 0 && text(count).length > maxChars) count--;
  return text(count);
}

// ---------------------------------------------------------------------------
// Changelog entries

/**
 * The front matter's top-level values: strings (quoted or not), block
 * strings (`|` and `>`) and flow lists (`tags: ["A", "B"]`). Nested maps
 * and lists (`npm:`, `cta:`) are left out; nothing here needs them.
 * @param {string} text
 * @returns {Record<string, any>}
 */
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(
    text.replace(/^﻿/, "")
  );
  if (!match) return {};
  const lines = match[1].split(/\r?\n/);
  /** @type {Record<string, any>} */
  const data = {};
  for (let i = 0; i < lines.length; i++) {
    const line = /^([A-Za-z_][\w-]*):(?:[ \t]+(.*))?$/.exec(lines[i]);
    if (!line) continue;
    const [, key, raw = ""] = line;
    const value = raw.trim();
    if (/^[|>][+-]?$/.test(value)) {
      const block = [];
      while (i + 1 < lines.length && /^(\s+\S|\s*$)/.test(lines[i + 1])) {
        block.push(lines[++i].trim());
      }
      data[key] = value.startsWith(">")
        ? block.filter(Boolean).join(" ")
        : block.join("\n").trim();
    } else if (value !== "") {
      data[key] = yamlScalar(value);
    }
  }
  return data;
}

/** @param {string} value @returns {any} */
function yamlScalar(value) {
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, value.lastIndexOf('"'));
    }
  }
  if (value.startsWith("'")) {
    return value.slice(1, value.lastIndexOf("'")).replaceAll("''", "'");
  }
  if (value.startsWith("[")) {
    try {
      return JSON.parse(value);
    } catch {
      return value
        .slice(1, value.lastIndexOf("]"))
        .split(",")
        .map((item) => yamlScalar(item.trim()))
        .filter(Boolean);
    }
  }
  return value.replace(/\s+#.*$/, "");
}

/**
 * The changelog entries a diff added, from `git diff --name-status -M`
 * ("A\t<path>"). Edits (M) and renames or moves (R) aren't new entries.
 * @param {string} nameStatus
 */
export function addedEntries(nameStatus) {
  return nameStatus
    .split("\n")
    .map((line) => line.split("\t"))
    .filter(([status, path]) => status === "A" && ENTRY_PATH.test(path ?? ""))
    .map(([, path]) => path);
}

/**
 * An entry's anchor on /changelogs: its path under content/changelog,
 * without the extension, with folders joined by "-" (changelogAnchor in
 * apps/app/lib/changelog-feed.ts joins fumadocs' slugs that way).
 * @param {string} path
 */
export function entrySlug(path) {
  const under = ENTRY_PATH.exec(path)?.[2] ?? path.replace(/\.mdx?$/, "");
  const segments = under.split("/");
  if (segments.length > 1 && segments.at(-1) === "index") segments.pop();
  return segments.join("-");
}

/**
 * A picture's public URL, resolved as the site does (pictureUrl in
 * apps/app/lib/media.ts): an uploaded media key's URL, else the site path
 * on qrdx.dev, but only when that file is in the app's public folder.
 * Anything else is undefined, so a post never shows a broken picture.
 * @param {unknown} path
 * @param {{ manifest?: { origin?: string, files?: Record<string, string> } | null,
 *   inPublic: (path: string) => boolean }} where
 */
export function pictureUrl(path, { manifest, inPublic }) {
  if (typeof path !== "string" || path === "") return;
  if (/^https:\/\/[^/]/.test(path)) return path;
  const key = manifest?.files?.[path];
  if (key && manifest?.origin) return `${manifest.origin}/${key}`;
  if (/^\/(?!\/)/.test(path) && !path.split("/").includes("..")) {
    return inPublic(path) ? `${SITE}${encodeURI(path)}` : undefined;
  }
}

/**
 * The post for one new changelog entry.
 * @param {{ slug: string, data: Record<string, any> }} entry
 * @param {string | undefined} picture
 */
export function changelogMessage({ slug, data }, picture) {
  const tags = Array.isArray(data.tags)
    ? data.tags.filter((tag) => typeof tag === "string")
    : [];
  const footer = [data.version ? `v${data.version}` : "", tags.join(", ")]
    .filter(Boolean)
    .join(" · ");
  const embed = {
    title: clip(String(data.title), LIMITS.title),
    url: `${SITE}/changelogs#${encodeURIComponent(slug)}`,
    color: COLOR,
    ...(typeof data.description === "string" && data.description
      ? {
          description: clip(
            escapeMarkdown(data.description),
            LIMITS.description
          ),
        }
      : {}),
    ...(picture ? { image: { url: picture } } : {}),
    ...(footer ? { footer: { text: clip(footer, LIMITS.footer) } } : {}),
  };
  return message({ embeds: [embed] });
}

/** "0.1.0" before "0.0.6" when sorted with this, newest last. */
function compareVersions(a = "0", b = "0") {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

/**
 * @param {(args: string[]) => string} git
 * @param {string} commit
 * @param {string} path
 */
function inTree(git, commit, path) {
  try {
    return git(["ls-tree", "--name-only", commit, "--", path]).trim() !== "";
  } catch {
    return false;
  }
}

/**
 * The posts for the changelog entries added between two commits, oldest
 * release first, so the newest ends up at the bottom of the channel.
 * @param {{ before: string, after: string, git: (args: string[]) => string, log: Log }} options
 */
export function changelogMessages({ before, after, git, log }) {
  const added = addedEntries(
    git(["diff", "--name-status", "-M", before, after, "--", ENTRY_PATHSPEC])
  );
  // An entry whose anchor the changelog already had isn't new either, in
  // case a move was too big for git to pair up.
  const earlier = new Set(
    git(["ls-tree", "-r", "--name-only", before, "--", "apps/"])
      .split("\n")
      .filter((path) => ENTRY_PATH.test(path))
      .map(entrySlug)
  );
  const paths = added.filter((path) => !earlier.has(entrySlug(path)));
  if (paths.length === 0) {
    log.info("No new changelog entry, so nothing to post to #announcements.");
    return [];
  }
  if (paths.length > MAX_NEW_ENTRIES) {
    log.warning(
      `${paths.length} new changelog entries in one push looks like a move or an import, so none was posted: ${paths.join(", ")}`
    );
    return [];
  }
  /** @type {Map<string, any>} */
  const manifests = new Map();
  /** @param {string} app */
  const manifestOf = (app) => {
    if (!manifests.has(app)) {
      const file = `${app}/lib/media-manifest.json`;
      try {
        manifests.set(app, JSON.parse(git(["show", `${after}:${file}`])));
      } catch {
        log.warning(`Couldn't read ${file}; media keys get no picture.`);
        manifests.set(app, null);
      }
    }
    return manifests.get(app);
  };
  const entries = [];
  for (const path of paths) {
    const data = parseFrontmatter(git(["show", `${after}:${path}`]));
    if (typeof data.title !== "string" || data.title.trim() === "") {
      log.warning(`${path} has no title, so it wasn't posted.`);
      continue;
    }
    // As on the site, an entry without `image` has no picture at all. The
    // dark one goes first: Discord's default theme is dark.
    let picture;
    if (data.image) {
      const app = ENTRY_PATH.exec(path)?.[1] ?? "apps/app";
      const where = {
        manifest: manifestOf(app),
        inPublic: (/** @type {string} */ file) =>
          inTree(git, after, `${app}/public${file}`),
      };
      picture =
        pictureUrl(data.imageDark, where) ?? pictureUrl(data.image, where);
      if (!picture) {
        log.warning(
          `${path}: couldn't find its picture (${data.image}), so the post has none.`
        );
      }
    }
    entries.push({ slug: entrySlug(path), data, picture });
  }
  entries.sort(
    (a, b) =>
      String(a.data.date ?? "").localeCompare(String(b.data.date ?? "")) ||
      compareVersions(a.data.version, b.data.version) ||
      a.slug.localeCompare(b.slug)
  );
  return entries.map((entry) => changelogMessage(entry, entry.picture));
}

// ---------------------------------------------------------------------------
// Releases

/** Conventional-commit titles for work nobody using QRdx sees. */
const INTERNAL_TITLE = /^(chore|ci|build|tests?|deps)(\([^)]*\))?!?:/i;
/** Branches named for the same kind of work, and dependency bots'. */
const INTERNAL_BRANCH = /^(chore|ci|build|tests?|deps|dependabot|renovate)\//i;

/**
 * Whether a file is CI, a git hook or a test, which change nothing people
 * use: anything under .github/ or .husky/, in a tests/, test/,
 * __tests__/, e2e/ or fixtures folder, or named *.test.*, *.spec.* or
 * *.e2e.*.
 * @param {string} path
 */
export function isInternalPath(path) {
  return (
    /^\.(github|husky)\//.test(path) ||
    /(^|\/)(tests?|__tests__|e2e|fixtures|__fixtures__|__snapshots__)\//.test(
      path
    ) ||
    /\.(test|spec|e2e)\.[cm]?[jt]sx?$/.test(path)
  );
}

/**
 * Whether a pull request is left out of release posts by its name: a title
 * that starts "chore:", "ci:", "build:", "test:" or "deps:" (with or
 * without a scope), or a branch named chore/, ci/, build/, test/, deps/,
 * dependabot/ or renovate/.
 * @param {Pull} pull
 */
export function isInternal(pull) {
  return (
    INTERNAL_TITLE.test(pull.title.trim()) ||
    INTERNAL_BRANCH.test(pull.head?.ref ?? "")
  );
}

/**
 * A promotion between this repository's own long-lived branches: the
 * release pull request (staging into main), or main merged back into
 * staging. A fork's branch called main is an ordinary pull request.
 * @param {Pull} pull
 * @param {string} repository
 */
export function isPromotion(pull, repository) {
  return (
    pull.head?.repo?.full_name === repository &&
    (pull.head?.ref === "main" || pull.head?.ref === "staging")
  );
}

/**
 * The commits that can be a pull request's merge: merge commits, and
 * squashed ones ("Title (#123)").
 * @param {Commit[]} commits
 */
export function mergeCandidates(commits) {
  return commits.filter(
    (commit) =>
      (commit.parents?.length ?? 0) > 1 ||
      /\(#\d+\)\s*$/.test((commit.commit?.message ?? "").split("\n")[0])
  );
}

/**
 * The pull requests a push brought to main: those whose merge commit is
 * one of the push's commits (so a pull request is listed by the release
 * that brings it, never twice), in the order they were merged, and the
 * release pull request itself (staging into main), if there is one.
 * @param {{ commits: Commit[], repository: string, github: GitHub }} options
 * @returns {Promise<{ pulls: Pull[], release: Pull | null }>}
 */
export async function releasePulls({ commits, repository, github }) {
  /** @type {Map<number, Pull>} */
  const pulls = new Map();
  /** @type {Pull | null} */
  let release = null;
  for (const commit of mergeCandidates(commits)) {
    /** @type {Pull[]} */
    const associated = await github(
      `/repos/${repository}/commits/${commit.sha}/pulls`
    );
    for (const pull of associated) {
      if (!pull.merged_at || pull.merge_commit_sha !== commit.sha) continue;
      if (isPromotion(pull, repository)) {
        if (pull.base?.ref === "main") release = pull;
        continue;
      }
      pulls.set(pull.number, pull);
    }
  }
  const merged = [...pulls.values()].sort((a, b) =>
    String(a.merged_at).localeCompare(String(b.merged_at))
  );
  return { pulls: merged, release };
}

/**
 * Whether every file a pull request changes is CI, a git hook or a test.
 * @param {Pull} pull
 * @param {{ repository: string, github: GitHub }} options
 */
export async function onlyInternalFiles(pull, { repository, github }) {
  // GitHub lists up to 3,000 files, 100 a page.
  for (let page = 1; page <= 30; page++) {
    /** @type {{ filename: string, previous_filename?: string }[]} */
    const files = await github(
      `/repos/${repository}/pulls/${pull.number}/files?per_page=100&page=${page}`
    );
    const outside = files.some(
      (file) =>
        !isInternalPath(file.filename) ||
        (file.previous_filename !== undefined &&
          !isInternalPath(file.previous_filename))
    );
    if (outside) return false;
    if (files.length < 100) break;
  }
  return true;
}

/**
 * The #releases post for a push to main.
 * @param {{ pulls: Pull[], release: Pull | null, compare: string,
 *   maxPulls?: number }} options
 */
export function releaseMessage({
  pulls,
  release,
  compare,
  maxPulls = RELEASE_MAX_PULLS,
}) {
  const lines = pulls.map(
    (pull) =>
      `- [${escapeMarkdown(clip(pull.title.trim(), PULL_TITLE_MAX))}](${pull.html_url})`
  );
  const description = fitLines(lines, {
    maxLines: maxPulls,
    maxChars: LIMITS.description,
    more: (count) => `and ${count} more: [see every change](${compare})`,
  });
  const count = `${pulls.length} pull request${pulls.length === 1 ? "" : "s"}`;
  return message({
    embeds: [
      {
        title: "Live on qrdx.dev",
        url: release?.html_url ?? compare,
        color: COLOR,
        description,
        footer: {
          text: release ? `Release #${release.number} · ${count}` : count,
        },
      },
    ],
  });
}

/**
 * GET requests to the GitHub REST API, answered as JSON.
 * @param {{ token?: string, apiUrl?: string }} options
 * @returns {GitHub}
 */
export function githubClient({ token, apiUrl = "https://api.github.com" }) {
  return async (path) => {
    const response = await fetch(`${apiUrl}${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "qrdx-discord-notify",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `GitHub answered ${response.status} for ${path.split("?")[0]}: ${text.slice(0, 200)}`
      );
    }
    return response.json();
  };
}

/**
 * Every commit between two commits, from the GitHub API, oldest first.
 * @param {{ before: string, after: string, repository: string, github: GitHub }} options
 * @returns {Promise<Commit[]>}
 */
async function compareCommits({ before, after, repository, github }) {
  const commits = [];
  for (let page = 1; page <= 10; page++) {
    const data = await github(
      `/repos/${repository}/compare/${before}...${after}?per_page=100&page=${page}`
    );
    const batch = data.commits ?? [];
    commits.push(...batch);
    if (batch.length < 100) break;
  }
  return commits;
}

/** @param {string} repository @param {string} before @param {string} after */
export function compareUrl(repository, before, after) {
  return `https://github.com/${repository}/compare/${before.slice(0, 12)}...${after.slice(0, 12)}`;
}

/**
 * The #releases post for the push from `before` to `after`, or none when
 * every pull request in it is internal (or it has none).
 * @param {{ before: string, after: string, repository: string,
 *   github: GitHub, log: Log }} options
 */
export async function releaseMessages({
  before,
  after,
  repository,
  github,
  log,
}) {
  const commits = await compareCommits({ before, after, repository, github });
  const { pulls, release } = await releasePulls({
    commits,
    repository,
    github,
  });
  const shown = [];
  for (const pull of pulls) {
    if (isInternal(pull)) {
      log.info(`Left out #${pull.number} (${pull.title}): internal by name.`);
    } else if (await onlyInternalFiles(pull, { repository, github })) {
      log.info(
        `Left out #${pull.number} (${pull.title}): only CI and test files.`
      );
    } else {
      shown.push(pull);
    }
  }
  if (shown.length === 0) {
    log.info(
      `No pull request in ${commits.length} commit${commits.length === 1 ? "" : "s"} changes what people use, so nothing to post to #releases.`
    );
    return [];
  }
  return [
    releaseMessage({
      pulls: shown,
      release,
      compare: compareUrl(repository, before, after),
    }),
  ];
}

// ---------------------------------------------------------------------------
// Packages and the MCP Registry

const PACKAGE_NAME = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/;
const VERSION = /^\d+\.\d+\.\d+([-+][\w.-]+)?$/;

/**
 * The #releases post for packages published to npm, one embed each.
 * @param {{ name: string, version: string }[]} packages
 */
export function npmMessage(packages) {
  return message({
    embeds: packages.slice(0, LIMITS.embeds).map(({ name, version }) => ({
      title: clip(`${name} ${version} is on npm`, LIMITS.title),
      url: `https://www.npmjs.com/package/${name}/v/${version}`,
      color: COLOR,
      description: `\`npm install ${name}@${version}\``,
    })),
  });
}

/**
 * The #releases post for a server.json version in the MCP Registry.
 * @param {{ name: string, version: string, title?: string,
 *   websiteUrl?: string, remotes?: { url?: string }[] }} server
 */
export function mcpRegistryMessage(server) {
  const remote = server.remotes?.find((item) => item.url)?.url;
  return message({
    embeds: [
      {
        title: clip(
          `${server.title ?? server.name} MCP server ${server.version} is in the MCP Registry`,
          LIMITS.title
        ),
        url: server.websiteUrl ?? `${SITE}/mcp`,
        color: COLOR,
        description: [
          `Registry name \`${server.name}\``,
          remote ? `Connect at ${remote}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Posting

/**
 * Whether a URL is a Discord webhook, so a wrong secret never sends the
 * post anywhere else.
 * @param {string} value
 */
export function isDiscordWebhook(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      /^((canary|ptb)\.)?discord(app)?\.com$/.test(url.hostname) &&
      /^\/api\/(v\d+\/)?webhooks\/\d+\/[\w-]+\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

/** A post's first embed title, for the log. */
function postTitle(/** @type {any} */ payload) {
  return payload.embeds?.[0]?.title ?? "(no title)";
}

/**
 * Sends one message to a webhook. Rate limited (429), it waits as long as
 * Discord asks, up to 30 seconds, and tries once more.
 * @param {string} webhook
 * @param {object} payload
 */
export async function post(webhook, payload) {
  const url = new URL(webhook);
  url.searchParams.set("wait", "true");
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "qrdx-discord-notify",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.ok) return;
    const text = await response.text().catch(() => "");
    if (response.status === 429 && attempt === 1) {
      let seconds = Number(response.headers.get("retry-after") ?? 1);
      try {
        seconds = Number(JSON.parse(text).retry_after ?? seconds);
      } catch {
        // Not JSON: the header's value stands.
      }
      const wait = Math.min(Math.max(Number(seconds) || 0, 0), 30);
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      continue;
    }
    throw new Error(
      `Discord answered ${response.status}: ${text.slice(0, 300)}`
    );
  }
}

/**
 * Posts each message to a channel, or prints it with --dry-run. A missing
 * webhook is a notice and a failed post a warning; neither throws.
 * @param {keyof typeof CHANNELS} channel
 * @param {object[]} messages
 * @param {{ env: Record<string, string | undefined>, dryRun: boolean, log: Log }} options
 */
export async function deliver(channel, messages, { env, dryRun, log }) {
  if (messages.length === 0) return;
  if (dryRun) {
    for (const payload of messages) {
      log.out(JSON.stringify({ channel: `#${channel}`, payload }, null, 2));
    }
    return;
  }
  const secret = CHANNELS[channel];
  const webhook = env[secret]?.trim();
  if (!webhook) {
    log.notice(`${secret} isn't set, so nothing was posted to #${channel}.`);
    return;
  }
  if (!isDiscordWebhook(webhook)) {
    log.warning(
      `${secret} isn't a Discord webhook URL, so nothing was posted to #${channel}.`
    );
    return;
  }
  for (const payload of messages) {
    try {
      await post(webhook, payload);
      log.info(`Posted to #${channel}: ${postTitle(payload)}`);
    } catch (error) {
      log.warning(
        `Couldn't post "${postTitle(payload)}" to #${channel}: ${error instanceof Error ? error.message : error}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Command line

const USAGE = `Usage:
  discord-notify.mjs changelog --before <sha> --after <sha> [--dry-run]
  discord-notify.mjs release --before <sha> --after <sha> [--dry-run]
  discord-notify.mjs npm <package dir>... [--dry-run]
  discord-notify.mjs mcp-registry [--dry-run]`;

/** @param {string[]} args */
function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * The two commits of a push, or a reason there's nothing to compare.
 * @param {{ before?: string, after?: string }} values
 * @returns {{ before: string, after: string } | { skip: string } | { error: string }}
 */
export function pushRange({ before, after }) {
  if (!(before && after && SHA.test(before) && SHA.test(after))) {
    return { error: "--before and --after take commit SHAs." };
  }
  if (ZERO_SHA.test(before)) {
    return { skip: "The push has no previous commit to compare with." };
  }
  return { before, after };
}

/**
 * @param {string[]} [argv]
 * @param {{ env?: Record<string, string | undefined>,
 *   git?: (args: string[]) => string, log?: Log,
 *   readText?: (path: string) => string }} [deps]
 * @returns {Promise<number>} the exit code
 */
export async function main(argv = process.argv.slice(2), deps = {}) {
  const {
    env = process.env,
    git = runGit,
    log = consoleLog,
    readText = (/** @type {string} */ path) => readFileSync(path, "utf8"),
  } = deps;
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        before: { type: "string" },
        after: { type: "string" },
        "dry-run": { type: "boolean" },
      },
    });
  } catch (error) {
    console.error(
      `${error instanceof Error ? error.message : error}\n${USAGE}`
    );
    return 2;
  }
  const [command, ...rest] = parsed.positionals;
  const dryRun = parsed.values["dry-run"] === true;
  const options = { env, dryRun, log };

  if (command === "changelog" || command === "release") {
    const range = pushRange(parsed.values);
    if ("error" in range) {
      console.error(`${range.error}\n${USAGE}`);
      return 2;
    }
    if ("skip" in range) {
      log.notice(`${range.skip} Nothing was posted.`);
      return 0;
    }
    try {
      if (command === "changelog") {
        for (const commit of [range.before, range.after]) {
          git(["cat-file", "-e", `${commit}^{commit}`]);
        }
        await deliver(
          "announcements",
          changelogMessages({ ...range, git, log }),
          options
        );
      } else {
        const repository = env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
        const github = githubClient({
          token: env.GITHUB_TOKEN || env.GH_TOKEN,
          apiUrl: env.GITHUB_API_URL || undefined,
        });
        await deliver(
          "releases",
          await releaseMessages({ ...range, repository, github, log }),
          options
        );
      }
    } catch (error) {
      log.warning(
        `Nothing was posted for ${command}: ${error instanceof Error ? error.message : error}`
      );
    }
    return 0;
  }

  if (command === "npm") {
    if (rest.length === 0) {
      console.error(`npm needs at least one package directory.\n${USAGE}`);
      return 2;
    }
    const packages = [];
    for (const dir of rest) {
      try {
        const { name, version } = JSON.parse(
          readText(join(dir, "package.json"))
        );
        if (PACKAGE_NAME.test(name) && VERSION.test(version)) {
          packages.push({ name, version });
        } else {
          log.warning(`${dir}/package.json has no usable name and version.`);
        }
      } catch (error) {
        log.warning(
          `Couldn't read ${dir}/package.json: ${error instanceof Error ? error.message : error}`
        );
      }
    }
    if (packages.length > 0) {
      await deliver("releases", [npmMessage(packages)], options);
    }
    return 0;
  }

  if (command === "mcp-registry") {
    try {
      const server = JSON.parse(readText(rest[0] ?? "server.json"));
      if (typeof server.name === "string" && VERSION.test(server.version)) {
        await deliver("releases", [mcpRegistryMessage(server)], options);
      } else {
        log.warning("server.json has no usable name and version.");
      }
    } catch (error) {
      log.warning(
        `Couldn't read server.json: ${error instanceof Error ? error.message : error}`
      );
    }
    return 0;
  }

  console.error(USAGE);
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await main();
}
