import "server-only";

import { database as db, inviteCode } from "@repo/database";
import { eq } from "drizzle-orm";
import { isUniqueViolation } from "@/lib/slug-claims";
import { parseInviteCode, randomInviteCode } from "./rules";

// A person's invite code: made the first time they open Invite friends (or
// anything else asks for their link), then the same for good. Random, so a
// link never names its owner.

/** The person's code, made now when they don't have one yet. */
export async function ensureInviteCode(
  userId: string,
  { now = new Date(), random }: { now?: Date; random?: () => string } = {},
): Promise<string> {
  const existing = await inviteCodeOf(userId);
  if (existing) return existing;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = random?.() ?? randomInviteCode();
    try {
      const [row] = await db
        .insert(inviteCode)
        .values({ userId, code, createdAt: now })
        // Two first visits at once: the other one's code stands.
        .onConflictDoNothing({ target: inviteCode.userId })
        .returning({ code: inviteCode.code });
      if (row) return row.code;
      const raced = await inviteCodeOf(userId);
      if (raced) return raced;
    } catch (error) {
      // Someone else has this code already (31^10 makes it all but never
      // happen): draw another.
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw new Error("Could not make an invite code");
}

/** The person's code, or null when they haven't got one yet. */
export async function inviteCodeOf(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ code: inviteCode.code })
    .from(inviteCode)
    .where(eq(inviteCode.userId, userId))
    .limit(1);
  return row?.code ?? null;
}

/** Whose code this is, or null for a malformed or unknown one. */
export async function inviterOfCode(value: unknown): Promise<string | null> {
  const code = parseInviteCode(value);
  if (!code) return null;
  const [row] = await db
    .select({ userId: inviteCode.userId })
    .from(inviteCode)
    .where(eq(inviteCode.code, code))
    .limit(1);
  return row?.userId ?? null;
}
