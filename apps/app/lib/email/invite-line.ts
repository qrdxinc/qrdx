import "server-only";

import { baseUrl } from "@repo/email/origin";
import type { EmailInvite } from "@repo/email/templates/parts";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { canStillEarnFromInvites } from "@/lib/invites/bonus";
import { INVITE_BONUS_CODES } from "@/lib/invites/terms";

// The invite line in the welcome, first-scan and scan-milestone emails
// (packages/email/templates/parts.tsx InviteLine): one line under the
// upgrade line, never in its place, offered where people have just had a
// success rather than only at the limit. Only where invites work (the
// inviteRewards feature). "You both get" only while the reader's own link
// can still earn codes on a capped plan; otherwise the friend's side alone,
// which is always true.

const inviteUrl = () => new URL("/settings/invite", baseUrl).toString();

/** The line for a reader on Free. Never throws. */
export async function freeInvite(
  userId: string,
): Promise<EmailInvite | undefined> {
  if (!isFeatureAvailable("inviteRewards")) return undefined;
  return {
    url: inviteUrl(),
    count: INVITE_BONUS_CODES,
    both: await canStillEarnFromInvites(userId),
  };
}

/** The line for a reader on a plan with no cap on dynamic codes. */
export function paidInvite(): EmailInvite | undefined {
  if (!isFeatureAvailable("inviteRewards")) return undefined;
  return { url: inviteUrl(), count: INVITE_BONUS_CODES, both: false };
}
