// The browser side of the widgets' same-origin routes
// (lib/widget-routes/client.ts): what each call sends, and that it hands back
// the route's result (the server action's) on any status, while a network
// failure or an answer that isn't a result rejects, as a server action call
// does. The callers (the Dynamic toggle, Save to dashboard, the pricing
// buttons and dialogs, the enterprise form, the bulk tool's themes) turn
// those into the same messages as before.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDynamicCode,
  fetchSavedThemes,
  requestInvoice,
  requestNonprofitDiscount,
  saveGeneratorBarcode,
  sendEnterpriseRequest,
  startCheckout,
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

  it("sends the page's language when it has one, for the server's messages", async () => {
    answer({ success: true, data: VIEW }, 201);
    await createDynamicCode(
      { destinationUrl: VIEW.destinationUrl, style: {} as never },
      "es",
    );
    expect(sent()).toMatchObject({ path: "/api/playground/codes?locale=es" });
    fetchMock.mockReset();
    answer({ success: true, data: VIEW });
    await updateDynamicCode({ id: "code/1", style: {} as never }, "pt-BR");
    expect(sent()).toMatchObject({
      path: "/api/playground/codes/code%2F1?locale=pt-BR",
    });
    fetchMock.mockReset();
    answer({ success: true, data: { id: "bc_1" } }, 201);
    await saveGeneratorBarcode({ format: "code128", value: "X" }, "en");
    expect(sent()).toMatchObject({ path: "/api/barcodes?locale=en" });
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

describe("the pricing page, the enterprise form and the bulk tool", () => {
  it("startCheckout posts the plan and period, and hands back the URL or the reason", async () => {
    answer({ url: "https://checkout.example/session" });
    expect(await startCheckout({ plan: "pro", interval: "year" })).toEqual({
      url: "https://checkout.example/session",
    });
    expect(sent()).toMatchObject({
      path: "/api/subscription/checkout",
      method: "POST",
      credentials: "same-origin",
      body: { plan: "pro", interval: "year" },
    });
    const signIn = { error: "Sign in to upgrade.", reason: "sign_in" };
    answer(signIn, 401);
    expect(
      await startCheckout({ plan: "business", interval: "month" }),
    ).toEqual(signIn);
  });

  it("requestInvoice and requestNonprofitDiscount post the dialog's fields", async () => {
    const invoice = {
      company: "North Agency Ltd",
      billingEmail: "accounts@north.example",
      country: "Germany",
      taxId: "",
      address: "",
      notes: "",
    };
    answer({ ok: true });
    expect(await requestInvoice(invoice)).toEqual({ ok: true });
    expect(sent()).toMatchObject({
      path: "/api/invoice-requests",
      method: "POST",
      body: invoice,
    });
    fetchMock.mockReset();

    const nonprofit = {
      organization: "Harbour Food Trust",
      country: "Ireland",
      registration: "CHY 20012345",
      contactEmail: "hello@harbour.example",
      plan: "pro" as const,
    };
    const limited = {
      ok: false,
      code: "RATE_LIMITED",
      error: "You've sent a few requests today. We'll reply to those.",
    };
    answer(limited, 429);
    expect(await requestNonprofitDiscount(nonprofit)).toEqual(limited);
    expect(sent()).toMatchObject({
      path: "/api/nonprofit-requests",
      body: nonprofit,
    });
  });

  it("sendEnterpriseRequest sends the form's text fields as JSON (useActionState's shape)", async () => {
    const data = new FormData();
    data.set("name", "Mei Tanaka");
    data.set("email", "mei@north.example");
    data.set("cf-turnstile-response", "token-1");
    data.set("logo", new Blob(["x"]), "logo.png");
    answer({ status: "sent", email: "mei@north.example" });
    expect(await sendEnterpriseRequest({ status: "idle" }, data)).toEqual({
      status: "sent",
      email: "mei@north.example",
    });
    expect(sent()).toMatchObject({
      path: "/api/enterprise-requests",
      method: "POST",
      body: {
        name: "Mei Tanaka",
        email: "mei@north.example",
        "cf-turnstile-response": "token-1",
      },
    });
    expect(sent().body).not.toHaveProperty("logo");
  });

  it("fetchSavedThemes GETs the list, and rejects on anything but a list", async () => {
    const themes = [{ id: "th_1", name: "Brand" }];
    answer(themes);
    expect(await fetchSavedThemes()).toEqual(themes);
    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/themes");
    expect(init?.method).toBeUndefined();
    expect(init?.credentials).toBe("same-origin");
    fetchMock.mockReset();

    answer(
      { success: false, error: { code: "UNKNOWN_ERROR", message: "x" } },
      500,
    );
    await expect(fetchSavedThemes()).rejects.toThrow(
      "Unexpected answer from /api/themes (500).",
    );
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(fetchSavedThemes()).rejects.toThrow("Failed to fetch");
  });

  it("each rejects on a network failure or an answer that isn't its result", async () => {
    const calls = [
      () => startCheckout({ plan: "pro", interval: "year" }),
      () =>
        requestInvoice({
          company: "",
          billingEmail: "",
          country: "",
          taxId: "",
          address: "",
          notes: "",
        }),
      () => sendEnterpriseRequest({ status: "idle" }, new FormData()),
    ];
    for (const call of calls) {
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      await expect(call()).rejects.toThrow("Failed to fetch");
      answer("<html>Bad gateway</html>", 502);
      await expect(call()).rejects.toThrow("Unexpected answer");
      // Another route's shape is not this one's result.
      answer({ success: true, data: {} });
      await expect(call()).rejects.toThrow("Unexpected answer");
    }
  });
});
