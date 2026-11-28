import type { IntegrationDefinition } from "../../registry/types";
import { ZOHO_DATA_CENTRES, ZOHO_DEFAULT_ACCOUNTS } from "./data-centres";

/**
 * Leads only, every operation. Zoho's docs don't agree on a narrower scope
 * for an upsert: the upsert page (crm/developer/docs/api/v8/upsert-records)
 * accepts ALL, WRITE or CREATE and names "WRITE/CREATE" in its scope error;
 * the scopes page (…/v8/scopes) lists ALL, CREATE, READ, UPDATE and DELETE,
 * with no WRITE; the update page (…/v8/update-records) asks for UPDATE. So
 * neither WRITE (not a listed operation) nor CREATE (which may not cover the
 * update half) is safely enough, and CREATE plus UPDATE isn't documented for
 * an upsert. ALL on the Leads module is the narrowest scope the upsert page
 * documents without doubt. QRdx only ever creates and updates leads.
 */
export const ZOHO_CRM_SCOPES = ["ZohoCRM.modules.leads.ALL"];

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
