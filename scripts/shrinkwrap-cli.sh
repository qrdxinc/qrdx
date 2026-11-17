#!/usr/bin/env bash
# Adds an npm-shrinkwrap.json to a packed @qrdx/cli tarball.
#
# `npx @qrdx/cli@<version>` pins the CLI, but not what it depends on: the CLI
# asks for ^ ranges (@clack/prompts, picocolors, sharp), and so do qrdx,
# @clack/prompts and sharp. Without a shrinkwrap, two runs of the same pinned
# version a month apart can install different code. npm installs exactly the
# tree in a package's npm-shrinkwrap.json, so this resolves the tree once, at
# publish time, and ships it in the tarball.
#
# Usage: scripts/shrinkwrap-cli.sh <packed-cli.tgz> <output-dir>
# Prints the path of the new tarball on stdout; everything else goes to stderr.
#
# Needs npm 7+ and the npm registry. The qrdx version the CLI depends on must
# be on npm: the Publish workflow runs this after publishing qrdx, so the
# script waits for a version that was published moments ago to show up.
# Env: SHRINKWRAP_WAIT_ATTEMPTS (default 20), SHRINKWRAP_WAIT_SECONDS (default 15).
set -euo pipefail

src="${1:?usage: shrinkwrap-cli.sh <packed-cli.tgz> <output-dir>}"
out="${2:?usage: shrinkwrap-cli.sh <packed-cli.tgz> <output-dir>}"
attempts="${SHRINKWRAP_WAIT_ATTEMPTS:-20}"
pause="${SHRINKWRAP_WAIT_SECONDS:-15}"

src="$(cd "$(dirname "$src")" && pwd)/$(basename "$src")"
mkdir -p "$out"
out="$(cd "$out" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "${work:?}"' EXIT

tar -xzf "$src" -C "$work"
pkg="$work/package"
cd "$pkg"

name="$(node -p "require('./package.json').name")"
if [ "$name" != "@qrdx/cli" ]; then
  echo "error: $src is $name, not @qrdx/cli" >&2
  exit 1
fi
if [ -e npm-shrinkwrap.json ] || [ -e package-lock.json ]; then
  echo "error: $src already has a lockfile" >&2
  exit 1
fi

# devDependencies only build the CLI in this repo, and one of them
# (@repo/typescript-config) isn't on npm. npm would try to resolve them all
# into the shrinkwrap, so the published manifest leaves them out.
npm pkg delete devDependencies

qrdx_version="$(node -p "require('./package.json').dependencies.qrdx")"
case "$qrdx_version" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *)
    echo "error: the packed CLI depends on qrdx \"$qrdx_version\", not an exact version" >&2
    exit 1
    ;;
esac

# Only a 404 means "not on npm yet"; any other npm error stops here.
errors="$work/npm-view-errors.txt"
for attempt in $(seq 1 "$attempts"); do
  if npm view "qrdx@$qrdx_version" version --prefer-online >/dev/null 2>"$errors"; then
    break
  fi
  if ! grep -q E404 "$errors"; then
    echo "error: could not check qrdx@$qrdx_version on npm:" >&2
    cat "$errors" >&2
    exit 1
  fi
  if [ "$attempt" -eq "$attempts" ]; then
    echo "error: qrdx@$qrdx_version is still not on npm after $attempts checks" >&2
    exit 1
  fi
  echo "qrdx@$qrdx_version isn't on npm yet; checking again in ${pause}s ($attempt/$attempts)" >&2
  sleep "$pause"
done

# Resolve the tree from the registry without installing anything, then turn
# the lockfile into the shrinkwrap npm publishes with the package. npm pack
# only ships what "files" lists, so the shrinkwrap goes on that list.
npm install --package-lock-only --ignore-scripts --no-audit --no-fund --prefer-online >&2
npm shrinkwrap >&2
npm pkg set 'files[]=npm-shrinkwrap.json'

# The shrinkwrap must hold the qrdx we just published, from the registry.
node - "$qrdx_version" >&2 <<'NODE'
const fs = require("node:fs");
const want = process.argv[2];
const lock = JSON.parse(fs.readFileSync("npm-shrinkwrap.json", "utf8"));
const entries = Object.entries(lock.packages ?? {}).filter(([path]) => path);
const qrdx = lock.packages?.["node_modules/qrdx"];
const problems = [];
if (lock.lockfileVersion < 2) problems.push(`lockfileVersion ${lock.lockfileVersion}`);
if (qrdx?.version !== want) problems.push(`qrdx is ${qrdx?.version}, expected ${want}`);
for (const [path, entry] of entries) {
  if (entry.link) problems.push(`${path} is a link`);
  else if (!entry.resolved?.startsWith("https://registry.npmjs.org/")) problems.push(`${path} resolves to ${entry.resolved}`);
  else if (!entry.integrity) problems.push(`${path} has no integrity hash`);
}
if (problems.length) {
  console.error(`error: bad npm-shrinkwrap.json:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.error(`npm-shrinkwrap.json pins ${entries.length} packages (qrdx ${want}).`);
NODE

tarball="$(npm pack --ignore-scripts --pack-destination "$out" --json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8'))[0].filename")"
if ! tar -tzf "$out/$tarball" | grep -qx 'package/npm-shrinkwrap.json'; then
  echo "error: npm pack left npm-shrinkwrap.json out of $tarball" >&2
  exit 1
fi
echo "$out/$tarball"
