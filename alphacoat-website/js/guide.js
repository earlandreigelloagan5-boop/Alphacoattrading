/*
  Rules for the "Not sure what you need?" guide.

  IMPORTANT: these rules are a first draft built only from the three products on the site. Alphacoat should
  check them and add its own (which primer for concrete, which topcoat type for each exposure, and so on).

  surfaces   what the visitor is painting
               primer   id of a product in products.js to suggest as the first coat, or null when Alphacoat
                        has to recommend one
               why      a few words shown after the primer's name
               ask      (when primer is null) what the page says instead of naming a product
  places     where the job is
               note     (optional) a line shown with the result
  finishes   the finish choices offered
*/
window.ALPHACOAT_GUIDE = {
  surfaces: [
    { id: "steel",    label: "Structural steel",             primer: "3130", why: "the first coat on steel" },
    { id: "gate",     label: "Gates, grilles and railings",  primer: "3130", why: "the first coat on steel" },
    { id: "tank",     label: "Tanks, pipes and machinery",   primer: "3130", why: "the first coat on steel" },
    { id: "wall",     label: "Concrete or masonry walls",    primer: null,   ask: "We will recommend a primer for concrete and masonry." },
    { id: "other",    label: "Something else",               primer: null,   ask: "Tell us the surface and we will recommend a primer." }
  ],
  places: [
    { id: "indoor",  label: "Indoors" },
    { id: "outdoor", label: "Outdoors" },
    { id: "harsh",   label: "Near the sea or chemicals", note: "Harsh conditions usually need a heavier system. Tell us what the surface is exposed to." }
  ],
  finishes: ["Matte", "Satin", "Semi-gloss", "Gloss", "Not sure yet"],
  thinner: "The one that matches the topcoat: Thinner #40 for polyurethane, Thinner #10 for lacquer."
};
