// Looks built around the less common eyes and centres (message, pointy and
// diya eyes; message, diya, triangle, cross and reversed drop centres), so
// every shape the editor offers has designs that show it off.
import { ink, type SeedDesign, shapes } from "./shared";

export const CATALOGUE_DESIGNS: SeedDesign[] = [
  {
    id: "speech-marks",
    name: "Speech marks",
    description:
      "Rounded modules in a deep sea blue with message-shaped eyes and message centres, on a pale sky white. The eyes read as little speech bubbles, for support and chat links.",
    tags: ["cool", "professional", "soft", "playful"],
    style: {
      ...ink("#F0F9FF", "#0C4A6E", "#0C4A6E", "#0369A1"),
      ...shapes("rounded", "message", "message"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "quote-card",
    name: "Quote card",
    description:
      "Classy modules in black with message-shaped eyes and message centres, on white. Crisp and editorial, for quote cards, book jackets and interviews.",
    tags: ["minimal", "monochrome", "high-contrast", "blog"],
    style: {
      ...ink("#FFFFFF", "#111111"),
      ...shapes("classy", "message", "message"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "chat-dots",
    name: "Chat dots",
    description:
      "Round dots in a deep violet with message-shaped eyes in a darker purple and message centres, on a pale lilac. Friendly and talkative, for messaging links and helplines.",
    tags: ["playful", "soft", "vibrant", "startup"],
    style: {
      ...ink("#FAF5FF", "#6D28D9", "#4C1D95", "#6D28D9"),
      ...shapes("circle", "message", "message"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "ask-away",
    name: "Ask away",
    description:
      "Classy rounded modules in a deep teal with message-shaped eyes and message centres in a brighter teal, on white. For FAQ pages, feedback forms and reception desks.",
    tags: ["professional", "cool", "soft", "minimal"],
    style: {
      ...ink("#FFFFFF", "#134E4A", "#134E4A", "#0F766E"),
      ...shapes("classy-rounded", "message", "message"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "pine",
    name: "Pine",
    description:
      "Vertical lines in a deep forest green with pointy eyes and rounded-triangle centres, on white. The triangles read as little pine trees, for lodges and trail signs.",
    tags: ["forest", "nature", "nordic", "winter"],
    style: {
      ...ink("#FFFFFF", "#14532D", "#14532D", "#166534"),
      ...shapes("vertical-line", "pointy", "rounded-triangle"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "arrowhead",
    name: "Arrowhead",
    description:
      "Square modules in a warm charcoal with pointy eyes and reversed drop centres, on a pale stone. Sharp corners everywhere, for outdoor gear and tool brands.",
    tags: ["minimal", "monochrome", "geometric", "industrial"],
    style: {
      ...ink("#F5F5F4", "#292524", "#1C1917", "#292524"),
      ...shapes("square", "pointy", "drop-reverse"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "compass-rose",
    name: "Compass rose",
    description:
      "Hexagon modules in a deep navy with pointy eyes and rounded-cross centres in rust, on white. For map boards, sailing clubs and travel guides.",
    tags: ["cool", "geometric", "vintage", "professional"],
    style: {
      ...ink("#FFFFFF", "#0F1F3D", "#0F1F3D", "#9A3412"),
      ...shapes("hexagon", "pointy", "cross-rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "pointy-rows",
    name: "Pointy rows",
    description:
      "Liquid rows in a deep plum with pointy eyes and square centres, on a blush white. Soft rows with sharp corners, for fashion labels and lookbooks.",
    tags: ["elegant", "romantic", "geometric", "soft"],
    style: {
      ...ink("#FDF2F8", "#831843", "#701A75", "#831843"),
      ...shapes("liquid-horizontal", "pointy", "square"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "oil-lamp",
    name: "Oil lamp",
    description:
      "Mixed dots in a deep rust with diya-shaped eyes and diya centres in gold brown, on a warm cream. For festival menus, incense and lamp shops.",
    tags: ["warm", "earthy", "vintage", "elegant"],
    style: {
      ...ink("#FBF3EC", "#7A2E16", "#7A2E16", "#854D0E"),
      ...shapes("circle-mixed", "diya", "diya"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "temple-bell",
    name: "Temple bell",
    description:
      "Rounded modules in a deep plum with diya-shaped eyes and reversed diya centres in deep gold, on ivory. For temples, yoga retreats and festival stalls.",
    tags: ["elegant", "warm", "zen", "romantic"],
    style: {
      ...ink("#FFFDF5", "#701A75", "#701A75", "#7A5A14"),
      ...shapes("rounded", "diya", "diya-reverse"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "lantern-row",
    name: "Lantern row",
    description:
      "Classy rounded modules in a deep red with squircle eyes and diya centres in gold brown, on a warm white. For street food stalls and night markets.",
    tags: ["warm", "vibrant", "bold", "vintage"],
    style: {
      ...ink("#FFF7ED", "#991B1B", "#7F1D1D", "#854D0E"),
      ...shapes("classy-rounded", "squircle", "diya"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "chomp",
    name: "Chomp",
    description:
      "Bitten dots in a dark navy with octagon eyes and reversed diya centres in cobalt, on white. Playful, for game shops and arcades.",
    tags: ["playful", "retro", "bold", "cool"],
    style: {
      ...ink("#FFFFFF", "#0F172A", "#0F172A", "#1D4ED8"),
      ...shapes("pacman", "octagon", "diya-reverse"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "raindrops",
    name: "Raindrops",
    description:
      "Rounded modules in a deep teal with drop-shaped eyes and reversed drop centres, on a pale mint. Soft and wet, for car washes, spas and water companies.",
    tags: ["cool", "ocean", "soft", "nature"],
    style: {
      ...ink("#E6FBF4", "#115E59", "#134E4A", "#0F766E"),
      ...shapes("rounded", "drop", "drop-reverse"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "dew",
    name: "Dew",
    description:
      "Round dots in a deep green with petal eyes and reversed drop centres in a brighter green, on a pale sage white. For garden centres, florists and dairies.",
    tags: ["nature", "spring", "soft", "pastel"],
    style: {
      ...ink("#ECFDF3", "#14532D", "#166534", "#15803D"),
      ...shapes("circle", "petal", "drop-reverse"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "perforation",
    name: "Perforation",
    description:
      "Mosaic modules in black with bevelled eyes and red rounded-triangle centres, on white. Like a torn ticket edge, for cinemas and box offices.",
    tags: ["bold", "high-contrast", "retro", "geometric"],
    style: {
      ...ink("#FFFFFF", "#0A0A0A", "#0A0A0A", "#BE123C"),
      ...shapes("mosaic", "bevel", "rounded-triangle"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "club-colors",
    name: "Club colors",
    description:
      "Octagon modules in a deep red with bevel eyes in navy and rounded-triangle centres, on white. For teams, clubs and fan days.",
    tags: ["bold", "vibrant", "geometric", "high-contrast"],
    style: {
      ...ink("#FFFFFF", "#991B1B", "#0F1F3D", "#991B1B"),
      ...shapes("octagon", "bevel", "rounded-triangle"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "pharmacy-cross",
    name: "Pharmacy cross",
    description:
      "Plus-shaped modules in a deep teal green with squircle eyes and rounded-cross centres, on a mint white. Calm and clinical, for pharmacies and first-aid points.",
    tags: ["cool", "professional", "accessible", "minimal"],
    style: {
      ...ink("#F0FDFA", "#0F3D33", "#0F3D33", "#0F5E55"),
      ...shapes("plus", "squircle", "cross-rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "dotted",
    name: "Dotted",
    description:
      "Liquid modules in a deep violet with extra-rounded eyes and dotted centres, on a pale lavender. Smooth blobs with a dotted middle, for design studios and print shops.",
    tags: ["soft", "playful", "vibrant", "geometric"],
    style: {
      ...ink("#F5F3FF", "#5B21B6", "#4C1D95", "#5B21B6"),
      ...shapes("liquid", "extra-rounded", "dots"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "leaf-back",
    name: "Leaf back",
    description:
      "Leaf-shaped modules in a deep olive with reversed leaf eyes and centres, on a pale olive white. Every leaf turned the other way, for herbalists and tea blenders.",
    tags: ["nature", "earthy", "forest", "soft"],
    style: {
      ...ink("#F4F6EC", "#365314", "#3F6212", "#365314"),
      ...shapes("leaf", "leaf-reverse", "leaf-reverse"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "reply",
    name: "Reply",
    description:
      "Large touching dots in a deep coral brown with extra-rounded eyes and reversed message centres, on a pale peach. For reply cards, RSVPs and comment boxes.",
    tags: ["warm", "soft", "playful", "sunset"],
    style: {
      ...ink("#FFF1E6", "#9A3412", "#7C2D12", "#9A3412"),
      ...shapes("circle-large", "extra-rounded", "message-reverse"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "comment",
    name: "Comment",
    description:
      "Rounded modules in a deep sea blue with squircle eyes and reversed message centres, on white. A speech bubble in each corner, for comment cards and feedback links.",
    tags: ["cool", "professional", "playful", "soft"],
    style: {
      ...ink("#FFFFFF", "#0C4A6E", "#0C4A6E", "#0369A1"),
      ...shapes("rounded", "squircle", "message-reverse"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "caption",
    name: "Caption",
    description:
      "Horizontal lines in a dark slate with bevelled eyes and reversed message centres, on white. Reads like subtitles, for video links, museums and galleries.",
    tags: ["minimal", "monochrome", "professional", "blog"],
    style: {
      ...ink("#FFFFFF", "#1E293B", "#1E293B", "#334155"),
      ...shapes("horizontal-line", "bevel", "message-reverse"),
      level: "Q",
      margin: 4,
    },
  },
];
