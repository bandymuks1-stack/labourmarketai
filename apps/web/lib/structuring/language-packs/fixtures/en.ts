import type { LanguageFixtures } from "../types";

/**
 * EN phrase fixtures — moved VERBATIM from
 * lib/guards/multilingual-phrase-recognition.test.ts (same families as the
 * owner's LT pack). Measured against the recognizer, then pinned.
 */
export const EN_FIXTURES: LanguageFixtures = {
  language: "en",
  phrases: [
    { text: "I worked in a warehouse, packed goods and loaded pallets.", expects: ["warehouse-operations", "packaging"] },
    { text: "I drove cargo to Germany with a category B licence.", expects: ["cargo-transport"] },
    { text: "I worked at the till and served customers.", expects: ["cashier", "customer-service"] },
    // "filled" used to fuzzy-hallucinate skim-coating (via "filler") — blocked.
    { text: "I filled in invoices and documents.", expects: ["document-handling", "bookkeeping"], forbids: ["skim-coating"] },
    { text: "I worked in the kitchen, prepared food and washed dishes.", expects: ["cooking"] },
    // "helped" used to fuzzy-hallucinate general-labour (via "helper") — blocked.
    { text: "I looked after an elderly man and helped around the house.", expects: ["elderly-care"], forbids: ["general-labour"] },
    { text: "I looked after a child after school.", expects: ["childcare"] },
    { text: "I worked in the garden, mowed the lawn and planted plants.", expects: ["gardening"] },
    { text: "I programmed a website and fixed bugs.", expects: ["programming"] },
    { text: "I assembled furniture and used power tools.", expects: ["furniture-fitting"], forbids: ["electrical-install"] },
    { text: "I cleaned the office and common areas.", expects: ["cleaning-services"] },
    { text: "I communicated with clients in English and German.", expects: ["customer-service"] },
    { text: "I organized the preparation of an event.", expects: ["event-setup"] },
    { text: "I operated a forklift in the warehouse.", expects: ["forklift-operation", "warehouse-operations"] },
    { text: "I laid bricks for a wall and mixed mortar.", expects: ["bricklaying"] },
    // Wave-2 catalogue expansion (2026-07-04).
    { text: "I worked with Excel and entered data.", expects: ["office-software", "data-entry"] },
    { text: "I washed dishes in a restaurant.", expects: ["dishwashing"] },
    { text: "I helped in the kitchen as a kitchen porter.", expects: ["kitchen-help"] },
    { text: "I scanned goods and stacked pallets.", expects: ["barcode-scanning", "pallet-handling"] },
    { text: "I did stock taking in the warehouse.", expects: ["stock-taking"] },
    { text: "I repaired cars at a garage.", expects: ["auto-repair"] },
    { text: "I repaired appliances for clients.", expects: ["appliance-repair"] },
    { text: "I did handyman work and minor repairs.", expects: ["handyman-work"] },
    { text: "I cut hair at the salon.", expects: ["hairdressing"] },
    { text: "I worked as a barber trimming beards.", expects: ["barbering"] },
    { text: "I did manicure and pedicure for clients.", expects: ["nail-care"] },
    { text: "I answered calls in a call centre.", expects: ["call-centre"] },
    { text: "I worked at the reception and welcomed visitors.", expects: ["reception"] },
    { text: "I recruited new employees and interviewed candidates.", expects: ["recruitment"] },
    { text: "I handled personnel administration.", expects: ["personnel-admin"] },
    { text: "I baked bread at a bakery.", expects: ["baking"] },
    { text: "I stocked shelves in a supermarket.", expects: ["merchandising"] },
    { text: "I did laundry and ironed clothes.", expects: ["laundry"] },
    { text: "I worked as a barista and made coffee.", expects: ["barista-work"] },
  ],
  falsePositives: [
    // "agreed" must never brush the NL "ik reed"/driving needles.
    { text: "I agreed to start on Monday.", forbids: ["driving"] },
    // Worker-side interview is NOT recruitment work.
    { text: "I attended a job interview yesterday.", forbids: ["recruitment"] },
    // "excellent" must never fire the preposition-anchored "excel" needles.
    { text: "This restaurant serves excellent food.", forbids: ["office-software"] },
    // Buying power tools is neither electrical work nor a trade signal.
    { text: "I bought new power tools at the store.", forbids: ["electrical-install"] },
    // Washing a floor is cleaning, never the flooring trade (context guard).
    { text: "I washed the floor in the office.", forbids: ["flooring"] },
    // "planned" must never brush the DE/NL planting needles.
    { text: "We planned the schedule for next week.", forbids: ["gardening"] },
  ],
};
