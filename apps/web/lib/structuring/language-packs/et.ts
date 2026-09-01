import type { LanguagePack } from "./types";

/**
 * ET — Estonian offline recognition pack (owner mandate 2026-07-04).
 *
 * Needles written with Estonian letters; the matcher folds both needle and
 * text (õ→o, ä→a, ö→o, ü→u, š→s, ž→z), so "töötasin" and worker-typed
 * "tootasin" both match.
 *
 * Collision notes (measured/blocked while authoring):
 *  - "tellisin" (I ordered) contains "tellis" (brick) — bricklaying anchors
 *    on "ladusin telliseid"/"müürsepp", never bare "tellis…".
 *  - "plaadid/plaate" can be records/discs — tiling anchors on
 *    "paigaldasin plaate"/"plaatija"/"plaatimis…".
 *  - "köök" (kitchen) and "kook" (cake) BOTH fold to "kook…" — cooking
 *    anchors on "valmistasin toitu"/"kokana"/"töötasin köögis" phrases.
 *  - "vedasin" (I transported) is anchored with an object ("vedasin kaupa")
 *    so "vedasin sõpru autoga" (drove friends) stays out of cargo work.
 *  - "õppisin" (I learned) ≠ "õpetasin" (I taught) — teaching uses the
 *    õpeta- stem, learning never matches.
 *  - ET power tools ("elektrilised tööriistad") contain the base "elektr"
 *    needle — POWER_TOOL_RE carries /elektrilis[a-z]* tooriist/.
 *  - "laos" (in the warehouse) alone is also the country Laos — anchored as
 *    "töötasin laos"/"laotöö…".
 */
export const ET_PACK: LanguagePack = {
  language: "et",
  skills: {
    // ── office & administration ────────────────────────────────────────────
    "data-entry": {
      exact: ["sisestasin andmeid", "andmesisestus", "sisestasin arveid süsteemi"],
    },
    "office-software": {
      exact: ["excelis", "exceliga", "tabelarvutus"],
    },
    "document-handling": {
      // base "dokument" already matches "dokumente"; ET-only forms below.
      exact: ["arhiveerisin", "paberitöö", "korrastasin dokumente"],
    },
    bookkeeping: {
      exact: ["raamatupidam", "koostasin arveid", "arveid väljastasin", "arvete koostamine"],
    },
    reception: {
      // stem: "vastuvõtulaud" (nom.) and "vastuvõtulauas" (iness.) both match
      exact: ["vastuvõtulau", "retseptsioon", "vastuvõtus töötasin"],
    },
    administration: {
      exact: ["asjaajamine", "kontoritöö", "administreerimine"],
    },
    // ── warehouse & logistics ──────────────────────────────────────────────
    "warehouse-operations": {
      exact: ["töötasin laos", "laotöö", "laotöötaja", "laohoone"],
    },
    "order-picking": {
      exact: ["komplekteerisin tellimusi", "tellimuste komplekteerimine", "korjasin tellimusi"],
    },
    "barcode-scanning": {
      exact: ["skaneerisin kaupu", "skannisin kaupu", "triipkood", "vöötkood"],
    },
    "pallet-handling": {
      exact: ["kaubaalus", "ladusin aluseid", "alused virnastasin"],
    },
    "stock-taking": {
      exact: ["inventuur", "lugesin kaupa üle"],
    },
    driving: {
      exact: ["sõitsin autoga", "autojuht", "juhtisin autot", "juhiluba"],
    },
    "delivery-driving": {
      exact: ["kuller", "toimetasin pakke", "vedasin pakke"],
    },
    "cargo-transport": {
      exact: ["vedasin kaupa", "kaubavedu", "vedasin lasti"],
    },
    "forklift-operation": {
      exact: ["tõstukijuht", "kahveltõstuk", "tõstukiga töötasin"],
    },
    // ── hospitality & food ─────────────────────────────────────────────────
    cooking: {
      exact: ["valmistasin toitu", "kokana", "töötasin köögis", "valmistasin sööki"],
    },
    "kitchen-help": {
      exact: ["köögiabiline", "abikokk", "aitasin köögis"],
    },
    dishwashing: {
      exact: ["pesin nõusid", "nõudepesu", "nõudepesija"],
    },
    baking: {
      exact: ["küpsetasin", "pagariäri", "pagarina", "küpsetasin leiba"],
    },
    "barista-work": {
      exact: ["valmistasin kohvi", "tegin kohvi", "baristana"],
    },
    "waiting-tables": {
      exact: ["ettekandja", "teenindasin laudu", "kandsin toitu lauda"],
    },
    // ── retail & customer service ──────────────────────────────────────────
    cashier: {
      exact: ["kassas töötasin", "kassapidaja", "kassiir", "töötasin kassas"],
    },
    "customer-service": {
      exact: ["teenindasin kliente", "klienditeenindus", "nõustasin kliente"],
    },
    "call-centre": {
      exact: ["kõnekeskus", "vastasin kõnedele", "võtsin kõnesid vastu"],
    },
    merchandising: {
      exact: ["ladusin kaupa riiulitele", "täitsin riiuleid", "kauba väljapanek"],
    },
    "sales-assistant": {
      exact: ["müüjana", "müüja", "poes töötasin", "müüsin kaupa"],
    },
    // ── cleaning & facility ────────────────────────────────────────────────
    "cleaning-services": {
      exact: ["koristasin", "koristaja", "koristustööd", "puhastasin ruume"],
    },
    laundry: {
      exact: ["pesin pesu", "triikisin", "pesumaja"],
    },
    "window-cleaning": {
      exact: ["pesin aknaid", "akende pesu"],
    },
    housekeeping: {
      exact: ["koristasin tube", "toateenija", "hotellitube koristasin"],
    },
    // ── repair & maintenance ───────────────────────────────────────────────
    "auto-repair": {
      exact: ["remontisin autosid", "autoremont", "automehaanik", "parandasin autosid"],
    },
    "appliance-repair": {
      exact: ["parandasin pesumasinaid", "kodumasinate remont", "parandasin külmkappe", "kodumasinaid parandasin"],
    },
    "handyman-work": {
      exact: ["pisiremont", "väikesed remonditööd", "majahoidja tööd"],
    },
    // ── beauty & personal services ─────────────────────────────────────────
    hairdressing: {
      exact: ["lõikasin juukseid", "juuksur", "juuksurisalong"],
    },
    barbering: {
      exact: ["habemeajaja", "ajasin habet", "habemete piiramine"],
    },
    "nail-care": {
      exact: ["maniküür", "pediküür", "küünetehnik", "geelküüned"],
    },
    // ── HR & recruitment ───────────────────────────────────────────────────
    recruitment: {
      exact: ["värbasin", "värbamine", "personaliotsing", "viisin läbi tööintervjuusid"],
    },
    "personnel-admin": {
      exact: ["personalitöö", "personalidokumendid", "personaliarvestus"],
    },
    // ── IT ─────────────────────────────────────────────────────────────────
    programming: {
      exact: ["programmeerisin", "kirjutasin koodi", "arendasin veebilehte", "parandasin vigu koodis"],
    },
    "it-support": {
      exact: ["it-tugi", "it tugi", "kasutajatugi", "süsteemiadministraator"],
    },
    // ── agriculture & gardening ────────────────────────────────────────────
    gardening: {
      exact: ["aias töötasin", "niitsin muru", "istutasin", "rohisin", "aednik", "pügasin hekki"],
    },
    "farm-work": {
      exact: ["talus töötasin", "põllutööd", "talutööd", "saagikoristus"],
    },
    // ── care & assistance ──────────────────────────────────────────────────
    childcare: {
      exact: ["hoidsin lapsi", "lapsehoidja", "lasteaed", "tegelesin lastega"],
    },
    "elderly-care": {
      exact: ["hooldasin eakat", "eakate hooldus", "hooldasin vanainimest", "hooldaja"],
    },
    // ── construction ───────────────────────────────────────────────────────
    bricklaying: {
      exact: ["ladusin telliseid", "müürsepp", "telliseid ladusin", "müüritööd"],
    },
    painting: {
      exact: ["värvisin", "maaler", "värvisin seinu"],
    },
    tiling: {
      exact: ["paigaldasin plaate", "plaatija", "plaatimistööd"],
    },
    plastering: {
      exact: ["krohvisin", "krohvija", "krohvimistööd"],
    },
    flooring: {
      // "laminaat" already contains the base "laminat" needle.
      exact: ["paigaldasin põranda", "põrandakate", "parketti paigaldasin", "põranda paigaldus"],
    },
    "welding-blueprint": {
      exact: ["keevitasin", "keevitaja", "keevitustööd"],
    },
    roofing: {
      exact: ["katusetööd", "paigaldasin katus", "katusemeister"],
    },
    "electrical-install": {
      exact: ["pistikupesa", "elektritööd", "paigaldasin juhtmed", "elektrik"],
    },
    plumbing: {
      exact: ["torumees", "torutööd", "paigaldasin torusid", "veetorud"],
    },
    carpentry: {
      exact: ["puusepp", "puutööd", "tisler"],
    },
    demolition: {
      exact: ["lammutasin", "lammutustööd"],
    },
    "furniture-fitting": {
      exact: ["panin mööbli kokku", "mööbli kokkupanek", "paigaldasin mööblit", "monteerisin mööblit"],
    },
    // ── manufacturing ──────────────────────────────────────────────────────
    "assembly-work": {
      exact: ["monteerisin detaile", "koostetöö", "koosteliinil"],
    },
    "production-line": {
      exact: ["tootmisliin", "tehases töötasin", "tootmises töötasin"],
    },
    packaging: {
      exact: ["pakkisin", "pakendasin", "pakkimine"],
    },
    // ── events ─────────────────────────────────────────────────────────────
    "event-setup": {
      exact: ["valmistasin üritust ette", "ürituse ettevalmistus", "panin lava üles", "ürituse jaoks valmistasin"],
    },
    // ── education & languages ──────────────────────────────────────────────
    teaching: {
      exact: ["õpetasin", "andsin tunde", "koolitasin", "õpetajana"],
    },
    translation: {
      exact: ["tõlkisin", "tõlkija", "tõlkimine"],
    },
    // ── transversal professional capabilities (education pilot) ────────────
    presenting: {
      exact: ["esitlesin", "esitlus", "tegin ettekande"],
    },
    "stakeholder-engagement": {
      exact: ["huvirühmad", "kohtusin esindajatega", "kohtumine esindajatega"],
    },
    "partnership-development": {
      exact: ["partnerlus", "koostöövõimalus", "sõlmisin koostöö"],
    },
    negotiation: {
      exact: ["läbirääkimised", "pidasin läbirääkimisi"],
    },
    "project-coordination": {
      exact: ["koordineerisin projekti", "projektijuhtimine", "projekti koordineerimine"],
    },
    "report-writing": {
      exact: ["kirjutasin aruande", "aruannete koostamine", "koostasin aruande"],
    },
    teamwork: {
      exact: ["meeskonnatöö", "töötasin meeskonnas", "rühmatöö"],
    },
    research: {
      exact: ["viisin läbi uuringu", "teadustöö", "kirjanduse ülevaade"],
    },
  },
};
