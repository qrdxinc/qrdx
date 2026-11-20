// Tinted paper with a medium-deep ink: soft without going faint, so every
// one still clears the scan score's contrast line.
import { ink, type SeedDesign, shapes } from "./shared";

export const PASTEL_DESIGNS: SeedDesign[] = [
  {
    id: "peach-sorbet",
    name: "Peach sorbet",
    description:
      "Rounded modules in a rust brown with squircle eyes, on a pale peach. Soft and warm, for ice cream shops, nurseries and summer menus.",
    tags: ["pastel", "warm", "soft", "playful"],
    style: {
      ...ink("#FFF1E6", "#9A3412", "#7C2D12", "#9A3412"),
      ...shapes("rounded", "squircle", "extra-rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "mint-drop",
    name: "Mint drop",
    description:
      "Round dots in a deep teal with extra-rounded eyes and drop-shaped centres, on a pale mint. Cool and clean, for dentists, pharmacies and spas.",
    tags: ["pastel", "cool", "soft", "accessible"],
    style: {
      ...ink("#E6FBF4", "#115E59", "#134E4A", "#0F766E"),
      ...shapes("circle", "extra-rounded", "drop"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "lilac-rows",
    name: "Lilac rows",
    description:
      "Liquid rows in a deep violet with cushion eyes and purple centres, on a pale lilac. Dreamy and calm, for yoga studios, stationers and gift shops.",
    tags: ["pastel", "soft", "romantic", "zen"],
    style: {
      ...ink("#F3E8FF", "#4C1D95", "#3B0764", "#6D28D9"),
      ...shapes("liquid-horizontal", "cushion", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "butter",
    name: "Butter",
    description:
      "Large touching dots in a toast brown with rounded eyes, on a pale butter yellow. Cheerful and homely, for bakeries, brunch places and kids' clubs.",
    tags: ["pastel", "warm", "playful", "soft"],
    style: {
      ...ink("#FEF9C3", "#713F12", "#713F12", "#854D0E"),
      ...shapes("circle-large", "rounded", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "blush-hearts",
    name: "Blush hearts",
    description:
      "Heart-shaped modules in a deep rose with extra-rounded eyes and heart centres, on a blush white. For wedding stationery, florists and gift tags.",
    tags: ["pastel", "romantic", "soft", "playful"],
    style: {
      ...ink("#FFF1F2", "#9F1239", "#881337", "#BE123C"),
      ...shapes("heart", "extra-rounded", "heart"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "pale-sky",
    name: "Pale sky",
    description:
      "Horizontal lines in a deep sea blue with squircle eyes, on a pale sky blue. Light and orderly, for travel documents, clinics and newsletters.",
    tags: ["pastel", "cool", "soft", "professional"],
    style: {
      ...ink("#E0F2FE", "#0C4A6E", "#075985", "#0369A1"),
      ...shapes("horizontal-line", "squircle", "squircle"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "sage-plus",
    name: "Sage plus",
    description:
      "Plus-shaped modules in a deep green with extra-rounded eyes and plus centres, on a pale sage white. Fresh and gentle, for plant shops and wellness.",
    tags: ["pastel", "nature", "soft", "spring"],
    style: {
      ...ink("#ECFDF3", "#14532D", "#166534", "#166534"),
      ...shapes("plus", "extra-rounded", "plus"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "lavender-stars",
    name: "Lavender stars",
    description:
      "Star-shaped modules in a deep indigo with squircle eyes, on a pale lavender. Playful but still tidy, for kids' parties, planetariums and night markets.",
    tags: ["pastel", "playful", "midnight", "soft"],
    style: {
      ...ink("#EEF2FF", "#3730A3", "#312E81", "#4338CA"),
      ...shapes("star", "squircle", "rounded"),
      level: "M",
      margin: 4,
    },
  },
  {
    id: "candy-floss",
    name: "Candy floss",
    description:
      "Scattered dots of mixed sizes in a deep pink with extra-rounded eyes and flower centres, on a pale pink. Sweet and busy, for sweet shops and fairs.",
    tags: ["pastel", "candy", "playful", "soft"],
    style: {
      ...ink("#FCE7F3", "#BE185D", "#9D174D", "#BE185D"),
      ...shapes("random-dots", "extra-rounded", "flower"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "seafoam-hex",
    name: "Seafoam hex",
    description:
      "Hexagon modules in a deep cyan with squircle eyes, on a pale aqua white. Cool and geometric, for swim schools, aquariums and seaside shops.",
    tags: ["pastel", "ocean", "cool", "geometric"],
    style: {
      ...ink("#ECFEFF", "#0E7490", "#155E75", "#0E7490"),
      ...shapes("hexagon", "squircle", "hexagon"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "apricot",
    name: "Apricot",
    description:
      "Mixed dots in a deep rust with rounded eyes in burnt orange, on a pale apricot. Warm and soft, for brunch menus, florists and summer events.",
    tags: ["pastel", "warm", "soft", "sunset"],
    style: {
      ...ink("#FFEDD5", "#7C2D12", "#9A3412", "#9A3412"),
      ...shapes("circle-mixed", "rounded", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "powder-blue",
    name: "Powder blue",
    description:
      "Classy modules in a deep navy with drop-shaped eyes in royal blue, on a powder blue, hanging from a navy tag that says Scan the tag. For clothing labels.",
    tags: ["pastel", "cool", "elegant", "e-commerce"],
    style: {
      ...ink("#DBEAFE", "#1E3A8A", "#1E40AF", "#1D4ED8"),
      ...shapes("classy", "drop", "drop"),
      level: "Q",
      margin: 3,
      frame: {
        style: "tag",
        text: "Scan the tag",
        color: "#1E3A8A",
        textColor: "#FFFFFF",
      },
    },
  },
];
