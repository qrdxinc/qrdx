// The line under /pricing's plan cards (components/sections/pricing/
// pricing-offers.tsx): the money-back guarantee, and next to it the longer
// window for people moving from another QR code provider, with its number
// from lib/pricing.ts and a link to that part of the refund policy.
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MONEY_BACK_DAYS, SWITCHER_MONEY_BACK_DAYS } from "@/lib/pricing";
import en from "@/messages/en.json";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/pricing",
}));
vi.mock("@repo/auth/client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));

const { PricingOffers } = await import(
  "@/components/sections/pricing/pricing-offers"
);

const html = renderToStaticMarkup(
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <PricingOffers signedIn={false} />
  </NextIntlClientProvider>,
);

describe("the offers under the plan cards", () => {
  it("keeps the money-back guarantee", () => {
    expect(html).toContain(`${MONEY_BACK_DAYS}-day money-back guarantee`);
  });

  it("gives switchers their days, from lib/pricing.ts", () => {
    expect(html).toContain(
      `Moving from another QR code provider? Import your codes and you have ${SWITCHER_MONEY_BACK_DAYS} days to ask for your first payment back.`,
    );
    expect(en.pricing.offers.switcher).not.toMatch(/\d/);
  });

  it("links the refund policy's money-back section", () => {
    expect(html).toContain('href="/legal/refunds#money-back-guarantee"');
    expect(html).toContain(en.pricing.offers.switcherLink);
  });
});
