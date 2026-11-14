import { notFound } from "next/navigation";
import PortalHomePage from "@/ee/client-portal/portal-home-page";
import { isFeatureAvailable } from "@/lib/feature-availability";

export { generateMetadata } from "@/ee/client-portal/portal-home-page";

/**
 * A client portal's home (ee/client-portal, QRdx commercial licence). Not
 * found on servers without a licence key.
 */
export default function Page(props: {
  params: Promise<{ workspace: string }>;
}) {
  if (!isFeatureAvailable("clientPortal")) notFound();
  return <PortalHomePage {...props} />;
}
