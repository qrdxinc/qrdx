"use server";

import { isIntegrationApiError, type SourceKeyInput } from "@repo/integrations";
import { CALCOM_API_KEY } from "@repo/integrations/src/integrations/calcom/client";
import {
  isStripeSecretKey,
  STRIPE_RESTRICTED_KEY,
} from "@repo/integrations/src/integrations/stripe/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  connectLimiter,
  getSessionUserId,
} from "@/lib/connected-accounts/server";
import { saveKeyConnection } from "@/lib/data-connections/server";
import { HttpError } from "@/lib/error-response";
import { settingsActionText } from "@/lib/i18n/settings-action-text";
import type { Translator } from "@/lib/i18n/translator";
import { enforceRateLimits } from "@/lib/request-guards";

// Refusals are in the person's language (settingsActions.dataConnections),
// read only when refusing.

export type DataConnectionResult = { ok: true } | { ok: false; error: string };

type ConnectionTranslator = Translator<"settingsActions.dataConnections">;

// Each schema message is its key in settingsActions.dataConnections.
const SCHEMA_ISSUES = [
  "tooShort",
  "tooLong",
  "noSpaces",
  "storeDomainMissing",
] as const;

const token = z
  .string()
  .trim()
  .min(8, "tooShort")
  .max(512, "tooLong")
  .regex(/^[\x21-\x7E]+$/, "noSpaces");

const inputSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("stripe"), apiKey: token }),
  z.object({ provider: z.literal("calcom"), apiKey: token }),
  z.object({
    provider: z.literal("shopify"),
    shop: z.string().trim().min(1, "storeDomainMissing").max(253),
    accessToken: token.optional(),
    clientId: token.optional(),
    clientSecret: token.optional(),
  }),
]);

const NAMES = { stripe: "Stripe", calcom: "Cal.com", shopify: "Shopify" };

/** What's wrong with the pasted key, as its key in the catalog; else null. */
function keyProblem(
  input: SourceKeyInput,
):
  | "stripeSecretKey"
  | "stripeRestrictedKey"
  | "calcomKey"
  | "shopifyCredentials"
  | null {
  if (input.provider === "stripe") {
    if (isStripeSecretKey(input.apiKey)) return "stripeSecretKey";
    if (!STRIPE_RESTRICTED_KEY.test(input.apiKey)) return "stripeRestrictedKey";
  }
  if (input.provider === "calcom" && !CALCOM_API_KEY.test(input.apiKey)) {
    return "calcomKey";
  }
  if (
    input.provider === "shopify" &&
    !input.accessToken &&
    !(input.clientId && input.clientSecret)
  ) {
    return "shopifyCredentials";
  }
  return null;
}

/** The schema's first issue in the person's language. */
function schemaIssue(
  issue: string | undefined,
  t: ConnectionTranslator,
): string {
  const key = SCHEMA_ISSUES.find((known) => known === issue);
  if (key) return t(key);
  // Zod's own words for a request the form never sends, as before.
  return issue ?? t("checkDetails");
}

/** The provider refused the key: what to change, for the ones we know. */
function forbiddenText(
  input: SourceKeyInput,
  name: string,
  t: ConnectionTranslator,
): string {
  if (input.provider === "stripe") return t("stripeForbidden");
  if (input.provider === "shopify") return t("shopifyForbidden");
  return t("forbidden", { name });
}

/**
 * Connects Stripe (restricted key), Cal.com (API key) or Shopify (store
 * domain + token or client credentials): checked with one read call, stored
 * encrypted.
 */
export async function connectDataSourceAction(
  raw: unknown,
): Promise<DataConnectionResult> {
  const text = settingsActionText("settingsActions.dataConnections");
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: (await text())("signedOut") };

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: schemaIssue(parsed.error.issues[0]?.message, await text()),
    };
  }
  const input = parsed.data as SourceKeyInput;
  const problem = keyProblem(input);
  if (problem) return { ok: false, error: (await text())(problem) };

  try {
    await enforceRateLimits([
      { limiter: connectLimiter, key: `integrations:data-key:${userId}` },
    ]);
    await saveKeyConnection(userId, input);
  } catch (error) {
    const name = NAMES[input.provider];
    if (error instanceof HttpError) {
      return {
        ok: false,
        error:
          error.code === "RATE_LIMITED"
            ? (await text())("rateLimited")
            : error.message,
      };
    }
    if (isIntegrationApiError(error)) {
      if (error.code === "unauthorized") {
        return { ok: false, error: (await text())("notAccepted", { name }) };
      }
      if (error.code === "forbidden") {
        return { ok: false, error: forbiddenText(input, name, await text()) };
      }
      // The provider's own words.
      return { ok: false, error: error.message };
    }
    console.error(
      JSON.stringify({
        event: "integrations.key_connect_failed",
        provider: input.provider,
        error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      }),
    );
    return { ok: false, error: (await text())("unreachable", { name }) };
  }

  revalidatePath(`/settings/integrations/${input.provider}`);
  revalidatePath("/settings/integrations");
  return { ok: true };
}
