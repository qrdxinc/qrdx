// Minimal, one ink on paper: for print, stationery and anything that has
// to sit quietly next to a logo.
import { ink, type SeedDesign, shapes } from "./shared";

export const MONO_DESIGNS: SeedDesign[] = [
  {
    id: "paper-ink",
    name: "Paper and ink",
    description:
      "Plain square modules in near-black on an off-white paper tone. The quietest look there is, for letterheads, invoices and anything that goes to a printer.",
    tags: ["minimal", "monochrome", "professional", "flat"],
    style: {
      ...ink("#FAFAF7", "#111111"),
      ...shapes("square", "square", "square"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "soft-graphite",
    name: "Soft graphite",
    description:
      "Rounded modules and rounded eyes in warm graphite on pale stone. Reads as friendly without using any color, so it fits most brands as it is.",
    tags: ["minimal", "monochrome", "soft", "professional"],
    style: {
      ...ink("#F5F5F4", "#292524"),
      ...shapes("rounded", "rounded", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "dot-matrix",
    name: "Dot matrix",
    description:
      "Small round dots with crisp square eyes, black on white. The dots soften the code while the eyes keep it looking technical, like an old printout.",
    tags: ["minimal", "monochrome", "high-contrast", "geometric"],
    style: {
      ...ink("#FFFFFF", "#0A0A0A"),
      ...shapes("circle", "square", "square"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "hairline",
    name: "Hairline",
    description:
      "Thin vertical lines with bevelled eyes and square centres, in charcoal on white. For packaging and labels where the code should look drawn rather than printed.",
    tags: ["minimal", "monochrome", "elegant", "geometric"],
    style: {
      ...ink("#FFFFFF", "#1C1917"),
      ...shapes("vertical-line", "bevel", "square"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "river-stone",
    name: "River stone",
    description:
      "Large touching dots with extra-rounded eyes, in a soft dark grey on pale stone. Smooth and low-key, for spas, ceramics and anything handmade.",
    tags: ["minimal", "monochrome", "soft", "zen"],
    style: {
      ...ink("#F5F5F4", "#44403C"),
      ...shapes("circle-large", "extra-rounded", "extra-rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "newsprint",
    name: "Newsprint",
    description:
      "Mosaic modules of mixed sizes with octagon eyes, in ink grey on a cool white. Has the texture of a halftone print, for magazines and posters.",
    tags: ["minimal", "monochrome", "vintage", "geometric"],
    style: {
      ...ink("#F9FAFB", "#1F2937"),
      ...shapes("mosaic", "octagon", "octagon"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "cross-stitch",
    name: "Cross stitch",
    description:
      "Plus-shaped modules with square eyes and plus centres, in deep navy black on white. Looks like embroidery up close and like a plain code from a distance.",
    tags: ["minimal", "monochrome", "geometric", "playful"],
    style: {
      ...ink("#FFFFFF", "#111827"),
      ...shapes("plus", "square", "plus"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "ruled-lines",
    name: "Ruled lines",
    description:
      "Horizontal lines with extra-rounded eyes and rounded centres, charcoal on warm white. The lines read like a ruled notebook page, for stationery and books.",
    tags: ["minimal", "monochrome", "soft", "professional"],
    style: {
      ...ink("#F7F7F5", "#1C1917"),
      ...shapes("horizontal-line", "extra-rounded", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "liquid-ink",
    name: "Liquid ink",
    description:
      "Flowing liquid modules with squircle eyes in a green-black ink on white. The modules join into blobs, so the code looks poured rather than printed.",
    tags: ["minimal", "monochrome", "soft", "elegant"],
    style: {
      ...ink("#FFFFFF", "#1F2421"),
      ...shapes("liquid", "squircle", "squircle"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "cut-corners",
    name: "Cut corners",
    description:
      "Classy modules with their corners rounded off, bevelled eyes and rounded centres, in black on white. A sharp look for architects, studios and law firms.",
    tags: ["minimal", "monochrome", "professional", "corporate"],
    style: {
      ...ink("#FFFFFF", "#0A0A0A"),
      ...shapes("classy-rounded", "bevel", "rounded"),
      level: "Q",
      margin: 4,
    },
  },
  {
    id: "honeycomb",
    name: "Honeycomb",
    description:
      "Hexagon modules with octagon eyes and hexagon centres, in warm charcoal on a pale paper tone, under a ribbon badge that says Scan me. For labels and jars.",
    tags: ["minimal", "monochrome", "geometric", "nature"],
    style: {
      ...ink("#FAFAF9", "#292524"),
      ...shapes("hexagon", "octagon", "hexagon"),
      level: "Q",
      margin: 3,
      frame: {
        style: "badge",
        text: "Scan me",
        color: "#292524",
        textColor: "#FAFAF9",
      },
    },
  },
  {
    id: "fine-grid",
    name: "Fine grid",
    description:
      "Small square modules with gaps between them, extra-rounded eyes and squircle centres, black on white. Airy and light, for minimal packaging and tags.",
    tags: ["minimal", "monochrome", "geometric", "elegant"],
    style: {
      ...ink("#FFFFFF", "#111111"),
      ...shapes("small-square", "extra-rounded", "squircle"),
      level: "M",
      margin: 4,
    },
  },
];
