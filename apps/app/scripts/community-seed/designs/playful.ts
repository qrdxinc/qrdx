// Playful: more than one ink, cheerful shapes, a color on each eye.
import { eyes, ink, type SeedDesign, shapes } from "./shared";

export const PLAYFUL_DESIGNS: SeedDesign[] = [
  {
    id: "confetti",
    name: "Confetti",
    description:
      "Scattered dots in a deep violet with extra-rounded eyes in raspberry, teal and amber brown, on white. Each eye its own color, for parties and launches.",
    tags: ["playful", "colorful", "vibrant", "candy"],
    style: {
      ...ink("#FFFFFF", "#6D28D9"),
      ...shapes("random-dots", "extra-rounded", "dots"),
      ...eyes("#BE185D", "#0E7490", "#854D0E"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "bubblegum",
    name: "Bubblegum",
    description:
      "Large touching dots in a deep pink with petal eyes and flower centres, on a pale pink. Round and sweet, for sweet shops, kids' salons and party bags.",
    tags: ["playful", "candy", "soft", "romantic"],
    style: {
      ...ink("#FCE7F3", "#BE185D", "#9D174D", "#BE185D"),
      ...shapes("circle-large", "petal", "flower"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "building-blocks",
    name: "Building blocks",
    description:
      "Square modules in a dark slate with rounded eyes in red, blue and green, on white, in a white polaroid frame that says Scan me. For toy shops and nurseries.",
    tags: ["playful", "colorful", "bold", "geometric"],
    style: {
      ...ink("#FFFFFF", "#1F2937"),
      ...shapes("square", "rounded", "square"),
      ...eyes("#B91C1C", "#1D4ED8", "#15803D"),
      level: "Q",
      margin: 3,
      frame: {
        style: "polaroid",
        text: "Scan me",
        color: "#1F2937",
        textColor: "#FFFFFF",
      },
    },
  },
  {
    id: "star-jar",
    name: "Star jar",
    description:
      "Star-shaped modules in a golden brown with rounded eyes in rust and flower centres, on a pale lemon. For kids' events, bakeries and reward charts.",
    tags: ["playful", "warm", "candy", "soft"],
    style: {
      ...ink("#FEF9C3", "#854D0E", "#7C2D12", "#854D0E"),
      ...shapes("star", "rounded", "flower"),
      level: "M",
      margin: 4,
    },
  },
  {
    id: "plus-one",
    name: "Plus one",
    description:
      "Plus-shaped modules in royal blue with rounded eyes in navy and red plus centres, on white. Bright and simple, for invitations and school events.",
    tags: ["playful", "colorful", "bold", "geometric"],
    style: {
      ...ink("#FFFFFF", "#1D4ED8", "#1E3A8A", "#BE123C"),
      ...shapes("plus", "rounded", "plus"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "jelly",
    name: "Jelly",
    description:
      "Liquid modules in a jelly red with extra-rounded eyes and drop centres, on a blush white, in a red sticker that says Scan me. For dessert menus and candy.",
    tags: ["playful", "candy", "vibrant", "warm"],
    style: {
      ...ink("#FFF1F2", "#BE123C", "#9F1239", "#BE123C"),
      ...shapes("liquid", "extra-rounded", "drop"),
      level: "Q",
      margin: 3,
      frame: {
        style: "sticker",
        text: "Scan me",
        color: "#BE123C",
        textColor: "#FFFFFF",
      },
    },
  },
  {
    id: "hopscotch",
    name: "Hopscotch",
    description:
      "Hexagon modules in a deep cyan with rounded eyes in raspberry and cyan hexagon centres, on white. Two inks that bounce off each other, for playgrounds and camps.",
    tags: ["playful", "colorful", "cool", "geometric"],
    style: {
      ...ink("#FFFFFF", "#0E7490", "#BE185D", "#0E7490"),
      ...shapes("hexagon", "rounded", "hexagon"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "balloons",
    name: "Balloons",
    description:
      "Mixed dots in a deep violet with petal eyes in raspberry and flower centres, on a pale lilac. Floaty and fun, for birthdays and baby showers.",
    tags: ["playful", "colorful", "soft", "candy"],
    style: {
      ...ink("#FAF5FF", "#6D28D9", "#BE185D", "#6D28D9"),
      ...shapes("circle-mixed", "petal", "flower"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "beach-ball",
    name: "Beach ball",
    description:
      "Round dots in a dark navy with extra-rounded eyes in red, blue and green, on white. Primary colors on each corner, for pools, lidos and summer camps.",
    tags: ["playful", "colorful", "bold", "tropical"],
    style: {
      ...ink("#FFFFFF", "#111827"),
      ...shapes("circle", "extra-rounded", "rounded"),
      ...eyes("#B91C1C", "#1D4ED8", "#15803D"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "crayon-hearts",
    name: "Crayon hearts",
    description:
      "Heart-shaped modules in a crayon red with squircle eyes in royal blue and red heart centres, on a pale butter. For kids' cards, classrooms and bake sales.",
    tags: ["playful", "colorful", "romantic", "warm"],
    style: {
      ...ink("#FFFBEB", "#B91C1C", "#1D4ED8", "#B91C1C"),
      ...shapes("heart", "squircle", "heart"),
      level: "M",
      margin: 4,
    },
  },
];
