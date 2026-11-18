// Asking for an email sign-in code (packages/auth/email-otp.ts). Better Auth
// catches what the sender throws, logs it and answers "sent" anyway, so a
// server that couldn't email the code said "Code sent". signInCodeGate makes
// the endpoint answer what happened: where no code can be delivered, it says
// so before one is made; when sending fails, the failure is the answer. The
// same answer for every address, with an account or without. Run inside a
// real Better Auth (memory adapter) with the real emailOTP plugin; nothing is
// emailed.
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  registerSignInCodeSender,
  SIGN_IN_CODE_NOT_SENT,
  sendVerificationOTP,
  signInCodeGate,
  signInCodeRateLimited,
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

const betterAuthDir = realpathSync(
  path.resolve(
    import.meta.dirname,
    "../../../../packages/auth/node_modules/better-auth",
  ),
);
const ORIGIN = "http://localhost:3000";
const HAS_ACCOUNT = "ada@qrdx.test";
const NO_ACCOUNT = "grace@qrdx.test";

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
    );
    const reply = await askForCode(ungated, NO_ACCOUNT);
    expect(reply).toEqual({ status: 200, body: { success: true } });
  });
});

describe("where no code can be delivered", () => {
  beforeEach(() => {
    registerSignInCodeSender(working, () => false);
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
    registerSignInCodeSender(undefined as never, () => true);
    const reply = await askForCode(gated, NO_ACCOUNT);
    expect(reply.status).toBe(400);
    expect(reply.body?.code).toBe(SIGN_IN_CODES_UNAVAILABLE);
  });
});

describe("where codes can be delivered", () => {
  it("sends the code and says so", async () => {
    registerSignInCodeSender(working, () => true);
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
    );
    const withAccount = await askForCode(gated, HAS_ACCOUNT);
    const without = await askForCode(gated, NO_ACCOUNT);
    expect(withAccount.status).toBe(500);
    expect(withAccount.body).toMatchObject({ code: SIGN_IN_CODE_NOT_SENT });
    expect(without).toEqual(withAccount);
    // Nothing about the provider or the code reaches the browser.
    expect(JSON.stringify(withAccount.body)).not.toMatch(/Resend|\d{6}/);
  });

  it("answers 429 when the address asked for too many codes", async () => {
    registerSignInCodeSender(
      async () => {
        throw signInCodeRateLimited();
      },
      () => true,
    );
    const reply = await askForCode(gated, NO_ACCOUNT);
    expect(reply.status).toBe(429);
    expect(reply.body?.code).toBe("SIGN_IN_CODE_RATE_LIMITED");
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
    );
    const [failed, sent] = await Promise.all([
      askForCode(gated, NO_ACCOUNT),
      askForCode(gated, HAS_ACCOUNT),
    ]);
    expect(failed.status).toBe(500);
    expect(sent).toEqual({ status: 200, body: { success: true } });
    // And the next request starts clean.
    registerSignInCodeSender(working, () => true);
    expect((await askForCode(gated, NO_ACCOUNT)).status).toBe(200);
  });
});
