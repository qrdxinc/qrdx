import { discoveryPreflight, jsonDocument } from "@/lib/agents/well-known";
import {
  mcpResourceFor,
  protectedResourceMetadata,
} from "@/lib/oauth-metadata";

// RFC 9728 Protected Resource Metadata for the MCP server, at the root form
// MCP clients fall back to (the path-suffixed forms are next to this file):
// where its sign-in tools get their tokens. On mcp.qrdx.dev it describes
// https://mcp.qrdx.dev/mcp; on any other host, <origin>/api/mcp.
export function GET(request: Request) {
  return jsonDocument(
    request,
    protectedResourceMetadata(mcpResourceFor(request.url)),
    "application/json",
  );
}

export const OPTIONS = discoveryPreflight;
