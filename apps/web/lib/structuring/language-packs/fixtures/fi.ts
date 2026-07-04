import type { LanguageFixtures } from "../types";

/**
 * FI phrase fixtures — realistic Finnish worker sentences covering the
 * owner's 15 mandatory phrase families. FI is a NEW recognition language
 * (it had no locale presence at all before PR3B). Measured offline, pinned.
 */
export const FI_FIXTURES: LanguageFixtures = {
  language: "fi",
  phrases: [
    { text: "Työskentelin varastossa ja pakkasin tuotteita.", expects: ["warehouse-operations", "packaging"] },
    { text: "Keräilin tilauksia ja skannasin tuotteita.", expects: ["order-picking", "barcode-scanning"] },
    { text: "Ajoin rekkaa ja kuljetin tavaraa Saksaan.", expects: ["driving", "cargo-transport"] },
    { text: "Olin kassalla ja palvelin asiakkaita.", expects: ["cashier", "customer-service"] },
    { text: "Syötin tietoja ja työskentelin Excelissä.", expects: ["data-entry", "office-software"] },
    { text: "Laadin laskuja ja arkistoin asiakirjoja.", expects: ["bookkeeping", "document-handling"] },
    { text: "Kokkasin keittiössä ja pesin astioita.", expects: ["cooking", "dishwashing"] },
    { text: "Siivosin toimiston ja pesin ikkunoita.", expects: ["cleaning-services", "window-cleaning"] },
    { text: "Pesin pyykkiä ja silitin paitoja.", expects: ["laundry"] },
    { text: "Työskentelin puutarhassa ja leikkasin nurmikon.", expects: ["gardening"] },
    { text: "Koodasin verkkosivua ja korjasin bugeja.", expects: ["programming"] },
    { text: "Kokosin huonekalut ja käytin sähkötyökaluja.", expects: ["furniture-fitting"], forbids: ["electrical-install"] },
    { text: "Muurasin seinää ja sekoitin laastia.", expects: ["bricklaying"] },
    { text: "Korjasin autoja autokorjaamossa.", expects: ["auto-repair"] },
    { text: "Leikkasin hiuksia kampaamossa.", expects: ["hairdressing"] },
    { text: "Rekrytoin työntekijöitä ja pidin työhaastatteluja.", expects: ["recruitment"] },
    { text: "Työskentelin vastaanotossa ja vastasin puheluihin.", expects: ["reception", "call-centre"] },
    { text: "Rakensin lavan festivaalia varten.", expects: ["event-setup"] },
    { text: "Hoidin lapsia koulun jälkeen.", expects: ["childcare"] },
    { text: "Leivoin leipää leipomossa.", expects: ["baking"] },
    // Barbering must not brush the driving needles ("ajoin partoja").
    { text: "Ajoin partoja asiakkaille parturissa.", expects: ["barbering"], forbids: ["driving"] },
  ],
  falsePositives: [
    // "lähetti" (sent) is not courier work — delivery needles are anchored.
    { text: "Hän lähetti minulle viestin illalla.", forbids: ["delivery-driving"] },
    // Scoring a goal ("maalin") is not painting ("maalasin"/"maalari").
    { text: "Tein maalin jalkapallopelissä.", forbids: ["painting"] },
    // Turning a key ("käänsin") is not translation work.
    { text: "Käänsin avaimen lukossa.", forbids: ["translation"] },
    // Power tools alone are not electrical installation.
    { text: "Käytin sähkötyökaluja remontissa.", forbids: ["electrical-install"] },
    // Washing your face is neither dishwashing, laundry nor window cleaning.
    { text: "Pesin kasvoni aamulla.", forbids: ["dishwashing", "laundry", "window-cleaning"] },
  ],
};
