// Free's one first-scan email per code (lib/email/first-scan.tsx): to the
// code's maker, on its first scan after the test window, never on a plan
// with email alerts, never twice, only where notes from the team exist, in
// the maker's language, with one line on Pro. Tables in memory, sendEmail
// captured: nothing is sent or stored.
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "free" as "free" | "pro" | "business",
  teamNotes: true,
  sendResult: { sent: true, id: "em_1" } as
    | { sent: true; id: string }
    | { sent: false; reason: "failed"; error: string },
  sent: [] as {
    to: string;
    subject: string;
    react: ReactElement;
    unsubscribeUrl?: string;
    idempotencyKey?: string;
    tags?: { name: string; value: string }[];
  }[],
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/feature-availability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/feature-availability")>()),
  isFeatureAvailable: (id: string) => id === "teamNotes" && state.teamNotes,
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));
vi.mock("@/lib/workspaces", () => ({ workspaceSlug: async () => "acme" }));
vi.mock("@/lib/email/send", () => ({
  isEmailConfigured: true,
  sendEmail: vi.fn(async (options: (typeof state.sent)[number]) => {
    state.sent.push(options);
    return state.sendResult;
  }),
}));

const { sendFreeFirstScanEmail } = await import("@/lib/email/first-scan");
const { verifyTeamNotesToken } = await import("@/lib/events/unsubscribe");

const MADE = new Date("2026-11-19T10:00:00Z");
const minutes = (count: number) => new Date(MADE.getTime() + count * 60_000);

const code = (extra: Record<string, unknown> = {}) => ({
  id: "c_menu",
  userId: "u_maker",
  organizationId: "org_acme",
  slug: "aB3dE5f",
  title: "Spring menu",
  scanCount: 1,
  createdAt: MADE,
  ...extra,
});
const scan = (id: string, at: Date) => ({
  id,
  scannedAt: at,
  country: "DE",
  region: null,
  city: "Berlin",
  deviceType: "mobile",
  os: "iOS",
  browser: "Safari",
  referer: null,
});
/** A scan as recordScan leaves it: the row stored, then the email checked. */
function scanned(id: string, at: Date, count: number) {
  fakeDb.seed("qrScan", [{ id, qrCodeId: "c_menu", scannedAt: at }]);
  return sendFreeFirstScanEmail(scan(id, at), code({ scanCount: count }));
}

/** Changes the maker's account row in place. */
const maker = (fields: Record<string, unknown>) =>
  Object.assign(fakeDb.find("user", { id: "u_maker" }) ?? {}, fields);
/** Forgets the code's scans (a fresh code). */
const noScans = () => {
  fakeDb.rows("qrScan").length = 0;
};

beforeEach(() => {
  fakeDb.resetAll();
  state.sent.length = 0;
  state.plan = "free";
  state.teamNotes = true;
  state.sendResult = { sent: true, id: "em_1" };
  fakeDb.seed("user", [
    {
      id: "u_maker",
      email: "maker@mail.example.org.uk",
      banned: false,
      locale: null,
      teamNotes: true,
    },
  ]);
  fakeDb.seed("qrScan", []);
});

describe("sendFreeFirstScanEmail", () => {
  it("emails the maker once, on the first scan after the test window", async () => {
    expect(await scanned("s1", minutes(60), 1)).toBe("sent");
    expect(state.sent).toHaveLength(1);
    const [email] = state.sent;
    expect(email).toMatchObject({
      to: "maker@mail.example.org.uk",
      subject: "“Spring menu” got its first scan",
      idempotencyKey: "first-scan:c_menu",
      tags: [{ name: "kind", value: "first-scan" }],
    });
    const token = new URL(email?.unsubscribeUrl ?? "").searchParams.get(
      "token",
    );
    expect(verifyTeamNotesToken(token ?? "")).toBe("u_maker");
    const text = await render(email?.react as ReactElement, {
      plainText: true,
    });
    expect(text).toContain("Someone just scanned “Spring menu”");
    expect(text).toContain("Berlin, DE");
    expect(text).toContain(
      "also emails you at 10, 100, 500 scans and beyond, when someone submits one of your forms, and every Monday with last week's numbers.",
    );
    expect(text).toContain(
      "You're getting this because a code you made got its first scan. QRdx sends this once per code.",
    );
    expect(text).not.toContain("every scan");
    // The next scans send nothing.
    expect(await scanned("s2", minutes(61), 2)).toBe("not_first");
    expect(state.sent).toHaveLength(1);
  });

  it("treats scans in the first minutes as the maker's test, then sends on the next one", async () => {
    expect(await scanned("s1", minutes(1), 1)).toBe("test_scan");
    expect(await scanned("s2", minutes(2), 2)).toBe("test_scan");
    expect(state.sent).toHaveLength(0);
    expect(await scanned("s3", minutes(30), 3)).toBe("sent");
    expect(await scanned("s4", minutes(31), 4)).toBe("not_first");
    expect(state.sent).toHaveLength(1);
  });

  it("never goes to a plan with email alerts: Pro and Business keep their own first-scan alert", async () => {
    for (const plan of ["pro", "business"] as const) {
      state.plan = plan;
      noScans();
      expect(await scanned(`s_${plan}`, minutes(60), 1)).toBe("paid_plan");
    }
    expect(state.sent).toHaveLength(0);
  });

  it("sends nothing where notes from the team don't exist, or to someone who turned them off", async () => {
    state.teamNotes = false;
    expect(await scanned("s1", minutes(60), 1)).toBe("off");
    state.teamNotes = true;
    noScans();
    maker({ teamNotes: false });
    expect(await scanned("s2", minutes(60), 1)).toBe("opted_out");
    noScans();
    maker({ teamNotes: true, email: "e2e@qrdx.test" });
    expect(await scanned("s3", minutes(60), 1)).toBe("reserved_address");
    expect(state.sent).toHaveLength(0);
  });

  it("isn't sent to an agency's portal client", async () => {
    fakeDb.seed("portalClient", [
      {
        id: "pc_1",
        organizationId: "org_agency",
        email: "maker@mail.example.org.uk",
      },
    ]);
    expect(await scanned("s1", minutes(60), 1)).toBe("portal_client");
    expect(state.sent).toHaveLength(0);
  });

  it("skips busy codes without a query, and codes without a creation time", async () => {
    expect(
      await sendFreeFirstScanEmail(
        scan("s1", minutes(60)),
        code({ scanCount: 26 }),
      ),
    ).toBe("not_first");
    expect(
      await sendFreeFirstScanEmail(
        scan("s1", minutes(60)),
        code({ createdAt: undefined }),
      ),
    ).toBe("not_first");
  });

  it("is in the maker's language", async () => {
    maker({ locale: "es" });
    expect(await scanned("s1", minutes(60), 1)).toBe("sent");
    const html = await render(state.sent[0]?.react as ReactElement);
    expect(html).toContain('lang="es"');
    expect(html).not.toContain("got its first scan");
  });
});
