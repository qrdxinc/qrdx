import "server-only";

import { database as db, lifecycleEmail } from "@repo/database";
import cuid from "cuid";
import { and, eq } from "drizzle-orm";
import { isMissingSchemaError } from "@/lib/community/tables";

// Lifecycle emails that go once (the lifecycle_email table): the 48-hour
// note to accounts with no dynamic code (./activation-nudge.tsx), Free's
// 100-scan email (./free-scan-milestone.tsx) and the note after a first
// payment (./new-customer.tsx). A row is claimed before sending, so two
// runs at once send one email, and released when the send fails, so a
// later run tries again. Until the table exists nothing is claimed and
// nothing is sent (logged once).

export type LifecycleKind =
  | "activation-nudge"
  | "free-scan-milestone"
  | "new-customer";

export interface LifecycleClaim {
  kind: LifecycleKind;
  /** What it's about: the person, or the subscription for new-customer */
  subject: string;
  /** Whose it is (the row goes when their account does) */
  userId: string;
}

let missingLogged = false;

/**
 * Claims the email: true when this call may send it, false when it was
 * already claimed, null while the table doesn't exist yet.
 */
export async function claimLifecycleEmail(
  claim: LifecycleClaim,
): Promise<boolean | null> {
  try {
    const rows = await db
      .insert(lifecycleEmail)
      .values({ id: cuid(), ...claim })
      .onConflictDoNothing()
      .returning({ id: lifecycleEmail.id });
    return rows.length > 0;
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    if (!missingLogged) {
      missingLogged = true;
      console.warn(
        JSON.stringify({
          event: "email.lifecycle_unavailable",
          hint: "The lifecycle_email table doesn't exist yet: apply the SQL from the pull request that added it",
        }),
      );
    }
    return null;
  }
}

/** Undoes a claim whose email didn't go out, so a later run tries again. */
export async function releaseLifecycleEmail(
  claim: Pick<LifecycleClaim, "kind" | "subject">,
): Promise<void> {
  try {
    await db
      .delete(lifecycleEmail)
      .where(
        and(
          eq(lifecycleEmail.kind, claim.kind),
          eq(lifecycleEmail.subject, claim.subject),
        ),
      );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "email.lifecycle_release_failed",
        kind: claim.kind,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
