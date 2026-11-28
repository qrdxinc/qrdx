import type { IntegrationDefinition } from "../../registry/types";
import { ZOHO_DATA_CENTRES, ZOHO_DEFAULT_ACCOUNTS } from "./data-centres";

/**
 * Leads only, create and update: the two operations an upsert can do.
 * Zoho's scope docs list CREATE and UPDATE per module; its upsert page also
 * names WRITE, which the scope page doesn't list. Not yet tried against a
 * real account: if Zoho refuses the upsert (OAUTH_SCOPE_MISMATCH), the
 * fallback is ZohoCRM.modules.leads.ALL.
 */
export const ZOHO_CRM_SCOPES = [
  "ZohoCRM.modules.leads.CREATE",
  "ZohoCRM.modules.leads.UPDATE",
];

/** Zoho CRM leads from form responses (OAuth, one app for every data centre). */
export const zohoCrmIntegration: IntegrationDefinition = {
  slug: "zoho-crm",
  name: "Zoho CRM",
  description:
    "Create or update a Zoho CRM lead for every form response on your hosted pages",
  // No logo file: Zoho's marks need Zoho's approval. The catalog entry's
  // icon is shown until then (catalog/entries/crm.ts).
  logos: { light: "", dark: "" },
  category: ["crm"],
  type: "oauth",
  oauth: {
    authUrl: `${ZOHO_DEFAULT_ACCOUNTS}/oauth/v2/auth`,
    tokenUrl: `${ZOHO_DEFAULT_ACCOUNTS}/oauth/v2/token`,
    scopes: ZOHO_CRM_SCOPES,
    scopeSeparator: ",",
    // Zoho's server-based OAuth doesn't document PKCE; state still applies.
    pkce: false,
    responseType: "code",
    // offline: a refresh token; consent: asked each time, so a reconnect
    // gets a new refresh token too.
    extraParams: { access_type: "offline", prompt: "consent" },
    // The person's data centre comes back as `accounts-server`; the code is
    // exchanged and tokens refreshed there.
    tokenOrigins: {
      param: "accounts-server",
      allowed: ZOHO_DATA_CENTRES.map((dc) => dc.accounts),
    },
  },
  capabilities: [
    {
      kind: "event-sink",
      id: "zoho-crm-leads",
      label: "Form responses to leads",
      description:
        "Each new response creates a lead, or updates the lead with the same email, with the fields you map (email, name and phone are suggested).",
      surfaces: ["settings-detail"],
      requiresConnection: true,
      data: ["form-responses"],
      modes: ["sync"],
    },
  ],
  features: [
    "Leads matched by email: no duplicate leads",
    "Field mapping with suggested defaults",
    "Batched, retried with backoff, last sync shown in settings",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://www.zoho.com/crm/",
};
