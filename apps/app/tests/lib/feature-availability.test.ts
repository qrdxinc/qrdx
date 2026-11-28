// Built-in features (custom domains, AI art, storage, email, …) are offered
// only where they can work. The environment is injected: every value below is
// a fake placeholder, and only "is it set" is ever read (except the app URL,
// which passkeys need to be HTTPS).

import { EE_FEATURES, type EeFeature } from "@repo/auth/ee-license";
import {
  catalogParagraphs,
  computeFeatures,
  configuredEntry,
  customDomainMode,
  eeOnEveryPlan,
  FEATURE_IDS,
  type FeatureContext,
  type FeatureId,
  featureForCatalogSlug,
  featureUnusableReason,
  isPathShown,
  missingFeatureSetup,
  toPublicAvailability,
} from "@repo/availability";
import {
  getIntegrationRegistry,
  INTEGRATION_ENV_VARS,
  initializeIntegrations,
} from "@repo/integrations";
import { getCatalogBySurface } from "@repo/integrations/src/catalog";
import { describe, expect, it } from "vitest";
import { canDeliverSignInCodes } from "@/lib/account/deletion";
import {
  type AvailabilityContext,
  computeAvailability,
  isVisible,
} from "@/lib/integration-availability-rules";
import { toAvailabilityView } from "@/lib/integration-availability-view";

const FAKE = "set";

/**
 * `eeFeatures` is what the server's check of QRDX_EE_LICENSE found
 * (packages/auth/ee/license.ts; tests/auth/ee-license.test.ts checks real
 * keys). Here a set key is taken as a valid one for every ee feature, unless
 * a test says otherwise. `outboundDelivery` is the delivery guard's answer
 * (lib/delivery-guard.ts): here a production deployment on its own domain
 * may send email and local dev may not, unless a test says otherwise.
 */
const ctx = (
  env: Record<string, string | undefined>,
  {
    onVercel = false,
    production = false,
    eeFeatures,
    outboundDelivery = production,
  }: {
    onVercel?: boolean;
    production?: boolean;
    eeFeatures?: readonly EeFeature[];
    outboundDelivery?: boolean;
  } = {},
): FeatureContext => ({
  env,
  onVercel,
  production,
  eeFeatures:
    eeFeatures ?? (env.QRDX_EE_LICENSE?.trim() ? [...EE_FEATURES] : []),
  outboundDelivery,
});

/** Every variable any feature reads, set. */
const EVERYTHING: Record<string, string> = {
  AI_GATEWAY_API_KEY: FAKE,
  // The docs assistant reads the docs site; its switch is unset (on).
  DOCS_ZONE_URL: "https://docs.qrdx.dev",
  VERCEL_API_TOKEN: FAKE,
  VERCEL_PROJECT_ID: FAKE,
  DOMAIN_CONNECT_PROVIDER_ID: FAKE,
  DOMAIN_CONNECT_SERVICE_ID: FAKE,
  DOMAIN_CONNECT_PRIVATE_KEY: FAKE,
  DOMAIN_CONNECT_LIVE_PROVIDERS: FAKE,
  R2_ACCOUNT_ID: FAKE,
  R2_ACCESS_KEY_ID: FAKE,
  R2_SECRET_ACCESS_KEY: FAKE,
  R2_BUCKET: FAKE,
  RESEND_API_KEY: FAKE,
  EMAIL_FROM: FAKE,
  EMAIL_FROM_PERSONAL: FAKE,
  TURNSTILE_SECRET_KEY: FAKE,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: FAKE,
  WEB_RISK_API_KEY: FAKE,
  CRON_SECRET: FAKE,
  YOUTUBE_API_KEY: FAKE,
  SPOTIFY_CLIENT_ID: FAKE,
  SPOTIFY_CLIENT_SECRET: FAKE,
  GOOGLE_CLIENT_ID: FAKE,
  GOOGLE_CLIENT_SECRET: FAKE,
  GITHUB_CLIENT_ID: FAKE,
  GITHUB_CLIENT_SECRET: FAKE,
  // qrdx.dev: the affiliate program only runs where QRdx itself does.
  NEXT_PUBLIC_APP_URL: "https://qrdx.dev",
  QRDX_EE_LICENSE: FAKE,
  SLACK_CLIENT_ID: FAKE,
  SLACK_CLIENT_SECRET: FAKE,
  SLACK_SIGNING_SECRET: FAKE,
  INTEGRATION_ENCRYPTION_KEY: FAKE,
  DISCORD_APPLICATION_ID: FAKE,
  DISCORD_PUBLIC_KEY: FAKE,
  TELEGRAM_BOT_TOKEN: FAKE,
  TELEGRAM_WEBHOOK_SECRET: FAKE,
  TELEGRAM_BOT_USERNAME: FAKE,
  POLAR_WEBHOOK_SECRET: FAKE,
  POLAR_ACCESS_TOKEN: FAKE,
  // A flag, not a secret: euro prices show only when it's "1" or "true".
  NEXT_PUBLIC_QRDX_EUR_PRICES: "1",
};

/** What each feature needs on Vercel in production, by variable name. */
const NEEDS: Record<FeatureId, string[]> = {
  aiThemes: ["AI_GATEWAY_API_KEY"],
  aiArt: ["AI_GATEWAY_API_KEY"],
  docsChat: ["AI_GATEWAY_API_KEY", "DOCS_ZONE_URL"],
  customDomains: ["VERCEL_API_TOKEN", "VERCEL_PROJECT_ID"],
  fileStorage: [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
  ],
  email: ["RESEND_API_KEY", "EMAIL_FROM"],
  domainConnect: [
    "VERCEL_API_TOKEN",
    "VERCEL_PROJECT_ID",
    "DOMAIN_CONNECT_PROVIDER_ID",
    "DOMAIN_CONNECT_SERVICE_ID",
    "DOMAIN_CONNECT_PRIVATE_KEY",
    "DOMAIN_CONNECT_LIVE_PROVIDERS",
  ],
  spamCheck: ["TURNSTILE_SECRET_KEY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"],
  linkSafety: ["WEB_RISK_API_KEY"],
  scheduledJobs: ["CRON_SECRET"],
  youtubeChannelPicker: ["YOUTUBE_API_KEY"],
  spotifyPlaylistPicker: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"],
  googleSignIn: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  githubSignIn: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
  emailSignIn: ["RESEND_API_KEY", "EMAIL_FROM", "NEXT_PUBLIC_APP_URL"],
  passkeys: ["NEXT_PUBLIC_APP_URL"],
  sso: ["QRDX_EE_LICENSE"],
  auditLog: ["QRDX_EE_LICENSE"],
  clientPortal: ["QRDX_EE_LICENSE"],
  whiteLabel: ["QRDX_EE_LICENSE"],
  conversions: ["QRDX_EE_LICENSE"],
  slackBot: [
    "SLACK_CLIENT_ID",
    "SLACK_CLIENT_SECRET",
    "SLACK_SIGNING_SECRET",
    "INTEGRATION_ENCRYPTION_KEY",
  ],
  discordBot: ["DISCORD_APPLICATION_ID", "DISCORD_PUBLIC_KEY"],
  telegramBot: [
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_WEBHOOK_SECRET",
    "TELEGRAM_BOT_USERNAME",
  ],
  affiliates: ["POLAR_WEBHOOK_SECRET"],
  inviteRewards: ["NEXT_PUBLIC_APP_URL"],
  billing: ["POLAR_ACCESS_TOKEN"],
  invoiceRequests: ["RESEND_API_KEY", "EMAIL_FROM"],
  enterpriseRequests: ["RESEND_API_KEY", "EMAIL_FROM"],
  teamNotes: ["RESEND_API_KEY", "EMAIL_FROM"],
  eurPrices: ["NEXT_PUBLIC_QRDX_EUR_PRICES"],
  nonprofitDiscounts: ["RESEND_API_KEY", "EMAIL_FROM"],
};

const vercelProd = { onVercel: true, production: true };

describe("euro prices wait for the flag", () => {
  const on = (value: string | undefined) =>
    computeFeatures(ctx({ NEXT_PUBLIC_QRDX_EUR_PRICES: value }, vercelProd))
      .eurPrices;

  it("is on only for 1 or true, anywhere", () => {
    expect(on("1")).toBe(true);
    expect(on("true")).toBe(true);
    expect(on("0")).toBe(false);
    expect(on("false")).toBe(false);
    expect(on(undefined)).toBe(false);
  });
});

describe("the docs assistant", () => {
  const ready = {
    AI_GATEWAY_API_KEY: FAKE,
    DOCS_ZONE_URL: "https://docs.qrdx.dev",
  };
  const on = (env: Record<string, string | undefined>) =>
    computeFeatures(ctx({ ...ready, ...env }, vercelProd)).docsChat;

  it("runs with the gateway key and a docs site, and its switch unset", () => {
    expect(on({})).toBe(true);
    expect(
      computeFeatures(ctx({ AI_GATEWAY_API_KEY: FAKE }, vercelProd)).docsChat,
    ).toBe(false);
    expect(
      missingFeatureSetup(
        "docsChat",
        ctx({ AI_GATEWAY_API_KEY: FAKE }, vercelProd),
      ),
    ).toEqual(["DOCS_ZONE_URL"]);
  });

  it("switches off with DOCS_CHAT_ENABLED=0 or false, and on with anything else", () => {
    expect(on({ DOCS_CHAT_ENABLED: "0" })).toBe(false);
    expect(on({ DOCS_CHAT_ENABLED: "false" })).toBe(false);
    expect(on({ DOCS_CHAT_ENABLED: " FALSE " })).toBe(false);
    expect(on({ DOCS_CHAT_ENABLED: "1" })).toBe(true);
    expect(on({ DOCS_CHAT_ENABLED: "true" })).toBe(true);
    // Switched off: the variables it needs are named, as for passkeys.
    expect(
      missingFeatureSetup(
        "docsChat",
        ctx({ ...ready, DOCS_CHAT_ENABLED: "0" }, vercelProd),
      ),
    ).toEqual(["AI_GATEWAY_API_KEY", "DOCS_ZONE_URL"]);
  });

  it("hides no page: the Ask AI button is the only thing that goes", () => {
    const view = toPublicAvailability(
      computeFeatures(ctx({ AI_GATEWAY_API_KEY: FAKE }, vercelProd)),
    );
    expect(view.unavailable).toContain("docsChat");
    expect(view.hiddenPaths.some((path) => path.includes("chat"))).toBe(false);
  });
});

describe("non-profit discount requests run only where QRdx itself does", () => {
  const email = { RESEND_API_KEY: FAKE, EMAIL_FROM: FAKE };
  const on = (env: Record<string, string>) =>
    computeFeatures(ctx({ ...email, ...env }, vercelProd)).nonprofitDiscounts;

  it("is on for qrdx.dev with email, off on a self-hosted copy", () => {
    expect(on({ NEXT_PUBLIC_APP_URL: "https://qrdx.dev" })).toBe(true);
    expect(on({ NEXT_PUBLIC_APP_URL: "https://qr.example.org" })).toBe(false);
    expect(
      computeFeatures(
        ctx({ NEXT_PUBLIC_APP_URL: "https://qrdx.dev" }, vercelProd),
      ).nonprofitDiscounts,
    ).toBe(false);
  });
});

describe("the affiliate program runs only where QRdx itself does", () => {
  const polar = { POLAR_WEBHOOK_SECRET: FAKE };
  const on = (env: Record<string, string>) =>
    computeFeatures(ctx({ ...polar, ...env }, vercelProd)).affiliates;

  it("is on for qrdx.dev, its previews and local dev, with Polar set", () => {
    expect(on({ NEXT_PUBLIC_APP_URL: "https://qrdx.dev" })).toBe(true);
    expect(on({ NEXT_PUBLIC_APP_URL: "https://www.qrdx.dev" })).toBe(true);
    expect(on({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).toBe(true);
    // A preview: its own *.vercel.app URL, in the qrdx.dev project.
    expect(
      on({
        NEXT_PUBLIC_APP_URL: "https://qrdx-git-x-me.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "qrdx.dev",
      }),
    ).toBe(true);
  });

  it("is off on a self-hosted copy, with no setting to turn it on", () => {
    expect(on({ NEXT_PUBLIC_APP_URL: "https://qr.example.org" })).toBe(false);
    expect(on({ NEXT_PUBLIC_APP_URL: "https://qrdx.dev.example.org" })).toBe(
      false,
    );
    expect(
      on({
        NEXT_PUBLIC_APP_URL: "https://qr.example.org",
        QRDX_AFFILIATES: "1",
      }),
    ).toBe(false);
  });

  it("is off without Polar's webhook secret", () => {
    expect(
      computeFeatures(
        ctx({ NEXT_PUBLIC_APP_URL: "https://qrdx.dev" }, vercelProd),
      ).affiliates,
    ).toBe(false);
  });
});

describe("invite rewards run only where QRdx itself does", () => {
  const on = (env: Record<string, string>) =>
    computeFeatures(ctx(env, vercelProd)).inviteRewards;

  it("is on for qrdx.dev, its previews and local dev, with nothing to set up", () => {
    expect(on({ NEXT_PUBLIC_APP_URL: "https://qrdx.dev" })).toBe(true);
    expect(on({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).toBe(true);
    expect(
      on({
        NEXT_PUBLIC_APP_URL: "https://qrdx-git-x-me.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "qrdx.dev",
      }),
    ).toBe(true);
  });

  it("is off on a self-hosted copy", () => {
    expect(on({ NEXT_PUBLIC_APP_URL: "https://qr.example.org" })).toBe(false);
    expect(on({ NEXT_PUBLIC_APP_URL: "https://qrdx.dev.example.org" })).toBe(
      false,
    );
  });
});

describe("each feature, on and off by env", () => {
  it("is on with everything set", () => {
    const features = computeFeatures(ctx(EVERYTHING, vercelProd));
    for (const id of FEATURE_IDS) expect(features[id], id).toBe(true);
  });

  it("is off with nothing set, naming what it needs", () => {
    const features = computeFeatures(ctx({}, vercelProd));
    for (const id of FEATURE_IDS) {
      expect(features[id], id).toBe(false);
      expect(missingFeatureSetup(id, ctx({}, vercelProd)), id).toEqual(
        NEEDS[id],
      );
    }
  });

  it("turns off when any one of its variables goes", () => {
    for (const id of FEATURE_IDS) {
      for (const name of NEEDS[id]) {
        const env = { ...EVERYTHING, [name]: undefined };
        expect(computeFeatures(ctx(env, vercelProd))[id], `${id} ${name}`).toBe(
          false,
        );
      }
    }
  });

  it("treats blank values as unset", () => {
    const env = { ...EVERYTHING, RESEND_API_KEY: "  " };
    expect(computeFeatures(ctx(env, vercelProd)).email).toBe(false);
  });

  it("offers AI art whenever AI themes run: there is no separate art switch", () => {
    const env = { AI_GATEWAY_API_KEY: FAKE, AI_ART_ENABLED: "0" };
    expect(computeFeatures(ctx(env, vercelProd))).toMatchObject({
      aiThemes: true,
      aiArt: true,
    });
    expect(missingFeatureSetup("aiArt", ctx(env, vercelProd))).toEqual([]);
  });

  it("runs AI only through the gateway: a Google key alone turns nothing on", () => {
    const googleOnly = { GOOGLE_API_KEY: FAKE };
    const features = computeFeatures(ctx(googleOnly, vercelProd));
    expect(features.aiThemes).toBe(false);
    expect(features.aiArt).toBe(false);
    expect(
      missingFeatureSetup("aiThemes", ctx(googleOnly, vercelProd)),
    ).toEqual(["AI_GATEWAY_API_KEY"]);
    const gateway = { AI_GATEWAY_API_KEY: FAKE };
    expect(computeFeatures(ctx(gateway, vercelProd))).toMatchObject({
      aiThemes: true,
      aiArt: true,
    });
  });

  it("needs the cron secret only in production", () => {
    expect(computeFeatures(ctx({})).scheduledJobs).toBe(true);
    expect(computeFeatures(ctx({}, { production: true })).scheduledJobs).toBe(
      false,
    );
  });
});

describe("ways to sign in", () => {
  const offered = (context: FeatureContext) => {
    const features = computeFeatures(context);
    return {
      google: features.googleSignIn,
      github: features.githubSignIn,
      email: features.emailSignIn,
    };
  };
  // A clean-machine self-host test (18 Nov 2026): Docker Compose, the app
  // URL on localhost, no OAuth app, no Resend. A production build there may
  // not send email (lib/delivery-guard.ts).
  const LOCAL_DOCKER = { NEXT_PUBLIC_APP_URL: "http://localhost:3000" };
  const localBuild = { production: true, outboundDelivery: false };
  const ownDomain = { NEXT_PUBLIC_APP_URL: "https://qr.example.com" };

  it("offers nothing on a server with no OAuth app and no Resend", () => {
    expect(offered(ctx(LOCAL_DOCKER, localBuild))).toEqual({
      google: false,
      github: false,
      email: false,
    });
  });

  it("offers Google and GitHub each only with both its client id and secret", () => {
    for (const [env, expected] of [
      [{ GITHUB_CLIENT_ID: FAKE, GITHUB_CLIENT_SECRET: FAKE }, [false, true]],
      [{ GITHUB_CLIENT_ID: FAKE }, [false, false]],
      [{ GITHUB_CLIENT_SECRET: FAKE }, [false, false]],
      [{ GOOGLE_CLIENT_ID: FAKE, GOOGLE_CLIENT_SECRET: FAKE }, [true, false]],
      [{ GOOGLE_CLIENT_ID: FAKE, GITHUB_CLIENT_SECRET: FAKE }, [false, false]],
      [{ GOOGLE_CLIENT_ID: FAKE, GOOGLE_CLIENT_SECRET: "  " }, [false, false]],
    ] as const) {
      const result = offered(ctx({ ...LOCAL_DOCKER, ...env }, localBuild));
      expect([result.google, result.github], JSON.stringify(env)).toEqual(
        expected,
      );
      // Neither turns email codes on.
      expect(result.email).toBe(false);
    }
  });

  it("offers email codes in production only where email can go out, with Resend", () => {
    const resend = {
      RESEND_API_KEY: FAKE,
      EMAIL_FROM: "QRdx <a@qr.example.com>",
    };
    // Resend alone, on the localhost Docker test: still no way to email a code.
    expect(offered(ctx({ ...LOCAL_DOCKER, ...resend }, localBuild)).email).toBe(
      false,
    );
    expect(
      missingFeatureSetup(
        "emailSignIn",
        ctx({ ...LOCAL_DOCKER, ...resend }, localBuild),
      ),
    ).toEqual(["RESEND_API_KEY", "EMAIL_FROM", "NEXT_PUBLIC_APP_URL"]);
    // Those are all set, though: what admins are told is that email may not
    // go out from here (admin Health).
    expect(
      featureUnusableReason(
        "emailSignIn",
        ctx({ ...LOCAL_DOCKER, ...resend }, localBuild),
      ),
    ).toMatch(
      /^Outbound email is off on this deployment: .*QRDX_ALLOW_DEV_DELIVERY=1/,
    );
    // Resend on its own domain: codes are emailed.
    expect(
      offered(ctx({ ...ownDomain, ...resend }, { production: true })).email,
    ).toBe(true);
    // Its own domain without Resend: nothing to send them with.
    expect(offered(ctx(ownDomain, { production: true })).email).toBe(false);
    expect(
      missingFeatureSetup("emailSignIn", ctx(ownDomain, { production: true })),
    ).toEqual(["RESEND_API_KEY", "EMAIL_FROM"]);
    expect(
      featureUnusableReason(
        "emailSignIn",
        ctx(ownDomain, { production: true }),
      ),
    ).toBeNull();
  });

  it("keeps printing codes in the terminal in local dev, with nothing set", () => {
    expect(offered(ctx(LOCAL_DOCKER)).email).toBe(true);
    expect(missingFeatureSetup("emailSignIn", ctx(LOCAL_DOCKER))).toEqual([]);
    // QRDX_ALLOW_DEV_DELIVERY=1 in dev emails them instead, so Resend it is.
    expect(offered(ctx(LOCAL_DOCKER, { outboundDelivery: true })).email).toBe(
      false,
    );
  });

  it("agrees with canDeliverSignInCodes, the rule the server sends codes by", () => {
    for (const nodeEnv of ["development", "production"]) {
      for (const deliveryAllowed of [true, false]) {
        for (const emailConfigured of [true, false]) {
          const env = {
            ...ownDomain,
            ...(emailConfigured
              ? { RESEND_API_KEY: FAKE, EMAIL_FROM: "a@qr.example.com" }
              : {}),
          };
          const label = JSON.stringify({
            nodeEnv,
            deliveryAllowed,
            emailConfigured,
          });
          expect(
            offered(
              ctx(env, {
                production: nodeEnv === "production",
                outboundDelivery: deliveryAllowed,
              }),
            ).email,
            label,
          ).toBe(
            canDeliverSignInCodes({
              nodeEnv,
              deliveryAllowed,
              emailConfigured,
            }),
          );
        }
      }
    }
  });

  it("tells client components ids only", () => {
    const view = toPublicAvailability(
      computeFeatures(ctx(LOCAL_DOCKER, localBuild)),
    );
    expect(view.unavailable).toEqual(
      expect.arrayContaining(["googleSignIn", "githubSignIn", "emailSignIn"]),
    );
    expect(JSON.stringify(view)).not.toMatch(/CLIENT_ID|RESEND/);
  });
});

describe("passkeys", () => {
  const on = (env: Record<string, string | undefined>) =>
    computeFeatures(ctx(env, vercelProd)).passkeys;

  it("work on an HTTPS app URL, or localhost", () => {
    expect(on({ NEXT_PUBLIC_APP_URL: "https://qrdx.dev" })).toBe(true);
    expect(on({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).toBe(true);
  });

  it("are off where browsers won't offer them, naming the app URL", () => {
    for (const url of [
      "http://qr.example.com",
      "https://192.168.1.20",
      "http://127.0.0.1:3000",
      "not a url",
    ]) {
      const env = { NEXT_PUBLIC_APP_URL: url };
      expect(on(env), url).toBe(false);
      expect(missingFeatureSetup("passkeys", ctx(env, vercelProd))).toEqual([
        "NEXT_PUBLIC_APP_URL",
      ]);
    }
  });

  it("are off when the auth URL is on another origin than the app URL", () => {
    expect(
      on({
        NEXT_PUBLIC_APP_URL: "https://qrdx.dev",
        BETTER_AUTH_URL: "https://auth.qrdx.dev",
      }),
    ).toBe(false);
    expect(
      on({
        NEXT_PUBLIC_APP_URL: "https://qrdx.dev",
        BETTER_AUTH_URL: "https://qrdx.dev/",
      }),
    ).toBe(true);
  });

  it("hide their help page where they can't work", () => {
    const view = toPublicAvailability(
      computeFeatures(ctx({ NEXT_PUBLIC_APP_URL: "http://qr.lan" })),
    );
    expect(view.unavailable).toContain("passkeys");
    expect(view.hiddenPaths).toContain(
      "/docs/help/privacy-and-security/passkeys",
    );
  });
});

describe("workspace SSO", () => {
  const on = (env: Record<string, string | undefined>) =>
    computeFeatures(ctx(env)).sso;

  it("runs only with a valid licence key that covers it", () => {
    expect(on({ QRDX_EE_LICENSE: FAKE })).toBe(true);
    expect(on({})).toBe(false);
    expect(on({ QRDX_EE_LICENSE: "  " })).toBe(false);
    expect(missingFeatureSetup("sso", ctx({}))).toEqual(["QRDX_EE_LICENSE"]);
  });

  it("counts a key the server turned down as no key", () => {
    const invalid = ctx({ QRDX_EE_LICENSE: FAKE }, { eeFeatures: [] });
    expect(computeFeatures(invalid)).toMatchObject({
      sso: false,
      auditLog: false,
    });
    expect(missingFeatureSetup("sso", invalid)).toEqual(["QRDX_EE_LICENSE"]);
    expect(missingFeatureSetup("auditLog", invalid)).toEqual([
      "QRDX_EE_LICENSE",
    ]);
  });

  it("turns on only the features the licence lists", () => {
    const ssoOnly = ctx({ QRDX_EE_LICENSE: FAKE }, { eeFeatures: ["sso"] });
    expect(computeFeatures(ssoOnly)).toMatchObject({
      sso: true,
      auditLog: false,
    });
  });

  it("hides its settings page and help page without one", () => {
    const view = toPublicAvailability(computeFeatures(ctx({})));
    expect(view.unavailable).toContain("sso");
    expect(view.hiddenPaths).toEqual(
      expect.arrayContaining([
        "/dashboard/[workspace]/settings/sso",
        "/docs/help/teams/single-sign-on",
      ]),
    );
    expect(isPathShown(view.hiddenPaths, "/dashboard/acme/settings/sso")).toBe(
      false,
    );
  });
});

describe("client portal, white-label and conversions (ee/)", () => {
  const ids = ["clientPortal", "whiteLabel", "conversions"] as const;

  it("run only with a valid licence key that covers them, like SSO and the audit log", () => {
    for (const id of ids) {
      expect(computeFeatures(ctx({ QRDX_EE_LICENSE: FAKE }))[id]).toBe(true);
      expect(
        computeFeatures(ctx({ QRDX_EE_LICENSE: FAKE }, { eeFeatures: [] }))[id],
        id,
      ).toBe(false);
      expect(
        computeFeatures(
          ctx({ QRDX_EE_LICENSE: FAKE }, { eeFeatures: ["sso", "auditLog"] }),
        )[id],
        id,
      ).toBe(false);
      expect(computeFeatures(ctx({}))[id], id).toBe(false);
      expect(computeFeatures(ctx({ QRDX_EE_LICENSE: " " }))[id], id).toBe(
        false,
      );
      expect(missingFeatureSetup(id, ctx({})), id).toEqual(["QRDX_EE_LICENSE"]);
    }
  });

  it("hide the client portal's pages without one", () => {
    const view = toPublicAvailability(computeFeatures(ctx({})));
    expect(view.unavailable).toEqual(expect.arrayContaining([...ids]));
    expect(
      isPathShown(view.hiddenPaths, "/dashboard/acme/settings/clients"),
    ).toBe(false);
    expect(isPathShown(view.hiddenPaths, "/docs/client-portal")).toBe(false);
    expect(
      isPathShown(view.hiddenPaths, "/docs/developers/api/create-conversion"),
    ).toBe(false);
    // Shared stats pages and the tracking docs stay: only their ee/ parts go.
    expect(isPathShown(view.hiddenPaths, "/docs/client-reports")).toBe(true);
    expect(
      isPathShown(view.hiddenPaths, "/docs/tracking-and-conversions"),
    ).toBe(true);
    const licensed = toPublicAvailability(
      computeFeatures(ctx({ QRDX_EE_LICENSE: FAKE })),
    );
    expect(
      isPathShown(licensed.hiddenPaths, "/dashboard/acme/settings/clients"),
    ).toBe(true);
  });
});

describe("billing", () => {
  it("is Polar's access token, whatever its value", () => {
    expect(computeFeatures(ctx({ POLAR_ACCESS_TOKEN: FAKE })).billing).toBe(
      true,
    );
    expect(computeFeatures(ctx({})).billing).toBe(false);
    expect(computeFeatures(ctx({ POLAR_ACCESS_TOKEN: " " })).billing).toBe(
      false,
    );
    // The webhook secret alone sells nothing.
    expect(computeFeatures(ctx({ POLAR_WEBHOOK_SECRET: FAKE })).billing).toBe(
      false,
    );
  });
});

describe("the ee features on every plan", () => {
  const SELF_HOSTED = {
    NEXT_PUBLIC_APP_URL: "https://qr.example.org",
    QRDX_EE_LICENSE: FAKE,
  };
  const on = (
    env: Record<string, string | undefined>,
    flags: Parameters<typeof ctx>[1] = {},
  ) => eeOnEveryPlan(ctx(env, flags));

  it("only on a self-hosted copy with the licence key and no billing", () => {
    expect(on(SELF_HOSTED)).toBe(true);
    expect(on(SELF_HOSTED, vercelProd)).toBe(true);
    expect(on({ ...SELF_HOSTED, NEXT_PUBLIC_APP_URL: "http://qr.lan" })).toBe(
      true,
    );
  });

  it("never without a valid key", () => {
    expect(on({ ...SELF_HOSTED, QRDX_EE_LICENSE: undefined })).toBe(false);
    expect(on({ ...SELF_HOSTED, QRDX_EE_LICENSE: "  " })).toBe(false);
    expect(on(SELF_HOSTED, { eeFeatures: [] })).toBe(false);
  });

  it("never where plans are sold", () => {
    expect(on({ ...SELF_HOSTED, POLAR_ACCESS_TOKEN: FAKE })).toBe(false);
  });

  it("never on QRdx itself: qrdx.dev, its previews and local dev", () => {
    for (const appUrl of [
      "https://qrdx.dev",
      "https://www.qrdx.dev",
      "http://localhost:3000",
    ]) {
      expect(on({ ...SELF_HOSTED, NEXT_PUBLIC_APP_URL: appUrl }), appUrl).toBe(
        false,
      );
    }
    expect(
      on({
        ...SELF_HOSTED,
        NEXT_PUBLIC_APP_URL: "https://qrdx-git-branch.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "qrdx.dev",
      }),
    ).toBe(false);
    // Even if qrdx.dev ever ran without its Polar token.
    expect(on({ ...EVERYTHING, POLAR_ACCESS_TOKEN: undefined })).toBe(false);
  });
});

describe("custom domains", () => {
  it("need the Vercel Domains API on Vercel", () => {
    expect(customDomainMode(ctx({}, vercelProd))).toBe("disabled");
    expect(computeFeatures(ctx({}, vercelProd)).customDomains).toBe(false);
    expect(customDomainMode(ctx(EVERYTHING, vercelProd))).toBe("vercel");
  });

  it("verify by DNS off Vercel (self-hosting and local dev), with nothing set", () => {
    expect(customDomainMode(ctx({}))).toBe("manual");
    expect(computeFeatures(ctx({}, { production: true })).customDomains).toBe(
      true,
    );
    expect(missingFeatureSetup("customDomains", ctx({}))).toEqual([]);
  });

  it("use the Domains API wherever its token and project are set", () => {
    expect(customDomainMode(ctx(EVERYTHING))).toBe("vercel");
  });

  it("gate their catalog entries, Tag Manager included", () => {
    expect(featureForCatalogSlug("custom-domains")).toBe("customDomains");
    expect(featureForCatalogSlug("google-tag-manager")).toBe("customDomains");
    expect(featureForCatalogSlug("email-alerts")).toBe("email");
    expect(featureForCatalogSlug("discord-bot")).toBe("discordBot");
    // The webhook alerts need nothing; only the bot is set up.
    expect(featureForCatalogSlug("discord")).toBeUndefined();
    expect(featureForCatalogSlug("google-analytics")).toBeUndefined();
  });
});

describe("what client components learn", () => {
  it("lists unavailable ids and their pages, never variable names", () => {
    const view = toPublicAvailability(computeFeatures(ctx({}, vercelProd)), [
      "slack",
      "notion",
    ]);
    expect(view.unavailable).toEqual([...FEATURE_IDS]);
    expect(view.hiddenPaths).toEqual(
      expect.arrayContaining([
        "/ai",
        "/ai/art",
        "/dashboard/[workspace]/settings/domains",
        "/docs/custom-domains",
      ]),
    );
    expect(view.hiddenIntegrations).toEqual(["notion", "slack"]);
    expect(JSON.stringify(view)).not.toMatch(/[A-Z]{2,}_[A-Z]/);
  });

  it("hides nothing when everything works", () => {
    expect(
      toPublicAvailability(computeFeatures(ctx(EVERYTHING, vercelProd))),
    ).toEqual({ unavailable: [], hiddenPaths: [], hiddenIntegrations: [] });
  });

  it("matches links by exact path, ignoring query and hash", () => {
    const hidden = ["/ai/art", "/dashboard/[workspace]/settings/domains"];
    expect(isPathShown(hidden, "/ai/art")).toBe(false);
    expect(isPathShown(hidden, "/dashboard/acme/settings/domains")).toBe(false);
    expect(isPathShown(hidden, "/ai/art?prompt=x#top")).toBe(false);
    expect(isPathShown(hidden, "/ai")).toBe(true);
    expect(isPathShown(hidden, "/dashboard")).toBe(true);
    expect(isPathShown(hidden, "https://github.com/qrdxinc/qrdx")).toBe(true);
  });
});

describe("catalog paragraphs", () => {
  const youtube = {
    slug: "youtube",
    description: ["Paste any link."],
    configuredExtras: ["Pick from your channel."],
  };

  it("adds a picker's paragraph only where the picker works", () => {
    const on = computeFeatures(ctx(EVERYTHING, vercelProd));
    const off = computeFeatures(ctx({}, vercelProd));
    expect(catalogParagraphs(youtube, on)).toEqual([
      "Paste any link.",
      "Pick from your channel.",
    ]);
    expect(catalogParagraphs(youtube, off)).toEqual(["Paste any link."]);
    expect(
      catalogParagraphs({ slug: "stripe", description: ["A"] }, off),
    ).toEqual(["A"]);
  });
});

describe("the Slack bot", () => {
  it("needs the Slack app, its signing secret and, in production, the encryption key", () => {
    const slackApp = {
      SLACK_CLIENT_ID: FAKE,
      SLACK_CLIENT_SECRET: FAKE,
      SLACK_SIGNING_SECRET: FAKE,
    };
    expect(computeFeatures(ctx(slackApp)).slackBot).toBe(true);
    expect(computeFeatures(ctx(slackApp, vercelProd)).slackBot).toBe(false);
    expect(
      computeFeatures(
        ctx({ ...slackApp, INTEGRATION_ENCRYPTION_KEY: FAKE }, vercelProd),
      ).slackBot,
    ).toBe(true);
    // "Add to Slack" alerts alone (no signing secret) leave the bot off.
    expect(
      missingFeatureSetup(
        "slackBot",
        ctx({ SLACK_CLIENT_ID: FAKE, SLACK_CLIENT_SECRET: FAKE }),
      ),
    ).toEqual(["SLACK_SIGNING_SECRET"]);
  });

  it("hides its docs page while it's off", () => {
    const off = toPublicAvailability(computeFeatures(ctx({}, vercelProd)));
    expect(off.hiddenPaths).toContain("/docs/slack-bot");
    expect(isPathShown(off.hiddenPaths, "/docs/slack-bot")).toBe(false);
  });

  it("hides each chat bot's landing page with its bot", () => {
    const off = toPublicAvailability(computeFeatures(ctx({}, vercelProd)));
    for (const path of ["/slack", "/telegram", "/discord"]) {
      expect(isPathShown(off.hiddenPaths, path), path).toBe(false);
    }
    // Discord switched off, the others set up.
    const { DISCORD_APPLICATION_ID, ...withoutDiscord } = EVERYTHING;
    expect(DISCORD_APPLICATION_ID).toBeDefined();
    const some = toPublicAvailability(
      computeFeatures(ctx(withoutDiscord, vercelProd)),
    );
    expect(some.hiddenPaths).toEqual(["/docs/discord-bot", "/discord"]);
  });

  it("shows the Slack entry's bot parts only where the bot works", () => {
    initializeIntegrations();
    const slack = getCatalogBySurface("integrations").find(
      (entry) => entry.slug === "slack",
    );
    if (!slack?.configured) throw new Error("no Slack bot copy");
    const on = configuredEntry(slack, () => true);
    const off = configuredEntry(slack, () => false);
    expect(off).toBe(slack);
    expect(on.tagline).toBe(slack.configured.tagline);
    expect(on.steps).toEqual(slack.configured.steps);
    const extra = slack.configured.capabilities ?? [];
    expect(on.capabilities.slice(0, extra.length)).toEqual(extra);
    expect(on.keywords).toEqual(
      expect.arrayContaining(slack.configured.keywords ?? []),
    );
    // Listed under Chat apps too, but only where the bot works.
    expect(on.categories).toEqual(["notifications", "chat"]);
    expect(off.categories).toEqual(["notifications"]);
    // Without the bot nothing on the entry mentions it.
    const offText = JSON.stringify([
      off.tagline,
      off.steps,
      off.capabilities,
      off.keywords,
      off.description,
    ]);
    expect(offText).not.toMatch(/\/qr|\bbot\b|@QRdx/i);
    expect(
      catalogParagraphs(slack, computeFeatures(ctx({}, vercelProd))),
    ).toEqual(slack.description);
  });
});

// A deployment configured like production on 2026-11-02 (names from the
// owner's list), with AI_GATEWAY_API_KEY in place of the old Google key and
// the AI art and checkout switches removed on 2026-11-03. Anything not listed
// is unset.
const PRODUCTION_LIKE: Record<string, string> = {
  // Always set: the build requires it.
  NEXT_PUBLIC_APP_URL: "https://qrdx.dev",
  // The docs site (apps/docs) serves /docs since 14 November 2026.
  DOCS_ZONE_URL: "https://docs.qrdx.dev",
  // qrdx.dev runs the ee/ features (workspace SSO) with its own key.
  QRDX_EE_LICENSE: FAKE,
  ...Object.fromEntries(
    [
      "DROPBOX_CLIENT_ID",
      "DROPBOX_CLIENT_SECRET",
      "DUB_CLIENT_ID",
      "DUB_CLIENT_SECRET",
      "DUB_REDIRECT_URI",
      "EMAIL_FROM",
      "AI_GATEWAY_API_KEY",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_DRIVE_REDIRECT_URI",
      "INTEGRATION_ENCRYPTION_KEY",
      "CRON_SECRET",
      "R2_ACCESS_KEY_ID",
      "R2_ACCOUNT_ID",
      "R2_BUCKET",
      "R2_PUBLIC_BASE_URL",
      "R2_SECRET_ACCESS_KEY",
      "RESEND_API_KEY",
      "WEB_RISK_API_KEY",
      "POLAR_ACCESS_TOKEN",
      "POLAR_WEBHOOK_SECRET",
    ].map((name) => [name, FAKE]),
  ),
};

describe("a production-like deployment", () => {
  const features = computeFeatures(ctx(PRODUCTION_LIKE, vercelProd));

  it("offers AI themes and art, the docs assistant, storage, email, link safety, cron, and Google and email sign-in", () => {
    for (const id of [
      "aiThemes",
      "aiArt",
      "docsChat",
      "fileStorage",
      "email",
      "linkSafety",
      "scheduledJobs",
      "googleSignIn",
      "emailSignIn",
    ] as const) {
      expect(features[id], id).toBe(true);
    }
  });

  it("leaves out adding custom domains, the spam check, the media pickers, GitHub sign-in, the chat bots and euro prices", () => {
    expect(FEATURE_IDS.filter((id) => !features[id])).toEqual([
      "customDomains",
      "domainConnect",
      "spamCheck",
      "youtubeChannelPicker",
      "spotifyPlaylistPicker",
      // The list above has no GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET.
      "githubSignIn",
      "slackBot",
      "discordBot",
      "telegramBot",
      // Off until the EUR prices exist in Polar and the flag is set.
      "eurPrices",
    ]);
  });

  it("hides the integrations it can't connect, Tag Manager and custom domains", () => {
    initializeIntegrations();
    const registry = getIntegrationRegistry();
    const featureCtx = ctx(PRODUCTION_LIKE, vercelProd);
    const availability = computeAvailability(
      [
        ...getCatalogBySurface("integrations").map((entry) => entry.slug),
        "custom-domains",
        "email-alerts",
      ],
      {
        env: PRODUCTION_LIKE,
        production: true,
        definition: (slug) => registry.get(slug),
        credentials: (slug) => INTEGRATION_ENV_VARS[slug],
        featureSetup: (slug) => {
          const id = featureForCatalogSlug(slug);
          return id && missingFeatureSetup(id, featureCtx);
        },
      } satisfies AvailabilityContext,
    );
    expect(toAvailabilityView(availability).hidden).toEqual(
      [
        "calendly",
        "custom-domains",
        "discord-bot",
        "google-tag-manager",
        "hubspot",
        "mailchimp",
        "notion",
        "onedrive",
        "pipedrive",
        "slack",
        "telegram",
        "zoho-crm",
      ].sort(),
    );
    for (const slug of [
      "bitly",
      "rebrandly",
      "short-io",
      "dropbox",
      "stripe",
      "shopify",
      "calcom",
      "dub",
      "google-drive",
      "google-sheets",
      "segment",
      "email-alerts",
    ]) {
      expect(isVisible(availability, slug), slug).toBe(true);
    }
  });
});
