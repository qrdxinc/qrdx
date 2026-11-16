import "server-only";

import { redis } from "@repo/rate-limit";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AdminAuditRecord } from "@/app/(app)/admin/_lib/action-runner";
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
// 1. off (404) unless CONSOLE_INTERNAL_SECRET is set and long enough;
// 2. the signature (./signature.ts): well-formed, fresh, matching;
// 3. a request id seen before is refused (Upstash, when configured);
// 4. the body: JSON with `actor` and the endpoint's own fields;
// 5. the actor checked again here (./actor.ts), 403 for anyone else;
// 6. for strong endpoints, the admin's own second factor and a recent
//    strong confirmation by that session (CONFIRMATION_REQUIRED);
// 7. the endpoint's work. It answers what the admin action would hand its
//    runner: `audit` (null when nothing changed) and `data`. The console
//    writes the audit entry; nothing here does.

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
 * What an endpoint answers: the audit record the admin action would hand
 * its runner (absent or null when nothing changed, and for reads), and data.
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
  /** The endpoint's own fields (`actor` is checked separately). */
  schema: S;
  /** True, or a rule on the input, for actions that need strong confirmation. */
  strong?: boolean | ((input: z.output<S>) => boolean);
  run: (
    input: z.output<S>,
    context: ConsoleInternalContext,
  ) => Promise<ConsoleOutcome<T> | null | Response>;
}

/** The request id, once; false when it was seen before. */
async function firstUse(requestId: string): Promise<boolean> {
  if (!redis) return true;
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

/** A POST handler for one console endpoint. */
export function consoleInternalRoute<S extends z.ZodType, T = undefined>({
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
    const body = await request.text();
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
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
    } catch {
      return refuse(503, "unavailable", { reason: "replay_store", path });
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
      return json(200, {
        ok: true,
        ...(outcome?.data === undefined ? {} : { data: outcome.data }),
        audit: outcome?.audit ?? null,
      });
    } catch (error) {
      return failure(error, path);
    }
  };
}
