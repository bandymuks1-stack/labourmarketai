import type { LanguageFixtures } from "../types";

/**
 * NO phrase fixtures — realistic Norwegian worker sentences covering the
 * owner's 15 mandatory phrase families. Measured offline, then pinned.
 * The first phrase is the former RED-language canary (whose only hit was the
 * measured "pakket"→"parket" fuzzy accident) — it now MUST recognise for real.
 */
export const NO_FIXTURES: LanguageFixtures = {
  language: "no",
  phrases: [
    { text: "Jeg jobbet på lageret og pakket varer.", expects: ["warehouse-operations", "packaging"] },
    { text: "Jeg plukket ordrer og skannet varer.", expects: ["order-picking", "barcode-scanning"] },
    { text: "Jeg kjørte lastebil med frakt til Tyskland.", expects: ["driving", "cargo-transport"] },
    { text: "Jeg satt i kassen og hjalp kunder.", expects: ["cashier", "customer-service"] },
    { text: "Jeg tastet inn data og jobbet i Excel.", expects: ["data-entry", "office-software"] },
    { text: "Jeg skrev fakturaer og arkiverte papirer.", expects: ["bookkeeping", "document-handling"] },
    { text: "Jeg laget mat på kjøkkenet og vasket opp.", expects: ["cooking", "dishwashing"] },
    { text: "Jeg drev med renhold og vasket vinduer på kontoret.", expects: ["cleaning-services", "window-cleaning"] },
    { text: "Jeg vasket klær og strøk skjorter.", expects: ["laundry"] },
    { text: "Jeg jobbet i hagen og klipte plenen.", expects: ["gardening"] },
    { text: "Jeg programmerte en nettside og fikset bugs.", expects: ["programming"] },
    { text: "Jeg monterte møbler og brukte elektrisk verktøy.", expects: ["furniture-fitting"], forbids: ["electrical-install"] },
    { text: "Jeg murte vegger og blandet mørtel.", expects: ["bricklaying"] },
    { text: "Jeg reparerte biler på et bilverksted.", expects: ["auto-repair"] },
    { text: "Jeg klippet hår i en frisørsalong.", expects: ["hairdressing"] },
    { text: "Jeg holdt jobbintervjuer og rekrutterte ansatte.", expects: ["recruitment"] },
    { text: "Jeg jobbet i resepsjonen og besvarte telefoner.", expects: ["reception", "call-centre"] },
    { text: "Jeg rigget scenen til festivalen.", expects: ["event-setup"] },
    { text: "Jeg passet barn etter skolen.", expects: ["childcare"] },
    { text: "Jeg bakte brød i et bakeri.", expects: ["baking"] },
  ],
  falsePositives: [
    // Being recruited is not recruiting.
    { text: "Jeg ble rekruttert til en ny jobb.", forbids: ["recruitment"] },
    // MY car being repaired is not auto-repair work.
    { text: "Bilen min ble reparert på verkstedet.", forbids: ["auto-repair"] },
    // Buying electronics/power tools is not electrical work.
    { text: "Jeg kjøpte elektronikk og elektrisk verktøy.", forbids: ["electrical-install"] },
    // "pusset opp" (renovated) is neither plastering nor window cleaning.
    { text: "Jeg pusset opp leiligheten min.", forbids: ["plastering", "window-cleaning"] },
    // Worker-side interview is NOT recruitment work.
    { text: "Jeg var på jobbintervju i går.", forbids: ["recruitment"] },
    // Tearing paper is not demolition ("rivearbeid" is anchored).
    { text: "Vi rev i stykker papiret.", forbids: ["demolition"] },
  ],
};
