// What runs before the docs assistant answers (app/api/docs-chat), in this
// order: the kill switch, the feature's availability, the visitor's and the
// deployment's rate limits, then the body's shape and sizes. Nothing here
// touches the database or the per-user AI quota tables: the assistant is
// for anyone, signed in or not, and keeps no record of who asked.
import "server-only";

import {
  createRateLimiter,
  fixedWindow,
  type RateLimiter,
  slidingWindow,
} from "@repo/rate-limit";
import { z } from "zod";
import { env } from "@/env";
import { assertAIConfigured } from "@/lib/ai/providers";
import { HttpError } from "@/lib/http-error";
import { getClientIp } from "@/lib/request-guards";
import {
  DOCS_CHAT,
  DOCS_CHAT_LIMIT_MESSAGE,
  DOCS_CHAT_OFF_MESSAGE,
  DOCS_CHAT_PACE_MESSAGE,
} from "./config";
import { docsChatSwitchedOn } from "./server";

/** The body the browser (components/chat in the docs app) and the eval send. */
export const docsChatRequestSchema = z
  .object({
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().min(1).max(DOCS_CHAT.maxAssistantChars),
        }),
      )
      .min(1)
      .max(DOCS_CHAT.maxMessages),
    /**
     * Ignored: the docs are English only and the answer follows the language
     * of the question. Still accepted, because pages loaded before that
     * change send it.
     */
    lang: z.string().max(12).optional(),
    /** The page the reader is on. */
    page: z
      .object({
        path: z.string().min(1).max(DOCS_CHAT.maxPathChars),
        title: z.string().min(1).max(DOCS_CHAT.maxPageTitleChars),
      })
      .optional(),
  })
  .superRefine((body, ctx) => {
    const last = body.messages.at(-1);
    if (last?.role !== "user") {
      ctx.addIssue({
        code: "custom",
        path: ["messages"],
        message: "The last message must be the reader's question",
      });
    }
    body.messages.forEach((message, index) => {
      if (
        message.role === "user" &&
        message.content.length > DOCS_CHAT.maxUserChars
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["messages", index, "content"],
          message: `A question is at most ${DOCS_CHAT.maxUserChars} characters`,
        });
      }
    });
  });

export type DocsChatRequest = z.infer<typeof docsChatRequestSchema>;

/**
 * The assistant is on here: DOCS_CHAT_ENABLED isn't "0" or "false", the
 * gateway key is set and there is a docs site to read (DOCS_ZONE_URL).
 * Throws the 503 the UI turns into "Search still works".
 */
export function assertDocsChatOn(): void {
  if (!docsChatSwitchedOn()) {
    throw new HttpError(503, "DOCS_CHAT_DISABLED", DOCS_CHAT_OFF_MESSAGE);
  }
  assertAIConfigured();
  if (!env.DOCS_ZONE_URL) {
    throw new HttpError(503, "DOCS_CHAT_NOT_CONFIGURED", DOCS_CHAT_OFF_MESSAGE);
  }
}

// One visitor: a few questions a minute, a few dozen a day. Everyone
// together: DOCS_CHAT_DAILY_LIMIT a day (fixed UTC windows, like the other
// daily counters). Without Upstash the limiters are no-ops (rate-limit's
// own warning says so once).
const minuteLimiter = createRateLimiter({
  limiter: slidingWindow(DOCS_CHAT.perIpPerMinute, "60 s"),
});
const dayLimiter = createRateLimiter({
  limiter: fixedWindow(DOCS_CHAT.perIpPerDay, "1 d"),
});
let globalLimiter: RateLimiter | undefined;

/** The deployment-wide daily cap (DOCS_CHAT_DAILY_LIMIT, or the default). */
export function docsChatDailyLimit(): number {
  const value = Number(env.DOCS_CHAT_DAILY_LIMIT);
  return Number.isInteger(value) && value > 0
    ? value
    : DOCS_CHAT.defaultDailyLimit;
}

function retryAfter(reset: number): Record<string, string> {
  return {
    "Retry-After": String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))),
  };
}

/**
 * Counts one question against the visitor's minute and day windows and the
 * deployment's day window, and refuses with a 429 the UI can show: the
 * pace message for the minute window, the limit message for the two
 * daily ones.
 */
export async function enforceDocsChatLimits(req: Request): Promise<void> {
  const ip = getClientIp(req);
  globalLimiter ??= createRateLimiter({
    limiter: fixedWindow(docsChatDailyLimit(), "1 d"),
  });
  const [minute, day, global] = await Promise.all([
    minuteLimiter.limit(`docs-chat:minute:${ip}`),
    dayLimiter.limit(`docs-chat:day:${ip}`),
    globalLimiter.limit("docs-chat:day:all"),
  ]);
  if (!minute.success) {
    throw new HttpError(
      429,
      "RATE_LIMITED",
      DOCS_CHAT_PACE_MESSAGE,
      retryAfter(minute.reset),
    );
  }
  if (!(day.success && global.success)) {
    const reset = Math.max(
      day.success ? 0 : day.reset,
      global.success ? 0 : global.reset,
    );
    throw new HttpError(
      429,
      "DOCS_CHAT_LIMITED",
      DOCS_CHAT_LIMIT_MESSAGE,
      retryAfter(reset),
    );
  }
}
