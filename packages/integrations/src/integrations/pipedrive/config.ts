import type { IntegrationDefinition } from "../../registry/types";

/** Pipedrive persons (and optionally leads) from form responses (OAuth). */
export const pipedriveIntegration: IntegrationDefinition = {
  slug: "pipedrive",
  name: "Pipedrive",
  description:
    "Create or update a Pipedrive person for every form response on your hosted pages, and optionally a lead for each one",
  logos: {
    light: "/integrations/pipedrive.svg",
    dark: "/integrations/pipedrive.svg",
  },
  category: ["crm"],
  type: "oauth",
  oauth: {
    authUrl: "https://oauth.pipedrive.com/oauth/authorize",
    tokenUrl: "https://oauth.pipedrive.com/oauth/token",
    // Pipedrive's scopes are set on the app (contacts:full, leads:full), not
    // in the authorize URL, so none are requested here.
    scopes: [],
    // Pipedrive's OAuth doesn't document PKCE; state still applies.
    pkce: false,
    responseType: "code",
    // The token endpoint wants the client id and secret as HTTP Basic auth.
    tokenAuth: "basic",
  },
  capabilities: [
    {
      kind: "event-sink",
      id: "pipedrive-persons",
      label: "Form responses to persons and leads",
      description:
        "Each new response creates or updates a person found by email, with the fields you map (email, name and phone are suggested), and can add a lead linked to that person.",
      surfaces: ["settings-detail"],
      requiresConnection: true,
      data: ["form-responses"],
      modes: ["sync"],
    },
  ],
  features: [
    "Persons found by email: no duplicate persons",
    "Optional lead for every response, never created twice on a retry",
    "Batched, retried with backoff, last sync shown in settings",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://www.pipedrive.com",
};
