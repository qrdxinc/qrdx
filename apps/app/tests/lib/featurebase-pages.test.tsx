// @vitest-environment jsdom
// Featurebase shows on the home page only (components/consent/consent-manager.tsx
// passes lib/home-path.ts to @repo/analytics, whose FeaturebaseGate decides
// per page, once the consent allows it): a visit that
// never reaches the home page never loads its SDK, and after the home page
// the launcher is hidden and an open messenger closed.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/" }));
const scripts = vi.hoisted(() => ({ loaded: [] as string[] }));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => nav.pathname,
}));
// The SDK "loads" at once, and once per mount, as next/script does: it
// calls onLoad after loading.
vi.mock("next/script", async () => {
  const { useEffect } = await import("react");
  return {
    default: ({ id, onLoad }: { id: string; onLoad?: () => void }) => {
      useEffect(() => {
        scripts.loaded.push(id);
        onLoad?.();
      }, []);
      return null;
    },
  };
});
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Calls = unknown[][];
const calls = () =>
  ((window as unknown as { Featurebase?: { q?: Calls } }).Featurebase?.q ??
    []) as Calls;

let root: Root | null = null;

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_FEATUREBASE_APP_ID", "app_test");
  scripts.loaded = [];
  (window as unknown as { Featurebase?: unknown }).Featurebase = undefined;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllEnvs();
});

async function render() {
  const { FeaturebaseGate } = await import("@repo/analytics/featurebase-gate");
  const { isHomePath } = await import("@/lib/home-path");
  const node = <FeaturebaseGate allowed on={isHomePath} />;
  if (root) {
    await act(async () => root?.render(node));
    return;
  }
  root = createRoot(document.createElement("div"));
  await act(async () => root?.render(node));
}

describe("Featurebase on the home page only", () => {
  it("waits for the consent", async () => {
    nav.pathname = "/";
    const { FeaturebaseGate } = await import(
      "@repo/analytics/featurebase-gate"
    );
    root = createRoot(document.createElement("div"));
    await act(async () => root?.render(<FeaturebaseGate allowed={false} />));
    expect(scripts.loaded).toEqual([]);
    act(() => root?.unmount());
    root = null;
  });

  it("never loads on a visit that doesn't reach the home page", async () => {
    nav.pathname = "/dashboard";
    await render();
    nav.pathname = "/pricing";
    await render();
    expect(scripts.loaded).toEqual([]);
  });

  it("loads on the home page with its launcher", async () => {
    nav.pathname = "/es";
    await render();
    expect(scripts.loaded).toEqual(["featurebase-sdk"]);
    const boot = calls()
      .filter(([name]) => name === "boot")
      .at(-1);
    expect(boot?.[1]).toMatchObject({ hideDefaultLauncher: false });
  });

  it("hides the launcher and closes the messenger elsewhere", async () => {
    nav.pathname = "/";
    await render();
    nav.pathname = "/dashboard";
    await render();
    const boot = calls()
      .filter(([name]) => name === "boot")
      .at(-1);
    expect(boot?.[1]).toMatchObject({ hideDefaultLauncher: true });
    expect(calls().some(([name]) => name === "hide")).toBe(true);
    // Still one SDK for the visit.
    expect(scripts.loaded).toEqual(["featurebase-sdk"]);
  });
});
