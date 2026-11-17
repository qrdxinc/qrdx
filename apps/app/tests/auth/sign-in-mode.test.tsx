// /sign-in?mode=signup: the page opens the same panel as the dialog's
// sign-up (initialMode="signup"), for links that can't open the dialog (the
// marketing site's "Use template"). Only that exact value; anything else is
// a sign-in, and `next` is handled as without it.
import { describe, expect, it, vi } from "vitest";
import { SignInPage } from "@/app/(app)/(auth)/sign-in/sign-in-page";
import en from "@/messages/en.json";
import { renderIntl } from "../support/intl";

vi.mock("@repo/auth/server", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
// The panel's hooks outside an app router: a static render needs none of
// their behavior.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    refresh: () => undefined,
    prefetch: () => undefined,
    back: () => undefined,
    forward: () => undefined,
  }),
  usePathname: () => "/sign-in",
  useSearchParams: () => new URLSearchParams(),
}));

const panel = en.auth.signInPanel;

/** The page as the server renders it for `query`. */
async function page(query: Record<string, string | string[]>) {
  const { default: Page } = await import("@/app/(app)/(auth)/sign-in/page");
  return Page({ searchParams: Promise.resolve(query) });
}

describe("/sign-in?mode=", () => {
  it("passes signup to the page only for exactly mode=signup", async () => {
    const props = async (query: Record<string, string | string[]>) =>
      (await page(query)).props as { mode: string; next: string };
    expect(await props({ mode: "signup", next: "/dashboard/codes" })).toEqual(
      expect.objectContaining({ mode: "signup", next: "/dashboard/codes" }),
    );
    for (const mode of ["signin", "Signup", "sign-up", "auto", ""]) {
      expect((await props({ mode })).mode, mode).toBe("signin");
    }
    expect((await props({})).mode).toBe("signin");
    // `next` stays as it is without the mode, unsafe ones refused alike.
    expect((await props({ mode: "signup", next: "//evil.example" })).next).toBe(
      "/dashboard",
    );
  });

  it("renders the sign-up heading for signup and the sign-in one otherwise", () => {
    const signUp = renderIntl(
      <SignInPage
        mode="signup"
        next="/dashboard?to=pages&new=menu&template=cafe"
        signedOut={false}
      />,
    );
    expect(signUp).toContain(panel.createYourQrdxAccount);
    expect(signUp).toContain(panel.freeToStartNoCard);
    expect(signUp).not.toContain(panel.signInToQrdx);

    for (const mode of ["signin", undefined] as const) {
      const signIn = renderIntl(
        <SignInPage mode={mode} next="/dashboard" signedOut={false} />,
      );
      expect(signIn, String(mode)).toContain(panel.signInToQrdx);
      expect(signIn, String(mode)).toContain(panel.pickUpWhereYouLeft);
      expect(signIn, String(mode)).not.toContain(panel.createYourQrdxAccount);
    }
  });

  it("renders the page in the mode the query asks for", async () => {
    expect(renderIntl(await page({ mode: "signup" }))).toContain(
      panel.createYourQrdxAccount,
    );
    expect(renderIntl(await page({ mode: "nope" }))).toContain(
      panel.signInToQrdx,
    );
  });
});
