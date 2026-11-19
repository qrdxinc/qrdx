import "server-only";

import { env } from "@/env";

/** EMAIL_FROM_PERSONAL, split: "Ritesh from QRdx <support@qrdx.dev>". */
export interface PersonalSender {
  /** The whole value, for the From header */
  from: string;
  /** "Ritesh from QRdx"; the address when the value has no name */
  name: string;
  /** "support@qrdx.dev": replies go here */
  address: string;
}

/** Splits a From value ("Name <address>" or a bare address). */
export function parseSender(from: string): PersonalSender {
  const match = /^\s*"?([^"<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(from);
  if (match) {
    const address = match[2] as string;
    return { from: from.trim(), name: match[1]?.trim() || address, address };
  }
  const address = from.trim();
  return { from: address, name: address, address };
}

/**
 * Who personal emails come from (personal notes, the welcome email), or
 * null while EMAIL_FROM_PERSONAL is unset: personal notes are off then.
 */
export function personalSender(): PersonalSender | null {
  return env.EMAIL_FROM_PERSONAL ? parseSender(env.EMAIL_FROM_PERSONAL) : null;
}
