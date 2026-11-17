// @repo/rate-limit's `failClosed` limiters (the console's signed endpoints,
// lib/console-internal/limits.ts): when Upstash can't judge a request (not
// configured, an error, a timeout), they throw RateLimitUnavailableError
// instead of allowing it or judging it in one instance's memory.

import {
  type LimitResult,
  RateLimitUnavailableError,
  withoutFallback,
} from "@repo/rate-limit/fallback";
import { describe, expect, it, vi } from "vitest";

const result = (overrides: Partial<LimitResult> = {}): LimitResult => ({
  success: true,
  limit: 30,
  remaining: 29,
  reset: 0,
  pending: Promise.resolve(),
  ...overrides,
});

describe("withoutFallback", () => {
  it("passes Upstash's answer through, allowed or blocked", async () => {
    const upstash = vi
      .fn()
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(result({ success: false, remaining: 0 }));
    const limit = withoutFallback(upstash);
    expect((await limit("user.ban:u_1")).success).toBe(true);
    expect((await limit("user.ban:u_1", 2)).success).toBe(false);
    expect(upstash).toHaveBeenLastCalledWith("user.ban:u_1", 2);
  });

  it("throws when Upstash fails, keeping the cause", async () => {
    const down = new Error("fetch failed");
    const limit = withoutFallback(vi.fn().mockRejectedValue(down));
    const error = await limit("k").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RateLimitUnavailableError);
    expect((error as Error).name).toBe("RateLimitUnavailableError");
    expect((error as Error).cause).toBe(down);
  });

  it("throws on a timeout, where Upstash itself would allow the request", async () => {
    const limit = withoutFallback(
      vi.fn().mockResolvedValue(result({ success: true, reason: "timeout" })),
    );
    await expect(limit("k")).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });
});

describe("createRateLimiter without Upstash", () => {
  it("refuses when failing closed, and allows otherwise (as before)", async () => {
    // vitest.config.ts drops every UPSTASH_ / KV_ variable before tests.
    expect(process.env.UPSTASH_REDIS_REST_URL).toBeUndefined();
    expect(process.env.KV_REST_API_URL).toBeUndefined();
    const { createRateLimiter, redis, slidingWindow } = await import(
      "@repo/rate-limit"
    );
    expect(redis).toBeNull();
    const strict = createRateLimiter({
      limiter: slidingWindow(5, "1 h"),
      prefix: "qrdx:test-strict",
      failClosed: true,
    });
    await expect(strict.limit("user.delete:u_1")).rejects.toBeInstanceOf(
      RateLimitUnavailableError,
    );
    const lenient = createRateLimiter({
      limiter: slidingWindow(5, "1 h"),
      prefix: "qrdx:test-lenient",
    });
    expect((await lenient.limit("user.delete:u_1")).success).toBe(true);
  });
});
