import { describe, expect, it } from "vitest";
import { isJournalMetaRequest, journalDraftReadiness } from "./worklog-extract";
import { logWorkNotesRefusal, workerLogWorkSchema } from "./worker-schemas";
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

/**
 * THE FORM IS NEVER STRICTER THAN THE SERVER (owner P0 2026-09-23, CASE 8).
 *
 * The two describes above documented a contradiction: "Buvau pas klientą" is
 * `no-content` to the recogniser (the form refused it with a red line) while
 * the schema accepted it. The work-log form now refuses through
 * `logWorkNotesRefusal` — the schema's own notes rule — so for every sentence
 * the form refuses ⇔ the write refuses.
 */
describe("parity: the work-log form refuses ⇔ workerLogWorkSchema refuses", () => {
  const base = {
    engagementContextId: "6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b",
    workDate: "2026-09-23",
    siteName: null,
  };
  const schemaRefuses = (notes: string) =>
    !workerLogWorkSchema.safeParse({ ...base, notes }).success;
  const formRefuses = (notes: string) => logWorkNotesRefusal(notes) !== null;

  const TABLE: ReadonlyArray<readonly [string, "accepts" | "refuses"]> = [
    // No recognised work signal — the server takes them, so the form must too.
    ["Buvau pas klientą", "accepts"],
    ["Buvau objekte", "accepts"],
    ["Rašau kodą", "accepts"],
    ["Darbas biure", "accepts"],
    ["Dirbu prie projekto", "accepts"],
    ["Susitikimas su klientu", "accepts"],
    ["Kodo peržiūra", "accepts"],
    ["Remontas", "accepts"],
    ["labas", "accepts"],
    ["Met the client", "accepts"],
    // Real work, recognised.
    ["montavau langus nuo 8 iki 17", "accepts"],
    ["Šiandien objekte Kaune dirbau 8 valandas", "accepts"],
    ["installed windows today", "accepts"],
    // A request with the work inside it IS the work.
    ["įrašyk į žurnalą: montavau langus nuo 8 iki 17", "accepts"],
    // A META REQUEST never becomes the record — on either layer (A2).
    ["Užpildyk darbo žurnalą", "refuses"],
    ["fill in my work journal", "refuses"],
    ["заполни журнал", "refuses"],
    // The length floor and ceiling.
    ["ab", "refuses"],
    ["   ", "refuses"],
    ["", "refuses"],
    ["x".repeat(4001), "refuses"],
  ];

  it.each(TABLE)("%s → %s on both layers", (notes, expected) => {
    expect(formRefuses(notes), "form").toBe(expected === "refuses");
    expect(schemaRefuses(notes), "schema").toBe(expected === "refuses");
    expect(formRefuses(notes)).toBe(schemaRefuses(notes));
  });

  it("names WHICH floor refused, so the form can say it plainly", () => {
    expect(logWorkNotesRefusal("ab")).toBe("too-short");
    expect(logWorkNotesRefusal("x".repeat(4001))).toBe("too-long");
    expect(logWorkNotesRefusal("Užpildyk darbo žurnalą")).toBe("meta-request");
    expect(logWorkNotesRefusal("Buvau pas klientą")).toBeNull();
  });

  it("NEGATIVE CONTROL: the old client-only gate disagreed with the server", () => {
    // The rule the form used to apply. If this ever stops disagreeing, the
    // parity table above has stopped proving anything about the change.
    const oldFormRefuses = (notes: string) =>
      notes.trim().length < 3 || journalDraftReadiness(notes) !== "ok";
    const disagreements = TABLE.filter(([n]) => oldFormRefuses(n) !== schemaRefuses(n));
    expect(disagreements.map(([n]) => n)).toEqual(
      expect.arrayContaining(["Buvau pas klientą", "Buvau objekte", "Rašau kodą", "Darbas biure"]),
    );
  });
});
