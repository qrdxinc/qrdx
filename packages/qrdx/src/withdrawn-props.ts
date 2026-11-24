// Props the engine no longer reads. Its built-in templates became frames in
// qrdx 0.0.64 (Arrow, Standard Box, Square Border, Striked Box, Halloween
// and Dot Ring are the built-in frame styles "arrow", "standard-box",
// "square-border", "striked-box", "pumpkin" and "dot-ring"), and
// `templateId` left the types. Code and saved props that still pass it keep
// drawing: it's dropped without an error, never reaches the <svg> as an
// attribute (no React unknown-prop warning), and the code is drawn without
// it. `customTemplate` and `customProps`, dropped in 0.0.64 too, are back
// since 0.0.65: they draw artwork you write in code (types/template.ts).

const WITHDRAWN_PROPS = new Set([
  "templateId",
  // As Vue hands over undeclared attributes, and as HTML lowercases them
  "template-id",
  "templateid",
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
