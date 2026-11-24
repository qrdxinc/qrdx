// Product counts in copy come from the engine's catalogue (lib/product-facts.ts)
// through `{facts.<name>}` tokens, so they can't drift from the playground.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  MAX_BULK_TOOL_ROWS,
  MAX_BULK_TOOL_ROWS_SIGNED_OUT,
  MAX_CODES_PER_REQUEST,
  MAX_IMPORT_ROWS,
} from "@repo/config";
import { TRANSLATED_LOCALES } from "@repo/i18n/config";
import { remarkLLMs } from "fumadocs-core/mdx-plugins/remark-llms";
import { BUILT_IN_FRAMES, OFFICIAL_FRAMES } from "qrdx";
import {
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  FRAME_STYLES,
} from "qrdx/types";
import { remark } from "remark";
import remarkMdx from "remark-mdx";
import { describe, expect, it } from "vitest";
import { AI_ART_PRESETS } from "@/components/sections/ai-art/presets";
import { BARCODE_FORMATS } from "@/lib/barcode/formats";
import { BRAND_LOGO_COUNT } from "@/lib/brand-logos/catalog.generated";
import { FREE_DYNAMIC_CODES, FREE_HOSTED_PAGES } from "@/lib/free-plan-limits";
import { PAGE_TYPE_IDS } from "@/lib/landing/page-type-ids";
import {
  AI_ART_PER_MONTH,
  API_REQUESTS_PER_DAY,
  FILE_STORAGE_BYTES,
  FORM_RESPONSES_PER_MONTH,
  MAX_FILE_BYTES,
  PRO_TEAM_MEMBERS,
} from "@/lib/plan-allowances";
import { PLAN_LIMITS } from "@/lib/plans";
import { formatPrice, PRICING } from "@/lib/pricing";
import {
  fillFacts,
  fillFactsDeep,
  PRODUCT_FACTS,
  STYLE_SUMMARY,
} from "@/lib/product-facts";
import { remarkNpmStatus } from "@/lib/remark-npm-status";
import { remarkProductFacts } from "@/lib/remark-product-facts";
import { CONTENT_TYPE_IDS } from "@/types/content-type-ids";
import { defaultPresets } from "@/utils/qr-presets";
import qrdxPackage from "../../../../packages/qrdx/package.json";

const app = path.resolve(import.meta.dirname, "../..");
const repo = path.resolve(app, "../..");

/** The processed Markdown (llms-full.txt, "Copy Markdown") of an MDX source. */
function toMarkdown(source: string): Promise<string> {
  const processor = remark()
    .use(remarkMdx)
    .use(remarkProductFacts)
    .use(remarkNpmStatus)
    .use(remarkLLMs, { _data: true });
  return new Promise((resolve, reject) => {
    processor.run(processor.parse(source), source, (error, _tree, file) => {
      if (error || !file) reject(error);
      else resolve(String(file.data.markdown));
    });
  });
}

describe("PRODUCT_FACTS", () => {
  it("counts the engine's catalogue", () => {
    expect(PRODUCT_FACTS).toEqual({
      bodyPatterns: BODY_PATTERN.length,
      eyeShapes: CORNER_EYE_PATTERNS.length,
      eyeCentres: CORNER_EYE_DOT_PATTERNS.length,
      frames: FRAME_STYLES.length - 1 + OFFICIAL_FRAMES.length,
      frameStyles: FRAME_STYLES.length - 1,
      officialFrames: OFFICIAL_FRAMES.length,
      seasonalFrames: OFFICIAL_FRAMES.filter(
        (frame) => frame.category === "seasonal",
      ).length,
      artModel: "OpenAI's GPT Image 2",
      aiArtStyles: AI_ART_PRESETS.length,
      auditLogRetentionDays: 365,
      auditLogExportRows: "50,000",
      barcodeFormats: BARCODE_FORMATS.length,
      hostedPageTypes: PAGE_TYPE_IDS.length,
      // types/content-type-ids.ts, one generator page each
      contentTypes: CONTENT_TYPE_IDS.length,
      // lib/brand-logos (the pinned simple-icons release)
      brandLogos: BRAND_LOGO_COUNT.toLocaleString("en-US"),
      translatedLanguages: TRANSLATED_LOCALES.length,
      // lib/affiliates/terms.ts
      affiliateCommissionPercent: 30,
      affiliateCommissionMonths: 12,
      affiliateHoldDays: 45,
      affiliateMinPayoutUsd: "US$25",
      affiliateTermsNoticeDays: 30,
      // lib/invites/terms.ts
      inviteBonusCodes: 5,
      inviteMaxFriends: 10,
      inviteMaxCodes: 50,
      inviteQualifyDays: 30,
      // @repo/config limits.ts
      apiBatchCodes: MAX_CODES_PER_REQUEST.toLocaleString("en-US"),
      importRows: MAX_IMPORT_ROWS.toLocaleString("en-US"),
      bulkToolRows: MAX_BULK_TOOL_ROWS.toLocaleString("en-US"),
      bulkToolRowsSignedOut:
        MAX_BULK_TOOL_ROWS_SIGNED_OUT.toLocaleString("en-US"),
      newPaidAccountHourlyCodes: "2,000",
      imageApiPerMinute: 300,
      mcpPerMinute: 120,
      designQrPerMinute: 20,
      // lib/pricing.ts
      moneyBackDays: 30,
      switcherMoneyBackDays: 60,
      nonprofitDiscountPercent: 50,
      // lib/pricing.ts PRICING, with the currency sign
      proMonthlyPrice: "$5",
      proYearlyPrice: "$48",
      businessMonthlyPrice: "$15",
      businessYearlyPrice: "$144",
      proMonthlyPriceInr: "₹199",
      proYearlyPriceInr: "₹1,499",
      businessMonthlyPriceInr: "₹599",
      businessYearlyPriceInr: "₹4,999",
      proMonthlyPriceEur: "€5",
      proYearlyPriceEur: "€48",
      businessMonthlyPriceEur: "€15",
      businessYearlyPriceEur: "€144",
      // lib/scan-history.ts: 365 days, written "1 year"
      freeScanHistoryYears: 1,
      // lib/free-plan-limits.ts, PLAN_LIMITS.free
      freeDynamicCodes: 10,
      freeHostedPages: 3,
      // lib/plan-allowances.ts, PLAN_LIMITS.*.apiRequestsPerDay and aiArtPerMonth
      freeApiRequestsPerDay: "1,000",
      proApiRequestsPerDay: "10,000",
      businessApiRequestsPerDay: "100,000",
      freeAiArtPerMonth: 3,
      proAiArtPerMonth: 30,
      businessAiArtPerMonth: 150,
      // lib/plan-allowances.ts, PLAN_LIMITS.*.storageBytes, maxFileBytes,
      // formResponsesPerMonth and pro.teamMembers
      freeStorage: "50 MB",
      proStorage: "5 GB",
      businessStorage: "50 GB",
      freeMaxFileSize: "10 MB",
      proMaxFileSize: "100 MB",
      businessMaxFileSize: "250 MB",
      freeFormResponsesPerMonth: "50",
      proFormResponsesPerMonth: "1,000",
      businessFormResponsesPerMonth: "10,000",
      proTeamMembers: 3,
      // lib/path-alias-limits.ts
      pathAliasesPerCode: 5,
    });
    expect(FRAME_STYLES).toContain("none");
    // Every built-in frame is a spec named by one style; none is official
    expect(BUILT_IN_FRAMES.map((frame) => frame.style).sort()).toEqual(
      FRAME_STYLES.filter((style) => style !== "none").sort(),
    );
    const official = new Set(OFFICIAL_FRAMES.map((frame) => frame.id));
    expect(
      BUILT_IN_FRAMES.filter((frame) => official.has(frame.style)),
    ).toEqual([]);
    expect(STYLE_SUMMARY).toBe(
      `${BODY_PATTERN.length} body patterns, ${CORNER_EYE_PATTERNS.length} corner-eye shapes and ${CORNER_EYE_DOT_PATTERNS.length} eye centers`,
    );
  });
});

describe("fillFacts", () => {
  it("replaces tokens in strings and frontmatter objects", () => {
    expect(fillFacts("{facts.bodyPatterns} body · {facts.frames} frames")).toBe(
      `${PRODUCT_FACTS.bodyPatterns} body · ${PRODUCT_FACTS.frames} frames`,
    );
    expect(
      fillFactsDeep({
        title: "x",
        rows: [{ qrdx: "{facts.eyeShapes}", ok: true }, { qrdx: false }],
        when: 3,
      }),
    ).toEqual({
      title: "x",
      rows: [
        { qrdx: String(PRODUCT_FACTS.eyeShapes), ok: true },
        { qrdx: false },
      ],
      when: 3,
    });
  });

  it("fails the build on an unknown name", () => {
    expect(() => fillFacts("{facts.bodyPatternz}")).toThrow(/bodyPatternz/);
  });
});

describe("remarkProductFacts", () => {
  it("puts the number in the processed Markdown", async () => {
    const markdown = await toMarkdown(
      "There are {facts.bodyPatterns} body patterns and {facts.frames} frames.\n",
    );
    expect(markdown).toContain(
      `There are ${PRODUCT_FACTS.bodyPatterns} body patterns and ${PRODUCT_FACTS.frames} frames.`,
    );
    expect(markdown).not.toContain("facts.");
  });

  it("rejects an unknown name", async () => {
    await expect(toMarkdown("{facts.nope} things\n")).rejects.toThrow(/nope/);
  });

  it("names the AI art model from the model map in the Art QR docs", async () => {
    const source = readFileSync(
      path.join(app, "../docs/content/docs/features/art-qr.mdx"),
      "utf8",
    )
      // Only the body: the frontmatter isn't Markdown.
      .replace(/^---[\s\S]*?---\n/, "");
    const paragraph = source
      .split("\n")
      .find((line) => line.includes("{facts.artModel}"));
    expect(paragraph).toBeDefined();
    const markdown = await toMarkdown(`${paragraph}\n`);
    expect(markdown).toContain(`with ${PRODUCT_FACTS.artModel}, through`);
    expect(markdown).not.toContain("facts.");
  });
});

describe("remarkNpmStatus", () => {
  it("leaves a line in the Markdown copy that stays true", async () => {
    const markdown = await toMarkdown(
      'Intro.\n\n<NpmStatus package="qrdx" />\n',
    );
    expect(markdown).toContain(
      `> This page describes qrdx ${qrdxPackage.version}. Run \`npm view qrdx version\` to see the version npm installs.`,
    );
    expect(markdown).not.toContain("<NpmStatus");
  });
});

// A literal number in front of one of these nouns is a count that will go
// stale: write `{facts.<name>}` instead (lib/product-facts.ts).
const HARD_CODED_COUNT =
  /\b(\d+|six|nine|eleven|seventeen|nineteen|twenty(?:-one|-three)?)\s+(body patterns?|body ·|corner[- ]eye(?: shapes| patterns| dot patterns)?|eye(?: shapes| patterns)|eye[- ]dot(?: shapes| patterns)?|eye cent(?:re|er)s|(?:call-to-action )?frames|frame (?:styles|templates)|templates|barcode (?:formats|types|symbologies)|(?:AI art )?style presets)\b/i;

function filesUnder(dir: string, extensions: RegExp): string[] {
  return readdirSync(path.join(app, dir), { recursive: true })
    .map(String)
    .filter((file) => extensions.test(file))
    .map((file) => path.join(dir, file));
}

// QRdx's own list prices as copy would type them ("$5", "US$15", "₹1,499",
// "€48"), from PRICING, so a changed price can't be missed in content.
const PLAN_PRICES = Object.values(PRICING).flatMap((plan) =>
  Object.values(plan),
);
const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const HARD_CODED_PRICE = new RegExp(
  [
    `(?:^|[^\\w$]|US)\\$(?:${[...new Set(PLAN_PRICES.map((price) => price.amounts.USD))].join("|")})(?!\\d|[.,]\\d)`,
    ...PLAN_PRICES.flatMap((price) =>
      (["INR", "EUR"] as const).map(
        (currency) =>
          `${escapeRegExp(formatPrice(price.amounts[currency], currency))}(?![\\d,])`,
      ),
    ),
  ].join("|"),
);

/** Lines quoting another product's price that happens to equal one of QRdx's. */
const NOT_QRDX_PRICES = [
  'competitorPlan: "From $5/mo, billed yearly"', // compare/scanova.mdx
  "Basic $60/yr; Lite $108/yr or $15/mo", // compare/scanova.mdx
  "Basic is $5 a month, billed yearly only", // compare/scanova.mdx
  "Lite and up also monthly, from $15", // compare/uniqode.mdx
  "Premium ₹599", // compare/qrcode-ai.mdx
  "Premium at ₹599", // compare/qrcode-ai.mdx
  "₹599 a month or ₹3,999 a year", // compare/qrcode-ai.mdx
  "$3, $4, $5)", // a Perl substitution in docs/developers/goqr-api.mdx
];

describe("plan prices in copy", () => {
  it("come from {facts.*Price*} tokens in content and the docs", () => {
    const docs = path.join(app, "../docs/content/docs");
    const files = [
      ...filesUnder("content", /\.mdx?$/)
        .filter((file) => !file.startsWith(`content${path.sep}changelog`))
        .map((file) => path.join(app, file)),
      ...readdirSync(docs, { recursive: true })
        .map(String)
        .filter((file) => /\.mdx?$/.test(file))
        .map((file) => path.join(docs, file)),
    ];
    const offenders = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) => {
          if (NOT_QRDX_PRICES.some((allowed) => line.includes(allowed))) {
            return [];
          }
          const match = HARD_CODED_PRICE.exec(line);
          return match
            ? [`${path.relative(repo, file)}:${index + 1}: "${match[0]}"`]
            : [];
        }),
    );
    expect(offenders).toEqual([]);
  });

  it("catch a typed price", () => {
    for (const line of [
      "Pro ($5/mo or $48/yr)",
      "Pro costs US$5 a month.",
      "Business is ₹4,999 a year",
      "Pro is €48/year",
    ]) {
      expect(line).toMatch(HARD_CODED_PRICE);
    }
    for (const line of [
      "Pro ({facts.proMonthlyPrice}/mo)",
      "Advanced $15.58 a month",
      "Basic $50/mo",
      "$150 once",
    ]) {
      expect(line).not.toMatch(HARD_CODED_PRICE);
    }
  });
});

// QRdx's Free-plan allowances in the phrasings copy uses for QRdx ("The Free
// plan includes 10", `qrdx: "10 free; …"`, "3 hosted pages"), built from
// lib/free-plan-limits.ts. Competitors' plans are written in lower case
// ("its free plan includes 10") or name their own product, so they don't match.
const D = FREE_DYNAMIC_CODES;
const H = FREE_HOSTED_PAGES;
const HARD_CODED_FREE_LIMIT = new RegExp(
  [
    `\\b${H} (?:hosted|mobile) pages\\b`,
    `Free (?:plan )?(?:includes|adds|has|keeps up to) ${D}\\b`,
    `QRdx Free (?:has|includes) ${D}\\b`,
    `qrdx: "?${D} free\\b`,
    `Free workspaces have ${D}\\b`,
    `Free accounts are limited to ${D}\\b`,
    `free account adds ${D}\\b`,
    `\\| Dynamic QR codes \\| ${D} \\|`,
    `\\| Hosted (?:landing )?pages \\| ${H}\\b`,
  ].join("|"),
);

// QRdx's API requests a day and AI art images a month, in the phrasings copy
// uses for QRdx, built from lib/plan-allowances.ts. Saved-barcode limits
// share the numbers but are another limit, so they don't match.
const count = (value: number) => value.toLocaleString("en-US");
const HARD_CODED_ALLOWANCE = new RegExp(
  [
    `${count(API_REQUESTS_PER_DAY.free)} (?:API )?requests(?: a |/)day`,
    `\\b${AI_ART_PER_MONTH.free} (?:AI art )?images a month`,
    `Free accounts get ${AI_ART_PER_MONTH.free} a month`,
    `\\| API requests (?:a|per) day[^|]*\\| ${count(API_REQUESTS_PER_DAY.free)} \\|`,
    `\\| AI art images per month \\| ${AI_ART_PER_MONTH.free} \\|`,
  ].join("|"),
);

/** The example error body in the REST API docs (a code block) quotes the API's own message. */
const API_MESSAGE_EXAMPLE = "Daily API limit reached: the Free plan allows";

describe("API and AI art allowances in copy", () => {
  it("come from the {facts.*ApiRequestsPerDay} and {facts.*AiArtPerMonth} tokens", () => {
    const docs = path.join(app, "../docs/content/docs");
    const files = [
      ...filesUnder("content", /\.mdx?$/)
        .filter((file) => !file.startsWith(`content${path.sep}changelog`))
        .map((file) => path.join(app, file)),
      ...readdirSync(docs, { recursive: true })
        .map(String)
        .filter(
          (file) =>
            /\.mdx?$/.test(file) &&
            !file.startsWith(path.join("developers", "api")),
        )
        .map((file) => path.join(docs, file)),
    ];
    const offenders = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) => {
          if (line.includes(API_MESSAGE_EXAMPLE)) return [];
          const match = HARD_CODED_ALLOWANCE.exec(line);
          return match
            ? [`${path.relative(repo, file)}:${index + 1}: "${match[0]}"`]
            : [];
        }),
    );
    expect(offenders).toEqual([]);
  });

  it("match lib/plans.ts", () => {
    for (const plan of ["free", "pro", "business"] as const) {
      expect(PLAN_LIMITS[plan].apiRequestsPerDay).toBe(
        API_REQUESTS_PER_DAY[plan],
      );
      expect(PLAN_LIMITS[plan].aiArtPerMonth).toBe(AI_ART_PER_MONTH[plan]);
    }
  });

  it("catch a typed allowance, not a saved-barcode limit", () => {
    expect("allows 1,000 requests a day on Free and 10,000 on Pro").toMatch(
      HARD_CODED_ALLOWANCE,
    );
    expect("The Free plan includes 3 AI art images a month.").toMatch(
      HARD_CODED_ALLOWANCE,
    );
    expect("| AI art images per month | 3 | 30 | 150, pooled |").toMatch(
      HARD_CODED_ALLOWANCE,
    );
    expect('qrdx: "1,000 requests/day free; 10,000 on Pro"').toMatch(
      HARD_CODED_ALLOWANCE,
    );
    expect(
      "Every plan saves barcodes: up to 1,000 on Free, 10,000 on Pro",
    ).not.toMatch(HARD_CODED_ALLOWANCE);
  });
});

describe("Free plan allowances in copy", () => {
  it("come from {facts.freeDynamicCodes} and {facts.freeHostedPages}", () => {
    const docs = path.join(app, "../docs/content/docs");
    const files = [
      ...filesUnder("content", /\.mdx?$/)
        .filter((file) => !file.startsWith(`content${path.sep}changelog`))
        .map((file) => path.join(app, file)),
      // The API reference pages are generated from lib/openapi/document.ts,
      // which reads the limit from lib/plans.ts.
      ...readdirSync(docs, { recursive: true })
        .map(String)
        .filter(
          (file) =>
            /\.mdx?$/.test(file) &&
            !file.startsWith(path.join("developers", "api")),
        )
        .map((file) => path.join(docs, file)),
    ];
    const offenders = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) => {
          const match = HARD_CODED_FREE_LIMIT.exec(line);
          return match
            ? [`${path.relative(repo, file)}:${index + 1}: "${match[0]}"`]
            : [];
        }),
    );
    expect(offenders).toEqual([]);
  });

  it("match the Free plan in lib/plans.ts", () => {
    expect(PRODUCT_FACTS.freeDynamicCodes).toBe(PLAN_LIMITS.free.dynamicCodes);
    expect(PRODUCT_FACTS.freeHostedPages).toBe(PLAN_LIMITS.free.landingPages);
  });

  it("catch a typed allowance, not a competitor's", () => {
    for (const line of [
      "The Free plan includes 10 dynamic codes and 3 hosted pages.",
      'qrdx: "10 free; unlimited on Pro"',
      "QRdx Free has 10 dynamic codes",
      "| Dynamic QR codes | 10 | Unlimited | Unlimited |",
    ]) {
      expect(line).toMatch(HARD_CODED_FREE_LIMIT);
    }
    for (const line of [
      "The Free plan includes {facts.freeDynamicCodes} dynamic codes.",
      "Its free plan includes 10 dynamic codes, 1,000 scans a month",
      "QRStuff's free plan has 5 static codes and 10 dynamic codes",
      'competitor: "10 free; 50–900+ paid"',
    ]) {
      expect(line).not.toMatch(HARD_CODED_FREE_LIMIT);
    }
  });
});

/**
 * Storage, file sizes, form responses and Pro's seats typed into the docs'
 * plan pages ("50 MB of storage", "| Form responses per month | 50 |",
 * "up to 3 people") instead of their {facts.*} tokens.
 */
const HARD_CODED_PLAN_LIMIT = new RegExp(
  [
    "\\b\\d+ [MG]B of storage",
    "workspace with files up to \\d+ [MG]B",
    "\\| (?:Free|Pro|Business) \\| \\d+ [MG]B \\|",
    "\\| File storage[^|]*\\| \\d+ [MG]B",
    "\\| Form responses per month \\| \\d",
    "\\b[\\d,]+ form responses a month",
    "up to \\d+ (?:people|members)",
    "on Pro, \\d+ people",
    "\\| Pro \\| \\d+, including the owner",
    "\\| (?:Members|Seats)[^|]*\\| 1[^|]*\\| \\d+ \\|",
  ].join("|"),
);

describe("storage, form and seat limits in copy", () => {
  it("come from {facts.*} tokens in the docs", () => {
    const docs = path.join(app, "../docs/content/docs");
    const offenders = readdirSync(docs, { recursive: true })
      .map(String)
      .filter(
        (file) =>
          /\.mdx?$/.test(file) &&
          !file.startsWith(path.join("developers", "api")),
      )
      .flatMap((file) =>
        readFileSync(path.join(docs, file), "utf8")
          .split("\n")
          .flatMap((line, index) => {
            const match = HARD_CODED_PLAN_LIMIT.exec(line);
            return match ? [`${file}:${index + 1}: "${match[0]}"`] : [];
          }),
      );
    expect(offenders).toEqual([]);
  });

  it("match lib/plans.ts", () => {
    for (const plan of ["free", "pro", "business"] as const) {
      expect(PLAN_LIMITS[plan].storageBytes).toBe(FILE_STORAGE_BYTES[plan]);
      expect(PLAN_LIMITS[plan].maxFileBytes).toBe(MAX_FILE_BYTES[plan]);
      expect(PLAN_LIMITS[plan].formResponsesPerMonth).toBe(
        FORM_RESPONSES_PER_MONTH[plan],
      );
    }
    expect(PLAN_LIMITS.pro.teamMembers).toBe(PRO_TEAM_MEMBERS);
  });

  it("catch a typed limit", () => {
    for (const line of [
      "Free includes 50 MB of storage per workspace with files up to 10 MB",
      "| Pro | 5 GB | 100 MB |",
      "| File storage (largest file) | 50 MB (10 MB) | 5 GB (100 MB) |",
      "| Form responses per month | 50 | 1,000 | 10,000 |",
      "- 1,000 form responses a month.",
      "More workspaces, with up to 3 people in each.",
      "need Pro (up to 3 members) or Business (no limit)",
      "The workspace has no free seat: on Pro, 3 people including pending invitations.",
      "| Pro | 3, including the owner |",
      "| Members per workspace | 1 (only you) | 3 | Unlimited |",
    ]) {
      expect(line).toMatch(HARD_CODED_PLAN_LIMIT);
    }
    for (const line of [
      "Free includes {facts.freeStorage} of storage per workspace",
      "| Members per workspace | 1 (only you) | {facts.proTeamMembers} | Unlimited |",
      "A file can have up to {facts.importRows} rows and be up to 10 MB.",
      "PNG, JPG, WebP or SVG files up to 1 MB",
    ]) {
      expect(line).not.toMatch(HARD_CODED_PLAN_LIMIT);
    }
  });
});

describe("product counts in copy", () => {
  it("aren't hard-coded in content, metadata, llms.txt or config", () => {
    const files = [
      // Changelog entries are history: they keep the numbers of their release.
      ...filesUnder("content", /\.mdx?$/).filter(
        (file) => !file.startsWith(`content${path.sep}changelog`),
      ),
      ...["app", "components", "config", "lib"].flatMap((dir) =>
        filesUnder(dir, /\.(ts|tsx)$/),
      ),
    ];
    const offenders = files.flatMap((file) =>
      readFileSync(path.join(app, file), "utf8")
        .split("\n")
        .flatMap((line, index) => {
          const match = HARD_CODED_COUNT.exec(line);
          return match ? [`${file}:${index + 1}: "${match[0]}"`] : [];
        }),
    );
    expect(offenders).toEqual([]);
  });

  it("match the catalogue in the root README", () => {
    const readme = readFileSync(path.join(repo, "README.md"), "utf8");
    const expected: Record<string, number> = {
      "body patterns": PRODUCT_FACTS.bodyPatterns,
      "corner-eye shapes": PRODUCT_FACTS.eyeShapes,
      "eye centers": PRODUCT_FACTS.eyeCentres,
      "call-to-action frames": PRODUCT_FACTS.frameStyles,
      frames: PRODUCT_FACTS.frames,
      "built-in themes": Object.keys(defaultPresets).length,
    };
    // Counts may use a thousands separator ("1,032 frames")
    for (const match of readme.matchAll(
      /\b(\d{1,3}(?:,\d{3})+|\d+) (body patterns|corner-eye shapes|eye centers|call-to-action frames|frames|built-in themes)\b/g,
    )) {
      expect(`${match[1].replaceAll(",", "")} ${match[2]}`).toBe(
        `${expected[match[2]]} ${match[2]}`,
      );
    }
    expect(readme).toContain(`${PRODUCT_FACTS.bodyPatterns} body patterns`);
    expect(readme).toContain(
      `${Object.keys(defaultPresets).length} built-in themes`,
    );
  });
});
