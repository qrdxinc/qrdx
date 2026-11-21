// Looks built around a use, each on the official frame made for it: menus,
// cards, signs, bookings, payments, packaging. One from every collection.
import { eyes, ink, type SeedDesign, shapes } from "./shared";

export const USE_DESIGNS: SeedDesign[] = [
  // ── Food & drink ───────────────────────────────────────────────────────
  {
    id: "chalkboard-menu",
    name: "Chalkboard menu",
    description:
      "Square modules in a green-black with square eyes and rounded centres, on white, on the chalkboard menu frame. For café counters and daily specials boards.",
    tags: ["minimal", "monochrome", "professional", "flat"],
    style: {
      ...ink("#FFFFFF", "#1F2421"),
      ...shapes("square", "square", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: {
      id: "menu-chalkboard",
      color: "#1F2421",
      textColor: "#FFFFFF",
      secondaryColor: "#3A4A44",
    },
  },
  {
    id: "espresso",
    name: "Espresso",
    description:
      "Round dots in a dark roast brown with extra-rounded eyes and caramel centres, on a warm cream, on the coffee cup frame. For cafés, roasters and takeaway cups.",
    tags: ["warm", "earthy", "soft", "professional"],
    style: {
      ...ink("#F8F1E7", "#2B1D14", "#2B1D14", "#8A5A32"),
      ...shapes("circle", "extra-rounded", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "cafe-cup", color: "#2B1D14", textColor: "#F8F1E7" },
  },
  {
    id: "cocktail-hour",
    name: "Cocktail hour",
    description:
      "Diamond modules in a plum black with octagon eyes and deep gold hexagon centres, on a champagne cream, on the cocktail frame. For bar menus and happy hours.",
    tags: ["elegant", "art-deco", "midnight", "geometric"],
    style: {
      ...ink("#FBF7EE", "#1F1024", "#1F1024", "#7A5A14"),
      ...shapes("diamond", "octagon", "hexagon"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "bar-cocktail", color: "#1F1024", textColor: "#FBF7EE" },
  },
  {
    id: "bakery-case",
    name: "Bakery case",
    description:
      "Large touching dots in a dark chestnut with cushion eyes and burnt orange centres, on a warm white, on the cake frame. For bakeries, cake orders and patisseries.",
    tags: ["warm", "soft", "earthy", "playful"],
    style: {
      ...ink("#FFF7ED", "#7C2D12", "#7C2D12", "#9A3412"),
      ...shapes("circle-large", "cushion", "extra-rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "bakery-cake", color: "#7C2D12", textColor: "#FFF7ED" },
  },
  {
    id: "pizza-night",
    name: "Pizza night",
    description:
      "Mixed dots in a tomato red with squircle eyes in a darker red and basil green centres, on a pale butter, on the pizza frame. For pizzerias and delivery menus.",
    tags: ["warm", "vibrant", "playful", "bold"],
    style: {
      ...ink("#FFFBEB", "#991B1B", "#7F1D1D", "#14532D"),
      ...shapes("circle-mixed", "squircle", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "menu-pizza", color: "#991B1B", textColor: "#FFFBEB" },
  },
  {
    id: "sushi-bar",
    name: "Sushi bar",
    description:
      "Black mosaic modules with square eyes and red square centres, on white, on the sushi menu frame. Crisp and simple, for sushi counters and bento boxes.",
    tags: ["minimal", "high-contrast", "bold", "zen"],
    style: {
      ...ink("#FFFFFF", "#0A0A0A", "#0A0A0A", "#B91C1C"),
      ...shapes("mosaic", "square", "square"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "sushi-menu", color: "#0A0A0A", textColor: "#FFFFFF" },
  },
  {
    id: "taproom",
    name: "Taproom",
    description:
      "Vertical lines in a toast brown with octagon eyes and golden brown centres, on a pale amber, on the craft beer frame. For taprooms, bottle shops and beer lists.",
    tags: ["warm", "earthy", "vintage", "bold"],
    style: {
      ...ink("#FEF3C7", "#713F12", "#713F12", "#854D0E"),
      ...shapes("vertical-line", "octagon", "octagon"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "bar-beer", color: "#713F12", textColor: "#FEF3C7" },
  },
  {
    id: "market-stall",
    name: "Market stall",
    description:
      "Leaf-shaped modules in a deep green with petal eyes in a brighter green and rust leaf centres, on a pale lime white, on the farmers market frame.",
    tags: ["nature", "earthy", "warm", "spring"],
    style: {
      ...ink("#F7FEE7", "#14532D", "#166534", "#7C2D12"),
      ...shapes("leaf", "petal", "leaf"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "farmers-market", color: "#14532D", textColor: "#F7FEE7" },
  },
  {
    id: "cellar-list",
    name: "Cellar list",
    description:
      "Classy modules in a deep burgundy with leaf eyes and reversed leaf centres, on a warm ivory, on the wine pairings frame. For restaurants and cellar doors.",
    tags: ["elegant", "warm", "romantic", "vintage"],
    style: {
      ...ink("#FFFCF5", "#7A1F2B", "#7A1F2B", "#7A5A14"),
      ...shapes("classy", "leaf", "leaf-reverse"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "wine-pairings", color: "#7A1F2B", textColor: "#FFFCF5" },
  },
  {
    id: "loose-leaf",
    name: "Loose leaf",
    description:
      "Liquid rows in a deep olive green with extra-rounded eyes, on a pale sage white, on the tea menu frame. Calm and leafy, for tea rooms, tea lists and caddies.",
    tags: ["zen", "nature", "soft", "earthy"],
    style: {
      ...ink("#F4F6EC", "#365314", "#365314", "#3F6212"),
      ...shapes("liquid-horizontal", "extra-rounded", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "tea-menu", color: "#365314", textColor: "#F4F6EC" },
  },
  {
    id: "juice-bar",
    name: "Juice bar",
    description:
      "Mixed dots in burnt orange with octagon eyes in deep green and orange centres, on a pale lemon, on the juice bar frame. For smoothie counters and fruit stands.",
    tags: ["vibrant", "tropical", "playful", "warm"],
    style: {
      ...ink("#FEF9C3", "#9A3412", "#14532D", "#9A3412"),
      ...shapes("circle-mixed", "octagon", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "juice-bar", color: "#9A3412", textColor: "#FEF9C3" },
  },
  {
    id: "ice-cream",
    name: "Ice cream",
    description:
      "Large touching dots in a deep pink with squircle eyes and extra-rounded centres, on a pale pink, on the ice cream frame. For gelato counters and summer kiosks.",
    tags: ["candy", "playful", "soft", "pastel"],
    style: {
      ...ink("#FCE7F3", "#9D174D", "#9D174D", "#BE185D"),
      ...shapes("circle-large", "squircle", "extra-rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "ice-cream-shop", color: "#9D174D", textColor: "#FCE7F3" },
  },
  {
    id: "coffee-stamps",
    name: "Coffee stamps",
    description:
      "Large touching dots in an espresso brown with squircle eyes and caramel centres, on a warm cream, on the coffee club stamp frame. For loyalty cards and counters.",
    tags: ["warm", "earthy", "soft", "e-commerce"],
    style: {
      ...ink("#FBF6EE", "#3B2A20", "#3B2A20", "#8A5A32"),
      ...shapes("circle-large", "squircle", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "cafe-loyalty", color: "#3B2A20", textColor: "#FBF6EE" },
  },
  // ── Shops & packaging ──────────────────────────────────────────────────
  {
    id: "red-tag",
    name: "Red tag",
    description:
      "Rounded modules in black with bevelled eyes and square centres in red, on white, on the sale tag frame. For price tags, shelf edges and clearance racks.",
    tags: ["bold", "high-contrast", "e-commerce", "vibrant"],
    style: {
      ...ink("#FFFFFF", "#0A0A0A", "#BE123C", "#BE123C"),
      ...shapes("rounded", "bevel", "square"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "shop-sale-tag", color: "#BE123C", textColor: "#FFFFFF" },
  },
  {
    id: "gift-card",
    name: "Gift card",
    description:
      "Liquid rows in a deep plum with petal eyes and deep gold centres, on a blush white, on the gift card frame. For gift cards, vouchers and wrapped boxes.",
    tags: ["elegant", "romantic", "e-commerce", "soft"],
    style: {
      ...ink("#FDF2F8", "#831843", "#831843", "#7A5A14"),
      ...shapes("liquid-horizontal", "petal", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "shop-gift-card", color: "#831843", textColor: "#FDF2F8" },
  },
  {
    id: "care-label",
    name: "Care label",
    description:
      "Vertical lines in a warm charcoal with rounded eyes, on white, on the care tips frame. Plain and useful, for clothing labels, plant pots and appliances.",
    tags: ["minimal", "monochrome", "professional", "flat"],
    style: {
      ...ink("#FFFFFF", "#292524"),
      ...shapes("vertical-line", "rounded", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "pack-care", color: "#292524", textColor: "#FFFFFF" },
  },
  {
    id: "recycled",
    name: "Recycled",
    description:
      "Leaf-shaped modules in a deep green with extra-rounded eyes and leaf centres, on a mint white, on the recycling frame. For packaging, bins and eco labels.",
    tags: ["nature", "forest", "minimal", "accessible"],
    style: {
      ...ink("#F0FDF4", "#14532D"),
      ...shapes("leaf", "extra-rounded", "leaf"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "pack-recycle", color: "#14532D", textColor: "#F0FDF4" },
  },
  {
    id: "shopfront",
    name: "Shopfront",
    description:
      "Square modules in a deep navy with rounded eyes in red, on white, on the shop awning frame. For shop windows, market stalls and online store links.",
    tags: ["bold", "e-commerce", "retro", "professional"],
    style: {
      ...ink("#FFFFFF", "#0F1F3D", "#991B1B", "#991B1B"),
      ...shapes("square", "rounded", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "shop-awning", color: "#0F1F3D", textColor: "#FFFFFF" },
  },
  {
    id: "genuine",
    name: "Genuine",
    description:
      "Square modules in a dark slate with octagon eyes, on white, on the genuine product seal frame. For boxes, hang tags and warranty cards that need checking.",
    tags: ["professional", "corporate", "minimal", "industrial"],
    style: {
      ...ink("#FFFFFF", "#1E293B", "#1E293B", "#334155"),
      ...shapes("square", "octagon", "square"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "pack-authentic", color: "#1E293B", textColor: "#FFFFFF" },
  },
  // ── Beauty & wellness ──────────────────────────────────────────────────
  {
    id: "barber-chair",
    name: "Barber chair",
    description:
      "Classy modules in black with extra-rounded eyes and deep gold centres, on white, on the barber booking frame. For barbers, chairs for hire and walk-in signs.",
    tags: ["elegant", "monochrome", "vintage", "professional"],
    style: {
      ...ink("#FFFFFF", "#0A0A0A", "#0A0A0A", "#7A5A14"),
      ...shapes("classy", "extra-rounded", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "barber-booking", color: "#0A0A0A", textColor: "#FFFFFF" },
  },
  {
    id: "spa-day",
    name: "Spa day",
    description:
      "Liquid modules in a deep teal with petal eyes and drop centres, on a mint white, on the spa menu frame. Soft and watery, for spas, saunas and massage menus.",
    tags: ["zen", "soft", "cool", "elegant"],
    style: {
      ...ink("#F0FDFA", "#134E4A", "#134E4A", "#0F766E"),
      ...shapes("liquid", "petal", "drop"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "spa-menu", color: "#134E4A", textColor: "#F0FDFA" },
  },
  {
    id: "nail-bar",
    name: "Nail bar",
    description:
      "Round dots in a deep magenta with petal eyes in bright pink and flower centres, on a blush white, on the nail studio frame. For nail bars and lash lounges.",
    tags: ["candy", "playful", "vibrant", "romantic"],
    style: {
      ...ink("#FDF2F8", "#9D174D", "#BE185D", "#9D174D"),
      ...shapes("circle", "petal", "flower"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "nail-studio", color: "#9D174D", textColor: "#FDF2F8" },
  },
  {
    id: "makeup-chair",
    name: "Makeup chair",
    description:
      "Classy rounded modules in a plum black with petal eyes and deep gold flower centres, on a blush ivory, on the makeup artist frame. For bridal and event makeup.",
    tags: ["elegant", "romantic", "soft", "art-deco"],
    style: {
      ...ink("#FFF7F5", "#1F1024", "#1F1024", "#7A5A14"),
      ...shapes("classy-rounded", "petal", "flower"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "makeup-artist", color: "#1F1024", textColor: "#FFF7F5" },
  },
  {
    id: "bath-ritual",
    name: "Bath ritual",
    description:
      "Liquid columns in a deep sea blue with squircle eyes, on a pale sky white, on the bath ritual frame. For bath salts, soap bars and bathroom labels.",
    tags: ["zen", "ocean", "soft", "cool"],
    style: {
      ...ink("#F0F9FF", "#0C4A6E", "#0C4A6E", "#0369A1"),
      ...shapes("liquid-vertical", "squircle", "squircle"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "bath-ritual", color: "#0C4A6E", textColor: "#F0F9FF" },
  },
  // ── Events & weddings ──────────────────────────────────────────────────
  {
    id: "concert",
    name: "Concert",
    description:
      "Vertical lines in black with extra-rounded eyes in red and black square centres, on white, on the live music ticket frame. For gig tickets and wristbands.",
    tags: ["bold", "high-contrast", "vibrant", "brutalist"],
    style: {
      ...ink("#FFFFFF", "#0A0A0A", "#BE123C", "#0A0A0A"),
      ...shapes("vertical-line", "extra-rounded", "square"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "event-concert", color: "#0A0A0A", textColor: "#FFFFFF" },
  },
  {
    id: "wedding-invite",
    name: "Wedding invite",
    description:
      "Classy rounded modules in a warm stone grey with leaf eyes and deep gold leaf centres, on ivory, on the wedding invitation frame. For RSVPs and welcome signs.",
    tags: ["romantic", "elegant", "soft", "vintage"],
    style: {
      ...ink("#FFFDF8", "#44403C", "#44403C", "#7A5A14"),
      ...shapes("classy-rounded", "leaf", "leaf"),
      level: "Q",
      margin: 3,
    },
    frame: {
      id: "wedding-invitation",
      color: "#44403C",
      textColor: "#FFFDF8",
      secondaryColor: "#7A5A14",
    },
  },
  {
    id: "party-hats",
    name: "Party hats",
    description:
      "Scattered dots in a deep indigo with squircle eyes in pink, violet and teal and flower centres, on white, on the birthday RSVP frame. For parties of any age.",
    tags: ["playful", "colorful", "candy", "vibrant"],
    style: {
      ...ink("#FFFFFF", "#1E1B4B"),
      ...shapes("random-dots", "squircle", "flower"),
      ...eyes("#BE185D", "#6D28D9", "#0E7490"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "event-birthday", color: "#1E1B4B", textColor: "#FFFFFF" },
  },
  // ── Places & Wi-Fi ─────────────────────────────────────────────────────
  {
    id: "hotel-key",
    name: "Hotel key",
    description:
      "Classy modules in a soft black with bevelled eyes and deep gold square centres, on ivory, on the hotel key card frame. For key sleeves and room folders.",
    tags: ["elegant", "professional", "art-deco", "monochrome"],
    style: {
      ...ink("#FFFDF5", "#1C1917", "#1C1917", "#7A5A14"),
      ...shapes("classy", "bevel", "square"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "hotel-key", color: "#1C1917", textColor: "#FFFDF5" },
  },
  {
    id: "boarding-pass",
    name: "Boarding pass",
    description:
      "Horizontal lines in a deep navy with square eyes and red centres, on white, on the boarding pass frame. For trip itineraries, tour pickups and travel agents.",
    tags: ["professional", "cool", "bold", "corporate"],
    style: {
      ...ink("#FFFFFF", "#0F1F3D", "#0F1F3D", "#BE123C"),
      ...shapes("horizontal-line", "square", "square"),
      level: "Q",
      margin: 3,
    },
    frame: {
      id: "travel-boarding-pass",
      color: "#0F1F3D",
      textColor: "#FFFFFF",
      secondaryColor: "#BE123C",
    },
  },
  {
    id: "exhibit-label",
    name: "Exhibit label",
    description:
      "Mosaic modules in a warm charcoal with extra-rounded eyes and square centres, on a warm stone, on the exhibit label frame. For museum captions and gallery walls.",
    tags: ["minimal", "monochrome", "elegant", "zen"],
    style: {
      ...ink("#F5F3EF", "#2E2B28"),
      ...shapes("mosaic", "extra-rounded", "square"),
      level: "Q",
      margin: 3,
    },
    frame: {
      id: "museum-exhibit-label",
      color: "#2E2B28",
      textColor: "#F5F3EF",
    },
  },
  {
    id: "city-guide",
    name: "City guide",
    description:
      "Octagon modules in a deep harbour blue with bevelled eyes and rust octagon centres, on white, on the city guide frame. For hotels, hostels and tourist boards.",
    tags: ["cool", "professional", "geometric", "vintage"],
    style: {
      ...ink("#FFFFFF", "#0C3B5E", "#0C3B5E", "#9A3412"),
      ...shapes("octagon", "bevel", "octagon"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "travel-city-guide", color: "#0C3B5E", textColor: "#FFFFFF" },
  },
  {
    id: "room-service",
    name: "Room service",
    description:
      "Classy modules in a deep navy with rounded eyes and deep gold centres, on white, on the room service frame. For hotel rooms, minibars and in-room menus.",
    tags: ["elegant", "professional", "corporate", "cool"],
    style: {
      ...ink("#FFFFFF", "#0F1F3D", "#0F1F3D", "#7A5A14"),
      ...shapes("classy", "rounded", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "hotel-room-service", color: "#0F1F3D", textColor: "#FFFFFF" },
  },
  {
    id: "explore",
    name: "Explore",
    description:
      "Octagon modules in a deep forest green with bevel eyes and octagon centres in rust, on a pale stone, on the compass frame. For trail heads, parks and tours.",
    tags: ["nature", "forest", "earthy", "geometric"],
    style: {
      ...ink("#F5F3EF", "#14532D", "#14532D", "#9A3412"),
      ...shapes("octagon", "bevel", "octagon"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "travel-compass", color: "#14532D", textColor: "#F5F3EF" },
  },
  {
    id: "plant-label",
    name: "Plant label",
    description:
      "Leaf-shaped modules in a deep green with reversed leaf eyes and drop centres, on a pale sage white, on the plant guide frame. For nurseries and garden beds.",
    tags: ["nature", "forest", "soft", "spring"],
    style: {
      ...ink("#F1F5F2", "#166534", "#14532D", "#166534"),
      ...shapes("leaf", "leaf-reverse", "drop"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "garden-plant-label", color: "#166534", textColor: "#F1F5F2" },
  },
  {
    id: "beach-flag",
    name: "Beach flag",
    description:
      "Liquid rows in a deep sea blue with octagon eyes and round centres, on a pale sand, on the beach conditions frame. For lifeguard posts and beach huts.",
    tags: ["ocean", "tropical", "cool", "soft"],
    style: {
      ...ink("#FDF6E3", "#0C4A6E", "#0C4A6E", "#0369A1"),
      ...shapes("liquid-horizontal", "octagon", "circle"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "beach-conditions", color: "#0C4A6E", textColor: "#FDF6E3" },
  },
  {
    id: "zoo-facts",
    name: "Zoo facts",
    description:
      "Bitten dots in a dark chestnut with extra-rounded eyes and burnt orange centres, on a pale butter, on the animal facts frame. For zoos and farm parks.",
    tags: ["playful", "warm", "nature", "earthy"],
    style: {
      ...ink("#FFFBEB", "#7C2D12", "#7C2D12", "#9A3412"),
      ...shapes("pacman", "extra-rounded", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "zoo-animal-facts", color: "#7C2D12", textColor: "#FFFBEB" },
  },
  // ── Real estate ────────────────────────────────────────────────────────
  {
    id: "open-house",
    name: "Open house",
    description:
      "Square modules in a deep navy with bevelled eyes, on white, on the open house frame. Solid and trustworthy, for agent boards, windows and viewing times.",
    tags: ["professional", "corporate", "cool", "bold"],
    style: {
      ...ink("#FFFFFF", "#0F1F3D"),
      ...shapes("square", "bevel", "square"),
      level: "Q",
      margin: 3,
    },
    frame: {
      id: "property-open-house",
      color: "#0F1F3D",
      textColor: "#FFFFFF",
    },
  },
  {
    id: "yard-sign",
    name: "Yard sign",
    description:
      "Rounded modules in a dark red with navy square eyes, on white, on the for sale yard sign frame. For sign riders and listing flyers.",
    tags: ["bold", "high-contrast", "professional", "corporate"],
    style: {
      ...ink("#FFFFFF", "#7F1D1D", "#0F1F3D", "#0F1F3D"),
      ...shapes("rounded", "square", "square"),
      level: "Q",
      margin: 3,
    },
    frame: {
      id: "yard-sign-for-sale",
      color: "#0F1F3D",
      textColor: "#FFFFFF",
      secondaryColor: "#7F1D1D",
    },
  },
  // ── Cars & parking ─────────────────────────────────────────────────────
  {
    id: "pay-and-display",
    name: "Pay and display",
    description:
      "Rounded modules in a dark slate with bevelled eyes, on white, on the pay for parking frame. Plain and clear, for car parks and meters.",
    tags: ["professional", "minimal", "accessible", "industrial"],
    style: {
      ...ink("#FFFFFF", "#1F2937", "#1F2937", "#374151"),
      ...shapes("rounded", "bevel", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "pay-for-parking", color: "#1F2937", textColor: "#FFFFFF" },
  },
  {
    id: "charge-point",
    name: "Charge point",
    description:
      "Liquid columns in a deep emerald with squircle eyes and brighter green centres, on a mint white, on the start charging frame. For EV chargers and bays.",
    tags: ["futuristic", "nature", "cool", "professional"],
    style: {
      ...ink("#ECFDF5", "#065F46", "#064E3B", "#047857"),
      ...shapes("liquid-vertical", "squircle", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "start-charging", color: "#065F46", textColor: "#ECFDF5" },
  },
  {
    id: "charging-rates",
    name: "Charging rates",
    description:
      "Vertical lines in a dark slate with bevel eyes and octagon centres in cobalt, on white, on the prices and speeds frame. For charger posts and forecourts.",
    tags: ["futuristic", "professional", "cool", "industrial"],
    style: {
      ...ink("#FFFFFF", "#1E293B", "#1E293B", "#1D4ED8"),
      ...shapes("vertical-line", "bevel", "octagon"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "charging-prices", color: "#1E293B", textColor: "#FFFFFF" },
  },
  {
    id: "car-for-sale",
    name: "Car for sale",
    description:
      "Diamond modules in a dark navy with octagon eyes and red octagon centres, on white, on the car for sale frame. For windscreen cards and forecourt boards.",
    tags: ["bold", "professional", "geometric", "high-contrast"],
    style: {
      ...ink("#FFFFFF", "#0F172A", "#0F172A", "#B91C1C"),
      ...shapes("diamond", "octagon", "octagon"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "car-for-sale", color: "#0F172A", textColor: "#FFFFFF" },
  },
  // ── Health & learning ──────────────────────────────────────────────────
  {
    id: "clinic-card",
    name: "Clinic card",
    description:
      "Rounded modules in a deep sea blue with cushion eyes and brighter blue centres, on a pale sky white, on the appointments frame. For clinics and dentists.",
    tags: ["professional", "cool", "soft", "minimal"],
    style: {
      ...ink("#F0F9FF", "#0C4A6E", "#0C4A6E", "#0369A1"),
      ...shapes("rounded", "cushion", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "health-appointment", color: "#0C4A6E", textColor: "#F0F9FF" },
  },
  {
    id: "library-card",
    name: "Library card",
    description:
      "Small square modules in a soft black with octagon eyes and rust rounded centres, on a warm paper tone, on the library card frame. For libraries and reading rooms.",
    tags: ["vintage", "minimal", "monochrome", "elegant"],
    style: {
      ...ink("#FAF7F0", "#1C1917", "#1C1917", "#7C2D12"),
      ...shapes("small-square", "octagon", "rounded"),
      level: "M",
      margin: 3,
    },
    frame: { id: "library-card", color: "#1C1917", textColor: "#FAF7F0" },
  },
  {
    id: "course-card",
    name: "Course card",
    description:
      "Plus-shaped modules in a deep indigo with squircle eyes and brighter indigo plus centres, on white, on the course info frame. For prospectuses and class lists.",
    tags: ["professional", "cool", "geometric", "startup"],
    style: {
      ...ink("#FFFFFF", "#312E81", "#312E81", "#4338CA"),
      ...shapes("plus", "squircle", "plus"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "edu-course", color: "#312E81", textColor: "#FFFFFF" },
  },
  {
    id: "vet-visit",
    name: "Vet visit",
    description:
      "Heart-shaped modules in a deep teal with rounded eyes and heart centres, on a mint white, on the pet visit frame. For vets, groomers and pet shops.",
    tags: ["playful", "soft", "cool", "nature"],
    style: {
      ...ink("#F0FDFA", "#134E4A", "#134E4A", "#0F766E"),
      ...shapes("heart", "rounded", "heart"),
      level: "M",
      margin: 3,
    },
    frame: { id: "health-pet", color: "#134E4A", textColor: "#F0FDFA" },
  },
  {
    id: "physio-sheet",
    name: "Physio sheet",
    description:
      "Liquid columns in a dark slate with bevelled eyes and square centres, on white, on the physio exercises frame. For exercise sheets and clinic handouts.",
    tags: ["professional", "minimal", "cool", "accessible"],
    style: {
      ...ink("#FFFFFF", "#334155", "#1E293B", "#1E293B"),
      ...shapes("liquid-vertical", "bevel", "square"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "physio-exercises", color: "#1E293B", textColor: "#FFFFFF" },
  },
  {
    id: "back-to-school",
    name: "Back to school",
    description:
      "Square modules in a dark slate with extra-rounded eyes and rounded centres in a deep amber, on white, on the notebook frame with its yellow accent. For class info.",
    tags: ["playful", "bold", "professional", "autumn"],
    style: {
      ...ink("#FFFFFF", "#1F2937", "#1F2937", "#92400E"),
      ...shapes("square", "extra-rounded", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "school-notebook" },
  },
  // ── Sports & fitness ───────────────────────────────────────────────────
  {
    id: "gym-schedule",
    name: "Gym schedule",
    description:
      "Diamond modules in black with bevelled eyes and red square centres, on white, on the timetable frame. Sharp and fast, for gyms and class timetables.",
    tags: ["bold", "high-contrast", "geometric", "brutalist"],
    style: {
      ...ink("#FFFFFF", "#0A0A0A", "#0A0A0A", "#BE123C"),
      ...shapes("diamond", "bevel", "square"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "fitness-schedule", color: "#0A0A0A", textColor: "#FFFFFF" },
  },
  {
    id: "run-club",
    name: "Run club",
    description:
      "Round dots in burnt orange with squircle eyes in a deep sea blue, on white, on the run club frame. Two inks with some energy, for clubs and race packs.",
    tags: ["vibrant", "bold", "playful", "colorful"],
    style: {
      ...ink("#FFFFFF", "#9A3412", "#0C4A6E", "#0C4A6E"),
      ...shapes("circle", "squircle", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "run-club", color: "#0C4A6E", textColor: "#FFFFFF" },
  },
  {
    id: "member-card",
    name: "Member card",
    description:
      "Classy rounded modules in a deep indigo with squircle eyes and deep gold centres, on white, on the member card frame. For gyms, clubs and season passes.",
    tags: ["elegant", "professional", "corporate", "midnight"],
    style: {
      ...ink("#FFFFFF", "#1E1B4B", "#1E1B4B", "#7A5A14"),
      ...shapes("classy-rounded", "squircle", "squircle"),
      level: "Q",
      margin: 3,
    },
    frame: {
      id: "membership-card",
      color: "#1E1B4B",
      textColor: "#FFFFFF",
      secondaryColor: "#7A5A14",
    },
  },
  {
    id: "club-jersey",
    name: "Club jersey",
    description:
      "Diamond modules in a dark navy with extra-rounded eyes and red square centres, on white, on the team jersey frame. For club sign-ups, kit orders and fixtures.",
    tags: ["bold", "geometric", "vibrant", "high-contrast"],
    style: {
      ...ink("#FFFFFF", "#0F1F3D", "#0F1F3D", "#B91C1C"),
      ...shapes("diamond", "extra-rounded", "square"),
      level: "Q",
      margin: 3,
    },
    frame: {
      id: "team-jersey",
      color: "#0F1F3D",
      textColor: "#FFFFFF",
      secondaryColor: "#B91C1C",
    },
  },
  {
    id: "tee-time",
    name: "Tee time",
    description:
      "Round dots in a deep forest green with cushion eyes and rounded centres, on a pale lime white, on the golf club frame. For tee bookings and clubhouse menus.",
    tags: ["forest", "elegant", "nature", "professional"],
    style: {
      ...ink("#F7FEE7", "#14532D", "#14532D", "#3F6212"),
      ...shapes("circle", "cushion", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "tee-time", color: "#14532D", textColor: "#F7FEE7" },
  },
  {
    id: "swim-lessons",
    name: "Swim lessons",
    description:
      "Liquid modules in a deep sea blue with rounded eyes and round centres, on a pale aqua white, on the swim lessons frame. For pools, swim schools and lidos.",
    tags: ["ocean", "cool", "playful", "soft"],
    style: {
      ...ink("#ECFEFF", "#0C4A6E", "#0C4A6E", "#0E7490"),
      ...shapes("liquid", "rounded", "circle"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "swim-lessons", color: "#0C4A6E", textColor: "#ECFEFF" },
  },
  {
    id: "bike-rental",
    name: "Bike rental",
    description:
      "Hexagon modules in a deep green with rounded eyes and octagon centres in burnt orange, on white, on the rent a bike frame. For docks, hire shops and trails.",
    tags: ["nature", "bold", "geometric", "vibrant"],
    style: {
      ...ink("#FFFFFF", "#14532D", "#14532D", "#9A3412"),
      ...shapes("hexagon", "rounded", "octagon"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "rent-a-bike", color: "#14532D", textColor: "#FFFFFF" },
  },
  // ── Business & social ──────────────────────────────────────────────────
  {
    id: "dark-card",
    name: "Dark card",
    description:
      "Classy modules in black with square eyes and rounded centres, on white, on the dark business card frame. For printed cards and email signatures.",
    tags: ["minimal", "monochrome", "professional", "corporate"],
    style: {
      ...ink("#FFFFFF", "#111111"),
      ...shapes("classy", "square", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "bizcard-dark", color: "#111111", textColor: "#FFFFFF" },
  },
  {
    id: "five-stars",
    name: "Five stars",
    description:
      "Round dots in a dark bronze with extra-rounded eyes and deep gold flower centres, on ivory, on the review star frame. For counters, receipts and room cards.",
    tags: ["warm", "elegant", "professional", "soft"],
    style: {
      ...ink("#FFFDF5", "#2B2111", "#2B2111", "#7A5A14"),
      ...shapes("circle", "extra-rounded", "flower"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "review-star", color: "#2B2111", textColor: "#FFFDF5" },
  },
  {
    id: "pay-at-the-counter",
    name: "Pay at the counter",
    description:
      "Rounded modules in a deep emerald with squircle eyes, on white, on the tap or scan to pay frame. Calm and clear, for counters, market stalls and invoices.",
    tags: ["professional", "cool", "minimal", "e-commerce"],
    style: {
      ...ink("#FFFFFF", "#065F46", "#064E3B", "#065F46"),
      ...shapes("rounded", "squircle", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "pay-tap", color: "#064E3B", textColor: "#FFFFFF" },
  },
  {
    id: "tip-jar",
    name: "Tip jar",
    description:
      "Plus-shaped modules in burnt orange with bevelled eyes in a dark chestnut and plus centres, on a warm white, on the tips frame. For bars, buskers and baristas.",
    tags: ["warm", "playful", "vibrant", "earthy"],
    style: {
      ...ink("#FFF7ED", "#9A3412", "#7C2D12", "#9A3412"),
      ...shapes("plus", "bevel", "plus"),
      level: "Q",
      margin: 3,
    },
    frame: {
      id: "pay-tips",
      color: "#7C2D12",
      textColor: "#FFF7ED",
      secondaryColor: "#9A3412",
    },
  },
  {
    id: "new-posts",
    name: "New posts",
    description:
      "Round dots in a deep violet with petal eyes in a darker purple and raspberry centres, on white, on the follow us bubble frame. For profiles and shop counters.",
    tags: ["vibrant", "playful", "startup", "candy"],
    style: {
      ...ink("#FFFFFF", "#6D28D9", "#4C1D95", "#BE185D"),
      ...shapes("circle", "petal", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: {
      id: "social-follow-bubble",
      color: "#4C1D95",
      textColor: "#FFFFFF",
    },
  },
  {
    id: "newsletter",
    name: "Newsletter",
    description:
      "Horizontal lines in an ink grey with octagon eyes and square centres, on white, on the newsletter frame. Reads like a masthead, for sign-up cards and inserts.",
    tags: ["minimal", "monochrome", "professional", "blog"],
    style: {
      ...ink("#FFFFFF", "#1F2937"),
      ...shapes("horizontal-line", "octagon", "square"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "social-newsletter", color: "#1F2937", textColor: "#FFFFFF" },
  },
  {
    id: "podcast",
    name: "Podcast",
    description:
      "Round dots in a deep indigo with gear eyes and dotted centres in red, on a pale lavender, on the podcast frame. For show notes, studio doors and merch.",
    tags: ["midnight", "playful", "vibrant", "blog"],
    style: {
      ...ink("#F5F3FF", "#1E1B4B", "#1E1B4B", "#BE123C"),
      ...shapes("circle", "gear", "dots"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "podcast", color: "#1E1B4B", textColor: "#F5F3FF" },
  },
  {
    id: "app-card",
    name: "App card",
    description:
      "Rounded modules in black with octagon eyes and cobalt centres, on white, on the phone frame that says Get the app. For download cards and store counters.",
    tags: ["startup", "saas", "minimal", "high-contrast"],
    style: {
      ...ink("#FFFFFF", "#0A0A0A", "#0A0A0A", "#1D4ED8"),
      ...shapes("rounded", "octagon", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "app-phone", color: "#0A0A0A", textColor: "#FFFFFF" },
  },
  {
    id: "day-pass",
    name: "Day pass",
    description:
      "Small square modules in a dark slate with octagon eyes and square centres, on white, on the coworking day pass frame. For desks, lockers and meeting rooms.",
    tags: ["professional", "minimal", "startup", "geometric"],
    style: {
      ...ink("#FFFFFF", "#1E293B"),
      ...shapes("small-square", "octagon", "square"),
      level: "M",
      margin: 3,
    },
    frame: { id: "coworking-pass", color: "#1E293B", textColor: "#FFFFFF" },
  },
  // ── Nonprofits & community ─────────────────────────────────────────────
  {
    id: "donation-jar",
    name: "Donation jar",
    description:
      "Large touching dots in a deep teal green with shield eyes and rust octagon centres, on white, on the donate here frame. For collection tins, stalls and notice boards.",
    tags: ["warm", "soft", "accessible", "professional"],
    style: {
      ...ink("#FFFFFF", "#0F3D33", "#0F3D33", "#9A3412"),
      ...shapes("circle-large", "shield", "octagon"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "donation-jar", color: "#0F3D33", textColor: "#FFFFFF" },
  },
  {
    id: "volunteer",
    name: "Volunteer",
    description:
      "Rounded modules in a deep rose with rounded eyes and heart centres in red, on white, on the volunteer frame. For charities, shelters and community days.",
    tags: ["warm", "romantic", "soft", "bold"],
    style: {
      ...ink("#FFFFFF", "#9F1239", "#9F1239", "#BE123C"),
      ...shapes("rounded", "rounded", "heart"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "volunteer", color: "#9F1239", textColor: "#FFFFFF" },
  },
  {
    id: "adopt-me",
    name: "Adopt me",
    description:
      "Mixed dots in a dark chestnut with extra-rounded eyes and heart centres in burnt orange, on a warm white, on the adopt me frame. For shelters and rescue pens.",
    tags: ["warm", "playful", "soft", "earthy"],
    style: {
      ...ink("#FFF7ED", "#7C2D12", "#7C2D12", "#9A3412"),
      ...shapes("circle-mixed", "extra-rounded", "heart"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "adopt-me", color: "#7C2D12", textColor: "#FFF7ED" },
  },
  {
    id: "plant-a-tree",
    name: "Plant a tree",
    description:
      "Leaf-shaped modules in a deep green with drop eyes and leaf centres, on a mint white, on the plant a tree frame. For planting days, parks and green groups.",
    tags: ["nature", "forest", "spring", "soft"],
    style: {
      ...ink("#F0FDF4", "#14532D", "#166534", "#14532D"),
      ...shapes("leaf", "drop", "leaf"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "plant-a-tree", color: "#14532D", textColor: "#F0FDF4" },
  },
  {
    id: "give-blood",
    name: "Give blood",
    description:
      "Heart-shaped modules in a dark red with extra-rounded eyes and drop centres, on white, on the give blood frame. For donor drives and clinic posters.",
    tags: ["bold", "warm", "accessible", "high-contrast"],
    style: {
      ...ink("#FFFFFF", "#991B1B", "#7F1D1D", "#991B1B"),
      ...shapes("heart", "extra-rounded", "drop"),
      level: "M",
      margin: 3,
    },
    frame: { id: "give-blood", color: "#7F1D1D", textColor: "#FFFFFF" },
  },
  {
    id: "bake-sale",
    name: "Bake sale",
    description:
      "Scattered dots in a toast brown with rounded eyes and golden brown centres, on a pale butter, on the bake sale frame. For school fairs and fundraisers.",
    tags: ["warm", "playful", "soft", "candy"],
    style: {
      ...ink("#FEF9C3", "#713F12", "#713F12", "#854D0E"),
      ...shapes("random-dots", "rounded", "rounded"),
      level: "Q",
      margin: 3,
    },
    frame: { id: "bake-sale", color: "#713F12", textColor: "#FEF9C3" },
  },
];
