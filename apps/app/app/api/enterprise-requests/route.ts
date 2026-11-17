import { submitEnterpriseRequest } from "@/actions/enterprise-requests";
import { FORM_BODY_BYTES, resultRoute } from "@/lib/widget-routes/server";
import type { EnterpriseFormState } from "@/types/action-results";

const STATUS: Record<
  Extract<EnterpriseFormState, { status: "error" }>["code"],
  number
> = {
  invalid: 400,
  check: 403,
  rateLimited: 429,
  notSent: 502,
  unavailable: 503,
  unknown: 500,
};

/**
 * The /enterprise contact form (app/[lang]/(home)/enterprise/contact-form.tsx)
 * for pages that can't call this app's server actions. The form's fields
 * come as a JSON object of strings and go to submitEnterpriseRequest as the
 * form data it reads: the honeypot, per-IP limits (this request's address),
 * Turnstile and validation are the action's.
 */
export function POST(req: Request) {
  return resultRoute<EnterpriseFormState>(
    req,
    (body) => {
      const data = new FormData();
      for (const [name, value] of Object.entries(body)) {
        if (typeof value === "string") data.set(name, value);
      }
      return submitEnterpriseRequest({ status: "idle" }, data);
    },
    {
      maxBytes: FORM_BODY_BYTES,
      statusOf: (state) =>
        state.status === "error" ? (STATUS[state.code] ?? 500) : 200,
      refuse: () => ({ status: "error", code: "unknown" }),
    },
  );
}
