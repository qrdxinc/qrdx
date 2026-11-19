// @vitest-environment jsdom
// The upgrade dialog's checkout buttons (components/billing): outside the
// app shell, who may buy for the workspace is read again each time the
// dialog opens. The cached read is shared by every workspace, so after
// another tab switched the session to a team this person only belongs to,
// its "yes" must not show checkout for a Pro that won't lift the team.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID = "prod_pro_month";
  process.env.NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID = "prod_pro_year";
});

vi.mock("@repo/auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "u_ana", email: "ana@example.com" } },
      isPending: false,
    }),
  },
}));

const { useGateCheckout } = await import(
  "@/components/billing/checkout-buttons"
);
const { SUBSCRIPTION_STATUS_QUERY_KEY } = await import(
  "@/lib/hooks/use-subscription"
);

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const summary = (canUpgradeWorkspace: boolean) => ({
  isSubscribed: false,
  requestsUsed: 0,
  requestsRemaining: 5,
  plan: "free",
  currency: "USD",
  canUpgradeWorkspace,
});

/**
 * Runs `step`, then lets React Query deliver what followed (it notifies on
 * a timer, not a microtask).
 */
const settle = (step: () => void = () => undefined) =>
  act(async () => {
    step();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

let container: HTMLDivElement;
let root: Root;
let seen: ReturnType<typeof useGateCheckout>[];
let answer: (value: unknown) => void;
let reads: number;

function Probe({ open }: { open: boolean }) {
  seen.push(
    useGateCheckout({
      open,
      plan: "pro",
      payer: "workspace",
      shellCanUpgrade: null,
    }),
  );
  return null;
}

function mount(client: QueryClient, open: boolean) {
  root.render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en}>
        <Probe open={open} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  seen = [];
  reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((resolve) => {
          reads++;
          answer = (body) =>
            resolve(
              new Response(JSON.stringify(body), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }),
            );
        }),
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("checkout from a workspace gate outside the app shell", () => {
  it("a cached yes, a fresh no: never checkout buttons, then the owner line", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // Read a minute ago, in this tab, for the person's own workspace.
    client.setQueryData([SUBSCRIPTION_STATUS_QUERY_KEY], summary(true));

    await settle(() => mount(client, true));
    // Opening asks again; until then the cached yes doesn't count.
    expect(reads).toBe(1);
    expect(seen.at(-1)).toEqual({
      buttons: true,
      waiting: true,
      askOwner: false,
    });
    expect(seen.some((s) => s.buttons && !s.waiting)).toBe(false);

    // The session is now on a team this person is only a member of.
    await settle(() => answer(summary(false)));
    expect(seen.at(-1)).toEqual({
      buttons: false,
      waiting: false,
      askOwner: true,
    });
    expect(seen.some((s) => s.buttons && !s.waiting)).toBe(false);
  });

  it("a fresh yes shows them, clickable", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData([SUBSCRIPTION_STATUS_QUERY_KEY], summary(false));
    await settle(() => mount(client, true));
    expect(seen.at(-1)?.waiting).toBe(true);
    await settle(() => answer(summary(true)));
    expect(seen.at(-1)).toEqual({
      buttons: true,
      waiting: false,
      askOwner: false,
    });
  });

  it("asks nothing while the dialog is closed", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData([SUBSCRIPTION_STATUS_QUERY_KEY], summary(true));
    await settle(() => mount(client, false));
    expect(reads).toBe(0);
  });
});
