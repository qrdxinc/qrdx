"use client";

import { createContext, type ReactNode, useContext } from "react";

// Where the admin UI is, for client components that link to it (the user
// menu): the root layout reads it on the server (lib/admin-console/
// admin-home.ts) and passes it down. Without a provider, this app's /admin.

const AdminHrefContext = createContext("/admin");

export function AdminHrefProvider({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return (
    <AdminHrefContext.Provider value={value}>
      {children}
    </AdminHrefContext.Provider>
  );
}

/** "/admin", or the console's address (https://console.qrdx.dev/). */
export function useAdminHref(): string {
  return useContext(AdminHrefContext);
}
