import { GalleryLoading } from "@/components/community/gallery-loading";

// A gallery while it loads, under the shared header (../../layout.tsx). Only
// the gallery: an item page (../[slug]) keeps the page it was opened from
// until it's ready, as before.
export default function Loading() {
  return <GalleryLoading />;
}
