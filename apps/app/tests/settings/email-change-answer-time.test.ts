// Settings → Account → Email (settings/account/_lib/email-change-actions.ts).
// Better Auth does a little more database work for one kind of address than
// the other: asking for a code to an address that already has an account
// also deletes the code it just stored, and a wrong code for a free address
// writes the code back with one more try counted. So both actions answer no
// sooner than EMAIL_CHANGE_ANSWER_MS after they start, whatever the outcome,
// and that work can't be timed. Here Better Auth is a fake that answers each
// kind of address after a different (faked) time, and every answer must
// still come at the minimum, not a moment before. The real answers are
// tests/settings/email-change-answers.test.ts.
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  EMAIL_CHANGE_ANSWER_MS,
  EMAIL_CHANGE_MESSAGES,
} from "@/lib/account/email-change";

const SIGNED_IN = "lin@qrdx.test";
const HAS_ACCOUNT = "ada@qrdx.test";
const NO_ACCOUNT = "grace@qrdx.test";
const CONFIRMATION_REQUIRED = { ok: false, error: "CONFIRMATION_REQUIRED" };

type Api = (newEmail: string) => Promise<unknown>;

const app = vi.hoisted(() => ({
  signedIn: true,
  confirmation: null as unknown,
  sso: false,
  /** Limiters (by prefix) that say no. */
  limited: new Set<string>(),
  request: (async () => ({ success: true })) as Api,
  confirm: (async () => ({ success: true })) as Api,
}));

vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      requestEmailChangeEmailOTP: ({ body }: { body: { newEmail: string } }) =>
        app.request(body.newEmail),
      changeEmailEmailOTP: ({ body }: { body: { newEmail: string } }) =>
        app.confirm(body.newEmail),
    },
  },
}));
vi.mock("@/lib/account/confirmation-server", () => ({
  currentSession: async () =>
    app.signedIn
      ? {
          userId: "user_lin",
          email: "lin@qrdx.test",
          sessionId: "session_lin",
          sessionCreatedAt: new Date(),
          requestHeaders: new Headers(),
          held: false,
        }
      : null,
  requireRecentConfirmation: async () => app.confirmation,
}));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: ({ prefix }: { prefix: string }) => ({
    limit: async () => ({ success: !app.limited.has(prefix) }),
  }),
  slidingWindow: () => ({}),
}));
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: (feature: string) =>
    feature === "emailSignIn" || (feature === "sso" && app.sso),
}));
vi.mock("@repo/auth/sso-required", () => ({
  emailChangeSsoProblem: async () => ({ kind: "onto", domain: "qrdx.test" }),
}));
vi.mock("@repo/database", () => ({
  database: { delete: () => ({ where: async () => undefined }) },
  session: { id: {}, userId: {} },
}));
// The rest of the module's imports, which this doesn't reach.
vi.mock("@repo/auth/email-otp", () => ({
  registerEmailChangeCodeSender: () => undefined,
}));
vi.mock("@/lib/auth/email-change-code", () => ({
  sendEmailChangeCode: async () => undefined,
  emailChangeCodeAllowed: async () => true,
}));
vi.mock("next/server", () => ({ after: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/account/email-change-server", () => ({
  afterEmailChanged: async () => undefined,
}));
vi.mock("@/lib/shared", () => ({ logError: () => undefined }));

let actions: typeof import("@/app/(app)/settings/account/_lib/email-change-actions");

beforeAll(async () => {
  actions = await import(
    "@/app/(app)/settings/account/_lib/email-change-actions"
  );
});

beforeEach(() => {
  vi.useFakeTimers();
  app.request = async () => ({ success: true });
  app.confirm = async () => ({ success: true });
  app.signedIn = true;
  app.confirmation = null;
  app.sso = false;
  app.limited = new Set();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Better Auth's database work, in faked time. */
const work = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** An APIError as auth.api throws it. */
const apiError = (
  statusCode: number,
  body: { code?: string; message?: string },
) =>
  Object.assign(new Error(body.message ?? body.code), {
    name: "APIError",
    statusCode,
    body,
  });

/** Answers after `ms` with what `then` gives, or what it throws. */
const takes =
  (ms: number, then: () => unknown): (() => Promise<unknown>) =>
  async () => {
    await work(ms);
    return then();
  };

/** Better Auth's answer for each kind of address, after its own time. */
function byAddress(
  taken: () => Promise<unknown>,
  free: () => Promise<unknown>,
): Api {
  return (newEmail) => (newEmail === HAS_ACCOUNT ? taken() : free());
}

const fails = (error: Error) => () => {
  throw error;
};
const sent = () => ({ success: true });

interface Case {
  name: string;
  setup?: () => void;
  /** The action's input for an address; by default the address alone. */
  input?: (newEmail: string) => unknown;
  /** Only a free address can get here (a code that works). */
  freeOnly?: boolean;
  expected: unknown;
}

/** When each address got its answer, and the answers. */
async function answerTimes(
  run: (input: unknown) => Promise<unknown>,
  { input = (newEmail) => ({ newEmail }), freeOnly }: Case,
) {
  const answers: { address: string; early: boolean; at?: number }[] = [];
  const results: unknown[] = [];
  for (const address of freeOnly ? [NO_ACCOUNT] : [HAS_ACCOUNT, NO_ACCOUNT]) {
    const started = Date.now();
    let at: number | undefined;
    const pending = run(input(address)).then((result) => {
      at = Date.now() - started;
      return result;
    });
    await vi.advanceTimersByTimeAsync(EMAIL_CHANGE_ANSWER_MS - 1);
    const early = at !== undefined;
    await vi.advanceTimersByTimeAsync(1);
    answers.push({ address, early, at });
    results.push(await pending);
  }
  return { answers, results };
}

// Outcomes that don't depend on the address at all; asked anyway.
const sameForEveryAddress = (code?: string): Case[] => [
  {
    name: "signed out",
    setup: () => {
      app.signedIn = false;
    },
    input: (newEmail) => ({ newEmail, code }),
    expected: { ok: false, error: EMAIL_CHANGE_MESSAGES.signedOut },
  },
  {
    name: "the address is already theirs",
    input: () => ({ newEmail: SIGNED_IN, code }),
    expected: { ok: false, error: EMAIL_CHANGE_MESSAGES.sameEmail },
  },
  {
    name: "the company requires single sign-on",
    setup: () => {
      app.sso = true;
    },
    input: (newEmail) => ({ newEmail, code }),
    expected: {
      ok: false,
      error:
        "Your company requires single sign-on for qrdx.test. To use an address there, sign in with SSO instead.",
    },
  },
  {
    name: '"Confirm it\'s you" is needed',
    setup: () => {
      app.confirmation = CONFIRMATION_REQUIRED;
    },
    input: (newEmail) => ({ newEmail, code }),
    expected: CONFIRMATION_REQUIRED,
  },
];

const requestCases: Case[] = [
  {
    name: "a code is asked for",
    setup: () => {
      // A taken address also has its new code deleted.
      app.request = byAddress(takes(45, sent), takes(30, sent));
    },
    expected: { ok: true },
  },
  {
    name: "not an address",
    input: () => ({ newEmail: "not an address" }),
    expected: { ok: false, error: EMAIL_CHANGE_MESSAGES.invalidEmail },
  },
  ...sameForEveryAddress(),
  {
    name: "too many tries from this user",
    setup: () => {
      app.limited.add("qrdx:email-change-request");
    },
    expected: { ok: false, error: EMAIL_CHANGE_MESSAGES.rateLimited },
  },
  {
    name: "email isn't set up here",
    setup: () => {
      const unavailable = apiError(400, { code: "EMAIL_CHANGE_UNAVAILABLE" });
      app.request = takes(5, fails(unavailable));
    },
    expected: { ok: false, error: EMAIL_CHANGE_MESSAGES.unavailable },
  },
  {
    name: "too many codes for the new address",
    setup: () => {
      const limited = apiError(429, {
        code: "EMAIL_CHANGE_CODE_RATE_LIMITED",
      });
      app.request = takes(10, fails(limited));
    },
    expected: { ok: false, error: EMAIL_CHANGE_MESSAGES.codeRateLimited },
  },
  {
    name: "the limit can't be checked",
    setup: () => {
      const notSent = apiError(500, { code: "EMAIL_CHANGE_CODE_NOT_SENT" });
      app.request = takes(10, fails(notSent));
    },
    expected: { ok: false, error: EMAIL_CHANGE_MESSAGES.notSent },
  },
  {
    name: "something unexpected",
    setup: () => {
      app.request = takes(20, fails(new Error("database is down")));
    },
    expected: { ok: false, error: EMAIL_CHANGE_MESSAGES.failed },
  },
];

const WRONG = "000000";
const RIGHT = "123456";
const withCode =
  (code: string) =>
  (newEmail: string): unknown => ({ newEmail, code });
const didntWork = { ok: false, error: EMAIL_CHANGE_MESSAGES.codeDidntWork };

const confirmCases: Case[] = [
  {
    name: "the email changes",
    setup: () => {
      app.confirm = takes(60, sent);
    },
    input: withCode(RIGHT),
    freeOnly: true,
    expected: { ok: true },
  },
  {
    name: "a wrong code",
    setup: () => {
      // A free address's code is written back with the try counted.
      const wrong = apiError(400, { code: "INVALID_OTP" });
      app.confirm = byAddress(takes(20, fails(wrong)), takes(35, fails(wrong)));
    },
    input: withCode(WRONG),
    expected: didntWork,
  },
  {
    name: "a 4th wrong code",
    setup: () => {
      app.confirm = byAddress(
        takes(20, fails(apiError(400, { code: "INVALID_OTP" }))),
        takes(20, fails(apiError(403, { code: "TOO_MANY_ATTEMPTS" }))),
      );
    },
    input: withCode(WRONG),
    expected: didntWork,
  },
  {
    name: "an expired code",
    setup: () => {
      app.confirm = byAddress(
        takes(20, fails(apiError(400, { code: "INVALID_OTP" }))),
        takes(30, fails(apiError(400, { code: "OTP_EXPIRED" }))),
      );
    },
    input: withCode(WRONG),
    expected: didntWork,
  },
  {
    name: "another account took the address after the code was sent",
    setup: () => {
      const inUse = apiError(400, { message: "Email already in use" });
      app.confirm = takes(40, fails(inUse));
    },
    input: withCode(RIGHT),
    freeOnly: true,
    expected: {
      ok: false,
      error: EMAIL_CHANGE_MESSAGES.taken,
      reason: "code-dead",
    },
  },
  {
    name: "not a 6-digit code",
    input: withCode("12345"),
    expected: { ok: false, error: EMAIL_CHANGE_MESSAGES.invalidCode },
  },
  ...sameForEveryAddress(WRONG),
  {
    name: "too many tries from this user",
    setup: () => {
      app.limited.add("qrdx:email-change-confirm");
    },
    input: withCode(WRONG),
    expected: { ok: false, error: EMAIL_CHANGE_MESSAGES.rateLimited },
  },
  {
    name: "something unexpected",
    setup: () => {
      app.confirm = takes(20, fails(new Error("database is down")));
    },
    input: withCode(WRONG),
    expected: { ok: false, error: EMAIL_CHANGE_MESSAGES.failed },
  },
];

describe("how soon the email-change actions answer", () => {
  it.each(requestCases)("asking for a code: $name", async (testCase) => {
    testCase.setup?.();
    const { answers, results } = await answerTimes(
      (input) => actions.requestEmailChange(input),
      testCase,
    );
    for (const answer of answers) {
      expect(answer).toEqual({
        address: answer.address,
        early: false,
        at: EMAIL_CHANGE_ANSWER_MS,
      });
    }
    for (const result of results) expect(result).toEqual(testCase.expected);
  });

  it.each(confirmCases)("entering the code: $name", async (testCase) => {
    testCase.setup?.();
    const { answers, results } = await answerTimes(
      (input) => actions.confirmEmailChange(input),
      testCase,
    );
    for (const answer of answers) {
      expect(answer).toEqual({
        address: answer.address,
        early: false,
        at: EMAIL_CHANGE_ANSWER_MS,
      });
    }
    for (const result of results) expect(result).toEqual(testCase.expected);
  });
});
