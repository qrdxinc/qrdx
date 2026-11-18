"use client";

import { useEffect } from "react";
import {
  captureLanding,
  installVisitForwarding,
} from "@/lib/analytics/landing";

/**
 * How this tab's visit started (the referring site's host, campaign tags,
 * the first page), kept in memory only so a sign-up in the same visit can
 * carry it (lib/analytics/landing.ts), and carried along links that load a
 * new page (the marketing site's pages are another app). Nothing is written
 * to the device, and nothing but the visit's `ref` is kept under Do Not
 * Track or Global Privacy Control. Renders nothing.
 */
export function LandingCapture() {
  useEffect(() => {
    captureLanding();
    installVisitForwarding();
  }, []);
  return null;
}
