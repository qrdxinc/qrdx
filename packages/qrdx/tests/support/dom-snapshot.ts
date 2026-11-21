// A DOM tree as text, for comparing what an adapter put on the page with the
// core's DOM: element namespaces, attributes in order, text. A `style`
// attribute is compared as the browser reads it, since a framework may set it
// through the CSSOM (`width:100%` reads back as `width: 100%;`).
// `anyOrder` compares the attributes in any order: an update may patch an
// element in place, and the framework keeps the attributes it already had
// first (a body group that becomes the shadow's keeps its fill first).

const escapeText = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

function cssText(value: string): string {
  const probe = document.createElement("div");
  probe.setAttribute("style", value);
  return probe.style.cssText;
}

export function domSnapshot(
  node: Node,
  { anyOrder = false }: { anyOrder?: boolean } = {}
): string {
  const children = (parent: Node) =>
    [...parent.childNodes]
      .map((child) => domSnapshot(child, { anyOrder }))
      .join("");
  if (node.nodeType === node.TEXT_NODE) {
    return escapeText((node as Text).data);
  }
  if (node.nodeType !== node.ELEMENT_NODE) {
    return children(node);
  }
  const element = node as Element;
  const attributes = [...element.attributes].map(
    ({ name, value }) =>
      ` ${name}="${name === "style" ? cssText(value) : value}"`
  );
  if (anyOrder) {
    attributes.sort();
  }
  return `<${element.namespaceURI}|${element.localName}${attributes.join("")}>${children(element)}</${element.localName}>`;
}
