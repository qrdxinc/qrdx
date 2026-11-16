import { Button } from "@repo/design-system/components/ui/button";
import { useTranslations } from "next-intl";
import { LocaleLink } from "@/components/i18n/locale-link";
import { playgroundHref } from "@/lib/playground-links";
import { CtaGate } from "./cta-gate";

/**
 * The closing band on marketing pages: no fill of its own, so it sits on the
 * page background inside a thin rounded border; a section-size heading, one
 * sentence, the editor and pricing. Dark theme: white text and a white
 * button; light theme: the same in near-black.
 */
export function CTASection() {
  const t = useTranslations("cta");

  return (
    <CtaGate>
      <section id="cta" className="w-full px-10 py-6">
        <div className="flex flex-col items-center gap-5 rounded-[20px] px-6 py-16 text-center text-neutral-950 ring-1 ring-black/10 ring-inset md:py-20 dark:text-white dark:ring-white/10">
          <h2 className="max-w-xl text-3xl font-medium tracking-tighter text-balance md:text-4xl">
            {t("title")}
          </h2>
          <p className="max-w-md text-pretty text-neutral-950/60 dark:text-white/60">
            {t("subtext")}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2.5">
            <Button
              asChild
              className="border-neutral-950 bg-neutral-950 text-white hover:bg-neutral-950/90 dark:border-white dark:bg-white dark:text-neutral-950 dark:hover:bg-white/90"
            >
              <LocaleLink href={playgroundHref()}>{t("button")}</LocaleLink>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="text-neutral-950 hover:bg-black/5 hover:text-neutral-950 dark:text-white dark:hover:bg-white/10 dark:hover:text-white"
            >
              <LocaleLink href="/pricing">{t("secondary")}</LocaleLink>
            </Button>
          </div>
        </div>
      </section>
    </CtaGate>
  );
}
