// Settings → Account → Email registers the code that confirms a new address
// with @repo/auth (packages/auth/email-otp.ts): the app's sender, the rule
// for whether codes can be delivered here, the per-address limit the gate
// checks before Better Auth looks the address up, and Next's after() so the
// email goes out after the answer: a free address's answer doesn't wait for
// an email a taken one is never sent. The gate test
// (tests/auth/sign-in-code-gate.test.ts) runs those pieces inside Better
// Auth; this checks the app hands them over.
import { beforeAll, describe, expect, it, vi } from "vitest";

const registered = vi.hoisted(() => ({ args: [] as unknown[] }));
const scheduled = vi.hoisted(() => ({ tasks: [] as unknown[] }));
const app = vi.hoisted(() => ({
  sendEmailChangeCode: async () => undefined,
  emailChangeCodeAllowed: async () => true,
  available: true,
}));

vi.mock("@repo/auth/email-otp", () => ({
  registerEmailChangeCodeSender: (...args: unknown[]) => {
    registered.args = args;
  },
}));
vi.mock("next/server", () => ({
  after: (task: unknown) => {
    scheduled.tasks.push(task);
  },
}));
vi.mock("@/lib/auth/email-change-code", () => ({
  sendEmailChangeCode: app.sendEmailChangeCode,
  emailChangeCodeAllowed: app.emailChangeCodeAllowed,
}));
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: (feature: string) =>
    feature === "emailSignIn" && app.available,
}));
// The rest of the module's imports, which this doesn't reach.
vi.mock("@repo/auth/server", () => ({ auth: { api: {} } }));
vi.mock("@repo/auth/sso-required", () => ({
  emailChangeSsoProblem: async () => null,
}));
vi.mock("@repo/database", () => ({ database: {}, session: {} }));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@/lib/account/confirmation-server", () => ({
  currentSession: async () => null,
  requireRecentConfirmation: async () => null,
}));
vi.mock("@/lib/account/email-change-server", () => ({
  afterEmailChanged: async () => undefined,
}));
vi.mock("@/lib/shared", () => ({ logError: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

beforeAll(async () => {
  await import("@/app/(app)/settings/account/_lib/email-change-actions");
});

describe("the email-change code's registration", () => {
  it("hands over the app's sender and its per-address limit", () => {
    const [sender, , mayRequest] = registered.args;
    expect(sender).toBe(app.sendEmailChangeCode);
    expect(mayRequest).toBe(app.emailChangeCodeAllowed);
  });

  it("follows the rule sign-in codes follow for whether a code can be delivered", () => {
    const deliverable = registered.args[1] as () => boolean;
    app.available = true;
    expect(deliverable()).toBe(true);
    app.available = false;
    expect(deliverable()).toBe(false);
  });

  it("schedules the email with Next's after(), so it goes out after the answer", () => {
    const later = registered.args[3] as (task: () => Promise<void>) => void;
    expect(typeof later).toBe("function");
    const task = async () => undefined;
    later(task);
    expect(scheduled.tasks).toEqual([task]);
  });
});
