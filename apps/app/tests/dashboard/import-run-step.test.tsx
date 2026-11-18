// @vitest-environment jsdom
// Codes → Import, after a connected-account import: "Keep my printed codes
// working" opens the redirect step when there are old links to re-point.
// When the provider sent none (a Uniqode answer without the printed link,
// say), the step says so and what to do instead, rather than offering a dry
// run with nothing in it. The importer side is in lib/migrate/migrate.test.ts.
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MigrateClient } from "@/lib/migrate/client";
import type { JobItem, JobSummary } from "@/lib/migrate/types";
import en from "@/messages/en.json";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/lib/sound", () => ({ soundEvent: () => {} }));
vi.mock("@repo/analytics", () => ({ track: () => {} }));
// lib/migrate/client.ts imports these server actions; the step never calls them.
vi.mock("@/app/(app)/settings/integrations/actions", () => ({}));
vi.mock(
  "@/app/(app)/settings/integrations/connected-account-actions",
  () => ({}),
);

const { RunStep } = await import(
  "@/app/(app)/dashboard/codes/_components/import-run-step"
);

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const JOB: JobSummary = {
  id: "job_uq",
  provider: "uniqode-api",
  createdAt: "2026-11-18T09:00:00.000Z",
  status: "done",
  total: 2,
  processed: 2,
  created: 2,
  skipped: 0,
  failed: 0,
  redirected: 0,
  undone: 0,
  backHalfDomain: null,
  domainAttachedAt: null,
};

const item = (n: number, shortLink: string | null): JobItem => ({
  key: `410000${n}`,
  shortLink,
  url: `https://example.com/page-${n}`,
  title: null,
  tags: [],
  createdAt: null,
  slug: null,
  status: "created",
  codeId: `code_${n}`,
  newLink: `https://qrdx.dev/q/Rnd000${n}`,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(items: JobItem[]) {
  const client = {
    job: async () => ({ job: JOB, items }),
  } as unknown as MigrateClient;
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <RunStep
          client={client}
          jobId={JOB.id}
          onBack={() => {}}
          onClose={() => {}}
          onRedirects={() => {}}
        />
      </NextIntlClientProvider>,
    );
  });
  return container.textContent ?? "";
}

describe("Import run step, keep printed codes working", () => {
  it("offers the dry run when the old links came with the codes", async () => {
    const text = await render([
      item(1, "https://qrcodes.pro/AbC1"),
      item(2, "https://qrcodes.pro/AbC2"),
    ]);
    expect(text).toContain("Keep my printed codes working");
    expect(text).toContain("Review changes");
    expect(text).not.toContain("didn't send the links");
  });

  it("says the printed links weren't found, and what to do instead", async () => {
    const text = await render([item(1, null), item(2, null)]);
    expect(text).toContain("Keep my printed codes working");
    expect(text).toContain(
      "Uniqode didn't send the links your printed codes open",
    );
    expect(text).toContain("download the mapping CSV");
    expect(text).toContain("Download mapping CSV");
    expect(text).not.toContain("Review changes");
  });
});
