import { GallerySkeleton } from "@/components/community/community-skeletons";

// "Everything" while it loads, under the shared header (../layout.tsx).
export default function Loading() {
  return <GallerySkeleton view="all" />;
}
