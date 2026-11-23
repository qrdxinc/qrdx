import { headers } from "next/headers";
import { negotiateLocale } from "@/lib/i18n/accept-language";
import { scanPagesIntl } from "@/lib/i18n/scan-pages";
import { ScanNotice } from "../_components/scan-notice";

// A hosted page that doesn't exist (or was removed), seen by someone who
// scanned a code: QRdx's short note in their language, like the /q status
// pages, instead of the site's 404.
export default async function HostedPageNotFound() {
  const locale = negotiateLocale((await headers()).get("accept-language"));
  const { t } = await scanPagesIntl(locale);
  return (
    <ScanNotice
      locale={locale}
      makeYourOwn={t("status.makeYourOwn")}
      message={t("hosted.notFoundMessage")}
      title={t("hosted.notFoundTitle")}
    />
  );
}
