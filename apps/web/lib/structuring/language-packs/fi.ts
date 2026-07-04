import type { LanguagePack } from "./types";

/**
 * FI — Finnish offline recognition pack (owner mandate 2026-07-04).
 *
 * FI had NO locale presence at all before this pack (not even display
 * names) — PR3B adds the minimum taxonomy locale (messages/fi/) plus this
 * recognition pack. The full FI product UI locale remains an honest gap
 * (documented in the audit); recognition itself is fully offline like every
 * other pack.
 *
 * Collision notes (measured/blocked while authoring):
 *  - "lähetti" is both "courier" and "(he/she) sent" — delivery anchors on
 *    "toimitin/kuljetin paketteja"/"jakeluauto", never bare "lahetti".
 *  - "maali" is both paint and a (football) goal — painting anchors on the
 *    verb/agent forms "maalasin"/"maalari".
 *  - "käänsin" is both "I translated" and "I turned (a key)" — translation
 *    anchors on "käänsin tekstejä"/"kääntäjä"/"tulkkasin"/"käännösty…".
 *  - "ajoin" is both "I drove" and appears in "ajoin partoja" (I shaved
 *    beards) — driving anchors on "ajoin autoa/rekkaa"/"kuljettaja"/
 *    "ajokortti".
 *  - "palvelin" is both "I served" and "a server (computer)" — waiting
 *    tables anchors on "tarjoilin"/"tarjoilija".
 *  - "sähkötyökalu" (power tool) contains "sähkötyö…" — POWER_TOOL_RE
 *    carries "sahkotyokalu"; genuine electrical work matches
 *    "sahkoasennu…"/"pistorasi…" in ELECTRICAL_WORK_RE.
 *  - "muurasin"/"muurari" deliberately does NOT rely on the base LT "mur"
 *    stem (double-u breaks the substring) — FI carries its own needles.
 */
export const FI_PACK: LanguagePack = {
  language: "fi",
  skills: {
    // ── office & administration ────────────────────────────────────────────
    "data-entry": {
      exact: ["syötin tietoja", "tietojen syöttö", "tallensin tietoja järjestelmään"],
    },
    "office-software": {
      exact: ["excelissä", "excelillä", "taulukkolaskenta"],
    },
    "document-handling": {
      // base "dokument" already matches "dokumentteja"; FI-only forms below.
      exact: ["asiakirjoja", "arkistoin", "paperityöt"],
    },
    bookkeeping: {
      exact: ["kirjanpito", "laskutus", "laadin laskuja", "käsittelin laskuja"],
    },
    reception: {
      exact: ["vastaanotossa", "vastaanottovirkailija", "respa"],
    },
    administration: {
      exact: ["hallinnolliset", "toimistotyö", "asioiden hoito toimistossa"],
    },
    // ── warehouse & logistics ──────────────────────────────────────────────
    "warehouse-operations": {
      exact: ["varastossa", "varastotyö", "varastotyöntekijä"],
    },
    "order-picking": {
      exact: ["keräilin tilauksia", "keräily", "tilausten keräily"],
    },
    "barcode-scanning": {
      exact: ["skannasin tuotteita", "viivakoodi"],
    },
    "pallet-handling": {
      exact: ["kuormalav", "pinosin lavoja", "lastasin lavoja"],
    },
    "stock-taking": {
      exact: ["inventaario", "inventoin", "laskin varaston"],
    },
    driving: {
      exact: ["ajoin autoa", "ajoin rekkaa", "kuljettaja", "ajokortti"],
    },
    "delivery-driving": {
      exact: ["toimitin paketteja", "kuljetin paketteja", "jakeluauto", "jaoin paketteja"],
    },
    "cargo-transport": {
      exact: ["kuljetin tavaraa", "rahti", "tavarankuljetus"],
    },
    "forklift-operation": {
      exact: ["trukilla", "trukki", "trukkikortti"],
    },
    // ── hospitality & food ─────────────────────────────────────────────────
    cooking: {
      exact: ["kokkasin", "keittiössä", "kokkina", "valmistin ruokaa", "laitoin ruokaa"],
    },
    "kitchen-help": {
      exact: ["keittiöapulainen", "autoin keittiössä", "keittiöapu"],
    },
    dishwashing: {
      exact: ["tiskasin", "tiskari", "pesin astioita", "astianpesu"],
    },
    baking: {
      exact: ["leivoin", "leipomo", "paistoin leipää"],
    },
    "barista-work": {
      exact: ["keitin kahvia", "tein kahvia", "baristana"],
    },
    "waiting-tables": {
      exact: ["tarjoilin", "tarjoilija"],
    },
    // ── retail & customer service ──────────────────────────────────────────
    cashier: {
      exact: ["kassalla", "kassatyö", "kassamyyjä"],
    },
    "customer-service": {
      exact: ["asiakaspalvelu", "palvelin asiakkaita", "neuvoin asiakkaita"],
    },
    "call-centre": {
      exact: ["puhelinpalvelu", "vastasin puheluihin", "puhelinkeskus"],
    },
    merchandising: {
      exact: ["hyllytin", "hyllytys", "täytin hyllyjä"],
    },
    "sales-assistant": {
      exact: ["myyjänä", "myyjä", "kaupassa töissä"],
    },
    // ── cleaning & facility ────────────────────────────────────────────────
    "cleaning-services": {
      exact: ["siivosin", "siivooja", "siivous"],
    },
    laundry: {
      exact: ["pesin pyykkiä", "silitin", "pyykkäsin", "pesula"],
    },
    "window-cleaning": {
      exact: ["pesin ikkunoita", "ikkunanpesu"],
    },
    housekeeping: {
      exact: ["siivosin huoneita", "kerroshoitaja", "hotellihuoneita"],
    },
    // ── repair & maintenance ───────────────────────────────────────────────
    "auto-repair": {
      exact: ["korjasin autoja", "autokorjaamo", "automekaanikko", "huolsin autoja"],
    },
    "appliance-repair": {
      exact: ["korjasin pesukoneita", "kodinkoneiden korjaus", "korjasin jääkaappeja", "kodinkonehuolto"],
    },
    "handyman-work": {
      exact: ["pikkuremontteja", "pieniä korjauksia", "talonmies"],
    },
    // ── beauty & personal services ─────────────────────────────────────────
    hairdressing: {
      exact: ["leikkasin hiuksia", "kampaaja", "kampaamo"],
    },
    barbering: {
      exact: ["parturi", "ajoin partoja", "siistin parran"],
    },
    "nail-care": {
      exact: ["manikyyri", "pedikyyri", "geelikynnet", "kynsien hoito", "kynsiteknikko"],
    },
    // ── HR & recruitment ───────────────────────────────────────────────────
    recruitment: {
      exact: ["rekrytoin", "rekrytointi", "pidin työhaastatteluja"],
    },
    "personnel-admin": {
      exact: ["henkilöstöhallinto", "henkilöstöasiat", "henkilöstöasiakirjat"],
    },
    // ── IT ─────────────────────────────────────────────────────────────────
    programming: {
      exact: ["ohjelmoin", "koodasin", "kirjoitin koodia", "korjasin bugeja", "kehitin verkkosivun"],
    },
    "it-support": {
      exact: ["it-tuki", "it tuki", "käyttäjätuki"],
    },
    // ── agriculture & gardening ────────────────────────────────────────────
    gardening: {
      exact: ["puutarhassa", "leikkasin nurmikon", "nurmikon leikkuu", "istutin", "kitkin", "puutarhuri"],
    },
    "farm-work": {
      exact: ["maatilalla", "maataloustyöt", "sadonkorjuu"],
    },
    // ── care & assistance ──────────────────────────────────────────────────
    childcare: {
      exact: ["hoidin lapsia", "lastenhoitaja", "päiväkoti", "lastenhoito"],
    },
    "elderly-care": {
      exact: ["hoidin vanhusta", "vanhusten hoito", "vanhustenhoito", "hoidin ikäihmisiä"],
    },
    // ── construction ───────────────────────────────────────────────────────
    bricklaying: {
      exact: ["muurasin", "muurari", "tiiliseinä"],
    },
    painting: {
      exact: ["maalasin", "maalari"],
    },
    tiling: {
      exact: ["laatoitin", "laatoitus", "asensin laatat", "laatoittaja"],
    },
    plastering: {
      exact: ["rappasin", "rappaus", "tasoitin seinät"],
    },
    flooring: {
      // "laminaatti" already contains the base "laminat" needle.
      exact: ["asensin lattian", "lattian asennus", "parketin asennus"],
    },
    "welding-blueprint": {
      exact: ["hitsasin", "hitsaaja", "hitsaus"],
    },
    roofing: {
      exact: ["kattotyöt", "asensin katon", "kattoasennus"],
    },
    "electrical-install": {
      exact: ["sähköasennus", "asensin pistorasiat", "sähkötyöt", "sähköasentaja"],
    },
    plumbing: {
      exact: ["putkimies", "putkityöt", "asensin putket", "lvi-asennus", "lvi asennus"],
    },
    carpentry: {
      exact: ["kirvesmies", "puusepän työt", "puuseppä", "puutyöt"],
    },
    demolition: {
      exact: ["purkutyöt", "purin seiniä"],
    },
    "furniture-fitting": {
      exact: ["kokosin huonekalut", "kokosin kalusteet", "huonekalujen kokoaminen", "asensin kalusteet"],
    },
    // ── manufacturing ──────────────────────────────────────────────────────
    "assembly-work": {
      exact: ["kokoonpano", "kokoonpanotyö", "asensin osia"],
    },
    "production-line": {
      exact: ["tuotantolinja", "tehtaassa", "tuotannossa", "liukuhihna"],
    },
    packaging: {
      exact: ["pakkasin", "pakkaustyö", "pakkasin tuotteita"],
    },
    // ── events ─────────────────────────────────────────────────────────────
    "event-setup": {
      exact: ["rakensin lavan", "tapahtuman valmistelu", "valmistelin tapahtumaa", "tapahtuman rakentaminen"],
    },
    // ── education & languages ──────────────────────────────────────────────
    teaching: {
      exact: ["opetin", "opettajana", "pidin oppitunteja", "koulutin"],
    },
    translation: {
      exact: ["käänsin tekstejä", "kääntäjä", "tulkkasin", "käännösty"],
    },
  },
};
