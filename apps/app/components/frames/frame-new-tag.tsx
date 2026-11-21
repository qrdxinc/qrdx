"use client";

import { useEffect, useState } from "react";
import { isNewIn } from "@/lib/whats-new";
import { NEW_FRAMES } from "@/lib/whats-new/frames";
import { NewTag } from "../new-tag";

/**
 * The "New" pill on a recently added official frame, by its id. Decided
 * after mount, so a page rendered on the server hydrates without a mismatch
 * (the date differs between the server and the browser around midnight).
 */
export function FrameNewTag({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(isNewIn(NEW_FRAMES, id));
  }, [id]);
  return show ? <NewTag className={className} /> : null;
}
