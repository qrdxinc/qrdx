import type { Locale } from "@repo/i18n/config";
import { localizePath } from "@repo/i18n/paths";
import type { ReactNode } from "react";
import { baseUrl } from "@/lib/metadata";

/**
 * QRdx's short note to someone who scanned a code and can't see its page
 * (not found, not ready yet), in their language, like the /q status pages,
 * instead of the site's 404 or the page itself.
 */
export function ScanNotice({
  locale,
  title,
  message,
  aside,
  makeYourOwn,
}: {
  locale: Locale;
  title: string;
  message: string;
  /** A smaller line under the message */
  aside?: ReactNode;
  /** The "Make your own" link's label */
  makeYourOwn: string;
}) {
  return (
    <main
      className="flex min-h-dvh w-full items-center justify-center bg-background p-6"
      lang={locale}
    >
      <div className="w-full max-w-sm space-y-2 rounded-2xl border bg-card px-7 py-10 text-center">
        <h1 className="text-xl font-semibold text-balance">{title}</h1>
        <p className="text-[15px] leading-relaxed text-pretty text-muted-foreground">
          {message}
        </p>
        {aside && (
          <p className="pt-2 text-[13px] leading-relaxed text-pretty text-muted-foreground">
            {aside}
          </p>
        )}
        <p className="pt-6">
          <a
            className="inline-block rounded-full border px-4 py-2 text-sm font-semibold"
            href={new URL(localizePath("/", locale), baseUrl).href}
          >
            {makeYourOwn}
          </a>
        </p>
      </div>
    </main>
  );
}
