import type { LanguageFixtures } from "../types";

/**
 * SV phrase fixtures — realistic Swedish worker sentences covering the
 * owner's 15 mandatory phrase families. Measured offline, then pinned.
 * The first phrase is the former RED-language canary (whose only hit was the
 * measured "packade"→"packag" fuzzy accident) — it now MUST recognise for
 * real, via exact needles.
 */
export const SV_FIXTURES: LanguageFixtures = {
  language: "sv",
  phrases: [
    { text: "Jag arbetade på lagret och packade varor.", expects: ["warehouse-operations", "packaging"] },
    { text: "Jag plockade ordrar och skannade varor.", expects: ["order-picking", "barcode-scanning"] },
    { text: "Jag körde lastbil med frakt till Tyskland.", expects: ["driving", "cargo-transport"] },
    { text: "Jag satt i kassan och hjälpte kunder.", expects: ["cashier", "customer-service"] },
    { text: "Jag matade in data och arbetade i Excel.", expects: ["data-entry", "office-software"] },
    { text: "Jag skrev fakturor och arkiverade papper.", expects: ["bookkeeping", "document-handling"] },
    { text: "Jag lagade mat i köket och diskade.", expects: ["cooking", "dishwashing"] },
    { text: "Jag städade kontoret och putsade fönster.", expects: ["cleaning-services", "window-cleaning"] },
    { text: "Jag tvättade kläder och strök skjortor.", expects: ["laundry"] },
    { text: "Jag arbetade i trädgården och klippte gräsmattan.", expects: ["gardening"] },
    { text: "Jag programmerade en hemsida och fixade buggar.", expects: ["programming"] },
    { text: "Jag monterade möbler och använde elverktyg.", expects: ["furniture-fitting"], forbids: ["electrical-install"] },
    { text: "Jag murade väggar och blandade murbruk.", expects: ["bricklaying"] },
    { text: "Jag reparerade bilar på en bilverkstad.", expects: ["auto-repair"] },
    { text: "Jag klippte hår i en frisersalong.", expects: ["hairdressing"] },
    { text: "Jag höll anställningsintervjuer och rekryterade personal.", expects: ["recruitment"] },
    { text: "Jag arbetade i receptionen och besvarade samtal.", expects: ["reception", "call-centre"] },
    // "stolar" (chairs) must NOT read as the PL carpentry stem ("stolarz").
    { text: "Jag ställde fram stolar och bord inför evenemanget.", expects: ["event-setup"], forbids: ["carpentry"] },
    { text: "Jag passade barn efter skolan.", expects: ["childcare"] },
    { text: "Jag bakade bröd i ett bageri.", expects: ["baking"] },
  ],
  falsePositives: [
    // Being recruited is not recruiting.
    { text: "Jag blev rekryterad till ett nytt jobb.", forbids: ["recruitment"] },
    // Buying electronics/power tools is not electrical work.
    { text: "Jag köpte elektronik och elverktyg.", forbids: ["electrical-install"] },
    // Worker-side interview is NOT recruitment work.
    { text: "Jag var på anställningsintervju igår.", forbids: ["recruitment"] },
    // MY car being repaired is not auto-repair work.
    { text: "Min bil reparerades på verkstaden.", forbids: ["auto-repair"] },
    // "som planerat" (as planned) must never read as planting.
    { text: "Det gick som planerat.", forbids: ["gardening"] },
    // Eating marmalade is not painting (the "målade"→"malade" fold trap).
    { text: "Jag åt marmelad till frukost.", forbids: ["painting"] },
    // SV "ladugården" folds over the EN "garden" needle — gardening must
    // stay silent on barn work (review PR3D: EN needle is now anchored).
    { text: "Jag utfodrade djur i ladugården.", forbids: ["gardening"] },
  ],
};
