import type { LanguageFixtures } from "../types";

/**
 * DA phrase fixtures — realistic Danish worker sentences covering the
 * owner's 15 mandatory phrase families. Measured offline, then pinned.
 * The first phrase is the former RED-language canary — it now MUST recognise.
 */
export const DA_FIXTURES: LanguageFixtures = {
  language: "da",
  phrases: [
    { text: "Jeg arbejdede på lageret og pakkede varer.", expects: ["warehouse-operations", "packaging"] },
    { text: "Jeg plukkede ordrer og scannede varer.", expects: ["order-picking", "barcode-scanning"] },
    { text: "Jeg kørte lastbil med fragt til Tyskland.", expects: ["driving", "cargo-transport"] },
    { text: "Jeg sad ved kassen og hjalp kunder.", expects: ["cashier", "customer-service"] },
    { text: "Jeg indtastede data og arbejdede i Excel.", expects: ["data-entry", "office-software"] },
    { text: "Jeg skrev fakturaer og arkiverede papirer.", expects: ["bookkeeping", "document-handling"] },
    { text: "Jeg lavede mad i køkkenet og vaskede op.", expects: ["cooking", "dishwashing"] },
    { text: "Jeg gjorde rent på kontoret og pudsede vinduer.", expects: ["cleaning-services", "window-cleaning"] },
    { text: "Jeg vaskede tøj og strøg skjorter.", expects: ["laundry"] },
    { text: "Jeg arbejdede i haven og slog græs.", expects: ["gardening"] },
    { text: "Jeg programmerede en hjemmeside og rettede fejl i koden.", expects: ["programming"] },
    { text: "Jeg samlede møbler og brugte elværktøj.", expects: ["furniture-fitting"], forbids: ["electrical-install"] },
    { text: "Jeg murede vægge og blandede mørtel.", expects: ["bricklaying"] },
    { text: "Jeg reparerede biler på et autoværksted.", expects: ["auto-repair"] },
    { text: "Jeg klippede hår i en frisørsalon.", expects: ["hairdressing"] },
    { text: "Jeg afholdt jobsamtaler og rekrutterede medarbejdere.", expects: ["recruitment"] },
    { text: "Jeg arbejdede i receptionen og besvarede opkald.", expects: ["reception", "call-centre"] },
    { text: "Jeg byggede scenen op til koncerten.", expects: ["event-setup"] },
    { text: "Jeg passede børn efter skole.", expects: ["childcare"] },
    { text: "Jeg bagte brød i et bageri.", expects: ["baking"] },
  ],
  falsePositives: [
    // Being recruited is not recruiting (suffix keeps agent/patient apart).
    { text: "Jeg blev rekrutteret til et nyt job.", forbids: ["recruitment"] },
    // "høstede" folds to "hostede" (EN hosted) — banned harvest needle.
    { text: "Jeg høstede erfaring i jobbet.", forbids: ["farm-work"] },
    // Buying electronics/power tools is not electrical work.
    { text: "Jeg købte elektronik og elværktøj.", forbids: ["electrical-install"] },
    // "som planlagt" (as planned) must never read as planting.
    { text: "Alt gik som planlagt.", forbids: ["gardening"] },
    // Worker-side interview is NOT recruitment work.
    { text: "Jeg var til jobsamtale i går.", forbids: ["recruitment"] },
    // Driving PAST somewhere is not professional driving.
    { text: "Jeg kørte forbi supermarkedet på vej hjem.", forbids: ["driving"] },
  ],
};
