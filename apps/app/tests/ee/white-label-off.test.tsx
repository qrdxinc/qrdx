// White-label and custom CSS on hosted pages are in ee/ under the QRdx
// commercial licence: without QRDX_EE_LICENSE no page gets them, whatever its
// plan, and a page that has them stored keeps serving with QRdx's default
// branding and without its CSS (Never-Hostage). Saving such a page still
// works. With the key, Business has both, as on qrdx.dev; Pro doesn't.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testLicence } from "../support/ee-license";
import { fakeDb } from "../support/fake-db";
import { renderIntl } from "../support/intl";

const state = vi.hoisted(() => ({
  plan: "business" as "free" | "pro" | "business",
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({ auth: { api: {} } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
  getOwnerPlanForOrganization: async () => state.plan,
}));
vi.mock("@/app/(app)/dashboard/domains/_lib/domains", () => ({
  getDomainRefs: async () => new Map(),
  assertBindableDomains: async () => {},
}));
vi.mock("@/ee/audit-log/record", () => ({ recordAuditEvent: () => {} }));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("@/lib/log-error", () => ({ logError: () => {} }));
// The real availability rules, read from the environment on every call (the
// app reads it once at start), so each test can set QRDX_EE_LICENSE.
vi.mock("@/lib/feature-availability", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/feature-availability")>();
  const { computeFeatures } = await import("@repo/availability");
  const { eeLicensedFeatures, eeLicenseState } = await import(
    "@repo/auth/license"
  );
  return {
    ...actual,
    isFeatureAvailable: (id: keyof ReturnType<typeof computeFeatures>) =>
      computeFeatures({
        env: process.env,
        onVercel: false,
        production: false,
        // The server's check of the key (packages/auth/ee/license.ts).
        eeFeatures: eeLicensedFeatures(eeLicenseState(process.env)),
      })[id],
  };
});
// next/font only works inside Next's compiler; these pages use no web fonts.
vi.mock("next/font/google", () => {
  const font = (options: { variable: string }) => ({
    className: "",
    variable: `font-var${options.variable}`,
    style: { fontFamily: "" },
  });
  return {
    Bricolage_Grotesque: font,
    Cormorant_Garamond: font,
    DM_Sans: font,
    Fraunces: font,
    Instrument_Serif: font,
    Space_Grotesk: font,
  };
});

const { isFeatureAvailable } = await import("@/lib/feature-availability");
const { hostedPageBranding, hostedPageCss } = await import(
  "@/ee/white-label/access"
);
const { loadPublicPage } = await import("@/app/(app)/p/_lib/public-page");
const { publishPage } = await import(
  "@/app/(app)/dashboard/pages/_lib/landing-pages"
);
const { LandingRender } = await import("@/components/landing/render");
const { PAGE_SETTINGS_TYPE } = await import(
  "@/components/landing/page-settings-block"
);
const { buildTemplateContent } = await import("@/lib/landing/templates");
const { AvailabilityProvider } = await import(
  "@/components/availability-provider"
);
const { BrandingSection } = await import(
  "@/components/landing/editor/branding-section"
);
const { PageSettingsEditor } = await import(
  "@/components/landing/editor/page-settings-editor"
);
const { DEFAULT_PAGE_SETTINGS } = await import(
  "@/components/landing/page-settings-block"
);
const { usePreviewCss } = await import("@/ee/white-label/editor");
const { parseLandingPageContent } = await import("@/lib/landing/blocks");

const ORG = "org_acme";
const SCOPE = { userId: "u_ana", organizationId: ORG, role: "owner" as const };
const LOGO = "https://cafe.example/logo.png";
const CSS = "h1 { color: rebeccapurple }";

const BUSINESS = { whiteLabel: true, customCss: true };
const PRO = { whiteLabel: false, customCss: false };

// A Business page with its logo and custom CSS saved.
const template = buildTemplateContent("links");
const CONTENT = {
  ...template,
  theme: { ...template.theme, logo: { url: LOGO } },
  blocks: [
    ...template.blocks,
    { id: "s1", type: PAGE_SETTINGS_TYPE, props: { customCss: CSS } },
  ],
};

function seed() {
  fakeDb.resetAll();
  fakeDb.seed("landingPage", [
    {
      id: "page_1",
      userId: "u_ana",
      organizationId: ORG,
      type: "links",
      title: "Café Luna",
      content: structuredClone(CONTENT),
      version: 1,
      gtin: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  fakeDb.seed("qrCode", [
    {
      id: "code_1",
      userId: "u_ana",
      organizationId: ORG,
      slug: "Luna123",
      slugScope: "",
      kind: "page",
      pageId: "page_1",
      destinationUrl: null,
      domainId: null,
      isActive: true,
      archivedAt: null,
      deletedAt: null,
      scanCount: 0,
      passwordHash: null,
      startsAt: null,
      expiresAt: null,
      scanLimit: null,
      pausedAt: null,
      fallbackUrl: null,
      routing: null,
      utm: null,
      pixels: null,
      createdAt: new Date(),
    },
  ]);
}

/** The hosted page as /p/Luna123 serves it: its branding and markup. */
async function serve() {
  const page = await loadPublicPage({ slug: "Luna123" }, null);
  if (!page) throw new Error("page not served");
  const css = hostedPageCss(page.branding, page.settings.customCss);
  const html = renderIntl(
    <LandingRender
      content={page.content}
      context={{
        theme: page.content.theme,
        mode: "live",
        pageId: page.page.id,
        qrCodeId: page.code.id,
      }}
      customCss={css}
    />,
  );
  return { page, css, html };
}

/** The page's content with `css` as its custom CSS. */
const withCss = (css: string) => ({
  ...structuredClone(CONTENT),
  blocks: CONTENT.blocks.map((block) =>
    block.type === PAGE_SETTINGS_TYPE
      ? { ...block, props: { customCss: css } }
      : block,
  ),
});
const SETTINGS_INDEX = CONTENT.blocks.findIndex(
  (block) => block.type === PAGE_SETTINGS_TYPE,
);
/** CSS that loads a file: outside the safe subset (custom-css.ts). */
const UNSAFE = "h1 { background: url(https://evil.example/x.png) }";

/** Publishes the page again as the editor sends it, CSS included. */
const publish = (content: unknown = structuredClone(CONTENT)) =>
  publishPage(SCOPE, {
    id: "page_1",
    title: "Café Luna",
    content,
    baseVersion: 1,
  });

/** The editor's preview CSS and CSS problem, where `unavailable` is off. */
function PreviewCss({ allowed, css }: { allowed: boolean; css: string }) {
  const preview = usePreviewCss(allowed, css);
  return (
    <p>
      {preview.css ?? "no-css"}|{preview.error ?? "no-error"}
    </p>
  );
}
const previewCss = (
  unavailable: "whiteLabel"[],
  allowed: boolean,
  css: string,
) =>
  renderIntl(
    <AvailabilityProvider
      value={{ unavailable, hiddenPaths: [], hiddenIntegrations: [] }}
    >
      <PreviewCss allowed={allowed} css={css} />
    </AvailabilityProvider>,
  );

beforeEach(() => {
  state.plan = "business";
  seed();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const license = (value: string | undefined) =>
  vi.stubEnv("QRDX_EE_LICENSE", value);

describe("without a valid QRDX_EE_LICENSE", () => {
  it("gives no workspace white-label or custom CSS, whatever its plan", async () => {
    for (const value of [
      undefined,
      "  ",
      "local-dev",
      testLicence({}, { days: -15 }),
      testLicence({ features: ["sso"] }),
    ]) {
      license(value);
      expect(isFeatureAvailable("whiteLabel")).toBe(false);
      expect(hostedPageBranding(BUSINESS)).toEqual(PRO);
    }
    expect(hostedPageCss({ customCss: false }, CSS)).toBeNull();
  });

  it("keeps serving a Business page that had them, with the default branding and no CSS", async () => {
    license(undefined);
    const { page, css, html } = await serve();
    expect(page.branding).toEqual({
      badge: false,
      whiteLabel: false,
      customCss: false,
    });
    // Stored, not applied.
    expect(page.settings.customCss).toBe(CSS);
    expect(css).toBeNull();
    expect(html).toContain("data-qrdx-page");
    expect(html).not.toContain("<style");
    expect(html).not.toContain("rebeccapurple");
  });

  it("saves a page that still holds custom CSS, unchecked", async () => {
    license(undefined);
    await expect(publish()).resolves.toMatchObject({ version: 2 });
    // Not even checked: it's never applied here.
    seed();
    await expect(publish(withCss(UNSAFE))).resolves.toMatchObject({
      version: 2,
    });
    // Also where the plan wouldn't allow it with the licence.
    seed();
    state.plan = "pro";
    await expect(publish()).resolves.toMatchObject({ version: 2 });
  });
});

describe("with a valid QRDX_EE_LICENSE", () => {
  it("gives Business white-label and custom CSS, as on qrdx.dev", async () => {
    license(testLicence());
    expect(isFeatureAvailable("whiteLabel")).toBe(true);
    expect(hostedPageBranding(BUSINESS)).toEqual(BUSINESS);
    const { page, css, html } = await serve();
    expect(page.branding).toEqual({
      badge: false,
      whiteLabel: true,
      customCss: true,
    });
    expect(css).toContain("rebeccapurple");
    expect(html).toContain("<style");
    expect(html).toContain("[data-qrdx-page] h1");
    await expect(publish()).resolves.toMatchObject({ version: 2 });
  });

  it("gives Pro neither, and refuses saving custom CSS on Pro as before", async () => {
    state.plan = "pro";
    license(testLicence());
    expect(hostedPageBranding(PRO)).toEqual(PRO);
    const { css, html } = await serve();
    expect(css).toBeNull();
    expect(html).not.toContain("rebeccapurple");
    await expect(publish()).rejects.toMatchObject({
      status: 402,
      code: "PLAN_REQUIRED",
    });
  });
});

describe("the page editor", () => {
  /** The Settings tab's page settings and Branding section, as a page's owner sees them. */
  const editor = (unavailable: "whiteLabel"[], allowed: boolean) =>
    renderIntl(
      <AvailabilityProvider
        value={{ unavailable, hiddenPaths: [], hiddenIntegrations: [] }}
      >
        <PageSettingsEditor
          context={{
            theme: CONTENT.theme,
            pageId: "page_1",
            storageEnabled: false,
          }}
          customCssAllowed={allowed}
          id="s1"
          onChange={() => {}}
          value={{ ...DEFAULT_PAGE_SETTINGS, customCss: CSS }}
        />
        <BrandingSection badge={false} whiteLabel={allowed} />
      </AvailabilityProvider>,
    );

  it("shows no white-label or custom CSS where the server doesn't offer them", () => {
    const html = editor(["whiteLabel"], false);
    expect(html).toContain("Show in search engines");
    expect(html).toContain("No QRdx footer (Pro)");
    expect(html).not.toMatch(/Custom CSS|White-label|Business/);
  });

  it("shows them, on or locked by the plan, where it does", () => {
    const business = editor([], true);
    expect(business).toContain("Custom CSS");
    expect(business).toContain("White-label (Business)");
    expect(business).not.toContain("Upgrade to Business for custom CSS");
    const pro = editor([], false);
    expect(pro).toContain("Upgrade to Business for custom CSS");
    expect(pro).toContain("White-label with Business");
  });
});

describe("checking custom CSS", () => {
  it("is not the page model's job: it only caps the length", () => {
    expect(parseLandingPageContent(withCss(UNSAFE)).success).toBe(true);
    expect(
      parseLandingPageContent(withCss("a{}".repeat(4000)), { mode: "write" })
        .success,
    ).toBe(false);
  });

  it("refuses unsafe CSS on save with the licence, as before, whatever the plan", async () => {
    license(testLicence());
    const refused = {
      status: 400,
      code: "VALIDATION_ERROR",
      message: `url() is not allowed: custom CSS can't load files (blocks.${SETTINGS_INDEX}.props.customCss)`,
    };
    await expect(publish(withCss(UNSAFE))).rejects.toMatchObject(refused);
    state.plan = "pro";
    await expect(publish(withCss(UNSAFE))).rejects.toMatchObject(refused);
  });

  it("never applies stored unsafe CSS", async () => {
    license(testLicence());
    const row = fakeDb.find("landingPage", { id: "page_1" });
    if (row) row.content = withCss(UNSAFE);
    const { css, html } = await serve();
    expect(css).toBeNull();
    expect(html).not.toContain("evil.example");
  });

  it("shows the problem in the editor and keeps it out of the preview", () => {
    expect(previewCss([], true, CSS)).toContain("[data-qrdx-page] h1");
    expect(previewCss([], true, CSS)).toContain("no-error");
    // On Pro the preview leaves valid CSS out, as the live page does.
    expect(previewCss([], false, CSS)).toContain("no-css|no-error");
    expect(previewCss([], true, UNSAFE)).toContain(
      "no-css|url() is not allowed: custom CSS can&#x27;t load files",
    );
    // Without the licence: neither checked nor applied.
    expect(previewCss(["whiteLabel"], true, UNSAFE)).toContain(
      "no-css|no-error",
    );
    expect(previewCss(["whiteLabel"], true, CSS)).toContain("no-css|no-error");
  });
});
