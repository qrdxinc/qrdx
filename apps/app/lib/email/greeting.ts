// Who an email greets. Email-code sign-ups get the address's local part as
// their name (packages/auth/server.ts), so "Hi jdoe1987," or "Hi info," is
// common: a name that is the local part, or looks like a handle (digits,
// dots, underscores, @ or +), greets "there" instead.

export interface Greeting {
  /** "Sam", or "there" */
  name: string;
  /** True when the account's name couldn't be used */
  fallback: boolean;
}

const HANDLE = /[\d_.@+]/;

export function greetingName(name: string, email: string): Greeting {
  const trimmed = name.trim();
  const first = trimmed.split(/\s+/)[0] ?? "";
  const local = email.split("@")[0]?.trim().toLowerCase() ?? "";
  if (!first || trimmed.toLowerCase() === local || HANDLE.test(first)) {
    return { name: "there", fallback: true };
  }
  return { name: first, fallback: false };
}
