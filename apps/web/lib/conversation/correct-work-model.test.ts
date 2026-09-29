import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { correctionHref, readCorrectionAsk } from "@/lib/conversation/correct-work-model";
import { applySpokenHoursCorrection, worklogDraftFromEvidence } from "@/lib/conversation/evidence-to-worklog";

/**
 * A correction said in words (2026-09-29): walked on production, "Ne 5, o 6
 * valandas." after a saved entry opened a SECOND 6 h entry. It now routes to
 * `correct-work`, which names the newest entry and opens the canonical
 * supersede editor — the sentence writes nothing.
 */
describe("correct-work", () => {
  it("routes corrections, and keeps real work statements as log-work", () => {
    expect(classifyIntent("Ne 5, o 6 valandas.").intent).toBe("correct-work");
    expect(classifyIntent("Pataisyk šiandienos įrašą: ne 5, o 6 valandos.").intent).toBe("correct-work");
    expect(classifyIntent("Tai buvo vakar.").intent).toBe("correct-work");
    expect(classifyIntent("Šiandien 5 valandas betonavau pamatus.").intent).toBe("log-work");
    expect(classifyIntent("Vakar dirbau 6 valandas.").intent).toBe("log-work");
    expect(classifyIntent("Ne tik betonavau, o ir armavau 6 val.").intent).toBe("log-work");
  });

  it("reads what the person asked to change, nothing more", () => {
    expect(readCorrectionAsk("Ne 5, o 6 valandas.")).toEqual({ kind: "hours", from: 5, to: 6 });
    expect(readCorrectionAsk("not 7.5 but 8 hours")).toEqual({ kind: "hours", from: 7.5, to: 8 });
    expect(readCorrectionAsk("Tai buvo vakar.")).toEqual({ kind: "day", day: "yesterday" });
    expect(readCorrectionAsk("Tai buvo užvakar")).toEqual({ kind: "day", day: "day-before" });
    expect(readCorrectionAsk("Pataisyk įrašą")).toEqual({ kind: "unspecified" });
    // NEGATIVE: an impossible day length is not repeated back as a fact
    expect(readCorrectionAsk("ne 5, o 60")).toEqual({ kind: "unspecified" });
  });

  it("the edit door is the journal page's own supersede editor", () => {
    expect(correctionHref("abc")).toBe("/dashboard/journal?editing=abc#journal-composer");
  });
});


describe("a spoken hours correction inside an open work log", () => {
  const said = ["Šiandien 5 valandas betonavau pamatus.", "Ne 5, o 6 valandas."];

  it("replaces the corrected figure instead of adding a second activity", () => {
    const fixed = applySpokenHoursCorrection(said);
    expect(fixed.applied).toBe(true);
    expect(fixed.said).toEqual(["Šiandien 6 valandas betonavau pamatus."]);
    const draft = worklogDraftFromEvidence({ said, evidence: null, today: "2026-09-29" });
    expect(draft.workedMinutes).toBe(360);
    expect(draft.notes).not.toMatch(/Ne 5/);
  });

  it("NEGATIVE: a figure that was never said leaves the sentences untouched", () => {
    const other = ["Šiandien 7 valandas betonavau.", "Ne 5, o 6 valandas."];
    expect(applySpokenHoursCorrection(other)).toMatchObject({ applied: false, said: other });
    expect(applySpokenHoursCorrection(["Šiandien 5 valandas betonavau."])).toMatchObject({ applied: false });
  });
});
