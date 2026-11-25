import {
  EMAIL_TARGET,
  isPageIncluded,
  mappedValues,
  mappingFor,
  type ResponseSinkSettings,
  type SinkTarget,
} from "../../sinks/mapping";
import { cursorAfter } from "../../sinks/state";
import type { SinkDeliveryResult, SinkFormResponse } from "../../sinks/types";
import {
  PIPEDRIVE_MAX_SEARCH_TERM,
  type PipedriveClient,
  type PipedrivePhone,
} from "./client";

/**
 * Pause between two people's searches. Pipedrive allows its search endpoints
 * 10 requests per 2 seconds per token.
 */
export const PIPEDRIVE_SEARCH_SPACING_MS = 250;

/** metadata.settings of a Pipedrive stream. */
export interface PipedriveSettings extends ResponseSinkSettings {
  /** Also add a lead, linked to the person, for every response */
  createLead?: boolean;
}

/**
 * Person fields offered in the mapping UI. Pipedrive's `name` is one field,
 * so first and last name are joined; custom fields aren't offered.
 */
export const PIPEDRIVE_TARGETS: SinkTarget[] = [
  { id: EMAIL_TARGET, label: "Email", types: ["email"] },
  {
    id: "name",
    label: "Name",
    hints: /^(full\s*)?name$|^your name|^name\b/i,
  },
  { id: "firstname", label: "First name", hints: /first\s*name|given/i },
  { id: "lastname", label: "Last name", hints: /last\s*name|surname|family/i },
  { id: "phone", label: "Phone number", types: ["phone"] },
];

// Only used if a saved mapping names the full-name target of other sinks.
const NAMES = { first: "firstname", last: "lastname" };
const NO_LEAD_TITLE = "Form response";

export interface PipedriveEntry {
  response: SinkFormResponse;
  name: string | undefined;
  phone: string | undefined;
}

/** One person: every response in the batch from the same email. */
export interface PipedrivePerson {
  email: string;
  entries: PipedriveEntry[];
}

/** The name Pipedrive gets: the Name answer, else first and last joined. */
function nameOf(values: Record<string, string>): string | undefined {
  const full = values.name?.trim();
  if (full) return full;
  const joined = [values.firstname, values.lastname]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return joined || undefined;
}

/** Digits only: "+49 (30) 123" and "4930123" are the same number. */
const digitsOf = (phone: string) => phone.replace(/\D/g, "");

/**
 * The batch grouped by email, in the order each email first appears. Within
 * a person, responses stay in order, so a later answer wins for a field, as
 * if the responses had been sent one by one.
 */
export function pipedrivePeople(
  responses: SinkFormResponse[],
  settings: PipedriveSettings
): { people: PipedrivePerson[]; skipped: number } {
  const byEmail = new Map<string, PipedrivePerson>();
  let skipped = 0;
  for (const response of responses) {
    if (!isPageIncluded(settings, response.pageId)) {
      skipped++;
      continue;
    }
    const mapping = mappingFor(response, settings, PIPEDRIVE_TARGETS);
    const mapped = mappedValues(response, mapping, NAMES);
    // Pipedrive can't search an email this long, so the person couldn't be
    // found again: skipped, rather than a refused request that stops the stream.
    if (!mapped || mapped.email.length > PIPEDRIVE_MAX_SEARCH_TERM) {
      skipped++;
      continue;
    }
    const person = byEmail.get(mapped.email) ?? {
      email: mapped.email,
      entries: [],
    };
    person.entries.push({
      response,
      name: nameOf(mapped.values),
      phone: digitsOf(mapped.values.phone ?? "")
        ? mapped.values.phone
        : undefined,
    });
    byEmail.set(mapped.email, person);
  }
  return { people: [...byEmail.values()], skipped };
}

/** Title of a response's lead: "<page title>: <name or email>". */
export function pipedriveLeadTitle(
  entry: PipedriveEntry,
  email: string
): string {
  const page = entry.response.pageTitle?.trim();
  return page ? `${page}: ${entry.name ?? email}` : NO_LEAD_TITLE;
}

/** The numbers to add: each distinct one the person doesn't have yet. */
function newPhones(
  entries: PipedriveEntry[],
  existing: PipedrivePhone[]
): string[] {
  const known = new Set(existing.map((phone) => digitsOf(phone.value)));
  const added: string[] = [];
  for (const { phone } of entries) {
    if (!phone) continue;
    const digits = digitsOf(phone);
    if (known.has(digits)) continue;
    known.add(digits);
    added.push(phone);
  }
  return added;
}

/**
 * The person's id. `known` holds the people this worker run has already found
 * or created: Pipedrive's search can lag behind a create, so an email seen in
 * an earlier batch of the run is never searched (and created) again.
 */
async function upsertPerson(
  client: PipedriveClient,
  person: PipedrivePerson,
  known: Map<string, number>
): Promise<number> {
  // The latest answer wins: the last response that gave a name
  const name = [...person.entries].reverse().find((entry) => entry.name)?.name;
  const id =
    known.get(person.email) ?? (await client.findPersonByEmail(person.email));
  if (id === null) {
    const createdId = await client.createPerson({
      name: name ?? person.email,
      email: person.email,
      phones: newPhones(person.entries, []),
    });
    known.set(person.email, createdId);
    return createdId;
  }
  known.set(person.email, id);
  // The person was found by this email, so their emails stay as they are. A
  // number is added to the list they have, which keeps their primary: the
  // list is read first, so nothing a person has is ever left out.
  let phones: PipedrivePhone[] | undefined;
  if (person.entries.some((entry) => entry.phone)) {
    const existing = await client.getPersonPhones(id);
    const added = newPhones(person.entries, existing);
    if (added.length > 0) {
      const hasPrimary = existing.some((phone) => phone.primary);
      phones = [
        ...existing,
        ...added.map((value, index) => ({
          value,
          primary: !hasPrimary && index === 0,
        })),
      ];
    }
  }
  if (name || phones) {
    await client.updatePerson(id, {
      ...(name ? { name } : {}),
      ...(phones ? { phones } : {}),
    });
  }
  return id;
}

export interface PipedriveSyncOptions {
  /**
   * Email → person id, shared by every batch of one worker run and filled as
   * people are found or created.
   */
  knownPeople?: Map<string, number>;
  /**
   * The responses that already got their lead in an earlier attempt at this
   * batch (QRdx's own record: see `onLeadCreated`). They get no second one.
   */
  leadsMade?: ReadonlySet<string>;
  /**
   * Called right after Pipedrive created a response's lead, for the caller to
   * record it before anything else can fail.
   */
  onLeadCreated?: (responseId: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Creates or updates a person for each email in the responses and, with
 * `createLead`, one lead per response.
 *
 * Safe to send again, however the last attempt ended ("Retry now", a backoff
 * retry, a worker stopped mid-batch): a person is found by email, and a lead
 * is only added for a response that isn't in `leadsMade`. Pipedrive can't
 * answer that itself: it replaces the `origin_id` an OAuth app sends with the
 * app's own client id, so a lead can't be traced back to its response there.
 */
export async function syncResponsesToPipedrive(
  client: PipedriveClient,
  settings: PipedriveSettings,
  responses: SinkFormResponse[],
  {
    knownPeople = new Map<string, number>(),
    leadsMade = new Set<string>(),
    onLeadCreated = async () => undefined,
    sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms)),
  }: PipedriveSyncOptions = {}
): Promise<SinkDeliveryResult> {
  const { people, skipped } = pipedrivePeople(responses, settings);
  let delivered = 0;
  for (const [index, person] of people.entries()) {
    if (index > 0) await sleep(PIPEDRIVE_SEARCH_SPACING_MS);
    const personId = await upsertPerson(client, person, knownPeople);
    if (settings.createLead) {
      for (const entry of person.entries) {
        if (leadsMade.has(entry.response.id)) continue;
        await client.createLead({
          title: pipedriveLeadTitle(entry, person.email),
          personId,
        });
        await onLeadCreated(entry.response.id);
      }
    }
    delivered += person.entries.length;
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
