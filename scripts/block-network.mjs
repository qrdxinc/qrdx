// Keeps a Node process off the network: connections to anything but this
// machine fail at once. CI's "Build the main app" job preloads it into every
// Node process of `next build` (NODE_OPTIONS=--import), so the build can't
// reach a database or any outside service, and a page that can only be
// prerendered with the network fails CI instead of quietly calling out.
//
// Only Node's sockets are covered: Turbopack itself is native code and still
// downloads the Google Fonts that next/font/google asks for while compiling,
// as it does on Vercel.
//
// With BLOCK_NETWORK_LOG set, each attempt is appended to that file as
// "<pid> blocked|allowed <host>:<port>" (the job summarises the blocked ones).

import { appendFileSync } from "node:fs";
import net from "node:net";

const log = process.env.BLOCK_NETWORK_LOG;
const LOOPBACK =
  /^(?:localhost|127\.\d+\.\d+\.\d+|::1|\[::1\]|::ffff:127\.\d+\.\d+\.\d+)$/i;

/** Host and port of a Socket#connect call, or null for a Unix socket or pipe. */
function target(args) {
  let [first] = args;
  // net internals pass [options, callback] as one array argument.
  if (Array.isArray(first)) [first] = first;
  if (first && typeof first === "object") {
    if (first.path) return null;
    return { host: first.host ?? "localhost", port: first.port };
  }
  if (typeof first === "number" || /^\d+$/.test(String(first))) {
    return {
      host: typeof args[1] === "string" ? args[1] : "localhost",
      port: first,
    };
  }
  return null;
}

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function blockedConnect(...args) {
  const to = target(args);
  if (!to) return connect.apply(this, args);
  const blocked = !LOOPBACK.test(String(to.host));
  if (log) {
    appendFileSync(
      log,
      `${process.pid} ${blocked ? "blocked" : "allowed"} ${to.host}:${to.port}\n`
    );
  }
  if (!blocked) return connect.apply(this, args);
  const error = new Error(
    `No network in this build (scripts/block-network.mjs): blocked a connection to ${to.host}:${to.port}. A page that reads a database or an outside service while it's prerendered needs a fallback, or to render at request time.`
  );
  error.code = "ENETUNREACH";
  process.nextTick(() => this.destroy(error));
  return this;
};
