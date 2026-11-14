/*
  "Before you order": the questions buyers ask first.

  A question is only shown when it has an answer. The ones at the bottom are waiting for Alphacoat:
  type the answer between the quotes and the question appears on the page.

  q      the question
  a      the answer, in plain words
  link   (optional) { text: "...", href: "..." } shown after the answer
*/
window.ALPHACOAT_FAQ = [
  {
    q: "Can you make a specific color?",
    a: "Yes. Alphacoat makes any color. Send us a HEX code or a sample, or choose one with the color tool on this page.",
    link: { text: "Open the color tool", href: "#colors" }
  },
  {
    q: "What finishes can I get?",
    a: "Matte, satin, semi-gloss and gloss."
  },
  {
    q: "How are the paints sold?",
    a: "The products listed on this page are sold by the gallon."
  },
  {
    q: "How do I get a price?",
    a: "Send your list with the quote form, or call 0977 163 5220. We reply with a written quotation, itemized and priced per gallon.",
    link: { text: "Request a quote", href: "#quote" }
  },
  {
    q: "I don't know which paint I need. Can you help?",
    a: "Yes. Answer three questions in the guide to get a starting list, or describe the job in your quote request and we will recommend a system.",
    link: { text: "Open the guide", href: "#guide" }
  },
  {
    q: "Where are you?",
    a: "Block 1 Lot 42 Phase 2, San Lorenzo Ruiz, Taytay, Rizal.",
    link: { text: "Open in Google Maps", href: "https://www.google.com/maps/search/?api=1&query=San%20Lorenzo%20Ruiz%2C%20Taytay%2C%20Rizal" }
  },

  // ---- Waiting for Alphacoat's answers. Fill in "a" and the question shows up. ----
  { q: "Do you deliver, and to where?", a: "" },
  { q: "How long does an order take?", a: "" },
  { q: "Is there a minimum order?", a: "" },
  { q: "How do I pay?", a: "" },
  { q: "How do you match a custom color, and how long does it take?", a: "" }
];
