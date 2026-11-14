/*
  Product list. Add, remove or edit entries here.

  id         short unique code, no spaces
  name       shown on the page
  quoteName  (optional) wording used on the quote list if different from name
  line       one of the ids in ALPHACOAT_LINES
  chip       how the sample card is drawn: "zinc" (matte gray), "gloss" (the visitor's color, gloss) or "clear" (thinner)
  pack       pack size, or "" if it should not be stated
  summary    one or two plain sentences on what it is for
  image      still picture of the can. Swap in a photo of the real can when there is one.
  turn       (optional) strip of nine frames used to turn the can on the shelf
  specs      rows for the small table: [label, value]. Only list what is certain.

  DATA SHEET FIGURES
  sheet      figures from the technical data sheet. Leave a line as "" (or null) until you have the real number;
             empty lines are simply not shown. Fill them in and they appear on the page automatically.
               coverage   number only: square metres one gallon covers in one coat, for example 28
                          (the paint calculator uses this figure when the product is chosen)
               mixing     for example "4 parts base to 1 part hardener, by volume"
               thinning   for example "Up to 10% with Thinner #40"
               touchDry   for example "30 minutes at 30 °C"
               recoat     for example "After 4 hours"
               potLife    for example "6 hours at 30 °C"
               dft        for example "75 microns per coat"
               solids     for example "60% by volume"
               methods    for example "Brush, roller or spray"
  datasheetFile  path to the PDF data sheet, for example "docs/alphacoat-3130.pdf". When this is set, the page
                 offers the download; until then it offers "Ask for the data sheet".
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
    shelfName: "3130 Epoxy Zinc Rich Primer",
    line: "primer",
    chip: "zinc",
    pack: "Gallon",
    summary: "Zinc-rich epoxy primer for structural steel and other steelwork. The zinc in the film protects the steel from rust.",
    image: "img/can/can-3130.webp",
    turn: "img/can/turn-3130.webp",
    specs: [
      ["Type", "Primer"],
      ["Resin", "Epoxy"],
      ["Pigment", "Zinc-rich"],
      ["Use on", "Structural steel and steelwork"],
      ["Pack size", "Gallon"]
    ],
    sheet: { coverage: null, mixing: "", thinning: "", touchDry: "", recoat: "", potLife: "", dft: "", solids: "", methods: "" },
    datasheetFile: ""
  },
  {
    id: "topcoat",
    name: "Topcoats",
    shelfName: "Topcoats",
    quoteName: "Topcoat (please recommend)",
    line: "topcoat",
    chip: "gloss",
    pack: "",
    summary: "Finish coats that give the color and gloss and protect the coats beneath. Made in any color, from matte to gloss: tell us the surface, color and finish you need.",
    image: "img/can/can-topcoat.webp",
    turn: "img/can/turn-topcoat.webp",
    specs: [
      ["Type", "Topcoat"],
      ["Goes over", "A primed surface"],
      ["Colors", "Any color, from a HEX code or a sample"],
      ["Finishes", "Matte, satin, semi-gloss and gloss"],
      ["Pack size", "Ask us"]
    ],
    sheet: { coverage: null, mixing: "", thinning: "", touchDry: "", recoat: "", potLife: "", dft: "", solids: "", methods: "" },
    datasheetFile: ""
  },
  {
    id: "thinner-10",
    name: "Thinner #10 Lacquer Thinner",
    shelfName: "Thinner #10 Lacquer Thinner",
    line: "thinner",
    chip: "clear",
    pack: "Gallon",
    summary: "For thinning lacquer-based paints and for cleaning spray guns, brushes and tools.",
    image: "img/can/can-thinner-10.webp",
    turn: "img/can/turn-thinner-10.webp",
    specs: [
      ["Type", "Lacquer thinner"],
      ["Use with", "Lacquer-based paints"],
      ["Also for", "Cleaning spray guns, brushes and tools"],
      ["Pack size", "Gallon"]
    ],
    sheet: { coverage: null, mixing: "", thinning: "", touchDry: "", recoat: "", potLife: "", dft: "", solids: "", methods: "" },
    datasheetFile: ""
  },
  {
    id: "thinner-40",
    name: "Thinner #40 Polyurethane Reducer",
    shelfName: "Thinner #40 Polyurethane Reducer",
    line: "thinner",
    chip: "clear",
    pack: "Gallon",
    summary: "For reducing polyurethane coatings to the right consistency for spraying or brushing.",
    image: "img/can/can-thinner-40.webp",
    turn: "img/can/turn-thinner-40.webp",
    specs: [
      ["Type", "Polyurethane reducer"],
      ["Use with", "Polyurethane coatings"],
      ["Pack size", "Gallon"]
    ],
    sheet: { coverage: null, mixing: "", thinning: "", touchDry: "", recoat: "", potLife: "", dft: "", solids: "", methods: "" },
    datasheetFile: ""
  }
];
