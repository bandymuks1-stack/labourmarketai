import type { LanguageFixtures } from "../types";

/**
 * LV phrase fixtures — realistic Latvian worker sentences covering the
 * owner's 15 mandatory phrase families. Measured offline, then pinned.
 * The first phrase is the former RED-language canary — it now MUST recognise.
 */
export const LV_FIXTURES: LanguageFixtures = {
  language: "lv",
  phrases: [
    { text: "Strādāju noliktavā, iepakoju preces.", expects: ["warehouse-operations", "packaging"] },
    { text: "Komplektēju pasūtījumus un skenēju preces.", expects: ["order-picking", "barcode-scanning"] },
    { text: "Vadīju automašīnu un pārvadāju kravas.", expects: ["driving", "cargo-transport"] },
    { text: "Strādāju pie kases un apkalpoju klientus.", expects: ["cashier", "customer-service"] },
    { text: "Ievadīju datus un strādāju ar Excel.", expects: ["data-entry", "office-software"] },
    { text: "Izrakstīju rēķinus un kārtoju dokumentus.", expects: ["bookkeeping", "document-handling"] },
    { text: "Gatavoju ēdienu un mazgāju traukus.", expects: ["cooking", "dishwashing"] },
    { text: "Uzkopu biroju un mazgāju logus.", expects: ["cleaning-services", "window-cleaning"] },
    { text: "Mazgāju veļu un gludināju kreklus.", expects: ["laundry"] },
    { text: "Strādāju dārzā un pļāvu zāli.", expects: ["gardening"] },
    { text: "Programmēju mājaslapu un laboju kļūdas.", expects: ["programming"] },
    { text: "Montēju mēbeles un izmantoju elektroinstrumentus.", expects: ["furniture-fitting"], forbids: ["electrical-install"] },
    { text: "Mūrēju sienu un jaucu javu.", expects: ["bricklaying"] },
    { text: "Remontēju automašīnas servisā.", expects: ["auto-repair"] },
    { text: "Griezu matus klientiem frizētavā.", expects: ["hairdressing"] },
    { text: "Vadīju darba intervijas un meklēju darbiniekus.", expects: ["recruitment"] },
    { text: "Strādāju recepcijā un atbildēju uz zvaniem.", expects: ["reception", "call-centre"] },
    { text: "Uzstādīju skatuvi pasākumam.", expects: ["event-setup"] },
    { text: "Pieskatīju bērnus pēc skolas.", expects: ["childcare"] },
    { text: "Cepu maizi maiznīcā.", expects: ["baking"] },
  ],
  falsePositives: [
    // Power tools alone are not electrical installation (context guard).
    { text: "Izmantoju elektroinstrumentus darbā.", forbids: ["electrical-install"] },
    // Worker-side interview is NOT recruitment work.
    { text: "Biju darba intervijā pie darba devēja.", forbids: ["recruitment"] },
    // Washing a floor is cleaning, never the flooring trade.
    { text: "Mazgāju grīdu birojā.", forbids: ["flooring"] },
    // "mācījos" (I learned) contains "māciju" — teaching stays anchored.
    { text: "Mācījos jaunas prasmes.", forbids: ["teaching"] },
    // Buying a car is neither repair nor driving work.
    { text: "Nopirku jaunu automašīnu.", forbids: ["auto-repair", "driving"] },
    // Reading ABOUT gardening is not gardening work ("dārzkopību" ⊅ "dārzā").
    { text: "Lasīju grāmatu par dārzkopību.", forbids: ["gardening"] },
  ],
};
