// The workspace, team, join link, logo, "Move to workspace…" and two-step
// requirement actions, in another language: what they refuse with comes in
// the person's language (lib/i18n/workspace-actions.ts), which their pages
// show as it is. That language is the app's rule (lib/i18n/app-locale.ts,
// run for real here): the saved one, else the language menu's cookie, else
// English. Only next-intl's server entry, which needs Next's plugin, is
// swapped for what i18n/request.ts does: the locale's catalog over English.
// Also: the catalog's copies of the English constants other code still uses.

import {
  SLUG_FORMAT_MESSAGE,
  SLUG_RESERVED_MESSAGE,
} from "@repo/auth/workspace-rules";
import { TWO_FACTOR_REQUIRED_MESSAGE } from "@repo/auth/workspace-two-factor-rules";
import type { Locale } from "@repo/i18n/config";
import { mergeMessages } from "@repo/i18n/messages";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import { fakeDb } from "../support/fake-db";

type Role = "owner" | "admin" | "member" | "billing" | "viewer";

const state = vi.hoisted(() => ({
  scope: null as null | {
    userId: string;
    organizationId: string;
    role: "owner" | "admin" | "member" | "billing" | "viewer";
  },
  /** The language menu's cookie (NEXT_LOCALE), if any */
  cookieLocale: undefined as string | undefined,
  /** next-intl can't load a catalog */
  intlBroken: false,
  limited: false,
  /** What Better Auth's updateOrganization throws, if anything */
  updateError: null as null | string,
  errors: [] as string[],
}));

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
vi.mock("next/headers", async () => {
  const { LOCALE_COOKIE: localeCookie } = await import("@repo/i18n/config");
  return {
    headers: async () =>
      new Headers({ host: "localhost:3000", "x-real-ip": "203.0.113.9" }),
    cookies: async () => ({
      get: (name: string) =>
        name === localeCookie && state.cookieLocale !== undefined
          ? { name, value: state.cookieLocale }
          : undefined,
    }),
  };
});
// What i18n/request.ts gives getTranslations: the locale's catalog over
// English.
vi.mock("next-intl/server", async () => {
  const { createTranslator: translator } = await import("next-intl");
  const { loadMessages } = await import("@/lib/i18n/messages");
  return {
    getTranslations: async ({
      locale,
      namespace,
    }: {
      locale: Locale;
      namespace?: string;
    }) => {
      if (state.intlBroken) throw new Error("no catalog");
      return translator({
        locale,
        messages: await loadMessages(locale),
        namespace: namespace as never,
      });
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({ success: !state.limited }),
  }),
}));
vi.mock("@/lib/storage/r2", () => ({
  isStorageConfigured: true,
  putObject: async () => {},
  deleteObject: async () => {},
  publicUrl: () => null,
}));
vi.mock("@/lib/log-error", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/log-error")>()),
  logError: (error: Error, context?: { action?: string }) => {
    state.errors.push(`${context?.action}: ${error.message}`);
  },
}));
vi.mock("@/lib/shared", () => ({
  logError: (error: Error, context?: { action?: string }) => {
    state.errors.push(`${context?.action}: ${error.message}`);
  },
  getCurrentUser: async () => {
    if (!state.scope) {
      const { UnauthorizedError } = await import("@/types/errors");
      throw new UnauthorizedError();
    }
    return { id: state.scope.userId, email: "ada@example.com" };
  },
}));
// The session's workspace and role come from the test.
vi.mock("@/lib/scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scope")>();
  const { UnauthorizedError } = await import("@/types/errors");
  return {
    ...actual,
    getActiveScope: async () => {
      if (!state.scope) throw new UnauthorizedError();
      return state.scope;
    },
  };
});
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () =>
        state.scope
          ? {
              user: { id: state.scope.userId, email: "ada@example.com" },
              session: { id: "session_1" },
            }
          : null,
      updateOrganization: async () => {
        if (state.updateError) {
          throw Object.assign(new Error(state.updateError), {
            statusCode: 400,
            body: { code: state.updateError, message: state.updateError },
          });
        }
        return {};
      },
    },
  },
}));

const teams = await import("@/actions/organizations");
const join = await import("@/actions/workspace-join");
const logo = await import("@/actions/workspace-logo");
const moveCode = await import("@/actions/move-code");
const { setTwoFactorRequirement } = await import(
  "@/app/(app)/dashboard/team/_lib/two-factor-requirement-actions"
);
const { OWN_TWO_FACTOR_FIRST } = await import(
  "@/app/(app)/dashboard/team/_lib/two-factor-requirement"
);
const { forbiddenText } = await import("@/lib/i18n/workspace-actions");
const { forbiddenMessage, WORKSPACE_ROLES } = await import("@/lib/permissions");
const { LOGO_URL_PROBLEMS } = await import("@/lib/workspace-logo");
const { WorkspaceNotFoundError } = await import("@/lib/workspaces");

const ORG = "org_t";
const NOW = new Date("2026-11-04T12:00:00Z");

// The catalogs the actions read, to word the expected answers.
const english = createTranslator({
  locale: "en",
  messages: en,
  namespace: "workspaceActions",
});
const spanish = createTranslator({
  locale: "es",
  messages: mergeMessages(en, es),
  namespace: "workspaceActions",
});
type Text = typeof english;

/** The Spanish for `message`, checked to be a translation of the English. */
function inSpanish(message: (t: Text) => string): string {
  const text = message(spanish);
  expect(text).toBeTruthy();
  expect(text).not.toBe(message(english));
  return text;
}

/** Signed in to the team as `role`, with the language saved in Settings. */
function signIn(
  role: Role,
  { locale = null }: { locale?: string | null } = {},
) {
  state.scope = { userId: `u_${role}`, organizationId: ORG, role };
  fakeDb.seed("user", [
    {
      id: `u_${role}`,
      name: role,
      email: "ada@example.com",
      locale,
      createdAt: NOW,
    },
  ]);
}

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.seed("organization", [
    { id: ORG, name: "Team T", slug: "team-t", logo: null, createdAt: NOW },
  ]);
  state.scope = null;
  state.cookieLocale = undefined;
  state.intlBroken = false;
  state.limited = false;
  state.updateError = null;
  state.errors = [];
});

describe("workspace and team actions, with the language menu on Spanish", () => {
  beforeEach(() => {
    state.cookieLocale = "es";
  });

  it("refuses a workspace name and URL in Spanish", async () => {
    signIn("owner");
    expect(await teams.createWorkspace({ name: "A", slug: "acme" })).toEqual({
      ok: false,
      error: inSpanish((t) => t("organizations.nameTooShort")),
    });
    expect(await teams.checkWorkspaceSlug({ slug: "settings" })).toEqual({
      ok: true,
      data: {
        status: "unavailable",
        message: inSpanish((t) => t("organizations.slugReserved")),
      },
    });
    expect(await teams.checkWorkspaceSlug({ slug: "A!" })).toEqual({
      ok: true,
      data: {
        status: "unavailable",
        message: inSpanish((t) => t("organizations.slugFormat")),
      },
    });
    expect(state.errors).toEqual([]);
  });

  it("says why a role can't invite, in Spanish", async () => {
    signIn("member");
    expect(
      await teams.inviteMember({ email: "bo@example.com", role: "member" }),
    ).toEqual({
      ok: false,
      error: inSpanish((t) => t("forbidden.membersManage")),
    });
    signIn("viewer");
    expect(
      await teams.inviteMember({ email: "bo@example.com", role: "member" }),
    ).toEqual({
      ok: false,
      error: inSpanish((t) =>
        t("forbidden.viewer", { only: t("forbidden.membersManage") }),
      ),
    });
  });

  it("asks for a paid plan in Spanish, keeping the plans' names", async () => {
    signIn("owner");
    const result = await teams.createWorkspace({
      name: "Acme",
      slug: "acme",
    });
    const error = inSpanish((t) =>
      t("organizations.moreWorkspaces", { pro: "Pro", business: "Business" }),
    );
    expect(result).toEqual({ ok: false, error, upgrade: true });
    expect(error).toContain("Pro");
    expect(error).toContain("Business");
  });

  it("words Better Auth's codes and the delete check in Spanish", async () => {
    signIn("owner");
    state.updateError = "ORGANIZATION_SLUG_ALREADY_TAKEN";
    expect(await teams.updateWorkspace({ slug: "taken-one" })).toEqual({
      ok: false,
      error: inSpanish((t) => t("organizations.urlTaken")),
    });
    expect(
      await teams.deleteTeam({ organizationId: ORG, confirmSlug: "nope" }),
    ).toEqual({
      ok: false,
      error: inSpanish((t) => t("organizations.typeUrlToConfirm")),
    });
  });

  it("says join link refusals in Spanish, with the same codes", async () => {
    expect(await join.joinWorkspaceWithLink({ token: "" })).toEqual({
      ok: false,
      code: "JOIN_LINK_INVALID",
      error: inSpanish((t) => t("joinLinks.incomplete")),
    });
    signIn("member");
    // A well-formed token no link has: thrown by lib/workspace-join.ts.
    expect(await join.joinWorkspaceWithLink({ token: "a".repeat(43) })).toEqual(
      {
        ok: false,
        code: "JOIN_LINK_INVALID",
        error: inSpanish((t) => t("joinLinks.linkDead")),
      },
    );
    expect(await join.issueWorkspaceJoinLink({ role: "member" })).toEqual({
      ok: false,
      code: "FORBIDDEN",
      error: inSpanish((t) => t("forbidden.membersManage")),
    });
    signIn("admin");
    state.limited = true;
    expect(await join.disableWorkspaceJoinLink()).toEqual({
      ok: false,
      code: "RATE_LIMITED",
      error: inSpanish((t) => t("joinLinks.rateLimited")),
    });
  });

  it("refuses a logo in Spanish", async () => {
    signIn("owner");
    expect(
      await logo.setWorkspaceLogoUrl({ url: "http://example.com/logo.png" }),
    ).toEqual({
      ok: false,
      error: inSpanish((t) => t("logo.url.notHttps")),
    });
    signIn("billing");
    expect(await logo.removeWorkspaceLogo()).toEqual({
      ok: false,
      error: inSpanish((t) =>
        t("forbidden.billingRole", { only: t("forbidden.workspaceUpdate") }),
      ),
    });
  });

  it("says why a code can't move, in Spanish", async () => {
    signIn("owner");
    expect(
      await moveCode.moveQrCodeToWorkspace({
        id: "code_1",
        organizationId: ORG,
      }),
    ).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: inSpanish((t) => t("moveCode.alreadyHere")),
      },
    });
    // assertCan's ForbiddenError (lib/permissions-server.ts).
    signIn("viewer");
    expect(
      await moveCode.moveQrCodeToWorkspace({
        id: "code_1",
        organizationId: "org_b",
      }),
    ).toEqual({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: inSpanish((t) =>
          t("forbidden.viewer", { only: t("forbidden.contentWrite") }),
        ),
      },
    });
  });

  it("refuses the two-step requirement in Spanish", async () => {
    signIn("owner");
    expect(await setTwoFactorRequirement("on")).toEqual({
      ok: false,
      error: inSpanish((t) => t("twoFactorRequirement.invalidRequest")),
    });
    signIn("member");
    expect(await setTwoFactorRequirement({ required: true })).toEqual({
      ok: false,
      error: inSpanish((t) => t("forbidden.workspaceUpdate")),
    });
  });
});

describe("whose language it is", () => {
  it("is the account's saved one over the language menu's", async () => {
    signIn("owner", { locale: "es" });
    state.cookieLocale = "fr";
    expect(await teams.createWorkspace({ name: "A", slug: "acme" })).toEqual({
      ok: false,
      error: es.workspaceActions.organizations.nameTooShort,
    });
  });

  it("is English, as before, with neither", async () => {
    signIn("owner");
    expect(await teams.createWorkspace({ name: "A", slug: "acme" })).toEqual({
      ok: false,
      error: "Workspace name is too short.",
    });
    expect(await teams.createWorkspace({ name: "Acme", slug: "acme" })).toEqual(
      {
        ok: false,
        error: "More workspaces are part of Pro and Business.",
        upgrade: true,
      },
    );
    expect(
      await teams.deleteTeam({ organizationId: ORG, confirmSlug: "nope" }),
    ).toEqual({
      ok: false,
      error: "Type the workspace URL exactly to confirm.",
    });
    expect(await join.joinWorkspaceWithLink({ token: "a".repeat(43) })).toEqual(
      {
        ok: false,
        code: "JOIN_LINK_INVALID",
        error:
          "This join link doesn't work anymore. Ask the workspace for a new one.",
      },
    );
    expect(
      await logo.setWorkspaceLogoUrl({ url: "http://example.com/logo.png" }),
    ).toEqual({ ok: false, error: "Use an https:// image URL." });
    expect(
      await moveCode.moveQrCodeToWorkspace({
        id: "code_1",
        organizationId: ORG,
      }),
    ).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "The code is already in this workspace.",
      },
    });
    signIn("viewer");
    expect(
      await moveCode.moveQrCodeToWorkspace({
        id: "code_1",
        organizationId: "org_b",
      }),
    ).toEqual({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: forbiddenMessage("viewer", "content.write"),
      },
    });
    expect(await setTwoFactorRequirement({ required: true })).toEqual({
      ok: false,
      error:
        "You're a viewer here. Only owners and admins can change this workspace's settings.",
    });
    expect(state.errors).toEqual([]);
  });

  it("is English, logged, when the catalog can't be read", async () => {
    signIn("owner");
    state.cookieLocale = "es";
    state.intlBroken = true;
    expect(await teams.createWorkspace({ name: "A", slug: "acme" })).toEqual({
      ok: false,
      error: "Workspace name is too short.",
    });
    expect(state.errors).toEqual(["workspaceActions.text: no catalog"]);
  });
});

describe("the catalog's copies of the English constants", () => {
  const messages = en.workspaceActions;

  it("match forbiddenMessage for every role", () => {
    for (const role of WORKSPACE_ROLES) {
      for (const action of [
        "content.write",
        "workspace.update",
        "members.manage",
      ] as const) {
        expect(forbiddenText(english, role, action)).toBe(
          forbiddenMessage(role, action),
        );
      }
    }
  });

  it("match the slug, two-step and workspace messages", () => {
    expect(messages.organizations.slugFormat).toBe(SLUG_FORMAT_MESSAGE);
    expect(messages.organizations.slugReserved).toBe(SLUG_RESERVED_MESSAGE);
    expect(messages.shared.twoFactorRequired).toBe(TWO_FACTOR_REQUIRED_MESSAGE);
    expect(messages.shared.workspaceNotFound).toBe(
      new WorkspaceNotFoundError().message,
    );
    expect(messages.twoFactorRequirement.ownFirst).toBe(OWN_TWO_FACTOR_FIRST);
  });

  it("match LOGO_URL_PROBLEMS, every one", () => {
    expect(messages.logo.url).toEqual(LOGO_URL_PROBLEMS);
  });
});
