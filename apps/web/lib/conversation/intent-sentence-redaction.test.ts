import { describe, expect, it } from "vitest";

import { MAX_SENT_CHARS, redactIntentSentence, restoreIntentTokens } from "./intent-sentence-redaction";

describe("redactIntentSentence (owner decision 2026-11-22): nothing personal leaves with an unclear sentence", () => {
  it("keeps a plain goal unchanged", () => {
    expect(redactIntentSentence("noriu užpildyti darbo ataskaitas")).toEqual({ text: "noriu užpildyti darbo ataskaitas", tokens: [] });
    expect(redactIntentSentence("man reikia penkių darbuotojų")?.text).toBe("man reikia penkių darbuotojų");
  });

  it("replaces e-mails, phones, URLs, ids and long numbers with tokens", () => {
    const r = redactIntentSentence("parašyk jonas@pvz.lt arba +370 612 34567 dėl užsakymo 4485123")!;
    expect(r.text).not.toMatch(/jonas|@|612|4485123/);
    expect(r.tokens).toEqual(["jonas@pvz.lt", "+370 612 34567", "4485123"]);
  });

  it("replaces capitalised names that are not the first word", () => {
    const r = redactIntentSentence("pakviesk Joną Petraitį į projektą")!;
    expect(r.text).toBe("pakviesk [[0]] [[1]] į projektą");
    expect(restoreIntentTokens("[[0]] [[1]]", r.tokens)).toBe("Joną Petraitį");
  });

  it("does not send what cannot be cleaned safely", () => {
    expect(redactIntentSentence("x".repeat(MAX_SENT_CHARS + 1))).toBeNull();
    expect(redactIntentSentence("Jonas Petraitis, UAB Statyba, Vilnius, jonas@pvz.lt")).toBeNull();
    expect(redactIntentSentence("ok")).toBeNull();
  });

  it("keeps small quantities and the first word", () => {
    expect(redactIntentSentence("Ieškau 5 dažytojų Kaune")?.text).toBe("Ieškau 5 dažytojų [[0]]");
  });
});
