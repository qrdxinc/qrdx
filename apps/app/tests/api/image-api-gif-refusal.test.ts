// GET /v1/qr?format=gif for a design the GIF would no longer scan: the engine
// says so (a GIFScanError), and the route answers with the same 400 it gives
// for any bad parameter, naming `format`, instead of a code that doesn't read.
// The engine's check is replaced here: no real design loses its scan to a
// palette, so what is tested is what the route does with the answer, and that
// the check is given the code's own value.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guard = vi.fn();
vi.mock("qrdx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("qrdx")>()),
  assertGIFStillScans: (...args: unknown[]) => guard(...args),
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 300,
      remaining: 299,
      reset: Date.now() + 30_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const route = await import("@/app/api/v1/qr/route");
const { GIFScanError } = await import("qrdx");

const get = (query: Record<string, string>) =>
  route.GET(
    new NextRequest(
      `http://localhost:3000/api/v1/qr?${new URLSearchParams(query)}`,
    ),
  );

describe("GIF the reduced image would not scan", () => {
  beforeEach(() => {
    guard.mockReset();
  });

  it("is a 400 on `format` that says to use a PNG, never cached", async () => {
    guard.mockRejectedValueOnce(
      new GIFScanError("the reduced image would not scan. Download a PNG."),
    );
    const response = await get({
      data: "https://qrdx.dev/refused",
      format: "gif",
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).not.toMatch(/immutable/);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const body = await response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.data.details).toEqual([
      {
        param: "format",
        message: expect.stringMatching(/would not scan/),
      },
    ]);
  });

  it("refuses a styled request the same way", async () => {
    guard.mockRejectedValueOnce(new GIFScanError("would not scan"));
    const response = await get({
      data: "https://qrdx.dev/refused-styled",
      format: "gif",
      frame: "border",
    });
    expect(response.status).toBe(400);
    // The guard's own message: an unknown format would be a 400 on `format` too
    expect((await response.json()).data.details).toEqual([
      { param: "format", message: "would not scan" },
    ]);
    expect(guard).toHaveBeenCalledTimes(1);
  });

  it("gives the check the code's own value, and not for another format", async () => {
    guard.mockResolvedValue(undefined);
    const gif = await get({
      data: "https://qrdx.dev/the-value",
      format: "gif",
    });
    expect(gif.status).toBe(200);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(guard.mock.calls[0]?.[2]).toBe("https://qrdx.dev/the-value");
    guard.mockClear();
    for (const format of ["png", "webp", "bmp", "ico", "svg"]) {
      const other = await get({ data: "https://qrdx.dev/the-value", format });
      expect(other.status, format).toBe(200);
    }
    expect(guard).not.toHaveBeenCalled();
  });

  it("is not a GIF error when something else fails", async () => {
    guard.mockRejectedValueOnce(new Error("boom"));
    const response = await get({
      data: "https://qrdx.dev/boom",
      format: "gif",
    });
    expect(response.status).toBe(500);
  });
});
