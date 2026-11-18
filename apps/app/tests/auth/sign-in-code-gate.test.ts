// Asking for an email sign-in code (packages/auth/email-otp.ts). Better Auth
// catches what the sender throws, logs it and answers "sent" anyway, so a
// server that couldn't email the code said "Code sent". signInCodeGate makes
// the endpoint answer what happened: where no code can be delivered, it says
// so before one is made; when sending fails, the failure is the answer. The
// same answer for every address, with an account or without. The
// per-address limit runs before a code is made, so a refused resend leaves
// the last code working. Asking to change the email (the code goes to the
// new address) is refused the same way where no code can be delivered; where
// codes can, a taken address and a free one get the same answer, even when
// sending fails, so the request never says which addresses have accounts.
// Its per-address limit runs before Better Auth looks the address up, and
// the email goes out after the answer, so both do the same work before it.
// Run inside a real Better Auth (memory adapter) with the real emailOTP
// plugin; nothing is emailed.
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  registerEmailChangeCodeSender,
  registerSignInCodeSender,
  SIGN_IN_CODE_NOT_SENT,
  sendVerificationOTP,
  signInCodeGate,
} from "@repo/auth/email-otp";
import {
  EMAIL_CHANGE_UNAVAILABLE,
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
        changeEmail: { enabled: true },
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

// Settings → Account → Email. The app calls this endpoint through auth.api
// from its server actions only (it's off over HTTP in packages/auth/
// server.ts); the plugin's before hooks run for both, so it's asked over
// HTTP here like the rest of this file.
const REQUEST_EMAIL_CHANGE = "/email-otp/request-email-change";
const SIGNED_IN = "lin@qrdx.test";

/** Signs `email` in with an emailed code; the session cookie. */
async function sessionCookie(auth: any, email: string): Promise<string> {
  registerSignInCodeSender(working, () => true, anyAddress);
  expect((await askForCode(auth, email)).status).toBe(200);
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/email-otp`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, otp: delivered.get(email) }),
    }),
  );
  expect(response.status).toBe(200);
  return (response.headers as Headers)
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function askToChangeEmail(auth: any, cookie: string, newEmail: string) {
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth${REQUEST_EMAIL_CHANGE}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        cookie,
      },
      body: JSON.stringify({ newEmail }),
    }),
  );
  const text = await response.text();
  return {
    status: response.status as number,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
  };
}

const changeEmailRows = () =>
  db.verification.filter((row) =>
    String(row.identifier).startsWith("change-email-otp-"),
  );

/**
 * Work the email-change sender leaves for after the answer: Next's after() in
 * the app (settings/account/_lib/email-change-actions.ts), a queue here, so
 * the tests can tell what happened before the answer from what came after.
 */
let afterAnswer: (() => Promise<void>)[] = [];
const later = (task: () => Promise<void>) => {
  afterAnswer.push(task);
};
async function runAfterAnswer() {
  for (const task of afterAnswer.splice(0)) await task();
}

async function changeEmailWith(
  auth: any,
  cookie: string,
  newEmail: string,
  otp: string,
) {
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth/email-otp/change-email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, cookie },
      body: JSON.stringify({ newEmail, otp }),
    }),
  );
  return response.status as number;
}

function addSignedInUser() {
  const now = new Date();
  db.user.push({
    id: "user_lin",
    email: SIGNED_IN,
    name: "Lin",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
}

describe("asking to change the email", () => {
  /** What happened, in order: limit checks, answers and sends. */
  let events: string[];
  /** What the email-change sender was handed, by new address. */
  let toNewAddress: Map<string, string>;
  const sendToNewAddress = async ({
    email,
    otp,
  }: {
    email: string;
    otp: string;
  }) => {
    events.push(`sent ${email}`);
    toNewAddress.set(email, otp);
  };
  /** No limit, but each check is noted. */
  const noteLimit = async (email: string) => {
    events.push(`limit ${email}`);
    return true;
  };
  let cookie: string;

  /** Asks for a code to `newEmail`, and notes when the answer came. */
  async function ask(newEmail: string) {
    const reply = await askToChangeEmail(gated, cookie, newEmail);
    events.push(`answered ${newEmail}`);
    return reply;
  }

  beforeEach(async () => {
    addSignedInUser();
    events = [];
    toNewAddress = new Map();
    afterAnswer = [];
    cookie = await sessionCookie(gated, SIGNED_IN);
  });

  describe("where no code can be delivered", () => {
    it("says email isn't set up, the same for every address, and makes no code", async () => {
      registerEmailChangeCodeSender(
        sendToNewAddress,
        () => false,
        noteLimit,
        later,
      );
      const taken = await ask(HAS_ACCOUNT);
      const free = await ask(NO_ACCOUNT);
      expect(taken.status).toBe(400);
      expect(taken.body).toMatchObject({
        code: EMAIL_CHANGE_UNAVAILABLE,
        message:
          "Email isn't set up on this site, so the address can't be changed here.",
      });
      expect(free).toEqual(taken);
      // Even an address that isn't one: it's answered before the address is
      // looked at.
      expect(await ask("not an address")).toEqual(taken);
      // Nothing counted, nothing made, nothing sent, now or later.
      await runAfterAnswer();
      expect(events).toEqual([
        `answered ${HAS_ACCOUNT}`,
        `answered ${NO_ACCOUNT}`,
        "answered not an address",
      ]);
      expect(changeEmailRows()).toEqual([]);
    });

    it("says the same when the app never registered a sender", async () => {
      registerEmailChangeCodeSender(
        undefined as never,
        () => true,
        anyAddress,
        later,
      );
      const reply = await askToChangeEmail(gated, cookie, NO_ACCOUNT);
      expect(reply.status).toBe(400);
      expect(reply.body?.code).toBe(EMAIL_CHANGE_UNAVAILABLE);
      expect(changeEmailRows()).toEqual([]);
    });

    it("leaves sign-in codes to their own rule", async () => {
      registerEmailChangeCodeSender(
        sendToNewAddress,
        () => false,
        anyAddress,
        later,
      );
      registerSignInCodeSender(working, () => true, anyAddress);
      expect(await askForCode(gated, NO_ACCOUNT)).toEqual({
        status: 200,
        body: { success: true },
      });
    });
  });

  describe("where codes can be delivered", () => {
    // Better Auth sends nothing when the new address already has an account
    // and answers "sent" all the same, so the dialog can't say a code went
    // out: only that one should arrive if no other account uses the address.
    // And the email goes out after the answer, so a free address doesn't
    // take longer to answer than a taken one.
    it("does the same before answering a taken address and a free one; the code goes out after the answer", async () => {
      registerEmailChangeCodeSender(
        sendToNewAddress,
        () => true,
        noteLimit,
        later,
      );
      const taken = await ask(HAS_ACCOUNT);
      const free = await ask(NO_ACCOUNT);
      expect(taken).toEqual({ status: 200, body: { success: true } });
      expect(free).toEqual(taken);
      // Before each answer: the limit, checked once, and nothing sent.
      expect(events).toEqual([
        `limit ${HAS_ACCOUNT}`,
        `answered ${HAS_ACCOUNT}`,
        `limit ${NO_ACCOUNT}`,
        `answered ${NO_ACCOUNT}`,
      ]);
      await runAfterAnswer();
      expect(events.slice(4)).toEqual([`sent ${NO_ACCOUNT}`]);
      expect(toNewAddress.get(NO_ACCOUNT)).toMatch(/^\d{6}$/);
    });

    it("answers alike when the limit can't be checked, and makes no code", async () => {
      registerEmailChangeCodeSender(
        sendToNewAddress,
        () => true,
        async () => {
          throw new Error("Upstash is down");
        },
        later,
      );
      const taken = await ask(HAS_ACCOUNT);
      const free = await ask(NO_ACCOUNT);
      expect(taken.status).toBe(500);
      expect(taken.body?.code).toBe("EMAIL_CHANGE_CODE_NOT_SENT");
      expect(free).toEqual(taken);
      expect(changeEmailRows()).toEqual([]);
      await runAfterAnswer();
      expect(toNewAddress.size).toBe(0);
    });

    it("answers alike when sending fails, and logs it after the answer without the address or code", async () => {
      registerEmailChangeCodeSender(
        async () => {
          throw new Error("Resend is down");
        },
        () => true,
        anyAddress,
        later,
      );
      const failures = () =>
        vi
          .mocked(console.error)
          .mock.calls.map((call) => String(call[0]))
          .filter((line) => line.includes("auth.email_otp.failed"));
      const taken = await ask(HAS_ACCOUNT);
      const free = await ask(NO_ACCOUNT);
      expect(free).toEqual(taken);
      expect(JSON.stringify(free.body)).not.toMatch(/Resend|\d{6}/);
      // Nothing was tried before the answer.
      expect(failures()).toEqual([]);
      await runAfterAnswer();
      expect(failures()).toHaveLength(1);
      expect(failures()[0]).not.toContain(NO_ACCOUNT);
      expect(failures()[0]).not.toMatch(/\d{6}/);
    });
  });
});

describe("the per-address limit on a new address", () => {
  // The app's sender and limit, registered as settings/account/_lib/
  // email-change-actions.ts registers them. In tests the sender writes the
  // code to the console (lib/auth/sign-in-code-delivery.ts), which is where
  // it's read from.
  let codes: Map<string, string>;
  let cookie: string;

  beforeEach(async () => {
    addSignedInUser();
    afterAnswer = [];
    cookie = await sessionCookie(gated, SIGNED_IN);
    // Fresh limiters: they live in the module.
    vi.resetModules();
    const { sendEmailChangeCode, emailChangeCodeAllowed } = await import(
      "@/lib/auth/email-change-code"
    );
    registerEmailChangeCodeSender(
      sendEmailChangeCode,
      () => true,
      emailChangeCodeAllowed,
      later,
    );
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

  async function askFiveTimes(email: string) {
    for (let asked = 1; asked <= 5; asked++) {
      expect(
        await askToChangeEmail(gated, cookie, email),
        `${email} #${asked}`,
      ).toEqual({ status: 200, body: { success: true } });
      await runAfterAnswer();
      await tick();
    }
  }

  it("refuses the 6th code in 15 minutes with the same 429, taken or free, before a code is made", async () => {
    const refusals: unknown[] = [];
    for (const email of [HAS_ACCOUNT, NO_ACCOUNT]) {
      await askFiveTimes(email);
      const rowsBefore = structuredClone(changeEmailRows());
      const sixth = await askToChangeEmail(gated, cookie, email);
      expect(sixth.status, email).toBe(429);
      expect(sixth.body?.code, email).toBe("EMAIL_CHANGE_CODE_RATE_LIMITED");
      refusals.push(sixth);
      // No code made, none to send.
      expect(changeEmailRows(), email).toEqual(rowsBefore);
      expect(afterAnswer, email).toEqual([]);
    }
    expect(refusals[0]).toEqual(refusals[1]);
    // The taken address never got a code; the free one did.
    expect(codes.has(HAS_ACCOUNT)).toBe(false);
    expect(codes.get(NO_ACCOUNT)).toMatch(/^\d{6}$/);
  });

  it("leaves the 5th code to a free address working after the 6th is refused", async () => {
    await askFiveTimes(NO_ACCOUNT);
    const fifth = codes.get(NO_ACCOUNT) as string;
    expect(fifth).toMatch(/^\d{6}$/);
    const sixth = await askToChangeEmail(gated, cookie, NO_ACCOUNT);
    await runAfterAnswer();
    const confirmed = await changeEmailWith(gated, cookie, NO_ACCOUNT, fifth);
    expect({ sixth: sixth.status, fifthCode: confirmed }).toEqual({
      sixth: 429,
      fifthCode: 200,
    });
    expect(db.user.find((row) => row.id === "user_lin")?.email).toBe(
      NO_ACCOUNT,
    );
  });

  it("counts each request once, taken or free", async () => {
    for (const email of [HAS_ACCOUNT, NO_ACCOUNT]) {
      limits.checks.clear();
      expect((await askToChangeEmail(gated, cookie, email)).status).toBe(200);
      await runAfterAnswer();
      expect(Object.fromEntries(limits.checks), email).toEqual({
        "qrdx:email-change-code": 1,
        "qrdx:email-change-code-day": 1,
      });
    }
  });
});
