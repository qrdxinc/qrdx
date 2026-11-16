import {
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";
import type { NextRequest } from "next/server";
import { textProviderOptions } from "@/lib/ai/models";
import { languageModel } from "@/lib/ai/providers";
import { streamErrorMessage } from "@/lib/ai/stream-error-message";
import { DOCS_CHAT } from "@/lib/docs-chat/config";
import {
  assertDocsChatOn,
  docsChatRequestSchema,
  enforceDocsChatLimits,
} from "@/lib/docs-chat/guards";
import { docsChatSystemPrompt } from "@/lib/docs-chat/prompt";
import { docsLang } from "@/lib/docs-chat/retrieval";
import { docsRetriever } from "@/lib/docs-chat/server";
import { docsChatTools } from "@/lib/docs-chat/tools";
import { handleError } from "@/lib/error-response";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";
import { logError } from "@/lib/shared";

// The docs assistant ("Ask AI" in the docs, apps/docs/components/chat): a
// reader asks a question on a docs page and gets a short answer grounded in
// the docs, with links to the pages used. The model (lib/ai/models.ts
// "docs-chat") must search the docs first and read the pages it answers
// from (lib/docs-chat/tools.ts); it reads them from the docs site itself
// (lib/docs-chat/retrieval.ts). Anyone can ask, signed in or not, within
// the limits in lib/docs-chat/guards.ts. Nothing is stored: no database
// writes, no per-user AI quota; the browser keeps the conversation for the
// visit only.

// A search, up to three page reads and the answer, through the gateway.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    assertDocsChatOn();
    await enforceDocsChatLimits(req);
    const body = parseWithSchema(
      docsChatRequestSchema,
      await readJsonBody(req, DOCS_CHAT.maxBodyBytes),
    );
    const lang = docsLang(body.lang);
    const tools = docsChatTools(docsRetriever(), lang);

    const result = streamText({
      abortSignal: req.signal,
      model: languageModel("docs-chat"),
      providerOptions: textProviderOptions("docs-chat"),
      instructions: docsChatSystemPrompt({ lang, page: body.page }),
      messages: body.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      tools,
      // The first step is always a search: the answer must come from the docs.
      prepareStep: ({ stepNumber }) =>
        stepNumber === 0
          ? { toolChoice: { type: "tool", toolName: "search_docs" } }
          : undefined,
      stopWhen: isStepCount(DOCS_CHAT.maxSteps),
      maxOutputTokens: DOCS_CHAT.maxOutputTokens,
      onError: ({ error }) => {
        logError(error as Error, { route: "/api/docs-chat" });
      },
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        tools,
        onError: streamErrorMessage,
      }),
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "ResponseAborted")
    ) {
      return new Response("Request aborted by user", { status: 499 });
    }
    return handleError(error, { route: "/api/docs-chat" });
  }
}
