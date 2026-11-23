import "server-only";

import {
  type JSONValue,
  type ModelMessage,
  NoObjectGeneratedError,
  Output,
  parsePartialJson,
  streamText,
  type Tool,
  tool,
  type UIMessageStreamWriter,
} from "ai";
import type { ScanGrade } from "qrdx";
import { customFrameSchema } from "qrdx/types";
import z from "zod";
import { textProviderOptions } from "@/lib/ai/models";
import { languageModel } from "@/lib/ai/providers";
import {
  type ContentInput,
  type ContentIssue,
  contentInputSchema,
  describeContent,
  validateDesignContent,
} from "@/lib/qr-design/content";
import { isDrawableLogo, resolveLogo } from "@/lib/qr-design/logo";
import {
  isOfficialFrame,
  OFFICIAL_FRAME_COUNT,
  type OfficialFrameMatch,
  searchOfficialFrames,
} from "@/lib/qr-design/official-frames";
import {
  type DesignAttempt,
  type FailedCheck,
  isGreat,
  runDesignLoop,
  type ScoreFn,
} from "@/lib/qr-design/repair";
import { DesignTooLongError } from "@/lib/qr-design/score";
import {
  type DesignerOutput,
  type DesignStyle,
  designerOutputSchema,
  designStyleSchema,
  isLogoChoice,
  type StyleSources,
  sanitizeDesignStyle,
  toDesignerView,
  toThemeStyles,
  withoutDesignerLooks,
} from "@/lib/qr-design/style";
import { logError } from "@/lib/shared";
import type { ChatMessage } from "@/types/ai";
import type { QRContentConfig } from "@/types/qr-content";
import type { ThemeStyles } from "@/types/theme";
// Community: publish_to_community (./community.ts, ./publish-tool.ts)
import type { CommunityPublishStore } from "./community";
import type { EditorBase } from "./editor-context";
// Pictures and missing content: browser-side tools (picture-tools.ts)
import { PICTURE_TOOLS, type PictureTools } from "./picture-tools";
import { QR_DESIGN_SYSTEM } from "./prompts";
// Community: publish_to_community
import {
  type PublishToCommunityTool,
  publishToCommunityApproval,
  publishToCommunityTool,
} from "./publish-tool";
import {
  type SaveTemplateResult,
  TEMPLATE_NAME_MAX_LENGTH,
  type TemplateStore,
} from "./templates";

// The chat agent's tools. design_qr and check_scan_score only read; the two
// that change something (apply_design: the user's editor, save_template:
// their account) run only after the user approves them in the chat
// (toolApproval in the route). ask_user has no execute: the browser shows
// the question and sends the answer back as its output.

// ── Shapes shared with the browser ─────────────────────────────────────────

export interface DesignContent {
  config: QRContentConfig;
  /** "WiFi · Cafe Guest" */
  summary: string;
}

/** A logo the browser applies: concrete fields, or the code's current one. */
export type DesignLogo = { showLogo: boolean; customLogo?: string } | "keep";

export interface DesignRecord {
  designId: string;
  /** New content, or null to keep the editor's */
  content: DesignContent | null;
  /** The payload the design was scored with */
  value: string;
  /** True when the editor had no content and a sample link was scored */
  scoredWithSample: boolean;
  style: DesignStyle;
  /** The style as the editor takes it, logo image excluded (see `logo`) */
  themeStyles: ThemeStyles;
  logo: DesignLogo;
  score: number;
  grade: ScanGrade;
  /** Checks the result still fails (empty for most Great designs) */
  failed: FailedCheck[];
  repairs: number;
  /** Repairs couldn't reach Great: this is the classic fallback */
  fellBack: boolean;
  /** What was changed after the first candidate to reach the score */
  changes: string[];
  attempts: Pick<DesignAttempt, "score" | "grade" | "by" | "changes">[];
  /** The editor had Logo QR / Image QR art, which this design replaces */
  replacesArt: boolean;
}

export type DesignQrOutput =
  | ({ ok: true } & DesignRecord)
  | { ok: false; contentType?: string; issues: ContentIssue[] };

export type CheckScanScoreOutput = {
  score: number;
  grade: ScanGrade;
  failed: FailedCheck[];
  scoredWithSample: boolean;
};

export type ApplyDesignOutput =
  | ({ ok: true; followups: string[] } & Pick<
      DesignRecord,
      | "designId"
      | "content"
      | "themeStyles"
      | "logo"
      | "score"
      | "grade"
      | "changes"
    >)
  | { ok: false; error: string };

export type SaveTemplateOutput = SaveTemplateResult & {
  style?: ThemeStyles;
};

// ── Community (publish_to_community) ──
export type { PublishToCommunityOutput } from "./publish-tool";
// ── end Community ──

export interface AskUserOutput {
  answer: string;
}

export interface FindFramesOutput {
  query: string;
  frames: OfficialFrameMatch[];
}

/** Progress of a design_qr call, streamed to the chat while it runs. */
export type DesignProgress =
  | { stage: "designing"; style?: Partial<DesignStyle> }
  | {
      stage: "scored";
      index: number;
      score: number;
      grade: ScanGrade;
      by: DesignAttempt["by"];
      changes: string[];
    };

// ── Context ────────────────────────────────────────────────────────────────

/** Designs this conversation made, by id (from history and this request). */
export class DesignRegistry {
  private readonly designs = new Map<string, DesignRecord>();

  add(design: DesignRecord) {
    this.designs.set(design.designId, design);
  }

  get(designId: string): DesignRecord | undefined {
    return this.designs.get(designId);
  }

  /**
   * Designs from earlier design_qr results in the chat history. History
   * comes from the browser, so each is re-validated before it is used.
   * `sources` draws their official or kept frames.
   */
  static fromMessages(
    messages: ChatMessage[],
    sources: StyleSources = {},
  ): DesignRegistry {
    const registry = new DesignRegistry();
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (part.type !== "tool-design_qr" || part.state !== "output-available")
          continue;
        const output = part.output as DesignQrOutput | undefined;
        if (!output?.ok) continue;
        const style = designStyleSchema.safeParse(output.style);
        if (!style.success) continue;
        const content = output.content
          ? validateDesignContent(
              output.content.config as unknown as ContentInput,
            )
          : null;
        if (content && !content.ok) continue;
        // A design that keeps the user's own frame keeps the one it was
        // drawn and scored with, even if the editor's frame changed since
        const drawn =
          style.data.frame.style === "keep"
            ? customFrameSchema.safeParse(output.themeStyles?.frame)
            : null;
        registry.add({
          ...output,
          designId: part.toolCallId,
          style: style.data,
          themeStyles: toThemeStyles(
            style.data,
            drawn?.success ? { ...sources, ownFrame: drawn.data } : sources,
          ),
          content: content?.ok
            ? {
                config: content.content,
                summary: describeContent(content.content),
              }
            : null,
        });
      }
    }
    return registry;
  }
}

// A type, not an interface: tool contexts must be assignable to a record.
export type AgentContext = {
  userId: string;
  base: EditorBase;
  designs: DesignRegistry;
  writer: UIMessageStreamWriter<ChatMessage>;
  templates: TemplateStore;
  /** Community: what the person published from a chat draft */
  community: CommunityPublishStore;
  score: ScoreFn;
  /** design_qr calls in this request (MAX_DESIGNS_PER_REQUEST) */
  designCalls: { count: number };
};

export const MAX_DESIGNS_PER_REQUEST = 3;

// ── The designer model ─────────────────────────────────────────────────────

/** The conversation as plain text and images, for the designer model. */
function conversationForDesigner(messages: ModelMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      out.push(message);
    } else if (message.role === "assistant") {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content
              .flatMap((part) => (part.type === "text" ? [part.text] : []))
              .join("\n");
      if (text.trim()) out.push({ role: "assistant", content: text });
    }
  }
  return out;
}

interface DesignerRequest {
  messages: ModelMessage[];
  brief: string;
  base: EditorBase;
  startFrom: "current" | "new";
  contentLabel: string;
  /** An official frame the design must use (find_frames) */
  frameId?: string;
  /** Looks the user named (design_qr's looks), so none is missed */
  asked?: AskedLook[];
  abortSignal?: AbortSignal;
  onPartial?: (style: Partial<DesignStyle>) => void;
  revision?: { style: DesignStyle; score: number; failed: FailedCheck[] };
}

/** `style` with a logo it can draw: a brand slug that doesn't exist falls back. */
function withDrawableLogo(
  style: DesignStyle,
  fallback: DesignStyle,
): DesignStyle {
  if (isLogoChoice(style.logo) || isDrawableLogo(style.logo)) return style;
  const logo =
    isLogoChoice(fallback.logo) || isDrawableLogo(fallback.logo)
      ? fallback.logo
      : "none";
  return { ...style, logo };
}

/**
 * Looks the chat model names for the designer. Gemini drops one now and
 * then when a brief asks for several things; each of these has a sensible
 * default, so a missed one is added rather than lost.
 */
export const ASKED_LOOKS = [
  "halo",
  "shadow",
  "rounded_corners",
  "smaller_dots",
  "circle_outline",
  "heart_outline",
  "eyes_continue_gradient",
] as const;
type AskedLook = (typeof ASKED_LOOKS)[number];

const ASKED_LOOK_NAMES: Record<AskedLook, string> = {
  halo: "a halo",
  shadow: "a shadow",
  rounded_corners: "rounded background corners",
  smaller_dots: "smaller dots",
  circle_outline: "a circle outline",
  heart_outline: "a heart outline",
  eyes_continue_gradient:
    'the eyes continuing the gradient (eyeGradient "code")',
};

/** `style` with every asked-for look it left out, at the engine's defaults. */
function withAskedLooks(
  style: DesignStyle,
  asked: AskedLook[] | undefined,
): DesignStyle {
  if (!asked?.length) return style;
  const next = { ...style };
  for (const look of asked) {
    if (look === "halo" && !next.halo) next.halo = {};
    if (look === "shadow" && !next.shadow) next.shadow = {};
    if (look === "rounded_corners" && !next.bgRadius) {
      next.bgRadius = 0.08;
      next.margin = Math.max(next.margin, 2);
    }
    if (look === "smaller_dots" && next.moduleScale === undefined) {
      next.moduleScale = 0.9;
    }
    if (look === "circle_outline" && next.shape !== "circle") {
      next.shape = "circle";
    }
    if (look === "heart_outline" && next.shape !== "heart") {
      next.shape = "heart";
    }
    if (look === "eyes_continue_gradient") next.eyeGradient = "code";
  }
  return next;
}

/** `style` on the official frame `frameId`, keeping its labels and colors. */
function onOfficialFrame(style: DesignStyle, frameId: string | undefined) {
  if (!frameId || !isOfficialFrame(frameId)) return style;
  if (style.frame.style === "official" && style.frame.id === frameId) {
    return style;
  }
  const { style: _style, id: _id, ...labels } = style.frame;
  return {
    ...style,
    // The key order sanitizeDesignStyle writes, so equal frames compare equal
    frame: { style: "official" as const, id: frameId, ...labels },
  };
}

async function designStyle(request: DesignerRequest): Promise<DesignStyle> {
  const { base, revision } = request;
  const lines = revision
    ? [
        "Revise this QR style so it scans better.",
        `Candidate: ${JSON.stringify(toDesignerView(revision.style))}`,
        `Its scan score is ${revision.score}; Great starts at 85. Failed checks:`,
        ...revision.failed.map(
          (check) =>
            `- ${check.message}${check.fix ? ` (fix: ${check.fix})` : ""}`,
        ),
        "Fix these while keeping the look: change as little as possible and keep every explicit choice the user made unless it causes the failure. Return the complete style.",
      ]
    : [
        `Design the QR style. Brief from the assistant: ${request.brief}`,
        `Content: ${request.contentLabel}.`,
        request.frameId
          ? `Use the official frame ${request.frameId}: frame style "official", id "${request.frameId}".`
          : "",
        request.asked?.length
          ? `The user asked for ${request.asked.map((look) => ASKED_LOOK_NAMES[look]).join(", ")}: the style must have each.`
          : "",
        request.startFrom === "current"
          ? `Start from the current style and change only what is asked: ${JSON.stringify(toDesignerView(base.style))}`
          : `This is a new design. The current style, for reference only: ${JSON.stringify(toDesignerView(base.style))}`,
        `The code ${base.hasLogo ? "shows a logo now (logo keep keeps it)" : "has no logo now"}.`,
        "Before you answer, check that the style has every choice the brief names. Return the complete style.",
      ].filter(Boolean);
  // A complete style is a few hundred tokens. The cap and the timeout stop a
  // runaway generation (the model has looped inside a string field before).
  const timeout = AbortSignal.timeout(DESIGNER_TIMEOUT_MS);
  const { partialOutputStream, output } = streamText({
    abortSignal: request.abortSignal
      ? AbortSignal.any([request.abortSignal, timeout])
      : timeout,
    maxOutputTokens: DESIGNER_MAX_OUTPUT_TOKENS,
    model: languageModel("qr-theme-generation"),
    providerOptions: textProviderOptions("qr-theme-generation"),
    instructions: QR_DESIGN_SYSTEM,
    output: Output.object({ schema: designerOutputSchema }),
    messages: [
      ...conversationForDesigner(request.messages),
      { role: "user", content: lines.join("\n") },
    ],
  });
  if (request.onPartial) {
    let sent = 0;
    for await (const partial of partialOutputStream) {
      // A preview, not a transcript: a few updates a second, strings clipped.
      if (Date.now() - sent < PARTIAL_INTERVAL_MS) continue;
      sent = Date.now();
      request.onPartial(clipPartial(partial as Partial<DesignStyle>));
    }
  }
  // Colors, labels and looks made valid, then checked against the strict
  // schema. A look the answer leaves out stays as it was when changing a
  // code or revising a candidate; a new design starts without it.
  const fallback = revision?.style ?? base.style;
  const inherit =
    revision?.style ??
    (request.startFrom === "current" ? base.style : undefined);
  const style = sanitizeDesignStyle(await answerOf(output), fallback, {
    ...(inherit ? { inherit } : {}),
    isOfficialFrame,
    hasOwnFrame: Boolean(base.sources.ownFrame),
  });
  // A first candidate gets every look the user named; a revision may drop
  // one to fix a scan.
  const complete = revision ? style : withAskedLooks(style, request.asked);
  return designStyleSchema.parse(
    onOfficialFrame(withDrawableLogo(complete, fallback), request.frameId),
  );
}

/**
 * The designer's answer. One it cut off at the token cap (it has looped
 * inside a color, writing "#FFFFFF+M10243…" until it ran out) is read as
 * far as it goes: sanitizeDesignStyle keeps the color it meant and takes
 * what never came from the style it started from.
 */
async function answerOf(
  output: PromiseLike<DesignerOutput>,
): Promise<DesignerOutput> {
  try {
    return await output;
  } catch (error) {
    // Only an answer cut off at the cap: a finished one that isn't a style
    // is asked again (initialStyle)
    if (
      !(
        NoObjectGeneratedError.isInstance(error) &&
        error.finishReason === "length" &&
        error.text
      )
    ) {
      throw error;
    }
    const { value } = await parsePartialJson(error.text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw error;
    }
    return value as DesignerOutput;
  }
}

const DESIGNER_MAX_OUTPUT_TOKENS = 1500;
const DESIGNER_TIMEOUT_MS = 30_000;
const PARTIAL_INTERVAL_MS = 250;

/**
 * Strings in a partial style cut to the longest valid value, without the
 * looks (their numbers are still the designer's percents).
 */
function clipPartial(partial: Partial<DesignStyle>): Partial<DesignStyle> {
  const core = withoutDesignerLooks(partial);
  return JSON.parse(
    JSON.stringify(core, (_key, value) =>
      typeof value === "string" ? value.slice(0, 40) : value,
    ),
  ) as Partial<DesignStyle>;
}

/** The first candidate, asked twice if the first answer is unusable. */
async function initialStyle(request: DesignerRequest): Promise<DesignStyle> {
  try {
    return await designStyle(request);
  } catch (error) {
    if (request.abortSignal?.aborted) throw error;
    return await designStyle({ ...request, onPartial: undefined });
  }
}

// ── Tools ──────────────────────────────────────────────────────────────────

const designQrInput = z.object({
  brief: z
    .string()
    .describe(
      "The look in a sentence or two, with every explicit choice the user made",
    ),
  start_from: z
    .enum(["current", "new"])
    .describe(
      "current: change the code in the editor, keeping what wasn't asked about. new: a fresh design.",
    ),
  content: contentInputSchema
    .optional()
    .describe(
      'New content for the code, only with details the user gave, as one object with its own type, e.g. { type: "wifi", ssid, password, encryption }. Leave out to keep the editor\'s content.',
    ),
  frame_id: z
    .string()
    .max(80)
    .optional()
    .describe(
      "An official frame's id from find_frames, when the design should use it",
    ),
  looks: z
    .array(z.enum(ASKED_LOOKS))
    .max(ASKED_LOOKS.length)
    .optional()
    .describe(
      "The looks the user asked for by name in this request, so none is missed (also name them in the brief)",
    ),
});

const findFramesInput = z.object({
  query: z
    .string()
    .max(200)
    .describe(
      "What the frame is for, in a few English words: 'coffee shop', 'diwali', 'wifi', 'wedding', 'leave a review'",
    ),
});

const applyDesignInput = z.object({
  design_id: z.string().describe("The designId from design_qr"),
  summary: z
    .string()
    .describe(
      "One short sentence describing the change, for the approval card",
    ),
  followups: z
    .array(z.string())
    .optional()
    .describe(
      "Up to 3 short next steps the user might want, e.g. 'Make it darker', 'Add a frame'",
    ),
});

const saveTemplateInput = z.object({
  name: z
    .string()
    .describe(`Template name, at most ${TEMPLATE_NAME_MAX_LENGTH} characters`),
  design_id: z
    .string()
    .optional()
    .describe("A designId from design_qr; leave out to save the editor's code"),
});

const askUserInput = z.object({
  question: z.string().describe("One short question"),
  options: z
    .array(z.string())
    .describe("2 to 5 short answers, most likely first"),
  allow_other: z
    .boolean()
    .optional()
    .describe("Let the user type their own answer (default true)"),
});

const agentContextSchema = z.custom<AgentContext>();

// Annotated because ai 7's inferred tool types name @ai-sdk/provider types,
// which apps/app doesn't depend on directly.
export type QRAgentTools = {
  design_qr: Tool<z.infer<typeof designQrInput>, DesignQrOutput, AgentContext>;
  check_scan_score: Tool<
    Record<string, never>,
    CheckScanScoreOutput,
    AgentContext
  >;
  ask_user: Tool<z.infer<typeof askUserInput>, AskUserOutput>;
  find_frames: Tool<
    z.infer<typeof findFramesInput>,
    FindFramesOutput,
    AgentContext
  >;
  apply_design: Tool<
    z.infer<typeof applyDesignInput>,
    ApplyDesignOutput,
    AgentContext
  >;
  save_template: Tool<
    z.infer<typeof saveTemplateInput>,
    SaveTemplateOutput,
    AgentContext
  >;
  // ── Community ──
  publish_to_community: PublishToCommunityTool;
} & PictureTools;

/** What the model reads back from a design: no logo images or attempts. */
function designForModel(output: DesignQrOutput) {
  if (!output.ok) return output;
  return {
    designId: output.designId,
    content: output.content?.summary ?? "unchanged",
    scoredWithSample: output.scoredWithSample,
    score: output.score,
    grade: output.grade,
    repairs: output.repairs,
    fellBack: output.fellBack,
    changes: output.changes,
    stillFailing: output.failed.map((check) => check.message),
    style: output.style,
  };
}

export const QR_AGENT_TOOLS: QRAgentTools = {
  design_qr: tool({
    description:
      "Design a QR code (content and style) and check its scan score, repairing it until it is Great. Returns the design, its score and what was changed to reach it.",
    inputSchema: designQrInput,
    contextSchema: agentContextSchema,
    toModelOutput: ({ output }) => ({
      type: "json",
      value: designForModel(output) as unknown as JSONValue,
    }),
    execute: async (
      input,
      { context, messages, abortSignal, toolCallId },
    ): Promise<DesignQrOutput> => {
      const { base, writer } = context;
      let content: DesignContent | null = null;
      let value = base.value;
      let scoredWithSample = base.valueIsSample;
      if (input.content) {
        const checked = validateDesignContent(input.content);
        if (!checked.ok) {
          return {
            ok: false,
            contentType: checked.type,
            issues: checked.issues,
          };
        }
        content = {
          config: checked.content,
          summary: describeContent(checked.content),
        };
        value = checked.value;
        scoredWithSample = false;
      }

      // Checked before it counts as a design
      const frameId = input.frame_id?.trim().toLowerCase();
      if (frameId && !isOfficialFrame(frameId)) {
        return {
          ok: false,
          issues: [
            {
              message: `There's no official frame "${frameId.slice(0, 80)}". Call find_frames and use an id it returns.`,
            },
          ],
        };
      }

      // A model that keeps retrying a failing design would loop to the step
      // limit; three designs per request is plenty for a repair or a retry.
      context.designCalls.count++;
      if (context.designCalls.count > MAX_DESIGNS_PER_REQUEST) {
        return {
          ok: false,
          issues: [
            {
              message:
                "Too many designs in one go. Tell the user what happened and let them try again.",
            },
          ],
        };
      }

      const progress = (data: DesignProgress) =>
        writer.write({
          type: "data-design-progress",
          id: toolCallId,
          data,
          transient: true,
        });
      progress({ stage: "designing" });

      const request = {
        messages,
        brief: input.brief,
        base,
        startFrom: input.start_from,
        contentLabel: content?.summary.split(" · ")[0] ?? base.contentType,
        ...(frameId ? { frameId } : {}),
        ...(input.looks?.length ? { asked: [...new Set(input.looks)] } : {}),
        abortSignal,
      };
      try {
        const initial = await initialStyle({
          ...request,
          onPartial: (style) => progress({ stage: "designing", style }),
        });
        const result = await runDesignLoop({
          value,
          initial,
          hasLogo: base.hasLogo,
          sources: base.sources,
          score: context.score,
          revise: (style, failed, score) =>
            designStyle({ ...request, revision: { style, score, failed } }),
          onAttempt: (attempt, index) =>
            progress({
              stage: "scored",
              index,
              score: attempt.score,
              grade: attempt.grade,
              by: attempt.by,
              changes: attempt.changes,
            }),
        });
        const record: DesignRecord = {
          designId: toolCallId,
          content,
          value,
          scoredWithSample,
          style: result.style,
          themeStyles: toThemeStyles(result.style, base.sources),
          logo: resolveLogo(result.style.logo),
          score: result.score,
          grade: result.grade,
          failed: result.checks
            .filter((check) => !check.passed)
            .map(({ id, message, fix }) => ({
              id,
              message,
              ...(fix ? { fix } : {}),
            })),
          repairs: result.repairs,
          fellBack: result.fellBack,
          changes: result.changes,
          attempts: result.attempts.map(({ score, grade, by, changes }) => ({
            score,
            grade,
            by,
            changes,
          })),
          replacesArt: base.hasArt,
        };
        context.designs.add(record);
        return { ok: true, ...record };
      } catch (error) {
        if (error instanceof DesignTooLongError) {
          return { ok: false, issues: [{ message: error.message }] };
        }
        if (abortSignal?.aborted) throw error;
        // Loud on the server; a clear, final answer for the model.
        logError(error as Error, { tool: "design_qr" });
        return {
          ok: false,
          issues: [
            {
              message:
                "The designer couldn't produce a style. Don't retry; tell the user it failed and to try again.",
            },
          ],
        };
      }
    },
  }),

  check_scan_score: tool({
    description:
      "Check the scan score of the code in the editor now, without changing it.",
    inputSchema: z.object({}),
    contextSchema: agentContextSchema,
    execute: async (_input, { context }): Promise<CheckScanScoreOutput> => {
      const { base } = context;
      const styles = { ...base.rawStyle };
      const result = await context.score(base.value, styles);
      return {
        score: result.score,
        grade: result.grade,
        failed: result.checks
          .filter((check) => !check.passed)
          .map(({ id, message, fix }) => ({
            id,
            message,
            ...(fix ? { fix } : {}),
          })),
        scoredWithSample: base.valueIsSample,
      };
    },
  }),

  ask_user: tool({
    description:
      "Ask the user one short question with 2 to 5 short options when something required is missing or unclear. The run pauses until they answer.",
    inputSchema: askUserInput,
    outputSchema: z.object({ answer: z.string() }),
  }),

  find_frames: tool({
    description: `Search QRdx's ${OFFICIAL_FRAME_COUNT} official frames (call-to-action shapes, holidays and seasons, food and drink, shops, beauty, events, places, real estate, cars, health, sports, business, nonprofits, everyday objects that hold the code and playful scenes). Returns up to 8, best first, with each one's id, name, collection and own label texts. Pass the chosen id to design_qr as frame_id.`,
    inputSchema: findFramesInput,
    contextSchema: agentContextSchema,
    execute: async ({ query }, { context }): Promise<FindFramesOutput> => ({
      query,
      frames: searchOfficialFrames(query, {
        contentType: context.base.contentType,
      }),
    }),
  }),

  apply_design: tool({
    description:
      "Put a design from design_qr in the user's editor (its content and style). The user approves or rejects it first. Call it after telling the user the score.",
    inputSchema: applyDesignInput,
    contextSchema: agentContextSchema,
    // The model gets the outcome, not the style (a frame of the user's own
    // can be their uploaded artwork) or the content's values
    toModelOutput: ({ output }) => ({
      type: "json",
      value: (output.ok
        ? {
            ok: true,
            designId: output.designId,
            content: output.content?.summary ?? "unchanged",
            score: output.score,
            grade: output.grade,
            changes: output.changes,
            followups: output.followups,
          }
        : output) as unknown as JSONValue,
    }),
    execute: async (input, { context }): Promise<ApplyDesignOutput> => {
      const design = context.designs.get(input.design_id);
      if (!design) {
        return {
          ok: false,
          error: "No design with that id. Call design_qr first.",
        };
      }
      return {
        ok: true,
        designId: design.designId,
        content: design.content,
        themeStyles: design.themeStyles,
        logo: design.logo,
        score: design.score,
        grade: design.grade,
        changes: design.changes,
        followups: (input.followups ?? [])
          .map((followup) => followup.trim())
          .filter(Boolean)
          .slice(0, 3),
      };
    },
  }),

  save_template: tool({
    description:
      "Save a look (style, frame and its text, and logo, no content) to the user's account as a reusable template. The user approves first.",
    inputSchema: saveTemplateInput,
    contextSchema: agentContextSchema,
    // The outcome only: the saved style stays out of the model's context
    toModelOutput: ({ output }) => {
      const { style: _style, ...outcome } = output;
      return { type: "json", value: outcome as unknown as JSONValue };
    },
    execute: async (input, { context }): Promise<SaveTemplateOutput> => {
      const name = input.name.trim().slice(0, TEMPLATE_NAME_MAX_LENGTH);
      const design = input.design_id
        ? context.designs.get(input.design_id)
        : undefined;
      if (input.design_id && !design) {
        return {
          ok: false,
          code: "FAILED",
          message: "No design with that id.",
        };
      }
      const style = templateStyle(context.base, design);
      const result = await context.templates.save(context.userId, {
        name: name || "AI template",
        style,
      });
      return { ...result, style };
    },
  }),

  // use_image and request_content: answered in the browser (picture-tools.ts)
  ...PICTURE_TOOLS,

  // ── Community: writes nothing, see ./publish-tool.ts ──
  publish_to_community: publishToCommunityTool,
};

/** The ThemeStyles a template saves: the look with its logo, no content. */
export function templateStyle(
  base: EditorBase,
  design: DesignRecord | undefined,
): ThemeStyles {
  if (!design) {
    return {
      ...base.rawStyle,
      ...(base.hasLogo && base.customLogo
        ? { customLogo: base.customLogo }
        : {}),
    };
  }
  const logo =
    design.logo === "keep"
      ? {
          showLogo: base.hasLogo,
          ...(base.hasLogo && base.customLogo
            ? { customLogo: base.customLogo }
            : {}),
        }
      : design.logo;
  return { ...design.themeStyles, ...logo };
}

/**
 * Approval rules: the two writes wait for the user. A design below Great is
 * refused automatically (the model is told to repair it first), and so is a
 * save the plan's template limit wouldn't allow, with the limit message.
 */
export function agentToolApproval() {
  return {
    apply_design: async (
      input: z.infer<typeof applyDesignInput>,
      { toolContext }: { toolContext: AgentContext },
    ) => {
      const design = toolContext.designs.get(input.design_id);
      if (!design) {
        return {
          type: "denied" as const,
          reason: "No design with that id. Call design_qr first.",
        };
      }
      // The fallback is the best the content allows (very long content).
      if (!isGreat(design) && !design.fellBack) {
        return {
          type: "denied" as const,
          reason: `Its scan score is ${design.score}, below Great. Repair it with design_qr first.`,
        };
      }
      return "user-approval" as const;
    },
    save_template: async (
      _input: z.infer<typeof saveTemplateInput>,
      { toolContext }: { toolContext: AgentContext },
    ) => {
      const quota = await toolContext.templates.quota(toolContext.userId);
      return quota.allowed
        ? ("user-approval" as const)
        : { type: "denied" as const, reason: quota.message };
    },
    // ── Community ──
    publish_to_community: publishToCommunityApproval,
  };
}
