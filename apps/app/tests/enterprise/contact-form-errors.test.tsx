// @vitest-environment jsdom
// The /enterprise contact form after an error answer (400 invalid, 429 rate
// limited, 503 unavailable): every field keeps what the person entered, the
// team size included, so a second Send goes out with all of it. React resets
// a form after its `action` runs, and Radix's Select answers that reset by
// clearing its value; the form now sends itself instead
// (app/[lang]/(home)/enterprise/contact-form.tsx).
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/enterprise",
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
}));
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
vi.mock("@/lib/sound/emit", () => ({ soundEvent: () => {} }));

const { EnterpriseContactForm } = await import(
  "@/app/[lang]/(home)/enterprise/contact-form"
);

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

async function render() {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <EnterpriseContactForm
          email="enterprise@qrdx.dev"
          locale="en"
          turnstileSiteKey={null}
        />
      </NextIntlClientProvider>,
    );
  });
  await flush();
}

const form = () => container.querySelector("form") as HTMLFormElement;
const field = (name: string) =>
  form().querySelector(`[name="${name}"]`) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement;
const sizeTrigger = () =>
  (container.querySelector("#enterprise-size")?.textContent ?? "").trim();

/** Types into a React-controlled field (or picks from the native select). */
async function enter(name: string, value: string) {
  const element = field(name);
  const prototype = Object.getPrototypeOf(element);
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
    element,
    value,
  );
  await act(async () => {
    element.dispatchEvent(
      new Event(element.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}

async function send() {
  await act(async () => {
    form().requestSubmit();
  });
  await flush();
}

const answer = (body: unknown, status: number) =>
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

const sentBody = (call: number) =>
  JSON.parse(String(fetchMock.mock.calls[call]?.[1]?.body)) as Record<
    string,
    string
  >;

const ENTERED = {
  name: "Mei Tanaka",
  email: "mei@north.example",
  company: "North Foods KK",
  need: "Single sign-on for 400 people.",
};

describe("the enterprise form after an error answer", () => {
  it.each([
    ["400 invalid", { status: "error", code: "invalid", field: "need" }, 400],
    ["429 rate limited", { status: "error", code: "rateLimited" }, 429],
    ["503 unavailable", { status: "error", code: "unavailable" }, 503],
  ])(
    "%s: every field, the team size included, keeps its value",
    async (_what, body, status) => {
      await render();
      for (const [name, value] of Object.entries(ENTERED)) {
        await enter(name, value);
      }
      await enter("teamSize", "51-200");
      expect(sizeTrigger()).toBe("51 to 200 people");

      answer(body, status);
      await send();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sentBody(0)).toMatchObject({ ...ENTERED, teamSize: "51-200" });
      expect(container.querySelector('[role="alert"]')).not.toBeNull();

      for (const [name, value] of Object.entries(ENTERED)) {
        expect(field(name).value, name).toBe(value);
      }
      expect(field("teamSize").value).toBe("51-200");
      expect(sizeTrigger()).toBe("51 to 200 people");

      // A second Send goes out with everything, team size included.
      answer({ status: "sent", email: ENTERED.email }, 200);
      await send();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(sentBody(1)).toMatchObject({ ...ENTERED, teamSize: "51-200" });
      expect(container.textContent).toContain(ENTERED.email);
    },
  );
});
