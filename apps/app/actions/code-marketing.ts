"use server";

import { createHash } from "node:crypto";
import { database as db, qrCode, SCAN_DEVICE_TYPES } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  codeIdSchema,
  destinationUrlSchema,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { codeEventsByIds } from "@/ee/audit-log/code-events";
import { recordAuditEvent } from "@/ee/audit-log/record";
import {
  conversionsAllowed,
  conversionsUnavailable,
} from "@/ee/conversions/access";
import {
  CODE_ACTION_MESSAGES,
  type CodeActionMessages,
  ownMessage,
} from "@/lib/code-actions/messages";
import { codeActionText } from "@/lib/code-actions/messages-server";
import { snapshotCodeVersion } from "@/lib/code-versions";
import { HttpError } from "@/lib/error-response";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { baseUrl } from "@/lib/metadata";
import { assertCan } from "@/lib/permissions-server";
import {
  cheapestPlanWith,
  getPlanForScope,
  getPlanLimits,
  type Plan,
} from "@/lib/plans";
import {
  evaluateRouting,
  finalizeUrl,
  type PixelConfig,
  parsePixelConfig,
  parseRoutingConfig,
  parseUtmConfig,
  pixelConfigSchema,
  ROUTING_OS,
  type RoutingConfig,
  type RoutingTrace,
  routingConfigSchema,
  SCAN_TOKEN_PARAM,
  type UtmConfig,
  utmConfigSchema,
} from "@/lib/redirect/routing";
import { enforceRateLimits } from "@/lib/request-guards";
import { mapWithConcurrency } from "@/lib/safety/check";
import { screenUrlChange } from "@/lib/safety/destinations";
import { type HoldRequest, writeHoldReports } from "@/lib/safety/velocity";
import { withPreciseLocation } from "@/lib/scan-location/settings";
import { type ActiveScope, getActiveScope, isInScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError, ValidationError } from "@/types/errors";

export type MarketingErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "PLAN_REQUIRED"
  | "RATE_LIMITED"
  | "UNSAFE_DESTINATION"
  | "UNKNOWN_ERROR";

export type MarketingActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: MarketingErrorCode; message: string } };

export interface CodeMarketingSettings {
  codeId: string;
  kind: "redirect" | "page";
  destinationUrl: string;
  plan: Plan;
  /** What the scope's plan allows editing (saved settings keep working either way) */
  features: {
    routing: boolean;
    utm: boolean;
    pixels: boolean;
    /** The plan includes it and the server has the licence (ee/conversions) */
    conversions: boolean;
    /** Ask scanners for precise location, geofence rules (lib/scan-location) */
    preciseLocation: boolean;
  };
  routing: RoutingConfig | null;
  utm: UtmConfig | null;
  pixels: PixelConfig | null;
  /** For the conversion snippet */
  origin: string;
}

const KNOWN_CODES = new Set<string>([
  "NOT_FOUND",
  "PLAN_REQUIRED",
  "RATE_LIMITED",
  "UNSAFE_DESTINATION",
]);

type MarketingText = CodeActionMessages["marketing"];

const ENGLISH = CODE_ACTION_MESSAGES.marketing;

/** Errors whose message is built from parts here: how to say it in `text`. */
const sayAgain = new WeakMap<Error, (text: MarketingText) => string>();

/** `error` (its message in English), saying `say(text)` in another language. */
function localized<E extends Error>(
  error: E,
  say: (text: MarketingText) => string,
): E {
  sayAgain.set(error, say);
  return error;
}

/** The answer for a thrown `error`, in the person's language (codeActionText). */
async function failure(
  error: unknown,
  context: Record<string, unknown>,
  who: { pageLocale?: string; userId?: string },
): Promise<MarketingActionResult<never>> {
  const text = (await codeActionText(who)).marketing;
  const say = (thrown: Error) =>
    sayAgain.get(thrown)?.(text) ?? ownMessage(ENGLISH, text, thrown.message);
  if (error instanceof UnauthorizedError) {
    return {
      success: false,
      error: { code: "UNAUTHORIZED", message: text.signIn },
    };
  }
  if (error instanceof ValidationError) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: say(error) },
    };
  }
  if (error instanceof HttpError) {
    return {
      success: false,
      error: {
        code: KNOWN_CODES.has(error.code)
          ? (error.code as MarketingErrorCode)
          : "UNKNOWN_ERROR",
        message: say(error),
      },
    };
  }
  logError(error as Error, context);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: text.failed },
  };
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const message = issue?.message ?? "Invalid input";
    // Routing configs: say which rule (1-based) the problem is in.
    const rule = issue?.path[0] === "rules" ? issue.path[1] : undefined;
    if (typeof rule !== "number") throw new ValidationError(message);
    const say = (text: MarketingText) =>
      text.problemIn({
        label: text.rule(rule + 1),
        problem: ownMessage(ENGLISH, text, message),
      });
    throw localized(new ValidationError(say(ENGLISH)), say);
  }
  return result.data;
}

/** Saves need a role that may write (lib/permissions.ts); reads say so. */
async function run<T>(
  action: string,
  fn: (scope: ActiveScope) => Promise<T>,
  {
    access = "write",
    pageLocale,
  }: {
    access?: "read" | "write";
    /** The calling page's useLocale(): the language its messages are in */
    pageLocale?: string;
  } = {},
): Promise<MarketingActionResult<T>> {
  let userId: string | undefined;
  try {
    const scope = await getActiveScope();
    userId = scope.userId;
    if (access === "write") assertCan(scope, "content.write");
    return { success: true, data: await fn(scope) };
  } catch (error) {
    return failure(error, { action }, { pageLocale, userId });
  }
}

const saveLimiter = createRateLimiter({ limiter: slidingWindow(30, "60 s") });

const enforceSaveLimit = (userId: string) =>
  enforceRateLimits([
    { limiter: saveLimiter, key: `code-marketing:save:user:${userId}` },
  ]);

const codeColumns = {
  id: qrCode.id,
  userId: qrCode.userId,
  organizationId: qrCode.organizationId,
  kind: qrCode.kind,
  destinationUrl: qrCode.destinationUrl,
  isActive: qrCode.isActive,
  scanCount: qrCode.scanCount,
  routing: qrCode.routing,
  utm: qrCode.utm,
  pixels: qrCode.pixels,
};

function scopeWhere(scope: ActiveScope): SQL {
  return scope.organizationId
    ? eq(qrCode.organizationId, scope.organizationId)
    : (and(
        eq(qrCode.userId, scope.userId),
        isNull(qrCode.organizationId),
      ) as SQL);
}

async function loadCode(scope: ActiveScope, id: string) {
  const [row] = await db
    .select(codeColumns)
    .from(qrCode)
    .where(eq(qrCode.id, parse(codeIdSchema, id)))
    .limit(1);
  // Codes outside the scope look exactly like missing ones.
  if (!(row && isInScope(scope, row))) {
    throw new HttpError(404, "NOT_FOUND", ENGLISH.notFound);
  }
  return row;
}

type CodeRow = Awaited<ReturnType<typeof loadCode>>;

async function toSettings(
  scope: ActiveScope,
  row: CodeRow,
): Promise<CodeMarketingSettings> {
  const plan = await getPlanForScope(scope);
  const limits = getPlanLimits(plan);
  return {
    codeId: row.id,
    kind: row.kind,
    destinationUrl: row.destinationUrl,
    plan,
    features: {
      routing: limits.routing,
      utm: limits.routing,
      pixels: limits.pixels,
      conversions: conversionsAllowed(limits),
      preciseLocation: limits.preciseLocation,
    },
    routing: parseRoutingConfig(row.routing),
    utm: parseUtmConfig(row.utm),
    pixels: parsePixelConfig(row.pixels),
    origin: baseUrl.origin,
  };
}

/** The limit (lib/plans.ts) a feature needs; the message names its cheapest plan. */
function planRequired(
  feature: keyof MarketingText["planRequired"],
  limit: "routing" | "pixels" | "conversions" | "preciseLocation",
): HttpError {
  const plan = cheapestPlanWith((limits) => limits[limit]);
  return localized(
    new HttpError(402, "PLAN_REQUIRED", ENGLISH.planRequired[feature](plan)),
    (text) => text.planRequired[feature](plan),
  );
}

/** Same rules as the code's main destination (http/https, not another short link). */
function assertDestination(
  url: string,
  label: (text: MarketingText) => string,
) {
  const result = destinationUrlSchema.safeParse(url);
  if (!result.success) {
    const problem = result.error.issues[0]?.message;
    const say = (text: MarketingText) =>
      text.problemIn({
        label: label(text),
        problem: problem ?? text.invalidUrl,
      });
    throw localized(new ValidationError(say(ENGLISH)), say);
  }
}

function assertRoutingUrls(config: RoutingConfig) {
  config.rules.forEach((rule, index) => {
    const label = (text: MarketingText) => rule.name || text.rule(index + 1);
    if (rule.action.type === "redirect") {
      assertDestination(rule.action.url, label);
    } else {
      for (const variant of rule.action.variants) {
        assertDestination(variant.url, (text) =>
          text.variant({
            label: label(text),
            variant: variant.name || variant.id,
          }),
        );
      }
    }
  });
}

const routingUrls = (config: RoutingConfig | null): string[] =>
  (config?.rules ?? []).flatMap((rule) =>
    rule.action.type === "redirect"
      ? [rule.action.url]
      : rule.action.variants.map((variant) => variant.url),
  );

/**
 * lib/safety screen for URLs the rules add (unchanged ones aren't re-checked).
 * Throws for unsafe URLs; holds = switch the code off pending review, as for
 * a new main destination.
 */
async function screenRoutingUrls(
  scope: ActiveScope,
  row: CodeRow,
  next: RoutingConfig,
  previous: RoutingConfig | null,
): Promise<HoldRequest[]> {
  const known = new Set(routingUrls(previous));
  const added = [...new Set(routingUrls(next))].filter(
    (url) => !known.has(url),
  );
  const holds = await mapWithConcurrency(added, 4, (url) =>
    screenUrlChange(scope, row, {
      previous: null,
      next: url,
      field: "routing rule",
    }),
  );
  return holds.filter((hold) => hold !== null);
}

const withoutEnabled = (rule: RoutingConfig["rules"][number]) =>
  JSON.stringify({ ...rule, enabled: undefined });

/** Only removes or turns off existing rules (allowed without the plan). */
function isRoutingReduction(
  next: RoutingConfig | null,
  previous: RoutingConfig | null,
): boolean {
  if (!next || next.rules.length === 0) return true;
  const before = new Map(previous?.rules.map((rule) => [rule.id, rule]));
  return next.rules.every((rule) => {
    const old = before.get(rule.id);
    return (
      old !== undefined &&
      withoutEnabled(old) === withoutEnabled(rule) &&
      (old.enabled || !rule.enabled)
    );
  });
}

/** A split keeps its start date while its variants and weights stay the same. */
function stampSplits(
  next: RoutingConfig,
  previous: RoutingConfig | null,
  now: Date,
): RoutingConfig {
  const before = new Map(previous?.rules.map((rule) => [rule.id, rule]));
  const shape = (variants: { id: string; weight: number }[]) =>
    JSON.stringify(variants.map(({ id, weight }) => [id, weight]));
  return {
    ...next,
    rules: next.rules.map((rule) => {
      if (rule.action.type !== "split") return rule;
      const old = before.get(rule.id)?.action;
      const since =
        old?.type === "split" &&
        old.since &&
        shape(old.variants) === shape(rule.action.variants)
          ? old.since
          : now.toISOString();
      return { ...rule, action: { ...rule.action, since } };
    }),
  };
}

async function saveColumn(
  scope: ActiveScope,
  row: CodeRow,
  values: Partial<
    Pick<typeof qrCode.$inferInsert, "routing" | "utm" | "pixels" | "isActive">
  >,
): Promise<CodeMarketingSettings> {
  await snapshotCodeVersion(row.id, scope.userId);
  const [updated] = await db
    .update(qrCode)
    .set(values)
    .where(and(eq(qrCode.id, row.id), scopeWhere(scope)))
    .returning(codeColumns);
  if (!updated) throw new HttpError(404, "NOT_FOUND", ENGLISH.notFound);
  revalidatePath("/dashboard", "layout");
  return toSettings(scope, updated);
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function getCodeMarketing(
  id: string,
  pageLocale?: string,
): Promise<MarketingActionResult<CodeMarketingSettings>> {
  return run(
    "getCodeMarketing",
    async (scope) => toSettings(scope, await loadCode(scope, id)),
    { access: "read", pageLocale },
  );
}

const nullable = <T extends z.ZodType>(schema: T) => schema.nullable();

export async function saveCodeRouting(
  input: {
    id: string;
    routing: unknown;
  },
  pageLocale?: string,
): Promise<MarketingActionResult<CodeMarketingSettings>> {
  return run(
    "saveCodeRouting",
    async (scope) => {
      await enforceSaveLimit(scope.userId);
      const row = await loadCode(scope, input.id);
      const parsed = parse(nullable(routingConfigSchema), input.routing);
      const next = parsed && parsed.rules.length > 0 ? parsed : null;
      const previous = parseRoutingConfig(row.routing);
      const limits = getPlanLimits(await getPlanForScope(scope));
      if (!(limits.routing || isRoutingReduction(next, previous))) {
        throw planRequired("routing", "routing");
      }
      if (next) assertRoutingUrls(next);
      const holds = next
        ? await screenRoutingUrls(scope, row, next, previous)
        : [];
      const saved = await saveColumn(scope, row, {
        routing: next ? stampSplits(next, previous, new Date()) : null,
        ...(holds.length > 0 ? { isActive: false } : {}),
      });
      await writeHoldReports(holds);
      recordAuditEvent(scope, () =>
        codeEventsByIds("code.routing_changed", [row.id], {
          before: { rules: previous?.rules.length ?? 0 },
          after: { rules: next?.rules.length ?? 0 },
        }),
      );
      return saved;
    },
    { pageLocale },
  );
}

const isEmptyUtm = (utm: UtmConfig | null) =>
  !utm ||
  (!(utm.source || utm.medium || utm.campaign || utm.term || utm.content) &&
    utm.params.length === 0);

export async function saveCodeUtm(
  input: {
    id: string;
    utm: unknown;
  },
  pageLocale?: string,
): Promise<MarketingActionResult<CodeMarketingSettings>> {
  return run(
    "saveCodeUtm",
    async (scope) => {
      await enforceSaveLimit(scope.userId);
      const row = await loadCode(scope, input.id);
      const parsed = parse(nullable(utmConfigSchema), input.utm);
      const next = isEmptyUtm(parsed) ? null : parsed;
      const limits = getPlanLimits(await getPlanForScope(scope));
      if (next && !limits.routing) {
        throw planRequired("utm", "routing");
      }
      return saveColumn(scope, row, { utm: next });
    },
    { pageLocale },
  );
}

export async function saveCodePixels(
  input: {
    id: string;
    pixels: unknown;
  },
  pageLocale?: string,
): Promise<MarketingActionResult<CodeMarketingSettings>> {
  return run(
    "saveCodePixels",
    async (scope) => {
      await enforceSaveLimit(scope.userId);
      const row = await loadCode(scope, input.id);
      const parsed = parse(nullable(pixelConfigSchema), input.pixels);
      const previous = parsePixelConfig(row.pixels);
      const limits = getPlanLimits(await getPlanForScope(scope));

      if (parsed) {
        // Without the plan, ids may only be removed and conversions turned off.
        const added = (
          ["ga4", "gtm", "meta", "tiktok", "linkedin"] as const
        ).some((key) => parsed[key] && parsed[key] !== previous?.[key]);
        if (added && !limits.pixels) {
          throw planRequired("pixels", "pixels");
        }
        // Conversion tracking (ee/conversions) also needs the licence key on
        // the server; turning it off never needs either.
        if (parsed.conversions && !previous?.conversions) {
          if (!isFeatureAvailable("conversions"))
            throw conversionsUnavailable();
          if (!limits.conversions) {
            throw planRequired("conversions", "conversions");
          }
        }
        if (
          parsed.preciseLocation &&
          !previous?.preciseLocation &&
          !limits.preciseLocation
        ) {
          throw planRequired("preciseLocation", "preciseLocation");
        }
      }
      // Precise location has its own switch (saveCodePreciseLocation): kept
      // as it is unless the input sets it.
      const next = withPreciseLocation(
        parsed,
        parsed?.preciseLocation ?? previous?.preciseLocation === true,
      );
      return saveColumn(scope, row, { pixels: next });
    },
    { pageLocale },
  );
}

export async function saveCodePreciseLocation(input: {
  id: string;
  enabled: unknown;
}): Promise<MarketingActionResult<CodeMarketingSettings>> {
  return run("saveCodePreciseLocation", async (scope) => {
    await enforceSaveLimit(scope.userId);
    const row = await loadCode(scope, input.id);
    const enabled = parse(z.boolean(), input.enabled);
    const previous = parsePixelConfig(row.pixels);
    const limits = getPlanLimits(await getPlanForScope(scope));
    // Turning it off never needs the plan.
    if (enabled && !previous?.preciseLocation && !limits.preciseLocation) {
      throw planRequired("preciseLocation", "preciseLocation");
    }
    return saveColumn(scope, row, {
      pixels: withPreciseLocation(previous, enabled),
    });
  });
}

// ─── Rule tester ─────────────────────────────────────────────────────────────

const sampleSchema = z.object({
  device: z.enum(SCAN_DEVICE_TYPES),
  os: z.enum(ROUTING_OS).nullable(),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(?:[A-Z]{2})?$/, ENGLISH.countryCode)
    .transform((value) => value || null),
  region: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(?:(?:[A-Z]{2}-)?[A-Z0-9]{1,3})?$/, ENGLISH.regionCode)
    .transform((value) => value.replace(/^[A-Z]{2}-/, "") || null),
  language: z
    .string()
    .trim()
    .toLowerCase()
    .max(35)
    .transform((value) => value || null),
  at: z.iso.datetime({ offset: true }),
  scanNumber: z.int().min(1).max(1_000_000_000),
  visitor: z.string().trim().max(100),
  /** Where the simulated scanner is, for area (geofence) conditions */
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .nullish(),
});

const testSchema = z.object({
  id: codeIdSchema,
  /** Unsaved rules from the editor */
  routing: routingConfigSchema.nullable(),
  sample: sampleSchema,
});

export interface RoutingTestResult {
  ruleId: string | null;
  variantId: string | null;
  url: string;
  trace: RoutingTrace[];
}

/**
 * Evaluates unsaved rules against a simulated scan with the saved UTM and
 * conversion settings (nothing is stored).
 */
export async function testCodeRouting(
  input: z.input<typeof testSchema>,
  pageLocale?: string,
): Promise<MarketingActionResult<RoutingTestResult>> {
  return run(
    "testCodeRouting",
    async (scope) => {
      const { id, routing, sample } = parse(testSchema, input);
      const row = await loadCode(scope, id);
      const result = evaluateRouting(
        routing,
        {
          deviceType: sample.device,
          os: sample.os,
          country: sample.country,
          region: sample.region,
          language: sample.language,
          now: new Date(sample.at),
          scanNumber: sample.scanNumber,
          visitorKey: createHash("sha256")
            .update(sample.visitor || "visitor")
            .digest("hex"),
          location: sample.location
            ? { ...sample.location, source: "gps" }
            : null,
        },
        row.destinationUrl,
      );
      // As lib/redirect/routing.ts resolveDestination: qrdx_sid only where
      // the server has the licence key (ee/conversions).
      const conversions =
        parsePixelConfig(row.pixels)?.conversions &&
        isFeatureAvailable("conversions");
      return {
        ruleId: result.rule?.id ?? null,
        variantId: result.variant?.id ?? null,
        url: finalizeUrl(result.url, {
          utm: parseUtmConfig(row.utm),
          scanToken: conversions ? "…" : null,
        }).replace(`${SCAN_TOKEN_PARAM}=%E2%80%A6`, `${SCAN_TOKEN_PARAM}=…`),
        trace: result.trace,
      };
      // Stores nothing: a dry run of unsaved rules.
    },
    { access: "read", pageLocale },
  );
}
