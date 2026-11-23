import { isFeatureAvailable } from "@/lib/feature-availability";
import { inviterOfCode } from "@/lib/invites/codes";
import { noteMissingInviteTables } from "@/lib/invites/missing-table";
import { inviteLandingHref, parseInviteCode } from "@/lib/invites/rules";
import { logError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

/** Someone's code, or null (unknown, malformed, or the tables not there yet). */
async function knownCode(raw: string): Promise<string | null> {
  const code = parseInviteCode(raw);
  if (!(code && isFeatureAvailable("inviteRewards"))) return null;
  try {
    return (await inviterOfCode(code)) ? code : null;
  } catch (error) {
    if (!noteMissingInviteTables(error)) {
      logError(error as Error, { action: "invites.link" });
    }
    return null;
  }
}

/**
 * A person's invite link: /i/<code> → /playground?invite=<code>, the editor,
 * where the code rides along to a sign-up in the same visit
 * (@repo/analytics/landing, lib/invites/invite-client.ts) and a note says
 * what signing up through it gives (components/invites/invite-note.tsx). It
 * sets no cookie and stores nothing about the visitor. An unknown code, and
 * a server where invites are off, go to the editor without one.
 */
export async function GET(_request: Request, { params }: Context) {
  const { code: raw } = await params;
  return new Response(null, {
    status: 307,
    headers: {
      Location: inviteLandingHref(await knownCode(raw)),
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
