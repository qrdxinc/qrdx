import ClientPortalSettingsPage from "@/ee/client-portal/settings-page";

export { metadata } from "@/ee/client-portal/settings-page";

/**
 * Settings → Client portal (ee/client-portal, QRdx commercial licence). On
 * servers without a licence key the page itself answers not found, unless
 * clients are still stored: then it only lets them be removed.
 */
export default function Page() {
  return <ClientPortalSettingsPage />;
}
