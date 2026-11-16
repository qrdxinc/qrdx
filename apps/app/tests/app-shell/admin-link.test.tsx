// The user menu's Admin entry: with the console at its own address
// (ADMIN_CONSOLE_URL and its client secret), it points straight at the
// console's front page as a plain link to that host; without it (self-
// hosting, or a short secret), at this app's /admin. The menu's other parts
// (the session, the plan, the dropdown's portal) are stubbed; nothing
// touches a database or a service.
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const CONSOLE = "https://console.qrdx.dev";

const state = vi.hoisted(() => ({
  consoleUrl: undefined as string | undefined,
  secret: undefined as string | undefined,
  role: "admin" as string | null,
}));

vi.mock("@/env", async (importOriginal) => {
  const { env } = await importOriginal<typeof import("@/env")>();
  return {
    env: new Proxy(env, {
      get: (target, key) => {
        if (key === "ADMIN_CONSOLE_URL") return state.consoleUrl;
        if (key === "CONSOLE_ZONE_KEY") return state.secret;
        return target[key as keyof typeof target];
      },
    }),
  };
});
vi.mock("@repo/auth/client", () => ({
  authClient: {
    useSession: () => ({
      isPending: false,
      data: {
        user: {
          name: "Ada",
          email: "ada@example.com",
          image: null,
          role: state.role,
        },
      },
    }),
  },
}));
vi.mock("@/lib/hooks/use-subscription", () => ({
  useSubscription: () => ({ subscriptionStatus: null }),
}));
vi.mock("@/store/auth-store", () => ({
  useAuthStore: () => ({ openAuthDialog: () => {} }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/components/i18n/locale-link", () => ({
  LocaleLink: ({ href, children }: { href: string; children: ReactNode }) => (
    <a data-locale-link="" href={href}>
      {children}
    </a>
  ),
  useLocalizeHref: () => (href: string) => href,
  useLocaleRouter: () => ({ push: () => {} }),
}));
// The menu's content renders in place (Radix only mounts it when open).
vi.mock("@repo/design-system/components/ui/dropdown-menu", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    DropdownMenu: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuItem: Pass,
    DropdownMenuLabel: Pass,
    DropdownMenuSeparator: () => null,
    DropdownMenuTrigger: Pass,
  };
});

const { adminHomeHref } = await import("@/lib/admin-console/admin-home");
const { AdminHrefProvider } = await import("@/components/admin-href");
const { UserProfileDropdown } = await import(
  "@/components/user-profile-dropdown"
);

/** The menu as the root layout renders it, with adminHomeHref()'s value. */
const menu = () =>
  renderToStaticMarkup(
    <AdminHrefProvider value={adminHomeHref()}>
      <UserProfileDropdown signedIn />
    </AdminHrefProvider>,
  );

/** The Admin entry's link: its href and whether it's a same-app link. */
function adminLink(html: string) {
  const links = [...html.matchAll(/<a([^>]*)>(?:(?!<\/a>).)*?admin<\/a>/g)];
  expect(links).toHaveLength(1);
  const attributes = links[0]?.[1] ?? "";
  return {
    href: /href="([^"]*)"/.exec(attributes)?.[1],
    inApp: attributes.includes("data-locale-link"),
  };
}

beforeEach(() => {
  state.consoleUrl = undefined;
  state.secret = undefined;
  state.role = "admin";
});

describe("the user menu's Admin entry", () => {
  it("is this app's /admin while the console isn't at its own address", () => {
    expect(adminHomeHref()).toBe("/admin");
    expect(adminLink(menu())).toEqual({ href: "/admin", inApp: true });
  });

  it("stays /admin without a long enough client secret", () => {
    state.consoleUrl = CONSOLE;
    state.secret = "k".repeat(31);
    expect(adminHomeHref()).toBe("/admin");
  });

  it("is the console's front page, a plain link, once it's set up", () => {
    state.consoleUrl = `${CONSOLE}/`;
    state.secret = "k".repeat(32);
    expect(adminHomeHref()).toBe(`${CONSOLE}/`);
    expect(adminLink(menu())).toEqual({ href: `${CONSOLE}/`, inApp: false });
  });

  it("isn't there for anyone but an admin", () => {
    state.role = "user";
    expect(menu()).not.toMatch(/>admin<\/a>/);
  });

  it("is /admin with no provider at all", () => {
    expect(
      adminLink(renderToStaticMarkup(<UserProfileDropdown signedIn />)),
    ).toEqual({ href: "/admin", inApp: true });
  });
});
