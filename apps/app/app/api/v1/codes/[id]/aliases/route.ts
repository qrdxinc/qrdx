import type { NextRequest } from "next/server";
import { codeIdSchema } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { withApiUsage } from "@/lib/analytics/usage";
import { withApiQuotaHeaders } from "@/lib/api-quota";
import { addCodeAlias, readCodeAliases } from "@/lib/code-path-aliases";
import { handleError } from "@/lib/error-response";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";
import { pathAliasError, serializePathAlias } from "../../_lib/aliases";
import { assertJson, NO_STORE, resolveApiScope } from "../../_lib/api";
import { addPathAliasSchema } from "../../_lib/schemas";

type Context = { params: Promise<{ id: string }> };

// A path, or one old link.
const MAX_BODY_BYTES = 16 * 1024;

/** The code's path aliases on its custom domain, oldest first. */
const handleGET = withApiQuotaHeaders(
  async (req: NextRequest, { params }: Context) => {
    try {
      const scope = await resolveApiScope(req, "read");
      const id = parseWithSchema(codeIdSchema, (await params).id);
      const result = await readCodeAliases(scope, id);
      if (!result.ok) throw pathAliasError(result);
      const { domain, aliases } = result.value;
      return Response.json(
        { data: aliases.map((alias) => serializePathAlias(alias, domain)) },
        { headers: NO_STORE },
      );
    } catch (error) {
      return handleError(error, { route: "GET /api/v1/codes/[id]/aliases" });
    }
  },
);

/**
 * Adds an old path on the code's domain, with the edit dialog's rules: 201
 * when it's new, 200 with the alias the code already had at that path.
 */
const handlePOST = withApiQuotaHeaders(
  async (req: NextRequest, { params }: Context) => {
    try {
      const scope = await resolveApiScope(req, "write");
      assertJson(req);
      const id = parseWithSchema(codeIdSchema, (await params).id);
      const { path } = parseWithSchema(
        addPathAliasSchema,
        await readJsonBody(req, MAX_BODY_BYTES),
      );
      const result = await addCodeAlias(scope, id, path);
      if (!result.ok) throw pathAliasError(result);
      const { domain, alias, created } = result.value;
      return Response.json(
        { data: serializePathAlias(alias, domain) },
        { status: created ? 201 : 200, headers: NO_STORE },
      );
    } catch (error) {
      return handleError(error, { route: "POST /api/v1/codes/[id]/aliases" });
    }
  },
);

// Counted with the API's requests (lib/analytics/usage.ts).
export const GET = withApiUsage("codes", handleGET);
export const POST = withApiUsage("codes", handlePOST);
