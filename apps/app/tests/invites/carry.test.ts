// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://qrdx.dev/"}
// A friend's invite code in the browser (@repo/analytics/landing,
// lib/invites/invite-client.ts): read from the landing page's address
// (/playground?invite=<code>), carried to the other app's pages in a link's
// address like the rest of the visit, never written to the device, and
// never read as an affiliate's code (its own parameter and field).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  forgetPendingReferral,
  pendingReferralCode,
} from "@/lib/affiliates/referral-client";
import {
  carriedInvite,
  cleanInviteCode,
  forgetLanding,
  INVITE_PARAM,
  installVisitForwarding,
  signUpLanding,
  VISIT_PARAM,
  visitRef,
  withVisit,
} from "@/lib/analytics/landing";
import { pendingInviteCode } from "@/lib/invites/invite-client";

const CODE = "k7q2mx9pab";

function openPage(href: string, referrer = "") {
  forgetLanding();
  forgetPendingReferral();
  window.history.replaceState(null, "", href);
  Object.defineProperty(document, "referrer", {
    configurable: true,
    value: referrer,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  forgetLanding();
  forgetPendingReferral();
});

describe("an invite code's shape", () => {
  it("is 10 letters and digits, lower-cased", () => {
    expect(cleanInviteCode(CODE)).toBe(CODE);
    expect(cleanInviteCode(" K7Q2MX9PAB ")).toBe(CODE);
    expect(cleanInviteCode("short")).toBeNull();
    expect(cleanInviteCode("k7q2mx9pab1")).toBeNull();
    expect(cleanInviteCode("ana-diaz-4k")).toBeNull();
    expect(cleanInviteCode(42)).toBeNull();
  });
});

describe("the landing page", () => {
  it("keeps the code from the address for this visit, with nothing stored", () => {
    openPage(`/playground?${INVITE_PARAM}=${CODE}`);
    expect(pendingInviteCode()).toBe(CODE);
    expect(document.cookie).toBe("");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("isn't an affiliate's code, a ref tag or part of the recorded landing", () => {
    openPage(`/playground?${INVITE_PARAM}=${CODE}`);
    expect(pendingReferralCode()).toBeNull();
    expect(visitRef()).toBeNull();
    expect(JSON.stringify(signUpLanding())).not.toContain(CODE);
  });

  it("keeps both an affiliate's code and an invite when a visit has both", () => {
    openPage(`/?ref=ana-diaz-4k2p&${INVITE_PARAM}=${CODE}`);
    expect(pendingReferralCode()).toBe("ana-diaz-4k2p");
    expect(pendingInviteCode()).toBe(CODE);
  });

  it("has none without one, or with a malformed one", () => {
    openPage("/playground");
    expect(pendingInviteCode()).toBeNull();
    openPage(`/playground?${INVITE_PARAM}=<script>`);
    expect(pendingInviteCode()).toBeNull();
  });
});

describe("across the two apps", () => {
  it("rides in a link's address to the other app's page", () => {
    openPage(`/playground?${INVITE_PARAM}=${CODE}`);
    installVisitForwarding();
    const carried = new URL(withVisit("/pricing", window.location.href));
    const visit = JSON.parse(carried.searchParams.get(VISIT_PARAM) ?? "{}");
    expect(visit.invite).toBe(CODE);
    expect(visit.ref).toBeUndefined();
  });

  it("is read back on the page it opens, only from a page of this origin", () => {
    const visit = encodeURIComponent(JSON.stringify({ invite: CODE }));
    const href = `https://qrdx.dev/pricing?${VISIT_PARAM}=${visit}`;
    expect(
      carriedInvite({ href, referrer: "https://qrdx.dev/playground" }),
    ).toBe(CODE);
    expect(
      carriedInvite({ href, referrer: "https://elsewhere.example/" }),
    ).toBeNull();
    expect(carriedInvite({ href, referrer: "" })).toBeNull();

    openPage(`/pricing?${VISIT_PARAM}=${visit}`, "https://qrdx.dev/playground");
    expect(pendingInviteCode()).toBe(CODE);
  });
});
