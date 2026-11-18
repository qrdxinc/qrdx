// Settings → Account → Email, through its server actions
// (settings/account/_lib/email-change-actions.ts), inside a real Better Auth
// (memory adapter, with the emailOTP plugin and signInCodeGate as
// packages/auth/server.ts configures them). A signed-in user can ask for a
// code to any address and then type codes. Better Auth never keeps a code for
// an address that already has an account, so only a free address can run out
// of tries or see its code expire. Every answer must still be the same, step
// by step, or typing 000000 four times would tell which addresses have
// accounts. The clock is faked: it skips the actions' minimum answer time and
// lets codes expire. Nothing is emailed: in tests the app's sender writes the
// code to the console, which is where it's read from.
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  registerSignInCodeSender,
  sendVerificationOTP,
  signInCodeGate,
} from "@repo/auth/email-otp";
import { SEND_SIGN_IN_CODE_PATH } from "@repo/auth/sign-in-code-rules";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { EMAIL_CHANGE_MESSAGES } from "@/lib/account/email-change";

const app = vi.hoisted(() => ({
  auth: undefined as unknown,
  cookie: "",
  sessionId: "",
  /** Next's after(): run by the test, after the answer. */
  afterAnswer: [] as (() => unknown)[],
  /** What the actions logged as unexpected. */
  errors: [] as unknown[],
}));

// The app's limiters in memory, with their real windows.
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
      limiter,
    }: {
      limiter: { tokens: number; windowMs: number };
    }) => createMemoryLimiter(limiter),
  };
});
vi.mock("@repo/auth/server", () => ({ auth: app.auth }));
vi.mock("next/server", () => ({
  after: (task: () => unknown) => {
    app.afterAnswer.push(task);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/account/confirmation-server", () => ({
  // Signed in as Lin, confirmed a moment ago.
  currentSession: async () => ({
    userId: "user_lin",
    email: SIGNED_IN,
    sessionId: app.sessionId,
    sessionCreatedAt: new Date(),
    requestHeaders: new Headers({ cookie: app.cookie }),
    held: false,
  }),
  requireRecentConfirmation: async () => null,
}));
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: (feature: string) => feature === "emailSignIn",
}));
vi.mock("@/lib/account/email-change-server", () => ({
  afterEmailChanged: async () => undefined,
}));
vi.mock("@/lib/shared", () => ({
  logError: (error: unknown) => {
    app.errors.push(error);
  },
}));
// Only reached once a change is made: signing out the other sessions.
vi.mock("@repo/database", () => ({
  database: { delete: () => ({ where: async () => undefined }) },
  session: { id: {}, userId: {} },
}));
vi.mock("@repo/auth/sso-required", () => ({
  emailChangeSsoProblem: async () => null,
}));
vi.mock("@/lib/i18n/email-locale", () => ({
  emailIntlForAddress: async () => ({}),
}));
// Refusals in the person's language (lib/i18n/settings-action-text.ts):
// English here.
vi.mock(
  "@/lib/i18n/app-locale",
  async () => (await import("../support/intl")).appLocale,
);
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));

const betterAuthDir = realpathSync(
  path.resolve(
    import.meta.dirname,
    "../../../../packages/auth/node_modules/better-auth",
  ),
);
const ORIGIN = "http://localhost:3000";
const SIGNED_IN = "lin@qrdx.test";
const HAS_ACCOUNT = "ada@qrdx.test";
const NO_ACCOUNT = "grace@qrdx.test";
const CODE_LIFETIME_MS = 5 * 60 * 1000;

let db: Record<string, Record<string, unknown>[]>;

beforeAll(async () => {
  const { betterAuth } = await import(`${betterAuthDir}/dist/index.mjs`);
  const { memoryAdapter } = await import(
    `${betterAuthDir}/dist/adapters/memory-adapter/index.mjs`
  );
  const { emailOTP } = await import(
    `${betterAuthDir}/dist/plugins/email-otp/index.mjs`
  );
  db = { user: [], session: [], account: [], verification: [] };
  app.auth = betterAuth({
    baseURL: ORIGIN,
    secret: "test-secret-at-least-32-characters-long",
    database: memoryAdapter(db),
    rateLimit: { enabled: false },
    logger: { disabled: true },
    plugins: [
      signInCodeGate(),
      emailOTP({
        otpLength: 6,
        expiresIn: CODE_LIFETIME_MS / 1000,
        allowedAttempts: 3,
        storeOTP: "hashed",
        disableSignUp: false,
        changeEmail: { enabled: true },
        sendVerificationOTP,
      }),
    ],
  });
});

/** Codes the app's email-change sender wrote to the console, by address. */
let codes: Map<string, string>;

beforeEach(async () => {
  for (const rows of Object.values(db)) rows.length = 0;
  app.afterAnswer = [];
  app.errors = [];
  codes = new Map();
  const now = new Date();
  for (const [id, email] of [
    ["user_lin", SIGNED_IN],
    ["user_ada", HAS_ACCOUNT],
  ]) {
    db.user.push({
      id,
      email,
      name: id,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation((line: string) => {
    const sent = / for (\S+): (\d{6}) /.exec(line);
    if (sent) codes.set(sent[1], sent[2]);
  });
  app.cookie = await signIn(SIGNED_IN);
  app.sessionId = String(db.session[0]?.id);
  // setImmediate stays real: Better Auth's hashing and cookie signing finish
  // on Node's own queue, which answer() below lets run.
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "Date",
      "performance",
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Lin signs in with an emailed code; the session cookie. */
async function signIn(email: string): Promise<string> {
  let otp = "";
  registerSignInCodeSender(
    async (sent) => {
      otp = sent.otp;
    },
    () => true,
    async () => true,
  );
  const auth = app.auth as { handler: (request: Request) => Promise<Response> };
  const post = (route: string, body: unknown) =>
    auth.handler(
      new Request(`${ORIGIN}/api/auth${route}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify(body),
      }),
    );
  await post(SEND_SIGN_IN_CODE_PATH, { email, type: "sign-in" });
  const response = await post("/sign-in/email-otp", { email, otp });
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/**
 * The server actions, loaded afresh: each address starts with its own
 * per-user limits, as if asked on another day.
 */
async function freshActions() {
  vi.resetModules();
  return await import("@/app/(app)/settings/account/_lib/email-change-actions");
}

/** Runs an action to its answer, moving the faked clock while it waits. */
async function answer<T>(action: () => Promise<T>): Promise<T> {
  let answered = false;
  const pending = action().finally(() => {
    answered = true;
  });
  while (!answered) {
    await vi.advanceTimersByTimeAsync(50);
    await new Promise((resolve) => setImmediate(resolve));
  }
  return await pending;
}

/** The answer to asking for a code, after which its email (if any) goes. */
async function askForCode(
  actions: Awaited<ReturnType<typeof freshActions>>,
  newEmail: string,
) {
  const result = await answer(() => actions.requestEmailChange({ newEmail }));
  for (const task of app.afterAnswer.splice(0)) await task();
  return result;
}

/**
 * What the user sees at each step: one code asked for, five wrong codes, a
 * new code asked for, and a code typed after it expired. The wrong code is
 * picked once, as one the free address wasn't sent.
 */
let wrong: string | undefined;

async function typeCodesUntilStuck(newEmail: string) {
  const actions = await freshActions();
  const steps: { step: string; result: unknown }[] = [];
  steps.push({
    step: "ask for a code",
    result: await askForCode(actions, newEmail),
  });
  wrong ??= codes.get(NO_ACCOUNT) === "000000" ? "111111" : "000000";
  const code = wrong;
  for (let tried = 1; tried <= 5; tried++) {
    steps.push({
      step: `wrong code #${tried}`,
      result: await answer(() =>
        actions.confirmEmailChange({ newEmail, code }),
      ),
    });
  }
  steps.push({
    step: "ask for a new code",
    result: await askForCode(actions, newEmail),
  });
  await vi.advanceTimersByTimeAsync(CODE_LIFETIME_MS + 1000);
  steps.push({
    step: "a code after it expired",
    result: await answer(() => actions.confirmEmailChange({ newEmail, code })),
  });
  return steps;
}

describe("typing codes for a new address", () => {
  it("answers a taken address and a free one alike at every step", async () => {
    // The free address goes first, so the code typed can be one it wasn't
    // sent; the taken one then gets exactly the same input.
    wrong = undefined;
    const free = await typeCodesUntilStuck(NO_ACCOUNT);
    const taken = await typeCodesUntilStuck(HAS_ACCOUNT);

    expect(taken).toEqual(free);
    // The free address really was sent codes, and the taken one never was.
    expect(codes.has(HAS_ACCOUNT)).toBe(false);
    expect(codes.get(NO_ACCOUNT)).toMatch(/^\d{6}$/);
    // What they both saw.
    const didntWork = {
      ok: false,
      error: EMAIL_CHANGE_MESSAGES.codeDidntWork,
    };
    expect(free.map(({ result }) => result)).toEqual([
      { ok: true },
      didntWork,
      didntWork,
      didntWork,
      didntWork,
      didntWork,
      { ok: true },
      didntWork,
    ]);
    expect(app.errors).toEqual([]);
  });

  it("still changes the email with the code that went out", async () => {
    // The control for the test above: the same answers don't come from
    // every code failing.
    const actions = await freshActions();
    expect(await askForCode(actions, NO_ACCOUNT)).toEqual({ ok: true });
    const code = codes.get(NO_ACCOUNT) as string;
    expect(
      await answer(() =>
        actions.confirmEmailChange({ newEmail: NO_ACCOUNT, code }),
      ),
    ).toEqual({ ok: true });
    expect(db.user.find((row) => row.id === "user_lin")?.email).toBe(
      NO_ACCOUNT,
    );
  });
});
