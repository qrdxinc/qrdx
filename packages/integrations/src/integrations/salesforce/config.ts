import type { IntegrationDefinition } from "../../registry/types";

/** Where people sign in: production orgs (and Developer Edition), or sandboxes. */
export const SALESFORCE_LOGIN_HOSTS = {
  production: "https://login.salesforce.com",
  sandbox: "https://test.salesforce.com",
} as const;

export type SalesforceEnvironment = keyof typeof SALESFORCE_LOGIN_HOSTS;

const oauthUrls = (host: string) => ({
  authUrl: `${host}/services/oauth2/authorize`,
  tokenUrl: `${host}/services/oauth2/token`,
});

/**
 * Salesforce leads from form responses (OAuth 2.0 web server flow with
 * PKCE; `api` to write leads, `refresh_token` to keep syncing). Production
 * is the default sign-in host; "sandbox" is picked when connecting and kept
 * in the connection's metadata.oauthVariant.
 */
export const salesforceIntegration: IntegrationDefinition = {
  slug: "salesforce",
  name: "Salesforce",
  description:
    "Create or update a Salesforce lead for every form response on your hosted pages",
  // No logo file: the catalog entry's icon is shown until the owner decides
  // on Salesforce's own mark (catalog/entries/crm.ts).
  logos: { light: "", dark: "" },
  category: ["crm"],
  type: "oauth",
  oauth: {
    ...oauthUrls(SALESFORCE_LOGIN_HOSTS.production),
    scopes: ["api", "refresh_token"],
    pkce: true,
    responseType: "code",
    variants: { sandbox: oauthUrls(SALESFORCE_LOGIN_HOSTS.sandbox) },
  },
  capabilities: [
    {
      kind: "event-sink",
      id: "salesforce-leads",
      label: "Form responses to leads",
      description:
        "Each new response creates a lead, or updates the open lead with the same email, with the fields you map and the lead source you pick.",
      surfaces: ["settings-detail"],
      requiresConnection: true,
      data: ["form-responses"],
      modes: ["sync"],
    },
  ],
  features: [
    "Matches open leads by email: no duplicate leads",
    "Field mapping with suggested defaults",
    "Production or sandbox orgs",
    "Batched, retried with backoff, last sync shown in settings",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://www.salesforce.com",
};
