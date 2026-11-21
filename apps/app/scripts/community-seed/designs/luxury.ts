// Black and gold: a dark ink with a deep gold accent on ivory. The gold is
// kept dark (#7A5A14) so every part clears the contrast line on paper.
import { ink, type SeedDesign, shapes } from "./shared";

const GOLD = "#7A5A14";

export const LUXURY_DESIGNS: SeedDesign[] = [
  {
    id: "gilt-grid",
    name: "Gilt grid",
    description:
      "Black square modules and square eyes with deep gold eye centres, on ivory. The plainest luxury look, for jewellers, hotels and wine lists.",
    tags: ["elegant", "monochrome", "art-deco", "professional"],
    style: {
      ...ink("#FFFDF5", "#111111", "#111111", GOLD),
      ...shapes("square", "square", "square"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "black-tie",
    name: "Black tie",
    description:
      "Black vertical lines with bevelled eyes and deep gold octagon centres, on white. Formal and narrow, for galas, tailors and invitations.",
    tags: ["elegant", "high-contrast", "art-deco", "monochrome"],
    style: {
      ...ink("#FFFFFF", "#0A0A0A", "#0A0A0A", GOLD),
      ...shapes("vertical-line", "bevel", "octagon"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "champagne",
    name: "Champagne",
    description:
      "Large touching dots in a soft black with deep gold octagon eyes and black centres, on a champagne cream. For bars, hotels and celebrations.",
    tags: ["elegant", "warm", "romantic", "soft"],
    style: {
      ...ink("#FBF7EE", "#1C1917", GOLD, "#1C1917"),
      ...shapes("circle-large", "octagon", "circle"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "deco-fan",
    name: "Deco fan",
    description:
      "Diamond modules in a deep navy black with deep gold bevelled eyes and octagon centres, on ivory. A twenties feel, for cocktail bars and theatres.",
    tags: ["elegant", "art-deco", "geometric", "vintage"],
    style: {
      ...ink("#FFFDF5", "#111827", GOLD, "#111827"),
      ...shapes("diamond", "bevel", "octagon"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "velvet-rope",
    name: "Velvet rope",
    description:
      "Liquid modules in a plum black with cushion eyes and deep gold squircle centres, on a warm white. For members' clubs, VIP passes and perfume.",
    tags: ["elegant", "midnight", "romantic", "soft"],
    style: {
      ...ink("#FDFBF7", "#1F1024", "#1F1024", GOLD),
      ...shapes("liquid", "cushion", "squircle"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "gold-leaf",
    name: "Gold leaf",
    description:
      "Leaf-shaped modules in a soft black with deep gold leaf eyes and centres, on a warm ivory. For florists, tea houses and wedding menus.",
    tags: ["elegant", "nature", "romantic", "art-deco"],
    style: {
      ...ink("#FFFCF5", "#1C1917", GOLD, GOLD),
      ...shapes("leaf", "leaf", "leaf"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "gala-night",
    name: "Gala night",
    description:
      "Black round dots with bevelled eyes and deep gold octagon centres, on white, on the gala dinner frame in black and gold. For auctions, award nights and fundraisers.",
    tags: ["elegant", "midnight", "art-deco", "professional"],
    style: {
      ...ink("#FFFFFF", "#0A0A0A", "#0A0A0A", GOLD),
      ...shapes("circle", "bevel", "octagon"),
      level: "Q",
      margin: 3,
    },
    frame: {
      id: "event-gala",
      color: "#0A0A0A",
      textColor: "#FFFFFF",
      secondaryColor: "#B8862B",
    },
  },
  {
    id: "noir-hex",
    name: "Noir hex",
    description:
      "Black hexagon modules with deep gold octagon eyes and round black centres, on a pale cream. Tight and geometric, for watchmakers and whisky labels.",
    tags: ["elegant", "geometric", "art-deco", "monochrome"],
    style: {
      ...ink("#FAF7F0", "#111111", GOLD, "#111111"),
      ...shapes("hexagon", "octagon", "circle"),
      level: "Q",
      margin: 4,
    },
  },
];
