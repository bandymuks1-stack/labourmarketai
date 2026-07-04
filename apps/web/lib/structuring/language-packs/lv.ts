import type { LanguagePack } from "./types";

/**
 * LV — Latvian offline recognition pack (owner mandate 2026-07-04).
 *
 * Needles written with Latvian diacritics; the matcher folds both needle and
 * text (ā→a, ē→e, ī→i, š→s, ž→z, ļ→l, ņ→n, ķ→k, ģ→g), so "strādāju" and
 * worker-typed "stradaju" both match.
 *
 * Collision notes (measured/blocked while authoring):
 *  - bare "kase" ⊂ LT "kasė" (dug — earthworks) and LT "kasetė" — cashier
 *    anchors on "pie kases"/"kasiere"/"kasieris", never bare "kase".
 *  - "mācījos" (I learned) contains "māciju" — teaching anchors on
 *    "mācīju bērnus/skolēnus", "pasniedzu", "vadīju apmācības", "skolotāj…".
 *  - "stādīju" folds to "stadiju" == genitive of "stadija" (stage) —
 *    accepted risk is avoided by NOT using it; gardening anchors on "dārzā",
 *    "pļāvu zāli", "ravēju", "dārznieks".
 *  - "java" (mortar) is banned — it is a programming language.
 *  - "aprūpe" alone is any care (incl. children) — elderly-care anchors on
 *    "senioru aprūpe"/"aprūpēju senioru"/"aprūpētāj…".
 *  - "grīda" (floor) folds to "grida" ⊃ EN "grid"? NO — needles are
 *    verb-anchored ("ieklāju grīdu") so neither direction collides.
 *  - LV power tools "elektroinstrumenti" ⊃ base "elektr" needle — covered by
 *    the power-tool context guard (POWER_TOOL_RE has "elektroinstrument").
 */
export const LV_PACK: LanguagePack = {
  language: "lv",
  skills: {
    // ── office & administration ────────────────────────────────────────────
    "data-entry": {
      exact: ["ievadīju datus", "datu ievade", "ievadīju informāciju"],
    },
    "office-software": {
      exact: ["ar excel", "excel tabulas", "izklājlapa"],
    },
    "document-handling": {
      // base "dokument" already matches "dokumentus"; LV-only forms below.
      exact: ["kārtoju dokumentus", "arhivēju", "arhivēšana"],
    },
    bookkeeping: {
      exact: ["rēķinus", "rēķini", "grāmatved", "izrakstīju rēķinus"],
    },
    reception: {
      // base "registratur" already matches "reģistratūra" after folding.
      exact: ["recepcija", "pieņēmu apmeklētājus"],
    },
    administration: {
      exact: ["administrēšana", "biroja darbs", "lietvedība", "administratīv"],
    },
    // ── warehouse & logistics ──────────────────────────────────────────────
    "warehouse-operations": {
      exact: ["noliktava", "noliktavā", "noliktavas darbi"],
    },
    "order-picking": {
      exact: ["komplektēju pasūtījumus", "pasūtījumu komplektēšana", "vācu pasūtījumus"],
    },
    "barcode-scanning": {
      exact: ["skenēju preces", "svītrkod", "skenēju kodus"],
    },
    "pallet-handling": {
      // "paletes" already contains the base "palet" needle; add phrasing.
      exact: ["krāvu paletes", "paliktņus", "paletes krāvu"],
    },
    "stock-taking": {
      exact: ["inventarizāc", "skaitīju preces"],
    },
    driving: {
      exact: ["vadīju automašīnu", "šoferis", "autovadītājs", "braucu ar auto"],
    },
    "delivery-driving": {
      exact: ["piegādāju", "kurjers", "izvadāju pakas"],
    },
    "cargo-transport": {
      exact: ["pārvadāju kravas", "kravu pārvadājumi", "vedu kravu"],
    },
    "forklift-operation": {
      exact: ["iekrāvēj", "ar iekrāvēju", "autoiekrāvēj"],
    },
    // ── hospitality & food ─────────────────────────────────────────────────
    cooking: {
      // base "virtuv" already matches "virtuvē" after folding.
      exact: ["gatavoju ēdienu", "pavārs", "pavāre", "vārīju ēdienu"],
    },
    "kitchen-help": {
      exact: ["virtuves palīg", "palīdzēju virtuvē", "pavāra palīgs"],
    },
    dishwashing: {
      exact: ["mazgāju traukus", "trauku mazgāšana", "trauku mazgātāj"],
    },
    baking: {
      exact: ["cepu maizi", "maiznīca", "ceptuvē", "cepu pīrāgus"],
    },
    "barista-work": {
      exact: ["gatavoju kafiju", "vārīju kafiju", "taisīju kafiju"],
    },
    "waiting-tables": {
      exact: ["viesmīlis", "viesmīle", "apkalpoju galdiņus"],
    },
    // ── retail & customer service ──────────────────────────────────────────
    cashier: {
      exact: ["pie kases", "kasiere", "kasieris", "strādāju kasē"],
    },
    "customer-service": {
      exact: ["apkalpoju klientus", "klientu apkalpošana", "konsultēju klientus"],
    },
    "call-centre": {
      exact: ["zvanu centr", "atbildēju uz zvaniem", "pieņēmu zvanus"],
    },
    merchandising: {
      exact: ["izvietoju preces", "pildīju plauktus", "kārtoju preces plauktos"],
    },
    "sales-assistant": {
      exact: ["pārdevēj", "strādāju veikalā", "pārdevu preces"],
    },
    // ── cleaning & facility ────────────────────────────────────────────────
    "cleaning-services": {
      exact: ["uzkopu", "tīrīju telpas", "uzkopšana", "apkopēj", "tīrīju biroju"],
    },
    laundry: {
      exact: ["veļas mazgāšana", "mazgāju veļu", "gludināju"],
    },
    "window-cleaning": {
      exact: ["mazgāju logus", "logu mazgāšana"],
    },
    housekeeping: {
      exact: ["uzkopu numuriņus", "uzkopu istabas", "istabene", "viesnīcas numurus"],
    },
    // ── repair & maintenance ───────────────────────────────────────────────
    "auto-repair": {
      // base "autoserv" already matches "autoserviss".
      exact: ["remontēju automašīnas", "remontēju auto", "automehāniķ", "laboju automašīnas"],
    },
    "appliance-repair": {
      exact: ["sadzīves tehnik", "remontēju ledusskapjus", "remontēju veļas mašīnas", "laboju sadzīves"],
    },
    "handyman-work": {
      exact: ["sīkie remont", "sīki remontdarbi", "sīkus remontus"],
    },
    // ── beauty & personal services ─────────────────────────────────────────
    hairdressing: {
      exact: ["griezu matus", "frizieris", "frizētava", "friziere"],
    },
    barbering: {
      exact: ["bārddzinis", "skuvu bārdas", "bārdu skūšana"],
    },
    "nail-care": {
      exact: ["manikīr", "pedikīr", "nagu kopšana"],
    },
    // ── HR & recruitment ───────────────────────────────────────────────────
    recruitment: {
      exact: ["personāla atlase", "darbinieku atlase", "vadīju darba intervijas", "meklēju darbiniekus"],
    },
    "personnel-admin": {
      exact: ["personāla lietvedība", "personāla dokument", "personāla uzskaite"],
    },
    // ── IT ─────────────────────────────────────────────────────────────────
    programming: {
      exact: ["programmēju", "rakstīju kodu", "izstrādāju mājaslapu", "laboju kļūdas"],
    },
    "it-support": {
      exact: ["it atbalsts", "tehniskais atbalsts", "sistēmu administrēšana"],
    },
    // ── agriculture & gardening ────────────────────────────────────────────
    gardening: {
      // NB: no bare "ravēju" — it sits inside "iekrāvēju" (with a loader).
      exact: ["dārzā", "pļāvu zāli", "ravēju dārz", "dārznieks", "apgriezu dzīvžogu"],
    },
    "farm-work": {
      exact: ["lauku darbi", "saimniecībā", "ražas novākšana"],
    },
    // ── care & assistance ──────────────────────────────────────────────────
    childcare: {
      // base "aukle" (LT) already matches LV "aukle" after folding.
      exact: ["pieskatīju bērn", "bērnu pieskatīšana", "bērnudārz"],
    },
    "elderly-care": {
      exact: ["senioru aprūpe", "aprūpēju senioru", "aprūpētāj", "veca cilvēka aprūpe"],
    },
    // ── construction ───────────────────────────────────────────────────────
    bricklaying: {
      // base "mur" (LT "mūr") already matches "mūrēju"; LV-only forms below.
      exact: ["mūrēju", "mūrnieks", "mūrēšana"],
    },
    painting: {
      exact: ["krāsoju", "krāsotāj", "krāsoju sienas"],
    },
    tiling: {
      exact: ["flīzēju", "flīzes liku", "flīžu likšana", "flīzētāj"],
    },
    plastering: {
      exact: ["apmetu sienas", "apmetēj", "apmetum"],
    },
    flooring: {
      // "laminats"/"parkets" already covered by the base "laminat"/"parket".
      exact: ["ieklāju grīdu", "grīdas ieklāšana", "liku grīdu"],
    },
    "welding-blueprint": {
      exact: ["metināju", "metinātāj", "metināšana"],
    },
    roofing: {
      exact: ["jumiķis", "klāju jumtu", "jumta segum", "jumtu klāšana"],
    },
    "electrical-install": {
      exact: ["elektroinstalāc", "rozetes", "montēju vadus", "elektriķ"],
    },
    plumbing: {
      // base "santehn" already matches "santehniķis".
      exact: ["ūdensvad", "montēju caurules", "cauruļvad"],
    },
    carpentry: {
      exact: ["galdnieks", "namdaris", "koka darbi", "galdniecība"],
    },
    demolition: {
      exact: ["nojaukšana", "nojaucu", "demontāžas darbi"],
    },
    "furniture-fitting": {
      exact: ["montēju mēbeles", "mēbeļu montāža", "saliku mēbeles", "mēbeļu salikšana"],
    },
    // ── manufacturing ──────────────────────────────────────────────────────
    "assembly-work": {
      exact: ["montāžas darbi", "detaļu montāža", "montēju detaļas"],
    },
    "production-line": {
      exact: ["ražošanas līnija", "rūpnīcā", "ražošanā strādāju", "cehā"],
    },
    packaging: {
      exact: ["iepakoju", "iepakošana", "fasēju"],
    },
    // ── events ─────────────────────────────────────────────────────────────
    "event-setup": {
      exact: ["gatavoju pasākumu", "pasākuma sagatavošana", "uzstādīju skatuvi", "skatuves montāža"],
    },
    // ── education & languages ──────────────────────────────────────────────
    teaching: {
      exact: ["mācīju bērnus", "mācīju skolēnus", "pasniedzu", "vadīju apmācības", "skolotāj"],
    },
    translation: {
      exact: ["tulkoju", "tulks", "tulkojumi", "tulkotāj"],
    },
  },
};
