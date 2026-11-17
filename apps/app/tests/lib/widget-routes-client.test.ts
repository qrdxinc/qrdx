// The browser side of the widgets' same-origin routes
// (lib/widget-routes/client.ts): what each call sends, and that it hands back
// the route's result (the server action's) on any status, while a network
// failure or an answer that isn't a result rejects, as a server action call
// does. The callers (the Dynamic toggle, Save to dashboard) turn those into
// the same toasts as before.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDynamicCode,
  saveGeneratorBarcode,
  updateDynamicCode,
} from "@/lib/widget-routes/client";

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

const answer = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValueOnce(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

const sent = () => {
  const [path, init] = fetchMock.mock.calls[0] ?? [];
  return {
    path,
    method: init?.method,
    credentials: init?.credentials,
    headers: init?.headers,
    body: JSON.parse(String(init?.body)),
  };
};

const VIEW = {
  id: "code_1",
  shortLink: "https://qrdx.dev/q/abc1234",
  destinationUrl: "https://example.com/menu",
};

describe("what each call sends", () => {
  it("createDynamicCode posts the destination and design", async () => {
    answer({ success: true, data: VIEW }, 201);
    const style = { fgColor: "#000000", bgColor: "#ffffff" };
    expect(
      await createDynamicCode({
        destinationUrl: VIEW.destinationUrl,
        style: style as never,
      }),
    ).toEqual({ success: true, data: VIEW });
    expect(sent()).toEqual({
      path: "/api/playground/codes",
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: { destinationUrl: VIEW.destinationUrl, style },
    });
  });

  it("updateDynamicCode patches the code named in the path", async () => {
    answer({ success: true, data: VIEW });
    await updateDynamicCode({
      id: "code/1",
      destinationUrl: "https://example.com/new",
    });
    expect(sent()).toMatchObject({
      path: "/api/playground/codes/code%2F1",
      method: "PATCH",
      body: { destinationUrl: "https://example.com/new" },
    });
  });

  it("saveGeneratorBarcode posts the barcode", async () => {
    const saved = {
      id: "bc_1",
      title: null,
      workspace: { slug: "alice", name: "Alice" },
    };
    answer({ success: true, data: saved }, 201);
    const input = {
      format: "code128" as const,
      value: "QRDX-1",
      options: {},
      title: null,
    };
    expect(await saveGeneratorBarcode(input)).toEqual({
      success: true,
      data: saved,
    });
    expect(sent()).toMatchObject({
      path: "/api/barcodes",
      method: "POST",
      body: input,
    });
  });
});

describe("what comes back", () => {
  it("an error result on any status, as the action answered it", async () => {
    const limit = {
      success: false,
      error: {
        code: "LIMIT_REACHED",
        message: "Your plan includes 10 active dynamic QR codes.",
      },
    };
    answer(limit, 402);
    expect(
      await createDynamicCode({
        destinationUrl: VIEW.destinationUrl,
        style: {} as never,
      }),
    ).toEqual(limit);

    const signedOut = {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Sign in to save barcodes." },
    };
    answer(signedOut, 401);
    expect(
      await saveGeneratorBarcode({ format: "code128", value: "X" }),
    ).toEqual(signedOut);
  });

  it("rejects on a network failure or an answer that isn't a result", async () => {
    const call = () =>
      createDynamicCode({
        destinationUrl: VIEW.destinationUrl,
        style: {} as never,
      });
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(call()).rejects.toThrow("Failed to fetch");

    answer("<html>Bad gateway</html>", 502);
    await expect(call()).rejects.toThrow(
      "Unexpected answer from /api/playground/codes (502).",
    );

    answer({ data: VIEW });
    await expect(call()).rejects.toThrow("Unexpected answer");

    answer({ success: false, error: "nope" }, 400);
    await expect(call()).rejects.toThrow("Unexpected answer");
  });
});
