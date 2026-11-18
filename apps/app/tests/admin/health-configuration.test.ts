// The admin Health page's "Optional features" row for email sign-in codes
// (admin/_lib/health.ts, getConfiguration). Where Resend is set but this
// deployment may not send email (a production build on a localhost URL, a
// Vercel preview: lib/delivery-guard.ts), the row used to list
// RESEND_API_KEY, EMAIL_FROM and NEXT_PUBLIC_APP_URL as if they were
// missing. It now says outbound email is off and how to allow it. The
// server's real environment, delivery guard and feature rules, as in
// tests/auth/sign-in-options.test.tsx.
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const RESEND = {
  RESEND_API_KEY: "re_test",
  EMAIL_FROM: "QRdx <a@qr.example.com>",
};

const OUTBOUND_OFF =
  "Outbound email is off on this deployment: NEXT_PUBLIC_APP_URL is localhost or 127.0.0.1, or this is a Vercel preview. Set QRDX_ALLOW_DEV_DELIVERY=1 to allow it.";

/** The email sign-in row of Health, with only `env` set, in production. */
async function emailSignInRow(env: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const { getConfiguration } = await import("@/app/(app)/admin/_lib/health");
  const { FEATURE_RULES } = await import("@repo/availability");
  const row = getConfiguration().find(
    (item) => item.name === FEATURE_RULES.emailSignIn.name,
  );
  if (!row) throw new Error("no email sign-in row");
  return row;
}

describe("Health's email sign-in row", () => {
  it("says outbound email is off when Resend is set on a localhost build", async () => {
    const row = await emailSignInRow({
      ...RESEND,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
    expect(row).toEqual({
      name: expect.any(String),
      on: false,
      vars: OUTBOUND_OFF,
    });
  });

  it("says the same on a Vercel preview with Resend", async () => {
    const row = await emailSignInRow({
      ...RESEND,
      VERCEL: "1",
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_APP_URL: "https://preview.qr.example.com",
    });
    expect(row.on).toBe(false);
    expect(row.vars).toBe(OUTBOUND_OFF);
  });

  it("names the variables when Resend isn't set", async () => {
    const row = await emailSignInRow({
      NEXT_PUBLIC_APP_URL: "https://qr.example.com",
    });
    expect(row.on).toBe(false);
    expect(row.vars).toBe("RESEND_API_KEY, EMAIL_FROM, NEXT_PUBLIC_APP_URL");
  });

  it("is on with Resend on the site's own domain", async () => {
    const row = await emailSignInRow({
      ...RESEND,
      NEXT_PUBLIC_APP_URL: "https://qr.example.com",
    });
    expect(row.on).toBe(true);
    expect(row.vars).toBe("RESEND_API_KEY, EMAIL_FROM, NEXT_PUBLIC_APP_URL");
  });

  it("allows QRDX_ALLOW_DEV_DELIVERY=1 to turn it on, as the hint says", async () => {
    const row = await emailSignInRow({
      ...RESEND,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      QRDX_ALLOW_DEV_DELIVERY: "1",
    });
    expect(row.on).toBe(true);
  });
});
