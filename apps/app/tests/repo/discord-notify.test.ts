// scripts/discord-notify.mjs posts QRdx news to the QRdx Discord through
// channel webhooks: new changelog entries, releases to main, npm and MCP
// Registry publishes (.github/workflows/discord-notify.yml, publish.yml,
// mcp-registry.yml). git and fetch are fakes here: nothing is posted and
// nothing reads the network.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BRAND_BLUE } from "@repo/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AVATAR_URL,
  addedEntries,
  CHANNELS,
  COLOR,
  changelogMessages,
  entrySlug,
  escapeMarkdown,
  fitLines,
  isDiscordWebhook,
  isInternal,
  isInternalPath,
  isPromotion,
  LIMITS,
  MAX_NEW_ENTRIES,
  main,
  mergeCandidates,
  npmMessage,
  onlyInternalFiles,
  parseFrontmatter,
  pictureUrl,
  RELEASE_MAX_PULLS,
  releaseMessage,
  releasePulls,
} from "../../../../scripts/discord-notify.mjs";

const APP = join(import.meta.dirname, "../..");
const REPO = join(APP, "../..");
const read = (path: string) => readFileSync(join(REPO, path), "utf8");

const REPOSITORY = "qrdxinc/qrdx";
const BEFORE = "103ba0bce7a8c0f153a12add36413cd87fbbe61f";
const AFTER = "157bdd504b03aefda5739860d59c7b9998953876";
const WEBHOOK = "https://discord.com/api/webhooks/123456789/abc-DEF_123";

/** A Log that keeps every line, by kind. */
function memoryLog() {
  const lines = {
    info: [] as string[],
    notice: [] as string[],
    warning: [] as string[],
    out: [] as string[],
  };
  const log = {
    info: (text: string) => lines.info.push(text),
    notice: (text: string) => lines.notice.push(text),
    warning: (text: string) => lines.warning.push(text),
    out: (text: string) => lines.out.push(text),
  };
  return { log, lines };
}

/** Every payload a dry run printed. */
const printed = (out: string[]) =>
  out.map((text) => JSON.parse(text) as { channel: string; payload: any });

/** The characters an embed's text counts toward Discord's 6,000. */
function embedChars(embed: any): number {
  return (
    (embed.title ?? "").length +
    (embed.description ?? "").length +
    (embed.footer?.text ?? "").length
  );
}

/** Every Discord limit a payload has to keep. */
function expectWithinLimits(payload: any) {
  expect(payload.username).toBe("QRdx");
  expect(payload.avatar_url).toBe(AVATAR_URL);
  expect(payload.allowed_mentions).toEqual({ parse: [] });
  expect((payload.content ?? "").length).toBeLessThanOrEqual(LIMITS.content);
  expect(payload.embeds.length).toBeGreaterThan(0);
  expect(payload.embeds.length).toBeLessThanOrEqual(LIMITS.embeds);
  let total = 0;
  for (const embed of payload.embeds) {
    expect(embed.title.length).toBeLessThanOrEqual(LIMITS.title);
    expect((embed.description ?? "").length).toBeLessThanOrEqual(
      LIMITS.description,
    );
    expect((embed.footer?.text ?? "").length).toBeLessThanOrEqual(
      LIMITS.footer,
    );
    total += embedChars(embed);
  }
  expect(total).toBeLessThanOrEqual(LIMITS.total);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("setup", () => {
  it("posts in the brand blue, as QRdx, with the logo in public/", () => {
    expect(COLOR).toBe(Number.parseInt(BRAND_BLUE.slice(1), 16));
    expect(AVATAR_URL).toBe("https://qrdx.dev/logo.png");
    expect(existsSync(join(APP, "public/logo.png"))).toBe(true);
  });

  it("reads the webhook secrets the workflows pass", () => {
    expect(CHANNELS).toEqual({
      announcements: "DISCORD_ANNOUNCEMENTS_WEBHOOK_URL",
      releases: "DISCORD_RELEASES_WEBHOOK_URL",
    });
    // "NAME: ${{ secrets.NAME }}" in a step's env.
    const fromSecret = (name: string) => `${name}: \${{ secrets.${name} }}`;
    const notify = read(".github/workflows/discord-notify.yml");
    expect(notify).toContain(fromSecret(CHANNELS.announcements));
    expect(notify).toContain(fromSecret(CHANNELS.releases));
    for (const file of ["publish.yml", "mcp-registry.yml"]) {
      const workflow = read(`.github/workflows/${file}`);
      expect(workflow).toContain(fromSecret(CHANNELS.releases));
      expect(workflow).toContain("node scripts/discord-notify.mjs");
      // A post never fails a publish.
      expect(workflow).toMatch(
        /name: Post to Discord\n(?:\s+if: .+\n)?\s+continue-on-error: true/,
      );
    }
  });
});

describe("parseFrontmatter", () => {
  it("reads a real entry's front matter", () => {
    const data = parseFrontmatter(
      read("apps/app/content/changelog/v0.5.0.mdx"),
    );
    expect(data).toMatchObject({
      title: "Workspace security controls, and stronger sign-in for everyone",
      date: "2026-11-09",
      version: "0.5.0",
      tags: ["Security", "Teams"],
      image: "/changelog/v0.5.0/cover.webp",
      imageDark: "/changelog/v0.5.0/cover-dark.webp",
    });
    expect(data.description).toMatch(/^Require two-step verification/);
  });

  it("leaves nested lists out and keeps the keys after them", () => {
    const data = parseFrontmatter(
      read("apps/app/content/changelog/qrdx-0.0.47.mdx"),
    );
    expect(data.npm).toBeUndefined();
    expect(data.title).toBe("qrdx 0.0.47 and @qrdx/cli 0.0.5");
    expect(data.tags).toEqual(["Developers", "CLI"]);
  });

  it("reads plain, single-quoted and block values", () => {
    const data = parseFrontmatter(
      [
        "---",
        "title: Plain title # a comment",
        "description: >-",
        "  Folded over",
        "  two lines.",
        "body: |",
        "  line one",
        "  line two",
        "quote: 'It''s here'",
        "tags: ['A', 'B']",
        "cta:",
        "  href: /settings",
        "date: 2026-11-24",
        "---",
        "",
        "# Body",
      ].join("\n"),
    );
    expect(data).toEqual({
      title: "Plain title",
      description: "Folded over two lines.",
      body: "line one\nline two",
      quote: "It's here",
      tags: ["A", "B"],
      date: "2026-11-24",
    });
  });

  it("is empty without front matter", () => {
    expect(parseFrontmatter("# Just a heading")).toEqual({});
  });
});

describe("addedEntries and entrySlug", () => {
  it("counts added entries only, not edits, renames or other files", () => {
    const nameStatus = [
      "A\tapps/app/content/changelog/v0.6.0.mdx",
      "M\tapps/app/content/changelog/v0.5.0.mdx",
      "R100\tapps/docs/content/changelog/v0.4.1.mdx\tapps/app/content/changelog/v0.4.1.mdx",
      "A\tapps/app/content/changelog/meta.json",
      "A\tapps/app/public/changelog/v0.6.0/cover.webp",
      "A\tapps/app/content/blog/a-post.mdx",
      "",
    ].join("\n");
    expect(addedEntries(nameStatus)).toEqual([
      "apps/app/content/changelog/v0.6.0.mdx",
    ]);
  });

  it("makes the anchor /changelogs gives the entry", () => {
    expect(entrySlug("apps/app/content/changelog/v0.5.0.mdx")).toBe("v0.5.0");
    expect(
      entrySlug(
        "apps/app/content/changelog/commercial-license-business-features.mdx",
      ),
    ).toBe("commercial-license-business-features");
    expect(entrySlug("apps/app/content/changelog/2027/spring.mdx")).toBe(
      "2027-spring",
    );
    expect(entrySlug("apps/app/content/changelog/launch/index.mdx")).toBe(
      "launch",
    );
  });
});

describe("pictureUrl", () => {
  const manifest = {
    origin: "https://assets.qrdx.dev",
    files: {
      "/changelog/v0.6.0/cover.webp": "static/changelog/cover.ab12.webp",
    },
  };
  const inPublic = (path: string) => path === "/changelog/v0.5.0/cover.webp";

  it("resolves media keys and site paths as the site does", () => {
    expect(
      pictureUrl("/changelog/v0.6.0/cover.webp", { manifest, inPublic }),
    ).toBe("https://assets.qrdx.dev/static/changelog/cover.ab12.webp");
    expect(
      pictureUrl("/changelog/v0.5.0/cover.webp", { manifest, inPublic }),
    ).toBe("https://qrdx.dev/changelog/v0.5.0/cover.webp");
    expect(
      pictureUrl("https://example.com/a.png", { manifest, inPublic }),
    ).toBe("https://example.com/a.png");
  });

  it("gives nothing for a picture it can't find", () => {
    expect(
      pictureUrl("/changelog/missing.webp", { manifest, inPublic }),
    ).toBeUndefined();
    expect(
      pictureUrl("/changelog/missing.webp", { manifest: null, inPublic }),
    ).toBeUndefined();
    // Not a site path at all, even if a file were there.
    for (const path of [
      "changelog/relative.webp",
      "//evil.example/a.png",
      "/changelog/../../secret",
      "",
      undefined,
    ]) {
      expect(
        pictureUrl(path, { manifest, inPublic: () => true }),
      ).toBeUndefined();
    }
  });
});

/** A git that answers from fixtures: the diff, the trees and the files. */
function fakeGit({
  diff,
  earlier = [],
  publicFiles = [],
  files = {},
}: {
  diff: string;
  earlier?: string[];
  publicFiles?: string[];
  files?: Record<string, string>;
}) {
  return (args: string[]): string => {
    const [command] = args;
    if (command === "cat-file") return "";
    if (command === "diff") return diff;
    if (command === "ls-tree" && args[1] === "-r") return earlier.join("\n");
    if (command === "ls-tree") {
      const path = args.at(-1) ?? "";
      return publicFiles.includes(path) ? path : "";
    }
    if (command === "show") {
      const path = args[1].slice(args[1].indexOf(":") + 1);
      if (path in files) return files[path];
      throw new Error(`fatal: path '${path}' does not exist`);
    }
    throw new Error(`unexpected git ${args.join(" ")}`);
  };
}

const entry = (fields: Record<string, string>) =>
  [
    "---",
    ...Object.entries(fields).map(
      ([key, value]) => `${key}: ${JSON.stringify(value)}`,
    ),
    "---",
    "",
    "Body.",
  ].join("\n");

describe("changelog", () => {
  const v060 = entry({
    title: "Folders for your codes",
    description: "Group codes into folders. *Drag* them in.",
    date: "2026-11-30",
    version: "0.6.0",
    image: "/changelog/v0.6.0/cover.webp",
    imageDark: "/changelog/v0.6.0/cover-dark.webp",
  });

  it("posts one embed for an added entry, linked to its anchor", () => {
    const { log, lines } = memoryLog();
    const messages = changelogMessages({
      before: BEFORE,
      after: AFTER,
      log,
      git: fakeGit({
        diff: "A\tapps/app/content/changelog/v0.6.0.mdx\nM\tapps/app/content/changelog/v0.5.0.mdx",
        earlier: ["apps/app/content/changelog/v0.5.0.mdx"],
        publicFiles: [
          "apps/app/public/changelog/v0.6.0/cover.webp",
          "apps/app/public/changelog/v0.6.0/cover-dark.webp",
        ],
        files: {
          "apps/app/content/changelog/v0.6.0.mdx": v060,
          "apps/app/lib/media-manifest.json": JSON.stringify({
            origin: "https://assets.qrdx.dev",
            files: {},
          }),
        },
      }),
    });
    expect(messages).toHaveLength(1);
    expectWithinLimits(messages[0]);
    expect(messages[0].embeds[0]).toEqual({
      title: "Folders for your codes",
      url: "https://qrdx.dev/changelogs#v0.6.0",
      color: COLOR,
      description: "Group codes into folders. \\*Drag\\* them in.",
      // The dark picture: Discord's default theme is dark.
      image: { url: "https://qrdx.dev/changelog/v0.6.0/cover-dark.webp" },
      footer: { text: "v0.6.0" },
    });
    expect(lines.warning).toEqual([]);
  });

  it("posts nothing for an edit or a move", () => {
    const { log, lines } = memoryLog();
    for (const diff of [
      "M\tapps/app/content/changelog/v0.5.0.mdx",
      "R100\tapps/docs/content/changelog/v0.5.0.mdx\tapps/app/content/changelog/v0.5.0.mdx",
    ]) {
      expect(
        changelogMessages({
          before: BEFORE,
          after: AFTER,
          log,
          git: fakeGit({ diff }),
        }),
      ).toEqual([]);
    }
    expect(lines.info).toHaveLength(2);
  });

  it("posts nothing for an entry whose anchor was already there", () => {
    const { log } = memoryLog();
    // A move git didn't pair up: deleted in one app, added in another.
    const messages = changelogMessages({
      before: BEFORE,
      after: AFTER,
      log,
      git: fakeGit({
        diff: "D\tapps/docs/content/changelog/v0.5.0.mdx\nA\tapps/app/content/changelog/v0.5.0.mdx",
        earlier: ["apps/docs/content/changelog/v0.5.0.mdx"],
      }),
    });
    expect(messages).toEqual([]);
  });

  it("posts nothing when a push adds more entries than news would", () => {
    const { log, lines } = memoryLog();
    const paths = Array.from(
      { length: MAX_NEW_ENTRIES + 1 },
      (_, i) => `apps/app/content/changelog/v0.0.${i}.mdx`,
    );
    const messages = changelogMessages({
      before: BEFORE,
      after: AFTER,
      log,
      git: fakeGit({ diff: paths.map((path) => `A\t${path}`).join("\n") }),
    });
    expect(messages).toEqual([]);
    expect(lines.warning[0]).toMatch(/looks like a move or an import/);
  });

  it("posts several new entries oldest first, without a picture it can't find", () => {
    const { log, lines } = memoryLog();
    const messages = changelogMessages({
      before: BEFORE,
      after: AFTER,
      log,
      git: fakeGit({
        diff: "A\tapps/app/content/changelog/v0.6.0.mdx\nA\tapps/app/content/changelog/v0.5.9.mdx",
        files: {
          "apps/app/content/changelog/v0.6.0.mdx": v060,
          "apps/app/content/changelog/v0.5.9.mdx": entry({
            title: "Earlier",
            date: "2026-11-30",
            version: "0.5.9",
          }),
        },
      }),
    });
    expect(messages.map((m: any) => m.embeds[0].title)).toEqual([
      "Earlier",
      "Folders for your codes",
    ]);
    expect(messages[1].embeds[0].image).toBeUndefined();
    expect(lines.warning.join("\n")).toMatch(/couldn't find its picture/);
  });
});

describe("escapeMarkdown", () => {
  it("shows titles as written", () => {
    expect(escapeMarkdown("Move *bold* _x_ `ee/` [a](b) <@&1> ||s||")).toBe(
      "Move \\*bold\\* \\_x\\_ \\`ee/\\` \\[a\\](b) \\<@&1\\> \\|\\|s\\|\\|",
    );
    expect(escapeMarkdown("# Heading\n- item")).toBe("\\# Heading\n\\- item");
  });
});

/** A merged pull request, as GitHub's API returns it. */
function pull(
  number: number,
  title: string,
  {
    head = `feat/pr-${number}`,
    base = "staging",
    mergedAt = `2026-11-24T10:${String(number % 60).padStart(2, "0")}:00Z`,
    mergeCommit = `m${number}`,
    repo = REPOSITORY,
  } = {},
) {
  return {
    number,
    title,
    html_url: `https://github.com/${REPOSITORY}/pull/${number}`,
    merged_at: mergedAt,
    merge_commit_sha: mergeCommit,
    head: { ref: head, repo: { full_name: repo } },
    base: { ref: base },
  };
}

describe("which pull requests a release lists", () => {
  it("leaves out chore, ci, build, test and deps work by title or branch", () => {
    for (const title of [
      "chore: bump turbo",
      "ci(deps): pin actions",
      "build!: drop Node 20",
      "test: cover the scan score",
      "Tests: flaky e2e",
      "deps: update Next.js",
    ]) {
      expect(isInternal(pull(1, title))).toBe(true);
    }
    for (const head of [
      "chore/raycast-store-shots",
      "ci/discord-notify",
      "dependabot/npm_and_yarn/next-16",
      "renovate/turbo",
    ]) {
      expect(isInternal(pull(1, "Anything", { head }))).toBe(true);
    }
    for (const title of [
      "Build a code from a photo",
      "Testimonials on the home page",
      "Emails: one clean look for every email",
    ]) {
      expect(isInternal(pull(1, title, { head: "feat/x" }))).toBe(false);
    }
  });

  it("knows CI, git hooks and tests from everything else", () => {
    for (const path of [
      ".github/workflows/ci.yml",
      ".husky/pre-push",
      "apps/app/tests/lib/media.test.ts",
      "apps/app/e2e/site.e2e.ts",
      "packages/qrdx/src/render.test.ts",
      "packages/cli/src/__tests__/cli.ts",
    ]) {
      expect(isInternalPath(path)).toBe(true);
    }
    for (const path of [
      "apps/app/app/page.tsx",
      "scripts/discord-notify.mjs",
      "apps/app/lib/testimonials.ts",
      "README.md",
    ]) {
      expect(isInternalPath(path)).toBe(false);
    }
  });

  it("treats only this repository's main and staging as promotions", () => {
    expect(
      isPromotion(
        pull(858, "Release", { head: "staging", base: "main" }),
        REPOSITORY,
      ),
    ).toBe(true);
    expect(
      isPromotion(pull(2, "Back-merge", { head: "main" }), REPOSITORY),
    ).toBe(true);
    // A contributor's fork with a branch called main.
    expect(
      isPromotion(
        pull(3, "Fix", { head: "main", repo: "someone/qrdx" }),
        REPOSITORY,
      ),
    ).toBe(false);
  });

  it("asks GitHub only about merge and squash commits", () => {
    expect(
      mergeCandidates([
        {
          sha: "a",
          parents: [{}, {}],
          commit: { message: "Merge pull request #1" },
        },
        {
          sha: "b",
          parents: [{}],
          commit: { message: "Fix the footer (#2)\n\nBody" },
        },
        { sha: "c", parents: [{}], commit: { message: "Sidebar: drop a row" } },
      ]).map((commit: { sha: string }) => commit.sha),
    ).toEqual(["a", "b"]);
  });

  it("lists the pull requests whose merge commit the push brings, once each", async () => {
    const answers: Record<string, unknown[]> = {
      m857: [
        pull(857, "Analytics flags and icons", {
          mergedAt: "2026-11-24T09:53:01Z",
        }),
      ],
      m859: [
        pull(859, "Link the QRdx Discord", {
          mergedAt: "2026-11-24T16:20:57Z",
        }),
      ],
      m858: [pull(858, "Release", { head: "staging", base: "main" })],
      // A merge of staging into a branch: #900 has it in its head but was
      // merged elsewhere, and #901 isn't merged.
      x1: [
        pull(900, "Older", { mergeCommit: "elsewhere" }),
        { ...pull(901, "Open"), merged_at: null },
      ],
    };
    const asked: string[] = [];
    const { pulls, release } = await releasePulls({
      repository: REPOSITORY,
      commits: ["m858", "m859", "a1", "m857", "x1"].map((sha) => ({
        sha,
        parents: sha === "a1" ? [{}] : [{}, {}],
        commit: { message: "Merge" },
      })),
      github: async (path: string) => {
        asked.push(path);
        return answers[/commits\/([^/]+)\/pulls$/.exec(path)?.[1] ?? ""] ?? [];
      },
    });
    expect(pulls.map((item: { number: number }) => item.number)).toEqual([
      857, 859,
    ]);
    expect(release?.number).toBe(858);
    expect(asked).toHaveLength(4);
  });

  it("looks through every page of a pull request's files", async () => {
    const pages: Record<number, { filename: string }[]> = {
      1: Array.from({ length: 100 }, (_, i) => ({
        filename: `apps/app/tests/a${i}.test.ts`,
      })),
      2: [{ filename: ".github/workflows/ci.yml" }],
    };
    const github = async (path: string) =>
      pages[Number(/[?&]page=(\d+)/.exec(path)?.[1])] ?? [];
    expect(
      await onlyInternalFiles(pull(1, "Tests"), {
        repository: REPOSITORY,
        github,
      }),
    ).toBe(true);
    pages[2].push({ filename: "apps/app/app/page.tsx" });
    expect(
      await onlyInternalFiles(pull(1, "Tests"), {
        repository: REPOSITORY,
        github,
      }),
    ).toBe(false);
  });
});

describe("releaseMessage", () => {
  const compare = `https://github.com/${REPOSITORY}/compare/103ba0bce7a8...157bdd504b03`;

  it("lists the pull requests by title, linked, under the release", () => {
    const message = releaseMessage({
      pulls: [
        pull(857, "Analytics *flags*"),
        pull(859, "Link the QRdx Discord"),
      ],
      release: pull(858, "Release", { head: "staging", base: "main" }),
      compare,
    });
    expectWithinLimits(message);
    expect(message.embeds[0]).toEqual({
      title: "Live on qrdx.dev",
      url: `https://github.com/${REPOSITORY}/pull/858`,
      color: COLOR,
      description: [
        `- [Analytics \\*flags\\*](https://github.com/${REPOSITORY}/pull/857)`,
        `- [Link the QRdx Discord](https://github.com/${REPOSITORY}/pull/859)`,
      ].join("\n"),
      footer: { text: "Release #858 · 2 pull requests" },
    });
  });

  it("stops at ten and links the comparison for the rest", () => {
    const pulls = Array.from({ length: 25 }, (_, i) =>
      pull(100 + i, `Change ${i}`),
    );
    const message = releaseMessage({ pulls, release: null, compare });
    expectWithinLimits(message);
    const lines = message.embeds[0].description.split("\n");
    expect(lines).toHaveLength(RELEASE_MAX_PULLS + 1);
    expect(lines.at(-1)).toBe(`and 15 more: [see every change](${compare})`);
    expect(message.embeds[0].url).toBe(compare);
    expect(message.embeds[0].footer.text).toBe("25 pull requests");
  });

  it("keeps long titles within Discord's limits", () => {
    const pulls = Array.from({ length: 40 }, (_, i) =>
      pull(i + 1, `${"A very long title ".repeat(40)}${i}`),
    );
    const message = releaseMessage({
      pulls,
      release: null,
      compare,
      maxPulls: 40,
    });
    expectWithinLimits(message);
    expect(message.embeds[0].description).toMatch(/and \d+ more/);
    for (const line of message.embeds[0].description.split("\n").slice(0, -1)) {
      expect(line).toMatch(/…\]\(https:\/\/github\.com\//);
    }
  });

  it("fits lines into a budget, the last one saying how many were left", () => {
    const more = (n: number) => `+${n}`;
    expect(
      fitLines(["a", "b", "c"], { maxLines: 2, maxChars: 100, more }),
    ).toBe("a\nb\n+1");
    expect(fitLines(["aaaa", "bbbb"], { maxLines: 5, maxChars: 7, more })).toBe(
      "aaaa\n+1",
    );
    expect(fitLines(["aaaa"], { maxLines: 5, maxChars: 4, more })).toBe("aaaa");
  });
});

describe("npmMessage", () => {
  it("says which version is on npm, with its page", () => {
    const message = npmMessage([
      { name: "qrdx", version: "0.0.66" },
      { name: "@qrdx/cli", version: "0.0.21" },
    ]);
    expectWithinLimits(message);
    expect(
      message.embeds.map((embed: any) => [embed.title, embed.url]),
    ).toEqual([
      ["qrdx 0.0.66 is on npm", "https://www.npmjs.com/package/qrdx/v/0.0.66"],
      [
        "@qrdx/cli 0.0.21 is on npm",
        "https://www.npmjs.com/package/@qrdx/cli/v/0.0.21",
      ],
    ]);
  });
});

describe("isDiscordWebhook", () => {
  it("accepts Discord's webhook URLs only", () => {
    expect(isDiscordWebhook(WEBHOOK)).toBe(true);
    expect(
      isDiscordWebhook("https://discordapp.com/api/v10/webhooks/1/x"),
    ).toBe(true);
    expect(isDiscordWebhook("https://ptb.discord.com/api/webhooks/1/x")).toBe(
      true,
    );
    expect(isDiscordWebhook("http://discord.com/api/webhooks/1/x")).toBe(false);
    expect(
      isDiscordWebhook("https://discord.com.evil.example/api/webhooks/1/x"),
    ).toBe(false);
    expect(isDiscordWebhook("https://discord.com/channels/1/2")).toBe(false);
    expect(isDiscordWebhook("not a url")).toBe(false);
  });
});

/** Stubs fetch: `route` answers each request; returns every request made. */
function stubFetch(route: (url: URL, body: any) => Response) {
  const requests: { url: URL; body: any }[] = [];
  vi.stubGlobal(
    "fetch",
    async (input: string | URL, init?: { body?: unknown }) => {
      const url = new URL(String(input));
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ url, body });
      return route(url, body);
    },
  );
  return requests;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });

describe("main", () => {
  const packageJson = (name: string, version: string) =>
    JSON.stringify({ name, version });
  const readText = (path: string) => {
    if (path === join("packages/qrdx", "package.json"))
      return packageJson("qrdx", "0.0.66");
    if (path === "server.json") return read("server.json");
    throw new Error(`ENOENT: ${path}`);
  };

  it("posts nothing and passes when the webhook secret is missing", async () => {
    const requests = stubFetch(() => json({}));
    const { log, lines } = memoryLog();
    const code = await main(["npm", "packages/qrdx"], {
      env: {},
      log,
      readText,
    });
    expect(code).toBe(0);
    expect(requests).toEqual([]);
    expect(lines.notice).toEqual([
      "DISCORD_RELEASES_WEBHOOK_URL isn't set, so nothing was posted to #releases.",
    ]);
  });

  it("prints the payload on a dry run, with no secret and no request", async () => {
    const requests = stubFetch(() => json({}));
    const { log, lines } = memoryLog();
    const code = await main(["mcp-registry", "--dry-run"], {
      env: {},
      log,
      readText,
    });
    expect(code).toBe(0);
    expect(requests).toEqual([]);
    const [{ channel, payload }] = printed(lines.out);
    expect(channel).toBe("#releases");
    expectWithinLimits(payload);
    expect(payload.embeds[0].title).toMatch(
      /^QRdx MCP server \d+\.\d+\.\d+ is in the MCP Registry$/,
    );
  });

  it("posts to the webhook and waits for Discord's answer", async () => {
    const requests = stubFetch(() => json({ id: "1" }));
    const { log, lines } = memoryLog();
    const env = { DISCORD_RELEASES_WEBHOOK_URL: WEBHOOK };
    expect(await main(["npm", "packages/qrdx"], { env, log, readText })).toBe(
      0,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].url.toString()).toBe(`${WEBHOOK}?wait=true`);
    expectWithinLimits(requests[0].body);
    expect(lines.info).toEqual(["Posted to #releases: qrdx 0.0.66 is on npm"]);
  });

  it("tries once more after a rate limit, and only warns when Discord refuses", async () => {
    let calls = 0;
    stubFetch(() => {
      calls++;
      if (calls === 1) return json({ retry_after: 0 }, 429);
      return json({ message: "Invalid Form Body" }, 400);
    });
    const { log, lines } = memoryLog();
    const env = { DISCORD_RELEASES_WEBHOOK_URL: WEBHOOK };
    expect(await main(["npm", "packages/qrdx"], { env, log, readText })).toBe(
      0,
    );
    expect(calls).toBe(2);
    expect(lines.warning[0]).toMatch(
      /Couldn't post "qrdx 0\.0\.66 is on npm" to #releases: Discord answered 400/,
    );
    expect(lines.warning[0]).not.toContain(WEBHOOK);
  });

  it("never sends a post to a URL that isn't a Discord webhook", async () => {
    const requests = stubFetch(() => json({}));
    const { log, lines } = memoryLog();
    const env = { DISCORD_RELEASES_WEBHOOK_URL: "https://example.com/hook" };
    expect(await main(["npm", "packages/qrdx"], { env, log, readText })).toBe(
      0,
    );
    expect(requests).toEqual([]);
    expect(lines.warning[0]).toMatch(/isn't a Discord webhook URL/);
  });

  it("exits with 2 on bad arguments, and passes a push with no previous commit", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { log, lines } = memoryLog();
    expect(
      await main(["release", "--before", "nope", "--after", AFTER], { log }),
    ).toBe(2);
    expect(await main(["npm"], { log })).toBe(2);
    expect(await main(["unknown"], { log })).toBe(2);
    expect(
      await main(["release", "--before", "0".repeat(40), "--after", AFTER], {
        log,
      }),
    ).toBe(0);
    expect(lines.notice[0]).toMatch(/no previous commit/);
  });

  it("posts a release: the pull requests that change what people use", async () => {
    const files: Record<number, string[]> = {
      857: ["apps/app/components/analytics/row.tsx"],
      859: ["packages/config/social.ts", ".github/ISSUE_TEMPLATE/config.yml"],
      860: [".github/workflows/ci.yml", "apps/app/tests/lib/a.test.ts"],
    };
    const merges: Record<string, ReturnType<typeof pull>> = {
      m857: pull(857, "Analytics flags and icons", { mergeCommit: "m857" }),
      m859: pull(859, "Link the QRdx Discord", { mergeCommit: "m859" }),
      m860: pull(860, "Faster CI", { mergeCommit: "m860" }),
      m861: pull(861, "chore: tidy the README", { mergeCommit: "m861" }),
      [AFTER]: pull(858, "Release", {
        head: "staging",
        base: "main",
        mergeCommit: AFTER,
      }),
    };
    const requests = stubFetch((url) => {
      if (url.hostname === "discord.com") return json({ id: "1" });
      const path = url.pathname;
      if (path === `/repos/${REPOSITORY}/compare/${BEFORE}...${AFTER}`) {
        return json({
          commits: [...Object.keys(merges), "plain"].map((sha) => ({
            sha,
            parents: sha === "plain" ? [{}] : [{}, {}],
            commit: { message: `Merge ${sha}` },
          })),
        });
      }
      const sha = /\/commits\/([^/]+)\/pulls$/.exec(path)?.[1];
      if (sha) return json(merges[sha] ? [merges[sha]] : []);
      const number = /\/pulls\/(\d+)\/files$/.exec(path)?.[1];
      if (number)
        return json(
          (files[Number(number)] ?? []).map((filename) => ({ filename })),
        );
      return json({ message: "Not Found" }, 404);
    });
    const { log, lines } = memoryLog();
    const env = {
      DISCORD_RELEASES_WEBHOOK_URL: WEBHOOK,
      GITHUB_TOKEN: "test-token",
      GITHUB_REPOSITORY: REPOSITORY,
    };
    expect(
      await main(["release", "--before", BEFORE, "--after", AFTER], {
        env,
        log,
      }),
    ).toBe(0);
    const posts = requests.filter(
      (request) => request.url.hostname === "discord.com",
    );
    expect(posts).toHaveLength(1);
    const embed = posts[0].body.embeds[0];
    expect(embed.url).toBe(`https://github.com/${REPOSITORY}/pull/858`);
    expect(embed.description).toBe(
      [
        `- [Analytics flags and icons](https://github.com/${REPOSITORY}/pull/857)`,
        `- [Link the QRdx Discord](https://github.com/${REPOSITORY}/pull/859)`,
      ].join("\n"),
    );
    expect(lines.info.join("\n")).toMatch(
      /Left out #860 \(Faster CI\): only CI and test files/,
    );
    expect(lines.info.join("\n")).toMatch(/Left out #861 .*internal by name/);
  });

  it("posts nothing for a release with only internal pull requests", async () => {
    const requests = stubFetch((url) => {
      if (url.pathname.endsWith(`/compare/${BEFORE}...${AFTER}`)) {
        return json({
          commits: [
            { sha: "m1", parents: [{}, {}], commit: { message: "Merge" } },
          ],
        });
      }
      if (url.pathname.endsWith("/commits/m1/pulls")) {
        return json([pull(1, "ci: cache turbo", { mergeCommit: "m1" })]);
      }
      return json({}, 404);
    });
    const { log, lines } = memoryLog();
    const env = { DISCORD_RELEASES_WEBHOOK_URL: WEBHOOK };
    expect(
      await main(["release", "--before", BEFORE, "--after", AFTER], {
        env,
        log,
      }),
    ).toBe(0);
    expect(
      requests.some((request) => request.url.hostname === "discord.com"),
    ).toBe(false);
    expect(lines.info.at(-1)).toMatch(/nothing to post to #releases/);
  });

  it("only warns when GitHub can't be read", async () => {
    stubFetch(() => json({ message: "API rate limit exceeded" }, 403));
    const { log, lines } = memoryLog();
    const env = { DISCORD_RELEASES_WEBHOOK_URL: WEBHOOK };
    expect(
      await main(["release", "--before", BEFORE, "--after", AFTER], {
        env,
        log,
      }),
    ).toBe(0);
    expect(lines.warning[0]).toMatch(
      /Nothing was posted for release: GitHub answered 403/,
    );
  });

  it("posts a new changelog entry from git to #announcements", async () => {
    const requests = stubFetch(() => json({ id: "1" }));
    const { log } = memoryLog();
    const env = { DISCORD_ANNOUNCEMENTS_WEBHOOK_URL: WEBHOOK };
    const git = fakeGit({
      diff: "A\tapps/app/content/changelog/v0.5.0.mdx",
      publicFiles: ["apps/app/public/changelog/v0.5.0/cover-dark.webp"],
      files: {
        "apps/app/content/changelog/v0.5.0.mdx": read(
          "apps/app/content/changelog/v0.5.0.mdx",
        ),
        "apps/app/lib/media-manifest.json": read(
          "apps/app/lib/media-manifest.json",
        ),
      },
    });
    expect(
      await main(["changelog", "--before", BEFORE, "--after", AFTER], {
        env,
        git,
        log,
      }),
    ).toBe(0);
    expect(requests).toHaveLength(1);
    expectWithinLimits(requests[0].body);
    expect(requests[0].body.embeds[0]).toMatchObject({
      title: "Workspace security controls, and stronger sign-in for everyone",
      url: "https://qrdx.dev/changelogs#v0.5.0",
      image: { url: "https://qrdx.dev/changelog/v0.5.0/cover-dark.webp" },
      footer: { text: "v0.5.0 · Security, Teams" },
    });
  });

  it("only warns when git can't read the commits", async () => {
    const { log, lines } = memoryLog();
    const git = () => {
      throw new Error("fatal: bad object");
    };
    expect(
      await main(["changelog", "--before", BEFORE, "--after", AFTER], {
        env: { DISCORD_ANNOUNCEMENTS_WEBHOOK_URL: WEBHOOK },
        git,
        log,
      }),
    ).toBe(0);
    expect(lines.warning[0]).toMatch(
      /Nothing was posted for changelog: fatal: bad object/,
    );
  });
});
