import type { LanguageFixtures } from "../types";

/**
 * ET phrase fixtures — realistic Estonian worker sentences covering the
 * owner's 15 mandatory phrase families. Measured offline, then pinned.
 * The first phrase is the former RED-language canary — it now MUST recognise.
 */
export const ET_FIXTURES: LanguageFixtures = {
  language: "et",
  phrases: [
    { text: "Töötasin laos ja pakkisin kaupu.", expects: ["warehouse-operations", "packaging"] },
    { text: "Komplekteerisin tellimusi ja skaneerisin kaupu.", expects: ["order-picking", "barcode-scanning"] },
    { text: "Sõitsin autoga ja vedasin kaupa Saksamaale.", expects: ["driving", "cargo-transport"] },
    { text: "Töötasin kassas ja teenindasin kliente.", expects: ["cashier", "customer-service"] },
    { text: "Sisestasin andmeid ja töötasin Excelis.", expects: ["data-entry", "office-software"] },
    { text: "Koostasin arveid ja korrastasin dokumente.", expects: ["bookkeeping", "document-handling"] },
    { text: "Valmistasin toitu ja pesin nõusid.", expects: ["cooking", "dishwashing"] },
    { text: "Koristasin kontorit ja pesin aknaid.", expects: ["cleaning-services", "window-cleaning"] },
    { text: "Pesin pesu ja triikisin särke.", expects: ["laundry"] },
    { text: "Aias töötasin ja niitsin muru.", expects: ["gardening"] },
    { text: "Programmeerisin veebilehte ja parandasin vigu koodis.", expects: ["programming"] },
    { text: "Panin mööbli kokku ja kasutasin elektrilisi tööriistu.", expects: ["furniture-fitting"], forbids: ["electrical-install"] },
    { text: "Ladusin telliseid ja segasin mörti.", expects: ["bricklaying"] },
    { text: "Remontisin autosid töökojas.", expects: ["auto-repair"] },
    { text: "Lõikasin juukseid juuksurisalongis.", expects: ["hairdressing"] },
    { text: "Värbasin uusi töötajaid ja viisin läbi tööintervjuusid.", expects: ["recruitment"] },
    { text: "Töötasin vastuvõtulauas ja vastasin kõnedele.", expects: ["reception", "call-centre"] },
    { text: "Panin lava üles ürituse jaoks.", expects: ["event-setup"] },
    { text: "Hoidsin lapsi pärast kooli.", expects: ["childcare"] },
    { text: "Küpsetasin leiba pagariäris.", expects: ["baking"] },
  ],
  falsePositives: [
    // "tellisin" (I ordered) contains "tellis" (brick) — anchored needles.
    { text: "Tellisin uued töövahendid internetist.", forbids: ["bricklaying"] },
    // Records/discs are not tiles ("plaate" is verb-anchored).
    { text: "Kuulasin plaate terve õhtu.", forbids: ["tiling"] },
    // LEARNING is not teaching (õppisin ≠ õpetasin).
    { text: "Õppisin tööl uusi asju.", forbids: ["teaching"] },
    // Worker-side interview is NOT recruitment work.
    { text: "Käisin eile tööintervjuul.", forbids: ["recruitment"] },
    // Driving friends around is not cargo transport ("vedasin" is anchored).
    { text: "Vedasin sõpru autoga linna.", forbids: ["cargo-transport"] },
    // Power tools alone are not electrical installation (context guard).
    { text: "Elektrilised tööriistad olid katki.", forbids: ["electrical-install"] },
    // Nominative singular power tool (review PR3D: POWER_TOOL_RE now
    // matches "elektrili[a-z]* toorii", not just the plural forms).
    { text: "Elektriline tööriist läks katki, kui panin mööbli kokku.", forbids: ["electrical-install"] },
    // ET "nõudepesijana" (as a dishwasher) must never brush the LT beam
    // stem (review PR3D: bare "sij" was replaced with anchored forms).
    { text: "Töötasin nõudepesijana restoranis.", forbids: ["timber-framing"] },
    // ET "juhiluba" (driving licence) must never brush the LT ceiling stem.
    { text: "Sain juhiloa ja töötan autojuhina.", forbids: ["ceiling-systems"] },
  ],
};
