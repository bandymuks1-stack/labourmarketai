import type { LanguageFixtures } from "../types";

/**
 * PL phrase fixtures — realistic Polish worker sentences covering the owner's
 * 15 mandatory phrase families. Every expectation measured against the
 * recognizer with ONLY local dictionaries (offline), then pinned.
 * The first two phrases are the former RED-language canaries — they now MUST
 * recognise (coverage replaced the canary, per the canary's own lifecycle).
 */
export const PL_FIXTURES: LanguageFixtures = {
  language: "pl",
  phrases: [
    { text: "Pracowałem w magazynie i układałem palety.", expects: ["warehouse-operations", "pallet-handling"] },
    { text: "Sprzątałem biuro i myłem okna.", expects: ["cleaning-services", "window-cleaning"] },
    { text: "Kompletowałem zamówienia i skanowałem towary.", expects: ["order-picking", "barcode-scanning"] },
    { text: "Jeździłem jako kierowca i przewoziłem ładunki.", expects: ["driving", "cargo-transport"] },
    { text: "Pracowałem na kasie i obsługiwałem klientów.", expects: ["cashier", "customer-service"] },
    { text: "Wprowadzałem dane i pracowałem w Excelu.", expects: ["data-entry", "office-software"] },
    { text: "Wystawiałem faktury i segregowałem dokumenty.", expects: ["bookkeeping", "document-handling"] },
    { text: "Pracowałem w kuchni i zmywałem naczynia.", expects: ["cooking", "dishwashing"] },
    { text: "Zajmowałem się praniem i prasowałem koszule.", expects: ["laundry"] },
    { text: "Pracowałem w ogrodzie i kosiłem trawę.", expects: ["gardening"] },
    { text: "Programowałem stronę i naprawiałem błędy.", expects: ["programming"] },
    { text: "Składałem meble i używałem elektronarzędzi.", expects: ["furniture-fitting"], forbids: ["electrical-install"] },
    { text: "Murowałem ściany i mieszałem zaprawę.", expects: ["bricklaying"] },
    { text: "Naprawiałem samochody w warsztacie.", expects: ["auto-repair"] },
    { text: "Strzygłem włosy w salonie fryzjerskim.", expects: ["hairdressing"] },
    { text: "Prowadziłem rozmowy kwalifikacyjne i rekrutowałem pracowników.", expects: ["recruitment"] },
    { text: "Pracowałem w recepcji i odbierałem telefony.", expects: ["reception", "call-centre"] },
    { text: "Rozstawiałem scenę na koncert.", expects: ["event-setup"] },
    { text: "Opiekowałem się dzieckiem po szkole.", expects: ["childcare"] },
    { text: "Piekłem chleb w piekarni.", expects: ["baking"] },
  ],
  falsePositives: [
    // The name "Magda" contains "agd" — appliance needles are anchored.
    { text: "Magda pomogła mi przy pracy.", forbids: ["appliance-repair"] },
    // LEARNING ("nauczyłem się") contains "uczyłem" — teaching is anchored.
    { text: "Nauczyłem się obsługi nowej maszyny.", forbids: ["teaching", "customer-service"] },
    // "ogrodzenie" (fence) contains "ogrod" — gardening is anchored.
    { text: "Stawiałem ogrodzenie wokół domu.", forbids: ["gardening"] },
    // Worker-side interview is NOT recruitment work.
    { text: "Byłem na rozmowie kwalifikacyjnej.", forbids: ["recruitment"] },
    // "demontaż" contains "montaż" — assembly needles are object-anchored.
    { text: "Demontaż starych regałów.", forbids: ["assembly-work"] },
    // Watching a cooking programme is neither cooking nor programming work.
    { text: "Oglądałem program o gotowaniu.", forbids: ["cooking", "programming"] },
    // PL "lubię" (I like) must never brush the LT ceiling stem (review PR3D:
    // the bare "lub" needle was replaced with anchored LT forms).
    { text: "Lubię swoją pracę w biurze.", forbids: ["ceiling-systems"] },
  ],
};
