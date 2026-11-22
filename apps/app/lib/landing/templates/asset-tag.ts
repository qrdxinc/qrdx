import { TagUser } from "iconsax-reactjs";
import { registerTemplate } from "./registry";

// Lost and found for things: a tag on a bag, a laptop or a set of keys.
// Whoever finds it can call or message the owner straight away, or say where
// it is through the form (it reaches the owner's responses and
// notifications). Like the pet tag, it shows only what helps a finder.

registerTemplate({
  type: "asset-tag",
  label: "Lost & found tag",
  description:
    "A tag for bags, laptops and keys that helps whoever finds them reach you",
  icon: TagUser,
  order: 49,
  variants: [
    {
      id: "luggage",
      name: "Luggage",
      description: "Call and message buttons, a reward and a found-it form",
      theme: {
        colors: {
          background: "#f2f5f9",
          foreground: "#0f1a2a",
          primary: "#1d4ed8",
          primaryForeground: "#ffffff",
          muted: "#e4eaf2",
          mutedForeground: "#4a5568",
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
            eyebrow: "If found, please contact me",
            title: "This bag belongs to Alex",
            size: "xl",
            subtitle: "Thank you for helping it get home.",
          },
        },
        {
          type: "button",
          props: {
            label: "Call Alex",
            url: "tel:+15550148",
            note: "Any time of day, I'll come and collect it",
          },
        },
        {
          type: "contact",
          props: {
            firstName: "Alex",
            lastName: "Chen",
            jobTitle: "",
            company: "",
            phones: [{ type: "mobile", number: "+1 555 0148", whatsapp: true }],
            emails: [{ type: "home", address: "alex@example.com" }],
            showSave: false,
            showShare: false,
          },
        },
        {
          type: "text",
          props: {
            heading: "Reward",
            body: "A thank-you reward for its safe return.",
            card: true,
          },
        },
        {
          type: "form",
          props: {
            title: "Found it?",
            description: "Tell me where it is and I'll be in touch.",
            fields: [
              {
                id: "where",
                type: "text",
                label: "Where is it now?",
                required: true,
                maxLength: 300,
              },
              { id: "phone", type: "phone", label: "Your phone number" },
              {
                id: "note",
                type: "text",
                label: "Anything else?",
                multiline: true,
                maxLength: 1000,
              },
            ],
            submitLabel: "Send to Alex",
            successMessage: "Thank you! Alex will get back to you soon.",
          },
        },
      ],
    },
    {
      id: "equipment",
      name: "Laptop & equipment",
      description:
        "Company property with an asset number and where to return it",
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
        texture: "grid",
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Property of Northwind Studio",
            title: "Found this laptop?",
            size: "lg",
            subtitle:
              "Please hand it in at our office, or tell us where it is.",
          },
        },
        {
          type: "details",
          props: {
            items: [
              { label: "Asset number", value: "NW-0412" },
              { label: "Item", value: "Laptop" },
              { label: "Return to", value: "IT desk, 3rd floor" },
            ],
          },
        },
        {
          type: "button",
          props: {
            label: "Email the IT team",
            url: "mailto:it@example.com",
          },
        },
        {
          type: "address-map",
          props: {
            title: "Our office",
            name: "Northwind Studio",
            address: {
              street: "500 Market Street",
              city: "San Francisco",
              region: "CA",
              postalCode: "94105",
              country: "USA",
            },
          },
        },
        {
          type: "form",
          props: {
            title: "Tell us where it is",
            fields: [
              {
                id: "where",
                type: "text",
                label: "Where did you find it?",
                required: true,
                maxLength: 300,
              },
              { id: "email", type: "email", label: "Your email" },
            ],
            submitLabel: "Send",
            successMessage: "Thank you! The IT team will contact you shortly.",
          },
        },
      ],
    },
    {
      id: "keys",
      name: "Keys",
      description: "Short and simple: who to call and a reward",
      theme: {
        colors: {
          background: "#111110",
          foreground: "#f5f4ef",
          primary: "#f5f4ef",
          primaryForeground: "#111110",
          muted: "#1f1f1d",
          mutedForeground: "#a9a79f",
        },
        font: "rounded",
        headingFont: "bricolage",
        radius: 20,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            title: "You found my keys",
            size: "xl",
            subtitle:
              "Thank you! Call or message me and I'll come and get them.",
          },
        },
        {
          type: "button",
          props: {
            label: "Call Ruth",
            url: "tel:+15550156",
          },
        },
        {
          type: "button",
          props: {
            label: "Send a text",
            url: "sms:+15550156",
            style: "outline",
          },
        },
        {
          type: "text",
          props: {
            heading: "",
            body: "There's a reward for whoever brings them back.",
            align: "center",
          },
        },
      ],
    },
  ],
});
