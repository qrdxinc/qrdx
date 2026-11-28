import { ZOHO_DATA_CENTRES } from "../../integrations/zoho-crm/data-centres";
import type { CatalogCapability, IntegrationCatalogEntry } from "../types";

// Data out: form responses from hosted pages into CRMs and email lists.

/** "US, EU, … and UK": the data centres QRdx connects Zoho CRM in. */
const ZOHO_DATA_CENTRE_NAMES = (() => {
  const labels = ZOHO_DATA_CENTRES.map((dc) => dc.label);
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
})();

const DELIVERY: CatalogCapability = {
  title: "Delivered reliably",
  description:
    "Batched, retried with backoff for about two days, never sent twice, with the last sync shown in settings.",
};

export const crm: IntegrationCatalogEntry[] = [
  {
    slug: "hubspot",
    name: "HubSpot",
    tagline:
      "Every form response on your hosted pages creates or updates a HubSpot contact.",
    description: [
      "Connect HubSpot, choose the pages, and map each form's questions to contact properties. Email, name and phone are suggested for you. New responses then upsert a contact by email, so the same person never becomes two contacts.",
      "QRdx asks only to write contacts (crm.objects.contacts.write), and only questions you map are sent.",
    ],
    kind: "connect",
    surface: "integrations",
    categories: ["crm"],
    logo: { type: "image", src: "/integrations/hubspot.svg" },
    plan: "free",
    builtBy: "QRdx",
    website: "https://www.hubspot.com",
    primaryAction: {
      type: "link",
      label: "Connect HubSpot",
      href: "/settings/integrations/hubspot",
    },
    steps: [
      {
        title: "Click Enable and pick your HubSpot account",
        body: "Settings → Integrations → HubSpot. Approve contacts write access.",
      },
      {
        title: "Choose pages and map fields",
        body: "Pick the hosted pages whose forms should reach HubSpot, check the suggested mapping, and turn the sync on.",
      },
      {
        title: "New responses become contacts",
        body: "Responses after you turn it on are sent within minutes. Responses without an email are skipped.",
      },
    ],
    capabilities: [
      {
        title: "Upsert by email",
        description: "One contact per person, updated by later responses.",
      },
      {
        title: "Field mapping",
        description:
          "Email, name, phone, company and more, with suggested defaults.",
      },
      DELIVERY,
    ],
    keywords: ["crm", "contacts", "leads", "forms", "oauth"],
    related: ["mailchimp", "google-sheets", "webhooks"],
  },
  {
    slug: "mailchimp",
    name: "Mailchimp",
    tagline:
      "Add people who fill in your forms to a Mailchimp audience, with tags, respecting consent.",
    description: [
      "Connect Mailchimp, pick an audience and tags, and map each form's questions to merge fields. Each new response adds or updates a member.",
      "Consent comes first: with a consent checkbox on the form, only people who tick it are subscribed. Without one, people get Mailchimp's confirmation email (double opt-in) or are skipped, as you choose. Nobody who unsubscribed is ever re-subscribed, and only questions the form asked are sent.",
    ],
    kind: "connect",
    surface: "integrations",
    categories: ["crm"],
    logo: { type: "image", src: "/integrations/mailchimp.svg" },
    plan: "free",
    builtBy: "QRdx",
    website: "https://mailchimp.com",
    primaryAction: {
      type: "link",
      label: "Connect Mailchimp",
      href: "/settings/integrations/mailchimp",
    },
    steps: [
      {
        title: "Click Enable and log in to Mailchimp",
        body: "Settings → Integrations → Mailchimp.",
      },
      {
        title: "Pick the audience, tags and pages",
        body: "Then check the field mapping and the consent checkbox QRdx found on each form.",
      },
      {
        title: "Turn the sync on",
        body: "Responses after that are added within minutes.",
      },
    ],
    capabilities: [
      {
        title: "Audience and tags",
        description: "Members are added or updated with the tags you pick.",
      },
      {
        title: "Consent",
        description:
          "Subscribed only with a ticked consent box; otherwise double opt-in.",
      },
      DELIVERY,
    ],
    keywords: ["email", "newsletter", "audience", "list", "marketing"],
    related: ["hubspot", "google-sheets", "webhooks"],
  },
  {
    slug: "pipedrive",
    name: "Pipedrive",
    tagline:
      "Every form response on your hosted pages creates or updates a Pipedrive person, and can add a lead.",
    description: [
      "Connect Pipedrive, choose the pages, and map each form's questions to person fields. Email, name and phone are suggested for you. New responses then find the person by email and update them, or create one.",
      "Turn on leads and every response also adds a lead linked to that person, so each enquiry lands in your Leads Inbox. QRdx asks for access to contacts and leads, and only questions you map are sent. If a delivery is retried, a response that already has a lead doesn't get a second one.",
    ],
    kind: "connect",
    surface: "integrations",
    categories: ["crm"],
    logo: { type: "image", src: "/integrations/pipedrive.svg" },
    plan: "free",
    builtBy: "QRdx",
    website: "https://www.pipedrive.com",
    primaryAction: {
      type: "link",
      label: "Connect Pipedrive",
      href: "/settings/integrations/pipedrive",
    },
    steps: [
      {
        title: "Click Enable and pick your Pipedrive account",
        body: "Settings → Integrations → Pipedrive. Approve access to contacts and leads.",
      },
      {
        title: "Choose pages and map fields",
        body: "Pick the hosted pages whose forms should reach Pipedrive, check the suggested mapping, and choose whether each response also adds a lead.",
      },
      {
        title: "New responses become persons and leads",
        body: "Responses after you turn it on are sent within minutes. Responses without an email, or with one longer than Pipedrive can search (100 characters), are skipped.",
      },
    ],
    capabilities: [
      {
        title: "Persons found by email",
        description: "One person per email, updated by later responses.",
      },
      {
        title: "A lead for every response",
        description:
          "Optional, linked to the person, and never added twice when a delivery is retried.",
      },
      {
        title: "Field mapping",
        description: "Email, name and phone, with suggested defaults.",
      },
      {
        title: "Delivered reliably",
        description:
          "Batched, retried with backoff for about two days, with the last sync shown in settings.",
      },
    ],
    keywords: ["crm", "persons", "leads", "sales", "forms", "oauth"],
    related: ["hubspot", "mailchimp", "webhooks"],
  },
  {
    slug: "zoho-crm",
    name: "Zoho CRM",
    tagline:
      "Every form response on your hosted pages creates or updates a Zoho CRM lead.",
    description: [
      "Connect Zoho CRM, choose the pages, and map each form's questions to lead fields. Email, name and phone are suggested for you. A response from an email that already has a lead updates that lead; any other response creates one.",
      "Zoho CRM needs a last name on every lead. When a form doesn't give one, QRdx first sends the lead without it, so an existing lead keeps its name; only when Zoho needs one to create the lead does QRdx use the first name, or else the part of the email before the @. QRdx asks only to create and update leads, and only questions you map are sent.",
      `Accounts in Zoho's ${ZOHO_DATA_CENTRE_NAMES} data centres can connect.`,
    ],
    kind: "connect",
    surface: "integrations",
    categories: ["crm"],
    // Zoho's logo needs Zoho's approval first; a neutral icon until then.
    logo: { type: "feature", icon: "Global" },
    plan: "free",
    builtBy: "QRdx",
    website: "https://www.zoho.com/crm/",
    primaryAction: {
      type: "link",
      label: "Connect Zoho CRM",
      href: "/settings/integrations/zoho-crm",
    },
    steps: [
      {
        title: "Click Enable and sign in to Zoho",
        body: "Settings → Integrations → Zoho CRM. Allow QRdx to create and update leads. It needs a Zoho CRM edition with API access and a user who can create leads.",
      },
      {
        title: "Choose pages and map fields",
        body: "Pick the hosted pages whose forms should reach Zoho CRM, check the suggested mapping, and turn the sync on.",
      },
      {
        title: "New responses become leads",
        body: "Responses after you turn it on are sent within minutes. Responses without an email, or with one longer than Zoho CRM's Email field (100 characters), are skipped, and so is a response whose values Zoho refuses.",
      },
    ],
    capabilities: [
      {
        title: "Matched by email",
        description: "Later responses from the same email update its lead.",
      },
      {
        title: "Field mapping",
        description:
          "Email, name, phone, company, title, address and more, with suggested defaults.",
      },
      {
        title: "Delivered reliably",
        description:
          "Batched, retried with backoff for about two days, with the last sync shown in settings.",
      },
    ],
    keywords: ["crm", "leads", "zoho", "sales", "forms", "oauth"],
    related: ["hubspot", "pipedrive", "webhooks"],
  },
];
