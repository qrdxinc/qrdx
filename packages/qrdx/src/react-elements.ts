// React's element functions, plugged into the renderer (jsx/runtime.ts) when
// a React component draws the code, so it builds React elements directly.
// Only `createElement`, never react/jsx-runtime, which React has had only
// since 16.14: the React entry works from React 16.8.
import { cloneElement, createElement, Fragment } from "react";
import type { ElementFactory } from "./jsx/runtime";

const createReactElement: ElementFactory["createElement"] = createElement;

/** The props without their children, with the key in them if there is one. */
function configOf(props: object | null, key: unknown) {
  const { children: _children, ...config } = (props ?? {}) as {
    children?: unknown;
  };
  return key === undefined ? config : { ...config, key };
}

/**
 * The automatic runtime's `jsx(type, props, key)` through `createElement`.
 * The children go in as `createElement`'s argument, not inside the props:
 * every React checks the keys of children passed that way exactly as `jsx`
 * checks its `props.children`.
 */
const jsx: ElementFactory["jsx"] = (type, props, key) =>
  props && "children" in props
    ? createReactElement(
        type,
        configOf(props, key),
        (props as { children: unknown }).children
      )
    : createReactElement(type, configOf(props, key));

/**
 * `jsxs`, for children written out in the source (a static array): each
 * child is an argument of its own, as compiled classic JSX passes them, so
 * no React asks them for keys, as with `jsxs`.
 */
const jsxs: ElementFactory["jsxs"] = (type, props, key) => {
  const children = (props as { children?: unknown } | null)?.children;
  return Array.isArray(children)
    ? createReactElement(type, configOf(props, key), ...children)
    : jsx(type, props, key);
};

export const REACT_ELEMENTS: ElementFactory = {
  jsx,
  jsxs,
  createElement: createReactElement,
  cloneElement: cloneElement as ElementFactory["cloneElement"],
  Fragment,
};
