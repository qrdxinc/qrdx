// Home's first-run cards (app/(app)/dashboard/_components/home/first-run-rules.ts)
// and the "Where did you first hear about QRdx?" rules (lib/where-heard.ts).
import { describe, expect, it } from "vitest";
import {
  FIRST_STEPS_DAYS,
  type FirstRunFacts,
  firstRunCards,
} from "@/app/(app)/dashboard/_components/home/first-run-rules";
import {
  asksWhereHeard,
  parseWhereHeard,
  WHERE_HEARD_ANSWERS,
  WHERE_HEARD_ASK_DAYS,
  WHERE_HEARD_TEXT_MAX,
} from "@/lib/where-heard";

const NOW = new Date("2026-11-25T12:00:00Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const facts = (over: Partial<FirstRunFacts> = {}): FirstRunFacts => ({
  createdAt: daysAgo(1),
  now: NOW,
  codes: 0,
  scans: 0,
  downloaded: false,
  hidden: { firstSteps: false, invite: false, whereHeard: false },
  invites: true,
  asksWhereHeard: true,
  ...over,
});

describe("first steps", () => {
  it("shows a new account's progress", () => {
    expect(firstRunCards(facts()).firstSteps).toEqual({
      made: false,
      scanned: false,
      downloaded: false,
    });
    expect(firstRunCards(facts({ codes: 2, scans: 1 })).firstSteps).toEqual({
      made: true,
      scanned: true,
      downloaded: false,
    });
  });

  it("goes once all three are done, or once hidden", () => {
    expect(
      firstRunCards(facts({ codes: 1, scans: 3, downloaded: true })).firstSteps,
    ).toBeNull();
    expect(
      firstRunCards(
        facts({
          hidden: { firstSteps: true, invite: false, whereHeard: false },
        }),
      ).firstSteps,
    ).toBeNull();
  });

  it("shows an older account only while it has no code", () => {
    const old = daysAgo(FIRST_STEPS_DAYS + 1);
    expect(firstRunCards(facts({ createdAt: old })).firstSteps).not.toBeNull();
    expect(
      firstRunCards(facts({ createdAt: old, codes: 4, scans: 9 })).firstSteps,
    ).toBeNull();
    expect(
      firstRunCards(facts({ createdAt: daysAgo(FIRST_STEPS_DAYS), codes: 1 }))
        .firstSteps,
    ).not.toBeNull();
  });
});

describe("the invite", () => {
  it("asks for the card after a scan, and puts the line on Your code is live before it", () => {
    const before = firstRunCards(facts({ codes: 1 }));
    expect(before.inviteWanted).toBe(false);
    expect(before.inviteLine).toBe(true);
    const after = firstRunCards(facts({ codes: 1, scans: 1 }));
    expect(after.inviteWanted).toBe(true);
    expect(after.inviteLine).toBe(false);
    // The link is filled in by first-run.ts.
    expect(after.invite).toBeNull();
  });

  it("goes back to the line once the card is hidden", () => {
    const hidden = firstRunCards(
      facts({
        codes: 1,
        scans: 1,
        hidden: { firstSteps: false, invite: true, whereHeard: false },
      }),
    );
    expect(hidden.inviteWanted).toBe(false);
    expect(hidden.inviteLine).toBe(true);
  });

  it("is never offered where invites don't run", () => {
    const off = firstRunCards(facts({ codes: 1, scans: 5, invites: false }));
    expect(off.inviteWanted).toBe(false);
    expect(off.inviteLine).toBe(false);
  });
});

describe("Where did you first hear about QRdx?", () => {
  it("is asked of new accounts that haven't answered", () => {
    expect(
      asksWhereHeard({ createdAt: daysAgo(0), answered: false, now: NOW }),
    ).toBe(true);
    expect(
      asksWhereHeard({
        createdAt: daysAgo(WHERE_HEARD_ASK_DAYS),
        answered: false,
        now: NOW,
      }),
    ).toBe(true);
    expect(
      asksWhereHeard({
        createdAt: daysAgo(WHERE_HEARD_ASK_DAYS + 1),
        answered: false,
        now: NOW,
      }),
    ).toBe(false);
    expect(
      asksWhereHeard({ createdAt: daysAgo(1), answered: true, now: NOW }),
    ).toBe(false);
  });

  it("isn't shown once hidden, nor while it can't be stored", () => {
    expect(firstRunCards(facts()).askWhereHeard).toBe(true);
    expect(
      firstRunCards(
        facts({
          hidden: { firstSteps: false, invite: false, whereHeard: true },
        }),
      ).askWhereHeard,
    ).toBe(false);
    expect(firstRunCards(facts({ asksWhereHeard: false })).askWhereHeard).toBe(
      false,
    );
  });

  it("offers the owner's ten answers", () => {
    expect(WHERE_HEARD_ANSWERS).toEqual([
      "ai_assistant",
      "search",
      "friend",
      "x_threads",
      "linkedin",
      "youtube",
      "reddit_hn",
      "product_hunt",
      "directory",
      "other",
    ]);
  });

  it("takes only its own answers, and words only for Other", () => {
    expect(parseWhereHeard("search", "ignored")).toEqual({
      answer: "search",
      text: null,
    });
    expect(parseWhereHeard("other", "  a podcast\n about print  ")).toEqual({
      answer: "other",
      text: "a podcast about print",
    });
    expect(parseWhereHeard("other", "   ")).toEqual({
      answer: "other",
      text: null,
    });
    expect(parseWhereHeard("other", "x".repeat(500))?.text).toHaveLength(
      WHERE_HEARD_TEXT_MAX,
    );
    expect(parseWhereHeard("tiktok", null)).toBeNull();
    expect(parseWhereHeard(undefined, null)).toBeNull();
  });
});

describe("no facts", () => {
  it("shows no cards", () => {
    expect(firstRunCards(null)).toEqual({
      firstSteps: null,
      invite: null,
      inviteLine: false,
      askWhereHeard: false,
      inviteWanted: false,
    });
  });
});
