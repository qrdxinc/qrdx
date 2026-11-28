/**
 * Zoho's data centres QRdx connects to. Each account lives in one: people
 * sign in on accounts.zoho.com, which sends them back with their own
 * accounts server (`accounts-server`), where the code is exchanged and
 * tokens are refreshed; the token response names the CRM API domain
 * (`api_domain`). Codes and tokens only ever go to the hosts listed here.
 *
 * From Zoho's multi-DC docs (zoho.com/accounts/protocol/oauth/multi-dc.html,
 * accounts.zoho.com/oauth/serverinfo). The CRM API hosts follow the domain
 * pattern of Zoho's CRM docs; the SA and UK ones aren't in those docs yet and
 * were checked only by DNS (both resolve to Zoho's servers). Zoho's server
 * list also names AE and SG data centres and a second India server: left out
 * until their CRM API hosts are documented, so those accounts can't connect.
 */
export const ZOHO_DATA_CENTRES = [
  {
    id: "us",
    label: "US",
    accounts: "https://accounts.zoho.com",
    api: "https://www.zohoapis.com",
  },
  {
    id: "eu",
    label: "EU",
    accounts: "https://accounts.zoho.eu",
    api: "https://www.zohoapis.eu",
  },
  {
    id: "in",
    label: "India",
    accounts: "https://accounts.zoho.in",
    api: "https://www.zohoapis.in",
  },
  {
    id: "au",
    label: "Australia",
    accounts: "https://accounts.zoho.com.au",
    api: "https://www.zohoapis.com.au",
  },
  {
    id: "jp",
    label: "Japan",
    accounts: "https://accounts.zoho.jp",
    api: "https://www.zohoapis.jp",
  },
  {
    id: "ca",
    label: "Canada",
    accounts: "https://accounts.zohocloud.ca",
    api: "https://www.zohoapis.ca",
  },
  {
    id: "sa",
    label: "Saudi Arabia",
    accounts: "https://accounts.zoho.sa",
    api: "https://www.zohoapis.sa",
  },
  {
    id: "uk",
    label: "UK",
    accounts: "https://accounts.zoho.uk",
    api: "https://www.zohoapis.uk",
  },
] as const;

export type ZohoDataCentre = (typeof ZOHO_DATA_CENTRES)[number];

/** Where everyone signs in, and where tokens go when the callback names none. */
export const ZOHO_DEFAULT_ACCOUNTS = ZOHO_DATA_CENTRES[0].accounts;

/** A bare https origin (no path, port, query or credentials), or null. */
function bareOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const bare =
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash;
  return bare ? url.origin : null;
}

/** The data centre whose CRM API is at `value` (a token's api_domain). */
export function zohoDataCentreByApi(value: unknown): ZohoDataCentre | null {
  const origin = bareOrigin(value);
  return ZOHO_DATA_CENTRES.find((dc) => dc.api === origin) ?? null;
}

/** The data centre whose accounts server is `value`. */
export function zohoDataCentreByAccounts(
  value: unknown
): ZohoDataCentre | null {
  const origin = bareOrigin(value);
  return ZOHO_DATA_CENTRES.find((dc) => dc.accounts === origin) ?? null;
}
