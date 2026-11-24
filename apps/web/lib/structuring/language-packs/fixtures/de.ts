import type { LanguageFixtures } from "../types";

/**
 * DE phrase fixtures — realistic German worker sentences covering the owner's
 * 15 mandatory phrase families. Every expectation measured against the
 * recognizer with ONLY local dictionaries (offline), then pinned.
 */
export const DE_FIXTURES: LanguageFixtures = {
  language: "de",
  phrases: [
    { text: "Ich habe im Lager gearbeitet und Paletten gestapelt.", expects: ["warehouse-operations", "pallet-handling"] },
    { text: "Ich habe Aufträge kommissioniert und Waren gescannt.", expects: ["order-picking", "barcode-scanning"] },
    { text: "Ich bin LKW gefahren und habe Fracht transportiert.", expects: ["driving", "cargo-transport"] },
    { text: "Ich habe an der Kasse gearbeitet und Kunden beraten.", expects: ["cashier", "customer-service"] },
    { text: "Ich habe Daten eingegeben und mit Excel gearbeitet.", expects: ["data-entry", "office-software"] },
    { text: "Ich habe Rechnungen geschrieben und Unterlagen sortiert.", expects: ["bookkeeping", "document-handling"] },
    { text: "Ich habe in der Küche gearbeitet und Geschirr gespült.", expects: ["cooking", "dishwashing"] },
    { text: "Ich habe das Büro gereinigt und Fenster geputzt.", expects: ["cleaning-services", "window-cleaning"] },
    { text: "Ich habe Wäsche gewaschen und gebügelt.", expects: ["laundry"] },
    { text: "Ich habe im Garten gearbeitet und den Rasen gemäht.", expects: ["gardening"] },
    { text: "Ich habe eine Webseite entwickelt und Fehler behoben.", expects: ["programming"] },
    { text: "Ich habe Möbel montiert und Elektrowerkzeuge benutzt.", expects: ["furniture-fitting"], forbids: ["electrical-install"] },
    { text: "Ich habe Wände gemauert und Mörtel angemischt.", expects: ["bricklaying"] },
    { text: "Ich habe Autos repariert in der KFZ-Werkstatt.", expects: ["auto-repair"] },
    { text: "Ich habe Haare geschnitten im Friseursalon.", expects: ["hairdressing"] },
    { text: "Ich habe Vorstellungsgespräche geführt und Personal rekrutiert.", expects: ["recruitment"] },
    { text: "Ich habe an der Rezeption gearbeitet und Anrufe entgegengenommen.", expects: ["reception", "call-centre"] },
    { text: "Ich habe die Bühne aufgebaut für das Stadtfest.", expects: ["event-setup"] },
    { text: "Ich habe auf Kinder aufgepasst und im Kindergarten geholfen.", expects: ["childcare"], forbids: ["gardening"] },
    { text: "Ich habe Brot gebacken in der Bäckerei.", expects: ["baking"] },
    // "Elektroniker" is the official DE electrician title — it must count
    // as electrical WORK, not be suppressed as consumer electronics
    // (review PR3D: "elektroniker" added to ELECTRICAL_WORK_RE).
    { text: "Ich arbeitete als Elektroniker auf der Baustelle.", expects: ["electrical-install"] },
    // Manicure text must not fire the painting trade (review PR3D: bare
    // "lackiert" was anchored — "Nägel lackiert" stays nail-care only).
    { text: "Ich habe im Nagelstudio Nägel lackiert.", expects: ["nail-care"], forbids: ["painting"] },
  ],
  falsePositives: [
    // "gelernt"/"Erfahrung" must never brush harvest ("ernte") or driving.
    { text: "Ich habe viel gelernt und Erfahrung gesammelt.", forbids: ["farm-work", "driving"] },
    // "Gefahren" (dangers) contains "gefahren" (driven) — anchored needles.
    { text: "Es gibt viele Gefahren auf der Baustelle.", forbids: ["driving"] },
    // Power tools alone are not electrical installation.
    { text: "Ich habe eine Bohrmaschine und Elektrowerkzeuge benutzt.", forbids: ["electrical-install"] },
    // "fließen" folds to "fliessen" (ss) and must NOT match "fliesen" (tiles).
    { text: "Das Wasser muss gut fließen können.", forbids: ["tiling"] },
    // "wie geplant" (as planned) must never read as planting.
    { text: "Wie geplant bin ich um acht Uhr gekommen.", forbids: ["gardening"] },
    // Mentioning roof tiles is neither bricklaying nor roofing WORK.
    { text: "Auf dem Dach liegen alte Dachziegel.", forbids: ["bricklaying"] },
  ],
};
