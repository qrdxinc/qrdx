import manifest from "./media-manifest.json";

/**
 * Site videos, and the images that mustn't be committed to this repository
 * (a partner's logo we may show but not redistribute), are served from
 * Cloudflare R2, not /public. `bun run media:upload` (scripts/media/upload.mjs)
 * uploads apps/app/media/** with a content hash in each key and rewrites
 * media-manifest.json; this resolves a source path such as
 * "/videos/help/bulk-csv.mp4" or "/integrations/pipedrive.svg" to its public
 * URL.
 */
const files: Record<string, string> = manifest.files;

/** Whether `path` is an uploaded media key (else it's a site path). */
export function hasMedia(path: string): boolean {
  return Object.hasOwn(files, path);
}

/**
 * A picture's URL: an uploaded media key's, else the site path (or URL) as it
 * is. For pictures that live in either place: changelog pictures, and the
 * integrations' logos (`/integrations/<name>.svg` in public/, or uploaded).
 */
export function pictureUrl(path: string): string {
  return hasMedia(path) ? mediaUrl(path) : path;
}

export function mediaUrl(path: string): string {
  const key = files[path];
  if (!key) {
    // Not uploaded yet: keep the local path so a missing upload shows up as a
    // 404 in the network panel instead of a silent wrong URL.
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[media] "${path}" is not in lib/media-manifest.json`);
    }
    return path;
  }
  return `${manifest.origin}/${key}`;
}
