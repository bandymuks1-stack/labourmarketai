import { describe, expect, it } from "vitest";

import { MAX_SENT_CHARS, redactIntentSentence, restoreIntentTokens } from "./intent-sentence-redaction";

const sent = (s: string) => redactIntentSentence(s)?.text ?? null;

describe("redactIntentSentence (owner decision 2026-11-22): an allow-list, fail closed", () => {
  it.each([
    "noriu užpildyti darbo ataskaitas",
    "Man reikia penkių darbuotojų",
    "Užpildyk vakarykštį darbo žurnalą",
    "Ieškau subrangovų",
    "Noriu pasiūlyti savo komandą",
    "Surask kandidatus",
    "Padėk susisiekti",
    "I want to fill in my work report",
    "мне нужно пять работников",
    "хочу заполнить журнал работ",
  ])("an action sentence leaves unchanged: %s", (s) => {
    expect(sent(s)).toBe(s);
  });

  it.each([
    // R2 review of #3583: lower-case names, first words, health, addresses, credentials
    "john smith is sick with covid, mark him absent",
    "иван петров заболел, отметь отсутствие",
    "Tomas sako kad sergu vėžiu, reikia nedarbingumo",
    "address: gedimino pr. 9-12, vilnius, update it",
    "my password is hunter2 please log me in",
    "Jonas Petraitis, UAB Statyba, Vilnius, jonas@pvz.lt",
    "x".repeat(MAX_SENT_CHARS + 1),
    "ok",
  ])("is NOT sent: %s", (s) => {
    expect(redactIntentSentence(s)).toBeNull();
  });

  it.each([
    ["noriu išsiųsti žinutę jonui petraičiui", ["jonui", "petraičiui"]],
    ["Smith needs leave next week", ["Smith", "next"]],
    ["Иванов просит отпуск", ["Иванов", "просит"]],
    ["Jonas Petraitis nori atostogų", ["Jonas", "Petraitis"]],
    ["parašyk Jonui Petraičiui", ["Jonui", "Petraičiui"]],
    ["pakviesk Mantą į projektą", ["Mantą"]],
  ])("names (any case, first word too) never leave: %s", (s, hidden) => {
    const r = redactIntentSentence(s as string);
    if (r === null) return; // failing closed is also acceptable
    for (const h of hidden as string[]) expect(r.text).not.toContain(h);
    for (const h of hidden as string[]) expect(r.tokens).toContain(h);
  });

  it("contacts and long numbers become tokens and come back only locally", () => {
    const r = redactIntentSentence("parašyk jonas@pvz.lt dėl užsakymo")!;
    expect(r.text).toBe("parašyk [[0]] dėl užsakymo");
    expect(restoreIntentTokens("[[0]]", r.tokens)).toBe("jonas@pvz.lt");
    expect(redactIntentSentence("užsakymo 4485123 būsena")?.text).toBe("užsakymo [[0]] būsena");
  });

  it("keeps small quantities", () => {
    expect(sent("reikia 5 darbuotojų")).toBe("reikia 5 darbuotojų");
  });
});
