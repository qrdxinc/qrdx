import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { typeFromSegment } from "@/lib/community/types";

// Above the gallery's loading placeholder (./loading.tsx): a type that
// doesn't exist gets its 404 status here, before the placeholder starts the
// response streaming (which fixes the status at 200).
export default async function GalleryLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ type: string }>;
}) {
  if (!typeFromSegment((await params).type)) notFound();
  return children;
}
