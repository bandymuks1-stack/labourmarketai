import type { LanguagePack } from "./types";

/**
 * NL — Dutch offline recognition pack (owner mandate 2026-07-04).
 *
 * Needles are inflected forms Dutch-speaking workers actually write in a work
 * journal ("magazijn", "heftruck gereden", "ramen gelapt"). Matching is folded
 * substring containment — needles must stay distinctive AFTER folding across
 * ALL supported languages, not just Dutch.
 *
 * Collision notes (measured/blocked while authoring):
 *  - "gekocht" (NL bought) vs DE "gekocht" (cooked) — NEITHER pack uses it;
 *    NL cooking anchors on "kookte/gekookt/keuken", DE on "kochte/küche".
 *  - "geplant" (NL planted) == DE "geplant" (planned) — banned needle; NL
 *    gardening anchors on "tuin", "gras gemaaid", "gesnoeid", "onkruid".
 *  - "oogst" (harvest) ⊂ "hoogst…" (NL highest) — banned; farm-work anchors
 *    on "boerderij"/"akker".
 *  - bare "winkel" ⊂ DE "Winkelschleifer" (angle grinder) — anchored as
 *    "in de winkel" / "winkelmedewerker".
 *  - electrical-install NEVER uses a bare "elektr…" stem: the power-tool
 *    context guard (skill-recognition.ts) is LT/EN/RU-only, so NL needles are
 *    anchored on genuine installation words (bedrading, stopcontacten).
 *  - flooring avoids bare floor nouns ("vloer") — the floor-cleaning context
 *    guard is LT/EN/RU-only, so NL needles carry the laying verb.
 */
export const NL_PACK: LanguagePack = {
  language: "nl",
  skills: {
    // ── office & administration ────────────────────────────────────────────
    "data-entry": {
      exact: ["gegevens ingevoerd", "voerde gegevens in", "gegevensinvoer", "data ingevoerd", "data invoer"],
      synonyms: ["gegevens verwerkt in het systeem"],
    },
    "office-software": {
      exact: ["met excel", "in excel", "excel gewerkt", "rekenblad"],
    },
    "document-handling": {
      exact: ["documenten gearchiveerd", "gearchiveerd", "archiveerde", "papierwerk"],
    },
    bookkeeping: {
      exact: ["facturen", "factuur", "boekhoud"],
      synonyms: ["facturatie"],
    },
    reception: {
      exact: ["receptie", "bezoekers ontvangen", "gasten ingecheckt"],
    },
    administration: {
      exact: ["administratie", "administratief"],
    },
    // ── warehouse & logistics ──────────────────────────────────────────────
    "warehouse-operations": {
      exact: ["magazijn", "distributiecentrum"],
    },
    "order-picking": {
      exact: ["orderpick", "orders verzameld", "verzamelde orders", "orders gepickt", "bestellingen verzameld", "verzamelde bestellingen"],
    },
    "barcode-scanning": {
      exact: ["producten gescand", "artikelen gescand", "goederen gescand", "scande producten"],
    },
    "pallet-handling": {
      // "pallet" (base) already matches NL "pallets"; these add worker phrasing.
      exact: ["pallets gestapeld", "pallets geladen", "palletwagen"],
    },
    "stock-taking": {
      exact: ["inventarisatie", "voorraad geteld", "voorraadtelling"],
    },
    driving: {
      // "reed" alone ⊂ EN "agreed" — anchored as "ik reed" / "gereden".
      exact: ["ik reed", "gereden", "chauffeur", "rijbewijs"],
    },
    "delivery-driving": {
      exact: ["bezorgde", "bezorger", "pakketten bezorgd", "koerier"],
    },
    "cargo-transport": {
      exact: ["vracht vervoerd", "vrachtwagen", "lading vervoerd", "goederen vervoerd"],
    },
    "forklift-operation": {
      exact: ["heftruck", "vorkheftruck", "reachtruck"],
    },
    // ── hospitality & food ─────────────────────────────────────────────────
    cooking: {
      exact: ["kookte", "gekookt", "keuken", "als kok", "maaltijden bereid", "eten bereid"],
    },
    "kitchen-help": {
      exact: ["keukenhulp", "hielp in de keuken", "keukenassistent"],
    },
    dishwashing: {
      exact: ["afwas", "afgewassen", "borden gewassen", "vaat gewassen"],
    },
    baking: {
      exact: ["bakkerij", "brood gebakken", "bakte brood", "taarten gebakken"],
    },
    "barista-work": {
      // "barista" itself is a base needle ("barist").
      exact: ["koffie gezet", "koffie gemaakt", "koffiebar"],
    },
    "waiting-tables": {
      exact: ["serveerde", "serveerster", "als ober", "tafels bediend", "gasten bediend"],
    },
    // ── retail & customer service ──────────────────────────────────────────
    cashier: {
      exact: ["achter de kassa", "caissiere", "kassawerk", "kassamedewerker"],
    },
    "customer-service": {
      exact: ["klanten geholpen", "hielp klanten", "klantenservice", "klanten te woord gestaan", "klanten geadviseerd"],
    },
    "call-centre": {
      exact: ["callcenter", "telefoontjes beantwoord", "beantwoordde telefoontjes", "telefonisch klantcontact"],
    },
    merchandising: {
      exact: ["vakken gevuld", "vakkenvuller", "schappen gevuld", "schappen aangevuld"],
    },
    "sales-assistant": {
      exact: ["verkoopmedewerker", "winkelmedewerker", "in de winkel gewerkt", "verkoper"],
    },
    // ── cleaning & facility ────────────────────────────────────────────────
    "cleaning-services": {
      exact: ["schoongemaakt", "schoonmaak", "gepoetst", "schoonmaker"],
    },
    laundry: {
      exact: ["wasgoed", "wasserij", "gestreken", "kleding gewassen"],
    },
    "window-cleaning": {
      exact: ["ramen gewassen", "ramen gelapt", "glazenwasser", "ramen gezeemd"],
    },
    housekeeping: {
      exact: ["kamers schoongemaakt", "hotelkamers", "kamermeisje", "bedden verschoond"],
    },
    // ── repair & maintenance ───────────────────────────────────────────────
    "auto-repair": {
      exact: ["auto gerepareerd", "autos gerepareerd", "repareerde auto", "automonteur", "autogarage"],
    },
    "appliance-repair": {
      exact: ["wasmachine gerepareerd", "koelkast gerepareerd", "apparaten gerepareerd", "witgoed"],
    },
    "handyman-work": {
      exact: ["klusjes", "klusjesman", "kleine reparaties", "kluswerk"],
    },
    // ── beauty & personal services ─────────────────────────────────────────
    hairdressing: {
      exact: ["haren geknipt", "knipte haren", "kapsalon", "kapper"],
    },
    barbering: {
      exact: ["barbier", "baard geschoren", "baarden getrimd"],
    },
    "nail-care": {
      // "manicure"/"pedicure" are base needles already.
      exact: ["nagels gelakt", "nagelstyliste", "nagelsalon"],
    },
    // ── HR & recruitment ───────────────────────────────────────────────────
    recruitment: {
      exact: ["sollicitatiegesprekken", "personeel geworven", "kandidaten geselecteerd"],
    },
    "personnel-admin": {
      // base "personnel" ⊄ NL "personeels…" — own needles needed.
      exact: ["personeelsadministratie", "personeelsdossiers", "personeelszaken"],
    },
    // ── IT ─────────────────────────────────────────────────────────────────
    programming: {
      exact: ["programmeerde", "geprogrammeerd", "code geschreven", "website gebouwd", "bugs opgelost"],
    },
    "it-support": {
      exact: ["it-ondersteuning", "systeembeheer", "gebruikers geholpen met computers"],
    },
    // ── agriculture & gardening ────────────────────────────────────────────
    gardening: {
      exact: ["tuin", "gras gemaaid", "gesnoeid", "onkruid", "tuinman"],
    },
    "farm-work": {
      exact: ["boerderij", "op de akker", "landbouwwerk", "stallen uitgemest"],
    },
    // ── care & assistance ──────────────────────────────────────────────────
    childcare: {
      exact: ["kinderopvang", "op kinderen gepast", "paste op kinderen", "oppaste", "creche", "gastouder"],
    },
    "elderly-care": {
      exact: ["ouderenzorg", "bejaarden", "voor ouderen gezorgd", "thuiszorg"],
    },
    // ── construction ───────────────────────────────────────────────────────
    bricklaying: {
      exact: ["gemetseld", "metselde", "metselwerk", "metselaar"],
    },
    painting: {
      exact: ["geschilderd", "schilderde", "geverfd", "muren geverfd"],
    },
    tiling: {
      exact: ["tegels gezet", "tegels gelegd", "betegeld", "tegelzetter"],
    },
    plastering: {
      exact: ["gestuukt", "stucwerk", "gepleisterd", "stukadoor"],
    },
    flooring: {
      // "laminaat"/"parket…" al covered by base "laminat"/"parket" substrings;
      // the verb-anchored forms keep bare "vloer" (often CLEANED) out.
      exact: ["vloeren gelegd", "vloer gelegd", "laminaat gelegd", "parket gelegd"],
    },
    "welding-blueprint": {
      // "als lasser" not bare "lasser" — ⊂ NO "vareplassering" (review PR3D).
      exact: ["gelast", "laswerk", "als lasser"],
    },
    roofing: {
      exact: ["dakdekker", "daken gelegd", "dakwerk", "dakbedekking"],
    },
    "electrical-install": {
      exact: ["bedrading aangelegd", "stopcontacten", "elektra aangelegd", "groepenkast"],
    },
    plumbing: {
      exact: ["loodgieter", "waterleiding", "leidingen aangelegd", "afvoer ontstopt"],
    },
    carpentry: {
      exact: ["timmerman", "timmerwerk", "getimmerd", "houtwerk"],
    },
    demolition: {
      exact: ["gesloopt", "sloopwerk", "sloopte"],
    },
    "furniture-fitting": {
      exact: ["meubels gemonteerd", "meubels in elkaar gezet", "kasten gemonteerd", "meubelmontage"],
    },
    // ── manufacturing ──────────────────────────────────────────────────────
    "assembly-work": {
      exact: ["assemblage", "onderdelen gemonteerd", "montagewerk"],
    },
    "production-line": {
      exact: ["productielijn", "lopende band", "fabriek", "productiemedewerker"],
    },
    packaging: {
      exact: ["verpakt", "ingepakt", "verpakkingswerk"],
    },
    // ── events ─────────────────────────────────────────────────────────────
    "event-setup": {
      exact: ["evenement opgebouwd", "evenement voorbereid", "podium opgebouwd", "klaargezet voor het evenement", "festival opgebouwd"],
    },
    // ── education & languages ──────────────────────────────────────────────
    teaching: {
      exact: ["lesgegeven", "les gegeven", "docent", "onderwezen", "training gegeven"],
    },
    translation: {
      exact: ["vertaald", "vertaalde", "vertaler", "getolkt"],
    },
    // ── transversal professional capabilities (education pilot) ────────────
    presenting: {
      exact: ["presenteerde", "presentatie", "gaf een presentatie"],
    },
    "stakeholder-engagement": {
      exact: ["belanghebbenden", "sprak met vertegenwoordigers", "overleg met vertegenwoordigers"],
    },
    "partnership-development": {
      exact: ["partnerschap", "samenwerkingsmogelijkheden", "samenwerking opgezet"],
    },
    negotiation: {
      exact: ["onderhandelde", "onderhandeling"],
    },
    "project-coordination": {
      exact: ["projectleiding", "projectcoördinatie", "coördineerde het project"],
    },
    "report-writing": {
      exact: ["schreef een rapport", "rapportage opgesteld", "verslag geschreven"],
    },
    teamwork: {
      exact: ["teamwerk", "in teamverband", "groepswerk"],
    },
    research: {
      exact: ["onderzoek gedaan", "deed onderzoek", "literatuuronderzoek"],
    },
  },
};
