import { MCP_HOST } from "@repo/config";
import { discoveryPreflight, jsonDocument } from "@/lib/agents/well-known";
import {
  mcpResourceFor,
  protectedResourceMetadata,
} from "@/lib/oauth-metadata";

// RFC 9728 §3.1: the metadata of https://mcp.qrdx.dev/mcp, at the
// path-suffixed address MCP clients try first. The MCP host only: elsewhere
// /mcp is a page, not the server (that one is …/api/mcp).
export function GET(request: Request) {
  if (new URL(request.url).hostname !== MCP_HOST) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return jsonDocument(
    request,
    protectedResourceMetadata(mcpResourceFor(request.url)),
    "application/json",
  );
}

export const OPTIONS = discoveryPreflight;
