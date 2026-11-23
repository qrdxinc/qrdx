// The consent page when QRdx doesn't know the app (an unknown client_id):
// most often an MCP app's saved connection whose self-registered client was
// deleted as unused. The page says so in words, in the person's language,
// with what to do; other invalid requests keep the general message.
import { describe, expect, it } from "vitest";
import { OAuthRequestError } from "@/app/(app)/oauth/authorize/oauth-consent";
import { renderIntl } from "../support/intl";

describe("OAuthRequestError", () => {
  it("tells someone whose app's connection expired to add QRdx again", () => {
    const html = renderIntl(
      <OAuthRequestError description="Unknown client_id" unknownApp />,
    );
    expect(html).toContain("This app&#x27;s connection to QRdx has expired");
    expect(html).toContain(
      "remove QRdx from the app, add it again and sign in",
    );
    expect(html).not.toContain("Unknown client_id");
  });

  it("keeps the general message for other invalid requests", () => {
    const html = renderIntl(
      <OAuthRequestError description="redirect_uri not registered" />,
    );
    expect(html).toContain("This link can&#x27;t be used");
    expect(html).toContain("redirect_uri not registered");
  });
});
