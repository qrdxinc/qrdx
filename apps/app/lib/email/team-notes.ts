import "server-only";

import { database as db, user } from "@repo/database";
import { eq } from "drizzle-orm";

// "Notes from the QRdx team": the personal notes the team sends from the
// console (./personal-notes.tsx). One setting per person, not per workspace
// (user.team_notes, on unless turned off): Settings > Notifications and the
// one-click link in every note change it.

/** Whether the person gets notes from the team (a missing value counts as on). */
export const wantsTeamNotes = (row: {
  teamNotes: boolean | null | undefined;
}) => row.teamNotes !== false;

/** The person's setting; on when the account isn't found. */
export async function teamNotesSetting(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ teamNotes: user.teamNotes })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row ? wantsTeamNotes(row) : true;
}

export async function setTeamNotes(userId: string, on: boolean): Promise<void> {
  await db
    .update(user)
    .set({ teamNotes: on, updatedAt: new Date() })
    .where(eq(user.id, userId));
}
