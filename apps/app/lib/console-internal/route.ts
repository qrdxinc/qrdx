import "server-only";

import { RateLimitUnavailableError, redis } from "@repo/rate-limit";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AdminAuditRecord } from "@/app/(app)/admin/_lib/action-runner";
import { writeAuditLog } from "@/app/(app)/admin/_lib/audit";
import { env } from "@/env";
import { HttpError } from "@/lib/http-error";
import { errorSummary } from "@/lib/log-error";
import {
  type ConsoleActor,
  loadConsoleActor,
  requireStrongConsoleActor,
} from "./actor";
import { type ConsoleLimitTier, enforceConsoleLimit } from "./limits";
import {
  isUsableSecret,
  MAX_BODY_BYTES,
  REQUEST_ID_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifyConsoleSignature,
} from "./signature";

// The steps every /api/internal/console/* endpoint runs, in this order:
// 1. off (404) unless CONSOLE_INTERNAL_SECRET is set (env.ts refuses to
//    start with a shorter one);
// 2. the body, read as a stream and cut off past MAX_BODY_BYTES (413);
// 3. the signature (./signature.ts): well-formed, fresh, matching;
// 4. a request id seen before is refused (Upstash). Without Upstash the
//    endpoints answer 503: a replay store is required, never skipped;
// 5. the body: JSON with `actor` and the endpoint's own fields;
// 6. the actor checked again here (./actor.ts), 403 for anyone else; 403
//    `grant_required` for a call without its console sign-in's grant, and
//    `grant_invalid` for one this app doesn't hold for that admin and
//    session;
// 7. the rate limit per admin and endpoint (./limits.ts): the admin pages'
//    30 a minute, or 5 an hour for sensitive endpoints. Past it, 429
//    `rate_limited` with Retry-After; when Upstash can't judge, 503;
// 8. the endpoint's own fields (400 with the first problem);
// 9. for strong endpoints, the admin's own second factor and a recent
//    strong confirmation by that session (CONFIRMATION_REQUIRED);
// 10. the endpoint's work, then its entry in the admin audit log, written
//    here with the admin checked above and the `reason` in the signed body,
//    as the admin pages' runner writes it. So an effect that finishes after
//    the console stopped waiting is still on record. The answer carries the
//    endpoint's `data` only.
//
// Every request that passes the signature check (3) ends with one log line,
// `console_internal.outcome`: the path, the admin the signed body names,
// whether it carried a grant, the HTTP status and a short code, and for a
// 500 the error's kind and code.
// Never the secret, the signature, headers, the body, an address, or an
// error's message (a database error's lists the query's values). Requests
// refused before it log `console_internal.refused`.

const NO_STORE = { "Cache-Control": "no-store" } as const;
const REPLAY_TTL_SECONDS = 600;

const json = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, { status, headers: NO_STORE });

/** A request refused before its signature matched (no actor to name). */
const refuse = (
  status: number,
  error: string,
  log: { reason: string; path: string },
) => {
  console.warn(
    JSON.stringify({ event: "console_internal.refused", ...log, status }),
  );
  return json(status, { ok: false, error });
};

const actorSchema = z.object({
  userId: z.string().trim().min(1).max(128),
  sessionId: z.string().trim().min(1).max(256),
  // Required from ./route.ts's own check (grant_required), not here, so a
  // call without one gets that answer rather than bad_request.
  grant: z.string().min(32).max(256).optional(),
});

/**
 * What an endpoint's work returns: the audit record the admin action would
 * hand its runner (absent or null when nothing changed, and for reads),
 * which the wrapper writes, and the data it answers with.
 */
export interface ConsoleOutcome<T> {
  audit?: AdminAuditRecord | null;
  data?: T;
}

export interface ConsoleInternalContext {
  actor: ConsoleActor;
  request: NextRequest;
}

export interface ConsoleInternalOptions<S extends z.ZodType, T> {
  /**
   * The audit log's action name, as the admin page's action uses it
   * ("user.ban"). Endpoints that change nothing (reads, cache refreshes)
   * leave it out and must return no audit record.
   */
  action?: string;
  /** The endpoint's own fields (`actor` is checked separately). */
  schema: S;
  /** True, or a rule on the input, for actions that need strong confirmation. */
  strong?: boolean | ((input: z.output<S>) => boolean);
  /**
   * The rate limit tier: "sensitive" (5 an hour) for what the admin pages
   * limit that way, and for exports and two-step reset cancels. Default
   * "standard" (30 a minute).
   */
  limit?: ConsoleLimitTier;
  run: (
    input: z.output<S>,
    context: ConsoleInternalContext,
  ) => Promise<ConsoleOutcome<T> | null | Response>;
}

/** Thrown when there's no replay store: the endpoints refuse to run. */
class ReplayStoreMissing extends Error {}

/** The request id, once; false when it was seen before. */
async function firstUse(requestId: string): Promise<boolean> {
  if (!redis) throw new ReplayStoreMissing("Upstash isn't configured");
  const set = await redis.set(`qrdx:console-internal:${requestId}`, "1", {
    nx: true,
    ex: REPLAY_TTL_SECONDS,
  });
  return set === "OK";
}

/** How a signed request ended: the answer, and what its log line says. */
interface SignedOutcome {
  response: Response;
  /** The admin the signed body names, once it's read. */
  actorId: string | null;
  /** A short, fixed code: never a message that could carry data. */
  code: string;
  /** Extra detail for a 503 (which store couldn't answer). */
  reason?: string;
  /** The unexpected error behind a 500, logged as its kind and code. */
  error?: unknown;
}

/** What the signed body named, once it's read: whether it sent a grant. */
interface Named {
  grant?: boolean;
}

/** One line per signed request (see the steps above for what it holds). */
function logOutcome(path: string, outcome: SignedOutcome, named: Named): void {
  const { status } = outcome.response;
  const line = JSON.stringify({
    event: "console_internal.outcome",
    path,
    actorId: outcome.actorId,
    ...(named.grant === undefined ? {} : { grant: named.grant }),
    status,
    code: outcome.code,
    ...(outcome.reason ? { reason: outcome.reason } : {}),
    ...(outcome.error === undefined
      ? {}
      : { error: errorSummary(outcome.error) }),
  });
  if (status >= 500) console.error(line);
  else if (status >= 400) console.warn(line);
  else console.info(line);
}

/** An error from the endpoint's work (or the checks around it) as an answer. */
function failure(error: unknown, actorId: string | null): SignedOutcome {
  if (error instanceof RateLimitUnavailableError) {
    return {
      response: json(503, { ok: false, error: "unavailable" }),
      actorId,
      code: "unavailable",
      reason: "rate_limit_store",
    };
  }
  if (error instanceof HttpError) {
    return {
      response: json(error.status, { ok: false, error: error.message }),
      actorId,
      // ADMIN_ACTION, CONFIRMATION_REQUIRED…: the message itself may name
      // things (a plan, a status), so only the code is logged.
      code: error.code.toLowerCase(),
    };
  }
  // Better Auth APIError messages are safe to show, as in the admin runner.
  if (error instanceof Error && "statusCode" in error && error.message) {
    const status = Number((error as { statusCode: unknown }).statusCode);
    return {
      response: json(status >= 400 && status < 500 ? status : 400, {
        ok: false,
        error: error.message,
      }),
      actorId,
      code: "auth_api",
    };
  }
  return {
    response: json(500, { ok: false, error: "Action failed" }),
    actorId,
    code: "failed",
    error,
  };
}

/**
 * The body as text, read from the stream and refused past `limit` bytes,
 * whatever Content-Length said (or didn't, for a chunked request). Null
 * when it's too large.
 */
export async function readCappedBody(
  request: Request,
  limit: number = MAX_BODY_BYTES,
): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** A POST handler for one console endpoint. */
export function consoleInternalRoute<S extends z.ZodType, T = undefined>(
  options: ConsoleInternalOptions<S, T>,
) {
  return async (request: NextRequest): Promise<Response> => {
    const path = request.nextUrl.pathname;
    const secret = env.CONSOLE_INTERNAL_SECRET;
    if (!isUsableSecret(secret)) {
      return json(404, { ok: false, error: "Not found" });
    }

    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) {
      return refuse(413, "too_large", { reason: "too_large", path });
    }
    const body = await readCappedBody(request);
    if (body === null) {
      return refuse(413, "too_large", { reason: "too_large", path });
    }

    const signed = verifyConsoleSignature({
      secret,
      timestamp: request.headers.get(TIMESTAMP_HEADER),
      requestId: request.headers.get(REQUEST_ID_HEADER),
      signature: request.headers.get(SIGNATURE_HEADER),
      pathname: path,
      body,
    });
    if (!signed.ok) {
      return refuse(401, "unauthorized", { reason: signed.reason, path });
    }

    // From here on the request is the console's: exactly one log line.
    const named: Named = {};
    let outcome: SignedOutcome;
    try {
      outcome = await handleSigned(options, {
        request,
        path,
        body,
        requestId: signed.requestId,
        named,
      });
    } catch (error) {
      outcome = failure(error, null);
    }
    logOutcome(path, outcome, named);
    return outcome.response;
  };
}

/** Steps 4 to 10 for a request whose signature matched. */
async function handleSigned<S extends z.ZodType, T>(
  {
    action,
    schema,
    strong,
    limit = "standard",
    run,
  }: ConsoleInternalOptions<S, T>,
  {
    request,
    path,
    body,
    requestId,
    named,
  }: {
    request: NextRequest;
    path: string;
    body: string;
    requestId: string;
    /** Filled in for the log line once the body is read. */
    named: Named;
  },
): Promise<SignedOutcome> {
  try {
    if (!(await firstUse(requestId))) {
      return {
        response: json(409, { ok: false, error: "replayed" }),
        actorId: null,
        code: "replayed",
      };
    }
  } catch (error) {
    return {
      response: json(503, { ok: false, error: "unavailable" }),
      actorId: null,
      code: "unavailable",
      reason:
        error instanceof ReplayStoreMissing
          ? "replay_store_missing"
          : "replay_store",
    };
  }

  // No actor yet: the body isn't JSON, or names none.
  const badRequest = (): SignedOutcome => ({
    response: json(400, { ok: false, error: "bad_request" }),
    actorId: null,
    code: "bad_request",
  });
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body);
  } catch {
    return badRequest();
  }
  const claim = z.object({ actor: actorSchema }).safeParse(parsedBody);
  if (!claim.success) return badRequest();
  const { grant } = claim.data.actor;
  named.grant = grant !== undefined;
  // Session ids aren't secret: a call proves its admin with the grant only
  // their console sign-in got (./actor.ts).
  if (grant === undefined) {
    return {
      response: json(403, { ok: false, error: "grant_required" }),
      actorId: claim.data.actor.userId,
      code: "grant_required",
    };
  }
  const actorId = claim.data.actor.userId;

  try {
    const actor = await loadConsoleActor({ ...claim.data.actor, grant });
    if (!actor) {
      return {
        response: json(403, { ok: false, error: "not_admin" }),
        actorId,
        code: "not_admin",
      };
    }

    try {
      await enforceConsoleLimit(limit, action ?? path, actor.id);
    } catch (error) {
      if (error instanceof HttpError && error.status === 429) {
        const retryAfter = Number(error.headers?.["Retry-After"] ?? 60);
        return {
          response: NextResponse.json(
            { ok: false, error: "rate_limited", retryAfter },
            {
              status: 429,
              headers: { ...NO_STORE, "Retry-After": String(retryAfter) },
            },
          ),
          actorId,
          code: "rate_limited",
        };
      }
      throw error;
    }

    const input = schema.safeParse(parsedBody);
    if (!input.success) {
      return {
        response: json(400, {
          ok: false,
          error: input.error.issues[0]?.message ?? "Invalid input",
        }),
        actorId,
        code: "invalid_input",
      };
    }
    const needsStrong =
      typeof strong === "function" ? strong(input.data) : Boolean(strong);
    if (needsStrong) await requireStrongConsoleActor(actor);

    const result = await run(input.data, { actor, request });
    if (result instanceof Response) {
      result.headers.set("Cache-Control", "no-store");
      return {
        response: result,
        actorId,
        code: result.ok ? "ok" : `http_${result.status}`,
      };
    }
    if (result?.audit) {
      const name = result.audit.action ?? action;
      if (!name) throw new Error(`No audit action for ${path}`);
      const reason = (input.data as { reason?: unknown })?.reason;
      await writeAuditLog({
        actor,
        action: name,
        targetType: result.audit.targetType,
        targetId: result.audit.targetId,
        metadata: {
          ...result.audit.metadata,
          reason: typeof reason === "string" ? reason : null,
          ...(result.audit.subjectUserId
            ? { subjectUserId: result.audit.subjectUserId }
            : {}),
          via: "console",
        },
      });
    }
    return {
      response: json(200, {
        ok: true,
        ...(result?.data === undefined ? {} : { data: result.data }),
      }),
      actorId,
      code: "ok",
    };
  } catch (error) {
    return failure(error, actorId);
  }
}
