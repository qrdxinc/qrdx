// A failed payment (owner decision, 25 Nov 2026): when Polar marks a
// subscription past_due, the webhook (app/api/webhook/polar) stores when
// (subscription.past_due_since), the plan's features keep working for 7
// days from it (packages/auth/subscription-access.ts), one email goes on
// the change (lib/email/billing-notes.ts), and the app shell's banner reads
// it (lib/past-due.ts). The note to a new customer goes from the same
// place. Requests are signed like Polar's with a fake secret; the database
// is the in-memory fake and the two senders are captured.
import { createHmac } from "node:crypto";
import {
  graceCutoff,
  graceEndsAt,
  grantsPlan,
  PAST_DUE_GRACE_DAYS,
} from "@repo/auth/subscription-access";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  // env.ts reads this when the route loads.
  process.env.POLAR_WEBHOOK_SECRET = "test-polar-webhook-secret";
  return {
    failed: [] as Record<string, unknown>[],
    welcomed: [] as Record<string, unknown>[],
  };
});

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/ee/audit-log/plan-change", () => ({
  plansBeforeBillingChange: async () => null,
  recordPlanChanges: async () => {},
}));
vi.mock("@/lib/affiliates/commissions", () => ({
  handleAffiliateWebhook: async () => {},
}));
vi.mock("@/lib/analytics/server", () => ({ trackServer: () => {} }));
vi.mock("@/lib/email/payment-failed", () => ({
  sendPaymentFailedEmail: async (input: Record<string, unknown>) => {
    state.failed.push(input);
    return "sent";
  },
}));
vi.mock("@/lib/email/new-customer", () => ({
  sendNewCustomerEmail: async (input: Record<string, unknown>) => {
    state.welcomed.push(input);
    return "sent";
  },
}));

import { POST } from "@/app/api/webhook/polar/route";
import { getPastDueNotice } from "@/lib/past-due";
import { fakeDb } from "../support/fake-db";

const SECRET = "test-polar-webhook-secret";
const DAY = 24 * 60 * 60 * 1000;

function signed(payload: unknown) {
  const body = JSON.stringify(payload);
  const id = `msg_${Math.random().toString(36).slice(2)}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", Buffer.from(SECRET, "utf8"))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return new Request("http://localhost:3000/api/webhook/polar", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${signature}`,
    },
    body,
  });
}

async function deliver(
  type: string,
  status: string,
  modifiedAt: string,
  extra: Record<string, unknown> = {},
) {
  const response = await POST(
    signed({
      type,
      timestamp: new Date().toISOString(),
      data: {
        id: "sub_1",
        created_at: "2026-10-25T12:00:00Z",
        modified_at: modifiedAt,
        amount: 500,
        currency: "usd",
        recurring_interval: "month",
        status,
        current_period_start: "2026-11-25T12:00:00Z",
        current_period_end: "2026-12-25T12:00:00Z",
        cancel_at_period_end: false,
        canceled_at: null,
        started_at: "2026-10-25T12:00:00Z",
        ends_at: null,
        ended_at: null,
        customer_id: "polar_customer_1",
        product_id: "prod_pro_month",
        discount_id: null,
        checkout_id: "checkout_1",
        customer_cancellation_reason: null,
        customer_cancellation_comment: null,
        metadata: {},
        custom_field_data: {},
        customer: { external_id: "u_ana", email: "ana@example.com" },
        ...extra,
      },
    }) as unknown as Parameters<typeof POST>[0],
  );
  expect(response.status).toBe(200);
}

const stored = () => fakeDb.find("subscription", { id: "sub_1" });
/** The emails go after the response: let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.unique("subscription", "id");
  state.failed = [];
  state.welcomed = [];
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("the Polar webhook on a failed payment", () => {
  it("stores when it changed to past_due, emails once, and clears it when paid", async () => {
    await deliver("subscription.active", "active", "2026-10-25T12:00:05Z");
    await settle();
    expect(stored()?.pastDueSince).toBeNull();
    expect(state.failed).toEqual([]);

    await deliver("subscription.updated", "past_due", "2026-11-25T12:00:00Z");
    await settle();
    const since = new Date("2026-11-25T12:00:00Z");
    expect(stored()).toMatchObject({ status: "past_due", pastDueSince: since });
    expect(state.failed).toEqual([
      {
        subscriptionId: "sub_1",
        userId: "u_ana",
        productId: "prod_pro_month",
        pastDueSince: since,
      },
    ]);

    // A later past_due snapshot (a retry failed again) keeps the first time
    // and sends nothing more.
    await deliver("subscription.updated", "past_due", "2026-11-28T12:00:00Z");
    await settle();
    expect(stored()?.pastDueSince).toEqual(since);
    expect(state.failed).toHaveLength(1);

    // Paid: the time is cleared.
    await deliver("subscription.active", "active", "2026-11-29T12:00:00Z");
    await settle();
    expect(stored()).toMatchObject({ status: "active", pastDueSince: null });
  });

  it("asks for the new-customer note on active snapshots (the sender decides whether it's new)", async () => {
    await deliver("subscription.created", "active", "2026-10-25T12:00:05Z");
    await settle();
    expect(state.welcomed).toEqual([
      {
        subscriptionId: "sub_1",
        userId: "u_ana",
        productId: "prod_pro_month",
        startedAt: new Date("2026-10-25T12:00:00Z"),
      },
    ]);
    await deliver("subscription.canceled", "canceled", "2026-11-01T12:00:00Z");
    await settle();
    expect(state.welcomed).toHaveLength(1);
  });
});

describe("the grace period", () => {
  const now = new Date("2026-11-25T12:00:00Z");

  it("keeps the plan for 7 days from the failure, then stops", () => {
    expect(PAST_DUE_GRACE_DAYS).toBe(7);
    const since = new Date(now.getTime() - 6 * DAY);
    expect(grantsPlan({ status: "past_due", pastDueSince: since }, now)).toBe(
      true,
    );
    expect(graceEndsAt(since)).toEqual(new Date(now.getTime() + DAY));
    expect(
      grantsPlan(
        { status: "past_due", pastDueSince: new Date(now.getTime() - 8 * DAY) },
        now,
      ),
    ).toBe(false);
    expect(graceCutoff(now)).toEqual(new Date(now.getTime() - 7 * DAY));
  });

  it("gives no grace when the failure's time isn't known, and none to other statuses", () => {
    expect(grantsPlan({ status: "past_due", pastDueSince: null }, now)).toBe(
      false,
    );
    for (const status of ["canceled", "unpaid", "incomplete"]) {
      expect(grantsPlan({ status, pastDueSince: now }, now)).toBe(false);
    }
    for (const status of ["active", "trialing"]) {
      expect(grantsPlan({ status }, now)).toBe(true);
    }
  });
});

describe("getPastDueNotice (the app shell's banner)", () => {
  const subscribe = (row: Record<string, unknown>) =>
    fakeDb.seed("subscription", [
      {
        userId: "u_ana",
        productId: "prod_pro_month",
        pastDueSince: null,
        ...row,
      },
    ]);

  it("shows while the latest subscription is past_due, with when the plan stops", async () => {
    const since = new Date(Date.now() - 2 * DAY);
    subscribe({
      id: "sub_1",
      status: "past_due",
      pastDueSince: since,
      createdAt: new Date("2026-10-25T12:00:00Z"),
    });
    expect(await getPastDueNotice("u_ana")).toEqual({
      plan: "pro",
      graceEndsAt: graceEndsAt(since),
      inGrace: true,
    });
  });

  it("says the plan has stopped once the 7 days are over", async () => {
    subscribe({
      id: "sub_1",
      status: "past_due",
      pastDueSince: new Date(Date.now() - 9 * DAY),
      createdAt: new Date("2026-10-25T12:00:00Z"),
    });
    expect(await getPastDueNotice("u_ana")).toMatchObject({ inGrace: false });
  });

  it("shows nothing when the latest subscription is fine", async () => {
    subscribe({
      id: "sub_old",
      status: "past_due",
      pastDueSince: new Date(),
      createdAt: new Date("2026-09-01T00:00:00Z"),
    });
    subscribe({
      id: "sub_new",
      status: "active",
      createdAt: new Date("2026-11-01T00:00:00Z"),
    });
    expect(await getPastDueNotice("u_ana")).toBeNull();
    expect(await getPastDueNotice("u_nobody")).toBeNull();
  });
});
