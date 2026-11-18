// The plan-limit email's words (lib/limit-notices/copy.ts) come from
// messages/en.json, so they can go out in the recipient's language. In
// English they must say exactly what Plan & usage says about the limit
// (app/(app)/settings/usage/_lib/limit-copy.ts): every notice limit, near
// and at the cap, on every plan, with and without the right to upgrade, with
// checkout open and closed, and with lifts the default plans don't have
// (a self-hosted server changes PLAN_LIMITS). Pure; no database.
import { describe, expect, it } from "vitest";
import { limitCopy } from "@/app/(app)/settings/usage/_lib/limit-copy";
import {
  type CheckoutOpen,
  type MeterCap,
  meterLabel,
  resolveMeterCaps,
} from "@/app/(app)/settings/usage/_lib/meters";
import { emailIntl } from "@/lib/i18n/email";
import { noticeCopy } from "@/lib/limit-notices/copy";
import { NOTICE_LIMITS, type NoticeLimitId } from "@/lib/limit-notices/levels";
import { PLAN_LIMITS } from "@/lib/plans";
import { PLAN_NAMES, type Plan } from "@/lib/pricing";

const MB = 1024 * 1024;
const GB = 1024 * MB;
const PLANS: Plan[] = ["free", "pro", "business"];
const CHECKOUTS: CheckoutOpen[] = [
  { pro: true, business: true },
  { pro: false, business: false },
  { pro: false, business: true },
];
const RESETS = "2026-12-01T00:00:00.000Z";

/** Caps beyond the default plans: unlimited, numbered, shared, none. */
function extraCaps(id: NoticeLimitId): (MeterCap | undefined)[] {
  const limit = id === "storage" ? 5 * GB : 1000;
  return [
    undefined,
    { limit: 10, lift: null },
    { limit: 10, lift: { plan: "pro", limit: null } },
    { limit: 10, lift: { plan: "business", limit } },
    { limit: 10, lift: { plan: "pro", limit, shared: true } },
    { limit: 10, lift: { plan: "pro", limit: null, shared: true } },
  ];
}

/** Near and at the cap, for counts and bytes (a fraction of a page too). */
function usages(id: NoticeLimitId): { used: number; limit: number }[] {
  if (id === "storage") {
    return [
      { used: 46 * MB, limit: 50 * MB },
      { used: 49.95 * MB, limit: 50 * MB },
      { used: 50 * MB, limit: 50 * MB },
      { used: 1023, limit: 1024 },
      { used: 4.6 * GB, limit: 5 * GB },
      { used: 51 * GB, limit: 50 * GB },
    ];
  }
  return [
    { used: 9, limit: 10 },
    { used: 2.8, limit: 3 },
    { used: 10, limit: 10 },
    { used: 12, limit: 10 },
    { used: 950, limit: 1000 },
    { used: 1, limit: 1 },
    { used: 9999, limit: 10_000 },
  ];
}

describe("limit notice words in English", () => {
  it("say what Plan & usage says, for every limit, plan and remedy", () => {
    let compared = 0;
    for (const id of NOTICE_LIMITS) {
      for (const plan of PLANS) {
        const defaults = [false, true].map(
          (isTeam) => resolveMeterCaps(PLAN_LIMITS, plan, { isTeam })[id],
        );
        for (const cap of [...defaults, ...extraCaps(id)]) {
          for (const checkoutOpen of CHECKOUTS) {
            for (const canUpgrade of [true, false]) {
              for (const { used, limit } of usages(id)) {
                for (const resetsAt of [undefined, RESETS, "not a date"]) {
                  const app = limitCopy(
                    {
                      id,
                      label: meterLabel(id),
                      used,
                      limit,
                      unit: id === "storage" ? "bytes" : "count",
                      ...(resetsAt ? { resetsAt } : {}),
                    },
                    { plan, canUpgrade, checkoutOpen, cap },
                  );
                  const email = noticeCopy({
                    limitId: id,
                    used,
                    limit,
                    resetsAt,
                    plan,
                    canUpgrade,
                    checkoutOpen,
                    cap,
                  });
                  const where = JSON.stringify({
                    id,
                    plan,
                    cap,
                    checkoutOpen,
                    canUpgrade,
                    used,
                    limit,
                    resetsAt,
                  });
                  expect(app, where).not.toBeNull();
                  expect(email.reason, where).toBe(app?.reason);
                  expect(email.value, where).toBe(app?.value);
                  expect(email.planName, where).toBe(PLAN_NAMES[plan]);
                  compared++;
                }
              }
            }
          }
        }
      }
    }
    // 3 plans × (2 + 6) caps × 3 checkouts × 2 × 3 reset dates × the
    // usages: 7 for each of the five counted limits, 6 for storage.
    expect(compared).toBe(3 * 8 * 3 * 2 * 3 * (5 * 7 + 6));
  });

  it("name each limit as the notice always has", () => {
    const named = Object.fromEntries(
      NOTICE_LIMITS.map((id) => {
        const copy = noticeCopy({
          limitId: id,
          used: 9,
          limit: 10,
          plan: "free",
          canUpgrade: true,
          checkoutOpen: { pro: true, business: true },
          cap: undefined,
        });
        return [id, [copy.label, copy.noun]];
      }),
    );
    expect(named).toEqual({
      dynamicCodes: ["Dynamic QR codes", "dynamic QR codes"],
      landingPages: ["Hosted pages", "hosted pages"],
      formResponses: ["Form responses", "form responses"],
      storage: ["File storage", "file storage"],
      savedThemes: ["Saved themes", "saved themes"],
      aiArt: ["AI art images", "AI art images"],
    });
  });
});

describe("limit notice words in another language", () => {
  it("come from that language's catalog, with its numbers, sizes and dates", async () => {
    const es = await emailIntl("es");
    const near = noticeCopy(
      {
        limitId: "formResponses",
        used: 1950,
        limit: 2000,
        resetsAt: RESETS,
        plan: "free",
        canUpgrade: true,
        checkoutOpen: { pro: true, business: true },
        cap: { limit: 2000, lift: { plan: "pro", limit: 10_000 } },
      },
      es,
    );
    const english = noticeCopy({
      limitId: "formResponses",
      used: 1950,
      limit: 2000,
      resetsAt: RESETS,
      plan: "free",
      canUpgrade: true,
      checkoutOpen: { pro: true, business: true },
      cap: { limit: 2000, lift: { plan: "pro", limit: 10_000 } },
    });
    expect(english.reason).toBe(
      "50 form responses left this month on Free. Resets Dec 1.",
    );
    expect(near.reason).not.toBe(english.reason);
    // Spanish writes 1950 without a separator and the day before the month.
    expect(near.value).toContain("1950");
    expect(near.reason).toContain("1 dic");
    expect(near.planName).toBe(es.t("limitNotice.planName", { plan: "free" }));
    expect(near.planName).not.toBe("Free");

    const storage = noticeCopy(
      {
        limitId: "storage",
        used: 47.5 * MB,
        limit: 50 * MB,
        plan: "free",
        canUpgrade: true,
        checkoutOpen: { pro: true, business: true },
        cap: undefined,
      },
      es,
    );
    expect(storage.value).toBe(
      es.t("limitNotice.value", { used: "47,5 MB", cap: "50 MB" }),
    );
  });
});
