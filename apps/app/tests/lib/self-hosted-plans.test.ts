// Plans on a self-hosted server, as apps/docs/content/docs/self-hosting.mdx
// and plans-and-limits.mdx describe them:
// - apps/app/lib/plans.ts is the one table: packages/auth reads it for who
//   may create more workspaces, seats, workspace SSO and required two-step
//   verification (packages/auth/plan-limits.ts), so an edit reaches them;
// - with the ee licence key and no billing (no Polar), on its own domain,
//   every workspace has workspace SSO and the audit log;
// - without the key they stay off, and wherever plans are sold (qrdx.dev)
//   nothing changes: Free, Pro and Business decide as before.
//
// The real auth server, plan lookups and audit log run against in-memory
// tables (../support/fake-db). Each case loads them afresh with its own
// environment.
import { afterEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/log-error", () => ({ logError: () => {} }));

const PRO = "prod_pro_monthly";
const BUSINESS = "prod_business_monthly";

/** qrdx.dev: plans are sold, and it has its own licence key. */
const QRDX_DEV = {
  NEXT_PUBLIC_APP_URL: "https://qrdx.dev",
  POLAR_ACCESS_TOKEN: "test-polar-token",
  QRDX_EE_LICENSE: "test-license",
};
/** A self-hosted server on its own domain with the key and no Polar. */
const SELF_HOSTED = {
  NEXT_PUBLIC_APP_URL: "https://qr.example.org",
  POLAR_ACCESS_TOKEN: undefined,
  QRDX_EE_LICENSE: "local-dev",
};

type Env = Record<string, string | undefined>;

interface OrganizationPlugin {
  id: string;
  options: {
    allowUserToCreateOrganization: (user: { id: string }) => Promise<boolean>;
    membershipLimit: (
      user: unknown,
      organization: { id: string },
    ) => Promise<number>;
    invitationLimit: (data: {
      organization: { id: string };
    }) => Promise<number>;
  };
}

/** Everything under test, loaded afresh with `env`, over seeded tables. */
async function load(env: Env) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID", PRO);
  vi.stubEnv("NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID", BUSINESS);
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);

  const plans = await import("@/lib/plans");
  const { fakeDb } = await import("../support/fake-db");
  const { auth } = await import("@repo/auth/server");
  const sso = await import("@repo/auth/sso");
  const twoFactor = await import("@repo/auth/workspace-two-factor");
  const { writeAuditEvents } = await import("@/ee/audit-log/record");
  const { requireAuditLogAccess } = await import("@/ee/audit-log/access");
  const { database, workspaceAuditLog } = (await import(
    "@repo/database"
  )) as typeof import("@repo/database");

  // Three workspaces whose owners are on Free, Pro and Business, each with
  // one more member, a verified SSO connection and "Require two-step
  // verification" on.
  const tiers = ["free", "pro", "business"] as const;
  fakeDb.seed(
    "user",
    tiers.flatMap((tier) => [
      { id: `owner_${tier}`, email: `owner@${tier}.test` },
      { id: `member_${tier}`, email: `member@${tier}.test` },
    ]),
  );
  fakeDb.seed(
    "organization",
    tiers.map((tier) => ({
      id: `org_${tier}`,
      name: tier,
      slug: tier,
      metadata: '{"requireTwoFactor":true}',
    })),
  );
  fakeDb.seed(
    "member",
    tiers.flatMap((tier) => [
      {
        id: `m_owner_${tier}`,
        organizationId: `org_${tier}`,
        userId: `owner_${tier}`,
        role: "owner",
        createdAt: new Date(),
      },
      {
        id: `m_member_${tier}`,
        organizationId: `org_${tier}`,
        userId: `member_${tier}`,
        role: "member",
        createdAt: new Date(),
      },
    ]),
  );
  fakeDb.seed("subscription", [
    {
      id: "sub_pro",
      userId: "owner_pro",
      productId: PRO,
      status: "active",
      createdAt: new Date(),
    },
    {
      id: "sub_business",
      userId: "owner_business",
      productId: BUSINESS,
      status: "active",
      createdAt: new Date(),
    },
  ]);
  fakeDb.seed(
    "ssoProvider",
    tiers.map((tier) => ({
      id: `p_${tier}`,
      providerId: `sso-${tier}`,
      organizationId: `org_${tier}`,
      domain: `${tier}.test`,
      domainVerified: true,
      issuer: `https://idp.${tier}.test`,
      userId: `owner_${tier}`,
    })),
  );

  const organization = (
    auth as { options: { plugins: OrganizationPlugin[] } }
  ).options.plugins.find((plugin) => plugin.id === "organization")?.options;
  if (!organization) throw new Error("no organization plugin");

  const auditCtx = (tier: string) => ({
    userId: `owner_${tier}`,
    organizationId: `org_${tier}`,
  });
  const event = {
    action: "code.created" as const,
    target: { type: "code" as const, id: "c1", label: "Menu" },
  };

  return {
    plans,
    /** What packages/auth decides for the workspace owned on `tier`. */
    async decisions(tier: (typeof tiers)[number]) {
      return {
        createsWorkspaces: await organization.allowUserToCreateOrganization({
          id: `owner_${tier}`,
        }),
        seats: await organization.membershipLimit(null, { id: `org_${tier}` }),
        invitations: await organization.invitationLimit({
          organization: { id: `org_${tier}` },
        }),
        ssoOffered: await sso.ssoSignInOffered(`${tier}.test`),
        ssoRejoins: await sso.ssoRejoinDomains(`org_${tier}`),
        twoFactorRequired: await twoFactor.workspaceRequiresTwoFactor(
          `org_${tier}`,
        ),
      };
    },
    /** Whether a change in the workspace owned on `tier` is recorded. */
    async auditRecords(tier: string) {
      const before = (await database.select().from(workspaceAuditLog)).length;
      await writeAuditEvents(auditCtx(tier), [event]);
      const after = (await database.select().from(workspaceAuditLog)).length;
      return after > before;
    },
    readAuditLog: (tier: string) =>
      requireAuditLogAccess({ organizationId: `org_${tier}`, role: "owner" }),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// What every server decided before plans.ts reached packages/auth: Free can't
// make workspaces and has one seat; Pro has 3 seats; Business has unlimited
// seats, SSO and required two-step verification.
const AS_SHIPPED = {
  free: {
    createsWorkspaces: false,
    seats: 1,
    invitations: 0,
    ssoOffered: false,
    ssoRejoins: [],
    twoFactorRequired: false,
  },
  pro: {
    createsWorkspaces: true,
    seats: 3,
    invitations: 1,
    ssoOffered: false,
    ssoRejoins: [],
    twoFactorRequired: false,
  },
  business: {
    createsWorkspaces: true,
    seats: Number.POSITIVE_INFINITY,
    invitations: 100,
    ssoOffered: true,
    ssoRejoins: ["business.test"],
    twoFactorRequired: true,
  },
};

describe("where plans are sold (qrdx.dev)", () => {
  it("decides teams, seats, SSO and required two-step verification as before", async () => {
    const app = await load(QRDX_DEV);
    expect(await app.decisions("free")).toEqual(AS_SHIPPED.free);
    expect(await app.decisions("pro")).toEqual(AS_SHIPPED.pro);
    expect(await app.decisions("business")).toEqual(AS_SHIPPED.business);
  });

  it("records the audit log for Business only, and keeps it from the others", async () => {
    const app = await load(QRDX_DEV);
    expect(await app.auditRecords("free")).toBe(false);
    expect(await app.auditRecords("pro")).toBe(false);
    expect(await app.auditRecords("business")).toBe(true);
    await expect(app.readAuditLog("free")).rejects.toMatchObject({
      status: 403,
      code: "PLAN_REQUIRED",
    });
  });

  it("gives every plan exactly its own limits", async () => {
    const { plans } = await load(QRDX_DEV);
    for (const plan of plans.PLANS) {
      expect(plans.getPlanLimits(plan)).toBe(plans.PLAN_LIMITS[plan]);
    }
  });

  it("never gives the ee features away, even without the Polar token", async () => {
    // A qrdx.dev deployment that lost its token still isn't a self-hosted copy.
    const app = await load({ ...QRDX_DEV, POLAR_ACCESS_TOKEN: undefined });
    expect(app.plans.getPlanLimits("free").sso).toBe(false);
    expect((await app.decisions("free")).ssoOffered).toBe(false);
    expect(await app.auditRecords("free")).toBe(false);
  });

  it("nor on local dev or a preview", async () => {
    for (const env of [
      { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      {
        NEXT_PUBLIC_APP_URL: "https://qrdx-git-branch.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "qrdx.dev",
      },
    ]) {
      const app = await load({ ...SELF_HOSTED, ...env });
      expect(app.plans.getPlanLimits("free").auditLog).toBe(false);
      expect((await app.decisions("free")).ssoOffered).toBe(false);
    }
  });
});

describe("a self-hosted server with the licence key and no billing", () => {
  it("offers SSO to every workspace and records its audit log", async () => {
    const app = await load(SELF_HOSTED);
    for (const tier of ["free", "pro", "business"] as const) {
      const decided = await app.decisions(tier);
      expect(decided.ssoOffered, tier).toBe(true);
      expect(decided.ssoRejoins, tier).toEqual([`${tier}.test`]);
      expect(await app.auditRecords(tier), tier).toBe(true);
      await expect(app.readAuditLog(tier)).resolves.toMatchObject({
        entitled: true,
      });
    }
  });

  it("leaves everything else to the plan: Free still can't add people", async () => {
    const app = await load(SELF_HOSTED);
    const free = await app.decisions("free");
    expect(free).toMatchObject({
      createsWorkspaces: false,
      seats: 1,
      twoFactorRequired: false,
    });
    expect(app.plans.getPlanLimits("free")).toEqual({
      ...app.plans.PLAN_LIMITS.free,
      sso: true,
      auditLog: true,
      clientReports: true,
      clientReportsWhiteLabel: true,
      clientPortal: true,
      whiteLabel: true,
      customCss: true,
      landingPageBadge: false,
      conversions: true,
    });
  });
});

describe("a self-hosted server without the key", () => {
  it("has no SSO and records no audit log, on any plan", async () => {
    const app = await load({ ...SELF_HOSTED, QRDX_EE_LICENSE: undefined });
    for (const tier of ["free", "business"] as const) {
      expect((await app.decisions(tier)).ssoOffered, tier).toBe(false);
      expect(await app.auditRecords(tier), tier).toBe(false);
    }
    expect(app.plans.getPlanLimits("free").sso).toBe(false);
    await expect(app.readAuditLog("business")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("changing lib/plans.ts for an instance", () => {
  it("reaches who may create workspaces and how many seats a workspace has", async () => {
    const app = await load({ ...SELF_HOSTED, QRDX_EE_LICENSE: undefined });
    const { free, pro } = app.plans.PLAN_LIMITS;
    const shipped = { free: { ...free }, pro: { ...pro } };
    try {
      // The edit a self-hoster makes: teams for everyone, 5 seats on Free,
      // 10 on Pro, and Free may require two-step verification.
      Object.assign(free, {
        teams: true,
        teamMembers: 5,
        requireTwoFactor: true,
      });
      pro.teamMembers = 10;

      expect(await app.decisions("free")).toMatchObject({
        createsWorkspaces: true,
        seats: 5,
        // Two members already.
        invitations: 3,
        twoFactorRequired: true,
      });
      expect(await app.decisions("pro")).toMatchObject({
        seats: 10,
        invitations: 8,
      });
    } finally {
      Object.assign(free, shipped.free);
      Object.assign(pro, shipped.pro);
    }
    expect(await app.decisions("free")).toMatchObject({
      createsWorkspaces: false,
      seats: 1,
    });
  });
});

describe("packages/auth before the app hands its limits over", () => {
  it("uses the limits plans.ts ships with", async () => {
    const { SHIPPED_PLAN_LIMITS } = await import("@repo/auth/plan-limits");
    const { PLAN_LIMITS, PLANS } = await import("@/lib/plans");
    for (const plan of PLANS) {
      const { teams, teamMembers, sso, requireTwoFactor } = PLAN_LIMITS[plan];
      expect(SHIPPED_PLAN_LIMITS[plan], plan).toEqual({
        teams,
        teamMembers,
        sso,
        requireTwoFactor,
      });
    }
  });

  it("gets them from every server at start-up and from the auth route", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const read = (file: string) =>
      readFileSync(path.resolve(import.meta.dirname, "../..", file), "utf8");
    expect(read("instrumentation.ts")).toContain('await import("./lib/plans")');
    expect(read("app/api/auth/[...all]/route.ts")).toContain(
      'import "@/lib/plans";',
    );
    expect(read("lib/plans.ts")).toContain(
      "registerPlanLimits(getPlanLimits);",
    );
  });
});
