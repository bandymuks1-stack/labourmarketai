import { describe, expect, it } from "vitest";
import { isJournalMetaRequest, journalDraftReadiness } from "./worklog-extract";
import { workerLogWorkSchema } from "./worker-schemas";
import { classifyIntent, isExplicitJournalRequest } from "./intent-router";

/**
 * A2 (production ca96605b, real-person join walk 2026-09-06): "Užpildyk
 * darbo žurnalą" opened the journal flow and, two taps later, PERSISTED
 * `journal_entries.original_text = 'Užpildyk darbo žurnalą'` — the request
 * became the evidence. The rule: a draft may persist only when it carries
 * work (a time span, a place, or a recognised activity); a sentence that
 * only names the journal is a meta request, refused at the schema floor.
 */
describe("journalDraftReadiness — the request is not the work", () => {
  it.each([
    "Užpildyk darbo žurnalą",
    "uzpildyk darbo zurnala",
    "noriu užpildyti žurnalą",
    "pildyk žurnalą",
    "atidaryk darbo žurnalą",
    "fill in my work journal",
    "open the journal",
    "открой журнал работы",
    "заполни журнал",
    "Tagebuch ausfüllen",
    "dagboek invullen",
  ])("meta request: %s", (sentence) => {
    expect(journalDraftReadiness(sentence)).toBe("meta-request");
    expect(isJournalMetaRequest(sentence)).toBe(true);
    // The router still opens the journal for it — that part was right.
    expect(classifyIntent(sentence).intent).toBe("log-work");
    expect(isExplicitJournalRequest(sentence)).toBe(true);
  });

  it.each([
    "Šiandien montavau langus",
    "dirbau nuo 8 iki 17",
    "kroviau dėžes sandėlyje",
    "objekte Kaune",
    "8 valandas",
    "installed windows today",
    "работал на объекте",
    "Sandėlio darbai",
    "Šiandien objekte Roterdame dirbau nuo 8 iki 17, 45 min. pietūs, montavau langus.",
    // a request WITH the work in it is the work
    "įrašyk į žurnalą: montavau langus nuo 8 iki 17",
  ])("work content: %s", (sentence) => {
    expect(journalDraftReadiness(sentence)).toBe("ok");
    expect(isJournalMetaRequest(sentence)).toBe(false);
  });

  it.each(["labas", "Buvau pas klientą", ""])("no content (ask): %s", (sentence) => {
    expect(journalDraftReadiness(sentence)).toBe("no-content");
    expect(isJournalMetaRequest(sentence)).toBe(false);
  });
});

describe("the log-work schema is the floor: a meta request never becomes a row", () => {
  const base = {
    engagementContextId: "6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b",
    workDate: "2026-09-06",
    siteName: null,
  };
  it("refuses the request sentence", () => {
    const r = workerLogWorkSchema.safeParse({ ...base, notes: "Užpildyk darbo žurnalą" });
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).toContain("journal_meta_request");
  });
  it("accepts real work", () => {
    expect(
      workerLogWorkSchema.safeParse({ ...base, notes: "montavau langus nuo 8 iki 17" }).success,
    ).toBe(true);
    expect(workerLogWorkSchema.safeParse({ ...base, notes: "Buvau pas klientą" }).success).toBe(true);
  });
});
