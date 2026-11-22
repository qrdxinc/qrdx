/**
 * Hosted page types a dynamic code can open (the landing-page engine's
 * templates). Names and descriptions must match what the page editor offers.
 */
export interface SeoPageType {
  name: string;
  description: string;
}

export const PAGE_TYPES = {
  links: {
    name: "Link list page",
    description:
      "A mobile page of buttons: website, socials, booking, reviews and more.",
  },
  business: {
    name: "Business page",
    description:
      "Opening hours, address with a map link, contact buttons and amenities.",
  },
  vcard: {
    name: "vCard Plus page",
    description:
      "A digital business card with photo, contact buttons and a Save contact button.",
  },
  menu: {
    name: "Menu page",
    description:
      "Sections and items with prices, photos, allergen and diet tags, and sold-out flags.",
  },
  coupon: {
    name: "Coupon page",
    description:
      "An offer with a code or barcode, validity dates, terms and a copy button.",
  },
  event: {
    name: "Event page",
    description:
      "Date, time, venue, organiser and add-to-calendar links, plus an .ics file for any calendar app.",
  },
  apps: {
    name: "App download page",
    description:
      "Shows the App Store button on iPhones and the Google Play button on Android.",
  },
  feedback: {
    name: "Feedback and forms page",
    description:
      "Star ratings, NPS and questions, with responses collected in your dashboard.",
  },
  pdf: {
    name: "PDF page",
    description: "An uploaded PDF people can read in the browser or download.",
  },
  images: {
    name: "Image gallery",
    description: "A grid of photos with a full-screen viewer.",
  },
  video: {
    name: "Video page",
    description: "A YouTube or Vimeo embed, or an uploaded MP4.",
  },
  mp3: {
    name: "Audio page",
    description: "An audio player with cover art and a playlist.",
  },
  social: {
    name: "Social media page",
    description:
      "Every social profile on one page, each with its handle and a tap to follow.",
  },
  product: {
    name: "Product page",
    description:
      "Ingredients, allergens, nutrition, certifications and care, with GS1 Digital Link on your own domain.",
  },
  booking: {
    name: "Appointments page",
    description:
      "Services and prices with a booking request form or a link to your booking tool.",
  },
  payment: {
    name: "Payments and tips page",
    description:
      "PayPal, Venmo, bank details and more, each opening the payment app or copying the details.",
  },
  "real-estate": {
    name: "Property listing",
    description:
      "Price, key facts, photos, the agent's contact and a viewing request form.",
  },
  pet: {
    name: "Pet ID tag page",
    description:
      "A call button, the pet's details and medical needs, and a form for whoever finds them.",
  },
  medical: {
    name: "Medical ID page",
    description:
      "Emergency contacts, conditions, allergies and medication for a tag or wristband.",
  },
  playlist: {
    name: "Playlist page",
    description:
      "Several tracks in a row: a mix, the stops of an audio tour or a book's chapters.",
  },
  // Added 2026-11-22 (pages)
  location: {
    name: "Location page",
    description:
      "An address with a map, buttons for Google Maps, Apple Maps and Waze, and opening hours.",
  },
  resume: {
    name: "Resume page",
    description:
      "A CV with your photo, experience, education, skills, links and a PDF to download.",
  },
  wifi: {
    name: "Guest Wi-Fi page",
    description:
      "The network name, a password to copy and how to join on iPhone and Android.",
  },
  invitation: {
    name: "Invitation page",
    description:
      "Names, date and venue with directions, the day's schedule and an RSVP form.",
  },
  form: {
    name: "Contact form page",
    description:
      "A contact, quote or lead form with the fields you choose, answered in your dashboard.",
  },
  "asset-tag": {
    name: "Lost and found tag page",
    description:
      "Call and message buttons and a found-it form for a bag, laptop or set of keys.",
  },
  message: {
    name: "Message page",
    description:
      "A short note with a photo and one button: a gift message, a thank-you or a notice.",
  },
} as const satisfies Record<string, SeoPageType>;

export type PageTypeId = keyof typeof PAGE_TYPES;
