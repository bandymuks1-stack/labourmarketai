import { describe, expect, it } from "vitest";

import {
  advanceGoal,
  emptyGoal,
  EVIDENCE_BEARING_INTENTS,
  GOAL_BEARING_INTENTS,
  type ConversationGoal,
} from "./conversation-goal";
import {
  answerDimension,
  emptyEvidenceDraft,
  evidenceFromSuggestions,
  isSaveableEvidence,
  MAX_EVIDENCE_QUESTIONS,
  mergeEvidenceDraft,
  nextEvidenceQuestion,
  noteAsked,
  readRole,
  type WorkEvidenceDraft,
} from "./evidence-goal";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";

/** One turn, the way the dispatcher would drive it: read the sentence with the
 *  EXISTING journal recognizer, then fold it into the goal. */
function turn(
  goal: ConversationGoal | null,
  text: string,
  kind: "new-goal" | "follow-up" | "correction" = "follow-up",
): ConversationGoal {
  const s = extractJournalSuggestions(text);
  const { stated, derived } = evidenceFromSuggestions(s, text);
  const next = advanceGoal({
    goal,
    kind,
    routedIntent: "log-work",
    text,
    evidence: { stated, derived },
  });
  expect(next, "the goal must survive a fact-carrying turn").not.toBeNull();
  return next as ConversationGoal;
}

/** The system asks, the person answers — the two halves of one exchange. */
function ask(goal: ConversationGoal): ConversationGoal {
  const d = nextEvidenceQuestion(goal.evidence as WorkEvidenceDraft);
  expect(d, "a question was expected here").not.toBeNull();
  return { ...goal, evidence: noteAsked(goal.evidence as WorkEvidenceDraft, d!) };
}

function answer(goal: ConversationGoal, text: string): ConversationGoal {
  const asked = (goal.evidence as WorkEvidenceDraft).asked;
  const dimension = asked[asked.length - 1];
  const withAnswer = answerDimension(goal.evidence as WorkEvidenceDraft, dimension, text);
  const next = advanceGoal({
    goal: { ...goal, evidence: withAnswer },
    kind: "follow-up",
    routedIntent: "log-work",
    text,
  });
  return next as ConversationGoal;
}

describe("work-logging is a goal-bearing intent", () => {
  it("log-work carries a goal, and its memory is evidence-shaped", () => {
    expect(GOAL_BEARING_INTENTS.has("log-work")).toBe(true);
    expect(EVIDENCE_BEARING_INTENTS.has("log-work")).toBe(true);
    expect(emptyGoal("log-work").evidence).not.toBeNull();
  });

  it("a DISCOVERY goal gets no evidence payload, and never grows one", () => {
    // The whole point of the split: find-work accumulates search constraints,
    // log-work accumulates an account of work, and neither can become the
    // other by passing the wrong argument.
    const g = advanceGoal({
      goal: null,
      kind: "new-goal",
      routedIntent: "find-work",
      text: "Ieškau darbo Norvegijoje",
      evidence: { stated: { object: "sienas" } },
    });
    expect(g?.evidence).toBeNull();
  });

  it("an EVIDENCE goal never writes into the discovery filters", () => {
    const g = turn(null, "Šiandien 8 valandas montavau PERI sienų klojinius.", "new-goal");
    // Every discovery dimension must still be untouched: work is not a search.
    expect(g.filters.profession).toBeNull();
    expect(g.filters.country).toBeNull();
    expect(g.filters.tool).toBeNull();
    expect(g.filters.start).toBeNull();
  });
});

describe("the addendum's journey — three turns, ONE evidence context", () => {
  it("montavau PERI klojinius → Sienas. → pats montavau", () => {
    // TURN 1 — the person writes naturally. No template, no keywords.
    let g = turn(null, "Šiandien 8 valandas montavau PERI sienų klojinius.", "new-goal");
    const e1 = g.evidence as WorkEvidenceDraft;
    expect(e1.stated.activity).toContain("montavau");
    expect(e1.stated.durationHours).toBe(8);

    // The system asks the one thing that disambiguates the competency.
    expect(nextEvidenceQuestion(e1)).toBe("object");
    g = ask(g);

    // TURN 2 — a one-word answer, meaningless alone, unambiguous in context.
    g = answer(g, "Sienas.");
    const e2 = g.evidence as WorkEvidenceDraft;
    expect(e2.stated.object).toBe("Sienas.");
    // ONE context: the duration from turn 1 survived turn 2.
    expect(e2.stated.durationHours).toBe(8);
    expect(e2.stated.activity).toContain("montavau");

    // TURN 3 — now that we know what, ask how they stood in it.
    expect(nextEvidenceQuestion(e2)).toBe("role");
    g = ask(g);
    g = answer(g, "Pats montavau pagal brėžinius.");
    const e3 = g.evidence as WorkEvidenceDraft;
    expect(e3.stated.role).toBe("performed");

    // Everything still in ONE draft, and every raw sentence preserved.
    expect(e3.stated.durationHours).toBe(8);
    expect(e3.stated.object).toBe("Sienas.");
    expect(g.said.length).toBeGreaterThanOrEqual(3);
    expect(g.said[0]).toContain("PERI");

    // And it stops: two questions asked, no third.
    expect(nextEvidenceQuestion(e3)).toBeNull();
    expect(e3.asked).toHaveLength(MAX_EVIDENCE_QUESTIONS);
  });

  it("assisting is preserved as a DIFFERENT claim, never upgraded", () => {
    // "I mostly helped the brigade" must not become "I install formwork".
    let g = turn(null, "Montavau klojinius.", "new-goal");
    g = ask(g);
    g = answer(g, "Sienas.");
    g = ask(g);
    g = answer(g, "Daugiausia padėjau brigadai.");
    expect((g.evidence as WorkEvidenceDraft).stated.role).toBe("assisted");
  });

  it("an unreadable role answer stays NULL rather than being guessed", () => {
    expect(readRole("nežinau")).toBeNull();
    expect(readRole("")).toBeNull();
  });
});

describe("the next question depends on the WORK, not on a trade list", () => {
  const first = (text: string) => {
    const s = extractJournalSuggestions(text);
    const { stated, derived } = evidenceFromSuggestions(s, text);
    return nextEvidenceQuestion(mergeEvidenceDraft(emptyEvidenceDraft(), stated, derived));
  };

  it("construction — nothing but an activity, so ask what it was done to", () => {
    expect(first("Šiandien montavau PERI klojinius.")).toBe("object");
  });

  it("warehouse — a quantity is already stated, so duration is NOT asked", () => {
    // "Surinkau 128 užsakymus" anchors the work by count. Asking how long as
    // well would be arithmetic, not conversation.
    const s = extractJournalSuggestions("Surinkau 128 užsakymus.");
    const { stated, derived } = evidenceFromSuggestions(s, "Surinkau 128 užsakymus.");
    let d = mergeEvidenceDraft(emptyEvidenceDraft(), stated, derived);
    d = answerDimension(noteAsked(d, "object"), "object", "Užsakymus.");
    d = answerDimension(noteAsked(d, "role"), "role", "Pats surinkau.");
    expect(nextEvidenceQuestion(d)).toBeNull();
  });

  it("automotive — a materially different occupation gets the same first question", () => {
    expect(first("Keičiau stabdžių diskus ir kaladėles.")).toBe("object");
  });

  it("hospitality — and so does a fourth, unrelated one", () => {
    expect(first("Paruošiau pietus virtuvėje.")).toBe("object");
  });

  it("healthcare — a fifth, far from construction", () => {
    expect(first("Slaugiau pacientus palatoje.")).toBe("object");
  });

  it("no question names a trade, a system or a manufacturer", () => {
    // The dimensions are generic on purpose. If this ever fails, the model has
    // become construction-shaped — or PERI-shaped — which is the failure the
    // addendum §23 names.
    for (const text of [
      "Šiandien montavau PERI klojinius.",
      "Surinkau 128 užsakymus.",
      "Keičiau stabdžių diskus ir kaladėles.",
      "Paruošiau pietus virtuvėje.",
    ]) {
      const d = first(text);
      expect(["object", "role", "duration", "quantity", "context", null]).toContain(d);
    }
  });
});

describe("stated, derived and raw stay three different things", () => {
  it("what the recognizer read never lands in what the person stated", () => {
    const text = "Klojau laminatą ir parketą.";
    const s = extractJournalSuggestions(text);
    const { stated, derived } = evidenceFromSuggestions(s, text);
    const draft = mergeEvidenceDraft(emptyEvidenceDraft(), stated, derived);
    // The recognizer's slugs are DERIVED and live only there.
    expect(Object.keys(draft.stated)).not.toContain("skillSlugs");
    expect(JSON.stringify(draft.stated)).not.toContain("flooring");
    // The person's own words are kept verbatim, never rewritten to canon.
    expect(draft.stated.activity).toBe(text);
  });

  it("a correction supersedes without erasing the sentence that carried it", () => {
    let g = turn(null, "Montavau klojinius.", "new-goal");
    g = ask(g);
    g = answer(g, "Sienas.");
    // The person corrects themselves.
    const corrected = answerDimension(g.evidence as WorkEvidenceDraft, "object", "Ne, perdangas.");
    expect(corrected.stated.object).toBe("Ne, perdangas.");
    // The original sentence is still in the raw ledger.
    expect(g.said.join(" ")).toContain("Sienas.");
  });

  it("nothing here confirms anything — a draft is not a competency", () => {
    const draft = emptyEvidenceDraft();
    const keys = JSON.stringify(draft).toLowerCase();
    for (const forbidden of ["confirmed", "verified", "qualified", "score"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe("one honest sentence is already evidence", () => {
  it("an activity alone is saveable — no form to complete first", () => {
    const s = extractJournalSuggestions("Dirbau virtuvėje.");
    const { stated, derived } = evidenceFromSuggestions(s, "Dirbau virtuvėje.");
    expect(isSaveableEvidence(mergeEvidenceDraft(emptyEvidenceDraft(), stated, derived))).toBe(true);
  });

  it("an empty draft is not", () => {
    expect(isSaveableEvidence(emptyEvidenceDraft())).toBe(false);
  });
});
