// Invite rewards on the server (lib/invites, lib/code-limit.ts and the
// sign-up recorder), against the in-memory database: a sign-up through a
// friend's link is recorded once and never as self-referral; the friend's
// first dynamic code within 30 days rewards both sides once, even when two
// codes or two friends arrive at the same moment; an inviter is rewarded for
// at most 10 friends; the bonus raises the owner's own workspace's
// dynamic-code limit and nothing else; it's all off on a self-hosted copy;
// and missing tables never stop a sign-up or a code.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  invites: true,
  affiliates: true,
  plans: new Map<string, "free" | "pro" | "business">(),
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: (id: string) =>
    (id === "inviteRewards" && state.invites) ||
    (id === "affiliates" && state.affiliates),
}));
vi.mock("@/lib/plans", () => ({
  getPlanForScope: async (scope: { organizationId: string }) =>
    state.plans.get(scope.organizationId) ?? "free",
  getPlanLimits: (plan: string) => ({
    dynamicCodes: plan === "free" ? 10 : Number.POSITIVE_INFINITY,
  }),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  // No request here: run the task now.
  after: () => {
    throw new Error("outside a request");
  },
}));
vi.mock("@/lib/analytics/server", () => ({ trackServer: vi.fn() }));
vi.mock("@/lib/invites/notify", () => ({
  sendInviteRewardEmail: vi.fn(async () => "sent"),
}));

import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import {
  INVITE_HEADER,
  OAUTH_INVITE_KEY,
  REFERRAL_HEADER,
} from "@repo/auth/referral-keys";
import { acquisitionChannel } from "@/lib/analytics/channel";
import { recordNewUserSignUp } from "@/lib/analytics/sign-up-hook";
import { dynamicCodeLimit } from "@/lib/code-limit";
import {
  inviteCandidatesFrom,
  recordInvitedSignUp,
  signUpInviteTask,
} from "@/lib/invites/attribution";
import { canStillEarnFromInvites, inviteBonusCodes } from "@/lib/invites/bonus";
import { ensureInviteCode, inviterOfCode } from "@/lib/invites/codes";
import { loadInviteDashboard } from "@/lib/invites/dashboard";
import { sendInviteRewardEmail } from "@/lib/invites/notify";
import { noteDynamicCodesCreated, qualifyInvite } from "@/lib/invites/qualify";
import {
  bonusCodesFor,
  inviteLandingHref,
  isWithinQualifyWindow,
  randomInviteCode,
} from "@/lib/invites/rules";
import { INVITE_MAX_REWARDED_FRIENDS } from "@/lib/invites/terms";
import { seedAffiliate } from "../affiliates/seed";
import { fakeDb } from "../support/fake-db";

const SIGNED_UP = new Date("2026-11-23T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const INVITER = { id: "user_ana", email: "ana.diaz@example.test" };
const FRIEND = { id: "user_bo", email: "bo@example.com" };
const CODE = "k7q2mx9pab";

function person(id: string, email: string) {
  return {
    id,
    email,
    name: id,
    emailVerified: true,
    createdAt: SIGNED_UP,
    updatedAt: SIGNED_UP,
  };
}

/** One person's own workspace with them as its owner. */
function ownWorkspace(userId: string) {
  fakeDb.seed("member", [
    {
      id: `m_${userId}`,
      organizationId: ownWorkspaceId(userId),
      userId,
      role: "owner",
      createdAt: SIGNED_UP,
    },
  ]);
}

/** A friend of INVITER's who signed up `daysAgo` and is still pending. */
function seedPendingFriend(id: string, signedUpAt = SIGNED_UP) {
  fakeDb.seed("user", [person(id, `${id}@example.com`)]);
  fakeDb.seed("invite", [
    {
      id: `inv_${id}`,
      inviterUserId: INVITER.id,
      inviteeUserId: id,
      status: "pending",
      createdAt: signedUpAt,
      decidedAt: null,
      inviterRewardSlot: null,
      revokedAt: null,
    },
  ]);
}

const invites = () => fakeDb.rows("invite");

beforeEach(() => {
  state.invites = true;
  state.affiliates = true;
  state.plans.clear();
  fakeDb.resetAll();
  fakeDb.unique("inviteCode", "userId");
  fakeDb.unique("inviteCode", "code");
  fakeDb.unique("invite", "id");
  fakeDb.unique("invite", "inviteeUserId");
  fakeDb.unique("invite", "inviterUserId", "inviterRewardSlot");
  fakeDb.unique("member", "organizationId", "userId");
  fakeDb.unique("affiliate", "userId");
  fakeDb.unique("affiliateReferral", "referredUserId");
  fakeDb.unique("userAcquisition", "userId");
  fakeDb.defaults("invite", {
    status: "pending",
    decidedAt: null,
    inviterRewardSlot: null,
    revokedAt: null,
  });
  fakeDb.seed("user", [
    person(INVITER.id, INVITER.email),
    person(FRIEND.id, FRIEND.email),
  ]);
  fakeDb.seed("inviteCode", [
    { userId: INVITER.id, code: CODE, createdAt: SIGNED_UP },
  ]);
  ownWorkspace(INVITER.id);
  ownWorkspace(FRIEND.id);
  vi.mocked(sendInviteRewardEmail).mockClear();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("invite codes", () => {
  it("makes one random code per person, the same on every visit", async () => {
    const first = await ensureInviteCode(FRIEND.id);
    expect(first).toMatch(/^[a-z2-9]{10}$/);
    expect(await ensureInviteCode(FRIEND.id)).toBe(first);
    expect(fakeDb.rows("inviteCode")).toHaveLength(2);
  });

  it("draws again when a code is taken", async () => {
    const codes = [CODE, "zzzzzzzzzz"];
    const code = await ensureInviteCode(FRIEND.id, {
      random: () => codes.shift() as string,
    });
    expect(code).toBe("zzzzzzzzzz");
  });

  it("finds whose code it is, and nothing for a malformed one", async () => {
    expect(await inviterOfCode(CODE)).toBe(INVITER.id);
    expect(await inviterOfCode(CODE.toUpperCase())).toBe(INVITER.id);
    expect(await inviterOfCode("zzzzzzzzzz")).toBeNull();
    expect(await inviterOfCode("ana-diaz-4k2p")).toBeNull();
  });
});

describe("a sign-up through an invite link", () => {
  it("reads the code from its own header and the OAuth state, never the affiliate's", () => {
    expect(
      inviteCandidatesFrom({
        headers: new Headers({ [INVITE_HEADER]: CODE }),
      }),
    ).toEqual([CODE]);
    expect(inviteCandidatesFrom({ oauthInviteCode: CODE })).toEqual([CODE]);
    expect(
      inviteCandidatesFrom({
        headers: new Headers({ [REFERRAL_HEADER]: CODE }),
      }),
    ).toEqual([]);
    expect(OAUTH_INVITE_KEY).toBe("inviteCode");
  });

  it("records the invite once: the first one wins", async () => {
    const recorded = await recordInvitedSignUp({
      userId: FRIEND.id,
      email: FRIEND.email,
      codes: [CODE],
      now: SIGNED_UP,
    });
    expect(recorded).toEqual({ status: "recorded", inviterUserId: INVITER.id });
    expect(invites()).toEqual([
      expect.objectContaining({
        inviterUserId: INVITER.id,
        inviteeUserId: FRIEND.id,
        status: "pending",
      }),
    ]);
    expect(
      await recordInvitedSignUp({
        userId: FRIEND.id,
        email: FRIEND.email,
        codes: [CODE],
      }),
    ).toEqual({ status: "skipped", reason: "already_invited" });
    expect(invites()).toHaveLength(1);
  });

  it("never records self-referral: the same account or address", async () => {
    expect(
      await recordInvitedSignUp({
        userId: INVITER.id,
        email: INVITER.email,
        codes: [CODE],
      }),
    ).toEqual({ status: "skipped", reason: "self_referral" });
    fakeDb.seed("user", [person("user_alt", "ana.diaz+x@example.test")]);
    expect(
      await recordInvitedSignUp({
        userId: "user_alt",
        email: "ana.diaz+x@example.test",
        codes: [CODE],
      }),
    ).toEqual({ status: "skipped", reason: "self_referral" });
    expect(invites()).toHaveLength(0);
  });

  it("ignores unknown codes", async () => {
    expect(
      await recordInvitedSignUp({
        userId: FRIEND.id,
        email: FRIEND.email,
        codes: ["zzzzzzzzzz"],
      }),
    ).toEqual({ status: "skipped", reason: "unknown_code" });
  });

  it("does nothing on a self-hosted copy, without a single lookup", async () => {
    state.invites = false;
    fakeDb.missing("inviteCode", "invite");
    expect(
      signUpInviteTask({
        userId: FRIEND.id,
        email: FRIEND.email,
        headers: new Headers({ [INVITE_HEADER]: CODE }),
      }),
    ).toBeNull();
    expect(
      await recordInvitedSignUp({
        userId: FRIEND.id,
        email: FRIEND.email,
        codes: [CODE],
      }),
    ).toEqual({ status: "skipped", reason: "unavailable" });
  });

  it("never fails the sign-up while the tables don't exist yet", async () => {
    fakeDb.missing("inviteCode", "invite");
    expect(
      await recordInvitedSignUp({
        userId: FRIEND.id,
        email: FRIEND.email,
        codes: [CODE],
      }),
    ).toEqual({ status: "skipped", reason: "missing_tables" });
  });
});

describe("an affiliate's code and an invite in one sign-up", () => {
  it("credits the affiliate with the channel and still records the invite", async () => {
    seedAffiliate({ userId: "user_affiliate" });
    fakeDb.seed("user", [person("user_affiliate", "aff@example.org")]);
    recordNewUserSignUp({
      userId: FRIEND.id,
      email: FRIEND.email,
      headers: new Headers({
        [REFERRAL_HEADER]: "ana-diaz-4k2p",
        [INVITE_HEADER]: CODE,
      }),
      oauthReferralCode: null,
      oauthLanding: null,
    });
    await vi.waitFor(() =>
      expect(fakeDb.rows("userAcquisition")).toHaveLength(1),
    );
    expect(fakeDb.rows("affiliateReferral")).toHaveLength(1);
    expect(invites()).toHaveLength(1);
    expect(fakeDb.rows("userAcquisition")[0]?.channel).toBe("affiliate");
  });

  it("names the channel invite when only the invite counted", () => {
    expect(acquisitionChannel(null, { affiliate: false, invite: true })).toBe(
      "invite",
    );
    expect(acquisitionChannel(null, { affiliate: true, invite: true })).toBe(
      "affiliate",
    );
    expect(
      acquisitionChannel(
        { referrer_host: "google.com" },
        { affiliate: false, invite: true },
      ),
    ).toBe("invite");
  });
});

describe("the friend's first dynamic code", () => {
  beforeEach(() => seedPendingFriend(FRIEND.id));

  it("rewards both sides once", async () => {
    const at = new Date(SIGNED_UP.getTime() + 2 * DAY);
    expect(await qualifyInvite(FRIEND.id, at)).toEqual({
      outcome: "rewarded",
      inviterUserId: INVITER.id,
      inviterSlot: 1,
    });
    expect(await qualifyInvite(FRIEND.id, at)).toEqual({ outcome: "decided" });
    expect(invites()[0]).toMatchObject({
      status: "rewarded",
      inviterRewardSlot: 1,
      decidedAt: at,
    });
    expect(await inviteBonusCodes(FRIEND.id)).toBe(5);
    expect(await inviteBonusCodes(INVITER.id)).toBe(5);
  });

  it("rewards once when two codes are made at the same moment", async () => {
    const results = await Promise.all([
      qualifyInvite(FRIEND.id),
      qualifyInvite(FRIEND.id),
    ]);
    expect(results.filter((r) => r.outcome === "rewarded")).toHaveLength(1);
    expect(invites()[0]?.inviterRewardSlot).toBe(1);
  });

  it("expires after 30 days, and the grant never comes later", async () => {
    const late = new Date(SIGNED_UP.getTime() + 31 * DAY);
    expect(await qualifyInvite(FRIEND.id, late)).toEqual({
      outcome: "expired",
    });
    expect(await qualifyInvite(FRIEND.id, late)).toEqual({
      outcome: "decided",
    });
    expect(await inviteBonusCodes(FRIEND.id)).toBe(0);
    expect(await inviteBonusCodes(INVITER.id)).toBe(0);
  });

  it("counts on the 30th day", async () => {
    const last = new Date(SIGNED_UP.getTime() + 30 * DAY);
    expect((await qualifyInvite(FRIEND.id, last)).outcome).toBe("rewarded");
  });

  it("refuses self-referral found later: a workspace shared since sign-up", async () => {
    fakeDb.seed("member", [
      {
        id: "m_shared",
        organizationId: ownWorkspaceId(INVITER.id),
        userId: FRIEND.id,
        role: "member",
        createdAt: SIGNED_UP,
      },
    ]);
    expect(await qualifyInvite(FRIEND.id)).toEqual({
      outcome: "self_referral",
    });
    expect(await inviteBonusCodes(INVITER.id)).toBe(0);
  });

  it("still rewards the friend when the inviter's account is gone", async () => {
    const row = invites()[0] as Record<string, unknown>;
    row.inviterUserId = null;
    expect(await qualifyInvite(FRIEND.id)).toEqual({
      outcome: "rewarded",
      inviterUserId: null,
      inviterSlot: null,
    });
    expect(await inviteBonusCodes(FRIEND.id)).toBe(5);
  });

  it("emails the inviter after the response, and skips a code held for review", async () => {
    noteDynamicCodesCreated(FRIEND.id, { counted: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(invites()[0]?.status).toBe("pending");

    noteDynamicCodesCreated(FRIEND.id, { counted: true });
    await vi.waitFor(() =>
      expect(sendInviteRewardEmail).toHaveBeenCalledWith({
        inviterUserId: INVITER.id,
        rewardedFriends: 1,
      }),
    );
  });

  it("does nothing for someone who wasn't invited", async () => {
    expect(await qualifyInvite("user_nobody")).toEqual({
      outcome: "no_invite",
    });
  });

  it("never fails a code while the tables don't exist yet", async () => {
    fakeDb.missing("invite");
    expect(await qualifyInvite(FRIEND.id)).toEqual({
      outcome: "missing_tables",
    });
  });
});

describe("the inviter's cap", () => {
  it("rewards at most 10 friends; the 11th friend still gets theirs", async () => {
    const friends = Array.from(
      { length: INVITE_MAX_REWARDED_FRIENDS + 1 },
      (_, i) => `user_f${i}`,
    );
    for (const id of friends) seedPendingFriend(id);
    // Two at a time, as if they made their codes at the same moment.
    for (let i = 0; i < friends.length; i += 2) {
      await Promise.all(friends.slice(i, i + 2).map((id) => qualifyInvite(id)));
    }
    const slots = invites()
      .map((row) => row.inviterRewardSlot)
      .filter((slot) => slot !== null)
      .sort((a, b) => Number(a) - Number(b));
    expect(slots).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(invites().every((row) => row.status === "rewarded")).toBe(true);
    expect(await inviteBonusCodes(INVITER.id)).toBe(50);
    expect(await inviteBonusCodes("user_f10")).toBe(5);
    expect(await canStillEarnFromInvites(INVITER.id)).toBe(false);
  });

  it("can still earn below the cap", async () => {
    expect(await canStillEarnFromInvites(INVITER.id)).toBe(true);
  });
});

describe("the bonus in the dynamic-code limit", () => {
  const own = (userId: string) => ({
    userId,
    organizationId: ownWorkspaceId(userId),
  });

  beforeEach(async () => {
    seedPendingFriend(FRIEND.id);
    await qualifyInvite(FRIEND.id);
  });

  it("adds to a Free own workspace, both sides", async () => {
    expect(await dynamicCodeLimit(own(INVITER.id))).toEqual({
      limit: 15,
      bonus: 5,
    });
    expect(await dynamicCodeLimit(own(FRIEND.id))).toEqual({
      limit: 15,
      bonus: 5,
    });
  });

  it("counts for a member acting in the owner's own workspace", async () => {
    expect(
      await dynamicCodeLimit({
        userId: "user_member",
        organizationId: ownWorkspaceId(INVITER.id),
      }),
    ).toEqual({ limit: 15, bonus: 5 });
  });

  it("never adds to a team, and changes nothing on an unlimited plan", async () => {
    expect(
      await dynamicCodeLimit({
        userId: INVITER.id,
        organizationId: "org_team",
      }),
    ).toEqual({ limit: 10, bonus: 0 });
    state.plans.set(ownWorkspaceId(INVITER.id), "pro");
    expect(await dynamicCodeLimit(own(INVITER.id))).toEqual({
      limit: Number.POSITIVE_INFINITY,
      bonus: 0,
    });
  });

  it("stops counting a revoked invite for new codes", async () => {
    (invites()[0] as Record<string, unknown>).revokedAt = new Date();
    expect(await dynamicCodeLimit(own(INVITER.id))).toEqual({
      limit: 10,
      bonus: 0,
    });
  });

  it("is off on a self-hosted copy, and fail-safe without the tables", async () => {
    state.invites = false;
    expect(await dynamicCodeLimit(own(INVITER.id))).toEqual({
      limit: 10,
      bonus: 0,
    });
    state.invites = true;
    fakeDb.missing("invite");
    expect(await dynamicCodeLimit(own(INVITER.id))).toEqual({
      limit: 10,
      bonus: 0,
    });
  });
});

describe("Settings → Invite friends", () => {
  it("shows counts only: joined, waiting, rewarded and codes earned", async () => {
    seedPendingFriend(FRIEND.id);
    seedPendingFriend("user_late", new Date(SIGNED_UP.getTime() - 40 * DAY));
    seedPendingFriend("user_new");
    await qualifyInvite(FRIEND.id);
    const page = await loadInviteDashboard(INVITER.id, SIGNED_UP);
    expect(page).toEqual({
      code: CODE,
      joined: 3,
      waiting: 1,
      rewardedFriends: 1,
      bonusCodes: 5,
      rewardedAsFriend: false,
    });
    expect(JSON.stringify(page)).not.toContain(FRIEND.id);
    expect((await loadInviteDashboard(FRIEND.id)).rewardedAsFriend).toBe(true);
  });
});

describe("the rules as numbers", () => {
  it("caps the bonus: the friend's once, the inviter's at 10 friends", () => {
    expect(bonusCodesFor({ asFriend: 0, asInviter: 0 })).toBe(0);
    expect(bonusCodesFor({ asFriend: 1, asInviter: 0 })).toBe(5);
    expect(bonusCodesFor({ asFriend: 3, asInviter: 2 })).toBe(15);
    expect(bonusCodesFor({ asFriend: 1, asInviter: 40 })).toBe(55);
  });

  it("counts a first code up to 30 days after sign-up", () => {
    expect(isWithinQualifyWindow(SIGNED_UP, SIGNED_UP)).toBe(true);
    expect(
      isWithinQualifyWindow(
        SIGNED_UP,
        new Date(SIGNED_UP.getTime() + 30 * DAY),
      ),
    ).toBe(true);
    expect(
      isWithinQualifyWindow(
        SIGNED_UP,
        new Date(SIGNED_UP.getTime() + 30 * DAY + 1),
      ),
    ).toBe(false);
  });

  it("makes random codes from the unambiguous alphabet", () => {
    const code = randomInviteCode();
    expect(code).toMatch(/^[a-hj-km-np-z2-9]{10}$/);
    expect(randomInviteCode(() => new Uint8Array(10))).toBe("aaaaaaaaaa");
  });

  it("lands on the editor, with the code only when it's someone's", () => {
    expect(inviteLandingHref(CODE)).toBe(`/playground?invite=${CODE}`);
    expect(inviteLandingHref(null)).toBe("/playground");
  });
});

describe("the invite link, /i/<code>", () => {
  const open = async (code: string) => {
    const { GET } = await import("@/app/i/[code]/route");
    return GET(new Request(`https://qrdx.dev/i/${code}`), {
      params: Promise.resolve({ code }),
    });
  };

  it("goes to the editor with a known code, storing nothing", async () => {
    const response = await open(CODE);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`/playground?invite=${CODE}`);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("goes to the editor without a code for an unknown or malformed one", async () => {
    expect((await open("zzzzzzzzzz")).headers.get("location")).toBe(
      "/playground",
    );
    expect((await open("%3Cscript%3E")).headers.get("location")).toBe(
      "/playground",
    );
  });

  it("carries no code where invites are off or before the tables exist", async () => {
    state.invites = false;
    expect((await open(CODE)).headers.get("location")).toBe("/playground");
    state.invites = true;
    fakeDb.missing("inviteCode");
    expect((await open(CODE)).headers.get("location")).toBe("/playground");
  });
});
