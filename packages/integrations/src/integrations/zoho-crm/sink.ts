import { IntegrationApiError } from "../../core/http-client";
import {
  EMAIL_TARGET,
  FULL_NAME_TARGET,
  isPageIncluded,
  mappedValues,
  mappingFor,
  type ResponseSinkSettings,
  type SinkTarget,
} from "../../sinks/mapping";
import {
  cursorAfter,
  dedupeLatest,
  SinkPartialDeliveryError,
} from "../../sinks/state";
import type { SinkDeliveryResult, SinkFormResponse } from "../../sinks/types";
import {
  ZOHO_CRM_BATCH_SIZE,
  type ZohoCrmClient,
  type ZohoLeadFields,
  type ZohoUpsertResult,
} from "./client";

/** Standard lead fields offered in the mapping UI, by Zoho API name. */
export const ZOHO_CRM_TARGETS: SinkTarget[] = [
  { id: EMAIL_TARGET, label: "Email", types: ["email"] },
  {
    id: FULL_NAME_TARGET,
    label: "Full name (first + last)",
    hints: /^(full\s*)?name$|^your name|^name\b/i,
  },
  { id: "First_Name", label: "First name", hints: /first\s*name|given/i },
  {
    id: "Last_Name",
    label: "Last name",
    hints: /last\s*name|surname|family/i,
  },
  { id: "Phone", label: "Phone", types: ["phone"] },
  { id: "Mobile", label: "Mobile", hints: /mobile|cell/i },
  {
    id: "Company",
    label: "Company",
    hints: /company|organi[sz]ation|business/i,
  },
  { id: "Designation", label: "Title", hints: /job|role|position/i },
  { id: "Website", label: "Website", hints: /website|\burl\b|site/i },
  { id: "City", label: "City", hints: /\bcity\b|town/i },
  { id: "State", label: "State", hints: /\bstate\b|province/i },
  { id: "Country", label: "Country", hints: /country/i },
  { id: "Zip_Code", label: "Zip code", hints: /zip|postal|post\s*code/i },
  {
    id: "Description",
    label: "Description",
    hints: /message|comment|question|note/i,
  },
];

/**
 * The fields QRdx writes, with the longest value each takes (Zoho's table of
 * standard Leads fields). Anything else in a saved mapping is dropped, so no
 * owner, status or other system field can be written.
 */
export const ZOHO_LEAD_FIELD_LENGTHS: Record<string, number> = {
  Email: 100,
  First_Name: 40,
  Last_Name: 80,
  Phone: 30,
  Mobile: 30,
  Company: 100,
  Designation: 100,
  Website: 120,
  City: 30,
  State: 30,
  Country: 30,
  Zip_Code: 30,
  Description: 32_000,
};

const NAMES = { first: "First_Name", last: "Last_Name" };

/** Cut to `max` characters, never inside a character. */
const cut = (value: string, max: number) =>
  value.length <= max ? value : Array.from(value).slice(0, max).join("");

/**
 * The batch's leads: one per email, the latest response's answers winning,
 * mapped and answered fields only. Responses from pages left out, without a
 * valid email, or with an email longer than Zoho's Email field (100
 * characters) are skipped, and so are earlier responses from the same email.
 * `sources[i]` is the index in `responses` of the response lead i came from
 * (rising, since each lead sits where its latest response does).
 */
export function zohoLeads(
  responses: SinkFormResponse[],
  settings: ResponseSinkSettings
): { leads: ZohoLeadFields[]; sources: number[]; skipped: number } {
  const entries: Array<{ fields: ZohoLeadFields; source: number }> = [];
  let skipped = 0;
  for (const [index, response] of responses.entries()) {
    if (!isPageIncluded(settings, response.pageId)) {
      skipped++;
      continue;
    }
    const mapping = mappingFor(response, settings, ZOHO_CRM_TARGETS);
    const mapped = mappedValues(response, mapping, NAMES);
    if (!mapped || mapped.email.length > ZOHO_LEAD_FIELD_LENGTHS.Email) {
      skipped++;
      continue;
    }
    const fields: ZohoLeadFields = { Email: mapped.email };
    for (const [field, value] of Object.entries(mapped.values)) {
      const max = ZOHO_LEAD_FIELD_LENGTHS[field];
      if (max && field !== "Email") fields[field] = cut(value, max);
    }
    entries.push({ fields, source: index });
  }
  const unique = dedupeLatest(entries, (entry) => entry.fields.Email);
  return {
    leads: unique.map((entry) => entry.fields),
    sources: unique.map((entry) => entry.source),
    skipped: skipped + entries.length - unique.length,
  };
}

/**
 * A lead that Zoho could only insert, and that no mapped question gave a
 * last name, which Zoho requires: the first name moves to the last name (one
 * name), or else the part of the email before the @ is used.
 */
export function withFallbackLastName(lead: ZohoLeadFields): ZohoLeadFields {
  const { First_Name: first, ...rest } = lead;
  const last = first || lead.Email.split("@")[0] || lead.Email;
  return {
    ...rest,
    Email: lead.Email,
    Last_Name: cut(last, ZOHO_LEAD_FIELD_LENGTHS.Last_Name),
  };
}

/** Refused for something about one response's values: skipped, not retried. */
const SKIPPED_CODES = new Set(["INVALID_DATA", "DUPLICATE_DATA"]);

type RecordError = Extract<ZohoUpsertResult, { status: "error" }>;

/** A refused lead that needs the person (or Zoho) before anything else goes. */
function refused(result: RecordError): IntegrationApiError {
  const detail =
    result.code === "MANDATORY_NOT_FOUND" && result.field
      ? `Zoho CRM: a new lead needs a value for ${result.field}; map a question to it or make it optional in Zoho CRM, then retry (MANDATORY_NOT_FOUND)`
      : `Zoho CRM refused a lead${result.field ? ` (${result.field})` : ""}; check the lead fields in Zoho CRM, then retry (${result.code})`;
  const transient = result.code === "INTERNAL_ERROR";
  return new IntegrationApiError({
    provider: "zoho-crm",
    status: transient ? 500 : 400,
    code: transient ? "server" : "bad_request",
    message: detail,
    detail: transient ? undefined : detail,
  });
}

/** True when the lead was refused only for the last name it lacks. */
const lacksLastName = (result: RecordError, lead: ZohoLeadFields) =>
  result.code === "MANDATORY_NOT_FOUND" &&
  (result.field === "Last_Name" || result.field === null) &&
  !lead.Last_Name;

/**
 * Upserts the responses' leads by email, 100 per call.
 *
 * Last names: a lead is sent with the last name the form gave, or none, so
 * an existing lead's name is never overwritten with a stand-in. Zoho can
 * only insert a lead with a last name, so the leads it refuses for lacking
 * one (MANDATORY_NOT_FOUND on Last_Name) are new: they're sent again with
 * the stand-in from `withFallbackLastName`.
 *
 * Refused leads: INVALID_DATA and DUPLICATE_DATA are about one response's
 * values, so that response is skipped. Anything else (a mandatory field QRdx
 * doesn't fill, a permission) stops the stream with Zoho's code and field,
 * until the person fixes it and retries.
 *
 * A call that fails after earlier calls went through throws a
 * SinkPartialDeliveryError with what Zoho accepted and a cursor at the last
 * response of those calls, so a retry sends only the rest. (A retry of the
 * failed call itself is safe: leads are matched by email.)
 */
export async function upsertResponsesToZohoCrm(
  client: ZohoCrmClient,
  settings: ResponseSinkSettings,
  responses: SinkFormResponse[]
): Promise<SinkDeliveryResult> {
  const { leads, sources, skipped: leftOut } = zohoLeads(responses, settings);
  let delivered = 0;
  let skipped = leftOut;
  for (let start = 0; start < leads.length; start += ZOHO_CRM_BATCH_SIZE) {
    let outcome: { delivered: number; skipped: number };
    try {
      outcome = await upsertChunk(
        client,
        leads.slice(start, start + ZOHO_CRM_BATCH_SIZE)
      );
    } catch (error) {
      if (start === 0) throw error;
      // Every response up to the last earlier lead's is settled: delivered,
      // refused for its values, left out or superseded by a later answer.
      const through = (sources[start - 1] as number) + 1;
      const last = responses[through - 1] as SinkFormResponse;
      throw new SinkPartialDeliveryError(
        {
          delivered,
          skipped: through - delivered,
          cursor: { at: last.createdAt, id: last.id },
        },
        error
      );
    }
    delivered += outcome.delivered;
    skipped += outcome.skipped;
  }
  return {
    delivered,
    skipped,
    cursor: cursorAfter(responses, (response) => ({
      at: response.createdAt,
      id: response.id,
    })),
  };
}

/** One upsert call of up to 100 leads, and the stand-in retry it may need. */
async function upsertChunk(
  client: ZohoCrmClient,
  chunk: ZohoLeadFields[]
): Promise<{ delivered: number; skipped: number }> {
  let delivered = 0;
  let skipped = 0;
  const results = await client.upsertLeads(chunk);
  const unnamed: ZohoLeadFields[] = [];
  for (const [index, result] of results.entries()) {
    const lead = chunk[index] as ZohoLeadFields;
    if (result.status === "success") delivered++;
    else if (lacksLastName(result, lead)) unnamed.push(lead);
    else if (SKIPPED_CODES.has(result.code)) skipped++;
    else throw refused(result);
  }
  if (unnamed.length > 0) {
    const retried = await client.upsertLeads(unnamed.map(withFallbackLastName));
    for (const result of retried) {
      if (result.status === "success") delivered++;
      else if (SKIPPED_CODES.has(result.code)) skipped++;
      else throw refused(result);
    }
  }
  return { delivered, skipped };
}
