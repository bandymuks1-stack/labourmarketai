import type { LanguagePack } from "./types";

/**
 * DA — Danish offline recognition pack (owner mandate 2026-07-04).
 *
 * Needles written with Danish letters; the matcher folds both needle and
 * text (ø→o, æ→ae, å→a), so "kørte" and worker-typed "korte" both match —
 * which is exactly why driving needles are multi-word ("kørte lastbil"):
 * folded "korte" alone is the Dutch word for "short".
 *
 * Collision notes (measured/blocked while authoring):
 *  - "kørte"→"korte" == NL "korte" (short) — driving is object-anchored.
 *  - "høstede" (harvested) folds to "hostede" == EN "hosted" — banned;
 *    farm-work anchors on "landbrug"/"markarbejde"/"i stalden".
 *  - bare "tag" (roof) is the EN word "tag" — roofing anchors on
 *    "tagdækker"/"tagpap"/"tagarbejde".
 *  - "pudsede vinduer" is WINDOW CLEANING; plastering anchors on
 *    "pudsede vægge"/"pudsede facade" so the two never cross.
 *  - bare "riving/rev" — EN "driving" contains "riving"; demolition anchors
 *    on "nedrivning".
 *  - DA power tools "elværktøj" and consumer "elektronik" are in the
 *    power-tool context guard; real electrical work matches "stikkontakt"/
 *    "elinstallation"/"elektriker".
 *  - "blev rekrutteret" (worker WAS recruited) ≠ "rekrutterede" (agent side)
 *    — suffix keeps them apart.
 */
export const DA_PACK: LanguagePack = {
  language: "da",
  skills: {
    // ── office & administration ────────────────────────────────────────────
    "data-entry": {
      exact: ["indtastede data", "dataindtastning", "tastede data ind"],
    },
    "office-software": {
      exact: ["i excel", "med excel", "regneark"],
    },
    "document-handling": {
      // base "dokument" already matches "dokumenter"; DA-only forms below.
      exact: ["arkiverede", "sorterede papirer", "journaliserede"],
    },
    bookkeeping: {
      exact: ["fakturaer", "bogføring", "fakturerede", "skrev fakturaer"],
    },
    reception: {
      // base "reception" covers the DA word itself.
      exact: ["receptionen", "tog imod gæster", "tog imod besøgende"],
    },
    administration: {
      exact: ["administrativt arbejde", "sagsbehandling", "kontorarbejde"],
    },
    // ── warehouse & logistics ──────────────────────────────────────────────
    "warehouse-operations": {
      exact: ["på lageret", "lagerarbejde", "lagermedarbejder", "i lagerhallen"],
    },
    "order-picking": {
      exact: ["plukkede ordrer", "ordreplukning", "plukkede varer"],
    },
    "barcode-scanning": {
      exact: ["scannede varer", "stregkode", "skannede varer"],
    },
    "pallet-handling": {
      exact: ["paller", "stablede paller", "palleløfter"],
    },
    "stock-taking": {
      exact: ["varetælling", "lageroptælling", "talte varer"],
    },
    driving: {
      exact: ["kørte lastbil", "kørte bil", "chauffør", "kørekort", "kørte varebil"],
    },
    "delivery-driving": {
      exact: ["leverede pakker", "pakkebud", "bragte pakker ud"],
    },
    "cargo-transport": {
      exact: ["fragt", "kørte gods", "godstransport"],
    },
    "forklift-operation": {
      exact: ["gaffeltruck", "truckfører", "truckcertifikat"],
    },
    // ── hospitality & food ─────────────────────────────────────────────────
    cooking: {
      exact: ["lavede mad", "i køkkenet", "som kok", "tilberedte mad"],
    },
    "kitchen-help": {
      exact: ["køkkenmedhjælper", "hjalp i køkkenet", "køkkenhjælp"],
    },
    dishwashing: {
      exact: ["vaskede op", "opvask", "opvasker"],
    },
    baking: {
      exact: ["bagte brød", "bageri", "bagte kager", "som bager"],
    },
    "barista-work": {
      exact: ["lavede kaffe", "bryggede kaffe", "kaffebar"],
    },
    "waiting-tables": {
      exact: ["tjener", "serverede gæster", "serverede mad", "betjente borde"],
    },
    // ── retail & customer service ──────────────────────────────────────────
    cashier: {
      exact: ["ved kassen", "kassemedarbejder", "sad ved kassen"],
    },
    "customer-service": {
      exact: ["kundeservice", "hjalp kunder", "betjente kunder", "rådgav kunder"],
    },
    "call-centre": {
      exact: ["besvarede opkald", "telefonisk kundeservice", "tog imod opkald"],
    },
    merchandising: {
      exact: ["fyldte hylder", "satte varer på hylder", "fyldte varer op"],
    },
    "sales-assistant": {
      exact: ["butiksassistent", "i butikken", "solgte varer i butik"],
    },
    // ── cleaning & facility ────────────────────────────────────────────────
    "cleaning-services": {
      exact: ["gjorde rent", "rengøring", "rengjorde kontor", "rengøringsassistent"],
    },
    laundry: {
      exact: ["vaskede tøj", "strøg tøj", "vaskeri", "strøg skjorter"],
    },
    "window-cleaning": {
      exact: ["pudsede vinduer", "vinduespudser", "vaskede vinduer"],
    },
    housekeeping: {
      exact: ["rengjorde værelser", "stuepige", "hotelværelser"],
    },
    // ── repair & maintenance ───────────────────────────────────────────────
    "auto-repair": {
      exact: ["reparerede biler", "autoværksted", "bilmekaniker", "lavede biler"],
    },
    "appliance-repair": {
      exact: ["reparerede vaskemaskiner", "hvidevarer", "reparerede køleskabe"],
    },
    "handyman-work": {
      exact: ["småreparationer", "altmuligmand", "små reparationer", "vicevært"],
    },
    // ── beauty & personal services ─────────────────────────────────────────
    hairdressing: {
      exact: ["klippede hår", "frisør", "frisørsalon"],
    },
    barbering: {
      exact: ["barberede", "barbersalon", "trimmede skæg"],
    },
    "nail-care": {
      // base "manicure"/"pedicure" cover the DA spellings.
      exact: ["negletekniker", "lakerede negle", "neglesalon"],
    },
    // ── HR & recruitment ───────────────────────────────────────────────────
    recruitment: {
      exact: ["rekrutterede", "afholdt jobsamtaler", "rekruttering af medarbejdere"],
    },
    "personnel-admin": {
      exact: ["personaleadministration", "personalesager", "personalemapper"],
    },
    // ── IT ─────────────────────────────────────────────────────────────────
    programming: {
      exact: ["programmerede", "skrev kode", "udviklede hjemmeside", "rettede fejl i koden"],
    },
    "it-support": {
      // "it-support"/"it support" already covered by base + DE pack terms.
      exact: ["brugersupport", "it-afdelingen", "hjalp brugere med computere"],
    },
    // ── agriculture & gardening ────────────────────────────────────────────
    gardening: {
      exact: ["i haven", "slog græs", "havearbejde", "lugede", "klippede hæk"],
    },
    "farm-work": {
      exact: ["landbrug", "markarbejde", "i stalden", "fodrede dyr"],
    },
    // ── care & assistance ──────────────────────────────────────────────────
    childcare: {
      exact: ["passede børn", "børnehave", "dagpleje", "babysat"],
    },
    "elderly-care": {
      exact: ["ældrepleje", "plejede ældre", "plejehjem", "hjemmepleje"],
    },
    // ── construction ───────────────────────────────────────────────────────
    bricklaying: {
      exact: ["murede", "murer", "murerarbejde", "blandede mørtel"],
    },
    painting: {
      exact: ["malede", "malerarbejde", "malede vægge"],
    },
    tiling: {
      exact: ["lagde fliser", "fliser", "opsatte fliser"],
    },
    plastering: {
      exact: ["pudsede vægge", "pudsede facade", "spartlede"],
    },
    flooring: {
      exact: ["lagde gulv", "gulvlægger", "lagde parket"],
    },
    "welding-blueprint": {
      exact: ["svejsede", "svejser", "svejsearbejde"],
    },
    roofing: {
      exact: ["tagdækker", "lagde tagpap", "tagarbejde"],
    },
    "electrical-install": {
      exact: ["stikkontakter", "trak ledninger", "elinstallation", "elektriker"],
    },
    plumbing: {
      exact: ["vvs", "blikkenslager", "rørlægger"],
    },
    carpentry: {
      exact: ["tømrer", "snedker", "tømrerarbejde"],
    },
    demolition: {
      exact: ["nedrivning", "rev vægge ned", "nedrivningsarbejde"],
    },
    "furniture-fitting": {
      exact: ["samlede møbler", "møbelmontering", "monterede møbler", "samlede skabe"],
    },
    // ── manufacturing ──────────────────────────────────────────────────────
    "assembly-work": {
      exact: ["monterede dele", "samlebånd", "montagearbejde"],
    },
    "production-line": {
      exact: ["produktionslinje", "på fabrikken", "produktionsmedarbejder"],
    },
    packaging: {
      exact: ["pakkede varer", "emballerede", "pakkeriarbejde", "pakkede ordrer"],
    },
    // ── events ─────────────────────────────────────────────────────────────
    "event-setup": {
      exact: ["byggede scenen", "gjorde klar til arrangement", "stillede op til koncert", "satte telte op"],
    },
    // ── education & languages ──────────────────────────────────────────────
    teaching: {
      exact: ["underviste", "undervisning", "holdt kurser"],
    },
    translation: {
      exact: ["oversatte", "oversættelse", "tolkede"],
    },
  },
};
