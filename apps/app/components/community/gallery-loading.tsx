"use client";

import { useParams } from "next/navigation";
import { typeFromSegment } from "@/lib/community/types";
import { GallerySkeleton } from "./community-skeletons";
import { TAB_OF } from "./community-views";

/**
 * A gallery's loading placeholder, for the type in the URL (a loading.tsx
 * gets no params).
 */
export function GalleryLoading() {
  const segment = useParams<{ type: string }>().type;
  const type = typeof segment === "string" ? typeFromSegment(segment) : null;
  return <GallerySkeleton view={type ? TAB_OF[type] : "frames"} />;
}
