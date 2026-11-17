import { notFound } from "next/navigation";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { hasSsoConnection } from "@/ee/sso/connections";
import SsoSettingsPage from "@/ee/sso/settings-page";
import { isFeatureAvailable } from "@/lib/feature-availability";

export { metadata } from "@/ee/sso/settings-page";

/**
 * Settings → Single sign-on (ee/sso, QRdx commercial licence). Not found on
 * servers without a licence key, where SSO isn't registered at all, unless
 * the workspace still has a connection stored from when it was: the page
 * then only lets it be removed.
 */
export default async function Page() {
  if (!isFeatureAvailable("sso")) {
    const scope = await requireDashboardScope();
    if (!(await hasSsoConnection(scope.organizationId))) notFound();
  }
  return <SsoSettingsPage />;
}
