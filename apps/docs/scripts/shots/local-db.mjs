#!/usr/bin/env node
// The throwaway database the screenshots are taken from: a local Postgres
// cluster under apps/docs/.shots/pg (git-ignored), the Neon-HTTP proxy the
// app's driver needs in front of it (neon-proxy.mjs), the schema from
// packages/database/schema.ts, and the seed (seed.mjs). Never the shared
// database: nothing here reads DATABASE_URL.
//
//   bun run --filter docs shots:db up      # start Postgres and the proxy, load the schema, seed
//   bun run --filter docs shots:db seed    # reseed (the app can stay up)
//   bun run --filter docs shots:db down    # stop both and delete the cluster
//   bun run --filter docs shots:db env     # the lines to put in apps/app/.env.local
//
// Needs Homebrew's postgresql@16 (initdb, pg_ctl, psql). Ports: 54329 for
// Postgres, 54330 for the proxy (SHOTS_PG_PORT, SHOTS_PROXY_PORT).
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const docsApp = join(here, "..", "..");
const repoRoot = join(docsApp, "..", "..");
const dir = join(docsApp, ".shots", "pg");
const dataDir = join(dir, "data");
const PG_PORT = Number(process.env.SHOTS_PG_PORT ?? 54329);
const PROXY_PORT = Number(process.env.SHOTS_PROXY_PORT ?? 54330);
const DATABASE_URL = `postgresql://postgres@127.0.0.1:${PG_PORT}/qrdx`;

const PG_BIN = [
  process.env.SHOTS_PG_BIN,
  "/opt/homebrew/opt/postgresql@16/bin",
  "/usr/local/opt/postgresql@16/bin",
  "/usr/lib/postgresql/16/bin",
]
  .filter(Boolean)
  .find((candidate) => existsSync(join(candidate, "pg_ctl")));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    console.error(`${command} ${args.join(" ")} failed (${result.status})`);
    process.exit(result.status ?? 1);
  }
}

function pg(binary) {
  if (!PG_BIN) {
    console.error(
      "Postgres 16 not found: brew install postgresql@16 (or set SHOTS_PG_BIN to its bin directory).",
    );
    process.exit(1);
  }
  return join(PG_BIN, binary);
}

function envLines() {
  return [
    `DATABASE_URL=${DATABASE_URL}`,
    `DATABASE_HTTP_ENDPOINT=http://127.0.0.1:${PROXY_PORT}/sql`,
    "BETTER_AUTH_URL=http://localhost:3103",
    "NEXT_PUBLIC_APP_URL=http://localhost:3103",
    "NEXT_PUBLIC_SHORT_LINK_BASE_URL=https://qrdx.dev",
    "DOCS_ZONE_URL=http://localhost:3113",
  ].join("\n");
}

function startProxy() {
  const log = openSync(join(dir, "proxy.log"), "a");
  const child = spawn(
    process.execPath,
    [
      join(here, "neon-proxy.mjs"),
      "--listen",
      String(PROXY_PORT),
      "--database",
      DATABASE_URL,
    ],
    {
      detached: true,
      stdio: ["ignore", log, log],
    },
  );
  child.unref();
  writeFileSync(join(dir, "proxy.pid"), String(child.pid));
}

function stopProxy() {
  const pidFile = join(dir, "proxy.pid");
  if (!existsSync(pidFile)) return;
  try {
    process.kill(Number(readFileSync(pidFile, "utf8").trim()), "SIGTERM");
  } catch {}
  rmSync(pidFile, { force: true });
}

function seed() {
  run(process.execPath, [join(here, "seed.mjs"), "--database", DATABASE_URL], {
    cwd: docsApp,
  });
}

const command = process.argv[2];
switch (command) {
  case "up": {
    mkdirSync(dir, { recursive: true });
    if (!existsSync(dataDir)) {
      run(
        pg("initdb"),
        ["-D", dataDir, "-U", "postgres", "--auth=trust", "-E", "UTF8"],
        { stdio: "ignore" },
      );
    }
    run(pg("pg_ctl"), [
      "-D",
      dataDir,
      "-l",
      join(dir, "server.log"),
      "-o",
      `-p ${PG_PORT} -c unix_socket_directories= -c listen_addresses=127.0.0.1`,
      "start",
    ]);
    const exists = spawnSync(
      pg("psql"),
      [
        "-h",
        "127.0.0.1",
        "-p",
        String(PG_PORT),
        "-U",
        "postgres",
        "-tAc",
        "select 1 from pg_database where datname='qrdx'",
      ],
      { encoding: "utf8" },
    );
    if (exists.stdout.trim() !== "1") {
      run(pg("createdb"), [
        "-h",
        "127.0.0.1",
        "-p",
        String(PG_PORT),
        "-U",
        "postgres",
        "qrdx",
      ]);
      // The schema, straight from schema.ts (no drizzle-kit push: nothing here may ever reach a shared database).
      const exported = spawnSync(
        "bun",
        [
          "x",
          "drizzle-kit",
          "export",
          "--dialect=postgresql",
          "--schema=./schema.ts",
        ],
        {
          cwd: join(repoRoot, "packages", "database"),
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL },
          maxBuffer: 64 * 1024 * 1024,
        },
      );
      if (exported.status !== 0) {
        console.error(exported.stderr);
        process.exit(1);
      }
      const schemaFile = join(dir, "schema.sql");
      writeFileSync(schemaFile, exported.stdout);
      run(pg("psql"), [
        "-h",
        "127.0.0.1",
        "-p",
        String(PG_PORT),
        "-U",
        "postgres",
        "-d",
        "qrdx",
        "-v",
        "ON_ERROR_STOP=1",
        "-q",
        "-f",
        schemaFile,
      ]);
    }
    stopProxy();
    startProxy();
    seed();
    console.log(
      `\nshots:db: Postgres on ${PG_PORT}, proxy on ${PROXY_PORT}. Put these in apps/app/.env.local (replacing the same keys), then start the app:\n\n${envLines()}\n\n  cd apps/app && mkdir -p ../docs/.shots && bun x next dev --port 3103 > ../docs/.shots/app.log 2>&1 &\n`,
    );
    break;
  }
  case "seed":
    seed();
    break;
  case "down":
    stopProxy();
    if (existsSync(dataDir))
      spawnSync(pg("pg_ctl"), ["-D", dataDir, "stop", "-m", "fast"], {
        stdio: "inherit",
      });
    rmSync(dir, { recursive: true, force: true });
    console.log("shots:db: stopped and removed.");
    break;
  case "env":
    console.log(envLines());
    break;
  default:
    console.error("Usage: shots:db up | seed | down | env");
    process.exit(1);
}
