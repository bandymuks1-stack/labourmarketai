/* R7 data layer — R&D ONLY, no production surface.
 *
 * REAL: every market count here is copied verbatim from
 * data/world-snapshot.json (production read-only SELECT, 2026-08-15).
 * Counts are counts of the classified v2 subset where noted. No employer
 * is ever named. No person score exists anywhere.
 *
 * DEMO: the persona (Jonas), his journal, the organization, its project,
 * people and inquiry-discovery profiles are demonstration content for the
 * prototype and are labelled as such in the product's provenance drawer.
 */
window.R7 = (function () {
  var real = {
    queriedAt: "2026-08-15 21:20",
    supplier: "Arbetsförmedlingen (CC0)",
    country: { name: "Švedija", active: 41432, employers: 7782, last7: 10260, regions: 21, cities: 290 },
    region: { name: "Västra Götaland", active: 6289, cities: 49 },
    city: { name: "Göteborg", active: 3078, employers: 1036, classified: 1257, professions: 36 },
    topCities: [
      { name: "Stockholm", n: 6523 }, { name: "Göteborg", n: 3066 }, { name: "Malmö", n: 1522 },
      { name: "Uppsala", n: 1073 }, { name: "Linköping", n: 1051 }, { name: "Jönköping", n: 805 },
      { name: "Örebro", n: 716 }, { name: "Umeå", n: 692 }, { name: "Västerås", n: 684 },
      { name: "Luleå", n: 625 }, { name: "Norrköping", n: 618 }, { name: "Lund", n: 600 },
    ],
    cityProfessions: {
      warehouse_worker: { lt: "Sandėlio darbuotojas", n: 98, employers: 40 },
      driver: { lt: "Vairuotojas", n: 78, employers: 61 },
      cook: { lt: "Virėjas", n: 72, employers: 56 },
      electrician: { lt: "Elektrikas", n: 71, employers: 47 },
      sales_assistant: { lt: "Pardavėjas", n: 62, employers: 41 },
      kitchen_helper: { lt: "Virtuvės pagalbininkas", n: 55, employers: 34 },
      cleaner: { lt: "Valytojas", n: 47, employers: 34 },
      production_worker: { lt: "Gamybos darbuotojas", n: 22, employers: 14 },
      caregiver: { lt: "Slaugytojo padėjėjas", n: 140, employers: 59 },
      software_developer: { lt: "Programuotojas", n: 145, employers: 73 },
    },
    /* canonical catalogue skills per profession — production profession_skills rows */
    professionSkills: {
      warehouse_worker: ["barcode-scanning", "forklift-operation", "order-picking", "packaging", "pallet-handling", "stock-taking", "warehouse-operations"],
      driver: ["cargo-transport", "delivery-driving", "driving", "forklift-operation"],
      cook: ["cooking", "waiting-tables"],
      kitchen_helper: ["cleaning-services", "dishwashing", "kitchen-help"],
      electrician: ["cable-pulling", "electrical-install", "electrical-testing", "industrial-electric", "lighting-install", "low-voltage", "panel-install"],
      sales_assistant: ["cashier", "customer-service", "sales-assistant"],
    },
  };

  var capLt = {
    "pallet-handling": "Palečių tvarkymas", "forklift-operation": "Šakinis krautuvas",
    "order-picking": "Užsakymų rinkimas", "stock-taking": "Inventorizacija",
    "barcode-scanning": "Brūkšninių kodų skenavimas", "warehouse-operations": "Sandėlio operacijos",
    "packaging": "Pakavimas", "delivery-driving": "Pristatymai", "driving": "Vairavimas",
    "cargo-transport": "Krovinių pervežimas", "cashier": "Kasos darbas",
    "customer-service": "Klientų aptarnavimas", "sales-assistant": "Prekybos salė",
    "cable-pulling": "Kabelių tiesimas", "electrical-install": "Elektros instaliacija",
  };

  /* ── DEMO persona ─────────────────────────────────────────────────── */
  var persona = {
    name: "Jonas Vaitkus", initials: "JV",
    role: "Sandėlio darbuotojas", place: "Göteborg",
    since: "2024 m. spalio", contexts: 3, entries: 148, evidence: 67,
  };

  /* capability accumulation — sizes drive the identity map */
  var capabilities = [
    { slug: "pallet-handling", cluster: "Sandėlys", entries: 31, evidence: 19 },
    { slug: "warehouse-operations", cluster: "Sandėlys", entries: 27, evidence: 11 },
    { slug: "forklift-operation", cluster: "Sandėlys", entries: 23, evidence: 14 },
    { slug: "order-picking", cluster: "Sandėlys", entries: 18, evidence: 9 },
    { slug: "barcode-scanning", cluster: "Sandėlys", entries: 16, evidence: 6 },
    { slug: "stock-taking", cluster: "Sandėlys", entries: 12, evidence: 7 },
    { slug: "packaging", cluster: "Sandėlys", entries: 9, evidence: 4 },
    { slug: "driving", cluster: "Transportas", entries: 6, evidence: 2 },
    { slug: "delivery-driving", cluster: "Transportas", entries: 4, evidence: 2 },
    { slug: "cashier", cluster: "Aptarnavimas", entries: 8, evidence: 3 },
    { slug: "customer-service", cluster: "Aptarnavimas", entries: 5, evidence: 2 },
  ];

  var journal = [
    { day: "Šiandien", date: "08-16", entries: [
      { t: "08:10", ctx: "Priėmimas · Terminalas 3", txt: "18 palečių iškrauta iš rytinio reiso, pažeidimų nėra.", caps: ["pallet-handling", "forklift-operation"], img: "pallets", ev: true },
      { t: "10:35", ctx: "Siuntų patikra", txt: "27 siuntos nuskenuotos ir sutikrintos su važtaraščiais.", caps: ["barcode-scanning", "stock-taking"], ev: true },
      { t: "13:20", ctx: "Krova · išvežimo zona", txt: "Paruošta krova 4 popietės reisams.", caps: ["order-picking", "packaging"], img: "box", ev: false },
    ]},
    { day: "Vakar", date: "08-15", entries: [
      { t: "07:55", ctx: "A sektorius", txt: "Inventorizacija — sutikrintos 312 pozicijų.", caps: ["stock-taking"], img: "inventory", ev: true },
      { t: "12:40", ctx: "Technika", txt: "Šakinio krautuvo kasdienė apžiūra, pakeista dujų kasetė.", caps: ["forklift-operation"], ev: false },
      { t: "15:10", ctx: "Krova", txt: "Paruoštos 9 paletės rytiniam reisui.", caps: ["pallet-handling"], img: "forklift", ev: true },
    ]},
    { day: "Ketvirtadienis", date: "08-14", entries: [
      { t: "08:20", ctx: "Priėmimas", txt: "Priimtos 3 siuntos iš uosto terminalo.", caps: ["warehouse-operations", "barcode-scanning"], img: "aisle", ev: true },
      { t: "14:05", ctx: "Vietinis ratas", txt: "Pavadavau vairuotoją — 6 pristatymai mieste.", caps: ["delivery-driving", "driving"], img: "street", ev: false },
    ]},
    { day: "Trečiadienis", date: "08-13", entries: [
      { t: "09:00", ctx: "B sektorius", txt: "Perstumdyta sezoninė zona, atlaisvintos 2 eilės.", caps: ["pallet-handling", "warehouse-operations"], ev: false },
    ]},
  ];

  /* org context — demo */
  var org = {
    name: "Skandi Terminalas AB", tag: "demo organizacija", initials: "ST",
    place: "Göteborg · Ringön",
    today: { people: 12, sites: 3, inquiries: 1, alerts: 1 },
    people: [
      { ini: "JV", name: "Jonas V.", role: "Sandėlys", caps: ["pallet-handling", "forklift-operation"], on: true },
      { ini: "MK", name: "Marius K.", role: "Sandėlys", caps: ["order-picking", "barcode-scanning"], on: true },
      { ini: "AL", name: "Aistė L.", role: "Patikra", caps: ["stock-taking"], on: true },
      { ini: "RS", name: "Rokas S.", role: "Transportas", caps: ["driving", "cargo-transport"], on: true },
      { ini: "EB", name: "Eglė B.", role: "Koordinavimas", caps: ["warehouse-operations"], on: true },
      { ini: "TP", name: "Tomas P.", role: "Elektra (ranga)", caps: ["electrical-install", "cable-pulling"], on: false },
    ],
    stream: [
      { t: "13:41", who: "MK", txt: "Surinkti 46 užsakymai, zona D baigta.", caps: ["order-picking"] },
      { t: "13:20", who: "JV", txt: "Paruošta krova 4 popietės reisams.", caps: ["order-picking", "packaging"] },
      { t: "12:55", who: "RS", txt: "Grįžau iš 2 reiso, kitas 14:30.", caps: ["driving"] },
      { t: "11:32", who: "AL", txt: "C sektoriaus patikra be neatitikimų.", caps: ["stock-taking"] },
      { t: "10:04", who: "TP", txt: "Pakloti kabeliai 2 aukšto skydinei.", caps: ["cable-pulling"], site: 2 },
    ],
    sites: [
      { id: 1, name: "Terminalas 3", sub: "kasdienė veikla", people: 8, state: "ok" },
      { id: 2, name: "Terminalo plėtra", sub: "Ringön · iki XI.30", people: 4, state: "gap", gap: "trūksta 2 žmonių" },
      { id: 3, name: "Uosto punktas", sub: "priėmimas", people: 2, state: "ok" },
    ],
  };

  var project = {
    name: "Terminalo plėtra", sub: "Ringön · Göteborg", deadline: "iki XI.30",
    progress: 0.44,
    capacity: [
      { slug: "pallet-handling", have: 4, need: 6 },
      { slug: "forklift-operation", have: 3, need: 4 },
      { slug: "electrical-install", have: 2, need: 2 },
      { slug: "cable-pulling", have: 1, need: 2 },
    ],
    week: [
      { d: "Pr", blocks: [["Krova", 4], ["Elektra", 2]] },
      { d: "An", blocks: [["Krova", 4], ["Elektra", 2]] },
      { d: "Tr", blocks: [["Krova", 3], ["Patikra", 1]] },
      { d: "Kt", blocks: [["Krova", 4], ["Elektra", 1]] },
      { d: "Pn", blocks: [["Krova", 4]] },
    ],
    milestones: [
      { date: "08-12", txt: "Stelažų 1 linija sumontuota", img: "aisle" },
      { date: "08-08", txt: "Grindų danga išlieta ir išdžiūvusi", img: "inventory" },
      { date: "07-30", txt: "Perimta patalpa iš rangovo", img: "cranes" },
    ],
  };

  /* inquiry-discovery demo profiles — anonymous, evidence-first, no score */
  var supply = [
    { ini: "A", entries: 34, evCaps: ["pallet-handling", "forklift-operation"], place: "Göteborg", from: "nuo IX.1", ctx: "3 m. sandėlio įrašų istorija" },
    { ini: "B", entries: 21, evCaps: ["pallet-handling", "order-picking"], place: "Mölndal", from: "nuo IX.15", ctx: "žurnalas pildomas kasdien" },
    { ini: "C", entries: 12, evCaps: ["forklift-operation"], place: "Göteborg", from: "iškart", ctx: "krautuvo pažymėjimas įkeltas" },
  ];

  return { real: real, capLt: capLt, persona: persona, capabilities: capabilities,
           journal: journal, org: org, project: project, supply: supply };
})();
