import "server-only";

// Dynamic codes from the MCP server: create_dynamic_code, list_codes,
// get_code_stats and update_code_destination act on the signed-in person's
// workspace (./auth.ts). They call the services behind the REST API
// (POST and PATCH /v1/codes, GET /v1/codes/{id}/scans) with the same
// credential checks, so plan limits, the per-user create limit, link
// screening and safety holds, webhooks and the audit log behave exactly as
// they do there. Scan stats are totals and short breakdowns, never single
// scans or precise locations.
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  type CodeListStatus,
  createCodeSchema,
  createCodesBatch,
  destinationUrlSchema,
  enforceCreateRateLimit,
  getCode,
  listCodes,
  MAX_TITLE_LENGTH,
  type QrCodeView,
  updateCode,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import {
  type ApiCaller,
  optionalBearerCaller,
} from "@/app/api/v1/codes/_lib/api";
import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { readLogoDataUrl, resolveLogo } from "@/lib/qr-api/logo";
import {
  type ResolvedRender,
  renderStyledPng,
  resolveRender,
} from "@/lib/qr-api/render";
import {
  type ApiStyle,
  apiStyleToolSchema,
  parseApiStyle,
  themeFieldsOf,
} from "@/lib/qr-api/style";
import { QR_DEFAULTS } from "@/lib/qr-render";
import { SCAN_RANGE_KEYS, type ScanRange } from "@/lib/scan-ranges";
import { codeScanRange, getScanAnalytics } from "@/lib/scans";
import type { ActiveScope } from "@/lib/scope";
import { workspaceLink } from "@/lib/workspace-paths";
import { findWorkspaceById } from "@/lib/workspaces";
import { ValidationError } from "@/types/errors";
import type { ThemeStyles } from "@/types/theme";
import {
  SIGN_IN_SECURITY_SCHEMES,
  sendsApiKey,
  signInRequiredResult,
} from "./auth";
import { cardImageUrl, QR_CARD_META_KEY, QR_CARD_TOOL_META } from "./qr-card";

const FREE_DYNAMIC_CODES = getPlanLimits("free").dynamicCodes;

/** What the server's instructions say about these tools. */
export const CODE_MCP_INSTRUCTIONS = ` When the person wants to change where a code goes after it's printed, or to count its scans, call create_dynamic_code instead: it makes a dynamic code in their QRdx workspace whose short link can be pointed somewhere else later (update_code_destination), and whose scans get_code_stats reports; list_codes finds their codes. These four need the person to sign in to QRdx: the first call asks them to (new accounts sign up there), and a Free account has ${FREE_DYNAMIC_CODES} active dynamic codes.`;

const text = (value: string) => ({ type: "text" as const, text: value });

/** The request a tool call came in on (its Authorization header). */
type ToolContext = { http?: { req?: Request } };
const requestOf = (ctx: ToolContext): Request | null => ctx.http?.req ?? null;

type SignedIn =
  | { ok: true; caller: ApiCaller & { kind: "oauth" | "apiKey" } }
  | { ok: false; result: ToolResult };

type ToolResult = {
  isError?: boolean;
  content: (
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  )[];
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

/** A refusal in plain words, plus the API's error JSON. */
function errorResult(error: unknown): ToolResult | null {
  if (error instanceof HttpError) {
    const body: Record<string, unknown> = {
      code: error.code,
      message: error.message,
      status: error.status,
      ...(error.data ?? {}),
    };
    return {
      isError: true,
      content: [text(error.message), text(JSON.stringify(body))],
      structuredContent: body,
    };
  }
  if (error instanceof ValidationError) {
    const details = Array.isArray(error.details)
      ? (error.details as { path?: unknown; message?: unknown }[])
      : [];
    const message =
      details
        .slice(0, 5)
        .map((detail) =>
          [detail.path, detail.message]
            .filter((part) => typeof part === "string" && part)
            .join(": "),
        )
        .filter(Boolean)
        .join("; ") || error.message;
    const body = { code: "VALIDATION_ERROR", message, status: 400 };
    return {
      isError: true,
      content: [text(message), text(JSON.stringify(body))],
      structuredContent: body,
    };
  }
  return null;
}

/**
 * The caller's workspace, or the answer to give instead: the sign-in
 * challenge for a missing, refused or under-scoped OAuth token, the API's
 * error for an API key (signing in can't fix a key someone pasted).
 */
async function signedIn(
  ctx: ToolContext,
  access: "read" | "write",
): Promise<SignedIn> {
  const req = requestOf(ctx);
  if (!req) return { ok: false, result: signInRequiredResult(null, "missing") };
  try {
    const caller = await optionalBearerCaller(req, access);
    if (!caller) {
      return { ok: false, result: signInRequiredResult(req, "missing") };
    }
    return { ok: true, caller };
  } catch (error) {
    if (!sendsApiKey(req) && error instanceof HttpError) {
      if (error.code === "INSUFFICIENT_SCOPE") {
        return { ok: false, result: signInRequiredResult(req, "scope") };
      }
      if (error.status === 401) {
        return { ok: false, result: signInRequiredResult(req, "invalid") };
      }
    }
    const failed = errorResult(error);
    if (failed) return { ok: false, result: failed };
    throw error;
  }
}

/** The code's page in the dashboard, in the workspace it was made in. */
async function dashboardUrl(scope: ActiveScope, codeId: string) {
  const workspace = scope.organizationId
    ? await findWorkspaceById(scope.userId, scope.organizationId)
    : null;
  return new URL(
    workspaceLink(
      workspace?.slug ?? null,
      `/codes/${encodeURIComponent(codeId)}`,
    ),
    baseUrl,
  ).toString();
}

const DATA_IMAGE = /^data:image\/(?:png|jpeg|webp|gif|svg\+xml)[;,]/;
const FILE_LINK = /^\/api\/files\/([a-z0-9]{20,40})$/;

/** An uploaded logo's id when `value` is this deployment's own file link. */
function fileIdOf(value: string): string | null {
  try {
    const url = new URL(value);
    return url.origin === baseUrl.origin
      ? (FILE_LINK.exec(url.pathname)?.[1] ?? null)
      : null;
  } catch {
    return null;
  }
}

/** The image API URL for a design it can draw from the URL alone. */
function imageUrl(
  data: string,
  style: ApiStyle | null,
  format: "svg" | "png",
): string | null {
  const url = new URL("/api/v1/qr", baseUrl);
  url.searchParams.set("data", data);
  if (format !== "svg") url.searchParams.set("format", format);
  if (style && Object.keys(style).length > 0) {
    url.searchParams.set("style", JSON.stringify(style));
  }
  const href = url.toString();
  return href.length <= 8000 ? cardImageUrl(href) : null;
}

/**
 * The code as it's saved: its short link drawn in its design, and public
 * image URLs when the image API can draw that design (not with an uploaded
 * logo). `given` is the style the caller sent, when there was one.
 */
async function codeImage(
  code: QrCodeView,
  given: ApiStyle | null,
  scope: ActiveScope,
) {
  let render: ResolvedRender;
  let publicStyle: ApiStyle | null | false;
  if (given) {
    render = await resolveRender({
      data: code.shortLink,
      size: QR_DEFAULTS.size,
      style: given,
      scope,
    });
    publicStyle = given.logoFileId ? false : given;
  } else {
    // The workspace's default theme, which createCodes gave it.
    const {
      customLogo,
      art: _art,
      ...fields
    } = (code.style ?? {}) as ThemeStyles & { art?: unknown };
    const parsed =
      Object.keys(fields).length > 0 ? parseApiStyle(fields) : null;
    const style = parsed?.ok ? parsed.style : null;
    render = await resolveRender({
      data: code.shortLink,
      size: QR_DEFAULTS.size,
      ...(style ? { style } : {}),
      scope: null,
    });
    publicStyle = style;
    if (typeof customLogo === "string" && fields.showLogo !== false) {
      const fileId = fileIdOf(customLogo);
      const logo = DATA_IMAGE.test(customLogo)
        ? customLogo
        : fileId
          ? await readLogoDataUrl(scope, fileId).catch(() => null)
          : null;
      if (logo) {
        render = {
          ...render,
          logo,
          logoSource: "file",
          style: { ...render.style, showLogo: true },
        };
      }
      // The image API draws no stored logo: no public URL for it.
      publicStyle = false;
    }
  }
  const png = await renderStyledPng(render);
  return {
    png,
    svgUrl:
      publicStyle === false
        ? null
        : imageUrl(code.shortLink, publicStyle, "svg"),
    pngUrl:
      publicStyle === false
        ? null
        : imageUrl(code.shortLink, publicStyle, "png"),
  };
}

/** A code as the tools describe it: no design JSON. */
function codeSummary(code: QrCodeView) {
  return {
    id: code.id,
    title: code.title,
    shortLink: code.shortLink,
    destinationUrl: code.destinationUrl,
    status: code.status,
    ...(code.heldForReview ? { heldForReview: true } : {}),
    scanCount: code.scanCount,
    lastScannedAt: code.lastScannedAt?.toISOString() ?? null,
    createdAt: code.createdAt.toISOString(),
  };
}

/** What a status means for someone scanning, when it isn't "active". */
function statusNote(code: QrCodeView): string | null {
  if (code.heldForReview) {
    return "QRdx is checking this destination before the link goes live, which usually takes a short while; scans show a holding page until then.";
  }
  if (code.status === "disabled") {
    return "This code is switched off: scans don't reach the destination. The dashboard says why.";
  }
  if (code.status === "archived") {
    return "This code is archived: scans don't reach the destination until it's restored in the dashboard.";
  }
  return null;
}

const createInput = z.object({
  destinationUrl: z
    .string()
    .min(1)
    .max(2048)
    .describe(
      "Where a scan sends people: a full http(s) URL. It can be changed later with update_code_destination without reprinting the code.",
    ),
  title: z
    .string()
    .max(MAX_TITLE_LENGTH)
    .optional()
    .describe(
      `A name for the code in the QRdx dashboard, up to ${MAX_TITLE_LENGTH} characters, such as Spring menu`,
    ),
  style: apiStyleToolSchema
    .optional()
    .describe(
      "The design: the qrdxStyle that design_qr returns (logoIcon and logoFileId included). Left out, the code gets the workspace's default theme.",
    ),
});

const listInput = z.object({
  q: z
    .string()
    .max(200)
    .optional()
    .describe("Words to find in titles, short links and destinations"),
  status: z
    .enum(["active", "archived", "all"])
    .default("active")
    .describe("Active codes (default), archived ones or both"),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).max(100_000).default(0),
});

const codeIdInput = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .describe("The code's id, from create_dynamic_code or list_codes");

const statsInput = z.object({
  id: codeIdInput,
  range: z
    .enum(SCAN_RANGE_KEYS as [ScanRange, ...ScanRange[]])
    .optional()
    .describe(
      "How far back: 7d, 30d (default), 90d, 365d, 1095d or all, within what the plan keeps",
    ),
});

const updateInput = z.object({
  id: codeIdInput,
  destinationUrl: z
    .string()
    .min(1)
    .max(2048)
    .describe("The new destination: a full http(s) URL"),
});

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};
const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const signInMeta = { securitySchemes: SIGN_IN_SECURITY_SCHEMES };

export function registerCodeTools(server: McpServer) {
  server.registerTool(
    "create_dynamic_code",
    {
      title: "Create a dynamic QR code",
      description: `Create a dynamic QR code in the person's QRdx workspace. Use it when they want to change where the code goes after printing it (a menu, a flyer, a product label) or to see how many times it's scanned; for a code that never changes, generate_qr_code or design_qr is enough. The code encodes a short link (qrdx.dev/q/…) that sends scans to destinationUrl. Returns the short link, the code as a PNG with image URLs, and a link to the code in the QRdx dashboard. Needs the person signed in to QRdx (the first call asks them to). Counts against the plan's active dynamic codes (${FREE_DYNAMIC_CODES} on Free); destinations are screened for phishing and malware like every QRdx code.`,
      inputSchema: createInput,
      annotations: { ...writeAnnotations, title: "Create a dynamic QR code" },
      _meta: { ...QR_CARD_TOOL_META, ...signInMeta },
    },
    async (input, ctx) => {
      const auth = await signedIn(ctx, "write");
      if (!auth.ok) return auth.result;
      const { scope } = auth.caller;
      try {
        let given: ApiStyle | null = null;
        let style: ThemeStyles | undefined;
        if (input.style) {
          const parsed = parseApiStyle(input.style);
          if (!parsed.ok) {
            throw new HttpError(
              400,
              "VALIDATION_ERROR",
              parsed.issues
                .slice(0, 5)
                .map((issue) => `${issue.path}: ${issue.message}`)
                .join("; "),
            );
          }
          given = parsed.style;
          // As POST /v1/codes stores it: a logo icon drawn in, an uploaded
          // logo as its file link.
          const logo = await resolveLogo(given, scope, "save");
          style = {
            ...themeFieldsOf(given),
            ...(logo?.saved ? { showLogo: true, customLogo: logo.saved } : {}),
          };
        }
        const parsed = createCodeSchema.safeParse({
          destinationUrl: input.destinationUrl,
          title: input.title,
          ...(style ? { style } : {}),
        });
        if (!parsed.success) {
          throw new ValidationError(
            "Invalid input",
            parsed.error.issues.map((issue) => ({
              path: issue.path.join(".") || "input",
              message: issue.message,
            })),
          );
        }
        await enforceCreateRateLimit(scope.userId);
        const { codes } = await createCodesBatch(scope, [parsed.data], {
          via: "mcp",
        });
        const code = codes[0];
        if (!code) throw new Error("createCodesBatch returned no code");
        const [image, dashboard] = await Promise.all([
          codeImage(code, given, scope),
          dashboardUrl(scope, code.id),
        ]);
        const note = statusNote(code);
        const lines = [
          `Created a dynamic QR code${code.title ? ` "${code.title}"` : ""}. It encodes the short link ${code.shortLink}, which sends scans to ${code.destinationUrl}.`,
          "The destination can be changed later without reprinting (update_code_destination), and scans are counted (get_code_stats).",
          ...(note ? [note] : []),
          `Open it in the QRdx dashboard: ${dashboard}`,
          ...(image.svgUrl
            ? [
                `SVG URL: ${image.svgUrl}`,
                `PNG URL: ${image.pngUrl}`,
                `Markdown: ![QR code](${image.svgUrl})`,
              ]
            : [
                "This design has no public image URL (its logo is stored in the workspace): save the PNG, or download the code from the dashboard.",
              ]),
        ];
        return {
          content: [
            text(lines.join("\n")),
            text(
              JSON.stringify(
                {
                  ...codeSummary(code),
                  dashboardUrl: dashboard,
                  svgUrl: image.svgUrl,
                  pngUrl: image.pngUrl,
                },
                null,
                2,
              ),
            ),
            {
              type: "image" as const,
              data: Buffer.from(image.png).toString("base64"),
              mimeType: "image/png",
            },
          ],
          _meta: {
            [QR_CARD_META_KEY]: {
              encodes: `Dynamic link · ${code.shortLink}`,
              details: [`Goes to ${code.destinationUrl}`, "Scans counted"],
              svg: image.svgUrl,
              png: image.pngUrl,
              editor: dashboard,
              fileName: `qr-code-${code.slug}`,
            },
          },
        };
      } catch (error) {
        const failed = errorResult(error);
        if (failed) return failed;
        throw error;
      }
    },
  );

  server.registerTool(
    "list_codes",
    {
      title: "List dynamic QR codes",
      description:
        "List the dynamic QR codes in the person's QRdx workspace, newest first: id, title, short link, destination, status and scan count. Use it to find a code's id for get_code_stats or update_code_destination, or to answer which codes they have. Needs the person signed in to QRdx.",
      inputSchema: listInput,
      annotations: { ...readAnnotations, title: "List dynamic QR codes" },
      _meta: signInMeta,
    },
    async (input, ctx) => {
      const auth = await signedIn(ctx, "read");
      if (!auth.ok) return auth.result;
      try {
        const { codes, total } = await listCodes(auth.caller.scope, {
          status: input.status as CodeListStatus,
          ...(input.q ? { q: input.q } : {}),
          limit: input.limit,
          offset: input.offset,
        });
        const summary =
          total === 0
            ? input.q
              ? `No codes match "${input.q.slice(0, 100)}".`
              : "No dynamic codes in this workspace yet."
            : `${total} code${total === 1 ? "" : "s"}${input.q ? ` matching "${input.q.slice(0, 100)}"` : ""}; showing ${codes.length} from ${input.offset + 1}.`;
        return {
          content: [
            text(summary),
            text(
              JSON.stringify(
                {
                  total,
                  limit: input.limit,
                  offset: input.offset,
                  codes: codes.map(codeSummary),
                },
                null,
                2,
              ),
            ),
          ],
        };
      } catch (error) {
        const failed = errorResult(error);
        if (failed) return failed;
        throw error;
      }
    },
  );

  server.registerTool(
    "get_code_stats",
    {
      title: "Get a code's scan stats",
      description:
        "Scan statistics for one dynamic QR code: scans and unique visitors in a range (30 days by default), all-time scans, the last scan, the top countries, devices and operating systems, and scans per day. Use it when the person asks how a code is doing or how often it was scanned. Needs the person signed in to QRdx; how far back it goes depends on their plan.",
      inputSchema: statsInput,
      annotations: { ...readAnnotations, title: "Get a code's scan stats" },
      _meta: signInMeta,
    },
    async (input, ctx) => {
      const auth = await signedIn(ctx, "read");
      if (!auth.ok) return auth.result;
      const { scope } = auth.caller;
      try {
        const [code, plan] = await Promise.all([
          getCode(scope, input.id),
          getPlanForScope(scope),
        ]);
        const retentionDays = getPlanLimits(plan).analyticsRetentionDays;
        const { range, days } = await codeScanRange(
          code,
          input.range,
          retentionDays,
        );
        const analytics = await getScanAnalytics(code.id, days);
        const top = <T>(rows: T[]) => rows.slice(0, 5);
        const stats = {
          code: codeSummary(code),
          range,
          from: analytics.from.toISOString(),
          retentionDays: Number.isFinite(retentionDays) ? retentionDays : null,
          scans: analytics.total,
          uniqueVisitors: analytics.unique,
          sources: analytics.sources,
          countries: top(analytics.countries),
          devices: top(analytics.devices),
          operatingSystems: top(analytics.os),
          interval: analytics.interval,
          series: analytics.series,
        };
        const leader = analytics.countries[0];
        const summary = [
          `"${code.title ?? code.shortLink}": ${analytics.total} scan${analytics.total === 1 ? "" : "s"} (${analytics.unique} unique) since ${analytics.from.toISOString().slice(0, 10)}; ${code.scanCount} in all.`,
          ...(code.lastScannedAt
            ? [`Last scanned ${code.lastScannedAt.toISOString()}.`]
            : ["Not scanned yet."]),
          ...(leader?.value
            ? [`Most scans from ${leader.value} (${leader.count}).`]
            : []),
          ...(input.range && input.range !== range
            ? [
                `The plan keeps ${retentionDays} days of scan history, so this covers ${range}.`,
              ]
            : []),
        ].join(" ");
        return {
          content: [text(summary), text(JSON.stringify(stats, null, 2))],
        };
      } catch (error) {
        const failed = errorResult(error);
        if (failed) return failed;
        throw error;
      }
    },
  );

  server.registerTool(
    "update_code_destination",
    {
      title: "Change where a code goes",
      description:
        "Point an existing dynamic QR code at a new destination URL. The printed code stays the same; scans go to the new address from now on. Use it when the person says the link behind a code should change (a new menu, a moved page). The new destination is screened like a new code's. Needs the person signed in to QRdx.",
      inputSchema: updateInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
        title: "Change where a code goes",
      },
      _meta: signInMeta,
    },
    async (input, ctx) => {
      const auth = await signedIn(ctx, "write");
      if (!auth.ok) return auth.result;
      const { scope } = auth.caller;
      try {
        const destination = destinationUrlSchema.safeParse(
          input.destinationUrl,
        );
        if (!destination.success) {
          throw new ValidationError(
            "Invalid input",
            destination.error.issues.map((issue) => ({
              path: "destinationUrl",
              message: issue.message,
            })),
          );
        }
        const before = await getCode(scope, input.id);
        const code = await updateCode(scope, input.id, {
          destinationUrl: destination.data,
        });
        const note = statusNote(code);
        const lines = [
          `${code.shortLink} now sends scans to ${code.destinationUrl} (it went to ${before.destinationUrl}). The printed code doesn't change.`,
          ...(note ? [note] : []),
          `Open it in the QRdx dashboard: ${await dashboardUrl(scope, code.id)}`,
        ];
        return {
          content: [
            text(lines.join("\n")),
            text(JSON.stringify(codeSummary(code), null, 2)),
          ],
        };
      } catch (error) {
        const failed = errorResult(error);
        if (failed) return failed;
        throw error;
      }
    },
  );
}
