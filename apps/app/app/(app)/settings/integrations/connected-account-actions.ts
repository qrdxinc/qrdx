"use server";

import crypto from "node:crypto";
import { database as db, integration } from "@repo/database";
import {
  createShortLinkClient,
  encryptApiKey,
  getIntegrationRegistry,
  isIntegrationApiError,
  isMigrationSourceProvider,
  isShortLinkProvider,
  verifyMigrationSourceCredentials,
  verifySegmentWriteKey,
  verifyShortLinkCredentials,
} from "@repo/integrations";
import { readSegmentSettings } from "@repo/integrations/src/integrations/segment";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  connectLimiter,
  getConnection,
  getSessionUserId,
} from "@/lib/connected-accounts/server";
import { connectConfirmationNeeded } from "@/lib/data-connections/connect-confirmation";
import { dataCallsAllowed } from "@/lib/data-connections/server";
import { HttpError } from "@/lib/error-response";
import { settingsActionText } from "@/lib/i18n/settings-action-text";
import type { Translator } from "@/lib/i18n/translator";
import { isIntegrationConfigured } from "@/lib/integration-oauth";
import { enforceRateLimits } from "@/lib/request-guards";

// Refusals are in the person's language (settingsActions.connectedAccounts),
// read only when refusing; the providers' own error messages pass through.

export type ConnectedAccountActionResult =
  | { ok: true }
  | { ok: false; error: string };

type AccountText = () => Promise<
  Translator<"settingsActions.connectedAccounts">
>;

// Each message here is its key in settingsActions.connectedAccounts.
const KEY_ISSUES = ["keyTooShort", "keyTooLong", "keyNoSpaces"] as const;

const apiKeySchema = z.object({
  provider: z.string().min(1).max(64),
  apiKey: z
    .string()
    .trim()
    .min(8, "keyTooShort")
    .max(512, "keyTooLong")
    .regex(/^[\x21-\x7E]+$/, "keyNoSpaces"),
});

const domainSchema = z.object({
  provider: z.string().min(1).max(64),
  domainId: z.string().trim().min(1).max(253),
});

async function guard(
  userId: string,
  action: string,
  text: AccountText,
): Promise<ConnectedAccountActionResult | null> {
  try {
    await enforceRateLimits([
      { limiter: connectLimiter, key: `integrations:${action}:${userId}` },
    ]);
    return null;
  } catch (error) {
    if (error instanceof HttpError) {
      return {
        ok: false,
        error:
          error.code === "RATE_LIMITED"
            ? (await text())("rateLimited")
            : error.message,
      };
    }
    throw error;
  }
}

/** Data out with a pasted key: Segment's write key. */
const isDataOutKeyProvider = (provider: string) => provider === "segment";

/**
 * Checks a pasted key with the provider; null when it takes none. `saved` is
 * the metadata of the connection a key replaces, if there is one.
 */
function verifyKey(
  provider: string,
  apiKey: string,
  saved: Record<string, unknown> | null,
): Promise<Record<string, unknown>> | null {
  if (isShortLinkProvider(provider)) {
    return verifyShortLinkCredentials(provider, apiKey);
  }
  if (isMigrationSourceProvider(provider)) {
    return verifyMigrationSourceCredentials(provider, apiKey);
  }
  if (isDataOutKeyProvider(provider)) {
    // Segment accepts every key: its format, and (where calls to connected
    // tools are allowed) that the Tracking API answers, in the region a
    // replaced key's connection has picked.
    return verifySegmentWriteKey(apiKey, {
      reachOut: dataCallsAllowed(),
      region: saved ? readSegmentSettings(saved.settings).region : undefined,
    });
  }
  return null;
}

/**
 * Connects Bitly (generic access token), Rebrandly, Short.io, Uniqode (an
 * import source) or Segment (a source's write key) with a pasted key:
 * checked against the provider first, then stored encrypted. Segment gets
 * the account's scans and form answers, so it asks "Confirm it's you" first
 * (CONFIRMATION_REQUIRED), as the data-out sign-ins do.
 */
export async function connectWithApiKeyAction(
  provider: string,
  apiKey: string,
): Promise<ConnectedAccountActionResult> {
  const text = settingsActionText("settingsActions.connectedAccounts");
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: (await text())("signedOut") };

  const input = apiKeySchema.safeParse({ provider, apiKey });
  if (!input.success) {
    const issue = input.error.issues[0]?.message;
    const key = KEY_ISSUES.find((known) => known === issue);
    const t = await text();
    // Zod's own words for a provider the form never sends, as before.
    return { ok: false, error: key ? t(key) : (issue ?? t("checkKey")) };
  }

  const definition = getIntegrationRegistry().get(input.data.provider);
  const takesKeys =
    isShortLinkProvider(input.data.provider) ||
    isMigrationSourceProvider(input.data.provider) ||
    isDataOutKeyProvider(input.data.provider);
  // Only offered for the ones that do: English, as it was.
  if (!(definition?.apiKey && takesKeys)) {
    return { ok: false, error: "This integration doesn't use API keys." };
  }
  if (!isIntegrationConfigured(input.data.provider)) {
    return {
      ok: false,
      error: (await text())("notConfigured", { name: definition.name }),
    };
  }

  // Before the limit, so the round trip that asks doesn't use one up.
  const needed = await connectConfirmationNeeded(input.data.provider, userId);
  if (needed) return needed;

  const limited = await guard(userId, "api-key", text);
  if (limited) return limited;

  const existing = await db
    .select({ id: integration.id, metadata: integration.metadata })
    .from(integration)
    .where(
      and(
        eq(integration.userId, userId),
        eq(integration.provider, input.data.provider),
      ),
    )
    .limit(1);

  let metadata: Record<string, unknown>;
  try {
    metadata =
      (await verifyKey(
        input.data.provider,
        input.data.apiKey,
        (existing[0]?.metadata as Record<string, unknown> | null) ?? null,
      )) ?? {};
  } catch (error) {
    if (
      isIntegrationApiError(error) &&
      (error.code === "unauthorized" || error.code === "forbidden")
    ) {
      // The key's label as the form shows it (the catalogue's English).
      return {
        ok: false,
        error: (await text())("keyRejected", {
          name: definition.name,
          label: definition.apiKey.label.toLowerCase(),
        }),
      };
    }
    return {
      ok: false,
      error: isIntegrationApiError(error)
        ? error.message
        : (await text())("unreachable", { name: definition.name }),
    };
  }

  const values = {
    accessToken: encryptApiKey(input.data.apiKey),
    refreshToken: null,
    expiresAt: null,
    scopes: null,
    status: "active",
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db
      .update(integration)
      .set({
        ...values,
        // A replaced Segment key keeps the region, event names and streams
        // (left alone, so a sync writing its state meanwhile isn't undone).
        ...(isDataOutKeyProvider(input.data.provider) ? {} : { metadata }),
      })
      .where(eq(integration.id, existing[0].id));
  } else {
    await db.insert(integration).values({
      id: crypto.randomUUID(),
      userId,
      provider: input.data.provider,
      createdAt: new Date(),
      metadata,
      ...values,
    });
  }

  revalidatePath("/settings/integrations");
  return { ok: true };
}

/** Saves which domain new links use (the Short.io domain picker). */
export async function setDefaultShortLinkDomainAction(
  provider: string,
  domainId: string,
): Promise<ConnectedAccountActionResult> {
  const text = settingsActionText("settingsActions.connectedAccounts");
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: (await text())("domainSignedOut") };

  const input = domainSchema.safeParse({ provider, domainId });
  if (!(input.success && isShortLinkProvider(input.data.provider))) {
    return { ok: false, error: (await text())("pickDomain") };
  }

  const limited = await guard(userId, "domain", text);
  if (limited) return limited;

  const connection = await getConnection(userId, input.data.provider);
  if (connection?.status !== "active") {
    return { ok: false, error: (await text())("connectFirst") };
  }

  try {
    const domains = await createShortLinkClient(input.data.provider, {
      accessToken: connection.accessToken,
      metadata: connection.metadata,
    }).listDomains();
    const match = domains.find((domain) => domain.id === input.data.domainId);
    if (!match) {
      return { ok: false, error: (await text())("domainNotFound") };
    }

    await db
      .update(integration)
      .set({
        metadata: {
          ...connection.metadata,
          defaultDomain: { id: match.id, hostname: match.hostname },
        },
        updatedAt: new Date(),
      })
      .where(eq(integration.id, connection.id));
  } catch (error) {
    return {
      ok: false,
      error: isIntegrationApiError(error)
        ? error.message
        : (await text())("domainNotSaved"),
    };
  }

  revalidatePath(`/settings/integrations/${input.data.provider}`);
  return { ok: true };
}
