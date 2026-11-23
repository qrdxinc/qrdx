import { discoveryPreflight, jsonDocument } from "@/lib/agents/well-known";
import { authorizationServerMetadata } from "@/lib/oauth-metadata";

// RFC 8414 Authorization Server Metadata for QRdx's OAuth provider
// (app/api/oauth): what MCP clients read after the MCP server's protected
// resource metadata names this issuer. Clients register themselves at its
// registration_endpoint (RFC 7591).
export function GET(request: Request) {
  return jsonDocument(
    request,
    authorizationServerMetadata(),
    "application/json",
  );
}

export const OPTIONS = discoveryPreflight;
