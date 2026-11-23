import { isMissingTableError } from "@/lib/affiliates/missing-table";

// The invite tables (invite_code, invite) are made by hand before the code
// that needs them ships. Until they exist, every read and write here fails
// with Postgres's "undefined table": the bonus counts as none, sign-ups and
// codes go on as usual, and the Invite friends page says it isn't ready.

export { isMissingTableError } from "@/lib/affiliates/missing-table";

let warned = false;

/**
 * Logs the missing tables once per process (a warning: it's expected until
 * they exist). Returns true when `error` was that.
 */
export function noteMissingInviteTables(error: unknown): boolean {
  if (!isMissingTableError(error)) return false;
  if (!warned) {
    warned = true;
    console.warn(
      "Invite rewards: the invite tables don't exist yet (update the database schema: bun run db:push). Invites aren't recorded and bonus codes count as none until they do.",
    );
  }
  return true;
}

/** Thrown by the page loader so the page can say invites aren't ready. */
export class InvitesNotReadyError extends Error {
  constructor() {
    super("Invite rewards aren't available yet.");
    this.name = "InvitesNotReadyError";
  }
}
