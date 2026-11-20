import type { NextRequest } from "next/server";
import { codeIdSchema } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { withApiUsage } from "@/lib/analytics/usage";
import { withApiQuotaHeaders } from "@/lib/api-quota";
import { removeCodeAlias } from "@/lib/code-path-aliases";
import { HttpError, handleError } from "@/lib/error-response";
import { parseWithSchema } from "@/lib/request-guards";
import { pathAliasError } from "../../../_lib/aliases";
import { NO_STORE, resolveApiScope } from "../../../_lib/api";
import { pathAliasIdSchema } from "../../../_lib/schemas";

type Context = { params: Promise<{ id: string; aliasId: string }> };

/** Removes one of the code's path aliases: the old path stops opening it. */
const handleDELETE = withApiQuotaHeaders(
  async (req: NextRequest, { params }: Context) => {
    try {
      const scope = await resolveApiScope(req, "write");
      const { id, aliasId } = await params;
      const codeId = parseWithSchema(codeIdSchema, id);
      const alias = parseWithSchema(pathAliasIdSchema, aliasId);
      const result = await removeCodeAlias(scope, codeId, alias);
      if (!result.ok) throw pathAliasError(result);
      if (!result.value.removed) {
        throw new HttpError(404, "NOT_FOUND", "Path alias not found");
      }
      return Response.json(
        { data: { id: alias, deleted: true } },
        { headers: NO_STORE },
      );
    } catch (error) {
      return handleError(error, {
        route: "DELETE /api/v1/codes/[id]/aliases/[aliasId]",
      });
    }
  },
);

// Counted with the API's requests (lib/analytics/usage.ts).
export const DELETE = withApiUsage("codes", handleDELETE);
