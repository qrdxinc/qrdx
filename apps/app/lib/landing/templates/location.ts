import { Map as MapIcon } from "iconsax-reactjs";
import { templatePhoto } from "./media";
import { registerTemplate } from "./registry";

/** Opening hours, Monday first: [open, close] or null when closed. */
const week = (...days: Array<[string, string] | null>) =>
  days.map((day) =>
    day ? { ranges: [{ open: day[0], close: day[1] }] } : { ranges: [] },
  );

// One place: the address with a map, buttons that open Google Maps, Apple
// Maps or Waze, and the hours and notes people need to find the door.

registerTemplate({
  type: "location",
  label: "Location",
  description:
    "An address with a map, directions in Google Maps, Apple Maps or Waze, and opening hours",
  icon: MapIcon,
  order: 21,
  variants: [
    {
      id: "shop",
      name: "Shop",
      description: "Map, directions, opening hours and parking",
      theme: {
        colors: {
          background: "#fafaf9",
          foreground: "#171717",
          primary: "#171717",
          primaryForeground: "#fafaf9",
          muted: "#efeeec",
          mutedForeground: "#5c5b57",
        },
        font: "dm-sans",
        headingFont: "fraunces",
        radius: 14,
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "banner",
            cover: templatePhoto(
              "photo-red-door",
              "A red door in a brick wall",
            ),
            eyebrow: "Find us",
            title: "Paper & Pine",
            size: "lg",
            subtitle: "Stationery and small gifts in the Mission.",
          },
        },
        {
          type: "address-map",
          props: {
            title: "",
            name: "Paper & Pine",
            address: {
              street: "3150 18th Street",
              city: "San Francisco",
              region: "CA",
              postalCode: "94110",
              country: "USA",
            },
            note: "The door is on Harrison Street, next to the bike racks.",
            showMap: true,
            showWaze: true,
          },
        },
        {
          type: "hours",
          props: {
            title: "Opening hours",
            timezone: "America/Los_Angeles",
            days: week(
              null,
              ["10:00", "18:00"],
              ["10:00", "18:00"],
              ["10:00", "18:00"],
              ["10:00", "19:00"],
              ["10:00", "19:00"],
              ["11:00", "17:00"],
            ),
            note: "",
          },
        },
        {
          type: "text",
          props: {
            heading: "Getting here",
            body: "Street parking on 18th Street, free after 6 pm.\nThe 12 and 27 buses stop at the corner.",
          },
        },
      ],
    },
    {
      id: "venue",
      name: "Venue",
      description: "Where the entrance is, parking and step-free access",
      theme: {
        colors: {
          background: "#0e0e11",
          foreground: "#f4f4f5",
          primary: "#ebe5da",
          primaryForeground: "#0e0e11",
          muted: "#1b1b20",
          mutedForeground: "#a1a1aa",
        },
        font: "dm-sans",
        headingFont: "space-grotesk",
        radius: 16,
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "The Assembly Rooms",
            title: "How to find us",
            size: "lg",
            subtitle:
              "The main doors face the square; the side entrance has a ramp.",
          },
        },
        {
          type: "address-map",
          props: {
            title: "",
            name: "The Assembly Rooms",
            address: {
              street: "54 George Street",
              city: "Edinburgh",
              postalCode: "EH2 2LR",
              country: "United Kingdom",
            },
            note: "",
            showMap: true,
            showWaze: true,
          },
        },
        {
          type: "details",
          props: {
            items: [
              { label: "Nearest stop", value: "St Andrew Square trams" },
              {
                label: "Parking",
                value: "Castle Terrace car park, 10 minutes' walk",
              },
              {
                label: "Step-free access",
                value: "Yes, by the Rose Street door",
              },
              { label: "Cloakroom", value: "Ground floor, free" },
            ],
          },
        },
      ],
    },
    {
      id: "meeting-point",
      name: "Meeting point",
      description: "Where a tour or pick-up starts, and who to call",
      theme: {
        colors: {
          background: "#fffbf0",
          foreground: "#1a1712",
          primary: "#a52a12",
          primaryForeground: "#ffffff",
          muted: "#f6eedb",
          mutedForeground: "#5d5545",
        },
        font: "dm-sans",
        headingFont: "bricolage",
        radius: 12,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            eyebrow: "Old Town walking tour",
            title: "Meeting point",
            size: "lg",
            subtitle: "Look for the guide with the yellow umbrella.",
          },
        },
        {
          type: "address-map",
          props: {
            title: "",
            name: "Praça do Comércio",
            address: {
              street: "Praça do Comércio",
              city: "Lisbon",
              country: "Portugal",
            },
            note: "By the statue in the middle of the square.",
            showMap: true,
            showWaze: false,
          },
        },
        {
          type: "details",
          props: {
            items: [
              { label: "Starts", value: "10:00, every day" },
              { label: "Length", value: "About 2.5 hours" },
              { label: "Please arrive", value: "10 minutes early" },
            ],
          },
        },
        {
          type: "button",
          props: {
            label: "Call the guide",
            url: "tel:+15550187",
            note: "Running late? Call and we'll wait a few minutes.",
          },
        },
      ],
    },
  ],
});
