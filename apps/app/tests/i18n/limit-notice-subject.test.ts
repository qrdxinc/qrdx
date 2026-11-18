// The plan-limit notice's subject near a limit, by hand in the languages
// where the machine's "{value} used" disagreed with the plural noun before
// it ("Códigos QR dinámicos: 9 de 10 usado"): the workspace is the subject
// now, as in the email's preview. English is unchanged.
import { describe, expect, it } from "vitest";
import { emailIntl } from "@/lib/i18n/email";
import { noticeSubject } from "@/lib/limit-notices/levels";

const near = async (locale: Parameters<typeof emailIntl>[0], value: string) =>
  noticeSubject(
    "dynamicCodes",
    90,
    { value, workspace: "Acme" },
    await emailIntl(locale),
  );

describe("the limit notice's subject", () => {
  it("agrees with any noun in Spanish, Portuguese, Italian, French and Hindi", async () => {
    expect(await near("es", "9 de 10")).toBe(
      "Códigos QR dinámicos: Acme ha usado 9 de 10",
    );
    expect(await near("pt-BR", "9 de 10")).toBe(
      "QR codes dinâmicos: Acme usou 9 de 10",
    );
    expect(await near("it", "9 di 10")).toBe(
      "QR code dinamici: Acme ha usato 9 di 10",
    );
    expect(await near("fr", "9 sur 10")).toBe(
      "QR codes dynamiques : Acme a utilisé 9 sur 10",
    );
    expect(await near("hi", "10 में से 9")).toBe(
      "डायनेमिक QR कोड: Acme ने 10 में से 9 इस्तेमाल किए",
    );
  });

  it("is unchanged in English", () => {
    expect(
      noticeSubject("dynamicCodes", 90, {
        value: "9 of 10",
        workspace: "Acme",
      }),
    ).toBe("Dynamic QR codes: 9 of 10 used in Acme");
    expect(
      noticeSubject("dynamicCodes", 100, {
        value: "10 of 10",
        workspace: "Acme",
      }),
    ).toBe("Dynamic QR codes: limit reached in Acme");
  });
});
