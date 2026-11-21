// One confident brand color each: for companies that have a color and want
// the code to carry it.
import { ink, linear, type SeedDesign, shapes } from "./shared";

export const BRAND_DESIGNS: SeedDesign[] = [
  {
    id: "electric-blue",
    name: "Electric blue",
    description:
      "Round dots in a bright cobalt with gear eyes and navy eye frames, on white, over a navy banner that says Scan to visit. For tech companies and product boxes.",
    tags: ["bold", "cool", "startup", "saas"],
    style: {
      ...ink("#FFFFFF", "#1D4ED8", "#1E3A8A", "#1D4ED8"),
      ...shapes("circle", "gear", "circle"),
      level: "Q",
      margin: 3,
      frame: {
        style: "banner-bottom",
        text: "Scan to visit",
        color: "#1E3A8A",
        textColor: "#FFFFFF",
      },
    },
  },
  {
    id: "forest-stamp",
    name: "Forest stamp",
    description:
      "Square modules with bevelled eyes in a deep forest green on a mint-white ground. Solid and dependable, for outdoor brands and sustainability reports.",
    tags: ["bold", "forest", "nature", "professional"],
    style: {
      ...ink("#F0FDF4", "#14532D", "#166534", "#166534"),
      ...shapes("square", "bevel", "square"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "cherry-pop",
    name: "Cherry pop",
    description:
      "Rounded modules in cherry red with extra-rounded eyes, on white, in a red speech bubble that says Hi there. For shop windows and friendly brands.",
    tags: ["bold", "vibrant", "playful", "warm"],
    style: {
      ...ink("#FFFFFF", "#BE123C", "#9F1239", "#BE123C"),
      ...shapes("rounded", "extra-rounded", "extra-rounded"),
      level: "Q",
      margin: 3,
      frame: {
        style: "speech-bubble",
        text: "Hi there",
        color: "#9F1239",
        textColor: "#FFFFFF",
      },
    },
  },
  {
    id: "royal-purple",
    name: "Royal purple",
    description:
      "Liquid modules in a rich violet with squircle eyes and brighter purple centres, on the palest lavender. For beauty brands, theatres and premium services.",
    tags: ["bold", "elegant", "vibrant", "romantic"],
    style: {
      ...ink("#FAF5FF", "#5B21B6", "#4C1D95", "#6D28D9"),
      ...shapes("liquid", "squircle", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "teal-tide",
    name: "Teal tide",
    description:
      "Liquid rows in a deep teal with rounded eyes, on a mint white, inside a teal rounded border that says Scan me. For clinics, pools and coastal brands.",
    tags: ["cool", "ocean", "professional", "soft"],
    style: {
      ...ink("#F0FDFA", "#115E59", "#134E4A", "#0F766E"),
      ...shapes("liquid-horizontal", "rounded", "rounded"),
      level: "Q",
      margin: 3,
      frame: {
        style: "rounded-border",
        text: "Scan me",
        color: "#134E4A",
      },
    },
  },
  {
    id: "marmalade",
    name: "Marmalade",
    description:
      "Mosaic modules in burnt orange with square eyes in a darker rust, on a pale peach. Warm and energetic, for juice bars, bakeries and summer sales.",
    tags: ["bold", "warm", "vibrant", "sunset"],
    style: {
      ...ink("#FFF7ED", "#9A3412", "#7C2D12", "#9A3412"),
      ...shapes("mosaic", "square", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "indigo-grid",
    name: "Indigo grid",
    description:
      "Square modules in deep indigo with octagon eyes and brighter indigo centres, on white, inside a border that fades from indigo to violet. For software and finance.",
    tags: ["bold", "cool", "corporate", "gradient"],
    style: {
      ...ink("#FFFFFF", "#312E81", "#1E1B4B", "#4338CA"),
      ...shapes("square", "octagon", "octagon"),
      level: "Q",
      margin: 3,
      frame: {
        style: "gradient-border",
        text: "Scan me",
        color: "#312E81",
        secondaryColor: "#6D28D9",
      },
    },
  },
  {
    id: "plum-drop",
    name: "Plum drop",
    description:
      "Leaf-shaped modules in deep plum with drop-shaped eyes and centres in raspberry, on a blush white. For wine labels, florists and perfume.",
    tags: ["bold", "elegant", "romantic", "nature"],
    style: {
      ...ink("#FDF2F8", "#831843", "#701A75", "#9D174D"),
      ...shapes("leaf", "drop", "drop"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "lime-ink",
    name: "Lime ink",
    description:
      "Hexagon modules in a deep olive lime with shield eyes and rounded-triangle centres, on a pale lime white. Fresh without being neon, for juice brands, gyms and garden centres.",
    tags: ["bold", "nature", "vibrant", "geometric"],
    style: {
      ...ink("#F7FEE7", "#3F6212", "#365314", "#3F6212"),
      ...shapes("hexagon", "shield", "rounded-triangle"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "sky-rounds",
    name: "Sky rounds",
    description:
      "Large round dots in a clear sky blue with squircle eyes in a deeper blue, on a pale sky white. Open and calm, for airlines, travel agents and weather apps.",
    tags: ["cool", "soft", "professional", "ocean"],
    style: {
      ...ink("#F0F9FF", "#0369A1", "#075985", "#0369A1"),
      ...shapes("circle-large", "squircle", "squircle"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "crimson-stripes",
    name: "Crimson stripes",
    description:
      "Vertical lines in a dark crimson with square eyes in a brighter red, on white. Strong and formal, for universities, sports clubs and annual reports.",
    tags: ["bold", "high-contrast", "corporate", "vibrant"],
    style: {
      ...ink("#FFFFFF", "#7F1D1D", "#991B1B", "#991B1B"),
      ...shapes("vertical-line", "square", "square"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "cocoa",
    name: "Cocoa",
    description:
      "Classy rounded modules in dark chocolate with rounded eyes and drop centres in a lighter cocoa, on cream, on a menu card that says Our menu. For chocolatiers and cafés.",
    tags: ["warm", "earthy", "elegant", "soft"],
    style: {
      ...ink("#FBF6EE", "#44281A", "#44281A", "#7C4A2D"),
      ...shapes("classy-rounded", "rounded", "drop"),
      level: "Q",
      margin: 3,
      frame: {
        style: "menu-card",
        text: "Our menu",
        secondaryText: "Enjoy",
        color: "#44281A",
      },
    },
  },
  {
    id: "deep-sea",
    name: "Deep sea",
    description:
      "Liquid columns that shade from navy to a deep teal, with extra-rounded eyes, on a pale blue white, in a navy chat bubble that says Message us. For support and booking.",
    tags: ["cool", "gradient", "ocean", "professional"],
    style: {
      ...ink(
        "#EFF6FF",
        linear(180, "#1E3A8A", "#0E7490"),
        "#1E3A8A",
        "#0E7490",
      ),
      ...shapes("liquid-vertical", "extra-rounded", "extra-rounded"),
      level: "Q",
      margin: 3,
      frame: {
        style: "chat-bubble",
        text: "Message us",
        color: "#1E3A8A",
        textColor: "#FFFFFF",
      },
    },
  },
  {
    id: "emerald",
    name: "Emerald",
    description:
      "Octagon modules in a deep emerald with octagon eyes and round centres in a brighter green, on a mint white. Polished and calm, for banks, spas and eco brands.",
    tags: ["bold", "forest", "elegant", "geometric"],
    style: {
      ...ink("#ECFDF5", "#065F46", "#064E3B", "#047857"),
      ...shapes("octagon", "octagon", "circle"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "magenta-hex",
    name: "Magenta hex",
    description:
      "Hexagon modules in deep magenta with bevelled eyes in a darker berry and bright pink centres, on white. For fashion, cosmetics and event posters.",
    tags: ["bold", "vibrant", "geometric", "candy"],
    style: {
      ...ink("#FFFFFF", "#9D174D", "#831843", "#BE185D"),
      ...shapes("hexagon", "bevel", "square"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "amber-mosaic",
    name: "Amber mosaic",
    description:
      "Mosaic modules in a deep amber brown with extra-rounded eyes, on a buttery white. Has the warmth of honey and toast, for breakfast spots and craft brewers.",
    tags: ["warm", "earthy", "vibrant", "autumn"],
    style: {
      ...ink("#FFFBEB", "#92400E", "#78350F", "#92400E"),
      ...shapes("mosaic", "extra-rounded", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
];
