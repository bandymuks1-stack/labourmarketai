import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { EDUCATION_QUESTION_KINDS, educationQuestionKind, isEducationQuestionKind } from "@/lib/conversation/education-question";

/**
 * Window 6, lane C — prod walk 2026-09-06 on ca96605b, college staff acting
 * for E2E Walker UAB (training_provider): four questions a lecturer asks
 * about students were answered as if the OWNER were a worker. These guards
 * keep the institution's questions in the institution's family (router),
 * name which question each is (pure), and keep the answers honest copy in
 * all eleven catalogs — the privacy boundary stated, never a fabricated
 * "student skills" read.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("the router keeps a lecturer's questions about students in the institution's family", () => {
  it.each([
    "kokių įgūdžių trūksta mano studentams?",
    "kurie studentai tinka šiam darbdaviui?",
    "kur mano studentai gali atlikti praktiką?",
    "rodyk programos rezultatus",
    "kokie mano studentų rezultatai?",
    "what skills are my students missing?",
    "which students fit this employer?",
    "where can my students do an internship?",
    "show programme outcomes",
    "welche Schüler passen zu diesem Arbeitgeber?",
    "waar kunnen mijn leerlingen stage lopen?",
    "какие результаты у моих студентов?",
  ])("%s → programmes", (text) => {
    expect(classifyIntent(text).intent, text).toBe("programmes");
  });

  it("a worker's own sentences are untouched (no 'my students' → the worker's answers stay)", () => {
    expect(classifyIntent("kur galiu atlikti praktiką?").intent).not.toBe("programmes");
    expect(classifyIntent("kokių įgūdžių man trūksta?").intent).not.toBe("programmes");
    expect(classifyIntent("ką man mokytis?").intent).toBe("learning-compass");
  });
});

describe("the pure question reader names WHICH question it is", () => {
  it.each([
    ["rodyk programos rezultatus", "outcomes"],
    ["kokie mano studentų rezultatai?", "outcomes"],
    ["kokių įgūdžių trūksta mano studentams?", "students-skills"],
    ["what skills are my students missing?", "students-skills"],
    ["kurie studentai tinka šiam darbdaviui?", "students-fit"],
    ["which students fit this employer?", "students-fit"],
    ["kur mano studentai gali atlikti praktiką?", "students-practice"],
    ["waar kunnen mijn leerlingen stage lopen?", "students-practice"],
  ])("%s → %s", (text, kind) => {
    expect(educationQuestionKind(text)).toBe(kind);
  });

  it("the institution's COMMANDS are not questions (the existing modes keep working)", () => {
    for (const cmd of ["sukurk programą", "noriu pridėti studijų programą", "sukurk grupę Automechanikai 2026", "priskirk studentą grupei", "rodyk programas"]) {
      expect(educationQuestionKind(cmd), cmd).toBeNull();
    }
  });

  it("the kind guard accepts exactly the four kinds", () => {
    for (const k of EDUCATION_QUESTION_KINDS) expect(isEducationQuestionKind(k)).toBe(true);
    expect(isEducationQuestionKind("list")).toBe(false);
    expect(isEducationQuestionKind("create")).toBe(false);
  });
});

describe("the answer adapter reads only what the institution may read", () => {
  const ADAPTER = read("lib/conversation/education-answers.ts");
  it("outcomes come from the k-anonymous read; privacy questions read nothing about students", () => {
    expect(ADAPTER).toContain("readInstitutionLearnerOutcomes");
    expect(ADAPTER).toContain("OUTCOMES_K_ANONYMITY_FLOOR");
    expect(ADAPTER).not.toMatch(/from\("(workers|worker_skills|journal_entries|worker_documents)"\)/);
    expect(ADAPTER).toContain('t("eduStudentsPrivacy")');
    expect(ADAPTER).toContain('t("eduPracticeHow")');
  });
  it("the chat routes a question kind to the adapter before any programmes read", () => {
    const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
    expect(CHAT).toMatch(/const question = educationQuestionKind\(q\);\s*if \(question\) return question;/);
    expect(CHAT).toMatch(/if \(isEducationQuestionKind\(mode\)\) \{[\s\S]{0,800}loadEducationAnswerForChat\(mode\)/);
  });
});

describe("copy exists in all 11 catalogs (no [EN] debt)", () => {
  const LOCALES = ["lt", "en", "ru", "nl", "de", "da", "et", "lv", "no", "pl", "sv"];
  const KEYS = ["eduOutcomesConnected", "eduOutcomesUnavailable", "eduStudentsPrivacy", "eduPracticeHow"];
  it.each(LOCALES)("%s carries every institution-answer key as real copy", (locale) => {
    const chat = JSON.parse(read(`messages/${locale}.json`)).conversation.chat as Record<string, string>;
    for (const k of KEYS) {
      expect(typeof chat[k], `${locale}.conversation.chat.${k}`).toBe("string");
      expect(chat[k].length, `${locale}.conversation.chat.${k}`).toBeGreaterThan(3);
      expect(chat[k], `${locale}.conversation.chat.${k}`).not.toMatch(/\[EN\]/);
    }
    expect(chat.eduOutcomesConnected).toContain("{count}");
    // Doctrine §18: the word "demo" never reaches product copy.
    for (const k of KEYS) expect(chat[k].toLowerCase()).not.toContain("demo");
  });
});
