import { discoveryPreflight, jsonDocument } from "@/lib/agents/well-known";
import {
  mcpResourceFor,
  protectedResourceMetadata,
} from "@/lib/oauth-metadata";

// RFC 9728 §3.1: the metadata of <origin>/api/mcp (qrdx.dev, local
// development, a self-hosted domain), at the path-suffixed address MCP
// clients try first.
export function GET(request: Request) {
  return jsonDocument(
    request,
    protectedResourceMetadata(mcpResourceFor(request.url)),
    "application/json",
  );
}

export const OPTIONS = discoveryPreflight;
