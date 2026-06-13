/**
 * Skill synonym sets (Work Journal Text-to-Skill Recognition v1, Layer B).
 *
 * The base `SKILL_HINTS_LT` needles in ./keywords.ts are the EXACT tier (high
 * confidence). This file adds curated SYNONYM phrases per canonical skill slug —
 * extra LT/RU/EN forms a worker actually writes, including EN words the base
 * needles lacked. A synonym hit is MEDIUM confidence (weaker than an exact
 * needle, stronger than fuzzy).
 *
 * Rules:
 *  - Keys MUST be real slugs in messages/{locale}/skill-names.json — never
 *    invent a skill (doctrine §7, no fake skills).
 *  - Prefer phrases ≥4 chars; short ambiguous stems belong nowhere.
 *  - Matched after folding (see ./normalize), so write LT forms once (accents
 *    optional) — `langu` matches `langų`.
 */
export const SKILL_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  tiling: ["tile", "tiles", "tiling", "tiled"],
  drywall: ["gips", "gipsas", "plasterboard", "drywall", "гипс"],
  "ceiling-systems": ["ceiling", "suspended ceiling", "потолоч"],
  "partition-walls": ["partition wall", "перегородк"],
  plastering: ["plaster", "rendering"],
  "skim-coating": ["skim coat", "skimming", "filler"],
  painting: ["paint", "painted", "painting", "repaint"],
  flooring: ["floor", "flooring", "laminate", "parquet", "laid floor"],
  "floor-screeding": ["screed", "screeding"],
  plumbing: ["plumb", "plumbing", "pipework", "pipes"],
  "electrical-install": ["electric", "electrical", "wiring", "rewire"],
  carpentry: [
    // window + door installation maps to the carpentry skill (no separate slug)
    "langai",
    "langus",
    "langu",
    "duris",
    "duru",
    "durys",
    "window",
    "windows",
    "window install",
    "door",
    "doors",
    "carpentry",
    "joinery",
    "окна",
    "окно",
    "двери",
    "дверь",
  ],
  insulation: ["insulate", "insulation", "insulated"],
  waterproofing: ["waterproof", "waterproofing", "tanking"],
  bricklaying: ["brick", "bricks", "bricklaying", "blockwork"],
  "concrete-pouring": [
    "betona",
    "betonas",
    "betono",
    "liejau beton",
    "concrete",
    "concreting",
    "залив бетон",
    "бетон",
  ],
  "rebar-cutting": ["rebar", "reinforcement bar", "reinforcement"],
  "welding-blueprint": ["weld", "welding", "welded", "mig", "tig"],
  scaffolding: ["scaffold", "scaffolding"],
  demolition: ["demolish", "demolition", "strip out", "tear down"],
  "site-cleaning": ["clean up", "site clean", "tidy"],
  earthworks: ["dig", "digging", "excavate", "excavation", "trench"],
  wallpapering: ["wallpaper", "wallpapering", "обои", "обоев"],
  "timber-framing": ["timber frame", "framing", "joists", "rafters"],
  formwork: ["formwork", "shuttering", "klojiniai", "klojinius"],
  "blueprint-reading": ["blueprint", "drawings", "read plans"],
  "general-labour": ["labourer", "general labour", "helper", "laborer"],
};
