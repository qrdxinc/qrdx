import { CANONICAL_ORIGIN } from "@repo/config";

// QRdx's scan study (the code and data: scripts/scan-study): how logo size,
// contrast, quiet zone and module size change whether codes scan. Its post is
// the marketing site's alone (qrdx.dev/blog, the site zone), not one of this
// app's own blog posts, so links name its full address: it opens on qrdx.dev
// from a self-hosted server too. Client-safe.

/** The scan study's post on qrdx.dev. */
export const SCAN_STUDY_URL = `${CANONICAL_ORIGIN}/blog/qr-code-scan-study`;
