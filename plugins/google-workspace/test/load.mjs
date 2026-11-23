// Runs the add-on's source files the way Apps Script does: every file in
// one global scope, one after another, with the Apps Script services the
// test passes in as globals. Apps Script's file order isn't guaranteed, so
// `reverse` loads them the other way round too.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const SRC = join(import.meta.dirname, "../src");

export const SOURCE_FILES = readdirSync(SRC)
  .filter((file) => file.endsWith(".js"))
  .sort();

/**
 * Loads src/*.js with `globals` and returns a reader: get("name") evaluates
 * a name (a function or a top-level const) inside the add-on's scope.
 */
export function loadAddon(globals = {}, { reverse = false } = {}) {
  const context = vm.createContext({ ...globals });
  const files = reverse ? [...SOURCE_FILES].reverse() : SOURCE_FILES;
  for (const file of files) {
    vm.runInContext(readFileSync(join(SRC, file), "utf8"), context, {
      filename: file,
    });
  }
  return (name) => vm.runInContext(name, context);
}

/** A value from the add-on's scope as plain data (its own realm's prototypes dropped). */
export const plain = (value) => JSON.parse(JSON.stringify(value));

// ── A Card service that records what the add-on builds ────────────────────

function recorder(kind) {
  const node = { kind, calls: [] };
  const proxy = new Proxy(node, {
    get(target, property) {
      if (property === "kind" || property === "calls") return target[property];
      if (typeof property !== "string" || property === "then") return;
      return (...args) => {
        target.calls.push([property, ...args]);
        return property === "build" ? node : proxy;
      };
    },
  });
  return proxy;
}

/** CardService: every newX() records its calls; enums are "Group.NAME". */
export function fakeCardService() {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property === "string" && property.startsWith("new")) {
          return () => recorder(property.slice(3));
        }
        return new Proxy(
          {},
          { get: (_enum, name) => `${String(property)}.${String(name)}` }
        );
      },
    }
  );
}

const isNode = (value) =>
  value !== null &&
  typeof value === "object" &&
  typeof value.kind === "string" &&
  Array.isArray(value.calls);

/** Every recorded node under `root`, depth first. */
export function nodesOf(root) {
  const found = [];
  const visit = (node) => {
    found.push(node);
    for (const call of node.calls) {
      for (const arg of call.slice(1)) if (isNode(arg)) visit(arg);
    }
  };
  visit(root);
  return found;
}

/** The first argument of each `method` call on `node`. */
export const argsOf = (node, method) =>
  node.calls.filter((call) => call[0] === method).map((call) => call[1]);

/** The field names of every input on a card. */
export const fieldNamesOf = (card) =>
  nodesOf(card).flatMap((node) => argsOf(node, "setFieldName"));

/** Every text set on a card's widgets. */
export const textsOf = (card) =>
  nodesOf(card).flatMap((node) => argsOf(node, "setText"));

/** The function a button runs, by its label. */
export function buttonAction(card, label) {
  const button = nodesOf(card).find(
    (node) => node.kind === "TextButton" && argsOf(node, "setText")[0] === label
  );
  if (!button) return;
  const [action] = argsOf(button, "setOnClickAction");
  return action ? argsOf(action, "setFunctionName")[0] : undefined;
}

/** An action event as Workspace add-ons send it (commonEventObject.formInputs). */
export function actionEvent(hostApp, inputs = {}) {
  const formInputs = {};
  for (const [name, value] of Object.entries(inputs)) {
    const values = Array.isArray(value) ? value : [value];
    formInputs[name] = { stringInputs: { value: values } };
  }
  return {
    hostApp,
    commonEventObject: { hostApp: hostApp.toUpperCase(), formInputs },
  };
}

/** UrlFetchApp that answers every request with `status` and records the addresses. */
export function fakeUrlFetch({ status = 200, body = "" } = {}) {
  const requests = [];
  const blob = {
    name: "",
    setName(name) {
      blob.name = name;
      return blob;
    },
    getBytes: () => [137, 80, 78, 71],
  };
  return {
    requests,
    blob,
    UrlFetchApp: {
      fetch(url, options) {
        requests.push({ url, options });
        return {
          getResponseCode: () => status,
          getContentText: () => body,
          getBlob: () => blob,
        };
      },
    },
  };
}
