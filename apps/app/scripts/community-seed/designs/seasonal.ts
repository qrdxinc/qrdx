// Holidays and seasons, each on one of the engine's seasonal frames. The
// frames keep their own festive colors where they fit the ink.
import { eyes, ink, type SeedDesign, shapes } from "./shared";

export const SEASONAL_DESIGNS: SeedDesign[] = [
  {
    id: "wreath",
    name: "Wreath",
    description:
      "Rounded modules in a deep green with red rounded eyes, on white, inside the Christmas wreath frame. For holiday menus, markets and gift tags.",
    tags: ["winter", "warm", "soft", "nature"],
    style: {
      ...ink("#FFFFFF", "#14532D", "#991B1B", "#991B1B"),
      ...shapes("rounded", "rounded", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "christmas-wreath", color: "#14532D" },
  },
  {
    id: "candlelight",
    name: "Candlelight",
    description:
      "Round dots in a dark chestnut with rounded eyes and amber brown centres, on a warm white, on the Christmas candle frame. For carol services and church notices.",
    tags: ["winter", "warm", "elegant", "soft"],
    style: {
      ...ink("#FFF7ED", "#7C2D12", "#7C2D12", "#92400E"),
      ...shapes("circle", "rounded", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "christmas-candle", color: "#7C2D12" },
  },
  {
    id: "fireworks",
    name: "Fireworks",
    description:
      "Star-shaped modules in a deep indigo with extra-rounded eyes and red flower centres, on white, on the New Year firework frame. For countdown parties.",
    tags: ["midnight", "playful", "vibrant", "winter"],
    style: {
      ...ink("#FFFFFF", "#1E1B4B", "#1E1B4B", "#BE123C"),
      ...shapes("star", "extra-rounded", "flower"),
      level: "M",
      margin: 3,
    },
    frame: { id: "new-year-firework", color: "#1E1B4B" },
  },
  {
    id: "red-lantern",
    name: "Red lantern",
    description:
      "Square modules in a lantern red with pointed flame-shaped eyes in a deeper red and golden brown centres, on a warm white, on the lunar lantern frame. For Lunar New Year.",
    tags: ["warm", "bold", "vibrant", "colorful"],
    style: {
      ...ink("#FFF7ED", "#991B1B", "#7F1D1D", "#854D0E"),
      ...shapes("square", "diya", "diya"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "lunar-lantern" },
  },
  {
    id: "diya",
    name: "Diya",
    description:
      "Large touching dots in a deep chestnut with diya-shaped eyes in burnt orange and reversed diya centres in gold brown, on a pale butter, on the Diwali diya frame.",
    tags: ["warm", "vibrant", "elegant", "autumn"],
    style: {
      ...ink("#FFFBEB", "#7C2D12", "#9A3412", "#854D0E"),
      ...shapes("circle-large", "diya", "diya-reverse"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "diwali-diya" },
  },
  {
    id: "color-splash",
    name: "Color splash",
    description:
      "Scattered dots in a deep indigo with petal eyes in pink, violet and teal, on white, on the Holi splash frame. One color on each corner, for Holi events.",
    tags: ["colorful", "playful", "vibrant", "spring"],
    style: {
      ...ink("#FFFFFF", "#1E1B4B"),
      ...shapes("random-dots", "petal", "flower"),
      ...eyes("#BE185D", "#6D28D9", "#0E7490"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "holi-splash" },
  },
  {
    id: "trick-or-treat",
    name: "Trick or treat",
    description:
      "Round dots in a near-black with octagon eyes in burnt orange, on a warm white, on the Halloween pumpkin frame. For trick-or-treat trails and haunted houses.",
    tags: ["autumn", "playful", "bold", "warm"],
    style: {
      ...ink("#FFF7ED", "#1C1917", "#9A3412", "#9A3412"),
      ...shapes("circle", "octagon", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "halloween-pumpkin" },
  },
  {
    id: "sweetheart",
    name: "Sweetheart",
    description:
      "Heart-shaped modules in a deep rose with petal eyes and heart centres, on a blush white, on the valentine heart frame. For Valentine's menus and cards.",
    tags: ["romantic", "soft", "playful", "warm"],
    style: {
      ...ink("#FFF1F2", "#9F1239", "#881337", "#9F1239"),
      ...shapes("heart", "petal", "heart"),
      level: "M",
      margin: 3,
    },
    frame: { id: "valentine-heart", color: "#9F1239" },
  },
  {
    id: "crescent",
    name: "Crescent",
    description:
      "Octagon modules in a deep indigo with indigo octagon eyes and deep gold centres, on a cool white, on the Ramadan crescent frame. For iftar menus and mosque notices.",
    tags: ["midnight", "elegant", "geometric", "cool"],
    style: {
      ...ink("#F8FAFC", "#1E1B4B", "#312E81", "#7A5A14"),
      ...shapes("octagon", "octagon", "octagon"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "ramadan-crescent", color: "#1E1B4B" },
  },
  {
    id: "lantern-green",
    name: "Lantern green",
    description:
      "Classy modules in a deep green with rounded eyes and deep gold centres, on white, on the Eid lantern frame in green and gold. For Eid greetings and gift tags.",
    tags: ["elegant", "forest", "warm", "soft"],
    style: {
      ...ink("#FFFFFF", "#14532D", "#14532D", "#7A5A14"),
      ...shapes("classy", "rounded", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "eid-fitr-lantern", color: "#14532D" },
  },
  {
    id: "menorah-blue",
    name: "Menorah blue",
    description:
      "Square modules in a deep blue with squircle eyes and deep gold centres, on white, on the Hanukkah menorah frame. For community dinners and school notices.",
    tags: ["cool", "elegant", "winter", "geometric"],
    style: {
      ...ink("#FFFFFF", "#1E3A8A", "#1E3A8A", "#7A5A14"),
      ...shapes("square", "squircle", "square"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "hanukkah-menorah", color: "#1E3A8A" },
  },
  {
    id: "blossom-branch",
    name: "Blossom branch",
    description:
      "Leaf-shaped modules in a deep pink with petal eyes and flower centres, on a blush white, on the spring blossom frame. For garden centres and spring sales.",
    tags: ["spring", "soft", "nature", "romantic"],
    style: {
      ...ink("#FDF2F8", "#9D174D", "#BE185D", "#9D174D"),
      ...shapes("leaf", "petal", "flower"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "spring-blossom" },
  },
  {
    id: "summer-tide",
    name: "Summer tide",
    description:
      "Liquid rows in a deep sea blue with squircle eyes and drop centres, on a pale sky, on the summer waves frame. For beach bars, lidos and summer hours.",
    tags: ["ocean", "cool", "tropical", "soft"],
    style: {
      ...ink("#F0F9FF", "#0C4A6E", "#075985", "#0369A1"),
      ...shapes("liquid-horizontal", "squircle", "drop"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "summer-waves", color: "#0C4A6E" },
  },
  {
    id: "maple",
    name: "Maple",
    description:
      "Leaf-shaped modules in a deep chestnut with reversed leaf eyes in burnt orange and gold brown centres, on a warm white, on the autumn maple frame.",
    tags: ["autumn", "warm", "nature", "earthy"],
    style: {
      ...ink("#FFF7ED", "#7C2D12", "#9A3412", "#854D0E"),
      ...shapes("leaf", "leaf-reverse", "leaf"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "autumn-maple" },
  },
  {
    id: "crystal",
    name: "Crystal",
    description:
      "Plus-shaped modules in a deep blue with octagon eyes and rounded-cross centres in royal blue, on an ice white, on the winter crystal frame. For ski hire and winter sales.",
    tags: ["winter", "cool", "geometric", "nordic"],
    style: {
      ...ink("#F0F9FF", "#1E3A8A", "#1E40AF", "#1D4ED8"),
      ...shapes("plus", "octagon", "cross-rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "winter-crystal", color: "#1E3A8A" },
  },
  {
    id: "wheat-and-amber",
    name: "Wheat and amber",
    description:
      "Hexagon modules in a dark amber with extra-rounded eyes in toast brown and amber centres, on a pale butter, on the Thanksgiving wheat frame. For harvest menus.",
    tags: ["autumn", "warm", "earthy", "nature"],
    style: {
      ...ink("#FFFBEB", "#78350F", "#713F12", "#92400E"),
      ...shapes("hexagon", "extra-rounded", "hexagon"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "thanksgiving-wheat", color: "#4A3222" },
  },
  {
    id: "rainbow-eyes",
    name: "Rainbow eyes",
    description:
      "Rounded modules in a dark navy with squircle eyes in red, green and blue, on white, on the Pride rainbow frame. For Pride events, bars and community groups.",
    tags: ["colorful", "playful", "vibrant", "bold"],
    style: {
      ...ink("#FFFFFF", "#111827"),
      ...shapes("rounded", "squircle", "rounded"),
      ...eyes("#B91C1C", "#15803D", "#1D4ED8"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "pride-rainbow" },
  },
];
