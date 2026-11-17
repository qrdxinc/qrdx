// The shadcn registry shares /r with referral links (app/r/[code]/route.ts).
// Its items are static files (public/r/*.json), so any other /r/<name>.json
// reaches the referral route: it answers a 404 in JSON, not a redirect to the
// home page, and /r/registry goes on to the index. Neither looks up a code
// or spends the click limit. Referral links work as before.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  limited: [] as string[],
  recordReferralClick: vi.fn(
    async (code: string): Promise<string | null> => code,
  ),
}));

vi.mock("@/lib/affiliates/program", () => ({
  recordReferralClick: state.recordReferralClick,
}));
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: (id: string) => id === "affiliates",
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async (key: string) => {
      state.limited.push(key);
      return { success: true };
    },
  }),
}));

import { GET as referralLink } from "@/app/r/[code]/route";

const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const open = (code: string) =>
  referralLink(
    new Request(`http://localhost:3000/r/${code}`, {
      headers: { "user-agent": BROWSER, "x-real-ip": "198.51.100.7" },
    }),
    { params: Promise.resolve({ code }) },
  );

beforeEach(() => {
  state.limited = [];
  state.recordReferralClick.mockClear();
});

describe("registry misses on /r", () => {
  it("answers an unknown item with a 404 in JSON, without a referral lookup", async () => {
    const response = await open("foo.json");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, must-revalidate",
    );
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("location")).toBeNull();
    expect(await response.json()).toEqual({
      error: "Not found",
      message:
        "No registry item named foo. The QRdx registry index is https://qrdx.dev/r/registry.json",
    });
    expect(state.recordReferralClick).not.toHaveBeenCalled();
    expect(state.limited).toEqual([]);
  });

  it("matches the extension in any casing", async () => {
    const response = await open("FOO.JSON");
    expect(response.status).toBe(404);
    expect((await response.json()).message).toContain(
      "No registry item named FOO.",
    );
    expect(state.recordReferralClick).not.toHaveBeenCalled();
  });

  it("sends /r/registry on to the index", async () => {
    for (const name of ["registry", "Registry"]) {
      const response = await open(name);
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe("/r/registry.json");
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    }
    expect(state.recordReferralClick).not.toHaveBeenCalled();
    expect(state.limited).toEqual([]);
  });

  it("leaves referral links as they were", async () => {
    const response = await open("ana-diaz-4k2p");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/?ref=ana-diaz-4k2p");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.recordReferralClick).toHaveBeenCalledWith("ana-diaz-4k2p", {
      count: true,
    });

    state.recordReferralClick.mockResolvedValueOnce(null);
    const unknown = await open("nobody-has-this");
    expect(unknown.status).toBe(307);
    expect(unknown.headers.get("location")).toBe("/");
  });
});
