// Free's one first-scan email per code (lib/email/first-scan.tsx): to the
// code's maker, on its first scan after the test window, never on a plan
// with email alerts, never twice, only where notes from the team exist and
// from the personal sender, never for old or imported codes, in the maker's
// language, with one line on Pro. Tables in memory, sendEmail
// captured: nothing is sent or stored.
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "free" as "free" | "pro" | "business",
  teamNotes: true,
  sender: "Ritesh from QRdx <support@qrdx.dev>" as string | null,
  sendResult: { sent: true, id: "em_1" } as
    | { sent: true; id: string }
    | { sent: false; reason: "failed"; error: string; code?: string },
  sent: [] as {
    to: string;
    from?: string;
    replyTo?: string;
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
vi.mock("@/lib/email/personal-sender", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/email/personal-sender")>();
  return {
    ...actual,
    personalSender: () =>
      state.sender ? actual.parseSender(state.sender) : null,
  };
});
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
  state.sender = "Ritesh from QRdx <support@qrdx.dev>";
  state.sendResult = { sent: true, id: "em_1" };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
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
      from: "Ritesh from QRdx <support@qrdx.dev>",
      replyTo: "support@qrdx.dev",
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

  it("sends exactly one of two scans stored at once, whichever came first", async () => {
    fakeDb.seed("qrScan", [
      { id: "s1", qrCodeId: "c_menu", scannedAt: minutes(60) },
      { id: "s2", qrCodeId: "c_menu", scannedAt: minutes(60) },
      { id: "s3", qrCodeId: "c_menu", scannedAt: minutes(61) },
    ]);
    // Checked out of order: the later ones see an earlier real scan.
    const check = (id: string, at: Date, count: number) =>
      sendFreeFirstScanEmail(scan(id, at), code({ scanCount: count }));
    expect(await check("s3", minutes(61), 3)).toBe("not_first");
    expect(await check("s2", minutes(60), 2)).toBe("not_first");
    expect(await check("s1", minutes(60), 1)).toBe("sent");
    expect(state.sent).toHaveLength(1);
  });

  it("logs a failed send with the code's id, and doesn't try again on the next scan", async () => {
    state.sendResult = {
      sent: false,
      reason: "failed",
      error: "down",
      code: "application_error",
    };
    expect(await scanned("s1", minutes(60), 1)).toBe("failed");
    const logged = vi
      .mocked(console.error)
      .mock.calls.map(([line]) => String(line));
    expect(logged).toContain(
      JSON.stringify({
        event: "email.free_first_scan_failed",
        codeId: "c_menu",
        error: "application_error",
      }),
    );
    state.sendResult = { sent: true, id: "em_1" };
    expect(await scanned("s2", minutes(61), 2)).toBe("not_first");
  });

  it("skips codes made before it shipped, and codes imported or brought from another provider", async () => {
    expect(
      await sendFreeFirstScanEmail(
        scan("s1", new Date("2026-11-19T00:00:00Z")),
        code({ createdAt: new Date("2026-11-18T23:59:00Z") }),
      ),
    ).toBe("old_code");
    for (const via of ["import", "migrate"]) {
      expect(
        await sendFreeFirstScanEmail(
          scan("s1", minutes(60)),
          code({ createdVia: via }),
        ),
        via,
      ).toBe("imported");
    }
    expect(state.sent).toHaveLength(0);
    for (const via of ["dashboard", "playground", "api", null]) {
      noScans();
      expect(
        await sendFreeFirstScanEmail(
          scan("s1", minutes(60)),
          code({ createdVia: via }),
        ),
        String(via),
      ).toBe("sent");
    }
  });

  it("comes only from the personal sender: without it, nothing goes out", async () => {
    state.sender = null;
    expect(await scanned("s1", minutes(60), 1)).toBe("no_personal_sender");
    expect(state.sent).toHaveLength(0);
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
