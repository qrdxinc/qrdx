import "server-only";

import {
  database as db,
  lifecycleEmail,
  member,
  qrCode,
  user,
} from "@repo/database";
import { baseUrl } from "@repo/email/origin";
import { isReservedEmailAddress } from "@repo/email/reserved-address";
import {
  ActivationNudgeEmail,
  activationNudgeSubject,
} from "@repo/email/templates/activation-nudge";
import { DEFAULT_LOCALE, isLocale } from "@repo/i18n/config";
import { localizePath } from "@repo/i18n/paths";
import { and, asc, eq, gt, inArray, lte, notExists, or } from "drizzle-orm";
import { env } from "@/env";
import { isMissingSchemaError } from "@/lib/community/tables";
import { teamNotesUnsubscribeUrl } from "@/lib/events/unsubscribe";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { emailIntl } from "@/lib/i18n/email";
import { greetingName } from "./greeting";
import { claimLifecycleEmail, releaseLifecycleEmail } from "./lifecycle";
import { personalSender } from "./personal-sender";
import { sendEmail } from "./send";
import { isPortalClient } from "./welcome";

// One note to accounts that signed up NUDGE_AFTER_HOURS to NUDGE_UNTIL_HOURS
// ago and have no dynamic code (owner decision, 25 Nov 2026): what a
// dynamic code is for, one button to make one, and "reply if something got
// in the way". The webhooks cron sends them on each full run
// (app/api/cron/webhooks), so the note goes out soon after the 48 hours;
// the window is a day wide, so a late run still finds them, and an account
// older than that never gets it (no backfill). An account counts as having
// a code when it made one or belongs to a workspace that has one, archived
// or not; the check runs right before each send, so it stops once a code
// exists.
//
// Like the welcome email, it's a note from the QRdx team (./team-notes.ts):
// only where those exist (the teamNotes feature), from EMAIL_FROM_PERSONAL
// with replies to it, never to someone who turned them off, a banned
// account, a reserved test address or an agency's portal client. Once per
// account: the lifecycle_email row (./lifecycle.ts) and the idempotency key
// activation-nudge:<userId>.

/** Hours after sign-up the note is due. */
export const NUDGE_AFTER_HOURS = 48;
/** Past this, an account is too old for it (it never gets the note). */
export const NUDGE_UNTIL_HOURS = 72;

/** Accounts read per run: more stay for the next run. */
const BATCH = 100;

const HOUR_MS = 60 * 60 * 1000;

export interface NudgeSummary {
  /** Why nothing was sent, when the run didn't look at accounts at all */
  off?: "off" | "no_personal_sender" | "unavailable";
  sent: number;
  /** Accounts that can't get it (banned, a test address, a portal client) or already had it */
  skipped: number;
  failed: number;
  /** Due accounts left for the next run (out of time) */
  left: number;
}

const empty = (off?: NudgeSummary["off"]): NudgeSummary => ({
  ...(off && { off }),
  sent: 0,
  skipped: 0,
  failed: 0,
  left: 0,
});

/** Accounts due a nudge at `now`: in the window, no code, not nudged. */
function dueAccounts(now: Date) {
  const codes = db
    .select({ id: qrCode.id })
    .from(qrCode)
    .where(
      or(
        eq(qrCode.userId, user.id),
        inArray(
          qrCode.organizationId,
          db
            .select({ id: member.organizationId })
            .from(member)
            .where(eq(member.userId, user.id)),
        ),
      ),
    );
  const nudged = db
    .select({ id: lifecycleEmail.id })
    .from(lifecycleEmail)
    .where(
      and(
        eq(lifecycleEmail.kind, "activation-nudge"),
        eq(lifecycleEmail.subject, user.id),
      ),
    );
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      banned: user.banned,
      banExpires: user.banExpires,
      locale: user.locale,
    })
    .from(user)
    .where(
      and(
        gt(
          user.createdAt,
          new Date(now.getTime() - NUDGE_UNTIL_HOURS * HOUR_MS),
        ),
        lte(
          user.createdAt,
          new Date(now.getTime() - NUDGE_AFTER_HOURS * HOUR_MS),
        ),
        eq(user.teamNotes, true),
        notExists(codes),
        notExists(nudged),
      ),
    )
    .orderBy(asc(user.createdAt))
    .limit(BATCH);
}

let warnedNoSender = false;

/**
 * Sends the notes that are due, oldest account first, until `deadline`.
 * Never throws: what happened is the answer.
 */
export async function sendActivationNudges({
  now = new Date(),
  deadline = Number.POSITIVE_INFINITY,
}: {
  now?: Date;
  /** Stop starting sends after this (ms since the epoch) */
  deadline?: number;
} = {}): Promise<NudgeSummary> {
  if (!(isFeatureAvailable("teamNotes") && env.EMAIL_FROM)) return empty("off");
  const sender = personalSender();
  if (!sender) {
    if (!warnedNoSender) {
      warnedNoSender = true;
      console.warn(
        JSON.stringify({
          event: "email.activation_nudge",
          outcome: "no_personal_sender",
        }),
      );
    }
    return empty("no_personal_sender");
  }

  let accounts: Awaited<ReturnType<typeof dueAccounts>>;
  try {
    accounts = await dueAccounts(now);
  } catch (error) {
    // The lifecycle_email table isn't there yet (./lifecycle.ts logs it).
    if (isMissingSchemaError(error)) return empty("unavailable");
    console.error(
      JSON.stringify({
        event: "email.activation_nudge_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return { ...empty(), failed: 1 };
  }

  const summary = empty();
  const absolute = (path: string) => new URL(path, baseUrl).toString();
  for (const account of accounts) {
    if (Date.now() > deadline) {
      summary.left += 1;
      continue;
    }
    const claim = {
      kind: "activation-nudge",
      subject: account.id,
      userId: account.id,
    } as const;
    let claimed: boolean | null = false;
    try {
      // Claimed first, also for accounts that can't get it: each account is
      // decided once, so those don't come back in every run.
      claimed = await claimLifecycleEmail(claim);
      if (claimed === null) return { ...summary, off: "unavailable" };
      if (!claimed) {
        summary.skipped += 1;
        continue;
      }
      // A ban in force (lib/oauth.ts isBanActive): one that ended doesn't count.
      const banned =
        account.banned &&
        (!account.banExpires || account.banExpires > new Date());
      if (
        banned ||
        isReservedEmailAddress(account.email) ||
        (await isPortalClient(account.email))
      ) {
        summary.skipped += 1;
        continue;
      }
      const intl = await emailIntl(
        isLocale(account.locale) ? account.locale : DEFAULT_LOCALE,
      );
      const unsubscribeUrl = teamNotesUnsubscribeUrl(account.id);
      const result = await sendEmail({
        to: account.email,
        from: sender.from,
        replyTo: sender.address,
        subject: activationNudgeSubject(intl),
        react: (
          <ActivationNudgeEmail
            firstName={greetingName(account.name, account.email).name}
            intl={intl}
            newCodeUrl={absolute(localizePath("/playground", intl.locale))}
            recipient={account.email}
            senderName={sender.name}
            unsubscribeUrl={unsubscribeUrl}
          />
        ),
        unsubscribeUrl,
        idempotencyKey: `activation-nudge:${account.id}`,
        tags: [{ name: "kind", value: "activation-nudge" }],
      });
      if (result.sent) {
        summary.sent += 1;
        continue;
      }
      // The next run tries again while the account is in the window.
      await releaseLifecycleEmail(claim);
      summary.failed += 1;
    } catch (error) {
      if (claimed) await releaseLifecycleEmail(claim);
      summary.failed += 1;
      console.error(
        JSON.stringify({
          event: "email.activation_nudge_failed",
          userId: account.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
  // A full batch: more may be due, for the next run.
  if (accounts.length === BATCH) summary.left = Math.max(summary.left, 1);
  return summary;
}
