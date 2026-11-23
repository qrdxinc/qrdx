// Ownership of self-serve OAuth apps (lib/oauth-apps/access.ts) and the
// authorization-request checks that use the app's settings
// (lib/oauth-apps/authorize.ts). Nothing here touches a database.
import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({ database: {} }));

import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import {
  canEditOAuthApp,
  canManageOAuthApps,
  isAppInScope,
  isFirstPartyApp,
  isTrustedApp,
} from "@/lib/oauth-apps/access";
import {
  authorizeParamEntries,
  checkAuthorizeApp,
  checkAuthorizeParams,
  readAuthorizeParams,
  redirectWith,
} from "@/lib/oauth-apps/authorize";

const alice = "user_alice";
const bob = "user_bob";
const acme = "org_acme";
const other = "org_other";

// Someone's own workspace (what used to be their personal workspace).
const personal = (userId: string) => ({
  userId,
  organizationId: ownWorkspaceId(userId),
  role: "owner" as const,
});
const team = (
  userId: string,
  organizationId: string,
  role: "owner" | "admin" | "member",
) => ({ userId, organizationId, role });

const alicePersonalApp = {
  ownerUserId: alice,
  organizationId: ownWorkspaceId(alice),
  registrationType: null,
};
const acmeApp = {
  ownerUserId: alice,
  organizationId: acme,
  registrationType: null,
};
const firstPartyApp = {
  ownerUserId: null,
  organizationId: null,
  registrationType: null,
};
// An MCP client that registered itself (lib/oauth-registration.ts): no
// owner either, but never first-party.
const dynamicApp = {
  ownerUserId: null,
  organizationId: null,
  registrationType: "dynamic",
};

describe("isAppInScope", () => {
  it("apps in someone's own workspace belong there only", () => {
    expect(isAppInScope(personal(alice), alicePersonalApp)).toBe(true);
    expect(isAppInScope(personal(bob), alicePersonalApp)).toBe(false);
    expect(isAppInScope(team(alice, acme, "owner"), alicePersonalApp)).toBe(
      false,
    );
  });

  it("team apps belong to the team, whoever created them", () => {
    expect(isAppInScope(team(bob, acme, "member"), acmeApp)).toBe(true);
    expect(isAppInScope(team(alice, other, "owner"), acmeApp)).toBe(false);
    // The creator's own workspace doesn't see the team's app.
    expect(isAppInScope(personal(alice), acmeApp)).toBe(false);
  });

  it("first-party apps belong to no workspace", () => {
    expect(isFirstPartyApp(firstPartyApp)).toBe(true);
    expect(isAppInScope(personal(alice), firstPartyApp)).toBe(false);
    expect(isAppInScope(team(alice, acme, "owner"), firstPartyApp)).toBe(false);
  });

  it("a self-registered client has no owner but is never first-party", () => {
    expect(isFirstPartyApp(dynamicApp)).toBe(false);
    expect(isAppInScope(personal(alice), dynamicApp)).toBe(false);
    expect(canEditOAuthApp(team(alice, acme, "owner"), dynamicApp)).toBe(false);
  });
});

describe("canManageOAuthApps / canEditOAuthApp", () => {
  it("only owners manage: the personal workspace owner and team owners", () => {
    expect(canManageOAuthApps(personal(alice))).toBe(true);
    expect(canManageOAuthApps(team(alice, acme, "owner"))).toBe(true);
    expect(canManageOAuthApps(team(bob, acme, "admin"))).toBe(false);
    expect(canManageOAuthApps(team(bob, acme, "member"))).toBe(false);
  });

  it.each([
    ["owner of the personal app", personal(alice), alicePersonalApp, true],
    ["someone else", personal(bob), alicePersonalApp, false],
    ["team owner", team(bob, acme, "owner"), acmeApp, true],
    ["team admin", team(bob, acme, "admin"), acmeApp, false],
    ["team member", team(bob, acme, "member"), acmeApp, false],
    ["owner of another team", team(bob, other, "owner"), acmeApp, false],
    ["anyone, for a first-party app", personal(alice), firstPartyApp, false],
  ])("%s → %s", (_label, scope, app, expected) => {
    expect(canEditOAuthApp(scope, app)).toBe(expected);
  });
});

describe("isTrustedApp", () => {
  it("is verified or first-party", () => {
    expect(isTrustedApp({ ...firstPartyApp, verified: false })).toBe(true);
    expect(isTrustedApp({ ...acmeApp, verified: true })).toBe(true);
    expect(isTrustedApp({ ...acmeApp, verified: false })).toBe(false);
  });

  it("never for a self-registered client, even marked verified", () => {
    expect(isTrustedApp({ ...dynamicApp, verified: false })).toBe(false);
    expect(isTrustedApp({ ...dynamicApp, verified: true })).toBe(false);
  });
});

describe("authorization request", () => {
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  const query = (values: Record<string, string>) =>
    readAuthorizeParams((key) => values[key] ?? null);
  const base = {
    response_type: "code",
    client_id: "qrdx_app_123",
    redirect_uri: "https://acme.com/cb",
    scope: "codes:read profile:read",
    state: "xyz",
  };
  const app = {
    redirectUris: ["https://acme.com/cb"],
    scopes: ["profile:read", "codes:read"],
    pkceRequired: false,
  };

  it("needs the required params and response_type=code", () => {
    expect(checkAuthorizeParams(query({ ...base, client_id: "" }))?.error).toBe(
      "invalid_request",
    );
    expect(
      checkAuthorizeParams(query({ ...base, response_type: "token" }))?.error,
    ).toBe("unsupported_response_type");
    expect(checkAuthorizeParams(query(base))).toBeNull();
  });

  it("rejects malformed PKCE parameters", () => {
    expect(
      checkAuthorizeParams(
        query({
          ...base,
          code_challenge: challenge,
          code_challenge_method: "S512",
        }),
      )?.error,
    ).toBe("invalid_request");
    expect(
      checkAuthorizeParams(query({ ...base, code_challenge: "short" }))
        ?.description,
    ).toBe("Malformed code_challenge");
  });

  it("returns the granted scopes in canonical order", () => {
    expect(checkAuthorizeApp(app, query(base))).toEqual({
      ok: true,
      scopes: ["profile:read", "codes:read"],
    });
  });

  it("refuses unregistered redirect URIs and scopes beyond the app's", () => {
    expect(
      checkAuthorizeApp(
        app,
        query({ ...base, redirect_uri: "https://acme.com/cb/" }),
      ),
    ).toMatchObject({ ok: false, error: "invalid_request" });
    expect(
      checkAuthorizeApp(app, query({ ...base, scope: "codes:write" })),
    ).toMatchObject({ ok: false, error: "invalid_scope" });
  });

  it("enforces PKCE with S256 when the app requires it", () => {
    const strict = { ...app, pkceRequired: true };
    expect(checkAuthorizeApp(strict, query(base))).toMatchObject({
      ok: false,
      error: "invalid_request",
    });
    expect(
      checkAuthorizeApp(
        strict,
        query({
          ...base,
          code_challenge: challenge,
          code_challenge_method: "plain",
        }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      checkAuthorizeApp(strict, query({ ...base, code_challenge: challenge })),
    ).toMatchObject({ ok: true });
  });

  it("round-trips only the params that were sent", () => {
    expect(authorizeParamEntries(query(base))).toEqual([
      ["response_type", "code"],
      ["client_id", "qrdx_app_123"],
      ["redirect_uri", "https://acme.com/cb"],
      ["scope", "codes:read profile:read"],
      ["state", "xyz"],
    ]);
    expect(
      authorizeParamEntries(query({ ...base, code_challenge: challenge })),
    ).toContainEqual(["code_challenge_method", "S256"]);
  });

  it("refuses a resource that isn't this server's (RFC 8707)", () => {
    expect(
      checkAuthorizeParams(
        query({ ...base, resource: "https://evil.example/mcp" }),
      )?.error,
    ).toBe("invalid_target");
    expect(
      checkAuthorizeParams(
        query({ ...base, resource: "https://mcp.qrdx.dev/mcp" }),
      ),
    ).toBeNull();
    expect(
      checkAuthorizeParams(
        query({ ...base, resource: "http://localhost:3000/api/mcp" }),
      ),
    ).toBeNull();
  });

  describe("a self-registered client", () => {
    const mcpClient = {
      redirectUris: [
        "https://claude.ai/api/mcp/auth_callback",
        "http://127.0.0.1/callback",
      ],
      scopes: ["codes:read", "codes:write"],
      pkceRequired: true,
      dynamic: true,
    };
    const pkce = {
      code_challenge: challenge,
      code_challenge_method: "S256",
    };
    const request = (values: Record<string, string>) =>
      query({
        response_type: "code",
        client_id: "qrdx_app_mcp",
        redirect_uri: "https://claude.ai/api/mcp/auth_callback",
        ...pkce,
        ...values,
      });

    it("gets its registered scopes when it names none", () => {
      expect(checkAuthorizeApp(mcpClient, request({}))).toEqual({
        ok: true,
        scopes: ["codes:read", "codes:write"],
      });
    });

    it("gets the registered scopes it asked for, ignoring the rest", () => {
      expect(
        checkAuthorizeApp(
          mcpClient,
          request({ scope: "codes:write openid offline_access" }),
        ),
      ).toEqual({ ok: true, scopes: ["codes:write"] });
      expect(
        checkAuthorizeApp(mcpClient, request({ scope: "profile:read" })),
      ).toMatchObject({ ok: false, error: "invalid_scope" });
    });

    it("matches a loopback redirect URI on any port, nothing else", () => {
      expect(
        checkAuthorizeApp(
          mcpClient,
          request({ redirect_uri: "http://127.0.0.1:53682/callback" }),
        ),
      ).toMatchObject({ ok: true });
      for (const uri of [
        "http://127.0.0.1:53682/other",
        "http://localhost:53682/callback",
        "https://127.0.0.1:53682/callback",
        "https://claude.ai:8443/api/mcp/auth_callback",
        "http://127.0.0.1:53682/callback?x=1",
      ]) {
        expect(
          checkAuthorizeApp(mcpClient, request({ redirect_uri: uri })),
          uri,
        ).toMatchObject({ ok: false, error: "invalid_request" });
      }
    });

    it("needs PKCE", () => {
      expect(
        checkAuthorizeApp(
          mcpClient,
          query({
            response_type: "code",
            client_id: "qrdx_app_mcp",
            redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          }),
        ),
      ).toMatchObject({ ok: false, error: "invalid_request" });
    });
  });

  it("an app made in Settings still has to name its scopes", () => {
    const { scope: _scope, ...withoutScope } = base;
    expect(checkAuthorizeApp(app, query(withoutScope))).toMatchObject({
      ok: false,
      error: "invalid_request",
    });
  });

  it("keeps the redirect URI's own query and appends state", () => {
    expect(
      redirectWith(
        { redirectUri: "https://acme.com/cb?tenant=eu", state: "a b" },
        { error: "access_denied" },
      ),
    ).toBe("https://acme.com/cb?tenant=eu&error=access_denied&state=a+b");
  });
});
