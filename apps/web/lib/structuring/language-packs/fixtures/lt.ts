import type { LanguageFixtures } from "../types";

/**
 * LT phrase fixtures — the owner's mandatory phrase pack (2026-07-04),
 * moved VERBATIM from lib/guards/multilingual-phrase-recognition.test.ts into
 * the fixture registry (the guard still runs every case; only the data moved).
 * Every expectation was MEASURED against the recognizer, then pinned.
 */
export const LT_FIXTURES: LanguageFixtures = {
  language: "lt",
  phrases: [
    { text: "Dirbau sandėlyje, pakavau prekes ir kroviau paletes.", expects: ["warehouse-operations", "packaging"] },
    { text: "Vairavau krovinį į Vokietiją su B kategorija.", expects: ["driving"] },
    { text: "Dirbau kasoje ir aptarnavau klientus.", expects: ["cashier", "customer-service"] },
    { text: "Pildžiau sąskaitas ir dokumentus.", expects: ["document-handling", "bookkeeping"] },
    { text: "Dirbau virtuvėje, ruošiau maistą ir ploviau indus.", expects: ["cooking"] },
    { text: "Prižiūrėjau senolį ir padėjau buityje.", expects: ["elderly-care"] },
    { text: "Prižiūrėjau vaiką po pamokų.", expects: ["childcare"] },
    { text: "Dirbau sode, pjoviau žolę ir sodinau augalus.", expects: ["gardening"] },
    { text: "Programavau svetainę ir taisiau klaidas.", expects: ["programming"] },
    // Power tools are NOT electrical installation (power-tool guard).
    { text: "Montavau baldus ir naudojau elektrinius įrankius.", expects: ["furniture-fitting"], forbids: ["electrical-install"] },
    { text: "Valiau biurą ir bendras patalpas.", expects: ["cleaning-services"] },
    { text: "Bendravau su klientais anglų ir vokiečių kalbomis.", expects: ["customer-service"] },
    { text: "Organizavau renginio pasiruošimą.", expects: ["event-setup"] },
    { text: "Dirbau su krautuvu sandėlyje.", expects: ["forklift-operation", "warehouse-operations"] },
    { text: "Mūrijau sieną ir maišiau skiedinį.", expects: ["bricklaying"] },
    // Wave-2 catalogue expansion (2026-07-04): the former class-E gaps are now
    // installed (migration 20260704150000) and recognised.
    { text: "Dirbau su Excel ir suvedžiau duomenis.", expects: ["office-software", "data-entry"] },
    { text: "Ploviau indus restorane.", expects: ["dishwashing"] },
    { text: "Padėjau virtuvėje ruošti maistą.", expects: ["kitchen-help"] },
    { text: "Skenavau prekes ir kroviau paletes.", expects: ["barcode-scanning", "pallet-handling"] },
    { text: "Atlikau inventorizaciją sandėlyje.", expects: ["stock-taking"] },
    { text: "Remontavau automobilius servise.", expects: ["auto-repair"] },
    { text: "Taisiau buitinę techniką.", expects: ["appliance-repair"] },
    { text: "Smulkūs remonto darbai namuose.", expects: ["handyman-work"] },
    { text: "Kirpau plaukus klientams kirpykloje.", expects: ["hairdressing"] },
    { text: "Skutau barzdas klientams.", expects: ["barbering"] },
    { text: "Dariau manikiūrą ir pedikiūrą.", expects: ["nail-care"] },
    { text: "Atsakinėjau į skambučius skambučių centre.", expects: ["call-centre"] },
    { text: "Dirbau registratūroje ir priėmiau lankytojus.", expects: ["reception"] },
    { text: "Ieškojau darbuotojų ir vedžiau darbo pokalbius.", expects: ["recruitment"] },
    { text: "Tvarkiau personalo dokumentus.", expects: ["personnel-admin"] },
    { text: "Kepiau duoną kepykloje.", expects: ["baking"] },
    { text: "Dėliojau prekes į lentynas parduotuvėje.", expects: ["merchandising"] },
    { text: "Skalbiau ir lyginau drabužius.", expects: ["laundry"] },
    { text: "Dariau kavą klientams kavinėje.", expects: ["barista-work"] },
  ],
  falsePositives: [
    // Worker-side interview is NOT recruitment work (recruiter-side anchors).
    { text: "Buvau darbo pokalbyje dėl naujo darbo.", forbids: ["recruitment"] },
    // Washing a floor is cleaning, never the flooring trade (context guard).
    { text: "Ploviau grindis biure.", forbids: ["flooring"] },
    // Power tools alone are not electrical installation (context guard).
    { text: "Naudojau elektrinius įrankius.", forbids: ["electrical-install"] },
    // Buying something in a shop is not retail work.
    { text: "Pirkau naują telefoną parduotuvėje.", forbids: ["sales-assistant", "cashier"] },
    // LEARNING at work is not teaching work.
    { text: "Mokiausi naujų dalykų darbe.", forbids: ["teaching"] },
    // A private phone call is not call-centre/customer-service work.
    { text: "Kalbėjau telefonu su draugu.", forbids: ["call-centre", "customer-service"] },
  ],
};
