// The Polar webhook's analytics (lib/analytics/subscription-events.ts):
// subscription_activated carries how the account found QRdx (read from
// user_acquisition after the response), the surface checkout recorded and
// what the subscription charges; subscription_canceled carries the plan,
// the surface and the channel, once per cancellation. Named only with the
// buyer's analytics consent; nothing else (an update, a revoke) sends
// either. The database is the in-memory fake; PostHog is never called.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  sent: [] as {
    event: string;
    props: Record<string, unknown>;
    options?: Record<string, unknown>;
  }[],
  building: [] as Promise<void>[],
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/analytics/server", () => ({
  trackServerAfter: (
    event: string,
    build: () => Promise<{
      props: Record<string, unknown>;
      options?: Record<string, unknown>;
    } | null>,
  ) => {
    state.building.push(
      build().then((built) => {
        if (built) state.sent.push({ event, ...built });
      }),
    );
  },
}));

import { sanitizeProps } from "@/lib/analytics/privacy";
import {
  trackSubscriptionEvent,
  type WebhookSubscription,
} from "@/lib/analytics/subscription-events";
import { fakeDb } from "../support/fake-db";

const subscription = (
  overrides: Partial<WebhookSubscription> = {},
): WebhookSubscription => ({
  id: "sub_1",
  product_id: "prod_unknown",
  amount: 4800,
  currency: "USD",
  recurring_interval: "year",
  canceled_at: null,
  started_at: "2026-11-20T12:00:00Z",
  metadata: { surface: "limit_dialog", analytics_consent: "1" },
  customer: { external_id: "u_ana" },
  ...overrides,
});

/** Sends `type` and returns what went out, once built. */
async function send(type: string, data: WebhookSubscription) {
  trackSubscriptionEvent(type, data);
  await Promise.all(state.building);
  return state.sent;
}

beforeEach(() => {
  fakeDb.resetAll();
  state.sent = [];
  state.building = [];
  fakeDb.seed("userAcquisition", [
    {
      userId: "u_ana",
      channel: "campaign",
      utmSource: "newsletter",
      utmCampaign: "switch",
      createdAt: new Date("2026-11-01T00:00:00Z"),
    },
  ]);
});

describe("subscription_activated", () => {
  it("carries the channel, QRdx's own campaign, the surface and the amount", async () => {
    expect(await send("subscription.active", subscription())).toEqual([
      {
        event: "subscription_activated",
        props: {
          channel: "campaign",
          campaign: "switch",
          plan: "pro",
          interval: "year",
          surface: "limit_dialog",
          amount: 4800,
          currency: "usd",
        },
        options: {
          distinctId: "u_ana",
          dedupeKey: "sub_1",
          timestamp: new Date("2026-11-20T12:00:00Z"),
        },
      },
    ]);
    // Nothing in it that sanitizing would drop.
    const [{ props }] = state.sent;
    expect(sanitizeProps(props)).toEqual(props);
  });

  it("is anonymous without the buyer's consent, and 'unknown' for an account from before", async () => {
    const [event] = await send(
      "subscription.active",
      subscription({
        customer: { external_id: "u_old" },
        metadata: { surface: "pricing_page" },
      }),
    );
    expect(event?.options?.distinctId).toBeNull();
    expect(event?.props).toMatchObject({
      channel: "unknown",
      surface: "pricing_page",
    });
  });

  it("without an account to read, sends no channel; an off-list surface is unknown", async () => {
    const [event] = await send(
      "subscription.active",
      subscription({ customer: null, metadata: { surface: "<b>x</b>" } }),
    );
    expect(event?.props).not.toHaveProperty("channel");
    expect(event?.props.surface).toBe("unknown");
    expect(event?.options?.distinctId).toBeNull();
  });
});

describe("subscription_canceled", () => {
  it("carries the plan, the surface and the channel, never the reason", async () => {
    const data = subscription({
      canceled_at: "2026-12-01T09:00:00Z",
      customer_cancellation_reason: "too_expensive",
    } as Partial<WebhookSubscription>);
    expect(await send("subscription.canceled", data)).toEqual([
      {
        event: "subscription_canceled",
        props: {
          channel: "campaign",
          campaign: "switch",
          plan: "pro",
          surface: "limit_dialog",
        },
        options: {
          distinctId: "u_ana",
          dedupeKey: "sub_1:2026-12-01T09:00:00.000Z",
          timestamp: new Date("2026-12-01T09:00:00Z"),
        },
      },
    ]);
  });

  it("counts a second cancellation after an uncancel as its own", async () => {
    await send(
      "subscription.canceled",
      subscription({ canceled_at: "2026-12-01T09:00:00Z" }),
    );
    await send(
      "subscription.canceled",
      subscription({ canceled_at: "2026-12-03T09:00:00Z" }),
    );
    const keys = state.sent.map(({ options }) => options?.dedupeKey);
    expect(new Set(keys).size).toBe(2);
  });
});

describe("other subscription webhooks", () => {
  it("send nothing", async () => {
    for (const type of [
      "subscription.created",
      "subscription.updated",
      "subscription.uncanceled",
      "subscription.revoked",
    ]) {
      expect(await send(type, subscription()), type).toEqual([]);
    }
  });
});
