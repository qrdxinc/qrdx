// The Markdown copy of an API reference page carries the whole operation
// (lib/agents/llm-openapi.ts): method and path, auth, parameters, request
// body, responses and a curl example, rendered from the OpenAPI document, so
// an agent reading /docs/developers/api/get-code.md sees what the browser's
// <OpenAPIPage /> shows. Checked on a small document here and on the real
// one (packages/docs-assets/openapi.json, written before the tests run).
import { readdirSync } from "node:fs";
import { join } from "node:path";
import openapi from "@repo/docs-assets/openapi.json";
import { describe, expect, it } from "vitest";
import { cleanLlmMarkdown } from "@/lib/agents/llm-markdown";
import {
  findOperation,
  type OpenApiDocument,
  operationMarkdown,
  operationSlug,
} from "@/lib/agents/llm-openapi";

const sample: OpenApiDocument = {
  servers: [{ url: "/api/v1" }, { url: "https://api.example.test/v1" }],
  paths: {
    "/widgets/{id}": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          description: "The widget's `id`",
          schema: { type: "string" },
          example: "wid_1",
        },
      ],
      get: {
        operationId: "getWidget",
        summary: "Get a widget",
        security: [{ apiKey: [] }, { oauth2: ["widgets:read"] }],
        parameters: [
          {
            name: "format",
            in: "query",
            required: false,
            description: "Output format",
            schema: { type: "string", enum: ["json", "png"], default: "json" },
            example: "png",
          },
        ],
        responses: {
          "200": {
            description: "The widget",
            headers: { "X-RateLimit-Limit": { schema: { type: "integer" } } },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WidgetResponse" },
                examples: {
                  widget: {
                    value: { data: { id: "wid_1", size: { width: 3 } } },
                  },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/widgets": {
      post: {
        operationId: "createWidgets",
        summary: "Create widgets",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                anyOf: [
                  { $ref: "#/components/schemas/WidgetInput" },
                  {
                    type: "array",
                    items: { $ref: "#/components/schemas/WidgetInput" },
                    maxItems: 10,
                    description: "Up to 10 at once",
                  },
                ],
              },
              examples: {
                one: { summary: "One widget", value: { name: "Spring" } },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { type: "object" },
                example: { data: { id: "wid_2" } },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      WidgetInput: {
        type: "object",
        description: "A new widget",
        required: ["name"],
        properties: {
          name: { type: "string", maxLength: 100, description: "Its name" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
      WidgetResponse: {
        type: "object",
        required: ["data"],
        properties: {
          data: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string" },
              size: {
                type: "object",
                properties: {
                  width: { type: "integer", minimum: 1, maximum: 8 },
                },
              },
              color: { type: ["string", "null"] },
            },
          },
        },
      },
    },
    responses: {
      NotFound: {
        description: "`NOT_FOUND`: no such widget.",
        content: {
          "application/json": {
            schema: { type: "object" },
            examples: {
              NOT_FOUND: {
                value: { code: "NOT_FOUND", message: "Widget not found" },
              },
            },
          },
        },
      },
    },
  },
};

describe("Markdown of an API operation", () => {
  const get = findOperation(sample, "get-widget");
  const post = findOperation(sample, "create-widgets");
  if (!(get && post)) throw new Error("sample operations not found");
  const getText = operationMarkdown(sample, get);
  const postText = operationMarkdown(sample, post);

  it("finds an operation by the generated page's slug", () => {
    expect(operationSlug("getQrImage")).toBe("get-qr-image");
    expect(get.method).toBe("GET");
    expect(get.path).toBe("/widgets/{id}");
    expect(findOperation(sample, "no-such-page")).toBeNull();
  });

  it("starts with the method, the absolute URL and the auth", () => {
    expect(getText).toContain("## GET /widgets/{id}");
    expect(getText).toContain("`GET https://api.example.test/v1/widgets/{id}`");
    expect(getText).toContain("with the scope `widgets:read`");
    expect(postText).toContain("**Auth:** none.");
  });

  it("lists path and query parameters with type, default and example", () => {
    expect(getText).toContain("### Path parameters");
    expect(getText).toMatch(
      /\| `id` \| string \| Yes \| The widget's `id`\. Example: `wid_1` \|/,
    );
    expect(getText).toContain("### Query parameters");
    expect(getText).toMatch(
      /\| `format` \| "json" \\\| "png" \| No \| Output format\. default `"json"`\. Example: `png` \|/,
    );
  });

  it("flattens response fields and follows $refs", () => {
    expect(getText).toContain("#### 200");
    expect(getText).toContain("Headers: `X-RateLimit-Limit`.");
    expect(getText).toMatch(/\| `data` \| object \| Yes \|/);
    expect(getText).toMatch(/\| `data\.id` \| string \| Yes \|/);
    expect(getText).toMatch(
      /\| `data\.size\.width` \| integer \| No \| 1–8 \|/,
    );
    expect(getText).toMatch(/\| `data\.color` \| string \\\| null \| No \|/);
    expect(getText).toContain('"id": "wid_1"');
  });

  it("describes error responses with one example", () => {
    expect(getText).toContain("#### 404");
    expect(getText).toContain("`NOT_FOUND`: no such widget.");
    expect(getText).toContain('"message": "Widget not found"');
  });

  it("renders a request body with its alternatives and examples", () => {
    expect(postText).toContain("### Request body");
    expect(postText).toContain("`application/json`, required");
    expect(postText).toContain("**WidgetInput**: A new widget");
    expect(postText).toContain("**WidgetInput[]**: Up to 10 at once");
    expect(postText).toMatch(
      /\| `name` \| string \| Yes \| Its name\. up to 100 characters \|/,
    );
    expect(postText).toMatch(/\| `tags` \| string\[\] \| No \|/);
    expect(postText).toContain('```json title="One widget"');
  });

  it("ends with a curl example that fills in the examples", () => {
    expect(getText).toContain(
      'curl "https://api.example.test/v1/widgets/wid_1?format=png" \\\n  -H "Authorization: Bearer $QRDX_API_KEY"',
    );
    expect(postText).toContain(
      'curl -X POST "https://api.example.test/v1/widgets" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"name":"Spring"}\'',
    );
    expect(postText).not.toContain("Authorization");
  });
});

describe("the real API reference", () => {
  const document = openapi as unknown as OpenApiDocument;
  const api = join(import.meta.dirname, "../../content/docs/developers/api");
  const slugs = readdirSync(api)
    .filter((file) => /^[a-z-]+\.mdx$/.test(file) && file !== "index.mdx")
    .map((file) => file.replace(/\.mdx$/, ""));

  it("has an operation for every generated page", () => {
    expect(slugs.length).toBeGreaterThan(20);
    for (const slug of slugs) {
      expect(findOperation(document, slug), slug).not.toBeNull();
    }
  });

  it.each(slugs)("%s renders its operation in full", (slug) => {
    const operation = findOperation(document, slug);
    if (!operation) throw new Error(slug);
    const text = operationMarkdown(document, operation);
    expect(text).toMatch(/^## (GET|POST|PATCH|DELETE) \//);
    expect(text).toContain("https://api.qrdx.dev/v1");
    expect(text).toContain("**Auth:**");
    expect(text).toContain("### Responses");
    expect(text).toContain("### Example");
    expect(text).toContain("```bash");
    // No unresolved references, raw objects or zod's integer bounds leak through.
    expect(text).not.toContain("$ref");
    expect(text).not.toContain("[object Object]");
    expect(text).not.toContain("9007199254740991");
  });

  it("names the scope of a key-authenticated operation and no auth for a keyless one", () => {
    const codes = findOperation(document, "list-codes");
    const image = findOperation(document, "get-qr-image");
    if (!(codes && image)) throw new Error("operations missing");
    expect(operationMarkdown(document, codes)).toContain(
      "with the scope `codes:read` or `codes:write`",
    );
    expect(operationMarkdown(document, image)).toContain("**Auth:** none.");
  });
});

describe("MDX comments in the Markdown", () => {
  it("drops editor notes and visual markers but keeps code", () => {
    const text = cleanLlmMarkdown(
      [
        "Intro.",
        "",
        "{/* Generated by bun run openapi:generate. Edit lib\\/openapi. */}",
        "",
        "{/* shot: api-key-dialog | the Create key form | Settings, API keys & apps */}",
        "",
        "Body text.",
        "",
        "```mdx",
        "{/* kept: this is code */}",
        "```",
      ].join("\n"),
    );
    expect(text).toBe(
      "Intro.\n\nBody text.\n\n```mdx\n{/* kept: this is code */}\n```\n",
    );
  });
});
