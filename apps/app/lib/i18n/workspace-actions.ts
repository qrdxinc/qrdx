import "server-only";

// What the workspace, team, join link, logo and "Move to workspace…" actions
// say back (workspaceActions in messages/en.json). Their pages are signed-in
// app pages, so the language is the person's (./app-locale.ts: the saved one,
// else the language menu's cookie, else English). The action translates
// before it answers, and the page shows the text as it is.
//
// Helpers that throw (lib/workspace-join.ts, the move rules) throw a
// WorkspaceActionError: its message is the English, for logs and anything
// that shows errors as they are, and the action re-reads it in the person's
// language. English constants other code still uses (forbiddenMessage, the
// slug, logo URL and two-step messages) stay where they are; the catalog has
// copies, and tests/i18n/workspace-actions.test.ts keeps them equal.

import {
  SLUG_FORMAT_MESSAGE,
  SLUG_RESERVED_MESSAGE,
} from "@repo/auth/workspace-rules";
import { TWO_FACTOR_REQUIRED } from "@repo/auth/workspace-two-factor-rules";
import { createTranslator } from "next-intl";
import { HttpError } from "@/lib/http-error";
import { logError } from "@/lib/log-error";
import type { WorkspaceAction, WorkspaceRole } from "@/lib/permissions";
import en from "@/messages/en.json";
import { getAppTranslations } from "./app-locale";
import type { Translator } from "./translator";

export type WorkspaceActionsText = Translator<"workspaceActions">;

/** A message in any language: what a refusal says, given the translator. */
export type WorkspaceActionMessage = (t: WorkspaceActionsText) => string;

const ENGLISH: WorkspaceActionsText = createTranslator({
  locale: "en",
  messages: en,
  namespace: "workspaceActions",
}) as WorkspaceActionsText;

/**
 * workspaceActions in the person's language. English, logged, when that
 * can't be read: the answer still goes out. Read once per answer, and only
 * when the answer says something.
 */
export async function workspaceActionsText(): Promise<WorkspaceActionsText> {
  try {
    return await getAppTranslations("workspaceActions");
  } catch (error) {
    logError(error as Error, { action: "workspaceActions.text" });
    return ENGLISH;
  }
}

/** `message` in the person's language (workspaceActionsText). */
export async function workspaceActionText(
  message: WorkspaceActionMessage,
): Promise<string> {
  return message(await workspaceActionsText());
}

/**
 * An HttpError whose message the action says in the person's language: its
 * `message` is the English, `text` reads it in any language.
 */
export class WorkspaceActionError extends HttpError {
  readonly text: WorkspaceActionMessage;

  constructor(status: number, code: string, text: WorkspaceActionMessage) {
    super(status, code, text(ENGLISH));
    this.name = "WorkspaceActionError";
    this.text = text;
  }
}

/** The actions whose refusal these actions say (forbiddenMessage's sentences). */
export type WorkspaceActionsForbidden = Extract<
  WorkspaceAction,
  "content.write" | "workspace.update" | "members.manage"
>;

const ONLY = {
  "content.write": "forbidden.contentWrite",
  "workspace.update": "forbidden.workspaceUpdate",
  "members.manage": "forbidden.membersManage",
} as const satisfies Record<WorkspaceActionsForbidden, string>;

/** forbiddenMessage (lib/permissions.ts) in t's language. */
export function forbiddenText(
  t: WorkspaceActionsText,
  role: WorkspaceRole | null | undefined,
  action: WorkspaceActionsForbidden,
): string {
  const only = t(ONLY[action]);
  if (role === "viewer") return t("forbidden.viewer", { only });
  if (role === "billing") return t("forbidden.billingRole", { only });
  return only;
}

/** workspaceSlugProblem's answer (@repo/auth/workspace-rules) in t's language. */
export function slugProblemText(
  t: WorkspaceActionsText,
  problem: string,
): string {
  if (problem === SLUG_FORMAT_MESSAGE) return t("organizations.slugFormat");
  if (problem === SLUG_RESERVED_MESSAGE) return t("organizations.slugReserved");
  return problem;
}

/**
 * What an error these actions pass on says, in t's language: a
 * WorkspaceActionError, and the workspace errors lib/workspaces.ts throws
 * (getActiveScope's). Null for any other error.
 */
export function workspaceErrorText(
  t: WorkspaceActionsText,
  error: unknown,
): string | null {
  if (error instanceof WorkspaceActionError) return error.text(t);
  if (!(error instanceof HttpError)) return null;
  if (error.code === TWO_FACTOR_REQUIRED) return t("shared.twoFactorRequired");
  if (error.code === "WORKSPACE_NOT_FOUND") {
    return t("shared.workspaceNotFound");
  }
  return null;
}
