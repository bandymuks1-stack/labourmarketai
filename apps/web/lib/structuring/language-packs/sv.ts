import type { LanguagePack } from "./types";

/**
 * SV — Swedish offline recognition pack (owner mandate 2026-07-04).
 *
 * Needles written with Swedish letters; the matcher folds both needle and
 * text (å→a, ä→a, ö→o), so "städade" and worker-typed "stadade" both match.
 *
 * Collision notes (measured/blocked while authoring):
 *  - "målade" folds to "malade" ⊂ EN "marmalade" — painting is
 *    object/agent-anchored ("målade väggar"/"målare"/"måleriarbete").
 *  - "stolar" (chairs) — the PL pack deliberately uses "stolarz" (with z)
 *    for carpentry so Swedish event sentences ("ställde fram stolar") never
 *    read as Polish carpentry.
 *  - "packade" fuzzy-brushed "packag" (the measured RED-canary accident) —
 *    now an exact needle for packaging: real coverage supersedes it.
 *  - SV power tools "elverktyg" and consumer "elektronik" are in the
 *    power-tool context guard; real electrical work matches "eluttag"/
 *    "elinstallation"/"elarbete"/"elektriker".
 *  - bare "truck" is the EN lorry — forklift anchors on "gaffeltruck"/
 *    "truckkort"/"körde truck".
 */
export const SV_PACK: LanguagePack = {
  language: "sv",
  skills: {
    // ── office & administration ────────────────────────────────────────────
    "data-entry": {
      exact: ["matade in data", "registrerade uppgifter", "datainmatning", "la in data"],
    },
    "office-software": {
      exact: ["i excel", "med excel", "kalkylblad"],
    },
    "document-handling": {
      // base "dokument" already matches "dokument…"; SV-only forms below.
      exact: ["arkiverade", "sorterade papper", "diarieförde"],
    },
    bookkeeping: {
      exact: ["fakturor", "bokföring", "fakturerade", "skrev fakturor"],
    },
    reception: {
      // base "reception" covers "receptionen".
      exact: ["tog emot besökare", "tog emot gäster", "receptionist"],
    },
    administration: {
      exact: ["administrativt arbete", "kontorsarbete", "handläggning"],
    },
    // ── warehouse & logistics ──────────────────────────────────────────────
    "warehouse-operations": {
      exact: ["på lagret", "lagerarbete", "lagermedarbetare", "jobbade på lager"],
    },
    "order-picking": {
      exact: ["plockade ordrar", "orderplock", "plockade varor"],
    },
    "barcode-scanning": {
      exact: ["skannade varor", "streckkod", "scannade varor"],
    },
    "pallet-handling": {
      exact: ["pallar", "staplade pallar", "pallyftare"],
    },
    "stock-taking": {
      exact: ["inventering", "räknade varor", "inventerade"],
    },
    driving: {
      exact: ["körde lastbil", "körde bil", "chaufför", "körkort", "körde skåpbil"],
    },
    "delivery-driving": {
      exact: ["levererade paket", "budbil", "körde ut paket"],
    },
    "cargo-transport": {
      exact: ["frakt", "körde gods", "godstransport"],
    },
    "forklift-operation": {
      exact: ["gaffeltruck", "truckkort", "körde truck"],
    },
    // ── hospitality & food ─────────────────────────────────────────────────
    cooking: {
      exact: ["lagade mat", "i köket", "som kock", "tillagade mat"],
    },
    "kitchen-help": {
      exact: ["köksbiträde", "hjälpte till i köket", "kökshjälp"],
    },
    dishwashing: {
      exact: ["diskade", "diskning", "diskare"],
    },
    baking: {
      exact: ["bakade bröd", "bageri", "bakade bullar", "som bagare"],
    },
    "barista-work": {
      exact: ["bryggde kaffe", "gjorde kaffe", "kaffebar"],
    },
    "waiting-tables": {
      exact: ["servitör", "servitris", "serverade gäster", "serverade mat"],
    },
    // ── retail & customer service ──────────────────────────────────────────
    cashier: {
      exact: ["i kassan", "kassabiträde", "satt i kassan"],
    },
    "customer-service": {
      exact: ["kundservice", "kundtjänst", "hjälpte kunder", "rådgav kunder"],
    },
    "call-centre": {
      exact: ["besvarade samtal", "tog emot samtal", "kundtjänst per telefon"],
    },
    merchandising: {
      exact: ["fyllde på hyllor", "varupåfyllning", "ställde upp varor"],
    },
    "sales-assistant": {
      exact: ["butiksbiträde", "i butiken", "expedit", "sålde varor i butik"],
    },
    // ── cleaning & facility ────────────────────────────────────────────────
    "cleaning-services": {
      exact: ["städade", "städning", "lokalvårdare", "städare"],
    },
    laundry: {
      exact: ["tvättade kläder", "strök kläder", "tvätteri", "strök skjortor"],
    },
    "window-cleaning": {
      exact: ["putsade fönster", "fönsterputs", "tvättade fönster"],
    },
    housekeeping: {
      exact: ["städade rum", "hotellrum", "husfru", "rumsstädning"],
    },
    // ── repair & maintenance ───────────────────────────────────────────────
    "auto-repair": {
      exact: ["reparerade bilar", "bilverkstad", "bilmekaniker", "skruvade med bilar"],
    },
    "appliance-repair": {
      exact: ["reparerade tvättmaskiner", "vitvaror", "reparerade kylskåp"],
    },
    "handyman-work": {
      exact: ["vaktmästare", "mindre reparationer", "småfix"],
    },
    // ── beauty & personal services ─────────────────────────────────────────
    hairdressing: {
      exact: ["klippte hår", "frisör", "frisersalong"],
    },
    barbering: {
      exact: ["barberare", "rakade skägg", "trimmade skägg"],
    },
    "nail-care": {
      exact: ["manikyr", "pedikyr", "nagelteknolog", "gjorde naglar"],
    },
    // ── HR & recruitment ───────────────────────────────────────────────────
    recruitment: {
      exact: ["rekryterade", "höll anställningsintervjuer", "rekrytering av personal"],
    },
    "personnel-admin": {
      exact: ["personaladministration", "personalärenden", "personalakter"],
    },
    // ── IT ─────────────────────────────────────────────────────────────────
    programming: {
      exact: ["programmerade", "skrev kod", "utvecklade hemsida", "fixade buggar"],
    },
    "it-support": {
      exact: ["användarsupport", "it-avdelningen", "hjälpte användare med datorer"],
    },
    // ── agriculture & gardening ────────────────────────────────────────────
    gardening: {
      exact: ["i trädgården", "klippte gräsmattan", "trädgårdsarbete", "rensade ogräs", "klippte häcken"],
    },
    "farm-work": {
      exact: ["lantbruk", "bondgård", "i ladugården", "utfodrade djur"],
    },
    // ── care & assistance ──────────────────────────────────────────────────
    childcare: {
      exact: ["passade barn", "förskola", "barnvakt", "dagis"],
    },
    "elderly-care": {
      exact: ["äldreomsorg", "tog hand om äldre", "hemtjänst"],
    },
    // ── construction ───────────────────────────────────────────────────────
    bricklaying: {
      exact: ["murade", "murare", "blandade murbruk"],
    },
    painting: {
      exact: ["målade väggar", "målare", "måleriarbete", "målade huset"],
    },
    tiling: {
      exact: ["satte kakel", "kaklade", "plattsättare", "kakel och klinker"],
    },
    plastering: {
      exact: ["putsade väggar", "putsade fasad", "spacklade"],
    },
    flooring: {
      exact: ["lade golv", "golvläggare", "lade parkett"],
    },
    "welding-blueprint": {
      exact: ["svetsade", "svetsare", "svetsarbete"],
    },
    roofing: {
      exact: ["takläggare", "lade takpannor", "takarbete"],
    },
    "electrical-install": {
      exact: ["eluttag", "elinstallation", "drog ledningar", "elektriker", "elarbete"],
    },
    plumbing: {
      exact: ["rörmokare", "vvs", "drog rör"],
    },
    carpentry: {
      exact: ["snickare", "snickeri", "snickararbete"],
    },
    demolition: {
      exact: ["rivning", "rivningsarbete", "rev väggar"],
    },
    "furniture-fitting": {
      exact: ["monterade möbler", "möbelmontering", "skruvade ihop möbler", "monterade skåp"],
    },
    // ── manufacturing ──────────────────────────────────────────────────────
    "assembly-work": {
      exact: ["monterade delar", "löpande band", "monteringsarbete"],
    },
    "production-line": {
      exact: ["produktionslinje", "på fabriken", "produktionsmedarbetare"],
    },
    packaging: {
      exact: ["packade varor", "emballerade", "packade ordrar", "paketerade"],
    },
    // ── events ─────────────────────────────────────────────────────────────
    "event-setup": {
      exact: ["byggde scen", "riggade scenen", "inför evenemang", "ställde i ordning lokalen"],
    },
    // ── education & languages ──────────────────────────────────────────────
    teaching: {
      exact: ["undervisade", "höll lektioner", "utbildade personal"],
    },
    translation: {
      exact: ["översatte", "översättare", "tolkade"],
    },
  },
};
