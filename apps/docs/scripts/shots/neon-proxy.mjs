#!/usr/bin/env node
// A tiny Neon-HTTP front for a plain local Postgres, for the screenshot
// pipeline only. The app talks to its database through
// @neondatabase/serverless over HTTP (packages/database/index.ts); pointed at
// this proxy (DATABASE_HTTP_ENDPOINT), it works against a throwaway Postgres
// started by scripts/shots/local-db.mjs. Never put it in front of a shared
// database: it has no authentication.
//
//   node scripts/shots/neon-proxy.mjs --listen 54330 --database postgresql://postgres@127.0.0.1:54329/qrdx
//
// What the client sends (index.mjs of @neondatabase/serverless 1.2): POST
// JSON `{ query, params }` or `{ queries: [{ query, params }] }` with the
// headers Neon-Raw-Text-Output: true and Neon-Array-Mode: true. It expects
// `{ fields: [{ name, dataTypeID }], rows: [[text, …]], command, rowCount }`
// (or `{ results: [...] }` for a batch), values as Postgres text, and a 400
// with `{ message, code, detail, … }` when a statement fails.
import { createServer } from "node:http";
import pg from "pg";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}
const port = Number(
  args.get("listen") ?? process.env.SHOTS_PROXY_PORT ?? 54330,
);
const connectionString =
  args.get("database") ??
  process.env.SHOTS_DATABASE_URL ??
  "postgresql://postgres@127.0.0.1:54329/qrdx";

// Loopback only, on both sides: the proxy never fronts anything but a local
// database, and nothing but local processes can reach it.
const databaseHost = new URL(connectionString).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(databaseHost)) {
  console.error(
    `neon-proxy: refusing to front ${databaseHost}; only a local database.`,
  );
  process.exit(1);
}

// Raw text out: the client parses values itself from each field's type OID.
const rawText = { getTypeParser: () => (value) => value };
const pool = new pg.Pool({ connectionString, types: rawText, max: 8 });

function shape(result) {
  return {
    command: result.command,
    rowCount: result.rowCount,
    fields: result.fields.map((field) => ({
      name: field.name,
      dataTypeID: field.dataTypeID,
      tableID: field.tableID,
      columnID: field.columnID,
      dataTypeSize: field.dataTypeSize,
      dataTypeModifier: field.dataTypeModifier,
      format: field.format,
    })),
    rows: result.rows,
  };
}

async function runOne(client, { query, params }) {
  const result = await client.query({
    text: query,
    values: params ?? [],
    rowMode: "array",
  });
  return shape(result);
}

async function handle(body, headers) {
  if (Array.isArray(body.queries)) {
    const client = await pool.connect();
    try {
      // Only the four levels Postgres knows, from a constant table: nothing
      // from the request reaches the statement.
      const LEVELS = {
        ReadUncommitted: "READ UNCOMMITTED",
        ReadCommitted: "READ COMMITTED",
        RepeatableRead: "REPEATABLE READ",
        Serializable: "SERIALIZABLE",
      };
      const level = LEVELS[String(headers["neon-batch-isolation-level"] ?? "")];
      const readOnly = headers["neon-batch-read-only"] === "true";
      const begin = ["BEGIN"];
      if (level) begin.push(`ISOLATION LEVEL ${level}`);
      if (readOnly) begin.push("READ ONLY");
      await client.query(begin.join(" "));
      try {
        const results = [];
        for (const item of body.queries)
          results.push(await runOne(client, item));
        await client.query("COMMIT");
        return { results };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    } finally {
      client.release();
    }
  }
  return runOne(pool, body);
}

const server = createServer((request, response) => {
  if (request.method !== "POST") {
    response.writeHead(405).end();
    return;
  }
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", async () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const result = await handle(body, request.headers);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(result));
    } catch (error) {
      // The driver gets the SQLSTATE code it understands and a generic
      // message; the details stay in this process's log.
      console.error("neon-proxy:", error?.code ?? "", error?.message ?? error);
      const payload = { message: "query failed" };
      if (typeof error?.code === "string") payload.code = error.code;
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify(payload));
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(
    `neon-proxy: http://127.0.0.1:${port}/sql → ${connectionString.replace(/:[^:@/]+@/, ":***@")}`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close();
    pool.end().finally(() => process.exit(0));
  });
}
