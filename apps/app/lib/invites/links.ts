import { appOrigin } from "@repo/config/origins";
import { INVITE_LINK_PREFIX } from "./terms";

/** "https://qrdx.dev/i/k7q2mx9pab" */
export function inviteLink(code: string): string {
  return `${appOrigin()}${INVITE_LINK_PREFIX}${encodeURIComponent(code)}`;
}

/** "qrdx.dev/i/k7q2mx9pab", for copy. */
export function inviteLinkLabel(code: string): string {
  return inviteLink(code).replace(/^https?:\/\//, "");
}
