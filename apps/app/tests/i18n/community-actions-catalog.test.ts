// The catalog's copies of what the community, theme, code builder and search
// actions say (communityActions in messages/en.json) match the English
// constants they replace, every one: the English an action answers with is
// the constant, so the catalog may never drift from it. Messages with
// arguments are compared for several values, plurals included. Spanish is
// read through the same helpers, so a key the helpers miss shows here.

import type { Locale } from "@repo/i18n/config";
import { mergeMessages } from "@repo/i18n/messages";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import {
  QR_THEME_MESSAGES,
  qrThemeMessages,
} from "@/app/(app)/dashboard/themes/_lib/action-messages";
import {
  SEARCH_MESSAGES,
  searchMessages,
} from "@/components/app-shell/search-messages";
import {
  CODE_BUILDER_DATA_MESSAGES,
  codeBuilderDataMessages,
} from "@/components/code-builder/action-messages";
import {
  COMMUNITY_ACTION_MESSAGES,
  COMMUNITY_THEME_ACTION_MESSAGES,
  communityActionMessages,
  communityThemeActionMessages,
} from "@/lib/community/action-messages";
import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH } from "@/lib/community/handles";
import {
  COMMUNITY_CHECK_MESSAGES,
  communityCheckMessages,
  PAGE_CHANGE_MESSAGES,
  pageChangeMessages,
} from "@/lib/community/messages";
import { GATE_SAMPLES, MIN_GATE_SCORE } from "@/lib/community/scan-samples";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

type MessageSet = Record<string, string | ((values: never) => string)>;

/**
 * Every entry of `fromCatalog` equals `english`: strings as they are,
 * messages with arguments for each of `samples[key]`.
 */
function expectSameEnglish(
  fromCatalog: MessageSet,
  english: MessageSet,
  samples: Record<string, object[]> = {},
) {
  expect(Object.keys(fromCatalog).sort()).toEqual(Object.keys(english).sort());
  for (const [key, value] of Object.entries(english)) {
    if (typeof value === "string") {
      expect(fromCatalog[key], key).toBe(value);
      continue;
    }
    const values = samples[key];
    expect(values, `samples for ${key}`).toBeDefined();
    for (const sample of values ?? []) {
      const said = (fromCatalog[key] as (values: object) => string)(sample);
      expect(said, `${key} ${JSON.stringify(sample)}`).toBe(
        (value as (values: object) => string)(sample),
      );
    }
  }
}

const translator = <NS extends string>(
  messages: typeof en,
  locale: Locale,
  namespace: NS,
) => createTranslator({ locale, messages, namespace: namespace as any }) as any;

const COUNTS = [1, 2, 7].map((count) => ({ count }));

describe("communityActions in en.json", () => {
  it("matches what actions/community.ts says", () => {
    expectSameEnglish(
      communityActionMessages(
        translator(en, "en", "communityActions.community"),
      ),
      COMMUNITY_ACTION_MESSAGES,
    );
  });

  it("matches what actions/community-themes.ts says", () => {
    expectSameEnglish(
      communityThemeActionMessages(
        translator(en, "en", "communityActions.communityThemes"),
      ),
      COMMUNITY_THEME_ACTION_MESSAGES,
    );
  });

  it("matches what the community's checks say", () => {
    expectSameEnglish(
      communityCheckMessages(translator(en, "en", "communityActions.checks")),
      COMMUNITY_CHECK_MESSAGES,
      {
        gateFailed: [
          { min: MIN_GATE_SCORE, reasons: "With a link it scores 71" },
        ],
        gateTooLong: [{ sample: "Wi-Fi details" }],
        gateScore: [{ sample: "a link", score: 64 }],
        handleFormat: [{ min: HANDLE_MIN_LENGTH, max: HANDLE_MAX_LENGTH }],
      },
    );
  });

  it("names the scan gate's samples as lib/community/scan-samples.ts does", () => {
    const names = {
      link: COMMUNITY_CHECK_MESSAGES.gateSampleLink,
      wifi: COMMUNITY_CHECK_MESSAGES.gateSampleWifi,
    };
    for (const sample of GATE_SAMPLES) {
      expect(names[sample.id]).toBe(sample.label);
    }
  });

  it("matches the page template review's lines, plurals included", () => {
    expectSameEnglish(
      pageChangeMessages(translator(en, "en", "communityActions.pageChanges")),
      PAGE_CHANGE_MESSAGES,
      {
        texts: COUNTS,
        kept: COUNTS,
        links: COUNTS,
        emails: COUNTS,
        phones: COUNTS,
        emailsAndPhones: [
          { emails: 1, phones: 1 },
          { emails: 2, phones: 1 },
          { emails: 1, phones: 3 },
        ],
        addresses: COUNTS,
        images: COUNTS,
        files: COUNTS,
        blocks: [{ blocks: "Video, File download" }],
        hidden: COUNTS,
      },
    );
  });

  it("matches what actions/qr-themes.ts says", () => {
    expectSameEnglish(
      qrThemeMessages(translator(en, "en", "communityActions.qrThemes")),
      QR_THEME_MESSAGES,
      {
        themeLimit: [{ limit: 10 }, { limit: 3 }],
        sharedThemesPlan: [{ plan: "Business" }],
        workspaceThemeLimit: [{ count: 25 }],
      },
    );
  });

  it("matches what the code builder's data action says", () => {
    expectSameEnglish(
      codeBuilderDataMessages(
        translator(en, "en", "communityActions.codeBuilder"),
      ),
      CODE_BUILDER_DATA_MESSAGES,
    );
  });

  it("matches what the workspace search says", () => {
    expectSameEnglish(
      searchMessages(translator(en, "en", "communityActions.search")),
      SEARCH_MESSAGES,
    );
  });
});

describe("communityActions in Spanish", () => {
  const spanish = mergeMessages(en, es) as typeof en;

  it("is translated, with the numbers it's given", () => {
    const checks = communityCheckMessages(
      translator(spanish, "es", "communityActions.checks"),
    );
    expect(checks.licenceRequired).toBe(
      es.communityActions.checks.licenceRequired,
    );
    expect(checks.licenceRequired).not.toBe(
      COMMUNITY_CHECK_MESSAGES.licenceRequired,
    );
    expect(checks.handleFormat({ min: 3, max: 30 })).toMatch(/\b3\b.*\b30\b/);
    const themes = qrThemeMessages(
      translator(spanish, "es", "communityActions.qrThemes"),
    );
    expect(themes.themeLimit({ limit: 10 })).toContain("10");
    expect(themes.themeLimit({ limit: 10 })).not.toBe(
      QR_THEME_MESSAGES.themeLimit({ limit: 10 }),
    );
  });

  it("says one and many apart in the review's lines", () => {
    const lines = pageChangeMessages(
      translator(spanish, "es", "communityActions.pageChanges"),
    );
    expect(lines.links({ count: 1 })).toMatch(/^1 enlace\b/);
    expect(lines.links({ count: 3 })).toMatch(/^3 enlaces\b/);
  });
});
