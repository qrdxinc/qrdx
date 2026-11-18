// Asking for an email sign-in code (packages/auth/email-otp.ts). Better Auth
// catches what the sender throws, logs it and answers "sent" anyway, so a
// server that couldn't email the code said "Code sent". signInCodeGate makes
// the endpoint answer what happened: where no code can be delivered, it says
// so before one is made; when sending fails, the failure is the answer. The
// same answer for every address, with an account or without. The
// per-address limit runs before a code is made, so a refused resend leaves
// the last code working. Run inside a real Better Auth (memory adapter) with
// the real emailOTP plugin; nothing is emailed.
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  registerSignInCodeSender,
  SIGN_IN_CODE_NOT_SENT,
  sendVerificationOTP,
  signInCodeGate,
} from "@repo/auth/email-otp";
import {
  SEND_SIGN_IN_CODE_PATH,
  SIGN_IN_CODES_UNAVAILABLE,
} from "@repo/auth/sign-in-code-rules";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// The app's per-address limiters (lib/auth/sign-in-code.tsx: 5 codes in 15
// minutes, 30 a day), in memory instead of Upstash, counting each check by
// prefix. The rest of the app's sender is faked only where it would reach a
// request or the database.
const limits = vi.hoisted(() => ({ checks: new Map<string, number>() }));
vi.mock("@repo/rate-limit", async () => {
  const { createMemoryLimiter, parseDuration } = await import(
    "@repo/rate-limit/fallback"
  );
  return {
    slidingWindow: (tokens: number, window: string) => ({
      tokens,
      windowMs: parseDuration(window),
    }),
    createRateLimiter: ({
      prefix,
      limiter,
    }: {
      prefix: string;
      limiter: { tokens: number; windowMs: number };
    }) => {
      const memory = createMemoryLimiter(limiter);
      return {
        limit: async (key: string) => {
          limits.checks.set(prefix, (limits.checks.get(prefix) ?? 0) + 1);
          return memory.limit(key);
        },
      };
    },
  };
});
vi.mock("@/lib/security/request-details", () => ({
  currentRequestDetails: async () => ({ location: null }),
}));
vi.mock("@/lib/i18n/email-locale", () => ({
  emailIntlForAddress: async () => ({}),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));

const betterAuthDir = realpathSync(
  path.resolve(
    import.meta.dirname,
    "../../../../packages/auth/node_modules/better-auth",
  ),
);
const ORIGIN = "http://localhost:3000";
const HAS_ACCOUNT = "ada@qrdx.test";
const NO_ACCOUNT = "grace@qrdx.test";
/** No per-address limit: for the tests about something else. */
const anyAddress = async () => true;

let db: Record<string, Record<string, unknown>[]>;
let gated: any;
let ungated: any;

beforeAll(async () => {
  const { betterAuth } = await import(`${betterAuthDir}/dist/index.mjs`);
  const { memoryAdapter } = await import(
    `${betterAuthDir}/dist/adapters/memory-adapter/index.mjs`
  );
  const { emailOTP } = await import(
    `${betterAuthDir}/dist/plugins/email-otp/index.mjs`
  );
  db = { user: [], session: [], account: [], verification: [] };
  const options = (plugins: unknown[]) => ({
    baseURL: ORIGIN,
    secret: "test-secret-at-least-32-characters-long",
    database: memoryAdapter(db),
    rateLimit: { enabled: false },
    // Quiet: the failures below are expected, and Better Auth logs them.
    logger: { disabled: true },
    plugins: [
      ...plugins,
      // As packages/auth/server.ts configures it.
      emailOTP({
        otpLength: 6,
        expiresIn: 5 * 60,
        allowedAttempts: 3,
        storeOTP: "hashed",
        disableSignUp: false,
        sendVerificationOTP,
      }),
    ],
  });
  gated = betterAuth(options([signInCodeGate()]));
  ungated = betterAuth(options([]));
});

/** What the sender was handed, by address. */
let delivered: Map<string, string>;

beforeEach(() => {
  for (const rows of Object.values(db)) rows.length = 0;
  const now = new Date();
  db.user.push({
    id: "user_ada",
    email: HAS_ACCOUNT,
    name: "Ada",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  delivered = new Map();
  // The server's own logs (no addresses or codes in them) stay out of the
  // test output.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const working = async ({ email, otp }: { email: string; otp: string }) => {
  delivered.set(email, otp);
};

async function askForCode(auth: any, email: string) {
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth${SEND_SIGN_IN_CODE_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, type: "sign-in" }),
    }),
  );
  const text = await response.text();
  return {
    status: response.status as number,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
  };
}

const signInCodeRows = () =>
  db.verification.filter((row) =>
    String(row.identifier).startsWith("sign-in-otp-"),
  );

describe("without the gate, Better Auth answers 'sent' whatever happened", () => {
  // Why the gate exists. If a Better Auth upgrade starts passing the
  // sender's error on, this fails, and the gate's after hook can go.
  it("answers 200 even when the sender threw", async () => {
    registerSignInCodeSender(
      async () => {
        throw new Error("Resend is down");
      },
      () => true,
      anyAddress,
    );
    const reply = await askForCode(ungated, NO_ACCOUNT);
    expect(reply).toEqual({ status: 200, body: { success: true } });
  });
});

describe("where no code can be delivered", () => {
  beforeEach(() => {
    registerSignInCodeSender(working, () => false, anyAddress);
  });

  it("says email sign-in isn't set up, the same for every address, and makes no code", async () => {
    const withAccount = await askForCode(gated, HAS_ACCOUNT);
    const without = await askForCode(gated, NO_ACCOUNT);
    expect(withAccount.status).toBe(400);
    expect(withAccount.body).toMatchObject({
      code: SIGN_IN_CODES_UNAVAILABLE,
      message: "Email sign-in isn't set up on this site.",
    });
    expect(without).toEqual(withAccount);
    // Even an address that isn't one gets the same answer: it's checked
    // before anything is read.
    expect(await askForCode(gated, "not an address")).toEqual(withAccount);
    expect(delivered.size).toBe(0);
    expect(signInCodeRows()).toEqual([]);
  });

  it("says the same when the app never registered a sender", async () => {
    registerSignInCodeSender(undefined as never, () => true, anyAddress);
    const reply = await askForCode(gated, NO_ACCOUNT);
    expect(reply.status).toBe(400);
    expect(reply.body?.code).toBe(SIGN_IN_CODES_UNAVAILABLE);
  });
});

describe("where codes can be delivered", () => {
  it("sends the code and says so", async () => {
    registerSignInCodeSender(working, () => true, anyAddress);
    for (const email of [HAS_ACCOUNT, NO_ACCOUNT]) {
      expect(await askForCode(gated, email), email).toEqual({
        status: 200,
        body: { success: true },
      });
      expect(delivered.get(email), email).toMatch(/^\d{6}$/);
    }
  });

  it("answers with the failure when sending fails, the same for every address", async () => {
    registerSignInCodeSender(
      async () => {
        throw new Error("Resend is down");
      },
      () => true,
      anyAddress,
    );
    const withAccount = await askForCode(gated, HAS_ACCOUNT);
    const without = await askForCode(gated, NO_ACCOUNT);
    expect(withAccount.status).toBe(500);
    expect(withAccount.body).toMatchObject({ code: SIGN_IN_CODE_NOT_SENT });
    expect(without).toEqual(withAccount);
    // Nothing about the provider or the code reaches the browser.
    expect(JSON.stringify(withAccount.body)).not.toMatch(/Resend|\d{6}/);
  });

  it("keeps each request's answer to itself", async () => {
    // Fails for one address only, so two requests at once must not swap.
    registerSignInCodeSender(
      async ({ email, otp }) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (email === NO_ACCOUNT) throw new Error("bounced");
        delivered.set(email, otp);
      },
      () => true,
      anyAddress,
    );
    const [failed, sent] = await Promise.all([
      askForCode(gated, NO_ACCOUNT),
      askForCode(gated, HAS_ACCOUNT),
    ]);
    expect(failed.status).toBe(500);
    expect(sent).toEqual({ status: 200, body: { success: true } });
    // And the next request starts clean.
    registerSignInCodeSender(working, () => true, anyAddress);
    expect((await askForCode(gated, NO_ACCOUNT)).status).toBe(200);
  });
});

async function signInWith(auth: any, email: string, otp: string) {
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/email-otp`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, otp }),
    }),
  );
  return response.status as number;
}

describe("the per-address limit", () => {
  // The app's sender and limit, registered as app/api/auth/[...all]/route.ts
  // registers them. In tests the sender writes the code to the console
  // (lib/auth/sign-in-code-delivery.ts), which is where it's read from.
  let codes: Map<string, string>;

  beforeEach(async () => {
    // Fresh limiters: they live in the module.
    vi.resetModules();
    const { sendSignInCode, signInCodeAllowed } = await import(
      "@/lib/auth/sign-in-code"
    );
    registerSignInCodeSender(sendSignInCode, () => true, signInCodeAllowed);
    limits.checks.clear();
    codes = new Map();
    vi.spyOn(console, "info").mockImplementation((line: string) => {
      const sent = / for (\S+): (\d{6}) /.exec(line);
      if (sent) codes.set(sent[1], sent[2]);
    });
  });

  // Codes made in the same millisecond would tie on createdAt, the order
  // Better Auth picks the latest code by.
  const tick = () => new Promise((resolve) => setTimeout(resolve, 2));

  it("refuses the 6th code in 15 minutes before making it, so the 5th still works", async () => {
    const refusals: unknown[] = [];
    for (const email of [HAS_ACCOUNT, NO_ACCOUNT]) {
      for (let sent = 1; sent <= 5; sent++) {
        expect(await askForCode(gated, email), `${email} #${sent}`).toEqual({
          status: 200,
          body: { success: true },
        });
        await tick();
      }
      const fifth = codes.get(email);
      expect(fifth, email).toMatch(/^\d{6}$/);
      const rowsBefore = structuredClone(signInCodeRows());

      const sixth = await askForCode(gated, email);
      expect(sixth.status, email).toBe(429);
      expect(sixth.body?.code, email).toBe("SIGN_IN_CODE_RATE_LIMITED");
      refusals.push(sixth);
      // No new code was made, and none was sent.
      expect(signInCodeRows(), email).toEqual(rowsBefore);
      expect(codes.get(email), email).toBe(fifth);
      // The code already in the inbox still signs in.
      expect(await signInWith(gated, email, fifth as string), email).toBe(200);
    }
    // The same answer whether or not the address has an account.
    expect(refusals[0]).toEqual(refusals[1]);
  });

  it("checks the limit once per request, not again in the sender", async () => {
    expect((await askForCode(gated, NO_ACCOUNT)).status).toBe(200);
    expect(Object.fromEntries(limits.checks)).toEqual({
      "qrdx:sign-in-code": 1,
      "qrdx:sign-in-code-day": 1,
    });
  });
});

describe("without the limit in the gate, a refused resend still replaces the code", () => {
  // Why the limit runs in signInCodeGate's before hook: Better Auth stores
  // the new code before the sender runs, so a sender that refuses (as the
  // app's once did) leaves the person with a code that no longer works. If
  // a Better Auth upgrade starts asking the sender first, this fails.
  it("stores a new code even when the sender refuses it", async () => {
    registerSignInCodeSender(
      async ({ email, otp }) => {
        if (delivered.has(email)) throw new Error("refused");
        delivered.set(email, otp);
      },
      () => true,
      anyAddress,
    );
    expect((await askForCode(gated, NO_ACCOUNT)).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 2));
    expect((await askForCode(gated, NO_ACCOUNT)).status).toBe(500);
    expect(signInCodeRows()).toHaveLength(2);
    // The code that went out is no longer the one Better Auth checks.
    expect(
      await signInWith(gated, NO_ACCOUNT, delivered.get(NO_ACCOUNT) as string),
    ).toBe(400);
  });
});
