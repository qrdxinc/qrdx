// The invite reward's numbers, in one light module (no React, no
// "server-only"). Everything reads them from here: the limit check
// (lib/code-limit.ts through ./bonus.ts), the reward (./qualify.ts), the
// Invite friends page, the limit gate and email, and the legal and help
// pages through the `{facts.invite…}` tokens (lib/product-facts.ts). Change
// a number here and every page and every calculation follows.
//
// The owner's decision (23 Nov 2026): every signed-in person has an invite
// link. A friend who signs up through it in the same visit (no cookie,
// nothing stored on the device, like the affiliate program) and makes their
// first dynamic code within 30 days of signing up earns both of them 5 more
// dynamic codes in their own workspace. An inviter is rewarded for at most
// 10 friends; the friend's 5 come once. It's extra allowance on any plan,
// not a plan, with no cash value; codes made with it keep working.

/** Dynamic codes each side gets when a friend's invite counts. */
export const INVITE_BONUS_CODES = 5;

/** Friends one person can be rewarded for. */
export const INVITE_MAX_REWARDED_FRIENDS = 10;

/** The most an inviter can earn: 50 codes. */
export const INVITE_MAX_INVITER_CODES =
  INVITE_BONUS_CODES * INVITE_MAX_REWARDED_FRIENDS;

/** Days from the friend's sign-up in which their first dynamic code counts. */
export const INVITE_QUALIFY_DAYS = 30;

/** Invite links are <app url>/i/<code>. */
export const INVITE_LINK_PREFIX = "/i/";

/**
 * Where an invite link lands: the editor, where the friend can make a code
 * straight away. The note about the extra codes shows there
 * (components/invites/invite-note.tsx).
 */
export const INVITE_LANDING_PATH = "/playground";

/** New invite codes are this many random letters and digits. */
export const INVITE_CODE_LENGTH = 10;
