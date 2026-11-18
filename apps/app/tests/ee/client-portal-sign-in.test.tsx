// The client portal's sign-in card, signed out (ee/client-portal/portal-gate.tsx
// and portal-sign-in.tsx). Email codes are the portal's only way in, and the
// card follows the running server's answer for this request
// (getSignInOptions, the one the main sign-in follows): where no code can
// be delivered it says email sign-in isn't set up, shows no form that can
// only fail, and doesn't promise "We'll send you a one-time code" above
// that line.
import { describe, expect, it, vi } from "vitest";
import type { PortalWorkspace } from "@/ee/client-portal/portal";
import type { SignInOptions } from "@/lib/auth/sign-in-options";
import en from "@/messages/en.json";
import { renderIntl } from "../support/intl";

const server = vi.hoisted(() => ({
  options: {
    google: false,
    github: false,
    email: true,
    sso: false,
  } as SignInOptions,
}));

vi.mock("@/lib/auth/sign-in-options-server", () => ({
  getSignInOptions: () => server.options,
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    refresh: () => undefined,
    prefetch: () => undefined,
    back: () => undefined,
    forward: () => undefined,
  }),
  usePathname: () => "/portal/acme",
  useSearchParams: () => new URLSearchParams(),
}));
// Server actions the email form's other parts import; none runs here.
vi.mock("@/ee/sso/sign-in-offer", () => ({ ssoSignInOffer: vi.fn() }));
vi.mock("@/app/(app)/(auth)/sign-in/_lib/two-factor-actions", () => ({}));

const { PortalGate } = await import("@/ee/client-portal/portal-gate");

const PORTAL: PortalWorkspace = {
  id: "ws_acme",
  slug: "acme",
  brand: { name: "Acme", logo: null, accent: null },
  retentionDays: 365,
};

const form = en.auth.emailCodeSignIn;
const escaped = (text: string) => text.replaceAll("'", "&#x27;");

const renderSignedOut = (options: Partial<SignInOptions>) => {
  server.options = {
    google: false,
    github: false,
    email: false,
    sso: false,
    ...options,
  };
  return renderIntl(
    <PortalGate portal={PORTAL} viewer={{ kind: "signed-out" }} />,
  );
};

describe("the client portal's sign-in card", () => {
  it("where no code can be delivered, says so and promises no code", () => {
    // GitHub works here, but the portal only signs in with codes.
    const html = renderSignedOut({ github: true });

    expect(html).not.toContain("one-time code");
    expect(html).toContain(escaped(form.emailSignInIsntSet));
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain(form.emailMeACode);
    // Still says whose reports these are.
    expect(html).toContain("Use the email address Acme invited.");
  });

  it("where codes can be delivered, promises one and shows the form", () => {
    const html = renderSignedOut({ email: true });

    expect(html).toContain(escaped("We'll send you a one-time code."));
    expect(html).toContain('type="email"');
    expect(html).toContain(form.emailMeACode);
    expect(html).not.toContain(escaped(form.emailSignInIsntSet));
  });
});
