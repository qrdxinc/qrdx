import { SUPPORT_EMAIL } from "@repo/config";
import { Info } from "@repo/design-system/components/icons";
import { ArrowSwapHorizontal, Global, Printer } from "iconsax-reactjs";
import type { ReactNode } from "react";
import { LocaleLink } from "@/components/i18n/locale-link";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { compareMigration } from "@/lib/migrate/compare";
import { CompareMigrateButton } from "./compare-migrate-button";

interface CompareMigrateProps {
  slug: string;
  competitor: string;
}

const LINK_CLASS =
  "font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground";

/**
 * Link shapes seen on real codes on customers' own domains (checked 17 Nov
 * 2026), for the own-domain case. Only providers where we saw them; the
 * others get the general case, and the docs' "Move your QR domain to QRdx"
 * lists every provider.
 */
const OWN_DOMAIN_SHAPES: Record<string, ReactNode> = {
  "bitly-qr": (
    <>
      On customers&apos; own domains we&apos;ve seen Bitly links like
      /aB3xYz9?r=qr, and words (checked November 17, 2026). QRdx answers them as
      they are and ignores the ?r=qr.
    </>
  ),
  flowcode: (
    <>
      On customers&apos; own domains we&apos;ve seen Flowcode codes like
      /r/aB3x, and longer paths (checked November 17, 2026). QRdx answers those
      with{" "}
      <LocaleLink className={LINK_CLASS} href="/docs/migrate#path-aliases">
        path aliases
      </LocaleLink>
      .
    </>
  ),
  hovercode: (
    <>
      On customers&apos; own domains we&apos;ve seen Hovercode codes of 8
      letters and digits, and words (checked November 17, 2026). QRdx answers
      them as they are.
    </>
  ),
  uniqode: (
    <>
      On customers&apos; own domains we&apos;ve seen Uniqode codes like /aB3xYz,
      and words (checked November 17, 2026). QRdx answers them as they are.
      Codes printed on Uniqode&apos;s own qrcodes.pro don&apos;t move with your
      domain.
    </>
  ),
};

interface PrintedCase {
  icon: typeof Global;
  title: string;
  outcome: string;
  body: ReactNode;
}

/**
 * "How to switch": three steps, what happens to printed codes, the button.
 * Codes from an import (api, file) depend on where they point: a domain the
 * customer owns can move with no reprint, codes on the provider's domain need
 * its plan until the reprint, and codes that already stopped need a reprint.
 * Imports also get the switch offers (docs/migrate "Free help with your
 * move"): a switch check from one old link, and help with a big move.
 */
export function CompareMigrate({ slug, competitor }: CompareMigrateProps) {
  const migration = compareMigration(slug, competitor);
  const imported = migration.kind === "api" || migration.kind === "file";
  const customDomains = isFeatureAvailable("customDomains");

  const cases: PrintedCase[] = [
    ...(customDomains
      ? [
          {
            icon: Global,
            title: "On a domain you own",
            outcome: "No reprint",
            body: (
              <>
                If your printed codes use your own domain, like
                qr.yourbrand.com, import them with{" "}
                <strong className="font-medium text-foreground">
                  Keep the original back-halves
                </strong>{" "}
                on that domain, then point the domain&apos;s DNS at QRdx. The
                same printed codes then open through QRdx. Links don&apos;t work
                between the DNS change and QRdx verifying the domain (usually
                minutes), so do it at a quiet time.{" "}
                {OWN_DOMAIN_SHAPES[slug] ? (
                  <>{OWN_DOMAIN_SHAPES[slug]} </>
                ) : null}
                The import preview shows any back-half QRdx can&apos;t keep.
                Custom domains are on Pro and Business.{" "}
                <LocaleLink
                  className={LINK_CLASS}
                  href="/docs/move-your-qr-domain"
                >
                  How to move your QR domain
                </LocaleLink>
              </>
            ),
          },
        ]
      : []),
    {
      icon: ArrowSwapHorizontal,
      title: `On ${competitor}'s domain`,
      outcome: "Point them at QRdx, then reprint",
      body: migration.printed,
    },
    {
      icon: Printer,
      title: "If your codes have already stopped",
      outcome: "Reprint once",
      body: (
        <>
          When the old plan has ended and the codes no longer open anything,
          there&apos;s nothing left to move or point at QRdx, and QRdx
          can&apos;t switch them back on. Make new codes and reprint. Static
          codes can&apos;t stop, and QRdx dynamic codes keep redirecting on
          every plan under the{" "}
          <LocaleLink className={LINK_CLASS} href="/guarantee">
            Never-Hostage Guarantee
          </LocaleLink>
          .
        </>
      ),
    },
  ];

  return (
    <section className="w-full px-10 py-14 md:py-16" id="switch">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div className="space-y-2 text-center">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            How to switch
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
            {migration.kind === "library"
              ? `Switch from ${competitor} to qrdx`
              : `Move from ${competitor} to QRdx`}
          </h2>
        </div>

        <ol className="grid gap-3 sm:grid-cols-3">
          {migration.steps.map((step, index) => (
            <li className="rounded-xl border bg-card p-5" key={step}>
              <span className="grid size-7 place-items-center rounded-full border text-xs font-medium tabular-nums">
                {index + 1}
              </span>
              <p className="mt-3 text-sm text-pretty">{step}</p>
            </li>
          ))}
        </ol>

        {imported ? (
          <div className="space-y-3">
            <div className="space-y-1 text-center">
              <h3 className="font-medium">Codes you&apos;ve already printed</h3>
              <p className="text-sm text-muted-foreground text-pretty">
                Whether they need a reprint depends on where they point.
              </p>
            </div>
            <ul className="divide-y rounded-xl border bg-muted/40 text-sm dark:bg-card">
              {cases.map((item) => (
                <li className="flex gap-3 p-5" key={item.title}>
                  <item.icon
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-foreground/70"
                  />
                  <div className="space-y-1">
                    <p>
                      <span className="font-medium">{item.title}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {item.outcome}
                      </span>
                    </p>
                    <p className="text-muted-foreground text-pretty">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex gap-3 rounded-xl border bg-muted/40 p-5 text-sm dark:bg-card">
            <Info
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-foreground/70"
            />
            <div className="space-y-1">
              <p className="font-medium">Printed codes</p>
              <p className="text-muted-foreground text-pretty">
                {migration.printed}
              </p>
            </div>
          </div>
        )}

        {imported ? (
          <p className="text-center text-sm text-muted-foreground text-pretty">
            Not sure which way fits? Send one of your old QR links to{" "}
            <a className={LINK_CLASS} href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>{" "}
            and we&apos;ll tell you. Moving many codes
            {customDomains ? " or your own domain" : ""}? We do the move with
            you.{" "}
            <LocaleLink
              className={LINK_CLASS}
              href="/docs/migrate#free-help-with-your-move"
            >
              Free help with your move
            </LocaleLink>
          </p>
        ) : null}

        <div className="flex justify-center">
          <CompareMigrateButton
            docs={migration.kind === "library"}
            href={migration.href}
            label={migration.label}
            variant="default"
          />
        </div>
      </div>
    </section>
  );
}
