// What the program keeps, checked against its sources: the Drizzle schema
// has the affiliate tables and the constraints the owner's decisions need,
// the terms version stored with each application is the date on the
// published terms, and the data export includes the staff note the privacy
// policy says is collected.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);

import { exportAffiliateData } from "@/lib/affiliates/program";
import { AFFILIATE_TERMS_VERSION } from "@/lib/affiliates/terms";
import { fakeDb } from "../support/fake-db";
import { AFFILIATE_USER, resetAffiliateDb, seedAffiliate } from "./seed";

const repo = join(import.meta.dirname, "../../../..");
const schema = readFileSync(join(repo, "packages/database/schema.ts"), "utf8");

describe("the schema", () => {
  it("has the five affiliate tables", () => {
    const tables = [
      ...schema.matchAll(/export const affiliate\w* = pgTable\(\s*"(\w+)"/g),
    ].map((match) => match[1] as string);
    expect(tables.sort()).toEqual([
      "affiliate",
      "affiliate_commission",
      "affiliate_payout",
      "affiliate_referral",
      "affiliate_refunded_order",
    ]);
  });

  it("allows one payout per PayPal reference (B5)", () => {
    expect(schema).toMatch(
      /uniqueIndex\("affiliate_payout_paypal_reference_unique"\)\.on\(\s*table\.paypalReference\s*\)/,
    );
  });

  it("keeps payouts when the affiliate's account goes (D-C4: set null, not cascade)", () => {
    const payout = schema.slice(
      schema.indexOf("export const affiliatePayout"),
      schema.indexOf("export const affiliateCommission"),
    );
    expect(payout).toMatch(
      /affiliateId: text\("affiliate_id"\)\.references\(\(\) => affiliate\.id, \{\s*onDelete: "set null",?\s*\}\)/,
    );
    expect(payout).toMatch(
      /userId: text\("user_id"\)\.references\(\(\) => user\.id, \{\s*onDelete: "set null",?\s*\}\)/,
    );
    expect(payout).not.toMatch(/onDelete: "cascade"/);
    expect(payout.match(/onDelete: "set null"/g)).toHaveLength(2);
    // Amount, currency, rate, date and PayPal reference stay; the address can go.
    expect(payout).toContain('paypalEmail: text("paypal_email"),');
    expect(payout).toContain(
      'paypalReference: text("paypal_reference").notNull(),',
    );
  });

  it("keeps an affiliate's earlier code unique too (D-C3)", () => {
    expect(schema).toContain('previousCode: text("previous_code").unique(),');
  });
});

describe("the terms version (B11)", () => {
  it("is the date on the published affiliate terms", () => {
    const terms = readFileSync(
      join(repo, "apps/app/content/legal/affiliate-terms.mdx"),
      "utf8",
    );
    expect(terms.match(/^lastUpdated: (.+)$/m)?.[1]).toBe(
      AFFILIATE_TERMS_VERSION,
    );
  });
});

describe("the data export (B8)", () => {
  beforeEach(() => resetAffiliateDb());

  it("includes the staff note and the terms version accepted", async () => {
    seedAffiliate({ status: "suspended" });
    const stored = fakeDb.find("affiliate", { id: "aff_1" }) as Record<
      string,
      unknown
    >;
    stored.statusNote = "Bought ads on our name";
    stored.application = {
      website: "",
      promotion: "A newsletter",
      agreedToTermsAt: "2026-11-10T00:00:00.000Z",
      termsVersion: AFFILIATE_TERMS_VERSION,
    };
    const exported = await exportAffiliateData(AFFILIATE_USER.id);
    expect(exported?.affiliate).toMatchObject({
      status: "suspended",
      statusNote: "Bought ads on our name",
      application: expect.objectContaining({
        termsVersion: AFFILIATE_TERMS_VERSION,
      }),
    });
  });
});
