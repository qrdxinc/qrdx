// Every new account gets the welcome email after the sign-up response
// (lib/analytics/sign-up-hook.ts), whatever else the sign-up carried, with
// the sign-up's country read while the request is still there; a failure
// there never reaches the sign-up.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  deferred: [] as (() => Promise<void>)[],
  welcome: vi.fn(
    async (_input: { userId: string; country: string | null }) => "sent",
  ),
  acquisition: vi.fn(async (_input: unknown) => undefined),
}));

vi.mock("next/server", () => ({
  after: (task: () => Promise<void>) => {
    state.deferred.push(task);
  },
}));
vi.mock("@/lib/email/welcome", () => ({ sendWelcomeEmail: state.welcome }));
vi.mock("@/lib/affiliates/attribution-hook", () => ({
  signUpReferralTask: () => null,
}));
vi.mock("@/lib/analytics/acquisition", () => ({
  recordAcquisition: state.acquisition,
  signUpLandingOf: (signUp: { headers: Headers | null }) =>
    signUp.headers?.get("x-landing") ? { path: "/" } : null,
}));

const { recordNewUserSignUp } = await import("@/lib/analytics/sign-up-hook");

const signUp = (headers: Record<string, string> = {}) => ({
  userId: "u_new",
  email: "sam@mail.example.org.uk",
  headers: new Headers(headers),
  oauthReferralCode: null,
  oauthLanding: null,
});

beforeEach(() => {
  state.deferred.length = 0;
  state.welcome.mockClear();
  state.acquisition.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("the welcome email at sign-up", () => {
  it("is sent after the response, even when the sign-up carried nothing else", async () => {
    recordNewUserSignUp(signUp({ "x-vercel-ip-country": "IN" }));
    expect(state.welcome).not.toHaveBeenCalled();
    expect(state.deferred).toHaveLength(1);
    await Promise.all(state.deferred.map((task) => task()));
    expect(state.welcome).toHaveBeenCalledWith({
      userId: "u_new",
      country: "IN",
    });
    expect(state.acquisition).not.toHaveBeenCalled();
  });

  it("goes alongside recording how the visit started", async () => {
    recordNewUserSignUp(signUp({ "x-landing": "1" }));
    await Promise.all(state.deferred.map((task) => task()));
    expect(state.welcome).toHaveBeenCalledWith({
      userId: "u_new",
      country: null,
    });
    expect(state.acquisition).toHaveBeenCalledTimes(1);
  });

  it("never throws into the sign-up when sending fails", async () => {
    state.welcome.mockRejectedValueOnce(new Error("boom"));
    recordNewUserSignUp(signUp());
    await expect(
      Promise.all(state.deferred.map((task) => task())),
    ).resolves.toBeDefined();
  });
});
