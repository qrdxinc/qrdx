"use client";

import { useEffect, useRef, useState } from "react";
import { isNewIn } from "@/lib/whats-new";
import { NEW_FRAMES } from "@/lib/whats-new/frames";

const systemClock = () => new Date();

/**
 * Whether an official frame is new (lib/whats-new/frames), decided after
 * mount: the server render and the first client render agree (no tag), and
 * the tags appear with the date the visitor's clock gives. Tests pass a
 * fixed `clock`; it is read once, after mount, so an inline function is fine.
 */
export function useNewFrames(clock: () => Date = systemClock) {
  const [today, setToday] = useState<Date | null>(null);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  useEffect(() => setToday(clockRef.current()), []);
  return (id: string) => (today ? isNewIn(NEW_FRAMES, id, today) : false);
}
