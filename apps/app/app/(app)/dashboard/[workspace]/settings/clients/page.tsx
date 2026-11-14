import { notFound } from "next/navigation";
import ClientPortalSettingsPage from "@/ee/client-portal/settings-page";
import { isFeatureAvailable } from "@/lib/feature-availability";

export { metadata } from "@/ee/client-portal/settings-page";

/**
 * Settings → Client portal (ee/client-portal, QRdx commercial licence). Not
 * found on servers without a licence key, where the portal doesn't exist.
 */
export default function Page() {
  if (!isFeatureAvailable("clientPortal")) notFound();
  return <ClientPortalSettingsPage />;
}
