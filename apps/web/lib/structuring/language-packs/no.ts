import type { LanguagePack } from "./types";

/**
 * NO — Norwegian (bokmål) offline recognition pack (owner mandate 2026-07-04).
 *
 * Needles written with Norwegian letters; the matcher folds both needle and
 * text (ø→o, æ→ae, å→a), so "kjørte" and worker-typed "kjorte" both match.
 *
 * Collision notes (measured/blocked while authoring):
 *  - "riving" (demolition) ⊂ EN "driving" — banned; demolition anchors on
 *    "rivearbeid"/"rev vegger".
 *  - "pusset opp" (renovated) vs "pusset vegger" (plastered) — plastering is
 *    object-anchored so a renovated flat never reads as plastering.
 *  - "vasket" (washed anything) — cleaning anchors on rooms/premises
 *    ("vasket kontorer"/"vasket lokaler"/"renhold"), dishes/windows/clothes
 *    have their own object-anchored slugs.
 *  - "pakket" fuzzy-brushed "parket" (the measured RED-canary accident) —
 *    now an exact needle for packaging, so the accident is superseded by
 *    real coverage.
 *  - NO power tools "elektrisk verktøy" and consumer "elektronikk" are in
 *    the power-tool context guard; real electrical work matches
 *    "stikkontakt…"/"elektriker".
 */
export const NO_PACK: LanguagePack = {
  language: "no",
  skills: {
    // ── office & administration ────────────────────────────────────────────
    "data-entry": {
      exact: ["tastet inn data", "registrerte data", "la inn data"],
    },
    "office-software": {
      exact: ["i excel", "med excel", "regneark"],
    },
    "document-handling": {
      // base "dokument" already matches "dokumenter"; NO-only forms below.
      exact: ["arkiverte", "sorterte papirer", "journalførte"],
    },
    bookkeeping: {
      exact: ["fakturaer", "regnskap", "fakturerte", "skrev fakturaer"],
    },
    reception: {
      exact: ["resepsjon", "tok imot gjester", "tok imot besøkende"],
    },
    administration: {
      exact: ["administrativt arbeid", "saksbehandling", "kontorarbeid"],
    },
    // ── warehouse & logistics ──────────────────────────────────────────────
    "warehouse-operations": {
      exact: ["på lageret", "lagerarbeid", "lagermedarbeider"],
    },
    "order-picking": {
      exact: ["plukket ordrer", "ordreplukking", "plukket varer"],
    },
    "barcode-scanning": {
      exact: ["skannet varer", "strekkode", "scannet varer"],
    },
    "pallet-handling": {
      exact: ["paller", "stablet paller", "jekketralle"],
    },
    "stock-taking": {
      exact: ["varetelling", "telte varer", "lagertelling"],
    },
    driving: {
      exact: ["kjørte lastebil", "kjørte bil", "sjåfør", "førerkort", "kjørte varebil"],
    },
    "delivery-driving": {
      exact: ["leverte pakker", "budbil", "kjørte ut pakker"],
    },
    "cargo-transport": {
      exact: ["frakt", "kjørte gods", "godstransport"],
    },
    "forklift-operation": {
      exact: ["gaffeltruck", "truckfører", "truckførerbevis"],
    },
    // ── hospitality & food ─────────────────────────────────────────────────
    cooking: {
      exact: ["laget mat", "på kjøkkenet", "som kokk", "tilberedte mat"],
    },
    "kitchen-help": {
      exact: ["kjøkkenhjelp", "hjalp på kjøkkenet", "kjøkkenassistent"],
    },
    dishwashing: {
      exact: ["vasket opp", "oppvask", "tok oppvasken"],
    },
    baking: {
      exact: ["bakte brød", "bakeri", "bakte kaker", "som baker"],
    },
    "barista-work": {
      exact: ["laget kaffe", "brygget kaffe", "kaffebar"],
    },
    "waiting-tables": {
      exact: ["servitør", "serverte gjester", "serverte mat", "betjente bord"],
    },
    // ── retail & customer service ──────────────────────────────────────────
    cashier: {
      exact: ["i kassen", "kassemedarbeider", "satt i kassen"],
    },
    "customer-service": {
      exact: ["kundeservice", "hjalp kunder", "betjente kunder", "veiledet kunder"],
    },
    "call-centre": {
      exact: ["besvarte anrop", "besvarte telefoner", "kundesenter"],
    },
    merchandising: {
      exact: ["fylte hyller", "satte varer i hyllene", "vareplassering"],
    },
    "sales-assistant": {
      exact: ["butikkmedarbeider", "i butikken", "solgte varer i butikk"],
    },
    // ── cleaning & facility ────────────────────────────────────────────────
    "cleaning-services": {
      exact: ["renhold", "vasket kontorer", "vasket lokaler", "renholder"],
    },
    laundry: {
      exact: ["vasket klær", "strøk klær", "vaskeri", "strøk skjorter"],
    },
    "window-cleaning": {
      exact: ["vasket vinduer", "vindusvask", "pusset vinduer"],
    },
    housekeeping: {
      exact: ["stuepike", "rengjorde rom", "hotellrom", "romrengjøring"],
    },
    // ── repair & maintenance ───────────────────────────────────────────────
    "auto-repair": {
      exact: ["reparerte biler", "bilverksted", "bilmekaniker", "skrudde på biler"],
    },
    "appliance-repair": {
      exact: ["reparerte vaskemaskiner", "hvitevarer", "reparerte kjøleskap"],
    },
    "handyman-work": {
      exact: ["småjobber", "vaktmester", "små reparasjoner"],
    },
    // ── beauty & personal services ─────────────────────────────────────────
    hairdressing: {
      exact: ["klippet hår", "frisør", "frisørsalong"],
    },
    barbering: {
      exact: ["barberte skjegg", "barberer", "trimmet skjegg"],
    },
    "nail-care": {
      exact: ["manikyr", "pedikyr", "negletekniker", "lakket negler"],
    },
    // ── HR & recruitment ───────────────────────────────────────────────────
    recruitment: {
      exact: ["rekrutterte", "holdt jobbintervjuer", "rekruttering av ansatte"],
    },
    "personnel-admin": {
      exact: ["personaladministrasjon", "personalsaker", "personalmapper"],
    },
    // ── IT ─────────────────────────────────────────────────────────────────
    programming: {
      exact: ["programmerte", "skrev kode", "utviklet nettside", "fikset bugs"],
    },
    "it-support": {
      exact: ["brukerstøtte", "it-avdelingen", "hjalp brukere med pc"],
    },
    // ── agriculture & gardening ────────────────────────────────────────────
    gardening: {
      exact: ["i hagen", "klipte plenen", "hagearbeid", "lukte ugress", "klipte hekken"],
    },
    "farm-work": {
      exact: ["gårdsarbeid", "landbruk", "i fjøset", "foret dyr"],
    },
    // ── care & assistance ──────────────────────────────────────────────────
    childcare: {
      exact: ["passet barn", "barnehage", "dagmamma", "barnevakt"],
    },
    "elderly-care": {
      exact: ["eldreomsorg", "stelte eldre", "hjemmehjelp for eldre"],
    },
    // ── construction ───────────────────────────────────────────────────────
    bricklaying: {
      exact: ["murte", "murer", "murarbeid", "blandet mørtel"],
    },
    painting: {
      exact: ["malte vegger", "malerarbeid", "malte huset"],
    },
    tiling: {
      exact: ["la fliser", "fliser", "flislegger"],
    },
    plastering: {
      exact: ["pusset vegger", "murpuss", "sparklet"],
    },
    flooring: {
      exact: ["la gulv", "gulvlegger", "la parkett"],
    },
    "welding-blueprint": {
      exact: ["sveiset", "sveiser", "sveisearbeid"],
    },
    roofing: {
      exact: ["taktekker", "la takstein", "takarbeid"],
    },
    "electrical-install": {
      exact: ["stikkontakter", "trakk ledninger", "elektriker"],
    },
    plumbing: {
      exact: ["rørlegger", "vvs", "la rør"],
    },
    carpentry: {
      exact: ["tømrer", "snekker", "snekkerarbeid"],
    },
    demolition: {
      exact: ["rivearbeid", "rev vegger", "rev ned vegg"],
    },
    "furniture-fitting": {
      exact: ["monterte møbler", "møbelmontering", "satte sammen møbler", "monterte skap"],
    },
    // ── manufacturing ──────────────────────────────────────────────────────
    "assembly-work": {
      exact: ["monterte deler", "samlebånd", "montasjearbeid"],
    },
    "production-line": {
      exact: ["produksjonslinje", "på fabrikken", "produksjonsmedarbeider"],
    },
    packaging: {
      exact: ["pakket varer", "emballerte", "pakket ordrer"],
    },
    // ── events ─────────────────────────────────────────────────────────────
    "event-setup": {
      exact: ["rigget scenen", "gjorde klart til arrangement", "satte opp scenen", "satte opp telt"],
    },
    // ── education & languages ──────────────────────────────────────────────
    teaching: {
      exact: ["underviste", "undervisning", "holdt kurs"],
    },
    translation: {
      exact: ["oversatte", "oversettelse", "tolket"],
    },
    // ── transversal professional capabilities (education pilot) ────────────
    presenting: {
      exact: ["presenterte", "presentasjon", "holdt innlegg"],
    },
    "stakeholder-engagement": {
      exact: ["interessentene", "møtte representanter", "møte med representanter"],
    },
    "partnership-development": {
      exact: ["partnerskap", "samarbeidsmuligheter", "inngikk samarbeid"],
    },
    negotiation: {
      exact: ["forhandlet", "forhandlinger"],
    },
    "project-coordination": {
      exact: ["koordinerte prosjekt", "prosjektledelse", "prosjektstyring"],
    },
    "report-writing": {
      exact: ["skrev rapport", "rapportskriving", "utarbeidet rapport"],
    },
    teamwork: {
      exact: ["teamarbeid", "jobbet i team", "gruppearbeid"],
    },
    research: {
      exact: ["forskning", "gjennomførte undersøkelse", "litteraturstudie"],
    },
  },
};
