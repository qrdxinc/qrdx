import "server-only";

import {
  createRateLimiter,
  type RateLimiter,
  slidingWindow,
} from "@repo/rate-limit";
import {
  ADMIN_LIMITS,
  type AdminLimitTier,
} from "@/app/(app)/admin/_lib/action-runner";
import { enforceRateLimits, refundRateLimits } from "@/lib/request-guards";

// The admin pages' limits for the console's signed endpoints: per admin and
// action, 30 a minute, or 5 an hour for the sensitive ones (deletion, moving
// an account's email, a two-step verification reset or its cancel, a data
// export). They hold even when the console's own checks don't run (a bug, a
// loop, a compromised console).
//
// Their own Redis keys: the console's runner already counts each action
// under the admin pages' keys ("qrdx:admin…") before it calls here, so
// sharing those would count every console action twice.
//
// Failing closed: when Upstash can't judge a request (not configured, down,
// slow), the limiter throws RateLimitUnavailableError and the endpoint
// answers 503, as it does when the replay store can't answer. Never the
// in-memory fallback, which only limits per instance.
//
// Per admin, with no cap across admins, as on the admin pages: a shared cap
// would let one admin's loop, or a compromised console, use up every other
// admin's sensitive actions, support's included. A compromised console gets
// the budgets only of the admins it can act for (./actor.ts checks each
// one's live session). A call refused with CONFIRMATION_REQUIRED gives its
// count back (refundConsoleLimit): nothing ran, and the admin comes back
// once confirmed.

export type ConsoleLimitTier = AdminLimitTier;

const limiter = (tier: ConsoleLimitTier, prefix: string): RateLimiter =>
  createRateLimiter({
    limiter: slidingWindow(
      ADMIN_LIMITS[tier].tokens,
      ADMIN_LIMITS[tier].window,
    ),
    prefix,
    failClosed: true,
  });

const limiters: Record<ConsoleLimitTier, RateLimiter> = {
  standard: limiter("standard", "qrdx:console-internal"),
  sensitive: limiter("sensitive", "qrdx:console-internal-sensitive"),
};

/**
 * Counts one call of `name` (the endpoint's audit action, or its path) by
 * this admin. Throws an HttpError 429 (RATE_LIMITED, with Retry-After) past
 * the tier's limit, and RateLimitUnavailableError when Upstash can't judge.
 */
export function enforceConsoleLimit(
  tier: ConsoleLimitTier,
  name: string,
  actorId: string,
): Promise<void> {
  return enforceRateLimits([
    { limiter: limiters[tier], key: `${name}:${actorId}` },
  ]);
}

/** Gives back the count enforceConsoleLimit took, for a call that ran nothing. */
export function refundConsoleLimit(
  tier: ConsoleLimitTier,
  name: string,
  actorId: string,
): Promise<void> {
  return refundRateLimits([
    { limiter: limiters[tier], key: `${name}:${actorId}` },
  ]);
}
