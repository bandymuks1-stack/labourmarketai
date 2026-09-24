import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { classifyIntent } from "./intent-router";

/**
 * The router's patterns carry no `i` flag (2026-09-24): `fold` lower-cases the
 * query and every pattern source alike, so case can never change a route, and
 * the flag only cost V8 a case-folding closure per Unicode class (≈ 2.8 s of
 * warm-up per fresh process; CI's intent suites timed out on it).
 */
describe("case never changes a route — the query is folded before any pattern runs", () => {
  const SENTENCES = [
    "Invite a learner",
    "Pakviesk studentą",
    "Пригласить студента",
    "Schüler einladen",
    "Leerling uitnodigen",
    "Move John to project Riga",
    "Perkelk Joną į projektą Vilnius",
    "Ieškau darbo Vilniuje",
    "Užpildyk darbo žurnalą",
    "Show my projects",
  ];

  it.each(SENTENCES)("%s", (sentence) => {
    const lower = classifyIntent(sentence.toLowerCase());
    expect(classifyIntent(sentence.toUpperCase()).intent).toBe(lower.intent);
    expect(classifyIntent(sentence).intent).toBe(lower.intent);
  });

  it("patterns are built from the folded source with the `u` flag only", () => {
    const src = readFileSync(path.join(__dirname, "intent-router.ts"), "utf8");
    expect(src).toContain('return { re: new RegExp(fold(source).replace(/\\\\b/g, UB), "u"), weight };');
    // NEGATIVE CONTROL: the query side is folded too — without it, dropping
    // `i` would change routes for capitalised sentences.
    expect(src).toMatch(/export function classifyIntent\(text: string\): IntentMatch \{[\s\S]{0,400}const q = fold\(text \?\? ""\);/);
  });
});
