import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import { baseUrl } from "@/lib/metadata";
import { isNotificationEvent, type NotificationEvent } from "./types";

// Signed, non-expiring unsubscribe links for alert and digest emails. A token
// names one notification_setting row and one event ("all" = every email),
// or, for notes from the QRdx team, one user (below).

export type UnsubscribeScope = NotificationEvent | "all";

export const UNSUBSCRIBE_PATH = "/api/email/unsubscribe";

let cachedKey: Buffer | null = null;

function signingKey(): Buffer {
  cachedKey ??= createHash("sha256")
    .update(`qrdx:unsubscribe:${env.BETTER_AUTH_SECRET}`)
    .digest();
  return cachedKey;
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey())
    .update(payload)
    .digest()
    .subarray(0, 18)
    .toString("base64url");
}

export function createUnsubscribeToken(
  settingId: string,
  event: UnsubscribeScope,
): string {
  const payload = Buffer.from(`${settingId}:${event}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The payload a well-formed, correctly signed token carries, or null. */
function verifiedPayload(token: string): string | null {
  if (token.length > 300) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }
  return Buffer.from(payload, "base64url").toString("utf8");
}

export function verifyUnsubscribeToken(
  token: string,
): { settingId: string; event: UnsubscribeScope } | null {
  const decoded = verifiedPayload(token);
  if (decoded === null) return null;
  const separator = decoded.lastIndexOf(":");
  const settingId = decoded.slice(0, separator);
  const event = decoded.slice(separator + 1);
  if (!settingId || !(event === "all" || isNotificationEvent(event))) {
    return null;
  }
  return { settingId, event };
}

export function unsubscribeUrl(
  settingId: string,
  event: UnsubscribeScope,
): string {
  const url = new URL(UNSUBSCRIBE_PATH, baseUrl.origin);
  url.searchParams.set("token", createUnsubscribeToken(settingId, event));
  return url.toString();
}

// Notes from the QRdx team (lib/email/team-notes.ts) are one setting per
// person, so their token names the user: "<userId>:team-notes". Neither kind
// passes for the other: "team-notes" isn't an event, and a setting's token
// never ends with it.
const TEAM_NOTES = "team-notes";

export function createTeamNotesToken(userId: string): string {
  const payload = Buffer.from(`${userId}:${TEAM_NOTES}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The user a "stop notes from the team" token names, or null. */
export function verifyTeamNotesToken(token: string): string | null {
  const decoded = verifiedPayload(token);
  const suffix = `:${TEAM_NOTES}`;
  if (!decoded?.endsWith(suffix)) return null;
  return decoded.slice(0, -suffix.length) || null;
}

/** The one-click link that turns notes from the team off for this person. */
export function teamNotesUnsubscribeUrl(userId: string): string {
  const url = new URL(UNSUBSCRIBE_PATH, baseUrl.origin);
  url.searchParams.set("token", createTeamNotesToken(userId));
  return url.toString();
}
