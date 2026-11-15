import type { AuthPromptReason } from "@repo/analytics/auth-prompt";
import {
  AI_REQUEST_FREE_TIER_LIMIT,
  MAX_BULK_TOOL_ROWS,
  MAX_BULK_TOOL_ROWS_SIGNED_OUT,
} from "@repo/config";
import type { useTranslations } from "next-intl";

type ReasonTranslator = ReturnType<typeof useTranslations<"auth.reasons">>;

/**
 * The line the sign-in dialog shows for why it opened (auth.reasons in
 * messages/en.json), or null when the visitor simply asked to sign in.
 */
export function reasonLine(
  reason: AuthPromptReason,
  t: ReasonTranslator,
): string | null {
  switch (reason) {
    case "save_design":
      return t("saveDesign");
    case "make_dynamic":
      return t("makeDynamic");
    case "hosted_page":
      return t("hostedPage");
    case "ai_art":
      return t("aiArt");
    case "ai_chat":
      return t("aiChat", { count: AI_REQUEST_FREE_TIER_LIMIT });
    case "upload_frame":
      return t("uploadFrame");
    case "publish_frame":
      return t("publishFrame");
    case "community_action":
      return t("communityAction");
    case "save_barcode":
      return t("saveBarcode");
    case "bulk_over_limit":
      return t("bulkOverLimit", {
        limit: MAX_BULK_TOOL_ROWS_SIGNED_OUT,
        max: MAX_BULK_TOOL_ROWS,
      });
    case "keep_designs":
      return t("keepDesigns");
    case "after_download":
      return t("afterDownload");
    case "upgrade":
      return t("upgrade");
    case "nav":
      return null;
    default:
      return null;
  }
}
