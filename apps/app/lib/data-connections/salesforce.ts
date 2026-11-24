import "server-only";

import { database as db, integration } from "@repo/database";
import {
  encryptApiKey,
  type Integration,
  IntegrationApiError,
} from "@repo/integrations";
import {
  createSalesforceClient,
  refreshSalesforceToken,
  type SalesforceClient,
  type SalesforceSession,
  salesforceEnvironment,
} from "@repo/integrations/src/integrations/salesforce";
import { eq, sql } from "drizzle-orm";
import { getIntegrationConfig } from "@/lib/connected-accounts/server";

// Salesforce access tokens carry no expiry: a call answered 401 is the signal
// to refresh (on the host the person signed in on), store the new token
// encrypted, and try the call once more. Tokens are never logged.

/**
 * Trades the stored refresh token for a new access token and saves it (and a
 * rotated refresh token, and the org address if it moved). The sync state in
 * metadata is left alone: only metadata.instanceUrl is set, in SQL.
 */
export async function refreshSalesforceConnection(
  connection: Pick<Integration, "id" | "refreshToken" | "metadata">,
): Promise<SalesforceSession> {
  if (!connection.refreshToken) {
    throw new IntegrationApiError({
      provider: "salesforce",
      status: 401,
      code: "unauthorized",
      message: "Salesforce has no refresh token. Reconnect Salesforce.",
    });
  }
  const config = getIntegrationConfig("salesforce");
  const session = await refreshSalesforceToken({
    environment: salesforceEnvironment(connection.metadata),
    refreshToken: connection.refreshToken,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });
  const meta = sql`coalesce(${integration.metadata}::jsonb, '{}'::jsonb)`;
  await db
    .update(integration)
    .set({
      accessToken: encryptApiKey(session.accessToken),
      ...(session.refreshToken
        ? { refreshToken: encryptApiKey(session.refreshToken) }
        : {}),
      metadata: sql`jsonb_set(${meta}, '{instanceUrl}', to_jsonb(${session.instanceUrl}::text))::json`,
      updatedAt: new Date(),
    })
    .where(eq(integration.id, connection.id));
  return session;
}

/** A client for the stored connection that refreshes its own token on a 401. */
export function salesforceClientFor(
  connection: Pick<
    Integration,
    "id" | "accessToken" | "refreshToken" | "metadata"
  >,
): SalesforceClient {
  // An org that rotates refresh tokens sends a new one with each refresh.
  let refreshToken = connection.refreshToken;
  return createSalesforceClient({
    accessToken: connection.accessToken,
    instanceUrl: String(connection.metadata?.instanceUrl ?? ""),
    refresh: async () => {
      const session = await refreshSalesforceConnection({
        ...connection,
        refreshToken,
      });
      refreshToken = session.refreshToken ?? refreshToken;
      return session;
    },
  });
}
