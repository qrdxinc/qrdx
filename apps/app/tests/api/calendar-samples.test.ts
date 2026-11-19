import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildTemplateContent } from "@/lib/landing/templates";
import type { LandingPageContent } from "@/types/landing";

// The event block's "Add to calendar" file (/api/calendar/<slug>?block=<id>)
// is built from the stored page: a template's sample links (example.com
// tickets, hello@example.com) must not reach it, as they don't reach the page.

const state = { content: null as LandingPageContent | null };

vi.mock("@repo/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/database")>();
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: async () => [
      {
        pageId: "page_event",
        content: state.content,
        domainId: null,
        isActive: true,
        archivedAt: null,
        deletedAt: null,
        code: {
          id: "code_event",
          slug: "abc1234",
          passwordHash: null,
          startsAt: null,
          expiresAt: null,
          scanLimit: null,
          scanCount: 0,
          pausedAt: null,
          fallbackUrl: null,
        },
      },
    ],
  };
  return { ...actual, database: { select: () => chain } };
});
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => null,
}));
vi.mock("@/lib/slug-claims", () => ({ slugWhere: () => undefined }));
vi.mock("@/lib/redirect/lifecycle", () => ({
  checkPageLifecycle: async () => ({ action: "allow" }),
}));

const { GET } = await import("@/app/api/calendar/[slug]/route");

async function calendarFile(content: LandingPageContent, blockId: string) {
  state.content = content;
  const response = await GET(
    new NextRequest(
      `https://qrdx.dev/api/calendar/abc1234?block=${encodeURIComponent(blockId)}`,
    ),
    { params: Promise.resolve({ slug: "abc1234" }) },
  );
  return { status: response.status, body: await response.text() };
}

function eventBlockId(content: LandingPageContent): string {
  const block = content.blocks.find((item) => item.type === "event");
  if (!block) throw new Error("No event block");
  return block.id;
}

describe("/api/calendar and template samples", () => {
  beforeEach(() => {
    state.content = null;
  });

  it.each(["party", "conference", "webinar"])(
    "leaves the %s template's sample links out of the .ics",
    async (variant) => {
      const content = buildTemplateContent("event", variant);
      const raw = JSON.stringify(content);
      // The stored page still has them; only what's served leaves them out.
      expect(raw).toContain("example.com");
      const { status, body } = await calendarFile(
        content,
        eventBlockId(content),
      );
      expect(status).toBe(200);
      expect(body).toContain("BEGIN:VEVENT");
      expect(body).not.toContain("example.com");
    },
  );

  it("keeps the owner's own links", async () => {
    const template = buildTemplateContent("event", "conference");
    const content: LandingPageContent = {
      ...template,
      blocks: template.blocks.map((block) =>
        block.type === "event"
          ? {
              ...block,
              props: {
                ...block.props,
                organizerEmail: "events@lenasbakery.com",
                cta: { label: "Tickets", url: "https://lenasbakery.com/tix" },
              },
            }
          : block,
      ),
    };
    const { status, body } = await calendarFile(content, eventBlockId(content));
    expect(status).toBe(200);
    expect(body).toContain("mailto:events@lenasbakery.com");
    expect(body).toContain("https://lenasbakery.com/tix");
  });
});
