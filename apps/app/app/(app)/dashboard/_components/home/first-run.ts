import "server-only";

import { database as db, userAcquisition } from "@repo/database";
import { user as userTable } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { storedList } from "@/lib/changelog-feed";
import { isMissingSchemaError } from "@/lib/community/tables";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { ensureInviteCode } from "@/lib/invites/codes";
import { inviteLink } from "@/lib/invites/links";
import { isMissingTableError } from "@/lib/invites/missing-table";
import { logError } from "@/lib/shared";
import type { SpotlightId } from "@/lib/spotlights";
import { asksWhereHeard } from "@/lib/where-heard";
import { firstRunCards, type HomeFirstRun } from "./first-run-rules";

export type { HomeFirstRun } from "./first-run-rules";

/** What the person dismissed or did, as user.settings.spotlightsSeen keeps it. */
async function personOf(
  userId: string,
): Promise<{ createdAt: Date; seen: Set<string> } | null> {
  const [row] = await db
    .select({ createdAt: userTable.createdAt, settings: userTable.settings })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  if (!row) return null;
  return {
    createdAt: row.createdAt,
    seen: new Set(storedList(row.settings?.spotlightsSeen)),
  };
}

/**
 * Whether they answered "Where did you first hear about QRdx?". Null while
 * the columns don't exist yet (or the read failed): then nobody is asked.
 */
async function answeredWhereHeard(userId: string): Promise<boolean | null> {
  try {
    const [row] = await db
      .select({ answer: userAcquisition.selfReported })
      .from(userAcquisition)
      .where(eq(userAcquisition.userId, userId))
      .limit(1);
    return Boolean(row?.answer);
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      logError(error as Error, { action: "home.whereHeard" });
    }
    return null;
  }
}

/** The person's invite link, or null where invites can't be offered. */
async function inviteLinkOf(userId: string): Promise<string | null> {
  try {
    return inviteLink(await ensureInviteCode(userId));
  } catch (error) {
    if (!isMissingTableError(error)) {
      logError(error as Error, { action: "home.inviteLink" });
    }
    return null;
  }
}

const SEEN: Record<"firstSteps" | "invite" | "whereHeard" | "downloaded", SpotlightId> =
  {
    firstSteps: "home-first-steps",
    invite: "home-invite",
    whereHeard: "where-heard",
    downloaded: "first-download",
  };

/**
 * Home's first-run cards for the signed-in person (first-run-rules.ts
 * decides which). Never throws: Home works without them.
 */
export async function getHomeFirstRun({
  userId,
  codes,
  scans,
  now = new Date(),
}: {
  userId: string;
  /** Dynamic codes in the workspace */
  codes: number;
  /** Scans of the workspace's codes, all time */
  scans: number;
  now?: Date;
}): Promise<HomeFirstRun> {
  try {
    const [person, answered] = await Promise.all([
      personOf(userId),
      answeredWhereHeard(userId),
    ]);
    if (!person) return firstRunCards(null);
    const { inviteWanted, ...cards } = firstRunCards({
      createdAt: person.createdAt,
      now,
      codes,
      scans,
      downloaded: person.seen.has(SEEN.downloaded),
      hidden: {
        firstSteps: person.seen.has(SEEN.firstSteps),
        invite: person.seen.has(SEEN.invite),
        whereHeard: person.seen.has(SEEN.whereHeard),
      },
      invites: isFeatureAvailable("inviteRewards"),
      asksWhereHeard:
        answered !== null &&
        asksWhereHeard({ createdAt: person.createdAt, answered, now }),
    });
    if (!inviteWanted) return cards;
    const link = await inviteLinkOf(userId);
    return { ...cards, invite: link ? { link } : null };
  } catch (error) {
    logError(error as Error, { action: "home.firstRun" });
    return firstRunCards(null);
  }
}
