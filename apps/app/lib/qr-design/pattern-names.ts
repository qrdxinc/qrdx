// The names the editor gives the dot, eye and eye dot patterns it offers
// (its pattern pickers list these), so anything that names a design's parts
// (a community theme's page) uses the same words. Safe on the server.
import type {
  BodyPattern,
  CornerEyeDotPattern,
  CornerEyePattern,
  PickableCornerEyeDotPattern,
  PickableCornerEyePattern,
} from "qrdx/types";

// Every body pattern, simplest first (23: no lone tile in 3 or 4 columns)
export const BODY_PATTERNS: { id: BodyPattern; name: string }[] = [
  { id: "square", name: "Square" },
  { id: "rounded", name: "Rounded" },
  { id: "circle", name: "Circle" },
  { id: "circle-large", name: "Circle Large" },
  { id: "small-square", name: "Small Square" },
  { id: "random-dots", name: "Random Dots" },
  { id: "liquid", name: "Liquid" },
  { id: "liquid-horizontal", name: "Liquid Rows" },
  { id: "liquid-vertical", name: "Liquid Columns" },
  { id: "classy", name: "Classy" },
  { id: "classy-rounded", name: "Classy Rounded" },
  { id: "leaf", name: "Leaf" },
  { id: "horizontal-line", name: "Horizontal Line" },
  { id: "vertical-line", name: "Vertical Line" },
  { id: "diamond", name: "Diamond" },
  { id: "octagon", name: "Octagon" },
  { id: "hexagon", name: "Hexagon" },
  { id: "mosaic", name: "Mosaic" },
  { id: "plus", name: "Plus" },
  { id: "star", name: "Star" },
  { id: "heart", name: "Heart" },
  { id: "pacman", name: "Pacman" },
  { id: "circle-mixed", name: "Mixed" },
];

// Every offered eye frame (curly was retired: it doesn't scan reliably;
// saved designs that use it still render)
export const EYE_PATTERNS: { id: PickableCornerEyePattern; name: string }[] = [
  { id: "square", name: "Square" },
  { id: "rounded", name: "Rounded" },
  { id: "extra-rounded", name: "Extra Rounded" },
  { id: "squircle", name: "Squircle" },
  { id: "cushion", name: "Cushion" },
  { id: "bevel", name: "Bevel" },
  { id: "octagon", name: "Octagon" },
  { id: "leaf", name: "Leaf" },
  { id: "leaf-reverse", name: "Leaf Reverse" },
  { id: "drop", name: "Drop" },
  { id: "petal", name: "Petal" },
  { id: "shield", name: "Shield" },
  { id: "diya", name: "Diya" },
  { id: "message", name: "Message" },
  { id: "pointy", name: "Pointy" },
  { id: "gear", name: "Gear" },
  { id: "circle", name: "Circle" },
];

// Every offered eye dot (diamond, star and banner were retired: they don't
// scan reliably; saved designs that use them still render)
export const EYE_DOT_PATTERNS: {
  id: PickableCornerEyeDotPattern;
  name: string;
}[] = [
  { id: "square", name: "Square" },
  { id: "rounded", name: "Rounded" },
  { id: "extra-rounded", name: "Extra Rounded" },
  { id: "circle", name: "Circle" },
  { id: "squircle", name: "Squircle" },
  { id: "octagon", name: "Octagon" },
  { id: "hexagon", name: "Hexagon" },
  { id: "dots", name: "Dots" },
  { id: "leaf", name: "Leaf" },
  { id: "leaf-reverse", name: "Leaf Reverse" },
  { id: "drop", name: "Drop" },
  { id: "drop-reverse", name: "Drop Reverse" },
  { id: "plus", name: "Plus" },
  { id: "cross-rounded", name: "Rounded Cross" },
  { id: "flower", name: "Flower" },
  { id: "heart", name: "Heart" },
  { id: "message", name: "Message" },
  { id: "message-reverse", name: "Message Reverse" },
  { id: "diya", name: "Diya" },
  { id: "diya-reverse", name: "Diya Reverse" },
  { id: "rounded-triangle", name: "Rounded Triangle" },
];

/** A pattern's name in the editor, or null for one it doesn't offer. */
const nameIn = <T extends string>(
  list: { id: T; name: string }[],
  id: string,
): string | null => list.find((pattern) => pattern.id === id)?.name ?? null;

export const bodyPatternName = (id: BodyPattern) => nameIn(BODY_PATTERNS, id);

export const eyePatternName = (id: CornerEyePattern) =>
  nameIn(EYE_PATTERNS, id);

export const eyeDotPatternName = (id: CornerEyeDotPattern) =>
  nameIn(EYE_DOT_PATTERNS, id);
