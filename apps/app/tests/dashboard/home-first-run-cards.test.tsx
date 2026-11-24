// @vitest-environment jsdom
// Home's first-run cards in the browser: first steps tick and link to the
// next thing to do and hide for good; the invite card copies the person's
// link and a message; "Where did you first hear about QRdx?" saves with one
// tap, asks for words only for Other, and closes quietly when it can't save.
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

const calls = vi.hoisted(() => ({
  seen: [] as unknown[],
  created: [] as unknown[],
  saved: [] as unknown[][],
  saveOk: true,
  tracked: [] as unknown[][],
  copied: [] as string[],
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/acme" }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/actions/spotlights", () => ({
  markSpotlightSeen: async (id: unknown) => {
    calls.seen.push(id);
    return { ok: true, id };
  },
}));
vi.mock("@/actions/where-heard", () => ({
  saveWhereHeard: async (...args: unknown[]) => {
    calls.saved.push(args);
    return { ok: calls.saveOk };
  },
}));
vi.mock("@/components/app-shell/create-actions", () => ({
  useCreate: () => (kind: unknown) => calls.created.push(kind),
}));
vi.mock("@repo/analytics", () => ({
  track: (...args: unknown[]) => calls.tracked.push(args),
}));
vi.mock("@repo/design-system", () => ({
  toast: { success: () => undefined, error: () => undefined },
}));

const { FirstCodeButton, FirstStepsCard } = await import(
  "@/app/(app)/dashboard/_components/home/first-steps-card"
);
const { InviteCard } = await import(
  "@/app/(app)/dashboard/_components/home/invite-card"
);
const { WhereHeardCard } = await import(
  "@/app/(app)/dashboard/_components/home/where-heard-card"
);
const { SpotlightProvider } = await import(
  "@/components/app-shell/feature-spotlight"
);
const { WorkspaceProvider } = await import("@/components/workspace-provider");

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const home = en.app.dashboard.home;

let container: HTMLDivElement;
let root: Root;

async function render(
  node: ReactNode,
  { role = "owner", seen = [] as string[] } = {},
) {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <WorkspaceProvider
          workspace={{
            id: "ws_1",
            name: "Acme",
            slug: "acme",
            role: role as "owner",
            own: true,
          }}
        >
          <SpotlightProvider seen={seen} viewerId="u_1">
            {node}
          </SpotlightProvider>
        </WorkspaceProvider>
      </NextIntlClientProvider>,
    );
  });
  // The provider reads this browser's copy first.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

const button = (name: string) =>
  [...container.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === name,
  );

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  window.localStorage.clear();
  calls.seen = [];
  calls.created = [];
  calls.saved = [];
  calls.saveOk = true;
  calls.tracked = [];
  calls.copied = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        calls.copied.push(text);
      },
    },
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("first steps", () => {
  const steps = { made: true, scanned: false, downloaded: false };

  it("shows progress, ticks what's done and links the next steps to the code", async () => {
    await render(
      <FirstStepsCard codeHref="/dashboard/acme/codes/c_1" steps={steps} />,
    );
    expect(container.textContent).toContain(home.firstSteps.title);
    expect(container.textContent).toContain("1 of 3 done");
    const links = [...container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(links).toEqual([
      "/dashboard/acme/codes/c_1",
      "/dashboard/acme/codes/c_1",
    ]);
    expect(container.textContent).toContain(home.firstSteps.scan);
    expect(container.textContent).toContain(home.firstSteps.download);
  });

  it("opens the new-code dialog for the first step", async () => {
    await render(
      <FirstStepsCard
        codeHref={null}
        steps={{ made: false, scanned: false, downloaded: false }}
      />,
    );
    const make = [...container.querySelectorAll("button")].find((element) =>
      element.textContent?.includes(home.firstSteps.make),
    );
    await act(async () => make?.click());
    expect(calls.created).toEqual(["code"]);
  });

  it("hides for good", async () => {
    await render(<FirstStepsCard codeHref={null} steps={steps} />);
    await act(async () => button(home.firstSteps.hide)?.click());
    expect(container.textContent).toBe("");
    expect(calls.seen).toEqual(["home-first-steps"]);
  });

  it("stays hidden once hidden, once all done, and for people who can't make codes", async () => {
    await render(<FirstStepsCard codeHref={null} steps={steps} />, {
      seen: ["home-first-steps"],
    });
    expect(container.textContent).toBe("");
    await render(<FirstStepsCard codeHref={null} steps={steps} />, {
      seen: ["first-download"],
    });
    expect(container.textContent).toContain("2 of 3 done");
    await render(
      <FirstStepsCard
        codeHref={null}
        steps={{ made: true, scanned: true, downloaded: true }}
      />,
    );
    expect(container.textContent).toBe("");
    await render(<FirstStepsCard codeHref={null} steps={steps} />, {
      role: "viewer",
    });
    expect(container.textContent).toBe("");
  });

  it("puts a first-code button in the empty card", async () => {
    await render(<FirstCodeButton />);
    await act(async () => button(home.firstSteps.makeFirstCode)?.click());
    expect(calls.created).toEqual(["code"]);
  });
});

describe("the invite card", () => {
  const link = "https://qrdx.dev/i/k7q2mx9pab";

  it("copies the message with the link in it, and the link alone", async () => {
    await render(<InviteCard link={link} />);
    expect(container.textContent).toContain(home.inviteCard.title);
    await act(async () => button(home.inviteCard.copyMessage)?.click());
    await act(async () => button(home.inviteCard.copyLink)?.click());
    expect(calls.copied[0]).toContain(link);
    expect(calls.copied[0]).toContain("5 more");
    expect(calls.copied[1]).toBe(link);
    expect(calls.tracked).toEqual([
      ["invite_link_copied", { surface: "home_card_message" }],
      ["invite_link_copied", { surface: "home_card" }],
    ]);
  });

  it("hides for good", async () => {
    await render(<InviteCard link={link} />);
    await act(async () => button(home.inviteCard.hide)?.click());
    expect(container.textContent).toBe("");
    expect(calls.seen).toEqual(["home-invite"]);
    await render(<InviteCard link={link} />, { seen: ["home-invite"] });
    expect(container.textContent).toBe("");
  });
});

describe("Where did you first hear about QRdx?", () => {
  it("saves one tap and thanks", async () => {
    await render(<WhereHeardCard />);
    expect(container.textContent).toContain(home.whereHeard.question);
    await act(async () =>
      button(home.whereHeard.answers.ai_assistant)?.click(),
    );
    expect(calls.saved).toEqual([["ai_assistant", null]]);
    expect(calls.seen).toEqual(["where-heard"]);
    expect(container.textContent).toBe(home.whereHeard.thanks);
  });

  it("asks for a few words for Other", async () => {
    await render(<WhereHeardCard />);
    await act(async () => button(home.whereHeard.answers.other)?.click());
    expect(calls.saved).toEqual([]);
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "A print shop");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button(home.whereHeard.save)?.click());
    expect(calls.saved).toEqual([["other", "A print shop"]]);
  });

  it("closes quietly when the answer can't be saved, without marking it", async () => {
    calls.saveOk = false;
    await render(<WhereHeardCard />);
    await act(async () => button(home.whereHeard.answers.search)?.click());
    expect(container.textContent).toBe("");
    expect(calls.seen).toEqual([]);
  });

  it("hides for good, and isn't asked again", async () => {
    await render(<WhereHeardCard />);
    await act(async () => button(home.whereHeard.hide)?.click());
    expect(container.textContent).toBe("");
    expect(calls.seen).toEqual(["where-heard"]);
    expect(calls.saved).toEqual([]);
    await render(<WhereHeardCard />, { seen: ["where-heard"] });
    expect(container.textContent).toBe("");
  });
});
