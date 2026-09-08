import { describe, expect, it } from "vitest";

import {
  answerDimension,
  emptyEvidenceDraft,
  evidenceFromSuggestions,
  mergeEvidenceDraft,
  noteAsked,
} from "./evidence-goal";
import {
  composeEvidenceText,
  evidenceAddsToDraft,
  worklogDraftFromEvidence,
} from "./evidence-to-worklog";
import { extractWorkLog } from "./worklog-extract";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";

const TODAY = "2026-09-08";

/** Build the draft the conversation would have accumulated. */
function conversation(first: string, answers: Array<[Parameters<typeof answerDimension>[1], string]>) {
  const s = extractJournalSuggestions(first);
  const { stated, derived } = evidenceFromSuggestions(s, first);
  let draft = mergeEvidenceDraft(emptyEvidenceDraft(), stated, derived);
  const said = [first];
  for (const [dimension, text] of answers) {
    draft = answerDimension(noteAsked(draft, dimension), dimension, text);
    said.push(text);
  }
  return { draft, said };
}

describe("nothing said in chat has to be said again", () => {
  it("every sentence the person wrote becomes the evidence text, in order", () => {
    const { draft, said } = conversation("Šiandien 8 valandas montavau PERI sienų klojinius.", [
      ["object", "Sienas."],
      ["role", "Pats montavau pagal brėžinius."],
    ]);
    const out = worklogDraftFromEvidence({ said, evidence: draft, today: TODAY });

    // `notes` is saved verbatim as original_text — it must carry ALL of it.
    expect(out.notes).toContain("PERI");
    expect(out.notes).toContain("Sienas.");
    expect(out.notes).toContain("brėžinius");
  });

  it("the duration stated in turn one survives into the form", () => {
    const { draft, said } = conversation("Šiandien 8 valandas montavau klojinius.", [
      ["object", "Sienas."],
    ]);
    const out = worklogDraftFromEvidence({ said, evidence: draft, today: TODAY });
    expect(out.workedMinutes).toBe(8 * 60);
    expect(out.hoursLabel).toContain("8");
  });

  it("a site NAMED in conversation wins over one guessed from a sentence", () => {
    const { draft, said } = conversation("Montavau klojinius.", [
      ["object", "Sienas."],
      ["context", "Objektas Vilniuje, UAB Statyba."],
    ]);
    const out = worklogDraftFromEvidence({ said, evidence: draft, today: TODAY });
    expect(out.site).toBe("Objektas Vilniuje, UAB Statyba.");
  });

  it("an explicit span is NOT overwritten by a rounded hours answer", () => {
    // "nuo 8 iki 17" is the richer fact. A later "8" must not flatten it.
    const first = "Dirbau nuo 8 iki 17, montavau klojinius.";
    const { draft, said } = conversation(first, [["duration", "8"]]);
    const base = extractWorkLog(first, TODAY);
    const out = worklogDraftFromEvidence({ said, evidence: draft, today: TODAY });
    expect(base.workedMinutes).not.toBeNull();
    expect(out.workedMinutes).toBe(base.workedMinutes);
  });
});

describe("the anti-loop the form was built for is preserved", () => {
  it("a conversation that produced an activity always opens the form", () => {
    // hasSignal decides open-the-form vs ask-again. After the person has
    // answered a question, sending them back to it is the exact loop that made
    // the journal unfillable for a real tester.
    const { draft, said } = conversation("Dirbau virtuvėje.", [["object", "Pietus."]]);
    const out = worklogDraftFromEvidence({ said, evidence: draft, today: TODAY });
    expect(out.hasSignal).toBe(true);
  });

  it("it never LOWERS a signal the sentence already had", () => {
    const first = "Šiandien nuo 8 iki 17 dirbau.";
    const base = extractWorkLog(first, TODAY);
    const out = worklogDraftFromEvidence({
      said: [first],
      evidence: emptyEvidenceDraft(),
      today: TODAY,
    });
    expect(base.hasSignal).toBe(true);
    expect(out.hasSignal).toBe(true);
  });
});

describe("no second save path, and no behaviour change without a conversation", () => {
  it("with no evidence context it is byte-for-byte the existing extractor", () => {
    // This is what makes the bridge safe in front of every caller: a chip, the
    // journal hand-off and a plain sentence all behave exactly as before.
    const text = "Šiandien 8 valandas montavau klojinius objekte Vilniuje.";
    expect(worklogDraftFromEvidence({ said: [text], evidence: null, today: TODAY })).toEqual(
      extractWorkLog(text, TODAY),
    );
  });

  it("the draft it produces is the SAME shape the flow already consumes", () => {
    const { draft, said } = conversation("Montavau klojinius.", [["object", "Sienas."]]);
    const out = worklogDraftFromEvidence({ said, evidence: draft, today: TODAY });
    const reference = extractWorkLog("Montavau klojinius.", TODAY);
    expect(Object.keys(out).sort()).toEqual(Object.keys(reference).sort());
  });
});

describe("composeEvidenceText", () => {
  it("keeps order and drops a repeated sentence", () => {
    expect(composeEvidenceText(["A.", "A.", "B."])).toBe("A. B.");
  });

  it("appends the latest only when it is not already the last thing said", () => {
    expect(composeEvidenceText(["A."], "B.")).toBe("A. B.");
    expect(composeEvidenceText(["A.", "B."], "B.")).toBe("A. B.");
  });

  it("an empty conversation composes to an empty text, not to whitespace", () => {
    expect(composeEvidenceText([], "")).toBe("");
    expect(composeEvidenceText(["   "])).toBe("");
  });
});

describe("evidenceAddsToDraft", () => {
  it("says no when the conversation added nothing the sentence lacked", () => {
    const text = "Šiandien 8 valandas dirbau objekte Vilniuje.";
    const base = extractWorkLog(text, TODAY);
    expect(evidenceAddsToDraft(emptyEvidenceDraft(), base)).toBe(false);
    expect(evidenceAddsToDraft(null, base)).toBe(false);
  });

  it("says yes once the person has answered a question", () => {
    const { draft } = conversation("Montavau klojinius.", [["object", "Sienas."]]);
    expect(evidenceAddsToDraft(draft, extractWorkLog("Montavau klojinius.", TODAY))).toBe(true);
  });
});
