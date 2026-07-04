import type { LanguageFixtures } from "../types";

/**
 * NL phrase fixtures — realistic Dutch worker sentences covering the owner's
 * 15 mandatory phrase families. Every expectation measured against the
 * recognizer with ONLY local dictionaries (offline), then pinned.
 */
export const NL_FIXTURES: LanguageFixtures = {
  language: "nl",
  phrases: [
    { text: "Ik werkte in het magazijn en stapelde pallets.", expects: ["warehouse-operations", "pallet-handling"] },
    { text: "Ik verzamelde orders en scande producten.", expects: ["order-picking", "barcode-scanning"] },
    { text: "Ik reed met een vrachtwagen naar Duitsland.", expects: ["driving", "cargo-transport"] },
    { text: "Ik stond achter de kassa en hielp klanten.", expects: ["cashier", "customer-service"] },
    { text: "Ik voerde gegevens in en werkte met Excel.", expects: ["data-entry", "office-software"] },
    { text: "Ik verwerkte facturen en archiveerde documenten.", expects: ["bookkeeping", "document-handling"] },
    { text: "Ik werkte in de keuken en deed de afwas.", expects: ["cooking", "dishwashing"] },
    { text: "Ik heb kantoren schoongemaakt en ramen gelapt.", expects: ["cleaning-services", "window-cleaning"] },
    { text: "Ik deed het wasgoed en heb kleding gestreken.", expects: ["laundry"] },
    { text: "Ik werkte in de tuin en heb het gras gemaaid.", expects: ["gardening"] },
    { text: "Ik programmeerde een website en loste bugs op.", expects: ["programming"] },
    { text: "Ik heb meubels gemonteerd met elektrisch gereedschap.", expects: ["furniture-fitting"], forbids: ["electrical-install"] },
    { text: "Ik heb muren gemetseld en specie gemengd.", expects: ["bricklaying"] },
    { text: "Ik repareerde auto's in de garage.", expects: ["auto-repair"] },
    { text: "Ik knipte haren in de kapsalon.", expects: ["hairdressing"] },
    { text: "Ik voerde sollicitatiegesprekken en wierf personeel.", expects: ["recruitment"] },
    { text: "Ik werkte bij de receptie en beantwoordde telefoontjes.", expects: ["reception", "call-centre"] },
    { text: "Ik heb het podium opgebouwd voor een festival.", expects: ["event-setup"] },
    { text: "Ik paste op kinderen na school.", expects: ["childcare"] },
    { text: "Ik bakte brood in de bakkerij.", expects: ["baking"] },
  ],
  falsePositives: [
    // NL "gekocht" (bought) must never brush DE cooking ("gekocht" is banned).
    { text: "Ik heb gereedschap gekocht bij de bouwmarkt.", forbids: ["cooking"] },
    // NL/DE "gepland" / "geplant" (planned) must never read as planting.
    { text: "Alles verliep zoals gepland.", forbids: ["gardening"] },
    // Power tools alone are not electrical installation.
    { text: "Ik gebruikte een haakse slijper en elektrisch gereedschap.", forbids: ["electrical-install"] },
    // Mopping a floor is cleaning, never the flooring trade.
    { text: "Ik heb de vloer gedweild in het kantoor.", forbids: ["flooring"] },
    // "hoogstwaarschijnlijk" contains "oogst" (harvest) — banned needle.
    { text: "Hoogstwaarschijnlijk kom ik morgen weer.", forbids: ["farm-work"] },
    // ATTENDING an event is not event-setup work.
    { text: "Ik was op het evenement als bezoeker.", forbids: ["event-setup"] },
  ],
};
