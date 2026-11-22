import { SmsStar } from "iconsax-reactjs";
import { templatePhoto } from "./media";
import { registerTemplate } from "./registry";

// A short note behind a code: a heading, a few lines, an optional photo and
// one button. For a gift tag, a card in a parcel or a sign on a door.

registerTemplate({
  type: "message",
  label: "Message",
  description:
    "A short note behind a code: a gift message, a thank-you or a notice",
  icon: SmsStar,
  order: 60,
  variants: [
    {
      id: "gift-note",
      name: "Gift note",
      description: "A personal note with a photo and one button",
      theme: {
        colors: {
          background: "#f8f4ee",
          foreground: "#2c2723",
          primary: "#2c2723",
          primaryForeground: "#f8f4ee",
          muted: "#efe8de",
          mutedForeground: "#675e55",
        },
        font: "dm-sans",
        headingFont: "instrument-serif",
        radius: 18,
        buttonShape: "pill",
        spacing: "relaxed",
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "hero",
            cover: templatePhoto("hero-flowers", "A bunch of fresh flowers"),
            eyebrow: "For Maya",
            title: "Happy birthday!",
            size: "xl",
            subtitle: "A little something from Sam and Jo.",
          },
        },
        {
          type: "text",
          props: {
            heading: "",
            body: "Thirty looks good on you. We've booked a table at your favourite place for Saturday at eight, and the flowers are just the start.\n\nLove, Sam and Jo",
            size: "lg",
          },
        },
        {
          type: "button",
          props: {
            label: "See the booking",
            url: "https://example.com/booking",
            note: "Saturday, 8 pm",
          },
        },
      ],
    },
    {
      id: "thank-you",
      name: "Thank-you card",
      description: "A note for the card in every parcel",
      theme: {
        colors: {
          background: "#f3f7f4",
          foreground: "#14201a",
          primary: "#1f6f4a",
          primaryForeground: "#ffffff",
          muted: "#e3ece6",
          mutedForeground: "#4d5f55",
        },
        font: "dm-sans",
        headingFont: "fraunces",
        radius: 14,
      },
      blocks: [
        {
          type: "header",
          props: {
            eyebrow: "Juniper & Moss",
            title: "Thank you for your order",
            size: "lg",
            subtitle: "Packed by hand in our studio in Bristol.",
          },
        },
        {
          type: "image",
          props: {
            image: templatePhoto(
              "photo-meadow",
              "Walking through a sunny meadow",
            ),
            caption: "",
            aspect: "landscape",
          },
        },
        {
          type: "text",
          props: {
            heading: "",
            body: "We're a team of four, and every order still makes our day. We hope you love it as much as we loved making it. If anything isn't right, reply to your order email and we'll sort it out.",
          },
        },
        {
          type: "button",
          props: {
            label: "Tell us what you think",
            url: "https://example.com/review",
          },
        },
      ],
    },
    {
      id: "notice",
      name: "Notice",
      description: "A sign on the door: closed today, moved or back soon",
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
        headingFont: "dm-sans",
        radius: 10,
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Corner Books · Monday 14th",
            title: "Closed today",
            size: "xl",
            subtitle: "We're stocktaking and open again tomorrow at 9.",
          },
        },
        {
          type: "text",
          props: {
            heading: "",
            body: "Orders placed online today still go out tomorrow morning. Sorry for the trouble, and thank you for your patience.",
          },
        },
        {
          type: "button",
          props: {
            label: "Order online",
            url: "https://example.com/shop",
          },
        },
      ],
    },
  ],
});
