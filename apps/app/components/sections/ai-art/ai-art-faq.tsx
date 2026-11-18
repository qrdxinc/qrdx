import { ArrowDown2 } from "iconsax-reactjs";
import { getTranslations } from "next-intl/server";
import { SectionHeader } from "@/components/sections/section-header";
import { localized } from "@/lib/i18n/content-server";
import type { AIArtAllowances } from "./ai-art-studio";
import { faqItems } from "./faq-items";

/**
 * Native <details> (one open at a time, by `name`) keeps every answer in the
 * server-rendered HTML; a closed Radix accordion panel has no content, so
 * crawlers saw the questions without their answers. The look is the
 * accordion's cards, including the 0.2s open and close where the browser can
 * animate ::details-content, and each question stays an h3.
 */
export async function AIArtFAQ({
  allowances,
}: {
  allowances: AIArtAllowances;
}) {
  const [t, FAQ_ITEMS] = await Promise.all([
    getTranslations("aiArt.faq"),
    localized(faqItems(allowances)),
  ]);
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <section
      id="faq"
      className="relative flex w-full flex-col items-center justify-center gap-10 pb-10"
    >
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: schema markup requires raw JSON
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <SectionHeader>
        <h2 className="text-center text-3xl font-medium tracking-tighter text-balance md:text-4xl">
          {t("title")}
        </h2>
        <p className="text-muted-foreground text-center font-medium text-balance">
          {t("description")}
        </p>
      </SectionHeader>

      <div className="mx-auto w-full max-w-3xl px-10">
        <div className="grid w-full gap-2 [interpolate-size:allow-keywords]">
          {FAQ_ITEMS.map((faq) => (
            <details
              className="group [&::details-content]:h-0 [&::details-content]:overflow-hidden [&::details-content]:transition-[height,content-visibility] [&::details-content]:duration-200 [&::details-content]:ease-out [&::details-content]:[transition-behavior:allow-discrete] open:[&::details-content]:h-auto motion-reduce:[&::details-content]:transition-none"
              key={faq.question}
              name="ai-art-faq"
            >
              <summary className="bg-secondary-muted border-border focus-visible:border-ring focus-visible:ring-ring/50 group-open:ring-secondary/20 flex cursor-pointer list-none items-start justify-between gap-4 rounded-lg border px-4 py-3.5 text-left text-sm font-medium transition-all outline-none group-open:ring focus-visible:ring-[3px] [&::-webkit-details-marker]:hidden">
                {/* An h3, as the accordion's header was: the same heading
                    outline and the display font the question had. */}
                <h3>{faq.question}</h3>
                <ArrowDown2
                  aria-hidden
                  className="text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <div className="text-muted-foreground bg-muted mt-2 rounded-lg border p-3 text-sm">
                <p className="leading-relaxed font-medium">{faq.answer}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
