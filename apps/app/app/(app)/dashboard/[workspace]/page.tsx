import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { getHomeFirstRun } from "@/app/(app)/dashboard/_components/home/first-run";
import { getHomeData } from "@/app/(app)/dashboard/_components/home/home-data";
import { HomeView } from "@/app/(app)/dashboard/_components/home/home-view";
import { getHomeProMoments } from "@/app/(app)/dashboard/_components/home/pro-moments";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { getAppLocale } from "@/lib/i18n/app-locale";
import {
  CURRENCY_COOKIE,
  currencyForRegion,
  resolveRegion,
} from "@/lib/region";

export const metadata: Metadata = {
  title: "Home",
  robots: { index: false, follow: false },
};

/** A workspace's Home: counts and the newest codes. */
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const [scope, { workspace }, requestHeaders, cookieStore, locale] =
    await Promise.all([
      requireDashboardScope(),
      params,
      headers(),
      cookies(),
      getAppLocale(),
    ]);
  const data = await getHomeData(scope);
  // Pro's price as /pricing shows it here: the region picks the currency.
  const currency = currencyForRegion(
    resolveRegion({
      cookie: cookieStore.get(CURRENCY_COOKIE)?.value,
      headers: requestHeaders,
    }),
  );
  const [moments, firstRun] = await Promise.all([
    getHomeProMoments(scope, {
      plan: data.plan,
      codesUsed: data.codes.used,
      currency,
      locale,
    }),
    getHomeFirstRun({
      userId: scope.userId,
      codes: data.codes.used,
      scans: data.totalScans,
    }),
  ]);
  return (
    <HomeView
      data={data}
      firstRun={firstRun}
      moments={moments}
      organizationId={scope.organizationId}
      slug={workspace}
    />
  );
}
