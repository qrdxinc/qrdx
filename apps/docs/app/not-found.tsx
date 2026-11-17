import type { Metadata } from "next";
import { NotFoundScreen } from "@/components/not-found-screen";

// URLs that match no route (/, /pricing on this app's own host). On qrdx.dev
// the main app answers every path outside the docs, so readers don't see it
// there.
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return <NotFoundScreen />;
}
