// The client portal and client-branded stats pages are in ee/client-portal
// under the QRdx commercial licence. Without QRDX_EE_LICENSE they're absent
// whatever the plan: Settings → Client portal and its help page leave the
// navigation, no portal opens, the actions answer NOT_FOUND, and shared
// stats pages keep working plain, on QRdx's host only. With the key and the
// plan (client branding on Pro, the rest on Business) they're all back.
// In-memory tables (tests/support/fake-db); nothing touches a database.
import { afterEach, describe, expect, it, vi } from "vitest";
import { testLicence } from "../support/ee-license";

const state = vi.hoisted(() => ({
  plans: {} as Record<string, "free" | "pro" | "business">,
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared")>()),
  logError: () => {},
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async (scope: { organizationId: string | null }) =>
    state.plans[scope.organizationId ?? ""] ?? "free",
  getOwnerPlanForOrganization: async (organizationId: string) =>
    state.plans[organizationId] ?? "free",
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({ success: true, limit: 100, remaining: 99 }),
  }),
}));
vi.mock("@/lib/storage/r2", () => ({
  isStorageConfigured: false,
  putObject: async () => {},
  deleteObject: async () => {},
  publicUrl: () => null,
}));
vi.mock("@/lib/scans", () => ({
  getScanAnalytics: async (_codeId: string, days: number) => ({
    from: new Date(),
    days,
    total: 4,
    unique: 3,
    interval: "day",
    series: [],
    countries: [],
    cities: [],
    devices: [],
    os: [],
    browsers: [],
    referrers: [],
    sources: { qr: 4, nfc: 0 },
  }),
}));

const owner = {
  userId: "u_ana",
  organizationId: "org_agency",
  role: "owner" as const,
};
const TOKEN = "t".repeat(32);

/** The app's modules, freshly loaded with `license`, over seeded tables. */
async function load(license: string | undefined) {
  vi.resetModules();
  vi.stubEnv("QRDX_EE_LICENSE", license);
  // The in-memory tables these freshly loaded modules read.
  const { fakeDb } = await import("../support/fake-db");
  fakeDb.resetAll();
  fakeDb.seed("organization", [
    { id: "org_agency", name: "North Agency", slug: "agency", logo: null },
  ]);
  fakeDb.seed("qrCode", [
    {
      id: "c_menu",
      userId: "u_ana",
      organizationId: "org_agency",
      title: "Spring menu",
      slug: "spring-menu",
      slugScope: "",
      destinationUrl: "https://cafe.example.com/menu",
      domainId: null,
      isActive: true,
      deletedAt: null,
      createdAt: new Date("2026-10-01T00:00:00Z"),
    },
  ]);
  fakeDb.seed("customDomain", [
    {
      id: "d_links",
      organizationId: "org_agency",
      hostname: "links.agency.example",
      verified: true,
    },
  ]);
  fakeDb.seed("brandKit", [
    {
      id: "bk_bloom",
      userId: "u_ana",
      organizationId: "org_agency",
      name: "Bloom Cafe",
      logo: null,
      colors: { accent: "#1f6feb" },
      purpose: "client",
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  // A page branded and moved to a custom domain while it was all on.
  fakeDb.seed("codePublicStats", [
    {
      id: "ps_menu",
      qrCodeId: "c_menu",
      token: TOKEN,
      createdBy: "u_ana",
      createdAt: new Date(),
      brandKitId: "bk_bloom",
      domainId: "d_links",
    },
  ]);
  return {
    ...(await import("@/lib/feature-availability")),
    ...(await import("@/lib/public-stats")),
    portal: await import("@/ee/client-portal/portal"),
    brands: await import("@/ee/client-portal/brands"),
    manage: await import("@/ee/client-portal/manage"),
    portalActions: await import("@/ee/client-portal/actions"),
    brandActions: await import("@/ee/client-portal/brand-actions"),
    brandingActions: await import("@/ee/client-portal/stats-branding-actions"),
    stats: await import("@/ee/client-portal/stats-branding"),
  };
}

const keep = { kind: "keep" } as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("without a valid QRDX_EE_LICENSE", () => {
  for (const [label, value] of [
    ["unset", undefined],
    ["blank", "  "],
    ["any old value", "local-dev"],
    ["expired past its grace period", testLicence({}, { days: -15 })],
    ["a licence for other features", testLicence({ features: ["sso"] })],
  ] as const) {
    it(`hides the settings page and help page (${label})`, async () => {
      state.plans = { org_agency: "business" };
      const app = await load(value);
      expect(app.isFeatureAvailable("clientPortal")).toBe(false);
      expect(app.isPathAvailable("/dashboard/agency/settings/clients")).toBe(
        false,
      );
      expect(app.isPathAvailable("/docs/client-portal")).toBe(false);
      // The shared stats page and its help page stay.
      expect(app.isPathAvailable("/docs/client-reports")).toBe(true);
    });
  }

  it("opens no portal, even on Business", async () => {
    state.plans = { org_agency: "business" };
    const app = await load(undefined);
    expect(await app.portal.findPortal("agency")).toBeNull();
  });

  it("answers NOT_FOUND from every action and entry point", async () => {
    state.plans = { org_agency: "business" };
    const app = await load(undefined);
    const form = new FormData();
    form.set("name", "Bloom Cafe");
    for (const result of [
      await app.brandActions.saveClientBrandAction(form),
      await app.brandActions.deleteClientBrandAction({ id: "bk_bloom" }),
      await app.portalActions.savePortalBrandAction(form),
      await app.portalActions.invitePortalClientAction({
        email: "cleo@client.example",
        name: "",
        folderIds: ["f_1"],
      }),
      await app.portalActions.updatePortalClientAction({
        id: "pc_1",
        name: null,
        folderIds: [],
      }),
      await app.portalActions.removePortalClientAction({ id: "pc_1" }),
    ]) {
      expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
    }
    for (const result of [
      await app.brandingActions.getStatsBrandingAction({ codeId: "c_menu" }),
      await app.brandingActions.setStatsBrandingAction({
        codeId: "c_menu",
        brandId: null,
        domainId: null,
      }),
    ]) {
      expect(result).toMatchObject({
        success: false,
        error: { code: "NOT_FOUND" },
      });
    }
    const notFound = { status: 404, code: "NOT_FOUND" };
    await expect(
      app.brands.saveClientBrand(owner, null, {
        name: "Bloom",
        accent: null,
        logo: keep,
      }),
    ).rejects.toMatchObject(notFound);
    await expect(app.manage.listPortalClients(owner)).rejects.toMatchObject(
      notFound,
    );
    await expect(
      app.stats.getStatsBranding(owner, "c_menu"),
    ).rejects.toMatchObject(notFound);
  });

  it("serves a branded share plain, on QRdx's host only", async () => {
    state.plans = { org_agency: "business" };
    const app = await load(undefined);
    expect(await app.loadPublicStats(TOKEN, "30d")).toMatchObject({
      code: { title: "Spring menu" },
      brand: null,
      hideQrdx: false,
      hideShortLink: false,
    });
    // Like a downgrade: the custom domain stops serving it.
    expect(
      await app.loadPublicStats(TOKEN, "30d", { customDomainId: "d_links" }),
    ).toBeNull();
    const share = await app.getPublicStatsShare(owner, "c_menu");
    expect(share.url).toBe(`http://localhost:3000/stats/${TOKEN}`);
  });
});

describe("with a valid QRDX_EE_LICENSE", () => {
  it("shows the settings page and opens the portal on Business only", async () => {
    state.plans = { org_agency: "business" };
    const app = await load(testLicence());
    expect(app.isFeatureAvailable("clientPortal")).toBe(true);
    expect(app.isPathAvailable("/dashboard/agency/settings/clients")).toBe(
      true,
    );
    expect(await app.portal.findPortal("agency")).toMatchObject({
      id: "org_agency",
      brand: { name: "North Agency" },
    });
    state.plans = { org_agency: "pro" };
    expect(await app.portal.findPortal("agency")).toBeNull();
  });

  it("brands the share on Pro, drops QRdx and serves the domain on Business", async () => {
    state.plans = { org_agency: "pro" };
    const app = await load(testLicence());
    expect(await app.loadPublicStats(TOKEN, "30d")).toMatchObject({
      brand: { name: "Bloom Cafe", accent: "#1f6feb" },
      hideQrdx: false,
    });
    expect(
      await app.loadPublicStats(TOKEN, "30d", { customDomainId: "d_links" }),
    ).toBeNull();
    expect(
      await app.brands.saveClientBrand(owner, null, {
        name: "Rosa",
        accent: null,
        logo: keep,
      }),
    ).toMatchObject({ name: "Rosa" });

    state.plans = { org_agency: "business" };
    expect(await app.loadPublicStats(TOKEN, "30d")).toMatchObject({
      brand: { name: "Bloom Cafe" },
      hideQrdx: true,
    });
    expect(
      await app.loadPublicStats(TOKEN, "30d", { customDomainId: "d_links" }),
    ).not.toBeNull();
    const share = await app.getPublicStatsShare(owner, "c_menu");
    expect(share.url).toBe(`https://links.agency.example/stats/${TOKEN}`);
    expect(await app.stats.getStatsBranding(owner, "c_menu")).toMatchObject({
      available: true,
      allowed: true,
      whiteLabel: true,
      brandId: "bk_bloom",
    });
  });
});
