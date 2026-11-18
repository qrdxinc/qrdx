import type { IntegrationDefinition } from "../../registry/types";

/**
 * Uniqode: connects with an API key, for importing its dynamic website codes
 * (Codes → Import) and pointing them at their new QRdx codes. No editor tools.
 */
export const uniqodeIntegration: IntegrationDefinition = {
  slug: "uniqode",
  name: "Uniqode",
  description:
    "Import your Uniqode dynamic codes and point them at their new QRdx codes",
  logos: {
    light: "/compare/uniqode.svg",
    dark: "/compare/uniqode.svg",
  },
  category: ["marketing"],
  type: "api_key",
  apiKey: {
    label: "API key",
    placeholder: "Paste your Uniqode API key",
    helpUrl: "https://dashboard.uniqode.com/",
    helpText:
      "In Uniqode, open API in the left sidebar and copy your API key. Uniqode's API comes with the Core plan and above, for Owners and Admins.",
  },
  capabilities: [],
  features: [
    "Import dynamic website codes from Codes → Import",
    "Point old Uniqode codes at their new QRdx codes, with undo",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://www.uniqode.com",
};
