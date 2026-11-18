import { createQrCode } from "@/actions/qr-codes";
import { actionRoute } from "@/lib/widget-routes/server";

/**
 * The Dynamic toggle's new dynamic code (components/editor/dynamic-link-toggle.tsx)
 * for pages that can't call this app's server actions. Runs createQrCode, so
 * the session, validation, rate limit, plan limit and audit record are the
 * action's; the code is made via "playground", as the toggle's always was.
 * `?locale=`, the page's language when it sends one, is the action's
 * pageLocale; without it the action's messages follow the app's language.
 */
export function POST(req: Request) {
  const locale = new URL(req.url).searchParams.get("locale") ?? undefined;
  return actionRoute(
    req,
    (body) =>
      createQrCode(
        body as Parameters<typeof createQrCode>[0],
        { via: "playground" },
        locale,
      ),
    { created: true },
  );
}
