// Neon: dark ink on a bright ground (never light modules on dark, which
// some scanner apps miss), with dark frames for the night-time feel.
import { ink, type SeedDesign, shapes } from "./shared";

export const NEON_DESIGNS: SeedDesign[] = [
  {
    id: "volt",
    name: "Volt",
    description:
      "Black mosaic modules with bevelled eyes on an electric lime, between two black banners that say Scan me and Point your camera. For gig posters and streetwear.",
    tags: ["neon", "bold", "high-contrast", "brutalist"],
    style: {
      ...ink("#E2FF3B", "#0A0A0A"),
      ...shapes("mosaic", "bevel", "square"),
      level: "Q",
      margin: 3,
      frame: {
        style: "banner-top-bottom",
        text: "Scan me",
        secondaryText: "Point your camera",
        color: "#0A0A0A",
        textColor: "#E2FF3B",
      },
    },
  },
  {
    id: "hot-coral",
    name: "Hot coral",
    description:
      "Near-black rounded modules with extra-rounded eyes on a hot coral, in a black sticker that says Scan me. Loud and warm, for summer sales, festival wristbands and beach bars.",
    tags: ["neon", "bold", "vibrant", "tropical"],
    style: {
      ...ink("#FF6F61", "#111111"),
      ...shapes("rounded", "extra-rounded", "rounded"),
      level: "Q",
      margin: 3,
      frame: {
        style: "sticker",
        text: "Scan me",
        color: "#111111",
        textColor: "#FF6F61",
      },
    },
  },
  {
    id: "cyan-dots",
    name: "Cyan dots",
    description:
      "Black round dots with octagon eyes and round centres on a bright cyan, under a black banner that says Scan me. Cool and electric, for tech events, gaming cafés and club flyers.",
    tags: ["neon", "cool", "futuristic", "cyberpunk"],
    style: {
      ...ink("#22D3EE", "#0B0B0B"),
      ...shapes("circle", "octagon", "circle"),
      level: "Q",
      margin: 3,
      frame: {
        style: "banner-top",
        text: "Scan me",
        color: "#0B0B0B",
        textColor: "#22D3EE",
      },
    },
  },
  {
    id: "neon-pink",
    name: "Neon pink",
    description:
      "Near-black liquid modules with extra-rounded eyes on a neon pink, in a black sticker that says Scan me. For nail bars, record shops and night markets.",
    tags: ["neon", "bold", "candy", "vibrant"],
    style: {
      ...ink("#FF5CA8", "#140A14"),
      ...shapes("liquid", "extra-rounded", "squircle"),
      level: "Q",
      margin: 3,
      frame: {
        style: "sticker",
        text: "Scan me",
        color: "#140A14",
        textColor: "#FF5CA8",
      },
    },
  },
  {
    id: "tennis-ball",
    name: "Tennis ball",
    description:
      "Black touching dots with gear eyes on a tennis-ball yellow green, inside a black ring that says Scan me and Point your camera. For sports clubs and energy drinks.",
    tags: ["neon", "bold", "playful", "high-contrast"],
    style: {
      ...ink("#D4FF3F", "#1A1A1A"),
      ...shapes("circle-large", "gear", "circle"),
      level: "Q",
      margin: 3,
      frame: {
        style: "circle",
        text: "Scan me",
        secondaryText: "Point your camera",
        color: "#1A1A1A",
        textColor: "#D4FF3F",
      },
    },
  },
  {
    id: "safety-orange",
    name: "Safety orange",
    description:
      "Black square modules with bevelled eyes and rounded-triangle centres on a safety orange, over a black banner that says Scan here. Impossible to miss, for site signs, warehouses and workwear.",
    tags: ["neon", "bold", "high-contrast", "industrial"],
    style: {
      ...ink("#FF8A00", "#000000"),
      ...shapes("square", "bevel", "rounded-triangle"),
      level: "Q",
      margin: 3,
      frame: {
        style: "banner-bottom",
        text: "Scan here",
        color: "#000000",
        textColor: "#FF8A00",
      },
    },
  },
  {
    id: "neon-mint",
    name: "Neon mint",
    description:
      "Dark green-black horizontal lines with squircle eyes on a neon mint. Bright and crisp, for smoothie bars, vape-free gyms and app launches.",
    tags: ["neon", "cool", "vibrant", "futuristic"],
    style: {
      ...ink("#5CFFB0", "#061A14"),
      ...shapes("horizontal-line", "squircle", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "glitch-yellow",
    name: "Glitch yellow",
    description:
      "Black scattered dots with octagon eyes and square centres on a pure yellow. Jittery and bold, for zines, skate shops and warehouse parties.",
    tags: ["neon", "bold", "brutalist", "playful"],
    style: {
      ...ink("#FFE600", "#0A0A0A"),
      ...shapes("random-dots", "octagon", "square"),
      level: "Q",
      margin: 4,
    },
  },
];
