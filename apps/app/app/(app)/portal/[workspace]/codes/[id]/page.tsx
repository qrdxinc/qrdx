import { notFound } from "next/navigation";
import PortalCodePage from "@/ee/client-portal/portal-code-page";
import { isFeatureAvailable } from "@/lib/feature-availability";

export { generateMetadata } from "@/ee/client-portal/portal-code-page";

/**
 * One code in a client portal (ee/client-portal, QRdx commercial licence).
 * Not found on servers without a licence key.
 */
export default function Page(props: {
  params: Promise<{ workspace: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isFeatureAvailable("clientPortal")) notFound();
  return <PortalCodePage {...props} />;
}
