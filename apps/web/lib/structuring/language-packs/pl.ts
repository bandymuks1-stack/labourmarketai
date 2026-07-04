import type { LanguagePack } from "./types";

/**
 * PL — Polish offline recognition pack (owner mandate 2026-07-04).
 *
 * Needles are written with Polish diacritics; the matcher folds both needle
 * and text (ą→a, ę→e, ł→l, ż→z, ś→s …), so "sprzątałem" and worker-typed
 * "sprzatalem" both match.
 *
 * Collision notes (measured/blocked while authoring):
 *  - "agd" ⊂ the name "Magda" — appliance-repair anchors on "naprawa agd" /
 *    "sprzęt agd", never bare "agd".
 *  - "uczyłem" ⊂ "nauczyłem się" (I learned) — teaching anchors on
 *    "prowadziłem lekcje"/"korepetycje"/"nauczyciel"/"uczyłem uczniów".
 *  - "ogród" ⊂ "ogrodzenie" (fence) — gardening anchors on "w ogrodzie",
 *    "ogrodnik", verbs (kosiłem/sadziłem/pieliłem), never bare "ogrod".
 *  - bare "montaż" ⊂ "demontaż" — assembly-work anchors on montaż+object
 *    ("montaż elementów", "na linii montażowej"), so demolition text never
 *    fires assembly.
 *  - bare "stolar…" would collide with SV "stolar" (chairs) — carpentry uses
 *    "stolarz"/"stolarski"/"cieśla" (the z/ski suffix breaks the collision).
 *  - bare "dach" ⊂ DE "dachte" (thought) — roofing anchors on "dekarz"/
 *    "dachówk…"/"pokrycia dachowe".
 *  - recruiter-side anchoring mirrors the base lexicon: a WORKER attending
 *    an interview ("byłem na rozmowie kwalifikacyjnej") must NOT read as
 *    recruitment work — needles are plural/agent-side forms.
 */
export const PL_PACK: LanguagePack = {
  language: "pl",
  skills: {
    // ── office & administration ────────────────────────────────────────────
    "data-entry": {
      exact: ["wprowadzałem dane", "wprowadzałam dane", "wprowadzanie danych", "wpisywałem dane"],
    },
    "office-software": {
      exact: ["w excelu", "z excelem", "arkusz kalkulacyjny", "arkusze kalkulacyjne"],
    },
    "document-handling": {
      // base "dokument" already matches "dokumenty"; these add PL-only forms.
      exact: ["segregowałem dokumenty", "archiwizacja", "archiwizowałem"],
    },
    bookkeeping: {
      exact: ["faktury", "fakturowanie", "księgowość", "wystawiałem faktury"],
    },
    reception: {
      exact: ["recepcja", "w recepcji", "recepcjonist"],
    },
    administration: {
      exact: ["prace administracyjne", "administracja biurowa", "administracyjn"],
    },
    // ── warehouse & logistics ──────────────────────────────────────────────
    "warehouse-operations": {
      exact: ["magazyn", "w magazynie", "magazynier"],
    },
    "order-picking": {
      exact: ["kompletowałem zamówienia", "kompletacja zamówień", "zbierałem zamówienia"],
    },
    "barcode-scanning": {
      exact: ["skanowałem towary", "skanowałem produkty", "kody kreskowe", "skanowanie towarów"],
    },
    "pallet-handling": {
      // "palety" already contains the base "palet" needle; add phrasing.
      exact: ["układałem palety", "paleciak", "paletowanie"],
    },
    "stock-taking": {
      exact: ["inwentaryzac", "remanent", "liczyłem towar"],
    },
    driving: {
      exact: ["kierowca", "jeździłem", "prowadziłem samochód", "prawo jazdy"],
    },
    "delivery-driving": {
      exact: ["dostarczałem paczki", "rozwoziłem", "dowoziłem", "kurier"],
    },
    "cargo-transport": {
      exact: ["przewoziłem ładunki", "transport towarów", "przewóz towarów", "woziłem towar"],
    },
    "forklift-operation": {
      exact: ["wózek widłowy", "wózkiem widłowym", "widlak", "operator wózka"],
    },
    // ── hospitality & food ─────────────────────────────────────────────────
    cooking: {
      exact: ["gotowałem", "gotowałam", "w kuchni", "kucharz", "przygotowywałem posiłki"],
    },
    "kitchen-help": {
      exact: ["pomoc kuchenna", "pomagałem w kuchni", "pomocnik kuchenny"],
    },
    dishwashing: {
      exact: ["zmywałem naczynia", "zmywak", "mycie naczyń", "zmywałem"],
    },
    baking: {
      exact: ["piekłem", "piekarnia", "wypiekałem", "piekarz"],
    },
    "barista-work": {
      exact: ["parzyłem kawę", "robiłem kawę", "przygotowywałem kawę"],
    },
    "waiting-tables": {
      exact: ["kelner", "obsługiwałem stoliki", "podawałem do stołu"],
    },
    // ── retail & customer service ──────────────────────────────────────────
    cashier: {
      exact: ["kasjer", "na kasie", "przy kasie", "kasa fiskalna"],
    },
    "customer-service": {
      exact: ["obsługa klienta", "obsługiwałem klientów", "doradzałem klientom"],
    },
    "call-centre": {
      exact: ["infolinia", "odbierałem telefony", "callcenter"],
    },
    merchandising: {
      exact: ["wykładałem towar", "układałem towar na półkach", "uzupełniałem półki"],
    },
    "sales-assistant": {
      exact: ["sprzedawca", "w sklepie", "sprzedawałem"],
    },
    // ── cleaning & facility ────────────────────────────────────────────────
    "cleaning-services": {
      exact: ["sprzątałem", "sprzątałam", "sprzątanie", "sprzątaczka", "posprzątałem"],
    },
    laundry: {
      exact: ["pranie", "pralnia", "prasowałem", "prasowałam"],
    },
    "window-cleaning": {
      exact: ["myłem okna", "mycie okien", "umyłem okna"],
    },
    housekeeping: {
      exact: ["sprzątałem pokoje", "pokojówka", "pokoje hotelowe"],
    },
    // ── repair & maintenance ───────────────────────────────────────────────
    "auto-repair": {
      exact: ["naprawiałem samochody", "mechanik samochodowy", "warsztat samochodowy", "naprawa samochodów"],
    },
    "appliance-repair": {
      exact: ["naprawa agd", "sprzęt agd", "naprawiałem pralki", "naprawiałem lodówki"],
    },
    "handyman-work": {
      exact: ["złota rączka", "drobne naprawy", "drobne remonty"],
    },
    // ── beauty & personal services ─────────────────────────────────────────
    hairdressing: {
      exact: ["fryzjer", "strzygłem", "obcinałem włosy", "salon fryzjerski"],
    },
    barbering: {
      exact: ["goliłem brody", "strzygłem brody", "barberski"],
    },
    "nail-care": {
      exact: ["paznokcie", "stylizacja paznokci", "malowałam paznokcie"],
    },
    // ── HR & recruitment ───────────────────────────────────────────────────
    recruitment: {
      exact: ["rekrutac", "rekrutowałem", "prowadziłem rozmowy kwalifikacyjne", "szukałem pracowników"],
    },
    "personnel-admin": {
      exact: ["kadry", "kadrow", "akta osobowe", "dokumentacja pracownicza"],
    },
    // ── IT ─────────────────────────────────────────────────────────────────
    programming: {
      exact: ["programowałem", "pisałem kod", "naprawiałem błędy", "tworzyłem stronę"],
    },
    "it-support": {
      exact: ["wsparcie it", "pomoc techniczna", "administrowałem systemami"],
    },
    // ── agriculture & gardening ────────────────────────────────────────────
    gardening: {
      exact: ["w ogrodzie", "ogrodnik", "kosiłem trawę", "sadziłem", "pieliłem", "przycinałem żywopłot"],
    },
    "farm-work": {
      exact: ["gospodarstwo rolne", "w gospodarstwie", "prace polowe", "żniwa"],
    },
    // ── care & assistance ──────────────────────────────────────────────────
    childcare: {
      exact: ["opieka nad dzieckiem", "opieka nad dziećmi", "opiekowałem się dzieck", "opiekowałam się dzieck", "niania", "przedszkole"],
    },
    "elderly-care": {
      exact: ["opieka nad osobą starszą", "opieka nad starsz", "opiekowałem się seniorem", "opiekowałam się seniorem", "opiekunka osób starszych"],
    },
    // ── construction ───────────────────────────────────────────────────────
    bricklaying: {
      exact: ["murowałem", "murarz", "cegły", "zaprawa murarska"],
    },
    painting: {
      exact: ["malowałem", "malarz", "pomalowałem ściany", "malowanie ścian"],
    },
    tiling: {
      exact: ["płytki", "kładłem płytki", "glazurnik", "kafelki"],
    },
    plastering: {
      exact: ["tynkowałem", "tynkarz", "tynki", "kładłem tynk"],
    },
    flooring: {
      exact: ["kładłem panele", "układałem panele", "panele podłogowe", "parkiet"],
    },
    "welding-blueprint": {
      exact: ["spawałem", "spawacz", "spawanie"],
    },
    roofing: {
      exact: ["dekarz", "dachówk", "kładłem dachówkę", "pokrycia dachowe"],
    },
    "electrical-install": {
      exact: ["instalacje elektryczne", "gniazdka", "układałem przewody", "elektryk"],
    },
    plumbing: {
      exact: ["hydraulik", "wymieniałem rury", "montowałem rury", "instalacje wodn"],
    },
    carpentry: {
      exact: ["stolarz", "stolarski", "cieśla"],
    },
    demolition: {
      exact: ["rozbiórka", "wyburzanie", "wyburzałem"],
    },
    "furniture-fitting": {
      exact: ["składałem meble", "montowałem meble", "montaż mebli", "skręcałem meble"],
    },
    // ── manufacturing ──────────────────────────────────────────────────────
    "assembly-work": {
      exact: ["montaż elementów", "na linii montażowej", "montowałem części", "montaż podzespołów"],
    },
    "production-line": {
      exact: ["linia produkcyjna", "na produkcji", "fabryka", "hala produkcyjna", "taśma produkcyjna"],
    },
    packaging: {
      exact: ["pakowa", "zapakowałem"],
    },
    // ── events ─────────────────────────────────────────────────────────────
    "event-setup": {
      exact: ["rozstawiałem scenę", "montaż sceny", "przygotowanie imprezy", "przygotowanie wydarzenia", "obsługa imprez"],
    },
    // ── education & languages ──────────────────────────────────────────────
    teaching: {
      exact: ["prowadziłem lekcje", "korepetycje", "prowadziłem szkolenia", "nauczyciel", "uczyłem uczniów", "uczyłem dzieci"],
    },
    translation: {
      exact: ["tłumacz", "przetłumaczyłem", "tłumaczenia"],
    },
  },
};
