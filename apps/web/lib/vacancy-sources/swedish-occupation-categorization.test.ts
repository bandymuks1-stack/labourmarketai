/**
 * SWEDISH OCCUPATION-LABEL CATEGORIZATION — deterministic coverage + pollution
 * regression (worker-acquisition readiness loop, 2026-08-14).
 *
 * Two defects pinned here, both measured in production before the fix:
 *
 *   1. COVERAGE — the profession lexicon had zero Swedish needles, so 48% of
 *      active Swedish ads (care, retail, warehouse, cleaning, kitchen…) had
 *      no profession despite a 100%-populated publisher occupation label.
 *   2. POLLUTION — profession detection ran over the FULL DESCRIPTION, where
 *      Swedish everyday words collide with needles ("chef" = manager,
 *      "driver" = runs). Production held nurse ads tagged `cook` (185 of the
 *      1,671 "cook" rows were Sjuksköterska) and doctor ads tagged `driver`.
 *
 * The contract now: profession comes ONLY from the publisher occupation
 * label (origin "publisher") or the ad title (origin "derived") — never from
 * the description body. Skills stay full-text (curated phrase packs).
 */
import { describe, it, expect } from "vitest";

import { categorizeVacancy } from "./vacancy-categorization";

describe("Swedish occupation labels resolve as publisher facts", () => {
  const CASES: readonly [string, string][] = [
    ["Lagerarbetare", "warehouse_worker"],
    ["Lagerarbetare/Terminalarbetare", "warehouse_worker"],
    ["Truckförare", "warehouse_worker"],
    ["Städare", "cleaner"],
    ["Städare/Lokalvårdare", "cleaner"],
    ["Personlig assistent", "caregiver"],
    ["Undersköterska, hemtjänst och äldreboende", "caregiver"],
    ["Barnskötare", "caregiver"],
    ["Barnvakt", "caregiver"],
    ["Stödassistent", "caregiver"],
    ["Butikssäljare, fackhandel", "sales_assistant"],
    ["Butikssäljare, dagligvaror/Medarbetare, dagligvaror", "sales_assistant"],
    ["Kundtjänstmedarbetare", "customer_service_specialist"],
    ["Kock à la carte", "cook"],
    ["Kock storhushåll", "cook"],
    ["Köksbiträde", "kitchen_helper"],
    ["Restaurangbiträde", "kitchen_helper"],
    ["Servitör/Servitris", "waiter"],
    ["Pizzabagare", "baker"],
    ["Träarbetare/Snickare", "carpenter"],
    ["Svetsare, manuell", "welder"],
    ["Taxiförare", "driver"],
    ["Distributionsförare", "driver"],
    ["Budbilsförare", "driver"],
    ["Lärare i grundskolan, årskurs 7-9", "teacher"],
    ["Förskollärare", "teacher"],
    ["CNC-operatör/FMS-operatör", "production_worker"],
    ["Montör metallprodukter", "production_worker"],
    ["Möbel- och inredningsmontör", "furniture_assembler"],
    ["Personbilsmekaniker", "auto_mechanic"],
    ["Plattsättare", "tiler"],
    ["Frisör", "hairdresser"],
  ];

  it.each(CASES)("%s → %s (origin publisher)", (label, slug) => {
    const r = categorizeVacancy({
      titleRaw: "Ledig tjänst",
      descriptionRaw: "",
      occupationRaw: label,
    });
    expect(r.professionSlug).toBe(slug);
    expect(r.origin).toBe("publisher");
  });
});

describe("description-text pollution stays fixed", () => {
  const POLLUTED_DESCRIPTION =
    "Vi driver en vårdcentral i Stockholm. Du rapporterar till din närmaste " +
    "chef och våra elektriker och snickare finns på plats. Kontakta din chef.";

  it("an unknown occupation label + polluted body yields NO profession — never cook/driver/electrician", () => {
    const r = categorizeVacancy({
      titleRaw: "Sjuksköterska till vårdcentral",
      descriptionRaw: POLLUTED_DESCRIPTION,
      occupationRaw: "Sjuksköterska, grundutbildad",
    });
    // Licensed nurse has no platform profession slug yet — the honest result
    // is null, not a wrong trade borrowed from the ad body.
    expect(r.professionSlug).toBeNull();
  });

  it("Swedish 'chef' (= manager) never makes a cook", () => {
    const r = categorizeVacancy({
      titleRaw: "Enhetschef, hälso- och sjukvård",
      descriptionRaw: "Som chef leder du verksamheten.",
      occupationRaw: "Enhetschef, hälso- och sjukvård",
    });
    expect(r.professionSlug).not.toBe("cook");
  });

  it("Swedish 'driver' (verb) never makes a driver", () => {
    const r = categorizeVacancy({
      titleRaw: "Butikssäljare",
      descriptionRaw: "Vi driver flera butiker i regionen.",
      occupationRaw: "Butikssäljare, fackhandel",
    });
    expect(r.professionSlug).toBe("sales_assistant");
  });

  it("longest needle wins: Lokalvårdare is a cleaner, not a caregiver", () => {
    const r = categorizeVacancy({
      titleRaw: "Lokalvårdare",
      descriptionRaw: "",
      occupationRaw: "Städare/Lokalvårdare",
    });
    expect(r.professionSlug).toBe("cleaner");
  });

  it("a real cook label still resolves (the fix removed pollution, not cooks)", () => {
    const r = categorizeVacancy({
      titleRaw: "Kock sökes",
      descriptionRaw: "Du rapporterar till din chef.",
      occupationRaw: "Kock à la carte",
    });
    expect(r.professionSlug).toBe("cook");
    expect(r.origin).toBe("publisher");
  });

  it("title still resolves when the occupation label is missing (origin derived)", () => {
    const r = categorizeVacancy({
      titleRaw: "Snickare till byggprojekt i Uppsala",
      descriptionRaw: "Vi driver flera projekt.",
      occupationRaw: null,
    });
    expect(r.professionSlug).toBe("carpenter");
    expect(r.origin).toBe("derived");
  });
});

/**
 * TITLE FALLBACK MAY NOT OVERRULE A PUBLISHER WHO NAMED A NON-CATALOGUE
 * OCCUPATION (production 2026-10-15). The page showed "Teacher" for an ad the
 * publisher filed as "Specialistofficer" — not a translation error: the title
 * word "lärare" picked `teacher`. Each pair below is a measured collision.
 */
describe("a publisher's non-catalogue occupation is not overruled by a title word", () => {
  const COLLISIONS: readonly [string, string][] = [
    ["Specialistofficer", "Militär lärare sjösäkerhet"],
    ["Affärsutvecklare", "Business Developer"],
    ["Doktorand", "Doktorand i energi- och miljöteknik med inriktning elektroteknik"],
    ["Bilrekonditionerare", "Bil rekondare / Bil vårdare"],
    ["Hundtrimmare", "Är du vår nya hundfrisör på Dogman and Friends på Väla?"],
  ];
  for (const [occupationRaw, titleRaw] of COLLISIONS) {
    it(`"${titleRaw}" filed as ${occupationRaw} → no catalogue profession`, () => {
      const r = categorizeVacancy({ titleRaw, descriptionRaw: "", occupationRaw });
      expect(r.professionSlug).toBeNull();
      expect(r.origin).toBe("derived");
    });
  }

  it("the title fallback still works when the publisher's label is merely unknown", () => {
    // Measured as CORRECT in production: keep these.
    expect(categorizeVacancy({ titleRaw: "C-chaufför", descriptionRaw: "", occupationRaw: "Fjärrbilsförare" }).professionSlug).toBe("driver");
    expect(categorizeVacancy({ titleRaw: "AI-Driven Full-Stack Developer", descriptionRaw: "", occupationRaw: "Fullstack-utvecklare" }).professionSlug).toBe("software_developer");
    expect(categorizeVacancy({ titleRaw: "Danslärare", descriptionRaw: "", occupationRaw: "Danspedagog" }).professionSlug).toBe("teacher");
  });

  it("a recognised publisher label still wins outright", () => {
    expect(categorizeVacancy({ titleRaw: "Business Developer", descriptionRaw: "", occupationRaw: "Lagerarbetare" }).professionSlug).toBe("warehouse_worker");
  });
});
