/*
  Product list. Add, remove or edit entries here.

  id         short unique code, no spaces
  name       shown on the page
  quoteName  (optional) wording used on the quote list if different from name
  line       one of the ids in ALPHACOAT_LINES
  chip       how the sample card is drawn: "zinc" (matte gray), "gloss" (green gloss) or "clear" (thinner)
  pack       pack size, or "" if it should not be stated
  summary    one or two plain sentences on what it is for
  image      picture shown when the row is opened. Swap in a photo of the real can when there is one.
  specs      rows for the small table: [label, value]. Only list what is certain.
             Add data sheet figures here when you have them, for example ["Coverage", "... m² per gallon"].
*/
window.ALPHACOAT_LINES = [
  { id: "primer",  label: "Primers",               single: "Primer" },
  { id: "topcoat", label: "Topcoats",              single: "Topcoat" },
  { id: "thinner", label: "Thinners and reducers", single: "Thinner" }
];

window.ALPHACOAT_PRODUCTS = [
  {
    id: "3130",
    name: "Alphacoat 3130 Epoxy Zinc Rich Primer",
    line: "primer",
    chip: "zinc",
    pack: "Gallon",
    summary: "Zinc-rich epoxy primer for structural steel and other steelwork. The zinc in the film protects the steel from rust.",
    image: "img/can/can-3130.webp",
    specs: [
      ["Type", "Primer"],
      ["Resin", "Epoxy"],
      ["Pigment", "Zinc-rich"],
      ["Use on", "Structural steel and steelwork"],
      ["Pack size", "Gallon"]
    ]
  },
  {
    id: "topcoat",
    name: "Topcoats",
    quoteName: "Topcoat (please recommend)",
    line: "topcoat",
    chip: "gloss",
    pack: "",
    summary: "Finish coats that give the color and gloss and protect the coats beneath. Tell us the surface, color and finish you need.",
    image: "img/can/can-topcoat.webp",
    specs: [
      ["Type", "Topcoat"],
      ["Goes over", "A primed surface"],
      ["Colors and finishes", "Ask us what is available"],
      ["Pack size", "Ask us"]
    ]
  },
  {
    id: "thinner-10",
    name: "Thinner #10 Lacquer Thinner",
    line: "thinner",
    chip: "clear",
    pack: "Gallon",
    summary: "For thinning lacquer-based paints and for cleaning spray guns, brushes and tools.",
    image: "img/can/can-thinner-10.webp",
    specs: [
      ["Type", "Lacquer thinner"],
      ["Use with", "Lacquer-based paints"],
      ["Also for", "Cleaning spray guns, brushes and tools"],
      ["Pack size", "Gallon"]
    ]
  },
  {
    id: "thinner-40",
    name: "Thinner #40 Polyurethane Reducer",
    line: "thinner",
    chip: "clear",
    pack: "Gallon",
    summary: "For reducing polyurethane coatings to the right consistency for spraying or brushing.",
    image: "img/can/can-thinner-40.webp",
    specs: [
      ["Type", "Polyurethane reducer"],
      ["Use with", "Polyurethane coatings"],
      ["Pack size", "Gallon"]
    ]
  }
];
