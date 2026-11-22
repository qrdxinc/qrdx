import { Lovely } from "iconsax-reactjs";
import { templatePhoto } from "./media";
import { registerTemplate } from "./registry";

// A personal invitation: who and when (the event block, with add to
// calendar), where with directions, the day's schedule, what to wear and an
// RSVP form whose replies reach the page's responses. Event start dates are
// left to the block default (a week from today), so a new page never starts
// out in the past.

registerTemplate({
  type: "invitation",
  label: "Invitation",
  description:
    "Names, date and venue with directions, the day's schedule and an RSVP",
  icon: Lovely,
  order: 42,
  variants: [
    {
      id: "wedding",
      name: "Wedding",
      description:
        "The day's schedule, dress code and an RSVP with meal choices",
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
        headingFont: "cormorant",
        radius: 8,
        spacing: "relaxed",
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "hero",
            cover: templatePhoto("hero-flowers", "A bunch of fresh flowers"),
            eyebrow: "Please join us for the wedding of",
            title: "Clara & Ben",
            size: "xl",
            subtitle: "We'd love you to be there.",
          },
        },
        {
          type: "event",
          props: {
            title: "Clara & Ben's wedding",
            description:
              "Ceremony in the orchard at seven, then dinner and dancing.",
            venue: "Oak Hill Farm",
            address: "Oak Hill Lane, Stow-on-the-Wold, United Kingdom",
            timeZone: "Europe/London",
            organizer: "Clara & Ben",
          },
        },
        {
          type: "timeline",
          props: {
            title: "The day",
            items: [
              { when: "6:30 pm", title: "Arrive", place: "The orchard" },
              { when: "7:00 pm", title: "Ceremony", place: "The orchard" },
              {
                when: "7:45 pm",
                title: "Drinks and photos",
                place: "The lawn",
              },
              { when: "8:30 pm", title: "Dinner", place: "The barn" },
              { when: "10:30 pm", title: "Dancing", place: "The barn" },
            ],
          },
        },
        {
          type: "address-map",
          props: {
            title: "Getting there",
            name: "",
            address: {
              street: "Oak Hill Lane",
              city: "Stow-on-the-Wold",
              country: "United Kingdom",
            },
            note: "Parking in the field by the gate.",
            showWaze: true,
          },
        },
        {
          type: "text",
          props: {
            heading: "Dress code",
            body: "Garden formal. The ceremony is on grass, so choose your shoes with care.",
            align: "center",
          },
        },
        {
          type: "form",
          props: {
            title: "Will you join us?",
            description: "Please reply by the first of next month.",
            fields: [
              {
                id: "name",
                type: "text",
                label: "Your name",
                required: true,
                maxLength: 120,
              },
              {
                id: "attending",
                type: "choice",
                label: "Can you come?",
                required: true,
                options: ["Joyfully accept", "Regretfully decline"],
              },
              {
                id: "meal",
                type: "choice",
                label: "Dinner",
                options: ["Lamb", "Fish", "Vegetarian"],
              },
              {
                id: "dietary",
                type: "text",
                label: "Allergies or dietary needs",
                maxLength: 300,
              },
            ],
            submitLabel: "Send RSVP",
            successMessage: "Thank you! We can't wait to see you.",
          },
        },
      ],
    },
    {
      id: "birthday",
      name: "Birthday party",
      description: "Night colours, what's happening when and a quick RSVP",
      theme: {
        colors: {
          background: "#0c0c0c",
          foreground: "#f5f5f4",
          primary: "#f5f5f4",
          primaryForeground: "#0c0c0c",
          muted: "#1a1a1a",
          mutedForeground: "#a8a29e",
        },
        font: "dm-sans",
        headingFont: "bricolage",
        radius: 16,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "hero",
            align: "left",
            cover: templatePhoto("photo-lights", "Stage lights over the crowd"),
            eyebrow: "You're invited",
            title: "Jamie turns 40",
            size: "xl",
            subtitle: "Drinks, dinner and far too much cake.",
          },
        },
        {
          type: "event",
          props: {
            title: "Jamie's 40th",
            description: "Come for drinks at seven. Dinner at eight.",
            venue: "The Lantern Rooms",
            address: "88 King Street, Manchester, United Kingdom",
            timeZone: "Europe/London",
            organizer: "Alex",
          },
        },
        {
          type: "timeline",
          props: {
            title: "",
            items: [
              { when: "7:00 pm", title: "Drinks" },
              { when: "8:00 pm", title: "Dinner" },
              { when: "10:00 pm", title: "Cake and speeches" },
            ],
          },
        },
        {
          type: "address-map",
          props: {
            title: "Getting there",
            name: "",
            address: {
              street: "88 King Street",
              city: "Manchester",
              country: "United Kingdom",
            },
            note: "Upstairs, through the side door on Cross Street.",
            showWaze: true,
          },
        },
        {
          type: "form",
          props: {
            title: "Coming?",
            description: "It's a surprise, so please don't tell Jamie.",
            fields: [
              {
                id: "name",
                type: "text",
                label: "Your name",
                required: true,
                maxLength: 120,
              },
              {
                id: "attending",
                type: "choice",
                label: "Can you make it?",
                required: true,
                options: ["Yes", "No"],
              },
              {
                id: "guests",
                type: "choice",
                label: "Bringing anyone?",
                options: ["Just me", "Plus one"],
              },
            ],
            submitLabel: "Send",
            successMessage: "Brilliant, see you there!",
          },
        },
      ],
    },
    {
      id: "dinner",
      name: "Dinner party",
      description: "A small gathering: time, address and food needs",
      theme: {
        colors: {
          background: "#f7f3ec",
          foreground: "#22201b",
          primary: "#3f4a2c",
          primaryForeground: "#ffffff",
          muted: "#ece6da",
          mutedForeground: "#625c4c",
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
            cover: templatePhoto("hero-supper", "A long table set for dinner"),
            eyebrow: "Saturday supper",
            title: "Dinner at ours",
            size: "lg",
            subtitle: "A long table, a few friends and slow food.",
          },
        },
        {
          type: "event",
          props: {
            title: "Supper at Mira and Tom's",
            description: "Bring nothing but yourselves.",
            venue: "Mira and Tom's",
            address: "14 Ashgrove Road, Bristol, United Kingdom",
            timeZone: "Europe/London",
            organizer: "Mira and Tom",
          },
        },
        {
          type: "address-map",
          props: {
            title: "",
            name: "",
            address: {
              street: "14 Ashgrove Road",
              city: "Bristol",
              country: "United Kingdom",
            },
            note: "The blue door, top bell.",
          },
        },
        {
          type: "form",
          props: {
            title: "Let us know",
            fields: [
              {
                id: "name",
                type: "text",
                label: "Your name",
                required: true,
                maxLength: 120,
              },
              {
                id: "attending",
                type: "choice",
                label: "Can you come?",
                required: true,
                options: ["Yes, can't wait", "Sorry, not this time"],
              },
              {
                id: "dietary",
                type: "text",
                label: "Anything you don't eat?",
                maxLength: 300,
              },
            ],
            submitLabel: "Reply",
            successMessage: "Thank you! See you on Saturday.",
          },
        },
      ],
    },
  ],
});
