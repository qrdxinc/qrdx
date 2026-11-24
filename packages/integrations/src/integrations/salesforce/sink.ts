import {
  EMAIL_TARGET,
  FULL_NAME_TARGET,
  isPageIncluded,
  mappedValues,
  mappingFor,
  type ResponseSinkSettings,
  type SinkTarget,
} from "../../sinks/mapping";
import { cursorAfter, dedupeLatest } from "../../sinks/state";
import type { SinkDeliveryResult, SinkFormResponse } from "../../sinks/types";
import {
  readSalesforceError,
  SALESFORCE_COLLECTION_SIZE,
  type SalesforceClient,
  type SalesforceErrorInfo,
  type SalesforceSaveResult,
  salesforceError,
} from "./client";

/** metadata.settings of a Salesforce stream. */
export interface SalesforceSettings extends ResponseSinkSettings {
  /** LeadSource on the leads QRdx creates; "" leaves it empty */
  leadSource: string;
}

/** A value in Salesforce's standard Lead Source picklist. */
export const SALESFORCE_DEFAULT_LEAD_SOURCE = "Web";
/** What Salesforce itself writes when a lead has no company. */
export const SALESFORCE_NO_COMPANY = "[not provided]";

/**
 * Standard lead fields offered in the mapping UI. State and Country have no
 * suggestion: with state and country picklists on, Salesforce accepts only
 * its own names, so mapping them is a choice, not a default.
 */
export const SALESFORCE_TARGETS: SinkTarget[] = [
  { id: EMAIL_TARGET, label: "Email", types: ["email"] },
  {
    id: FULL_NAME_TARGET,
    label: "Full name (first + last)",
    hints: /^(full\s*)?name$|^your name|^name\b/i,
  },
  { id: "FirstName", label: "First name", hints: /first\s*name|given/i },
  { id: "LastName", label: "Last name", hints: /last\s*name|surname|family/i },
  { id: "Phone", label: "Phone", types: ["phone"] },
  { id: "MobilePhone", label: "Mobile phone", hints: /mobile|cell/i },
  {
    id: "Company",
    label: "Company",
    hints: /company|organi[sz]ation|business/i,
  },
  { id: "Title", label: "Title", hints: /job|role|position/i },
  { id: "Website", label: "Website", hints: /website|\burl\b|site/i },
  { id: "City", label: "City", hints: /\bcity\b|town/i },
  { id: "State", label: "State/Province" },
  {
    id: "PostalCode",
    label: "Zip/Postal code",
    hints: /zip|postal|post\s*code/i,
  },
  { id: "Country", label: "Country" },
  {
    id: "Description",
    label: "Description",
    hints: /message|comment|question|note/i,
  },
];

const TARGET_IDS = new Set(SALESFORCE_TARGETS.map((target) => target.id));
const NAMES = { first: "FirstName", last: "LastName" };

/** Standard lead field lengths; longer answers are cut to fit. */
const MAX_LENGTH: Record<string, number> = {
  FirstName: 40,
  LastName: 80,
  Phone: 40,
  MobilePhone: 40,
  Company: 255,
  Title: 128,
  Website: 255,
  City: 40,
  State: 80,
  PostalCode: 20,
  Country: 80,
  Description: 32_000,
  LeadSource: 255,
};
/** Lead.Email holds at most 80 characters. */
const EMAIL_MAX = 80;

const clip = (value: string, max: number) =>
  value.length <= max ? value : Array.from(value).slice(0, max).join("");

export interface SalesforceLeadPlan {
  email: string;
  /** Mapped, answered lead fields (no defaults) */
  fields: Record<string, string>;
}

/**
 * One plan per email (latest answer wins). Responses without a usable
 * email are skipped; only standard fields offered in the mapping are sent,
 * cut to their length. A single name becomes the last name, as Salesforce
 * requires one.
 */
export function salesforceLeads(
  responses: SinkFormResponse[],
  settings: ResponseSinkSettings
): { leads: SalesforceLeadPlan[]; skipped: number } {
  const leads: SalesforceLeadPlan[] = [];
  let skipped = 0;
  for (const response of responses) {
    if (!isPageIncluded(settings, response.pageId)) {
      skipped++;
      continue;
    }
    const mapping = mappingFor(response, settings, SALESFORCE_TARGETS);
    const fields = Object.fromEntries(
      Object.entries(mapping.fields).filter(([, target]) =>
        TARGET_IDS.has(target)
      )
    );
    const mapped = mappedValues(response, { ...mapping, fields }, NAMES);
    if (!mapped || mapped.email.length > EMAIL_MAX) {
      skipped++;
      continue;
    }
    const values: Record<string, string> = {};
    for (const [field, value] of Object.entries(mapped.values)) {
      if (TARGET_IDS.has(field) && MAX_LENGTH[field]) {
        values[field] = clip(value, MAX_LENGTH[field]);
      }
    }
    const { FirstName, ...rest } = values;
    leads.push({
      email: mapped.email,
      fields:
        FirstName && !values.LastName
          ? { ...rest, LastName: clip(FirstName, MAX_LENGTH.LastName) }
          : values,
    });
  }
  const unique = dedupeLatest(leads, (lead) => lead.email);
  return { leads: unique, skipped: skipped + leads.length - unique.length };
}

/**
 * A new lead: the mapped fields, the email, and what Salesforce requires
 * (LastName from the email's local part, Company "[not provided]"), with the
 * chosen lead source.
 */
export function newLeadRecord(
  lead: SalesforceLeadPlan,
  settings: Pick<SalesforceSettings, "leadSource">
): Record<string, string> {
  const record: Record<string, string> = { ...lead.fields, Email: lead.email };
  if (!record.LastName) {
    record.LastName = clip(lead.email.split("@")[0] || lead.email, 80);
  }
  if (!record.Company) record.Company = SALESFORCE_NO_COMPANY;
  const source = settings.leadSource.trim();
  if (source) record.LeadSource = clip(source, MAX_LENGTH.LeadSource);
  return record;
}

/** The lead is gone (deleted, merged) or converted since it was found: create one. */
const GONE = new Set([
  "ENTITY_IS_DELETED",
  "CANNOT_UPDATE_CONVERTED_LEAD",
  "NOT_FOUND",
]);
/** About this one response, not the org's setup: skipped like a missing email. */
const SKIPPED = new Set(["INVALID_EMAIL_ADDRESS"]);

const chunks = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size)
  );

const errorOf = (result: SalesforceSaveResult): SalesforceErrorInfo =>
  readSalesforceError(result) ?? { code: "UNKNOWN_ERROR", fields: [] };

/**
 * Creates or updates one lead per email. Every delivery looks the emails up
 * among open leads (a delivery re-run after a timeout must find the leads it
 * already made), except emails `leadIds` already holds: the run's email →
 * lead id map, shared by its batches, so two responses in back-to-back
 * batches never make two leads. A rejected record fails the delivery with
 * Salesforce's reason after the rest of its call is recorded; retrying is
 * safe, since the leads made are found by email next time.
 */
export async function syncResponsesToSalesforce(
  client: SalesforceClient,
  settings: SalesforceSettings,
  responses: SinkFormResponse[],
  leadIds: Map<string, string> = new Map()
): Promise<SinkDeliveryResult> {
  const { leads, skipped: planned } = salesforceLeads(responses, settings);
  let skipped = planned;

  const unknown = leads
    .map((lead) => lead.email)
    .filter((email) => !leadIds.has(email));
  if (unknown.length > 0) {
    for (const [email, id] of await client.findOpenLeadIds(unknown)) {
      leadIds.set(email, id);
    }
  }

  const toCreate: SalesforceLeadPlan[] = [];
  const toUpdate: { lead: SalesforceLeadPlan; id: string }[] = [];
  for (const lead of leads) {
    const id = leadIds.get(lead.email);
    if (!id) toCreate.push(lead);
    // Only the email was answered: the lead is already there.
    else if (Object.keys(lead.fields).length > 0) toUpdate.push({ lead, id });
  }

  for (const chunk of chunks(toUpdate, SALESFORCE_COLLECTION_SIZE)) {
    const results = await client.updateLeads(
      chunk.map(({ lead, id }) => ({ id, ...lead.fields }))
    );
    let failure: SalesforceErrorInfo | null = null;
    for (const [index, result] of results.entries()) {
      const item = chunk[index];
      if (result.success || !item) continue;
      const error = errorOf(result);
      if (GONE.has(error.code)) {
        leadIds.delete(item.lead.email);
        toCreate.push(item.lead);
      } else if (SKIPPED.has(error.code)) {
        skipped++;
      } else {
        failure ??= error;
      }
    }
    if (failure) throw salesforceError(failure, 0);
  }

  for (const chunk of chunks(toCreate, SALESFORCE_COLLECTION_SIZE)) {
    const results = await client.createLeads(
      chunk.map((lead) => newLeadRecord(lead, settings))
    );
    let failure: SalesforceErrorInfo | null = null;
    for (const [index, result] of results.entries()) {
      const lead = chunk[index];
      if (!lead) continue;
      if (result.success && typeof result.id === "string") {
        leadIds.set(lead.email, result.id);
        continue;
      }
      const error = errorOf(result);
      if (SKIPPED.has(error.code)) skipped++;
      else failure ??= error;
    }
    if (failure) throw salesforceError(failure, 0);
  }

  return {
    delivered: leads.length - (skipped - planned),
    skipped,
    cursor: cursorAfter(responses, (response) => ({
      at: response.createdAt,
      id: response.id,
    })),
  };
}
