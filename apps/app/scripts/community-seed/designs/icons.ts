// One of the editor's quick icons in the middle, on the frame that matches
// it. Level H, so the icon's footprint is repaired with room to spare.
import { ink, type SeedDesign, shapes } from "./shared";

export const ICON_DESIGNS: SeedDesign[] = [
  {
    id: "guest-wifi",
    name: "Guest Wi-Fi",
    description:
      "Rounded modules in a dark navy with extra-rounded eyes and squircle centres in cobalt, on white, with a Wi-Fi icon in the middle, on the Wi-Fi card frame.",
    tags: ["professional", "cool", "minimal", "corporate"],
    style: {
      ...ink("#FFFFFF", "#0F172A", "#0F172A", "#1D4ED8"),
      ...shapes("rounded", "extra-rounded", "squircle"),
      level: "H",
      margin: 3,
      showLogo: true,
    },
    frame: { id: "wifi-card", color: "#0F172A", textColor: "#FFFFFF" },
    logoIcon: "wifi",
  },
  {
    id: "wifi-sticker",
    name: "Wi-Fi sticker",
    description:
      "Black round dots with gear eyes and a Wi-Fi icon in the middle, on white, on the Wi-Fi sticker frame. For the till, the fridge door and the back of the menu.",
    tags: ["minimal", "monochrome", "high-contrast", "accessible"],
    style: {
      ...ink("#FFFFFF", "#111827"),
      ...shapes("circle", "gear", "circle"),
      level: "H",
      margin: 3,
      showLogo: true,
    },
    frame: { id: "wifi-sticker", color: "#111827" },
    logoIcon: "wifi",
  },
  {
    id: "call-us",
    name: "Call us",
    description:
      "Rounded modules in a deep teal with a phone icon in the middle, on a mint white, on the scan to call frame. For vans, shop doors and service leaflets.",
    tags: ["professional", "cool", "minimal", "corporate"],
    style: {
      ...ink("#F0FDFA", "#134E4A", "#134E4A", "#0F766E"),
      ...shapes("rounded", "rounded", "rounded"),
      level: "H",
      margin: 3,
      showLogo: true,
    },
    frame: { id: "scan-to-call", color: "#134E4A", textColor: "#F0FDFA" },
    logoIcon: "phone",
  },
  {
    id: "write-to-us",
    name: "Write to us",
    description:
      "Square modules in a dark slate with rounded eyes and an email icon in the middle, on white, on the scan to email frame. For contact pages and business cards.",
    tags: ["professional", "minimal", "corporate", "accessible"],
    style: {
      ...ink("#FFFFFF", "#1F2937", "#1F2937", "#4B5563"),
      ...shapes("square", "rounded", "rounded"),
      level: "H",
      margin: 3,
      showLogo: true,
    },
    frame: { id: "scan-to-email", color: "#1F2937" },
    logoIcon: "email",
  },
  {
    id: "all-our-links",
    name: "All our links",
    description:
      "Large touching dots in a deep violet with bevelled eyes and a link icon in the middle, on a pale lilac, on the all our links frame. For creators and bands.",
    tags: ["startup", "vibrant", "portfolio", "blog"],
    style: {
      ...ink("#FAF5FF", "#4C1D95", "#4C1D95", "#6D28D9"),
      ...shapes("circle-large", "bevel", "rounded"),
      level: "H",
      margin: 3,
      showLogo: true,
    },
    frame: { id: "social-links", color: "#4C1D95" },
    logoIcon: "link",
  },
  {
    id: "download-sheet",
    name: "Download sheet",
    description:
      "Classy rounded modules in a dark slate with square eyes and a file icon in the middle, on white, on the scan to download frame. For spec sheets and menus as PDFs.",
    tags: ["professional", "minimal", "corporate", "flat"],
    style: {
      ...ink("#FFFFFF", "#1E293B", "#1E293B", "#1E293B"),
      ...shapes("classy-rounded", "square", "square"),
      level: "H",
      margin: 3,
      showLogo: true,
    },
    frame: {
      id: "scan-to-download-file",
      color: "#1E293B",
      textColor: "#FFFFFF",
    },
    logoIcon: "file",
  },
  {
    id: "mark-the-date",
    name: "Mark the date",
    description:
      "Rounded modules in a deep rose with squircle eyes and a calendar icon in the middle, on a blush white, on the add to calendar frame. For invitations and events.",
    tags: ["romantic", "soft", "elegant", "professional"],
    style: {
      ...ink("#FFF1F2", "#881337", "#881337", "#9F1239"),
      ...shapes("rounded", "squircle", "squircle"),
      level: "H",
      margin: 3,
      showLogo: true,
    },
    frame: { id: "add-to-calendar", color: "#881337", textColor: "#FFF1F2" },
    logoIcon: "calendar",
  },
  {
    id: "map-pin",
    name: "Map pin",
    description:
      "Liquid modules in a deep green with rounded eyes and a location pin in the middle, on a mint white, on the see the map frame. For flyers, menus and event tickets.",
    tags: ["nature", "professional", "cool", "accessible"],
    style: {
      ...ink("#ECFDF5", "#064E3B", "#064E3B", "#065F46"),
      ...shapes("liquid", "rounded", "rounded"),
      level: "H",
      margin: 3,
      showLogo: true,
    },
    frame: { id: "see-the-map", color: "#064E3B", textColor: "#ECFDF5" },
    logoIcon: "location",
  },
  {
    id: "wifi-plain",
    name: "Wi-Fi plain",
    description:
      "Rounded modules in a dark navy with octagon eyes and a Wi-Fi icon in the middle, on white, with no frame. For when the sign around it already says what to do.",
    tags: ["minimal", "professional", "cool", "flat"],
    style: {
      ...ink("#FFFFFF", "#0C3B5E", "#0C3B5E", "#0E6BA8"),
      ...shapes("rounded", "octagon", "octagon"),
      level: "H",
      margin: 4,
      showLogo: true,
    },
    logoIcon: "wifi",
  },
];
