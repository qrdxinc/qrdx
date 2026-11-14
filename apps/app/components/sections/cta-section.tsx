import { Button } from "@repo/design-system/components/ui/button";
import { useTranslations } from "next-intl";
import { LocaleLink } from "@/components/i18n/locale-link";
import { playgroundHref } from "@/lib/playground-links";
import { CtaGate } from "./cta-gate";

/**
 * The closing band on marketing pages: the same calm dark surface in both
 * themes, a section-size heading, one sentence, the editor and pricing.
 */
export function CTASection() {
  const t = useTranslations("cta");

  return (
    <CtaGate>
      <section id="cta" className="w-full px-10 py-6">
        <div className="flex flex-col items-center gap-5 rounded-[20px] bg-neutral-950 px-6 py-16 text-center text-white ring-1 ring-white/10 ring-inset md:py-20">
          <h2 className="max-w-xl text-3xl font-medium tracking-tighter text-balance md:text-4xl">
            {t("title")}
          </h2>
          <p className="max-w-md text-pretty text-white/60">{t("subtext")}</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2.5">
            <Button
              asChild
              className="border-white bg-white text-neutral-950 hover:bg-white/90 dark:text-neutral-950"
            >
              <LocaleLink href={playgroundHref()}>{t("button")}</LocaleLink>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="text-white hover:bg-white/10 hover:text-white dark:hover:bg-white/10"
            >
              <LocaleLink href="/pricing">{t("secondary")}</LocaleLink>
            </Button>
          </div>
        </div>
      </section>
    </CtaGate>
  );
}
