// A friend's first code that was saved before its Web Risk look-up answered
// (lib/safety/recheck.ts) counts for their invite only once the look-up
// clears it, and never when the look-up switches it off: the recheck settles
// the invites of the codes it cleared (lib/invites/qualify.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ threat: false, slowLookup: 0 }));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: (id: string) => id === "inviteRewards",
}));
vi.mock("@/lib/safety/web-risk", () => ({
  lookupWebRisk: async () => {
    // A look-up that takes the pass to its deadline.
    if (state.slowLookup) vi.setSystemTime(Date.now() + state.slowLookup);
    return state.threat
      ? { status: "threat", threats: ["SOCIAL_ENGINEERING"] }
      : { status: "safe" };
  },
}));
vi.mock("@/lib/events/worker-due", () => ({
  scheduleWorkerRun: async () => {},
}));
vi.mock("@/lib/analytics/server", () => ({ trackServer: vi.fn() }));
vi.mock("@/lib/invites/notify", () => ({
  sendInviteRewardEmail: vi.fn(async () => "sent"),
}));

import { settleWaitingInvites } from "@/lib/invites/qualify";
import { recheckWebRisk } from "@/lib/safety/recheck";
import { fakeDb } from "../support/fake-db";

const SIGNED_UP = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
const FRIEND = "user_bo";
const INVITER = "user_ana";
const invite = () => fakeDb.rows("invite")[0];

beforeEach(() => {
  state.threat = false;
  state.slowLookup = 0;
  fakeDb.resetAll();
  fakeDb.unique("invite", "inviteeUserId");
  fakeDb.unique("invite", "inviterUserId", "inviterRewardSlot");
  for (const [id, email] of [
    [FRIEND, "bo@example.com"],
    [INVITER, "ana@example.org"],
  ] as const) {
    fakeDb.seed("user", [
      {
        id,
        email,
        name: id,
        emailVerified: true,
        createdAt: SIGNED_UP,
        updatedAt: SIGNED_UP,
      },
    ]);
  }
  fakeDb.seed("invite", [
    {
      id: "inv_1",
      inviterUserId: INVITER,
      inviteeUserId: FRIEND,
      status: "pending",
      createdAt: SIGNED_UP,
      decidedAt: null,
      inviterRewardSlot: null,
      revokedAt: null,
    },
  ]);
  // The friend's first code, saved before Web Risk answered.
  fakeDb.seed("qrCode", [
    {
      id: "code_1",
      userId: FRIEND,
      organizationId: "ws_friend",
      slug: "abc1234",
      destinationUrl: "https://example.com/menu",
      isActive: true,
      webRiskRecheckAt: new Date(),
      createdAt: new Date(SIGNED_UP.getTime() + 60_000),
    },
  ]);
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the safety recheck and a friend's invite", () => {
  it("rewards the invite once the look-up clears the code", async () => {
    await recheckWebRisk({ deadline: Date.now() + 5000 });
    expect(invite()).toMatchObject({
      status: "rewarded",
      inviterRewardSlot: 1,
    });
  });

  it("stops settling at the pass's deadline, and the worker's pass settles it later", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    state.slowLookup = 10_000;
    vi.spyOn(console, "info").mockImplementation(() => {});
    await recheckWebRisk({ deadline: Date.now() + 5000 });
    // The code is cleared, but there was no time left to settle the invite.
    expect(fakeDb.find("qrCode", { id: "code_1" })).toMatchObject({
      webRiskRecheckAt: null,
    });
    expect(invite()).toMatchObject({ status: "pending" });
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining("invites_left"),
    );
    expect(await settleWaitingInvites({ deadline: Date.now() + 3000 })).toEqual(
      { settled: 1, left: false },
    );
    expect(invite()).toMatchObject({
      status: "rewarded",
      inviterRewardSlot: 1,
    });
  });

  it("leaves it pending when the look-up switches the code off", async () => {
    state.threat = true;
    await recheckWebRisk({ deadline: Date.now() + 5000 });
    expect(fakeDb.find("qrCode", { id: "code_1" })).toMatchObject({
      isActive: false,
    });
    expect(invite()).toMatchObject({
      status: "pending",
      inviterRewardSlot: null,
    });
  });
});
