// Which button or page led to a payment (lib/checkout-surface.ts): checkout
// puts it in Polar's metadata (tests/api/marketing-routes.test.ts covers the
// route), Polar copies the metadata onto the subscription, the webhook
// (app/api/webhook/polar) stores it in subscription.metadata and sends it
// with subscription_activated, and the admin list shows it. Requests are
// signed like Polar's (Standard Webhooks, HMAC-SHA256) with a fake secret;
// the database is the in-memory fake.
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  // env.ts reads this when the route loads.
  process.env.POLAR_WEBHOOK_SECRET = "test-polar-webhook-secret";
  return {
    tracked: [] as {
      event: string;
      props: Record<string, unknown>;
      distinctId: unknown;
    }[],
    /** Server events still being built (they read the database first) */
    building: [] as Promise<void>[],
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
vi.mock("@/lib/analytics/server", () => ({
  trackServerAfter: (
    event: string,
    build: () => Promise<{
      props: Record<string, unknown>;
      options?: { distinctId?: unknown };
    } | null>,
  ) => {
    state.building.push(
      build().then((built) => {
        if (!built) return;
        state.tracked.push({
          event,
          props: built.props,
          distinctId: built.options?.distinctId,
        });
      }),
    );
  },
}));
vi.mock("@/lib/migrate/server/repo", () => ({
  JOB_STORE_PROVIDER: "qrdx-import",
}));
vi.mock("@/lib/plans", () => ({ planForSubscriptionProduct: () => "pro" }));

import { listSubscriptions } from "@/app/(app)/admin/_lib/queries";
import { POST } from "@/app/api/webhook/polar/route";
import {
  CHECKOUT_SURFACES,
  knownCheckoutSurface,
  parseCheckoutSurface,
  pricingHref,
  recordedSurface,
  withSurface,
} from "@/lib/checkout-surface";
import { parseBillingInterval } from "@/lib/pricing";
import { fakeDb } from "../support/fake-db";

const SECRET = "test-polar-webhook-secret";
const BUYER = { id: "u_ana", email: "ana@example.com" };

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

/** Posts a webhook and waits for the events it sends. */
const post = async (request: Request) => {
  const response = await POST(request as unknown as Parameters<typeof POST>[0]);
  await Promise.all(state.building);
  return response;
};

/** A Pro yearly subscription as Polar sends it, with checkout's metadata. */
const subscriptionEvent = (
  type: string,
  id: string,
  metadata: Record<string, unknown>,
) => ({
  type,
  timestamp: new Date().toISOString(),
  data: {
    id,
    created_at: "2026-11-20T12:00:00Z",
    modified_at: "2026-11-20T12:00:05Z",
    amount: 4800,
    currency: "usd",
    recurring_interval: "year",
    status: "active",
    current_period_start: "2026-11-20T12:00:00Z",
    current_period_end: "2027-11-20T12:00:00Z",
    cancel_at_period_end: false,
    canceled_at: null,
    started_at: "2026-11-20T12:00:00Z",
    ends_at: null,
    ended_at: null,
    customer_id: "polar_customer_1",
    product_id: "prod_pro_year",
    discount_id: null,
    checkout_id: `checkout_${id}`,
    customer_cancellation_reason: null,
    customer_cancellation_comment: null,
    metadata,
    custom_field_data: {},
    customer: { external_id: BUYER.id, email: BUYER.email },
  },
});

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.unique("subscription", "id");
  fakeDb.seed("user", [
    {
      id: BUYER.id,
      email: BUYER.email,
      name: "ana",
      emailVerified: true,
      role: null,
      banned: false,
      createdAt: new Date("2026-11-01T00:00:00Z"),
      updatedAt: new Date("2026-11-01T00:00:00Z"),
    },
  ]);
  state.tracked = [];
  state.building = [];
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the surface list", () => {
  it("keeps names on the list and turns anything else into unknown", () => {
    for (const surface of CHECKOUT_SURFACES) {
      expect(parseCheckoutSurface(surface)).toBe(surface);
      expect(knownCheckoutSurface(surface)).toBe(surface);
    }
    for (const junk of [
      "",
      "LIMIT_EMAIL",
      "limit_email ",
      "unknown",
      "javascript:alert(1)",
      null,
      undefined,
      7,
      ["limit_email"],
    ]) {
      expect(parseCheckoutSurface(junk)).toBe("unknown");
      expect(knownCheckoutSurface(junk)).toBeNull();
    }
  });

  it("names are short and plain, so they fit Polar's metadata and analytics", () => {
    expect(new Set(CHECKOUT_SURFACES).size).toBe(CHECKOUT_SURFACES.length);
    for (const surface of CHECKOUT_SURFACES) {
      expect(surface).toMatch(/^[a-z][a-z_]{2,39}$/);
    }
  });

  it("links through the pricing page carry ?from= and keep ?interval= working", () => {
    expect(pricingHref("home_card")).toBe("/pricing?from=home_card");
    expect(pricingHref("limit_email", "month")).toBe(
      "/pricing?interval=month&from=limit_email",
    );
    expect(withSurface("/pricing?currency=inr#plans", "sidebar_upgrade")).toBe(
      "/pricing?currency=inr&from=sidebar_upgrade#plans",
    );
    const url = new URL(
      pricingHref("first_scan_email", "month"),
      "https://qrdx.dev",
    );
    expect(parseBillingInterval(url.searchParams.get("interval"))).toBe(
      "month",
    );
    expect(knownCheckoutSurface(url.searchParams.get("from"))).toBe(
      "first_scan_email",
    );
  });

  it("reads a stored subscription's metadata: the surface, unknown, or none recorded", () => {
    expect(
      recordedSurface(
        JSON.stringify({ plan: "pro", interval: "year", surface: "art_tab" }),
      ),
    ).toBe("art_tab");
    expect(recordedSurface(JSON.stringify({ surface: "<b>hi</b>" }))).toBe(
      "unknown",
    );
    // Subscriptions from before the surface was recorded
    expect(
      recordedSurface(
        JSON.stringify({
          plan: "pro",
          interval: "month",
          analytics_consent: "1",
        }),
      ),
    ).toBeNull();
    expect(recordedSurface(null)).toBeNull();
    expect(recordedSurface("not json")).toBeNull();
    expect(recordedSurface("null")).toBeNull();
  });
});

describe("the webhook stores it", () => {
  it("keeps checkout's surface in subscription.metadata and sends it with subscription_activated", async () => {
    const metadata = {
      plan: "pro",
      interval: "year",
      surface: "limit_email",
      analytics_consent: "1",
    };
    const response = await post(
      signed(subscriptionEvent("subscription.active", "sub_1", metadata)),
    );
    expect(response.status).toBe(200);

    const row = fakeDb.find("subscription", { id: "sub_1" });
    expect(JSON.parse(String(row?.metadata))).toEqual(metadata);
    expect(state.tracked).toEqual([
      {
        event: "subscription_activated",
        props: {
          // No user_acquisition row: an account from before it.
          channel: "unknown",
          plan: "pro",
          interval: "year",
          surface: "limit_email",
          amount: 4800,
          currency: "usd",
        },
        distinctId: BUYER.id,
      },
    ]);

    // The admin list shows it next to the buyer.
    const { subscriptions } = await listSubscriptions({ page: 1 });
    expect(subscriptions).toEqual([
      expect.objectContaining({
        id: "sub_1",
        email: BUYER.email,
        surface: "limit_email",
      }),
    ]);
    expect(subscriptions[0]).not.toHaveProperty("metadata");
  });

  it("an unknown surface stays unknown; a subscription from before shows none", async () => {
    await post(
      signed(
        subscriptionEvent("subscription.active", "sub_junk", {
          plan: "pro",
          interval: "year",
          surface: "somewhere_else",
        }),
      ),
    );
    await post(
      signed(
        subscriptionEvent("subscription.updated", "sub_old", {
          plan: "pro",
          interval: "year",
        }),
      ),
    );
    expect(state.tracked.map(({ props }) => props.surface)).toEqual([
      "unknown",
    ]);
    const surfaces = Object.fromEntries(
      (await listSubscriptions({ page: 1 })).subscriptions.map((row) => [
        row.id,
        row.surface,
      ]),
    );
    expect(surfaces).toEqual({ sub_junk: "unknown", sub_old: null });
  });
});
