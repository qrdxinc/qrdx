import { UserEdit } from "iconsax-reactjs";
import { registerTemplate } from "./registry";

// A contact or enquiry form. The owner keeps the fields they need; answers
// reach the page's responses and notifications (the form block).

registerTemplate({
  type: "form",
  label: "Contact form",
  description:
    "A contact or enquiry form with the fields you pick; replies reach your inbox",
  icon: UserEdit,
  order: 44,
  variants: [
    {
      id: "contact-us",
      name: "Contact us",
      description: "Name, email, phone and a message",
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
        radius: 12,
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Harbor & Co. Architects",
            title: "Get in touch",
            size: "lg",
            subtitle:
              "Tell us about your project and we'll reply within two working days.",
          },
        },
        {
          type: "form",
          props: {
            title: "",
            fields: [
              {
                id: "name",
                type: "text",
                label: "Your name",
                required: true,
                maxLength: 120,
              },
              { id: "email", type: "email", label: "Email", required: true },
              { id: "phone", type: "phone", label: "Phone" },
              {
                id: "message",
                type: "text",
                label: "Your message",
                required: true,
                multiline: true,
                maxLength: 2000,
              },
            ],
            submitLabel: "Send message",
            successMessage:
              "Thanks! We'll get back to you within two working days.",
          },
        },
        {
          type: "button",
          props: {
            label: "Prefer email? hello@example.com",
            url: "mailto:hello@example.com",
            style: "soft",
          },
        },
      ],
    },
    {
      id: "quote-request",
      name: "Quote request",
      description: "The job, where it is and how to reach you",
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
        radius: 14,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            eyebrow: "Brightside Painting",
            title: "Request a free quote",
            size: "lg",
            subtitle:
              "Tell us about the job and we'll call you back the same day.",
          },
        },
        {
          type: "form",
          props: {
            title: "",
            fields: [
              {
                id: "name",
                type: "text",
                label: "Your name",
                required: true,
                maxLength: 120,
              },
              { id: "phone", type: "phone", label: "Phone", required: true },
              { id: "email", type: "email", label: "Email" },
              {
                id: "job",
                type: "choice",
                label: "What needs painting?",
                required: true,
                options: ["Inside", "Outside", "Both"],
              },
              {
                id: "postcode",
                type: "text",
                label: "Postcode",
                maxLength: 20,
              },
              {
                id: "details",
                type: "text",
                label: "Tell us about the job",
                multiline: true,
                maxLength: 2000,
              },
            ],
            submitLabel: "Request my quote",
            successMessage: "Thank you! We'll call you back today.",
          },
        },
        {
          type: "details",
          props: {
            items: [
              { label: "Quotes", value: "Free, with no obligation" },
              { label: "Area", value: "Within 20 miles of Leeds" },
            ],
          },
        },
      ],
    },
    {
      id: "lead-capture",
      name: "Trade show leads",
      description: "Details and interests from a stand, with consent",
      theme: {
        colors: {
          background: "#111110",
          foreground: "#f5f4ef",
          primary: "#f5f4ef",
          primaryForeground: "#111110",
          muted: "#1f1f1d",
          mutedForeground: "#a9a79f",
        },
        font: "dm-sans",
        headingFont: "space-grotesk",
        radius: 12,
        texture: "grid",
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Stand B14 · Retail Tech Expo",
            title: "Let's keep talking",
            size: "xl",
            subtitle:
              "Leave your details and we'll send the slides and pricing after the show.",
          },
        },
        {
          type: "form",
          props: {
            title: "",
            fields: [
              {
                id: "name",
                type: "text",
                label: "Name",
                required: true,
                maxLength: 120,
              },
              {
                id: "company",
                type: "text",
                label: "Company",
                maxLength: 120,
              },
              {
                id: "email",
                type: "email",
                label: "Work email",
                required: true,
              },
              {
                id: "interests",
                type: "choice",
                label: "What are you looking at?",
                multiple: true,
                options: ["Self-checkout", "Shelf labels", "Stock counts"],
              },
              {
                id: "consent",
                type: "consent",
                label:
                  "Email me the slides and pricing. I can unsubscribe at any time.",
                required: true,
              },
            ],
            submitLabel: "Send me the details",
            successMessage:
              "Thanks! The slides will be in your inbox after the show.",
          },
        },
      ],
    },
  ],
});
