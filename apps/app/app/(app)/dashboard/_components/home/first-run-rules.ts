// Which of Home's first-run cards show (first-run.ts reads the facts):
//
// - First steps: make a dynamic code, scan it with your phone, download it
//   for print. For new accounts (and any account with no code yet), until
//   all three are done or it's hidden.
// - Invite: the person's invite link with a message to send, once one of
//   the workspace's codes has been scanned (people invite when something
//   worked), until it's hidden. Before that, or once it's hidden, the
//   "Your code is live" card carries a one-line invite under its upgrade
//   line instead.
// - Where did you first hear about QRdx? (lib/where-heard.ts): new accounts
//   that haven't answered or hidden it.
//
// Pure, so the tests cover every case.

/** Days after signing up in which an account that has codes sees first steps. */
export const FIRST_STEPS_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface FirstSteps {
  /** The workspace has a dynamic code */
  made: boolean;
  /** One of its codes has been scanned */
  scanned: boolean;
  /** The person downloaded a dynamic code from the dashboard */
  downloaded: boolean;
}

export interface HomeFirstRun {
  firstSteps: FirstSteps | null;
  /** The invite card, with the person's invite link */
  invite: { link: string } | null;
  /** The invite line on the "Your code is live" card */
  inviteLine: boolean;
  /** Ask "Where did you first hear about QRdx?" */
  askWhereHeard: boolean;
}

export interface FirstRunFacts {
  createdAt: Date;
  now: Date;
  /** Dynamic codes in the workspace */
  codes: number;
  /** Scans of the workspace's codes, all time */
  scans: number;
  downloaded: boolean;
  /** The cards the person hid (user.settings.spotlightsSeen) */
  hidden: { firstSteps: boolean; invite: boolean; whereHeard: boolean };
  /** Invite rewards run on this deployment */
  invites: boolean;
  /** lib/where-heard.ts asksWhereHeard, false while it can't be stored */
  asksWhereHeard: boolean;
}

/**
 * The cards for these facts. `inviteWanted`: the invite card would show,
 * once the person's link is in hand (its `invite` is filled in then). Null
 * facts (the person couldn't be read): no cards.
 */
export function firstRunCards(
  facts: FirstRunFacts | null,
): HomeFirstRun & { inviteWanted: boolean } {
  if (!facts) {
    return {
      firstSteps: null,
      invite: null,
      inviteLine: false,
      askWhereHeard: false,
      inviteWanted: false,
    };
  }
  const steps: FirstSteps = {
    made: facts.codes > 0,
    scanned: facts.scans > 0,
    downloaded: facts.downloaded,
  };
  const age = facts.now.getTime() - facts.createdAt.getTime();
  const newAccount = age <= FIRST_STEPS_DAYS * DAY_MS;
  const allDone = steps.made && steps.scanned && steps.downloaded;
  const showSteps =
    !facts.hidden.firstSteps && !allDone && (newAccount || !steps.made);
  const inviteWanted = facts.invites && steps.scanned && !facts.hidden.invite;
  return {
    firstSteps: showSteps ? steps : null,
    invite: null,
    inviteLine: facts.invites && !inviteWanted,
    askWhereHeard: facts.asksWhereHeard && !facts.hidden.whereHeard,
    inviteWanted,
  };
}
