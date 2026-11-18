import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { ANALYTICS_CONSENT_COOKIE } from "@repo/analytics/config";
import type {
  AnalyticsEvents,
  CleanProps,
  ServerAnalyticsEventName,
} from "@repo/analytics/events";
import { cookies } from "next/headers";
import { after } from "next/server";
import { env } from "@/env";
import { sanitizeProps } from "./privacy";

/**
 * Server-side conversions, sent to PostHog's capture API with fetch (no
 * posthog-node needed). An event names the user (distinct id = user id) only
 * when they allowed analytics; otherwise it is an anonymous count with no
 * person, no identifier and no GeoIP. Production deployments only.
 */
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

export type ServerEventOptions = {
  /** The user's id, used only with their analytics consent. */
  distinctId?: string | null;
  /** Same key, same event: PostHog keeps one copy of redelivered webhooks. */
  dedupeKey?: string;
  timestamp?: Date;
};

/** The request's analytics choice (mirrored by the browser in a cookie). */
export async function hasAnalyticsConsent(): Promise<boolean> {
  try {
    return (await cookies()).get(ANALYTICS_CONSENT_COOKIE)?.value === "1";
  } catch {
    return false;
  }
}

/** Options naming `userId` if this request allowed analytics, else none. */
export async function userEventOptions(
  userId: string,
  dedupeKey?: string,
): Promise<ServerEventOptions> {
  return {
    distinctId: (await hasAnalyticsConsent()) ? userId : null,
    ...(dedupeKey && { dedupeKey }),
  };
}

/** A stable UUID (v4 layout) from a key. */
function uuidFromKey(key: string): string {
  const hex = createHash("sha256").update(key).digest("hex").slice(0, 32);
  const variant = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(
    16,
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function buildServerEvent(
  event: ServerAnalyticsEventName,
  props: CleanProps,
  apiKey: string,
  options: ServerEventOptions = {},
) {
  const uuid = options.dedupeKey
    ? uuidFromKey(`${event}:${options.dedupeKey}`)
    : randomUUID();
  const identified = Boolean(options.distinctId);
  return {
    api_key: apiKey,
    event,
    uuid,
    distinct_id: identified ? (options.distinctId as string) : uuid,
    timestamp: (options.timestamp ?? new Date()).toISOString(),
    properties: {
      ...props,
      $lib: "qrdx-server",
      $process_person_profile: identified,
      $geoip_disable: true,
    },
  };
}

function isServerAnalyticsEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  // Vercel previews share production's env; keep them out of the numbers.
  return !env.VERCEL_ENV || env.VERCEL_ENV === "production";
}

/** Whether server events go out here: a PostHog key, in production. */
export function serverEventsEnabled(): boolean {
  return Boolean(env.NEXT_PUBLIC_POSTHOG_KEY) && isServerAnalyticsEnabled();
}

async function send(body: ReturnType<typeof buildServerEvent>) {
  const host = (env.NEXT_PUBLIC_POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST).replace(
    /\/$/,
    "",
  );
  try {
    const response = await fetch(`${host}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.error("PostHog capture failed:", body.event, response.status);
    }
  } catch (error) {
    console.error("PostHog capture failed:", body.event, error);
  }
}

/**
 * Records a server-side event after the response is sent. Never throws and
 * never delays the request.
 */
export function trackServer<E extends ServerAnalyticsEventName>(
  event: E,
  props: AnalyticsEvents[E],
  options?: ServerEventOptions,
): void {
  const apiKey = env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!(apiKey && isServerAnalyticsEnabled())) return;
  const body = buildServerEvent(event, sanitizeProps(props), apiKey, options);
  try {
    after(() => send(body));
  } catch {
    // Outside a request scope.
    void send(body);
  }
}

/**
 * trackServer for an event that needs work first (a database read, the
 * consent cookie): `build` runs after the response, in Route Handlers and
 * Server Functions, and null sends nothing. Nothing runs where server events
 * are off. Never throws and never delays the request.
 */
export function trackServerAfter<E extends ServerAnalyticsEventName>(
  event: E,
  build: () => Promise<{
    props: AnalyticsEvents[E];
    options?: ServerEventOptions;
  } | null>,
): void {
  const apiKey = env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!(apiKey && isServerAnalyticsEnabled())) return;
  const task = async () => {
    try {
      const built = await build();
      if (!built) return;
      const props = sanitizeProps(built.props);
      await send(buildServerEvent(event, props, apiKey, built.options));
    } catch (error) {
      console.error("PostHog capture failed:", event, error);
    }
  };
  try {
    after(task);
  } catch {
    // Outside a request scope.
    void task();
  }
}
