// Email codes: what the server (./email-otp.ts), the sign-in form and the
// change-email form share. No imports, so client components can use it.

/** The endpoint that emails a sign-in code (the emailOTP plugin's). */
export const SEND_SIGN_IN_CODE_PATH = "/email-otp/send-verification-otp";

/**
 * Error code for a code asked for where none can be delivered: this
 * deployment has no way to email one (no Resend, or a production build on a
 * localhost URL). The same for every address; the form says email sign-in
 * isn't set up on this site.
 */
export const SIGN_IN_CODES_UNAVAILABLE = "SIGN_IN_CODES_UNAVAILABLE";

/**
 * The endpoint that emails a code to a new address (the emailOTP plugin's).
 * Off over HTTP: only the app's server actions call it (./server.ts).
 */
export const REQUEST_EMAIL_CHANGE_PATH = "/email-otp/request-email-change";

/**
 * Error code for asking to change the email where no code can be delivered,
 * by the same rule as SIGN_IN_CODES_UNAVAILABLE. Answered before the address
 * is looked at, so it's the same for every address, with an account or
 * without.
 */
export const EMAIL_CHANGE_UNAVAILABLE = "EMAIL_CHANGE_UNAVAILABLE";
