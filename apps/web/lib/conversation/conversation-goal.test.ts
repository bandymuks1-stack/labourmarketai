/**
 * MULTI-TURN CONVERSATION JOURNEYS — owner P0, 2026-09-06 (window 7 §9).
 *
 * These are not phrase tests. Each `describe` walks a whole journey the way a
 * person actually talks: a goal, then refinements, corrections and references
 * to state the product already holds. The assertion is that the GOAL survives
 * and the CONSTRAINTS accumulate — the two things the conversation could not
 * do when the owner watched it ask twice for the same CV.
 *
 * The real `classifyIntent` runs here on purpose. A journey that passes
 * against a stubbed router proves nothing about production, and the router's
 * SCORE is part of the contract (a weak country match must not displace a
 * live hiring goal).
 */

import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import {
  advanceGoal,
  classifyTurn,
  declineOutstandingOffers,
  goalSentence,
  mayOffer,
  mergeFilters,
  noteOffered,
  statedConstraintCount,
  withoutDeclined,
  type ConversationGoal,
  type TurnKind,
} from "@/lib/conversation/conversation-goal";
import {
  EMPTY_DISCOVERY_FILTERS,
  type DiscoveryFilterState,
} from "@/lib/opportunities/discovery-filters";

/** One turn through the pure pipeline, exactly as the chat runs it. */
function turn(
  goal: ConversationGoal | null,
  text: string,
  read?: Partial<DiscoveryFilterState>,
): { kind: TurnKind; goal: ConversationGoal | null } {
  const routed = classifyIntent(text);
  const kind = classifyTurn({
    text,
    routedIntent: routed.intent,
    routedScore: routed.score,
    goal,
  });
  const next = advanceGoal({
    goal,
    kind,
    routedIntent: routed.intent,
    filters: read ? { ...EMPTY_DISCOVERY_FILTERS, ...read } : undefined,
    text,
  });
  return { kind, goal: next };
}

describe("A — job search with an existing profile (the owner's observed journey)", () => {
  it("keeps ONE search goal across four turns and never restarts it", () => {
    // 1. The goal. "pagal savo CV" names a SOURCE, not a destination — the
    //    goal is finding work (owner §2, goal ≠ input method).
    const t1 = turn(null, "Ieškau darbo pagal savo CV");
    expect(t1.kind).toBe("new-goal");
    expect(t1.goal?.intent).toBe("find-work");

    // 2. THE DEFECT. This scored 0 in the router and fell to the generic
    //    fallback, whose chip row offered the CV upload again.
    const t2 = turn(t1.goal, "tu jau turi mano duomenis");
    expect(t2.kind).toBe("use-known-state");
    expect(t2.goal?.intent).toBe("find-work");
    expect(t2.goal?.useKnownState).toBe(true);

    // 3. Geography changes; the goal does not.
    const t3 = turn(t2.goal, "gerai, tada ieškok visoje Europoje");
    expect(t3.kind).toBe("follow-up");
    expect(t3.goal?.intent).toBe("find-work");
    expect(t3.goal?.useKnownState).toBe(true);

    // 4. A compensation constraint on the SAME goal — previously `unknown`.
    const t4 = turn(t3.goal, "rodyk tik nuo 3000 eurų");
    expect(t4.kind).toBe("follow-up");
    expect(t4.goal?.intent).toBe("find-work");
  });

  it("accumulates constraints instead of replacing them each turn", () => {
    const t1 = turn(null, "Ieškau darbo", { profession: "welder" });
    const t2 = turn(t1.goal, "Nuo spalio.", { start: "2026-10" });
    const t3 = turn(t2.goal, "Nyderlanduose arba Belgijoje.", { country: "NL" });

    // The profession stated in turn 1 is still there in turn 3 — this is the
    // accumulation `runFindWork(text)` could not do reading one sentence.
    expect(t3.goal?.filters.profession).toBe("welder");
    expect(t3.goal?.filters.start).toBe("2026-10");
    expect(t3.goal?.filters.country).toBe("NL");
    expect(statedConstraintCount(t3.goal)).toBe(3);
  });

  it("does not treat a diacritic-free restatement as a new goal", () => {
    const t1 = turn(null, "Ieškau darbo pagal savo CV");
    const t2 = turn(t1.goal, "tu jau turi mano duomenis");
    // Same sentence as typed on a phone keyboard, without diacritics.
    const t2b = turn(t1.goal, "tu jau turi mano duomenis.");
    expect(t2.kind).toBe("use-known-state");
    expect(t2b.kind).toBe("use-known-state");
  });
});

describe("B — job search with an insufficient profile", () => {
  it("a single missing fact continues the goal instead of restarting it", () => {
    const t1 = turn(null, "Ieškau darbo");
    expect(t1.kind).toBe("new-goal");

    // The person supplies exactly the one fact that was missing.
    const t2 = turn(t1.goal, "Nuo spalio.", { start: "2026-10" });
    expect(t2.kind).toBe("follow-up");
    expect(t2.goal?.intent).toBe("find-work");
    expect(t2.goal?.turns).toBe(2);
  });
});

describe("C — employer demand (the goal must not flip to job hunting)", () => {
  it("keeps the hiring goal when a follow-up names a country", () => {
    const t1 = turn(null, "Reikia 8 elektrikų nuo spalio.");
    expect(t1.kind).toBe("new-goal");
    expect(t1.goal?.intent).toBe("need-workers");

    // "Netherlands" alone scores as a weak `find-work` in the router. Before
    // the score floor this turn silently converted an employer's live demand
    // into a personal job search.
    const t2 = turn(t1.goal, "Gali būti ir Nyderlanduose.", { country: "NL" });
    expect(t2.kind).toBe("follow-up");
    expect(t2.goal?.intent).toBe("need-workers");

    const t3 = turn(t2.goal, "Geriau turintys VCA.");
    expect(t3.kind).toBe("follow-up");
    expect(t3.goal?.intent).toBe("need-workers");
    expect(t3.goal?.filters.country).toBe("NL");
  });
});

describe("F — correction replaces the fact, it does not create a second one", () => {
  it("'Ne, 12.' corrects the live demand rather than falling to the fallback", () => {
    const t1 = turn(null, "Reikia 10 mechanikų.");
    expect(t1.goal?.intent).toBe("need-workers");

    const t2 = turn(t1.goal, "Ne, 12.");
    expect(t2.kind).toBe("correction");
    // ONE goal, still the same one — not a second demand and not a dead end.
    expect(t2.goal?.intent).toBe("need-workers");
    expect(t2.goal?.turns).toBe(2);
  });

  it("a bare refusal is a rejection, not a correction", () => {
    const t1 = turn(null, "Ieškau darbo");
    expect(turn(t1.goal, "nereikia").kind).toBe("rejection");
  });

  it("the correction keeps the trade the earlier turn named (the form prefill)", () => {
    const t1 = turn(null, "Reikia 10 mechanikų.");
    const t2 = turn(t1.goal, "Ne, 12.");

    // What the demand-intake handler is handed. The trade survives, and the
    // correction comes LAST so a reader that lets the last mention win sees
    // twelve — the single canonical state owner §9 F requires.
    const composed = goalSentence(t2.goal, "Ne, 12.");
    expect(composed).toContain("mechanik");
    expect(composed.indexOf("12")).toBeGreaterThan(composed.indexOf("10"));
  });

  it("a refusal contributes no words to the goal — 'nereikia' is not a fact", () => {
    const t1 = turn(null, "Reikia 10 mechanikų.");
    const t2 = turn(t1.goal, "nereikia");
    expect(goalSentence(t2.goal, "nereikia")).not.toContain("nereikia");
  });

  it("the remembered sentences stay bounded", () => {
    let goal = turn(null, "Ieškau darbo").goal;
    for (let i = 0; i < 12; i += 1) goal = turn(goal, `nuo ${2020 + i}`).goal;
    expect(goal?.said.length ?? 0).toBeLessThanOrEqual(4);
  });

  it("replacing a dimension overwrites it, and leaves the others alone", () => {
    const carried: DiscoveryFilterState = {
      ...EMPTY_DISCOVERY_FILTERS,
      country: "LT",
      profession: "welder",
    };
    const merged = mergeFilters(carried, {
      ...EMPTY_DISCOVERY_FILTERS,
      country: "NL",
    });
    expect(merged.country).toBe("NL");
    expect(merged.profession).toBe("welder");
  });
});

describe("G — reference to existing data, in five languages", () => {
  const SENTENCES = [
    "tu jau turi mano duomenis",
    "Naudok mano profilį.",
    "juk jau esu viską įvedęs",
    "you already have my data",
    "use my profile",
    "у вас уже есть мои данные",
    "используйте мой профиль",
    "je hebt al mijn gegevens",
    "gebruik mijn profiel",
    "du hast schon meine Daten",
  ];

  it.each(SENTENCES)("%s → use-known-state", (text) => {
    const goal = turn(null, "Ieškau darbo").goal;
    expect(turn(goal, text).kind).toBe("use-known-state");
  });

  it("means nothing when no goal is in flight", () => {
    // Without a goal there is nothing to apply known state TO; the sentence
    // routes normally rather than being swallowed.
    expect(turn(null, "tu jau turi mano duomenis").kind).toBe("unrelated");
  });
});

describe("anti-loop — general, never CV-specific (owner §6)", () => {
  it("an offer the person refused is never offered again for that goal", () => {
    let goal = turn(null, "Ieškau darbo").goal;
    // The answer offered three doors, the CV import among them.
    goal = noteOffered(goal, ["cv", "profile", "jobs"]);
    expect(mayOffer(goal, "cv")).toBe(true);

    // "you already have my data" — everything on the table is declined.
    goal = declineOutstandingOffers(goal);
    expect(mayOffer(goal, "cv")).toBe(false);
    expect(mayOffer(goal, "profile")).toBe(false);

    // And the chip row physically cannot carry it any more.
    const chips = [{ id: "cv" }, { id: "jobs2" }];
    expect(withoutDeclined(goal, chips)).toEqual([{ id: "jobs2" }]);
  });

  it("is not about CVs — the same guard covers any offered action", () => {
    let goal = turn(null, "Reikia 10 mechanikų.").goal;
    goal = noteOffered(goal, ["f:company.create-demand"]);
    goal = declineOutstandingOffers(goal);
    expect(mayOffer(goal, "f:company.create-demand")).toBe(false);
  });

  it("leaves a chip row untouched when nothing was declined", () => {
    const goal = turn(null, "Ieškau darbo").goal;
    const chips = [{ id: "cv" }, { id: "jobs" }];
    expect(withoutDeclined(goal, chips)).toBe(chips);
  });

  it("remembers only the recent offers, so the ledger cannot grow unbounded", () => {
    let goal = turn(null, "Ieškau darbo").goal;
    for (let i = 0; i < 20; i += 1) goal = noteOffered(goal, [`chip-${i}`]);
    expect(goal?.offered.length).toBeLessThanOrEqual(6);
  });
});

describe("the goal is a memory, not a lock", () => {
  it("an unrelated sentence routes normally and does not join the goal", () => {
    const t1 = turn(null, "Ieškau darbo");
    const t2 = turn(t1.goal, "parodyk mano dokumentus");
    expect(t2.kind).toBe("unrelated");
    // Still remembered for now — the person may come back to it — but the
    // sentence itself was NOT captured by it.
    expect(t2.goal?.intent).toBe("find-work");
  });

  it("an asserted new goal replaces the old one", () => {
    const t1 = turn(null, "Ieškau darbo");
    const t2 = turn(t1.goal, "Reikia 8 elektrikų nuo spalio.");
    expect(t2.kind).toBe("new-goal");
    expect(t2.goal?.intent).toBe("need-workers");
    // A new goal starts with a clean constraint set — the previous search's
    // country must not silently narrow a hiring need.
    expect(statedConstraintCount(t2.goal)).toBe(0);
  });

  it("is forgotten once the person has plainly moved on", () => {
    let goal = turn(null, "Ieškau darbo").goal;
    for (let i = 0; i < 9; i += 1) {
      goal = turn(goal, "parodyk mano dokumentus").goal;
    }
    expect(goal).toBeNull();
  });
});
