import { Briefcase } from "iconsax-reactjs";
import { templatePhoto } from "./media";
import { registerTemplate } from "./registry";

// A CV on one page: photo and headline, a summary, experience and education
// (timeline blocks), skills, links, and the CV as a PDF to download (an
// uploaded file where storage is set up, or a link to one anywhere).

registerTemplate({
  type: "resume",
  label: "Resume / CV",
  description:
    "Your photo, experience, education, skills and links, with your CV to download",
  icon: Briefcase,
  order: 31,
  variants: [
    {
      id: "designer",
      name: "Designer",
      description: "Photo, experience, skills and a portfolio link",
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
        headingFont: "instrument-serif",
        radius: 14,
      },
      blocks: [
        {
          type: "header",
          props: {
            avatar: templatePhoto("portrait-designer", "Lena Park"),
            eyebrow: "Product designer · Berlin",
            title: "Lena Park",
            size: "xl",
            subtitle:
              "Eight years of making complex tools feel simple, from research to shipped product.",
          },
        },
        {
          type: "links",
          props: {
            style: "outline",
            items: [
              { label: "Portfolio", url: "https://example.com/work" },
              { label: "LinkedIn", url: "https://linkedin.com/" },
              { label: "Email me", url: "mailto:lena@example.com" },
            ],
          },
        },
        {
          type: "timeline",
          props: {
            title: "Experience",
            items: [
              {
                when: "2022 – now",
                title: "Lead product designer",
                place: "Northwind Studio",
                note: "Leads design for the scheduling product and its design system.",
              },
              {
                when: "2019 – 2022",
                title: "Product designer",
                place: "Harbor Health",
                note: "Designed the patient app, from first interviews to launch.",
              },
              {
                when: "2017 – 2019",
                title: "UX designer",
                place: "Ledgerly",
              },
            ],
          },
        },
        {
          type: "timeline",
          props: {
            title: "Education",
            items: [
              {
                when: "2013 – 2017",
                title: "BA Interaction Design",
                place: "School of Design, Hamburg",
              },
            ],
          },
        },
        {
          type: "details",
          props: {
            title: "Skills",
            items: [
              { label: "Design", value: "Figma, prototyping, design systems" },
              { label: "Research", value: "Interviews, usability tests" },
              { label: "Languages", value: "English, German, Korean" },
            ],
          },
        },
        {
          type: "file-download",
          props: { title: "Download my CV" },
        },
      ],
    },
    {
      id: "developer",
      name: "Developer",
      description: "Dark, with skills as tiles and code links",
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
        radius: 12,
        texture: "dots",
      },
      blocks: [
        {
          type: "header",
          props: {
            avatar: templatePhoto("portrait-photographer", "Sam Okafor"),
            align: "left",
            layout: "split",
            title: "Sam Okafor",
            size: "lg",
            subtitle:
              "Backend engineer. I build APIs that stay up and stay fast.",
          },
        },
        {
          type: "details",
          props: {
            items: [
              { label: "Experience", value: "9 years" },
              { label: "Based in", value: "Lagos, remote" },
              { label: "Open to", value: "Staff roles" },
              { label: "Languages", value: "Go, TypeScript" },
            ],
            layout: "tiles",
          },
        },
        {
          type: "timeline",
          props: {
            title: "Experience",
            items: [
              {
                when: "2021 – now",
                title: "Senior backend engineer",
                place: "Brightline Payments, remote",
                note: "Runs the payouts service: 40 million requests a day.",
              },
              {
                when: "2018 – 2021",
                title: "Backend engineer",
                place: "Northwind Logistics",
              },
              {
                when: "2016 – 2018",
                title: "Software engineer",
                place: "Example Bank",
              },
            ],
          },
        },
        {
          type: "links",
          props: {
            style: "soft",
            items: [
              { label: "GitHub", url: "https://github.com/" },
              { label: "LinkedIn", url: "https://linkedin.com/" },
              { label: "Email", url: "mailto:sam@example.com" },
            ],
          },
        },
        {
          type: "file-download",
          props: { title: "CV (PDF)" },
        },
      ],
    },
    {
      id: "graduate",
      name: "Graduate",
      description: "Education first, internships and a short summary",
      theme: {
        colors: {
          background: "#f3f1f8",
          foreground: "#1d1a26",
          primary: "#4b3f72",
          primaryForeground: "#ffffff",
          muted: "#e6e2f0",
          mutedForeground: "#5a5470",
        },
        font: "dm-sans",
        headingFont: "fraunces",
        radius: 18,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            avatar: templatePhoto("portrait-reader", "Priya Raman"),
            title: "Priya Raman",
            size: "xl",
            subtitle:
              "Marketing graduate looking for my first full-time role in brand or content.",
          },
        },
        {
          type: "text",
          props: {
            heading: "About me",
            body: "I write, I test and I like numbers. At university I ran the student radio's social accounts and tripled its listeners in a year.",
          },
        },
        {
          type: "timeline",
          props: {
            title: "Education",
            items: [
              {
                when: "2022 – 2025",
                title: "BSc Marketing, first-class honours",
                place: "Northfield University",
              },
            ],
          },
        },
        {
          type: "timeline",
          props: {
            title: "Internships",
            items: [
              {
                when: "Summer 2024",
                title: "Content marketing intern",
                place: "Juniper & Moss",
                note: "Wrote the weekly newsletter and two product launch campaigns.",
              },
            ],
          },
        },
        {
          type: "button",
          props: {
            label: "Email me",
            url: "mailto:priya@example.com",
          },
        },
        {
          type: "file-download",
          props: { title: "Download my CV" },
        },
      ],
    },
  ],
});
