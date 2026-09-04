import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyIntent } from "@/lib/conversation/intent-router";
import type { RequirementRow, WorkerDocumentRow } from "@/lib/documents/readiness";
import { deriveDocumentGap } from "./documents-gap";

/**
 * Owner Master Execution Contract 2026-09-04 §12 / §16 — documents are
 * first-class in the conversation, and a gap answer continues to the
 * closing step. Before this slice "what documents am I missing?" answered
 * with a route chip and "what am I missing?" talked about skills only.
 */

const NOW = new Date("2026-09-04T00:00:00.000Z");

const doc = (over: Partial<WorkerDocumentRow>): WorkerDocumentRow => ({
  id: "d",
  documentTypeSlug: "id_document",
  country: null,
  storedStatus: "ready",
  validFrom: null,
  validUntil: null,
  note: null,
  ...over,
});

const req = (over: Partial<RequirementRow>): RequirementRow => ({
  country: "NL",
  documentTypeSlug: "a1_certificate",
  requirementLevel: "required",
  conditionNote: null,
  sourceStatus: "sourced",
  sourceUrl: "https://example.invalid/a1",
  sourceTitle: "SVB (A1)",
  confidence: "official",
  ...over,
});

describe("deriveDocumentGap — have / expiring / missing for the countries the person named", () => {
  const documents = [
    doc({ id: "1", documentTypeSlug: "id_document" }),
    doc({ id: "2", documentTypeSlug: "health_safety_card", validUntil: "2026-09-20" }),
    doc({ id: "3", documentTypeSlug: "employment_contract", validUntil: "2026-01-01" }), // expired
    doc({ id: "4", documentTypeSlug: "tax_registration", storedStatus: "missing" }),
  ];
  const requirements = [
    req({ documentTypeSlug: "a1_certificate" }),
    req({ documentTypeSlug: "id_document" }),
    req({ documentTypeSlug: "professional_certificate", requirementLevel: "recommended" }),
    req({ country: "DE", documentTypeSlug: "posting_notification", sourceTitle: null, sourceUrl: null }),
  ];

  it("counts what is ready, what expires within 30 days, and what is required but absent", () => {
    const gap = deriveDocumentGap(documents, requirements, ["NL"], NOW);
    expect(gap.ready).toBe(1); // the id document; the expired one is not "ready", the missing one never was
    expect(gap.expiring.map((e) => e.documentTypeSlug)).toEqual(["health_safety_card"]);
    expect(gap.missing.map((m) => m.documentTypeSlug)).toEqual(["a1_certificate"]);
    expect(gap.countriesKnown).toEqual(["NL"]);
  });

  it("carries WHO CAN ISSUE when the requirement source is known, and null when it is not", () => {
    const gap = deriveDocumentGap(documents, requirements, ["NL", "DE"], NOW);
    const a1 = gap.missing.find((m) => m.documentTypeSlug === "a1_certificate");
    const de = gap.missing.find((m) => m.country === "DE");
    expect(a1?.sourceTitle).toBe("SVB (A1)");
    expect(de?.sourceTitle).toBeNull();
  });

  it("a recommended document is never reported as missing; an unknown country is named, not guessed", () => {
    const gap = deriveDocumentGap(documents, requirements, ["NL", "FR"], NOW);
    expect(gap.missing.some((m) => m.documentTypeSlug === "professional_certificate")).toBe(false);
    expect(gap.countriesUnknown).toEqual(["FR"]);
    expect(gap.countriesKnown).toEqual(["NL"]);
  });

  it("no stated country → no missing list (the answer must ask), but the inventory still counts", () => {
    const gap = deriveDocumentGap(documents, requirements, [], NOW);
    expect(gap.missing).toEqual([]);
    expect(gap.countriesKnown).toEqual([]);
    expect(gap.ready).toBe(1);
    expect(gap.expiring.length).toBe(1);
  });
});

describe("the sentences reach the answer", () => {
  it("'what am I missing?' (bare) routes to the gap answer in five locales", () => {
    for (const text of ["Ko man trūksta?", "What am I missing?", "Чего мне не хватает?", "Was fehlt mir?", "Wat mis ik?"]) {
      expect(classifyIntent(text).intent, text).toBe("skill-gap");
    }
  });

  it("expiry / permit questions are document questions", () => {
    for (const text of [
      "kas baigia galioti?",
      "which of my documents expire soon?",
      "у меня истекает срок действия",
      "welke documenten verlopen binnenkort",
      "ar man reikia A1 pažymos Nyderlandams",
    ]) {
      expect(classifyIntent(text).intent, text).toBe("documents");
    }
  });

  it("a person's documents are ANSWERED in the chat; a company keeps its route", () => {
    const CHAT = readFileSync(
      join(__dirname, "..", "..", "components", "app", "conversation", "chat", "conversation-chat.tsx"),
      "utf8",
    );
    expect(CHAT).toMatch(/identity === "person"\s*\?\s*runWorkflow\(\(\) => runDocumentsReadiness\(\)\)/);
    const WF = readFileSync(join(__dirname, "..", "ai-workspace", "workflows.ts"), "utf8");
    const USE_CASE = readFileSync(join(__dirname, "documents-gap-server.ts"), "utf8");
    // The workflow layer enters ONE canonical use case (W4: no query here);
    // the use case reads the same document centre the documents page renders.
    expect(WF).toMatch(/loadWorkerDocumentGap\(\)/);
    expect(USE_CASE).toMatch(/getWorkerDocumentCentre\(\)/);
    expect(USE_CASE).toMatch(/deriveDocumentGap\(/);
    // The skill-gap answer continues to the document gap (§16) and names the
    // closing step; the route itself is emitted by the chat, never here.
    expect(WF).toMatch(/readDocumentGapForAnswer\(\)/);
    expect(WF).toMatch(/id: "documents-centre", label: t\("chipDocuments"\)/);
    expect(CHAT).toMatch(/case "documents-centre":/);
  });

  it("every answer key exists in all 11 catalogs", () => {
    const APP = join(__dirname, "..", "..");
    const keys = [
      "docsGapTail", "chipDocuments", "docsBlocked", "whyDocsBlocked", "docsIntro", "docsExpiringLine",
      "docsMissingLine", "docsMissingLineWithSource", "docsNoCountry", "docsAllGood", "docsCountryUnknown",
      "whyDocs", "whyDocsNoCountry", "chipWhereToWork",
    ];
    for (const locale of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const ai = JSON.parse(readFileSync(join(APP, "messages", `${locale}.json`), "utf8")).workspace.ai as Record<string, string>;
      for (const key of keys) {
        expect(ai[key], `${locale}.${key}`).toBeTypeOf("string");
        expect(ai[key], `${locale}.${key}`).not.toMatch(/^\[EN\]/);
      }
    }
  });
});
