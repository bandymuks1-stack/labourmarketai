import type { LanguagePack } from "./types";

/**
 * DE — German offline recognition pack (owner mandate 2026-07-04).
 *
 * Needles are written pre-fold; the matcher folds them (ä→a, ö→o, ü→u, ß→ss),
 * so "geschweißt" and worker-typed "geschweisst" both match.
 *
 * Collision notes (measured/blocked while authoring):
 *  - "Gefahren" (dangers) contains "gefahren" (driven) — driving anchors on
 *    "lkw gefahren"/"auto gefahren"/"als fahrer", never bare "gefahren".
 *  - "lernte" (learned) contains "ernte" (harvest) — farm-work uses
 *    "geerntet"/"erntearbeit"/"bauernhof", never bare "ernte".
 *  - "Kindergarten" contains "garten" — gardening anchors on "im garten",
 *    "rasen gemäht", "gepflanzt"; NONE are substrings of Kindergarten forms.
 *  - "Dachziegel" contains "ziegel" — bricklaying anchors on "gemauert"/
 *    "maurer"/"mauerwerk", never bare "ziegel"; roofing anchors on
 *    "dachdecker"/"dach gedeckt", never bare "dach" (⊂ "dachte" = thought).
 *  - "gekocht" (DE cooked) == NL "gekocht" (bought) — banned in BOTH packs;
 *    DE cooking anchors on "kochte", "in der küche", "als koch".
 *  - "Maschine bedient" (operated a machine) — waiting-tables anchors on
 *    "gäste bedient"/"tische bedient"/"kellner", never bare "bedient".
 *  - electrical-install avoids bare "elektro" — "Elektrowerkzeug" (power
 *    tools) would false-fire; anchored on steckdosen/verkabelt/verdrahtet/
 *    elektroinstallation.
 *  - "fließen" folds to "fliessen" (double s) and therefore does NOT match
 *    the tiling needle "fliesen" — verified by the FP fixture.
 */
export const DE_PACK: LanguagePack = {
  language: "de",
  skills: {
    // ── office & administration ────────────────────────────────────────────
    "data-entry": {
      exact: ["daten eingegeben", "dateneingabe", "daten erfasst", "datenerfassung"],
    },
    "office-software": {
      exact: ["mit excel", "in excel", "excel tabellen", "tabellenkalkulation"],
    },
    "document-handling": {
      // base "dokument" already matches "Dokumente"; these add DE-only forms.
      exact: ["unterlagen sortiert", "akten sortiert", "abgeheftet", "archiviert"],
    },
    bookkeeping: {
      exact: ["rechnungen", "buchhaltung", "rechnung geschrieben"],
    },
    reception: {
      exact: ["rezeption", "am empfang", "besucher empfangen"],
    },
    administration: {
      exact: ["verwaltung", "buroarbeit", "büroarbeit", "sachbearbeit"],
    },
    // ── warehouse & logistics ──────────────────────────────────────────────
    "warehouse-operations": {
      // bare "lager" ⊂ too many words (Verlagerung…) — anchored forms only.
      exact: ["im lager", "lagerarbeit", "lagerhalle", "lagerist"],
    },
    "order-picking": {
      exact: ["kommissionier", "auftrage gepickt", "aufträge gepickt", "bestellungen zusammengestellt"],
    },
    "barcode-scanning": {
      exact: ["waren gescannt", "artikel gescannt", "waren eingescannt"],
    },
    "pallet-handling": {
      // "Paletten" already contains the base "palet" needle; add phrasing.
      exact: ["paletten gestapelt", "paletten geladen", "palettieren"],
    },
    "stock-taking": {
      exact: ["inventur", "bestand gezahlt", "bestand gezählt", "bestandsaufnahme"],
    },
    driving: {
      exact: ["lkw gefahren", "auto gefahren", "als fahrer", "fuhrerschein", "führerschein"],
    },
    "delivery-driving": {
      exact: ["pakete ausgeliefert", "zugestellt", "auslieferungsfahrer", "kurier"],
    },
    "cargo-transport": {
      exact: ["fracht", "spedition", "gutertransport", "gütertransport"],
    },
    "forklift-operation": {
      exact: ["gabelstapler", "stapler gefahren", "staplerfahrer", "staplerschein"],
    },
    // ── hospitality & food ─────────────────────────────────────────────────
    cooking: {
      exact: ["kochte", "in der kuche", "in der küche", "als koch", "essen zubereitet", "mahlzeiten zubereitet"],
    },
    "kitchen-help": {
      exact: ["kuchenhilfe", "küchenhilfe", "kuchenhelfer", "küchenhelfer"],
    },
    dishwashing: {
      exact: ["geschirr gespult", "geschirr gespült", "abgespult", "abgespült", "spulkuche", "spülküche"],
    },
    baking: {
      exact: ["backte", "gebacken", "backerei", "bäckerei"],
    },
    "barista-work": {
      exact: ["kaffee zubereitet", "kaffee gemacht", "kaffeespezialitaten", "kaffeespezialitäten"],
    },
    "waiting-tables": {
      exact: ["kellner", "gaste bedient", "gäste bedient", "tische bedient", "serviert"],
    },
    // ── retail & customer service ──────────────────────────────────────────
    cashier: {
      exact: ["an der kasse", "kassierer", "kassiert"],
    },
    "customer-service": {
      exact: ["kundenservice", "kunden betreut", "kunden beraten", "kundendienst"],
    },
    "call-centre": {
      exact: ["callcenter", "anrufe entgegengenommen", "anrufe beantwortet", "telefonzentrale"],
    },
    merchandising: {
      exact: ["regale eingeraumt", "regale eingeräumt", "regale aufgefullt", "regale aufgefüllt", "ware verraumt", "ware verräumt"],
    },
    "sales-assistant": {
      exact: ["verkaufer", "verkäufer", "einzelhandel", "im laden gearbeitet"],
    },
    // ── cleaning & facility ────────────────────────────────────────────────
    "cleaning-services": {
      exact: ["geputzt", "gereinigt", "reinigungskraft", "buro gereinigt", "büro gereinigt", "putzkraft"],
    },
    laundry: {
      exact: ["wasche gewaschen", "wäsche gewaschen", "gebugelt", "gebügelt", "wascherei", "wäscherei"],
    },
    "window-cleaning": {
      exact: ["fenster geputzt", "fenster gereinigt", "fensterputzer"],
    },
    housekeeping: {
      exact: ["zimmer gereinigt", "zimmermadchen", "zimmermädchen", "hotelzimmer gereinigt"],
    },
    // ── repair & maintenance ───────────────────────────────────────────────
    "auto-repair": {
      exact: ["autos repariert", "auto repariert", "kfz werkstatt", "kfz-werkstatt", "automechaniker", "autowerkstatt"],
    },
    "appliance-repair": {
      exact: ["waschmaschine repariert", "kuhlschrank repariert", "kühlschrank repariert", "haushaltsgerate repariert", "haushaltsgeräte repariert"],
    },
    "handyman-work": {
      exact: ["kleinreparaturen", "kleine reparaturen", "hausmeister"],
    },
    // ── beauty & personal services ─────────────────────────────────────────
    hairdressing: {
      exact: ["haare geschnitten", "friseur", "frisor", "frisör"],
    },
    barbering: {
      exact: ["barbier", "bart rasiert", "barte getrimmt", "bärte getrimmt"],
    },
    "nail-care": {
      exact: ["nagelstudio", "manikure", "maniküre", "pedikure", "pediküre", "nagel lackiert", "nägel lackiert"],
    },
    // ── HR & recruitment ───────────────────────────────────────────────────
    recruitment: {
      exact: ["personal rekrutiert", "vorstellungsgesprache gefuhrt", "vorstellungsgespräche geführt", "bewerber ausgewahlt", "bewerber ausgewählt", "personalauswahl"],
    },
    "personnel-admin": {
      exact: ["personalverwaltung", "personalakten", "personalabteilung"],
    },
    // ── IT ─────────────────────────────────────────────────────────────────
    programming: {
      exact: ["programmiert", "code geschrieben", "webseite entwickelt", "fehler behoben", "softwareentwickl"],
    },
    "it-support": {
      exact: ["technischer support", "systemadministr", "it-support"],
    },
    // ── agriculture & gardening ────────────────────────────────────────────
    gardening: {
      exact: ["im garten", "rasen gemaht", "rasen gemäht", "gepflanzt", "unkraut", "hecken geschnitten", "gartner", "gärtner"],
    },
    "farm-work": {
      exact: ["bauernhof", "landwirtschaft", "auf dem feld gearbeitet", "geerntet", "erntearbeit"],
    },
    // ── care & assistance ──────────────────────────────────────────────────
    childcare: {
      exact: ["kindergarten", "kinderbetreuung", "auf kinder aufgepasst", "kita", "babysit"],
    },
    "elderly-care": {
      exact: ["altenpflege", "senioren betreut", "seniorenbetreuung", "altere menschen betreut", "ältere menschen betreut"],
    },
    // ── construction ───────────────────────────────────────────────────────
    bricklaying: {
      exact: ["gemauert", "maurer", "mauerwerk", "mortel angemischt", "mörtel angemischt"],
    },
    painting: {
      // "lackierte"/anchored — bare "lackiert" ⊂ "Nägel lackiert" (nail
      // care) and fired the painting trade on manicure text (review PR3D).
      exact: ["gestrichen", "wande gestrichen", "wände gestrichen", "malerarbeiten", "lackierte", "lackierarbeit", "türen lackiert", "turen lackiert"],
    },
    tiling: {
      exact: ["fliesen", "gefliest", "fliesenleger", "verfliest"],
    },
    plastering: {
      exact: ["verputzt", "putz aufgetragen", "gipser"],
    },
    flooring: {
      exact: ["boden verlegt", "böden verlegt", "fussboden verlegt", "fußboden verlegt", "laminat verlegt"],
    },
    "welding-blueprint": {
      exact: ["geschweisst", "geschweißt", "schweisser", "schweißer", "schweissarbeit", "schweißarbeit"],
    },
    roofing: {
      exact: ["dachdecker", "dach gedeckt", "dacher gedeckt", "dächer gedeckt", "dacharbeiten"],
    },
    "electrical-install": {
      exact: ["steckdosen", "verkabelt", "elektroinstallation", "verdrahtet"],
    },
    plumbing: {
      exact: ["klempner", "installateur", "rohre verlegt", "wasserleitung", "sanitarinstallation", "sanitärinstallation"],
    },
    carpentry: {
      exact: ["tischler", "schreiner", "zimmermann", "holzarbeiten"],
    },
    demolition: {
      exact: ["abgerissen", "abriss", "abbrucharbeiten", "abbruch"],
    },
    "furniture-fitting": {
      exact: ["mobel montiert", "möbel montiert", "mobel aufgebaut", "möbel aufgebaut", "schranke montiert", "schränke montiert", "mobel zusammengebaut", "möbel zusammengebaut"],
    },
    // ── manufacturing ──────────────────────────────────────────────────────
    "assembly-work": {
      exact: ["teile montiert", "montagearbeit", "am band montiert", "vormontage"],
    },
    "production-line": {
      exact: ["fliessband", "fließband", "produktionslinie", "produktionshelfer"],
    },
    packaging: {
      exact: ["verpackt", "eingepackt", "verpackung", "abgefullt", "abgefüllt"],
    },
    // ── events ─────────────────────────────────────────────────────────────
    "event-setup": {
      exact: ["veranstaltung aufgebaut", "buhne aufgebaut", "bühne aufgebaut", "messestand aufgebaut", "veranstaltung vorbereitet", "eventaufbau"],
    },
    // ── education & languages ──────────────────────────────────────────────
    teaching: {
      exact: ["unterricht", "nachhilfe", "schulung gegeben", "seminar geleitet"],
    },
    translation: {
      exact: ["ubersetzt", "übersetzt", "ubersetzung", "übersetzung", "dolmetsch"],
    },
  },
};
