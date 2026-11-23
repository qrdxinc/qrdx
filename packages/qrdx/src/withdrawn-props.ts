// Props the engine no longer reads. Its decorative templates became frames
// in qrdx 0.0.64 (Arrow, Standard Box, Square Border, Striked Box, Halloween
// and Dot Ring are the built-in frame styles "arrow", "standard-box",
// "square-border", "striked-box", "halloween" and "dot-ring"), and
// `templateId`, `customTemplate` and `customProps` left the types. Code and
// saved props that still pass one keep drawing: it's dropped without an
// error, never reaches the <svg> as an attribute (no React unknown-prop
// warning), and the code is drawn without it.

const WITHDRAWN_PROPS = new Set([
  "templateId",
  "customTemplate",
  "customProps",
  // As Vue hands over undeclared attributes, and as HTML lowercases them
  "template-id",
  "custom-template",
  "custom-props",
  "templateid",
  "customtemplate",
  "customprops",
]);

/** `props` without the withdrawn template props (the same object when it has none). */
export function withoutWithdrawnProps<T extends object>(props: T): T {
  const keys = Object.keys(props);
  if (!keys.some((key) => WITHDRAWN_PROPS.has(key))) {
    return props;
  }
  return Object.fromEntries(
    Object.entries(props).filter(([key]) => !WITHDRAWN_PROPS.has(key))
  ) as T;
}

/** True for a prop name the engine drops (see withoutWithdrawnProps). */
export function isWithdrawnProp(key: string): boolean {
  return WITHDRAWN_PROPS.has(key);
}
