// Designs that show the shapes added after qrdx 0.0.57: the pebble body,
// the porthole, notch, plus, stamp, bud and bowl eyes and the
// cushion centre, each in at least three designs. Deep inks on pale grounds,
// like the pastel group, so each one clears the gallery's contrast bar.
import { ink, type SeedDesign, shapes } from "./shared";

export const NEW_SHAPE_DESIGNS: SeedDesign[] = [
  {
    id: "creek-bed",
    name: "Creek bed",
    description:
      "Soft pebble tiles in a deep moss green with porthole eyes and cushion centres, on a pale sage. Calm and natural, for garden centres, trail maps and plant shops.",
    tags: ["nature", "earthy", "soft"],
    style: {
      ...ink("#EEF3EA", "#2F4A2A", "#24391F", "#2F4A2A"),
      ...shapes("pebble", "porthole", "cushion"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "night-ferry",
    name: "Night ferry",
    description:
      "Round dots in a deep navy with porthole eyes and round centres, on a pale sky blue. Quiet and nautical, for ferry timetables, harbour cafes and boat hire.",
    tags: ["cool", "professional", "minimal"],
    style: {
      ...ink("#E8F1FA", "#12294A", "#0B1C36", "#12294A"),
      ...shapes("circle", "porthole", "circle"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "tide-pool",
    name: "Tide pool",
    description:
      "Rounded modules in a dark teal with porthole eyes and rounded centres, on a pale aqua. Fresh and clean, for aquariums, swim schools and beach kiosks.",
    tags: ["cool", "soft", "nature"],
    style: {
      ...ink("#E4F7F5", "#0F4C4A", "#0A3836", "#0F4C4A"),
      ...shapes("rounded", "porthole", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "terrazzo",
    name: "Terrazzo",
    description:
      "Pebble tiles in a deep clay red with notch eyes and cushion centres, on a stone white. Grounded and modern, for tile shops, interior studios and cafes.",
    tags: ["earthy", "warm", "elegant"],
    style: {
      ...ink("#F5F0EA", "#7A2E1F", "#5E2216", "#7A2E1F"),
      ...shapes("pebble", "notch", "cushion"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "linen-fold",
    name: "Linen fold",
    description:
      "Rounded modules in a charcoal with notch eyes and cushion centres, on an oat linen. Understated, for tailors, bedding stores and craft fairs.",
    tags: ["minimal", "elegant", "soft"],
    style: {
      ...ink("#F2EEE6", "#2B2A28", "#1E1D1B", "#2B2A28"),
      ...shapes("rounded", "notch", "cushion"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "gallery-tag",
    name: "Gallery tag",
    description:
      "Classy modules in black with notch eyes and rounded centres, on a gallery white. Crisp and quiet, for exhibition labels, catalogues and studios.",
    tags: ["monochrome", "minimal", "elegant"],
    style: {
      ...ink("#FAFAF7", "#111111", "#0A0A0A", "#111111"),
      ...shapes("classy", "notch", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "apothecary",
    name: "Apothecary",
    description:
      "Round dots in a bottle green with plus eyes and rounded centres, on a pale mint cream. Clean and careful, for pharmacies, herbalists and wellness shops.",
    tags: ["cool", "professional", "nature"],
    style: {
      ...ink("#EEF6EF", "#14452F", "#0D3322", "#14452F"),
      ...shapes("circle", "plus", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "stitch-sampler",
    name: "Stitch sampler",
    description:
      "Plus-shaped modules in a deep plum with plus eyes and squircle centres, on an aida cream. Crafty and neat, for haberdashers, sewing classes and knit cafes.",
    tags: ["playful", "warm", "retro"],
    style: {
      ...ink("#FBF5EA", "#4A1942", "#371231", "#4A1942"),
      ...shapes("plus", "plus", "squircle"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "first-aid",
    name: "Sick bay",
    description:
      "Square modules in a deep red with plus eyes and rounded centres, on a clean white. Plain and direct, for clinics, safety posters and first-aid kits.",
    tags: ["bold", "high-contrast", "flat"],
    style: {
      ...ink("#FFFFFF", "#9B1C1C", "#7F1616", "#9B1C1C"),
      ...shapes("square", "plus", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "airmail",
    name: "Airmail",
    description:
      "Square modules in a navy with perforated stamp eyes and squircle centres, on a pale envelope blue. Neat and traditional, for post offices, pen pals and parcel desks.",
    tags: ["retro", "cool", "professional"],
    style: {
      ...ink("#EEF3FB", "#1B2A5C", "#121E45", "#1B2A5C"),
      ...shapes("square", "stamp", "squircle"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "first-class",
    name: "First class",
    description:
      "Rounded modules in a deep postbox red with stamp eyes and rounded centres, on a warm paper. Classic and tidy, for stationers, mailrooms and invitations.",
    tags: ["retro", "warm", "elegant"],
    style: {
      ...ink("#FBF4EA", "#8A1E15", "#6B160F", "#8A1E15"),
      ...shapes("rounded", "stamp", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "collector",
    name: "Collector",
    description:
      "Pebble tiles in a sepia brown with stamp eyes and cushion centres, on an album cream. Nostalgic, for antique shops, flea markets and hobby clubs.",
    tags: ["retro", "earthy", "warm"],
    style: {
      ...ink("#F8F1E4", "#4E3421", "#3B2718", "#4E3421"),
      ...shapes("pebble", "stamp", "cushion"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "seedling",
    name: "Seedling",
    description:
      "Classy rounded modules in a leaf green with bud eyes and rounded centres, on a pale spring green. Fresh and growing, for nurseries, seed packets and farm stands.",
    tags: ["nature", "soft", "playful"],
    style: {
      ...ink("#EFF7E8", "#24502A", "#1A3B1F", "#24502A"),
      ...shapes("classy-rounded", "bud", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "orchard",
    name: "Orchard",
    description:
      "Round dots in a deep plum with bud eyes and cushion centres, on a pale blossom pink. Gentle and seasonal, for orchards, jam makers and markets.",
    tags: ["nature", "warm", "soft"],
    style: {
      ...ink("#FCEFF3", "#5B1A3A", "#43122A", "#5B1A3A"),
      ...shapes("circle", "bud", "cushion"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "greenhouse",
    name: "Greenhouse",
    description:
      "Liquid modules in a forest green with bud eyes and rounded centres, on a pale glass green. Lush and calm, for plant shops, conservatories and botanical tours.",
    tags: ["nature", "cool", "elegant"],
    style: {
      ...ink("#EAF5EF", "#1D4A35", "#143626", "#1D4A35"),
      ...shapes("liquid", "bud", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "glaze",
    name: "Glaze",
    description:
      "Rounded modules in a cobalt with bowl eyes and rounded centres, on a porcelain white. Clean and crafted, for potters, ceramic studios and tableware shops.",
    tags: ["cool", "elegant", "minimal"],
    style: {
      ...ink("#F5F7FB", "#1E3A8A", "#172E6E", "#1E3A8A"),
      ...shapes("rounded", "bowl", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "noodle-bar",
    name: "Broth",
    description:
      "Round dots in a deep soy brown with bowl eyes and squircle centres, on a warm rice white. Homely, for noodle shops, ramen menus and takeaway bags.",
    tags: ["warm", "playful", "flat"],
    style: {
      ...ink("#FBF6EE", "#4A2A14", "#38200F", "#4A2A14"),
      ...shapes("circle", "bowl", "squircle"),
      level: "Q",
      margin: 4,
    },
    frame: { id: "cafe-cup", color: "#2B1D14", textColor: "#F8F1E7" },
  },
  {
    id: "hearth",
    name: "Hearth",
    description:
      "Classy rounded modules in a deep ember brown with bowl eyes and cushion centres, on an oatmeal. Cosy, for bakeries, soup kitchens and winter menus.",
    tags: ["warm", "earthy", "soft"],
    style: {
      ...ink("#F6EFE4", "#5A2B14", "#45200F", "#5A2B14"),
      ...shapes("classy-rounded", "bowl", "cushion"),
      level: "Q",
      margin: 4,
    },
  },
];
