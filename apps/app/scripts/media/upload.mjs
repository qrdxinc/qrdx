// Uploads the site's videos, and the few images that mustn't live in this
// repository (logos we may show but not redistribute, such as Pipedrive's),
// to Cloudflare R2 and writes lib/media-manifest.json.
//
// Sources live in apps/app/media/ (git-ignored: R2 is the copy everyone
// uses). Each file goes to `static/<path>.<hash>.<ext>` with a one-year
// immutable cache, so a changed file gets a new URL and nothing goes stale.
// Files already in the bucket are skipped. Entries already in the manifest
// whose source isn't on this machine are kept, so uploading one new file
// doesn't drop the others (to retire a file, delete its line from the
// manifest by hand). Code reads the manifest through `mediaUrl()` and
// `pictureUrl()` in lib/media.ts.
//
//   cd apps/app && R2_BUCKET=<bucket> bun run media:upload
//
// Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and
// R2_PUBLIC_BASE_URL (the bucket's public origin), from the shell or
// apps/app/.env.local, which the npm script loads.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const root = new URL("../..", import.meta.url).pathname;
const sourceDir = join(root, "media");
const manifestPath = join(root, "lib", "media-manifest.json");

const TYPES = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".svg": "image/svg+xml",
};

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_BASE_URL,
} = process.env;
const missing = Object.entries({
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_BASE_URL,
})
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length > 0) {
  console.error(`Missing env: ${missing.join(", ")}`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (TYPES[extname(entry.name).toLowerCase()]) out.push(path);
  }
  return out;
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function exists(key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404) return false;
    throw error;
  }
}

const origin = R2_PUBLIC_BASE_URL.replace(/\/+$/, "");

// Keep what's already uploaded to this origin: media/ is git-ignored, so a
// checkout usually holds only the files it's adding.
const previous = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : { origin, files: {} };
const files = previous.origin === origin ? { ...previous.files } : {};
const kept = Object.keys(files).length;
let uploaded = 0;
let local = 0;
for (const file of walk(sourceDir).sort()) {
  const body = readFileSync(file);
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 10);
  const ext = extname(file);
  // "/videos/help/bulk-csv.mp4" → "static/videos/help/bulk-csv.<hash>.mp4"
  const path = `/${relative(sourceDir, file).split(sep).join("/")}`;
  const key = `static${path.slice(0, -ext.length)}.${hash}${ext}`;
  if (!(await exists(key))) {
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: body,
        ContentType: TYPES[ext.toLowerCase()],
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    uploaded++;
  }
  files[path] = key;
  local++;
}

const sorted = Object.fromEntries(
  Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
);
writeFileSync(
  manifestPath,
  `${JSON.stringify({ origin, files: sorted }, null, 2)}\n`,
);
console.log(
  `${Object.keys(sorted).length} file(s) in the manifest (${local} here, ${kept} before), ${uploaded} uploaded.`,
);
