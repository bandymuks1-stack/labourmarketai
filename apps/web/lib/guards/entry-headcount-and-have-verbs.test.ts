import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";

/**
 * THREE MEASURED FAILURES AND THE NOUN-ONLY RULE BEHIND TWO OF THEM.
 *
 * Measured 2026-09-08:
 *
 *   lt "reikia 12 TIG kitai savaitei"        -> unknown
 *   lt "ieškome 10 žmonių klientui"          -> unknown
 *   lt "turim sandėlio darbuotojų Vokietijai"-> need-workers  (INVERSION)
 *   lt "Turime 20 darbuotojų"                -> need-workers  (INVERSION)
 *
 * The last two share one cause: `need-workers` scores 4 on the bare
 * `darbuotoj` noun, with no seek verb required anywhere in the sentence. A
 * noun-only rule cannot carry a direction, so WE HAVE was read as WE NEED —
 * twice, in opposite business situations.
 *
 * The other two are vocabulary reaching its limit. TIG is a welding PROCESS,
 * not a job title, and no trade stem matched; "žmoni" was covered only by a
 * rule bound to the single verb `reikia`, so a different verb found nothing.
 */

describe("a need verb plus a headcount is a demand, whatever the trade is called", () => {
  it('lt: "reikia 12 TIG kitai savaitei"', () => {
    // The product cannot hold every trade, process, certificate and local
    // word for the work. A NUMBER after a need verb is a headcount, and that
    // is enough to know the direction and open the form, which then asks what
    // the 12 are. This replaces SILENCE; it does not overrule knowledge.
    expect(classifyIntent("reikia 12 TIG kitai savaitei").intent).toBe("need-workers");
  });

  it('lt: "ieškome 10 žmonių klientui" — an agency buying for a client', () => {
    expect(classifyIntent("ieškome 10 žmonių klientui").intent).toBe("need-workers");
  });

  it("the weakest reading loses to every rule that recognises the work", () => {
    // Weight 3 against the trade rules' 6+: a known trade must still decide.
    const known = classifyIntent("Reikia 12 pastolininkų Roterdame");
    expect(known.intent).toBe("need-workers");
    expect(known.score).toBeGreaterThan(classifyIntent("reikia 12 TIG kitai savaitei").score);
  });
});

describe("a HAVE verb plus a worker noun is never employer demand", () => {
  it('lt: "turim sandėlio darbuotojų Vokietijai" is SUPPLY', () => {
    // WE HAVE warehouse workers FOR Germany. The have verb gives the
    // direction; naming a destination is what makes it an offer.
    expect(classifyIntent("turim sandėlio darbuotojų Vokietijai").intent).toBe("offer-capacity");
  });

  it('lt: "Turime 20 darbuotojų" is the speaker\'s OWN roster, not a demand', () => {
    // Genuinely ambiguous between a company's payroll and an agency's bench,
    // so it lands on the reading that assumes least: it shows the speaker
    // their own people rather than publishing an offer they did not make.
    // What it must NEVER be is "we need 20 workers".
    const m = classifyIntent("Turime 20 darbuotojų");
    expect(m.intent).toBe("who-available");
    expect(m.intent).not.toBe("need-workers");
  });
});

describe("NEGATIVE CONTROLS", () => {
  it("the same country with a NEED verb stays demand", () => {
    // The country is not the signal; the verb is.
    expect(classifyIntent("reikia sandėlio darbuotojų Vokietijoje").intent).toBe("need-workers");
  });

  it("a duration is not a headcount", () => {
    // "reikia 12 valandų" is 12 HOURS. Without the time-unit exclusion the
    // headcount rule would answer a question about time with a demand form.
    for (const s of ["reikia 12 valandų", "i need 2 days", "wir brauchen 3 Wochen"]) {
      expect(classifyIntent(s).intent).not.toBe("need-workers");
    }
  });

  it("the employer's own roster question keeps its answer", () => {
    expect(classifyIntent("turime laisvų darbuotojų").intent).toBe("who-available");
    expect(classifyIntent("Kas šiuo metu laisvas?").intent).toBe("who-available");
  });

  it("an agency offering its people is still an offer, not a roster", () => {
    expect(
      classifyIntent("Turime 20 suvirintojų ir ieškome jiems darbo Nyderlanduose").intent,
    ).toBe("offer-capacity");
    expect(classifyIntent("turime 20 pastolininkų").intent).toBe("offer-capacity");
  });

  it("every door fixed before this one is untouched", () => {
    expect(classifyIntent("Ieškau darbo suvirintoju Vokietijoje").intent).toBe("find-work");
    expect(classifyIntent("wij hebben 12 lassers nodig").intent).toBe("need-workers");
    expect(classifyIntent("noriu įkelti senus darbo duomenis").intent).toBe("hours-import");
    expect(
      classifyIntent("We are a staffing agency looking for 12 welders for our client").intent,
    ).toBe("need-workers");
    expect(
      classifyIntent("We are a training provider and want to register a programme").intent,
    ).toBe("programmes");
  });
});
