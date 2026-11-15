#!/usr/bin/env node
// Uploads the docs' clips (apps/docs/media/**, git-ignored, written by
// `shots`) to the same Cloudflare R2 bucket as the main app's videos and
// records them in apps/docs/lib/media-manifest.json, the way
// apps/app/scripts/media/upload.mjs does for the main app: each file goes to
// `static/<path>.<hash>.<ext>` with a one-year immutable cache, so a changed
// clip gets a new URL and nothing goes stale. Files already in the bucket
// are skipped. lib/shots.ts resolves a clip's sources through the manifest.
//
//   bun run --filter docs shots:upload
//
// Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and
// R2_PUBLIC_BASE_URL, from the shell or apps/app/.env.local (the npm script
// loads it; this app has no secrets of its own). Nothing here prints a value.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const docsApp = join(here, "..", "..");
const sourceDir = join(docsApp, "media");
const manifestPath = join(docsApp, "lib", "media-manifest.json");

// The S3 client is the main app's dependency; this script runs from the repo.
const require = createRequire(join(docsApp, "..", "app", "package.json"));
const {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");

const TYPES = { ".mp4": "video/mp4", ".webm": "video/webm" };

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
  console.error(
    `Missing env: ${missing.join(", ")} (apps/app/.env.local has them on a deployment with file storage).`,
  );
  process.exit(1);
}
if (!existsSync(sourceDir)) {
  console.error(
    `Nothing to upload: ${sourceDir} does not exist. Run \`bun run --filter docs shots -- --clips\` first.`,
  );
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

const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : { origin: "", files: {} };
const files = { ...manifest.files };
let uploaded = 0;
for (const file of walk(sourceDir).sort()) {
  const body = readFileSync(file);
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 10);
  const ext = extname(file);
  // "/videos/docs/first-code.light.mp4" → "static/videos/docs/first-code.light.<hash>.mp4"
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
}

const sorted = Object.fromEntries(
  Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(
  manifestPath,
  `${JSON.stringify({ origin: R2_PUBLIC_BASE_URL.replace(/\/+$/, ""), files: sorted }, null, 2)}\n`,
);
console.log(
  `${Object.keys(sorted).length} file(s) in the manifest, ${uploaded} uploaded.`,
);
