// domain_verified (lib/analytics/domain-verified.ts), through the real
// addDomain and verifyDomain (app/(app)/dashboard/domains/_lib/domains.ts)
// against the in-memory database, with the DNS check and the plan faked and
// a fake PostHog endpoint. Sent once per domain, after the response, when it
// first passes; `after_import` says whether the workspace had imported codes
// from links on it; never the domain. Nothing connects anywhere.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key";
  return {
    consent: false,
    /** Whether the domain's DNS points at QRdx yet */
    dnsOk: false,
    tasks: [] as (() => unknown)[],
    sent: [] as {
      event: string;
      distinct_id: string;
      properties: Record<string, unknown>;
    }[],
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
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    state.tasks.push(task);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "qrdx_analytics" && state.consent ? { value: "1" } : undefined,
  }),
}));
vi.mock("@/lib/custom-domains", () => ({
  getCustomDomainMode: () => "vercel",
  checkVercelDomain: async () => ({
    verified: state.dnsOk,
    records: [],
    apexName: "brand.com",
    message: state.dnsOk ? null : "Add the CNAME record.",
  }),
  getVercelProjectDomain: async () => null,
  removeVercelProjectDomain: async () => {},
  checkManualDomain: async () => {
    throw new Error("manual mode isn't used here");
  },
  createVerificationToken: () => "token",
  manualRecords: () => [],
  VercelApiError: class VercelApiError extends Error {},
}));
vi.mock("@/lib/plans", () => ({
  getPlanForScope: async () => "pro",
  getPlanLimits: () => ({ customDomains: 3 }),
}));
vi.mock("@/ee/audit-log/record", () => ({ recordAuditEvent: () => {} }));
vi.mock("@/lib/slug-claims", () => ({ releaseDomainSlugs: async () => {} }));
// The scope comes from the test; no session is read.
vi.mock("@repo/auth/server", () => ({ auth: { api: {} } }));

import {
  addDomain,
  verifyDomain,
} from "@/app/(app)/dashboard/domains/_lib/domains";
import { importedOntoDomain } from "@/lib/analytics/domain-verified";
import type { ActiveScope } from "@/lib/scope";
import { fakeDb } from "../support/fake-db";

const SCOPE: ActiveScope = {
  userId: "user_1",
  organizationId: "org_1",
  role: "owner",
};

/** An imported code's notes, as lib/migrate/normalize.ts writes them. */
const importedNotes = (link: string) =>
  `Imported from Bitly ${link} on 2026-11-18.\n[import:bitly:${link}]`;

function code(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    userId: "user_1",
    organizationId: "org_1",
    domainId: null,
    notes: null,
    deletedAt: null,
    ...patch,
  };
}

async function flush() {
  while (state.tasks.length > 0) {
    await Promise.all(state.tasks.splice(0).map((task) => task()));
  }
}

const verifiedEvents = () =>
  state.sent.filter((body) => body.event === "domain_verified");

beforeEach(() => {
  fakeDb.reset();
  state.consent = false;
  state.dnsOk = false;
  state.tasks = [];
  state.sent = [];
  vi.stubEnv("NODE_ENV", "production");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      state.sent.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("domain_verified", () => {
  it("goes out once, when Verify first passes, after an import onto it", async () => {
    const added = await addDomain(SCOPE, "go.brand.com");
    expect(added.verified).toBe(false);
    // Imported while the domain was pending: the codes wait on it.
    fakeDb.seed("qrCode", [
      code("code_1", {
        domainId: added.id,
        notes: importedNotes("go.brand.com/menu"),
      }),
    ]);
    await verifyDomain(SCOPE, added.id);
    await flush();
    expect(verifiedEvents()).toHaveLength(0);

    state.dnsOk = true;
    await verifyDomain(SCOPE, added.id);
    expect(state.sent).toHaveLength(0);
    await flush();
    // Verified domains only refresh their records afterwards.
    await verifyDomain(SCOPE, added.id);
    await flush();

    const events = verifiedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.properties).toMatchObject({
      after_import: true,
      channel: "unknown",
    });
    expect(events[0]?.distinct_id).not.toBe("user_1");
    expect(JSON.stringify(state.sent)).not.toMatch(/brand\.com|menu/);
  });

  it("goes out when a domain already points at QRdx as it's added", async () => {
    state.dnsOk = true;
    state.consent = true;
    const added = await addDomain(SCOPE, "links.cafe-rosa.net");
    expect(added.verified).toBe(true);
    await flush();
    const events = verifiedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.properties.after_import).toBe(false);
    expect(events[0]?.distinct_id).toBe("user_1");
    expect(JSON.stringify(state.sent)).not.toContain("cafe-rosa");
  });

  it("isn't sent outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    state.dnsOk = true;
    await addDomain(SCOPE, "go.brand.com");
    expect(state.tasks).toHaveLength(0);
  });
});

describe("after_import", () => {
  const domain = { id: "dom_1", hostname: "go.brand.com" };

  it("counts imported codes on the domain, or waiting to move onto it", async () => {
    fakeDb.seed("qrCode", [
      code("on", { domainId: "dom_1", notes: importedNotes("go.brand.com/a") }),
    ]);
    expect(await importedOntoDomain(SCOPE, domain)).toBe(true);

    fakeDb.reset();
    // Still on qrdx.dev: its notes name the old link on the domain.
    fakeDb.seed("qrCode", [
      code("waiting", { notes: importedNotes("go.brand.com/b") }),
    ]);
    expect(await importedOntoDomain(SCOPE, domain)).toBe(true);
  });

  it("ignores codes that weren't imported, other domains, other workspaces and the trash", async () => {
    fakeDb.seed("qrCode", [
      code("made_here", { domainId: "dom_1", notes: "Table 4" }),
      code("other_host", { notes: importedNotes("shop.go.brand.com/c") }),
      code("other_team", {
        organizationId: "org_2",
        notes: importedNotes("go.brand.com/d"),
      }),
      code("deleted", {
        domainId: "dom_1",
        notes: importedNotes("go.brand.com/e"),
        deletedAt: new Date("2026-11-17T00:00:00Z"),
      }),
    ]);
    expect(await importedOntoDomain(SCOPE, domain)).toBe(false);
  });
});
