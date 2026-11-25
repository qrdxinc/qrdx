// After the DNS provider applies the template (or the user cancels) it sends
// the browser to redirect_uri, adding `error=` on failure. Cloudflare ignores
// `state`, so the domain id travels in redirect_uri itself, and so does the
// next step when the setup takes two applies (Vercel's TXT on the zone apex
// goes in its own). Nothing here is trusted: the page only re-checks DNS for
// that domain, or sends the browser on to that domain's next signed apply.

import { dashboardEntry } from "@/lib/workspace-paths";

export const CONNECT_RETURN_PARAM = "connected";
export const CONNECT_STEP_PARAM = "step";

const DOMAIN_ID = /^[a-z0-9]{1,64}$/i;
const STEP = /^[1-9]$/;

/**
 * Where the provider sends the browser back to, for one domain: the Domains
 * page of the person's default workspace (/dashboard?to=…, so a workspace
 * renamed in between still works), which re-checks that domain. With
 * `nextStep`, the page sends the browser on to that apply instead.
 */
export function connectRedirectUri(
  appUrl: URL,
  domainId: string,
  nextStep?: number,
): string {
  return new URL(
    dashboardEntry("settings/domains", {
      [CONNECT_RETURN_PARAM]: domainId,
      ...(nextStep ? { [CONNECT_STEP_PARAM]: String(nextStep) } : {}),
    }),
    appUrl,
  ).toString();
}

export interface ConnectReturn {
  domainId: string;
  /** False when the provider reported an error or the user cancelled */
  applied: boolean;
  /** Index of the apply to continue with; null after the last one */
  nextStep: number | null;
}

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/**
 * Reads the return from the domains page's search params. Some providers add
 * `?error=…` to a redirect_uri that already has a query, so it lands in the
 * last parameter's value; that tail is read too.
 */
export function parseConnectReturn(params: SearchParams): ConnectReturn | null {
  const [id = "", idTail = ""] = (
    first(params[CONNECT_RETURN_PARAM]) ?? ""
  ).split("?", 2);
  if (!DOMAIN_ID.test(id)) return null;
  const [step = "", stepTail = ""] = (
    first(params[CONNECT_STEP_PARAM]) ?? ""
  ).split("?", 2);
  const error =
    first(params.error) ??
    new URLSearchParams(idTail).get("error") ??
    new URLSearchParams(stepTail).get("error");
  return {
    domainId: id,
    applied: !error,
    nextStep: STEP.test(step) ? Number(step) : null,
  };
}
