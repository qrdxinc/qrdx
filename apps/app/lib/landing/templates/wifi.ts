import { WifiSquare } from "iconsax-reactjs";
import { templatePhoto } from "./media";
import { registerTemplate } from "./registry";

// A guest Wi-Fi page. Phone cameras join a network straight from a Wi-Fi QR
// code, but not every scanner app or older phone does, and a web page can't
// join one for the visitor: the page shows the network, a password to copy
// and how to join by hand on iPhone and Android (the Wi-Fi block's steps,
// in each visitor's language), plus the owner's own house rules.

registerTemplate({
  type: "wifi",
  label: "Guest Wi-Fi page",
  description:
    "Network name, a password to copy and how to join on iPhone and Android",
  icon: WifiSquare,
  order: 40,
  variants: [
    {
      id: "cafe",
      name: "Café",
      description: "Free Wi-Fi with a few house rules",
      theme: {
        colors: {
          background: "#f6f3ee",
          foreground: "#1f1b16",
          primary: "#1f1b16",
          primaryForeground: "#f6f3ee",
          muted: "#ebe5dc",
          mutedForeground: "#5f574c",
        },
        font: "dm-sans",
        headingFont: "fraunces",
        radius: 16,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "banner",
            cover: templatePhoto(
              "banner-coffee-bar",
              "A coffee bar with stools",
            ),
            eyebrow: "Lune Coffee",
            title: "Free Wi-Fi",
            size: "lg",
            subtitle: "Stay as long as you like.",
          },
        },
        {
          type: "wifi",
          props: {
            title: "Wi-Fi",
            ssid: "Lune-Guest",
            password: "flatwhite2026",
            security: "WPA",
            showSteps: true,
          },
        },
        {
          type: "text",
          props: {
            heading: "House rules",
            body: "Laptops are welcome at the long table.\nPlease take calls outside.\nThe network switches off when we close at 6 pm.",
            card: true,
          },
        },
      ],
    },
    {
      id: "rental",
      name: "Holiday rental",
      description: "Wi-Fi, house rules and a button to message the host",
      theme: {
        colors: {
          background: "#f3f7f4",
          foreground: "#14201a",
          primary: "#1f6f4a",
          primaryForeground: "#ffffff",
          muted: "#e3ece6",
          mutedForeground: "#4d5f55",
        },
        font: "rounded",
        headingFont: "bricolage",
        radius: 20,
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "hero",
            cover: templatePhoto("hero-lake", "A calm lake below the hills"),
            eyebrow: "Welcome to Lakeside Cabin",
            title: "Wi-Fi and house notes",
            size: "lg",
            subtitle: "Everything you need for your stay.",
          },
        },
        {
          type: "wifi",
          props: {
            title: "Wi-Fi",
            ssid: "LakesideCabin",
            password: "pine-cone-42",
            security: "WPA",
            showSecurity: true,
            showSteps: true,
            note: "The router is in the hallway cupboard if you need to restart it.",
          },
        },
        {
          type: "text",
          props: {
            heading: "House rules",
            body: "Check-out by 11 am.\nQuiet hours from 10 pm to 8 am.\nPlease put the bins out on Tuesday evening.",
          },
        },
        {
          type: "button",
          props: {
            label: "Message your host",
            url: "sms:+15550134",
            note: "Dana usually replies within the hour",
          },
        },
      ],
    },
    {
      id: "office",
      name: "Office visitors",
      description: "A hidden guest network with steps to add it by hand",
      theme: {
        colors: {
          background: "#ffffff",
          foreground: "#0a0a0a",
          primary: "#0a0a0a",
          primaryForeground: "#ffffff",
          muted: "#f4f4f5",
          mutedForeground: "#5d5d63",
        },
        font: "dm-sans",
        headingFont: "space-grotesk",
        radius: 10,
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Northwind Studio · Reception",
            title: "Guest network",
            size: "lg",
            subtitle: "For visitors to our office.",
          },
        },
        {
          type: "wifi",
          props: {
            title: "Wi-Fi",
            ssid: "NW-Visitors",
            password: "Welcome-to-NW",
            security: "WPA",
            hidden: true,
            showSecurity: true,
            showSteps: true,
            note: "Ask reception if you need a wired connection.",
          },
        },
        {
          type: "text",
          props: {
            heading: "Good to know",
            body: "The guest network is kept apart from our office network, so printers and shared drives aren't on it.",
          },
        },
      ],
    },
  ],
});
