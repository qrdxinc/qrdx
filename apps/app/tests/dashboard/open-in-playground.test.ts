// "Edit design in playground" and "Print-ready PDF or EPS" on a saved code
// (code-actions-menu.tsx, code-overview.tsx): both load the code into the
// editor, still bound to its short link, then open the playground; the print
// one opens the download dialog on Print-ready (a link's open=print).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QrCodeView } from "@/app/(app)/dashboard/codes/_lib/qr-codes";

const push = vi.fn();
const load = vi.fn();
let session: { user: { id: string } } | null = { user: { id: "user-1" } };

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@repo/auth/client", () => ({
  authClient: { useSession: () => ({ data: session }) },
}));
vi.mock("@/components/editor/dynamic-link-toggle", () => ({
  loadCodeIntoEditor: (...args: unknown[]) => load(...args),
}));

const { useOpenInPlayground } = await import(
  "@/app/(app)/dashboard/codes/_components/use-open-in-playground"
);
const { parsePlaygroundParams } = await import("@/lib/playground-links");

const code = { id: "code-1", slug: "abc1234" } as unknown as QrCodeView;

function openedParams() {
  const href = push.mock.calls[0]?.[0] as string;
  const url = new URL(href, "https://qrdx.dev");
  return {
    href,
    params: parsePlaygroundParams(url.search, url.hash),
  };
}

describe("useOpenInPlayground", () => {
  beforeEach(() => {
    push.mockReset();
    load.mockReset();
    session = { user: { id: "user-1" } };
  });

  it("loads the code, then opens the playground with nothing else asked", () => {
    useOpenInPlayground()(code);
    expect(load).toHaveBeenCalledWith(code, "user-1");
    const { href, params } = openedParams();
    expect(href).not.toContain("open=");
    expect(params.open).toBeUndefined();
  });

  it("with print, opens the download dialog on Print-ready", () => {
    useOpenInPlayground()(code, { print: true });
    expect(load).toHaveBeenCalledWith(code, "user-1");
    expect(openedParams().params.open).toBe("print");
  });

  it("carries none of the code in the link: the editor store holds it", () => {
    useOpenInPlayground()(code, { print: true });
    const { href } = openedParams();
    expect(href).not.toContain(code.slug);
    expect(href).not.toContain("url=");
  });

  it("does nothing before the session is known", () => {
    session = null;
    useOpenInPlayground()(code, { print: true });
    expect(load).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
