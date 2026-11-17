/** Longest error message kept in logs; SDK errors can embed whole bodies. */
const MAX_LOGGED_MESSAGE = 300;

/** The HTTP status an SDK or fetch error carries, if any. */
function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  for (const key of ["statusCode", "status"]) {
    const value = record[key];
    if (typeof value === "number") return value;
  }
  const response = record.response ?? record.rawResponse;
  if (response && typeof response === "object") {
    const status = (response as Record<string, unknown>).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

/**
 * Logs an action failure as a small, safe summary: never the raw error
 * object, which for SDK errors (Polar, Resend, AWS) can include request
 * URLs, response headers and bodies with customer data. Code bugs (no HTTP
 * status) keep their stack.
 */
export function logError(error: Error, context?: Record<string, unknown>) {
  const name = error?.name ?? "Error";
  const message = String(error?.message ?? error).slice(0, MAX_LOGGED_MESSAGE);
  const status = errorStatus(error);

  if (name === "UnauthorizedError" || name === "ValidationError") {
    console.warn("Expected error:", { name, message, context });
    return;
  }
  console.error("Unexpected error:", {
    name,
    message,
    ...(status === undefined ? { stack: error?.stack } : { status }),
    context,
  });
}

/** A name or code that can't carry data: a short identifier, or nothing. */
const asToken = (value: unknown): string | undefined =>
  typeof value === "string" && /^[\w.-]{1,64}$/.test(value) ? value : undefined;

/**
 * What a log line may say about an unexpected error: its kind and its code
 * (a Postgres SQLSTATE, a Node system error), never its message. A database
 * error's message lists the query's values (Drizzle's "Failed query: …
 * params: …", Postgres's "Key (email)=(…)"), so it can hold addresses and
 * session ids.
 */
export function errorSummary(error: unknown): { name: string; code?: string } {
  if (!(error instanceof Error)) {
    return { name: typeof error };
  }
  // Drizzle's DrizzleQueryError doesn't set `name`; its class says what it is.
  const className = error.constructor?.name;
  const name =
    asToken(className && className !== "Error" ? className : error.name) ??
    "Error";
  const codeOf = (value: unknown) =>
    value && typeof value === "object"
      ? asToken((value as { code?: unknown }).code)
      : undefined;
  const code = codeOf(error) ?? codeOf(error.cause);
  return code ? { name, code } : { name };
}
