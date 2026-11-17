// The back-office console's request signature (lib/console-internal/signature.ts):
// only the secret's holder can sign, a signature covers the path and the body
// exactly, and it's good for five minutes either side of now.
import { describe, expect, it } from "vitest";
import {
  consoleSignature,
  isUsableSecret,
  MAX_SKEW_SECONDS,
  verifyConsoleSignature,
} from "@/lib/console-internal/signature";

const SECRET = "s".repeat(64);
const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);
const parts = {
  timestamp: String(Math.floor(NOW / 1000)),
  requestId: "0123456789abcdef0123456789abcdef",
  pathname: "/api/internal/console/users/ban",
  body: JSON.stringify({ actor: { userId: "u_admin", sessionId: "s_1" } }),
};
const signed = {
  ...parts,
  signature: consoleSignature(SECRET, parts),
  secret: SECRET,
  now: NOW,
};

describe("verifyConsoleSignature", () => {
  it("accepts what the secret signed", () => {
    expect(verifyConsoleSignature(signed)).toEqual({
      ok: true,
      requestId: parts.requestId,
    });
    expect(signed.signature).toMatch(/^v1=[0-9a-f]{64}$/);
  });

  it("refuses another secret's signature", () => {
    expect(
      verifyConsoleSignature({
        ...signed,
        signature: consoleSignature("t".repeat(64), parts),
      }),
    ).toEqual({ ok: false, reason: "mismatch" });
  });

  it("refuses a changed body, path, request id or timestamp", () => {
    for (const change of [
      { body: parts.body.replace("u_admin", "u_other") },
      { pathname: "/api/internal/console/users/delete" },
      { requestId: "f".repeat(32) },
      { timestamp: String(Number(parts.timestamp) + 1) },
    ]) {
      expect(
        verifyConsoleSignature({ ...signed, ...change }),
        JSON.stringify(change),
      ).toEqual({
        ok: false,
        reason: "mismatch",
      });
    }
  });

  it("refuses a signature from too long ago or too far ahead", () => {
    const at = (seconds: number) => {
      const timestamp = String(Math.floor(NOW / 1000) + seconds);
      const moved = { ...parts, timestamp };
      return verifyConsoleSignature({
        ...signed,
        timestamp,
        signature: consoleSignature(SECRET, moved),
      });
    };
    expect(at(-MAX_SKEW_SECONDS).ok).toBe(true);
    expect(at(MAX_SKEW_SECONDS).ok).toBe(true);
    expect(at(-MAX_SKEW_SECONDS - 1)).toEqual({ ok: false, reason: "stale" });
    expect(at(MAX_SKEW_SECONDS + 1)).toEqual({ ok: false, reason: "stale" });
  });

  it("refuses missing or malformed headers", () => {
    for (const change of [
      { timestamp: null },
      { timestamp: "12.5" },
      { timestamp: "-1" },
      { requestId: null },
      { requestId: "0123456789ABCDEF0123456789ABCDEF" },
      { requestId: "abc" },
      { signature: null },
      { signature: signed.signature.slice(3) },
      { signature: `v2=${signed.signature.slice(3)}` },
      { signature: `${signed.signature}00` },
    ]) {
      expect(
        verifyConsoleSignature({ ...signed, ...change }),
        JSON.stringify(change),
      ).toEqual({
        ok: false,
        reason: "malformed",
      });
    }
  });
});

describe("isUsableSecret", () => {
  it("needs 32 characters or more", () => {
    expect(isUsableSecret(undefined)).toBe(false);
    expect(isUsableSecret("")).toBe(false);
    expect(isUsableSecret("x".repeat(31))).toBe(false);
    expect(isUsableSecret("x".repeat(32))).toBe(true);
  });
});
