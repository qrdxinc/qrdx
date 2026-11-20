// Earth tones: clay, bark, moss, sand. Warm paper and brown-green inks.
import { ink, type SeedDesign, shapes } from "./shared";

export const EARTHY_DESIGNS: SeedDesign[] = [
  {
    id: "kiln",
    name: "Kiln",
    description:
      "Large touching dots in a fired rust with cushion eyes and terracotta centres, on a pale clay. For potters, tile showrooms and craft fairs.",
    tags: ["earthy", "warm", "soft", "vintage"],
    style: {
      ...ink("#F6E7DC", "#7C2D12", "#6B2A12", "#9A3412"),
      ...shapes("circle-large", "cushion", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "olive-grove",
    name: "Olive grove",
    description:
      "Leaf-shaped modules in a deep olive with leaf eyes and drop centres, on a pale olive white. For olive oil, farm shops and Mediterranean restaurants.",
    tags: ["earthy", "nature", "forest", "elegant"],
    style: {
      ...ink("#F4F6EC", "#3F6212", "#365314", "#3F6212"),
      ...shapes("leaf", "leaf", "drop"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "dune",
    name: "Dune",
    description:
      "Liquid rows in a warm sand brown with extra-rounded eyes and drop centres, on a pale sand, under a brown banner that says Scan for more. For resorts and linen shops.",
    tags: ["earthy", "warm", "soft", "zen"],
    style: {
      ...ink("#F7EFE3", "#6B4A2B", "#5A3D22", "#8A5A32"),
      ...shapes("liquid-horizontal", "extra-rounded", "drop"),
      level: "Q",
      margin: 3,
      frame: {
        style: "banner-top",
        text: "Scan for more",
        color: "#5A3D22",
        textColor: "#F7EFE3",
      },
    },
  },
  {
    id: "bark",
    name: "Bark",
    description:
      "Vertical lines in a dark bark brown with rounded eyes and lighter brown centres, on a pale birch. Rough-hewn and quiet, for timber yards and cabins.",
    tags: ["earthy", "nature", "forest", "minimal"],
    style: {
      ...ink("#F3EDE4", "#3E2A1E", "#3E2A1E", "#6B4A2B"),
      ...shapes("vertical-line", "rounded", "square"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "lichen",
    name: "Lichen",
    description:
      "Scattered dots in a mossy green with shield eyes and a brighter moss in the centres, on a pale stone. For trail maps, nature reserves and hiking gear.",
    tags: ["earthy", "nature", "forest", "soft"],
    style: {
      ...ink("#EEF1E6", "#374A2B", "#2F3F22", "#4F6A38"),
      ...shapes("random-dots", "shield", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "rust",
    name: "Rust",
    description:
      "Hexagon modules in a deep rust with bevelled eyes in a darker iron red, on a warm cream, in a rust envelope that says Scan to open. For workshops and letters.",
    tags: ["earthy", "warm", "industrial", "vintage"],
    style: {
      ...ink("#FBF3EC", "#7A2E16", "#5E2110", "#8A3716"),
      ...shapes("hexagon", "bevel", "hexagon"),
      level: "Q",
      margin: 3,
      frame: {
        style: "envelope",
        text: "Scan to open",
        color: "#7A2E16",
        textColor: "#FBF3EC",
      },
    },
  },
  {
    id: "cedar",
    name: "Cedar",
    description:
      "Classy rounded modules in a cedar brown with reversed leaf eyes, on a warm white. Smells of a wood shop, for carpenters, saunas and furniture makers.",
    tags: ["earthy", "warm", "nature", "elegant"],
    style: {
      ...ink("#FAF3EA", "#5C3A21", "#4A2E1A", "#7A4A2A"),
      ...shapes("classy-rounded", "leaf-reverse", "leaf-reverse"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "wheat-field",
    name: "Wheat field",
    description:
      "Plus-shaped modules in a toast brown with octagon eyes and plus centres in a golden brown, on a pale wheat. For bakeries, mills and farm shops.",
    tags: ["earthy", "warm", "nature", "autumn"],
    style: {
      ...ink("#FDF6E3", "#713F12", "#5A3210", "#854D0E"),
      ...shapes("plus", "octagon", "plus"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "slate-river",
    name: "Slate river",
    description:
      "Liquid columns in a blue slate with rounded eyes, on a pale slate white, inside a slate phone outline that says Open the app. For utilities and city services.",
    tags: ["earthy", "cool", "professional", "nordic"],
    style: {
      ...ink("#F1F5F9", "#334155", "#1E293B", "#475569"),
      ...shapes("liquid-vertical", "rounded", "rounded"),
      level: "Q",
      margin: 3,
      frame: {
        style: "phone",
        text: "Open the app",
        color: "#1E293B",
      },
    },
  },
  {
    id: "umber",
    name: "Umber",
    description:
      "Mosaic modules in a dark umber with rounded eyes and square centres, on a pale linen. Dense and warm, for leather goods, coffee roasters and bookbinders.",
    tags: ["earthy", "warm", "vintage", "minimal"],
    style: {
      ...ink("#F5EDE3", "#4A2C1A", "#3A2113", "#4A2C1A"),
      ...shapes("mosaic", "rounded", "square"),
      level: "Q",
      margin: 4,
    },
  },
];
