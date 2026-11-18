// Email sign-in codes: what the server (./email-otp.ts) and the sign-in form
// share. No imports, so client components can use it.

/** The endpoint that emails a sign-in code (the emailOTP plugin's). */
export const SEND_SIGN_IN_CODE_PATH = "/email-otp/send-verification-otp";

/**
 * Error code for a code asked for where none can be delivered: this
 * deployment has no way to email one (no Resend, or a production build on a
 * localhost URL). The same for every address; the form says email sign-in
 * isn't set up on this site.
 */
export const SIGN_IN_CODES_UNAVAILABLE = "SIGN_IN_CODES_UNAVAILABLE";
