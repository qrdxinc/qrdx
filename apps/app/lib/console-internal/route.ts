import "server-only";

import { redis } from "@repo/rate-limit";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AdminAuditRecord } from "@/app/(app)/admin/_lib/action-runner";
import { writeAuditLog } from "@/app/(app)/admin/_lib/audit";
import { env } from "@/env";
import { HttpError } from "@/lib/http-error";
import {
  type ConsoleActor,
  loadConsoleActor,
  requireStrongConsoleActor,
} from "./actor";
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
// 6. the actor checked again here (./actor.ts), 403 for anyone else;
// 7. for strong endpoints, the admin's own second factor and a recent
//    strong confirmation by that session (CONFIRMATION_REQUIRED);
// 8. the endpoint's work, then its entry in the admin audit log, written
//    here with the admin checked above and the `reason` in the signed body,
//    as the admin pages' runner writes it. So an effect that finishes after
//    the console stopped waiting is still on record. The answer carries the
//    endpoint's `data` only.

const NO_STORE = { "Cache-Control": "no-store" } as const;
const REPLAY_TTL_SECONDS = 600;

const json = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, { status, headers: NO_STORE });

const refuse = (
  status: number,
  error: string,
  log?: { reason: string; path: string },
) => {
  if (log) {
    console.warn(
      JSON.stringify({ event: "console_internal.refused", ...log, status }),
    );
  }
  return json(status, { ok: false, error });
};

const actorSchema = z.object({
  userId: z.string().trim().min(1).max(128),
  sessionId: z.string().trim().min(1).max(256),
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

function failure(error: unknown, path: string): Response {
  if (error instanceof HttpError) {
    return json(error.status, { ok: false, error: error.message });
  }
  // Better Auth APIError messages are safe to show, as in the admin runner.
  if (error instanceof Error && "statusCode" in error && error.message) {
    const status = Number((error as { statusCode: unknown }).statusCode);
    return json(status >= 400 && status < 500 ? status : 400, {
      ok: false,
      error: error.message,
    });
  }
  console.error(
    JSON.stringify({
      event: "console_internal.failed",
      path,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  return json(500, { ok: false, error: "Action failed" });
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
export function consoleInternalRoute<S extends z.ZodType, T = undefined>({
  action,
  schema,
  strong,
  run,
}: ConsoleInternalOptions<S, T>) {
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

    try {
      if (!(await firstUse(signed.requestId))) {
        return refuse(409, "replayed", { reason: "replayed", path });
      }
    } catch (error) {
      return refuse(503, "unavailable", {
        reason:
          error instanceof ReplayStoreMissing
            ? "replay_store_missing"
            : "replay_store",
        path,
      });
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(body);
    } catch {
      return refuse(400, "bad_request");
    }
    const claim = z.object({ actor: actorSchema }).safeParse(parsedBody);
    if (!claim.success) return refuse(400, "bad_request");

    try {
      const actor = await loadConsoleActor(claim.data.actor);
      if (!actor) {
        return refuse(403, "not_admin", { reason: "not_admin", path });
      }
      const input = schema.safeParse(parsedBody);
      if (!input.success) {
        return json(400, {
          ok: false,
          error: input.error.issues[0]?.message ?? "Invalid input",
        });
      }
      const needsStrong =
        typeof strong === "function" ? strong(input.data) : Boolean(strong);
      if (needsStrong) await requireStrongConsoleActor(actor);

      const outcome = await run(input.data, { actor, request });
      if (outcome instanceof Response) {
        outcome.headers.set("Cache-Control", "no-store");
        return outcome;
      }
      if (outcome?.audit) {
        const name = outcome.audit.action ?? action;
        if (!name) throw new Error(`No audit action for ${path}`);
        const reason = (input.data as { reason?: unknown })?.reason;
        await writeAuditLog({
          actor,
          action: name,
          targetType: outcome.audit.targetType,
          targetId: outcome.audit.targetId,
          metadata: {
            ...outcome.audit.metadata,
            reason: typeof reason === "string" ? reason : null,
            ...(outcome.audit.subjectUserId
              ? { subjectUserId: outcome.audit.subjectUserId }
              : {}),
            via: "console",
          },
        });
      }
      return json(200, {
        ok: true,
        ...(outcome?.data === undefined ? {} : { data: outcome.data }),
      });
    } catch (error) {
      return failure(error, path);
    }
  };
}
