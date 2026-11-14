// The quiet sign-up lines: waved off for good in this browser, shown once a
// visit, and the "keep your designs" line only on a return visit. Storage
// is a fake; blocked storage must never break the page.
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetSignUpNudgesForTests,
  designRestoredThisVisit,
  dismissNudge,
  hasStoredDesign,
  isNudgeDismissed,
  markNudgeShown,
  noteEditorVisitStart,
  wasNudgeShown,
} from "@/lib/sign-up-nudges";

function fakeStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

const blocked = {
  getItem: (): string | null => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
};

const persisted = (state: Record<string, unknown>) =>
  JSON.stringify({ state, version: 0 });

beforeEach(() => {
  __resetSignUpNudgesForTests();
});

describe("dismissing a nudge", () => {
  it("is remembered in this browser, per nudge", () => {
    const local = fakeStorage();
    expect(isNudgeDismissed("after_download", local)).toBe(false);
    dismissNudge("after_download", local);
    expect(isNudgeDismissed("after_download", local)).toBe(true);
    expect(isNudgeDismissed("keep_designs", local)).toBe(false);
    // A new page load reads it back from storage.
    __resetSignUpNudgesForTests();
    expect(isNudgeDismissed("after_download", local)).toBe(true);
    expect(JSON.parse(local.store.get("qrdx:sign-up-nudges") ?? "")).toEqual([
      "after_download",
    ]);
  });

  it("still works for this page load when storage is blocked", () => {
    expect(isNudgeDismissed("bulk_done", blocked)).toBe(false);
    expect(() => dismissNudge("bulk_done", blocked)).not.toThrow();
    expect(isNudgeDismissed("bulk_done", blocked)).toBe(true);
  });

  it("ignores a stored value that isn't a list", () => {
    const local = fakeStorage({ "qrdx:sign-up-nudges": '{"oops":1}' });
    expect(isNudgeDismissed("after_download", local)).toBe(false);
    dismissNudge("after_download", local);
    expect(isNudgeDismissed("after_download", local)).toBe(true);
  });

  it("shows once a visit", () => {
    const session = fakeStorage();
    expect(wasNudgeShown("keep_designs", session)).toBe(false);
    markNudgeShown("keep_designs", session);
    __resetSignUpNudgesForTests();
    expect(wasNudgeShown("keep_designs", session)).toBe(true);
    expect(wasNudgeShown("after_download", session)).toBe(false);
  });
});

describe("a design kept from an earlier visit", () => {
  it("counts content, edits or a preset, not an untouched editor", () => {
    expect(hasStoredDesign(null)).toBe(false);
    expect(hasStoredDesign("not json")).toBe(false);
    expect(
      hasStoredDesign(
        persisted({
          value: "",
          history: [],
          themeState: { preset: "default" },
        }),
      ),
    ).toBe(false);
    expect(hasStoredDesign(persisted({ value: "https://example.com" }))).toBe(
      true,
    );
    expect(hasStoredDesign(persisted({ value: "", history: [{}] }))).toBe(true);
    expect(
      hasStoredDesign(persisted({ value: "", themeState: { preset: "neon" } })),
    ).toBe(true);
  });

  it("is a return visit when the tab's first page found one", () => {
    const local = fakeStorage({
      "editor-storage": persisted({ value: "https://example.com" }),
    });
    const session = fakeStorage();
    expect(noteEditorVisitStart(local, session)).toBe(true);
    expect(designRestoredThisVisit()).toBe(true);
    expect(session.store.get("qrdx:editor-visit")).toBe("restored");
  });

  it("stays a first visit after a reload in the same tab", () => {
    const local = fakeStorage();
    const session = fakeStorage();
    expect(noteEditorVisitStart(local, session)).toBe(false);
    // The visitor designs something, then reloads: same tab, same visit.
    local.store.set(
      "editor-storage",
      persisted({ value: "https://example.com" }),
    );
    __resetSignUpNudgesForTests();
    expect(noteEditorVisitStart(local, session)).toBe(false);
    // A new tab (fresh sessionStorage) is a return visit.
    __resetSignUpNudgesForTests();
    expect(noteEditorVisitStart(local, fakeStorage())).toBe(true);
  });

  it("never throws when storage is blocked", () => {
    expect(noteEditorVisitStart(blocked, blocked)).toBe(false);
    expect(designRestoredThisVisit()).toBe(false);
  });
});
