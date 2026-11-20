// Retro: cream grounds, seventies browns, diner reds, typewriter greys.
import { ink, type SeedDesign, shapes } from "./shared";

export const RETRO_DESIGNS: SeedDesign[] = [
  {
    id: "seventies",
    name: "Seventies",
    description:
      "Large touching dots in a deep rust with extra-rounded eyes in a mustard brown, on a warm cream. Groovy and soft, for record shops and vintage stores.",
    tags: ["retro", "warm", "vintage", "soft"],
    style: {
      ...ink("#FDF0D5", "#7C2D12", "#713F12", "#9A3412"),
      ...shapes("circle-large", "extra-rounded", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "postcard",
    name: "Postcard",
    description:
      "Classy modules in a vintage teal with square eyes in a faded rust, on an old-paper cream, on the postage stamp frame. For travel agents and souvenir shops.",
    tags: ["retro", "vintage", "warm", "elegant"],
    style: {
      ...ink("#F7F0E1", "#155E75", "#7C2D12", "#7C2D12"),
      ...shapes("classy", "square", "square"),
      level: "Q",
      margin: 3,
    },
    frame: {
      id: "postage-stamp",
      color: "#155E75",
      textColor: "#F7F0E1",
      text: "Scan me",
      secondaryText: "Greetings",
    },
  },
  {
    id: "diner",
    name: "Diner",
    description:
      "Mixed dots in a diner red with extra-rounded eyes in a darker red and navy centres, on a cream white. For burger joints, milkshake bars and bowling alleys.",
    tags: ["retro", "vibrant", "warm", "playful"],
    style: {
      ...ink("#FFFAF0", "#B91C1C", "#991B1B", "#1E3A8A"),
      ...shapes("circle-mixed", "extra-rounded", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "typewriter",
    name: "Typewriter",
    description:
      "Small square modules with bevelled eyes in a typewriter black, on an aged cream, inside a thin black border. For zines, poetry nights and bookshops.",
    tags: ["retro", "vintage", "monochrome", "minimal"],
    style: {
      ...ink("#F5EFE0", "#1C1917"),
      ...shapes("small-square", "bevel", "square"),
      level: "M",
      margin: 3,
      frame: {
        style: "border",
        text: "Scan me",
        color: "#1C1917",
      },
    },
  },
  {
    id: "mustard",
    name: "Mustard",
    description:
      "Square modules in a deep brown with extra-rounded eyes and golden brown centres, on a mustard yellow. Bold and warm, for sandwich shops and thrift stores.",
    tags: ["retro", "warm", "bold", "vintage"],
    style: {
      ...ink("#FDEBA6", "#713F12", "#713F12", "#854D0E"),
      ...shapes("square", "extra-rounded", "square"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "vinyl",
    name: "Vinyl",
    description:
      "Black round dots with gear eyes and deep red centres, on a warm white, on the scan to listen frame. For record shops, radio stations and album inserts.",
    tags: ["retro", "monochrome", "vintage", "bold"],
    style: {
      ...ink("#FFF7ED", "#1A1A1A", "#1A1A1A", "#B91C1C"),
      ...shapes("circle", "gear", "circle"),
      level: "Q",
      margin: 3,
    },
    frame: {
      id: "scan-to-listen",
      color: "#1A1A1A",
      textColor: "#FFF7ED",
      secondaryText: "Side A",
    },
  },
  {
    id: "teal-tiles",
    name: "Teal tiles",
    description:
      "Mosaic modules in a deep teal with squircle eyes and rust square centres, on a pale mint. Like a mid-century kitchen, for tile shops and diners.",
    tags: ["retro", "cool", "vintage", "geometric"],
    style: {
      ...ink("#F0F7F4", "#134E4A", "#134E4A", "#9A3412"),
      ...shapes("mosaic", "squircle", "square"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "cassette",
    name: "Cassette",
    description:
      "Horizontal lines in a deep indigo with bevelled eyes and red square centres, on a cool grey white. Eighties tape-deck colors, for DJs and mixtape links.",
    tags: ["retro", "cool", "vintage", "bold"],
    style: {
      ...ink("#F3F4F6", "#1E1B4B", "#1E1B4B", "#BE123C"),
      ...shapes("horizontal-line", "bevel", "square"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "arcade",
    name: "Arcade",
    description:
      "Black pac-shaped modules with square eyes and royal blue centres, on white, under a black speech bubble that says Scan to play. For arcades and game nights.",
    tags: ["retro", "playful", "high-contrast", "bold"],
    style: {
      ...ink("#FFFFFF", "#111111", "#111111", "#1D4ED8"),
      ...shapes("pacman", "square", "square"),
      level: "Q",
      margin: 3,
      frame: {
        style: "speech-bubble-top",
        text: "Scan to play",
        color: "#111111",
        textColor: "#FFFFFF",
      },
    },
  },
];
