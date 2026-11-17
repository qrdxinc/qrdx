"use client";

// next-intl's provider as a plain client component. Imported from a server
// component, it takes its props as given: unlike next-intl's server version,
// it never reads the request's configuration to fill in formats, `now` or
// the time zone. The root document passes the docs' one language and its
// messages (components/root-document.tsx).
export { NextIntlClientProvider as RootIntlProvider } from "next-intl";
