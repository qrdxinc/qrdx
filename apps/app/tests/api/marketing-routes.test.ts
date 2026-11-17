// The same-origin routes the pricing page, the enterprise form and the bulk
// tool call instead of server actions (lib/widget-routes), so another zone
// on this origin (the marketing site on qrdx.dev) can render them:
// POST /api/subscription/checkout, /api/invoice-requests,
// /api/nonprofit-requests, /api/enterprise-requests and GET /api/themes,
// plus the plan GET /api/subscription now answers with.
//
// They're cookie-authenticated, so only this origin may call them (Origin
// and Sec-Fetch-Site), with JSON bodies, and they send no CORS headers. Past
// those checks each runs its server action for real, so a signed-out
// visitor, a rate limit or bad input gets exactly what the action answers.
// Polar, email, Turnstile, the session and the rate limiter are faked;
// nothing is created or sent.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID = "prod_pro_month";
  process.env.NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID = "prod_pro_year";
  return {
    /** What next/headers answers: the current route request's headers. */
    requestHeaders: new Headers(),
    user: null as null | { id: string; email: string },
    subscription: null as null | { productId: string },
    limited: false,
    limitKeys: [] as string[],
    features: {} as Record<string, boolean>,
    checkouts: [] as Record<string, unknown>[],
    polarFails: false,
    emails: [] as { to: unknown; subject: string }[],
    sendResult: { sent: true, id: "em_1" } as
      | { sent: true; id: string }
      | { sent: false; reason: "failed" },
    turnstile: true,
    turnstileTokens: [] as unknown[],
    themes: [] as unknown[],
    themesFail: false,
    requestsUsed: 3,
  };
});

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock(
  "@repo/database/schema",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () =>
        state.user ? { user: state.user, session: {} } : null,
    },
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => state.requestHeaders,
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}));
vi.mock("@/lib/polar", () => ({
  isBillingConfigured: true,
  BILLING_NOT_CONFIGURED_MESSAGE: "Billing is not configured",
  polar: {
    checkouts: {
      create: async (body: Record<string, unknown>) => {
        if (state.polarFails) throw new Error("Polar is down");
        state.checkouts.push(body);
        return { url: "https://checkout.example/session" };
      },
    },
  },
}));
vi.mock("@/actions/customer", () => ({
  getOrCreateCustomer: async () => ({ id: "cus_1" }),
}));
vi.mock("@/lib/analytics/server", () => ({
  hasAnalyticsConsent: async () => false,
}));
vi.mock("@/lib/subscription", () => ({
  getMyActiveSubscription: async () => state.subscription,
  validateSubscriptionAndUsage: async () => ({
    canProceed: true,
    isSubscribed: Boolean(state.subscription),
    requestsUsed: state.requestsUsed,
    requestsRemaining: state.subscription ? 0 : 7,
  }),
}));
vi.mock("@/lib/shared", async () => {
  const { UnauthorizedError } = await import("@/types/errors");
  return {
    logError: () => {},
    getCurrentUser: async () => {
      if (!state.user) throw new UnauthorizedError();
      return state.user;
    },
    getCurrentUserId: async () => {
      if (!state.user) throw new UnauthorizedError();
      return state.user.id;
    },
  };
});
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async (key: string) => {
      state.limitKeys.push(key);
      return {
        success: !state.limited,
        limit: 3,
        remaining: 0,
        reset: Date.now() + 60_000,
        pending: Promise.resolve(),
      };
    },
  }),
}));
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: (id: string) => Boolean(state.features[id]),
}));
vi.mock("@/lib/email/send", () => ({
  isEmailConfigured: true,
  sendEmail: async (message: { to: unknown; subject: string }) => {
    state.emails.push({ to: message.to, subject: message.subject });
    return state.sendResult;
  },
}));
vi.mock("@/lib/scope", () => ({
  getActiveWorkspace: async () => ({
    workspace: { name: "North Agency", slug: "north" },
  }),
}));
vi.mock("@/lib/safety/turnstile", () => ({
  TURNSTILE_FIELD: "cf-turnstile-response",
  verifyTurnstile: async (token: unknown) => {
    state.turnstileTokens.push(token);
    return state.turnstile;
  },
}));
vi.mock("@/actions/qr-themes", () => ({
  getThemes: async () => {
    if (state.themesFail) throw new Error("database down");
    return state.user ? state.themes : [];
  },
}));

const checkoutRoute = await import("@/app/api/subscription/checkout/route");
const invoiceRoute = await import("@/app/api/invoice-requests/route");
const nonprofitRoute = await import("@/app/api/nonprofit-requests/route");
const enterpriseRoute = await import("@/app/api/enterprise-requests/route");
const themesRoute = await import("@/app/api/themes/route");
const subscriptionRoute = await import("@/app/api/subscription/route");
const { FORM_BODY_BYTES } = await import("@/lib/widget-routes/server");

const ORIGIN = "http://localhost:3000";
const SAME_ORIGIN = {
  host: "localhost:3000",
  origin: ORIGIN,
  "sec-fetch-site": "same-origin",
  "content-type": "application/json",
};

beforeEach(() => {
  fakeDb.resetAll();
  state.requestHeaders = new Headers();
  state.user = null;
  state.subscription = null;
  state.limited = false;
  state.limitKeys = [];
  state.features = {
    invoiceRequests: true,
    nonprofitDiscounts: true,
    enterpriseRequests: true,
  };
  state.checkouts = [];
  state.polarFails = false;
  state.emails = [];
  state.sendResult = { sent: true, id: "em_1" };
  state.turnstile = true;
  state.turnstileTokens = [];
  state.themes = [];
  state.themesFail = false;
});

/** A request, whose headers next/headers then answers with (as in a route). */
function request(
  method: string,
  path: string,
  {
    body,
    rawBody,
    headers = SAME_ORIGIN,
  }: {
    body?: unknown;
    rawBody?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const req = new Request(new URL(path, ORIGIN), {
    method,
    headers,
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  state.requestHeaders = new Headers(req.headers);
  return req;
}

const signIn = () => {
  state.user = { id: "u_ana", email: "ana@north.example" };
};

const checkout = (body: unknown, headers?: Record<string, string>) =>
  checkoutRoute.POST(
    request("POST", "/api/subscription/checkout", { body, headers }),
  );

const INVOICE = {
  company: "North Agency Ltd",
  billingEmail: "accounts@north.example",
  country: "Germany",
  taxId: "DE123456789",
  address: "Hauptstr. 1\n10115 Berlin",
  notes: "PO 4471",
};
const invoice = (body: unknown, headers?: Record<string, string>) =>
  invoiceRoute.POST(
    request("POST", "/api/invoice-requests", { body, headers }),
  );

const NONPROFIT = {
  organization: "Harbour Food Trust",
  country: "Ireland",
  registration: "CHY 20012345",
  contactEmail: "hello@harbour.example",
  plan: "business",
};
const nonprofit = (body: unknown, headers?: Record<string, string>) =>
  nonprofitRoute.POST(
    request("POST", "/api/nonprofit-requests", { body, headers }),
  );

const ENTERPRISE = {
  name: "Mei Tanaka",
  email: "mei@north.example",
  company: "North Foods KK",
  teamSize: "201-1000",
  need: "Single sign-on for 400 people and a yearly invoice in yen.",
  locale: "ja",
  "cf-turnstile-response": "token-1",
};
const enterprise = (body: unknown, headers?: Record<string, string>) =>
  enterpriseRoute.POST(
    request("POST", "/api/enterprise-requests", { body, headers }),
  );

const themes = (headers: Record<string, string>) =>
  themesRoute.GET(request("GET", "/api/themes", { headers }));

const json = async (response: Response) =>
  (await response.json()) as Record<string, unknown>;

/** Nothing reached Polar, an inbox or Turnstile. */
const nothingRan = () => {
  expect(state.checkouts).toEqual([]);
  expect(state.emails).toEqual([]);
  expect(state.turnstileTokens).toEqual([]);
};

describe("only this origin may call the POST routes", () => {
  const calls: [
    string,
    (headers: Record<string, string>) => Promise<Response>,
    /** The refusal, in the route's own result shape */
    (message: string, code: string) => unknown,
  ][] = [
    [
      "POST /api/subscription/checkout",
      (headers) => checkout({ plan: "pro", interval: "year" }, headers),
      (message) => ({ error: message }),
    ],
    [
      "POST /api/invoice-requests",
      (headers) => invoice(INVOICE, headers),
      (message, code) => ({ ok: false, code, error: message }),
    ],
    [
      "POST /api/nonprofit-requests",
      (headers) => nonprofit(NONPROFIT, headers),
      (message, code) => ({ ok: false, code, error: message }),
    ],
    [
      "POST /api/enterprise-requests",
      (headers) => enterprise(ENTERPRISE, headers),
      () => ({ status: "error", code: "unknown" }),
    ],
  ];

  const REFUSED: [string, Record<string, string>][] = [
    [
      "another site's Origin",
      { ...SAME_ORIGIN, origin: "https://evil.example" },
    ],
    [
      "a subdomain's Origin",
      { ...SAME_ORIGIN, origin: "https://evil.localhost:3000" },
    ],
    ['Origin "null"', { ...SAME_ORIGIN, origin: "null" }],
    [
      "no Origin",
      {
        host: SAME_ORIGIN.host,
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
      },
    ],
    [
      "Sec-Fetch-Site: cross-site",
      { ...SAME_ORIGIN, "sec-fetch-site": "cross-site" },
    ],
    [
      "Sec-Fetch-Site: same-site",
      { ...SAME_ORIGIN, "sec-fetch-site": "same-site" },
    ],
    ["Sec-Fetch-Site: none", { ...SAME_ORIGIN, "sec-fetch-site": "none" }],
  ];

  for (const [route, call, refusal] of calls) {
    for (const [what, headers] of REFUSED) {
      it(`${route} refuses ${what} with 403, signed in, and runs nothing`, async () => {
        signIn();
        const response = await call(headers);
        expect(response.status).toBe(403);
        expect(await json(response)).toEqual(
          refusal("Cross-origin request rejected.", "FORBIDDEN"),
        );
        nothingRan();
      });
    }

    it(`${route} takes JSON only`, async () => {
      signIn();
      for (const type of [
        "text/plain",
        "text/plain; charset=application/json",
        "application/x-www-form-urlencoded",
        "multipart/form-data; boundary=x",
      ]) {
        const response = await call({ ...SAME_ORIGIN, "content-type": type });
        expect(response.status, type).toBe(415);
        expect(await json(response), type).toEqual(
          refusal(
            "Send a JSON body with Content-Type: application/json.",
            "VALIDATION_ERROR",
          ),
        );
      }
      nothingRan();
    });

    it(`${route} sends no CORS headers and no-store`, async () => {
      signIn();
      for (const headers of [SAME_ORIGIN, REFUSED[0][1]]) {
        const response = await call(headers);
        for (const name of response.headers.keys()) {
          expect(name.startsWith("access-control-")).toBe(false);
        }
        expect(response.headers.get("cache-control")).toBe("no-store");
      }
    });
  }

  it("caps the form routes' bodies at 64 KB (413), before any action runs", async () => {
    signIn();
    expect(FORM_BODY_BYTES).toBe(64 * 1024);
    // Just over 64 KB, far under the generators' 2 MB.
    const big = JSON.stringify({ notes: "x".repeat(64 * 1024) });
    for (const [path, route] of [
      ["/api/subscription/checkout", checkoutRoute],
      ["/api/invoice-requests", invoiceRoute],
      ["/api/nonprofit-requests", nonprofitRoute],
      ["/api/enterprise-requests", enterpriseRoute],
    ] as const) {
      const response = await route.POST(
        request("POST", path, { rawBody: big }),
      );
      expect(response.status, path).toBe(413);
    }
    nothingRan();
  });

  it("refuses a body that isn't a JSON object", async () => {
    signIn();
    for (const rawBody of ["[1,2]", '"pro"', "null", "{nope"]) {
      const response = await checkoutRoute.POST(
        request("POST", "/api/subscription/checkout", { rawBody }),
      );
      expect(response.status, rawBody).toBe(400);
      expect(typeof (await json(response)).error, rawBody).toBe("string");
    }
    nothingRan();
  });

  it("allows a browser that sends no Sec-Fetch-Site when Origin is this app", async () => {
    signIn();
    const { "sec-fetch-site": _, ...older } = SAME_ORIGIN;
    expect(
      (await checkout({ plan: "pro", interval: "year" }, older)).status,
    ).toBe(200);
  });
});

describe("POST /api/subscription/checkout (the paid plan buttons)", () => {
  it("signed out: the action's sign_in, as a 401, and no checkout", async () => {
    const response = await checkout({ plan: "pro", interval: "year" });
    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({
      error: "Sign in to upgrade.",
      reason: "sign_in",
    });
    expect(state.checkouts).toEqual([]);
  });

  it("signed in: Polar's URL, charged in the currency of this request's country, for its IP", async () => {
    signIn();
    const response = await checkout(
      { plan: "pro", interval: "year" },
      {
        ...SAME_ORIGIN,
        "x-vercel-ip-country": "IN",
        "x-real-ip": "203.0.113.7",
        // The display switch never picks what checkout charges.
        cookie: "qrdx_currency=usd",
      },
    );
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      url: "https://checkout.example/session",
    });
    expect(state.checkouts).toHaveLength(1);
    expect(state.checkouts[0]).toMatchObject({
      products: ["prod_pro_year"],
      customer_id: "cus_1",
      customer_ip_address: "203.0.113.7",
      currency: "inr",
      metadata: { plan: "pro", interval: "year" },
    });
    expect(state.limitKeys).toEqual(["checkout:u_ana"]);
  });

  it("each refusal keeps the action's words, with a status that matches", async () => {
    signIn();
    const cases: [unknown, () => void, number, string | undefined][] = [
      [{ plan: "enterprise", interval: "year" }, () => {}, 400, "invalid"],
      [
        { plan: "pro", interval: "year" },
        () => {
          state.subscription = { productId: "prod_pro_year" };
        },
        409,
        "subscribed",
      ],
      [
        { plan: "pro", interval: "year" },
        () => {
          state.limited = true;
        },
        429,
        "rate_limited",
      ],
      // No Business product here: the action's "unavailable".
      [{ plan: "business", interval: "year" }, () => {}, 503, "unavailable"],
      [
        { plan: "pro", interval: "month" },
        () => {
          state.polarFails = true;
        },
        500,
        "failed",
      ],
    ];
    for (const [body, arrange, status, reason] of cases) {
      state.subscription = null;
      state.limited = false;
      state.polarFails = false;
      arrange();
      const response = await checkout(body);
      const answer = await json(response);
      expect(response.status, reason).toBe(status);
      expect(answer.reason, reason).toBe(reason);
      expect(typeof answer.error, reason).toBe("string");
    }
    expect(state.checkouts).toEqual([]);
  });
});

describe("POST /api/invoice-requests and /api/nonprofit-requests", () => {
  it("signed out: the action's UNAUTHORIZED, as a 401, and no email", async () => {
    for (const call of [() => invoice(INVOICE), () => nonprofit(NONPROFIT)]) {
      const response = await call();
      expect(response.status).toBe(401);
      expect(await json(response)).toMatchObject({
        ok: false,
        code: "UNAUTHORIZED",
      });
    }
    expect(state.emails).toEqual([]);
  });

  it("signed in: each emails QRdx once and answers { ok: true }", async () => {
    signIn();
    const sent = await invoice(INVOICE);
    expect(sent.status).toBe(200);
    expect(await json(sent)).toEqual({ ok: true });
    const asked = await nonprofit(NONPROFIT);
    expect(asked.status).toBe(200);
    expect(await json(asked)).toEqual({ ok: true });
    expect(state.emails).toHaveLength(2);
    expect(state.emails[0]?.subject).toMatch(/North Agency Ltd/);
    expect(state.emails[1]?.subject).toMatch(/Harbour Food Trust/);
    expect(state.limitKeys).toEqual([
      "invoice-request:user:u_ana",
      "nonprofit-request:user:u_ana",
    ]);
  });

  it("bad input, a rate limit, an unoffered feature and a failed send each keep their status", async () => {
    signIn();
    const bad = await invoice({ ...INVOICE, billingEmail: "nope" });
    expect(bad.status).toBe(400);
    expect(await json(bad)).toMatchObject({ code: "VALIDATION_ERROR" });

    state.limited = true;
    const limited = await nonprofit(NONPROFIT);
    expect(limited.status).toBe(429);
    expect(await json(limited)).toMatchObject({ code: "RATE_LIMITED" });
    state.limited = false;

    state.features.invoiceRequests = false;
    const off = await invoice(INVOICE);
    expect(off.status).toBe(503);
    expect(await json(off)).toMatchObject({ code: "UNAVAILABLE" });

    state.sendResult = { sent: false, reason: "failed" };
    const failed = await nonprofit(NONPROFIT);
    expect(failed.status).toBe(502);
    expect(await json(failed)).toMatchObject({ code: "NOT_SENT" });
  });
});

describe("POST /api/enterprise-requests (the contact form)", () => {
  it("sends the form's fields to the action as form data, from this request's address", async () => {
    const response = await enterprise(ENTERPRISE, {
      ...SAME_ORIGIN,
      "x-forwarded-for": "203.0.113.9",
    });
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      status: "sent",
      email: "mei@north.example",
    });
    expect(state.emails).toHaveLength(1);
    expect(state.turnstileTokens).toEqual(["token-1"]);
    expect(state.limitKeys).toEqual([
      "enterprise-request:ip:203.0.113.9",
      "enterprise-request:day:ip:203.0.113.9",
    ]);
  });

  it("answers a filled honeypot as sent, and sends nothing", async () => {
    const response = await enterprise({
      ...ENTERPRISE,
      website: "spam.example",
    });
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      status: "sent",
      email: "mei@north.example",
    });
    expect(state.emails).toEqual([]);
  });

  it("keeps the action's errors, with matching statuses", async () => {
    const invalid = await enterprise({ ...ENTERPRISE, email: "nope" });
    expect(invalid.status).toBe(400);
    expect(await json(invalid)).toEqual({
      status: "error",
      code: "invalid",
      field: "email",
    });

    // Only strings are form fields: a number is a missing field.
    const notText = await enterprise({ ...ENTERPRISE, need: 42 });
    expect(notText.status).toBe(400);
    expect(await json(notText)).toMatchObject({
      code: "invalid",
      field: "need",
    });

    state.turnstile = false;
    const check = await enterprise(ENTERPRISE);
    expect(check.status).toBe(403);
    expect(await json(check)).toEqual({ status: "error", code: "check" });
    state.turnstile = true;

    state.limited = true;
    const limited = await enterprise(ENTERPRISE);
    expect(limited.status).toBe(429);
    expect(await json(limited)).toEqual({
      status: "error",
      code: "rateLimited",
    });
    expect(state.emails).toEqual([]);
  });
});

describe("GET /api/themes (the bulk tool's saved themes)", () => {
  const SAVED = [{ id: "th_1", name: "Brand", style: { fgColor: "#111111" } }];

  it("answers a same-origin fetch with the signed-in visitor's themes", async () => {
    signIn();
    state.themes = SAVED;
    // A browser's same-origin GET: Sec-Fetch-Site, no Origin.
    const response = await themes({
      host: SAME_ORIGIN.host,
      "sec-fetch-site": "same-origin",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(SAVED);
    expect(response.headers.get("cache-control")).toBe("no-store");
    for (const name of response.headers.keys()) {
      expect(name.startsWith("access-control-")).toBe(false);
    }
  });

  it("answers [] when signed out", async () => {
    state.themes = SAVED;
    const response = await themes({
      host: SAME_ORIGIN.host,
      "sec-fetch-site": "same-origin",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("refuses another site's page, with or without an Origin", async () => {
    signIn();
    state.themes = SAVED;
    const refused: Record<string, string>[] = [
      { host: SAME_ORIGIN.host, "sec-fetch-site": "cross-site" },
      { host: SAME_ORIGIN.host, "sec-fetch-site": "same-site" },
      { host: SAME_ORIGIN.host, "sec-fetch-site": "none" },
      { host: SAME_ORIGIN.host, origin: "https://evil.example" },
      {
        host: SAME_ORIGIN.host,
        origin: "https://evil.example",
        "sec-fetch-site": "same-origin",
      },
    ];
    for (const headers of refused) {
      const response = await themes(headers);
      expect(response.status, JSON.stringify(headers)).toBe(403);
      expect(await json(response)).toEqual({
        success: false,
        error: { code: "FORBIDDEN", message: "Cross-origin request rejected." },
      });
    }
  });

  it("lets a client that sends neither header through, and this app's Origin", async () => {
    signIn();
    state.themes = SAVED;
    expect((await themes({ host: SAME_ORIGIN.host })).status).toBe(200);
    expect(
      (
        await themes({
          host: SAME_ORIGIN.host,
          origin: ORIGIN,
          "sec-fetch-site": "same-origin",
        })
      ).status,
    ).toBe(200);
  });

  it("is a 500 when the themes can't be read, as the action threw", async () => {
    signIn();
    state.themesFail = true;
    const response = await themes({
      host: SAME_ORIGIN.host,
      "sec-fetch-site": "same-origin",
    });
    expect(response.status).toBe(500);
    expect(await json(response)).toMatchObject({
      success: false,
      error: { code: "UNKNOWN_ERROR" },
    });
  });
});

describe("GET /api/subscription (the plan /pricing reads in the browser)", () => {
  const get = () =>
    subscriptionRoute.GET(
      request("GET", "/api/subscription", {
        headers: { host: SAME_ORIGIN.host, "sec-fetch-site": "same-origin" },
      }) as never,
    );

  it("adds the visitor's plan to the allowance it always answered with", async () => {
    signIn();
    expect(await json(await get())).toEqual({
      isSubscribed: false,
      requestsUsed: 3,
      requestsRemaining: 7,
      plan: "free",
    });
    state.subscription = { productId: "prod_pro_year" };
    expect(await json(await get())).toMatchObject({
      isSubscribed: true,
      plan: "pro",
    });
  });

  it("is still a 401 when signed out", async () => {
    expect((await get()).status).toBe(401);
  });
});
