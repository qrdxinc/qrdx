// Logos we may show but must not commit. Pipedrive's Marketplace team wrote on
// 24 Nov 2026 that putting their logo files in a public GitHub repository
// needs written trademark approval from their legal team, while showing
// their official monogram on our integrations pages is fine. So the file from
// their press kit is uploaded to R2 (`bun run media:upload` from the
// git-ignored apps/app/media/, scripts/media/upload.mjs), only its entry in
// lib/media-manifest.json is committed, and IntegrationLogo draws it through
// pictureUrl(). Segment's mark (the icon app.segment.com serves) is kept the
// same way: Twilio's trademark guidelines allow its logos only with its
// permission. The owner cleared showing it on 27 Nov 2026; a commit to a
// public repository would be a further use. This fails when such a logo is
// committed anywhere in the repository (under any name that carries the
// brand's), or when its upload is missing from the manifest.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasMedia, pictureUrl } from "@/lib/media";
import manifest from "@/lib/media-manifest.json";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const PUBLIC = join(REPO, "apps", "app", "public");

const HOSTED_ONLY = [
  { brand: "pipedrive", src: "/integrations/pipedrive.svg" },
  { brand: "segment", src: "/integrations/segment.svg" },
] as const;

const IMAGE = /\.(?:svg|png|jpe?g|webp|avif|gif|ico|bmp|tiff?|pdf|ai|eps)$/i;

describe("logos hosted outside the repository", () => {
  it("serves each one from R2", () => {
    for (const { src } of HOSTED_ONLY) {
      expect(hasMedia(src), `${src} is not uploaded`).toBe(true);
      expect(pictureUrl(src)).toBe(`${manifest.origin}/${manifest.files[src]}`);
      expect(pictureUrl(src)).toMatch(/^https:\/\//);
      expect(existsSync(join(PUBLIC, src)), `${src} is in public/`).toBe(false);
    }
  });

  it("never commits their files", () => {
    const tracked = execFileSync("git", ["ls-files", "-z"], {
      cwd: REPO,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\0")
      .filter(Boolean);
    expect(tracked.length).toBeGreaterThan(1000);
    for (const { brand } of HOSTED_ONLY) {
      const files = tracked.filter(
        (path) =>
          IMAGE.test(path) && basename(path).toLowerCase().includes(brand),
      );
      expect(files, brand).toEqual([]);
    }
  });
});
