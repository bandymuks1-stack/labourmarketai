/**
 * Answer Engine — EVIDENCE + PUBLIC-QUESTION-RESEARCH guards (real modules).
 *
 * Enforces the owner doctrine for real-public-question sourcing:
 *  - question DISCOVERY signals stay separate from answer EVIDENCE sources;
 *  - a public forum is never an answer's evidence source (official/primary only);
 *  - MEDIUM/HIGH-risk answers carry ≥1 official evidence source;
 *  - evidence sources are complete (url + publisher + scope + checkedAt);
 *  - the research signal layer stores NO personal data and no long verbatim text;
 *  - the research module is editorial-only (never imported by a route/render).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { WAVE2C_ANSWERS } from "@/content/answer-engine/wave2c-answers";
import { WAVE2D_ANSWERS } from "@/content/answer-engine/wave2d-answers";
import { PUBLIC_QUESTION_SIGNALS } from "@/content/answer-engine/research/public-question-signals";
import { WAVE2D_QUESTION_SIGNALS } from "@/content/answer-engine/research/wave2d-question-signals";
import { ANSWER_QUESTIONS } from "@/lib/answer-engine/registry";

const webRoot = resolve(__dirname, "..", "..");
const registryById = new Map(ANSWER_QUESTIONS.map((q) => [q.canonicalQuestionId, q]));
// All evidence-bearing answer waves are checked by the same invariants.
const EVIDENCE_WAVES = [...WAVE2C_ANSWERS, ...WAVE2D_ANSWERS];

/** Official / primary hosts allowed as ANSWER evidence sources. */
const OFFICIAL_EVIDENCE_HOSTS = [
  "europa.eu",
  "european-union.europa.eu",
  "eures.europa.eu",
  "cedefop.europa.eu",
  "europass.europa.eu",
  "ec.europa.eu",
  "ela.europa.eu",
  "enic-naric.net",
  "oecd.org",
  "ilo.org",
];
/** Hosts that are discovery-only and must NEVER appear as an evidence source. */
const FORUM_HOSTS = ["reddit.com", "quora.com", "stackexchange.com", "stackoverflow.com", "facebook.com", "linkedin.com", "youtube.com"];

function host(url: string): string {
  return new URL(url).host.replace(/^www\./, "");
}
function isOfficial(url: string): boolean {
  const h = host(url);
  return OFFICIAL_EVIDENCE_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

describe("answer engine — evidence sources", () => {
  it("every MEDIUM/HIGH-risk answer carries at least one evidence source", () => {
    const missing: string[] = [];
    for (const a of EVIDENCE_WAVES) {
      const q = registryById.get(a.canonicalQuestionId);
      expect(q, a.canonicalQuestionId).toBeTruthy();
      if (q && (q.riskLevel === "MEDIUM" || q.riskLevel === "HIGH")) {
        if (!a.evidenceSources || a.evidenceSources.length === 0) {
          missing.push(`${a.canonicalQuestionId}/${a.locale}`);
        }
      }
    }
    expect(missing, `MEDIUM/HIGH answers without evidence: ${missing.join(", ")}`).toEqual([]);
  });

  it("every evidence source is complete (url + publisher + scope + checkedAt ISO)", () => {
    const bad: string[] = [];
    for (const a of EVIDENCE_WAVES) {
      for (const s of a.evidenceSources ?? []) {
        const okUrl = /^https:\/\//.test(s.url);
        const okDate = /^\d{4}-\d{2}-\d{2}$/.test(s.checkedAt);
        if (!okUrl || !s.publisher?.trim() || !s.scope?.trim() || !okDate || !s.title?.trim()) {
          bad.push(`${a.canonicalQuestionId}: ${s.url}`);
        }
      }
    }
    expect(bad, `incomplete evidence sources: ${bad.join(", ")}`).toEqual([]);
  });

  it("evidence sources are official/primary hosts — never a public forum", () => {
    const forumUsed: string[] = [];
    const nonOfficial: string[] = [];
    for (const a of EVIDENCE_WAVES) {
      for (const s of a.evidenceSources ?? []) {
        const h = host(s.url);
        if (FORUM_HOSTS.some((d) => h === d || h.endsWith(`.${d}`))) forumUsed.push(`${a.canonicalQuestionId}: ${h}`);
        if (!isOfficial(s.url)) nonOfficial.push(`${a.canonicalQuestionId}: ${h}`);
      }
    }
    expect(forumUsed, `forum host used as evidence: ${forumUsed.join(", ")}`).toEqual([]);
    expect(nonOfficial, `non-official evidence host: ${nonOfficial.join(", ")}`).toEqual([]);
  });

  it("Wave 2D evidence sources carry the richer source contract (sourceType + freshnessClass + supportsClaims)", () => {
    const okTypes = new Set([
      "EU_OFFICIAL",
      "NATIONAL_OFFICIAL",
      "INTERNATIONAL_ORGANIZATION",
      "PRIMARY_RESEARCH",
      "PRODUCT_DOCUMENTATION",
    ]);
    const okFresh = new Set(["evergreen", "slow-changing", "volatile"]);
    const bad: string[] = [];
    for (const a of WAVE2D_ANSWERS) {
      for (const s of a.evidenceSources ?? []) {
        if (!s.sourceType || !okTypes.has(s.sourceType)) bad.push(`${a.canonicalQuestionId}: sourceType`);
        if (!s.freshnessClass || !okFresh.has(s.freshnessClass)) bad.push(`${a.canonicalQuestionId}: freshnessClass`);
        if (!s.supportsClaims || s.supportsClaims.length === 0) bad.push(`${a.canonicalQuestionId}: supportsClaims`);
      }
    }
    expect(bad, `Wave 2D source-contract gaps: ${bad.join(", ")}`).toEqual([]);
  });

  it("every answer that makes a country claim carries a country scope", () => {
    // A country-scoped answer must set countryScope AND its evidence (if any)
    // must carry a scope. Here: the Netherlands language question.
    const nl = WAVE2C_ANSWERS.filter((a) => a.canonicalQuestionId === "AE-0321");
    expect(nl.length).toBe(5);
    for (const a of nl) expect(a.countryScope, a.locale).toBeTruthy();
  });
});

describe("answer engine — public question research (privacy + separation)", () => {
  const raw = readFileSync(resolve(webRoot, "content/answer-engine/research/public-question-signals.ts"), "utf-8");

  it("stores no personal-data fields", () => {
    // The signal shape must never carry identifying fields.
    for (const forbidden of ["username", "userName", "profileUrl", "email", "phone", "realName", "fullName", "authorName"]) {
      expect(raw.includes(`${forbidden}:`), `forbidden field ${forbidden}`).toBe(false);
    }
    for (const s of PUBLIC_QUESTION_SIGNALS) {
      const keys = Object.keys(s);
      for (const forbidden of ["username", "profileUrl", "email", "phone", "realName", "authorName"]) {
        expect(keys.includes(forbidden), `signal has ${forbidden}`).toBe(false);
      }
    }
  });

  it("normalised questions are short generalised forms, not long verbatim copies", () => {
    for (const s of PUBLIC_QUESTION_SIGNALS) {
      expect(s.normalizedQuestion.length, s.normalizedQuestion).toBeLessThanOrEqual(200);
      expect(s.normalizedQuestion.trim().length).toBeGreaterThan(0);
    }
  });

  it("each signal is either mapped to a real canonical id or has a rejection reason", () => {
    for (const s of PUBLIC_QUESTION_SIGNALS) {
      if (s.selectedCanonicalId) {
        expect(registryById.has(s.selectedCanonicalId), `unknown canonical ${s.selectedCanonicalId}`).toBe(true);
        expect(s.rejectionReason, `${s.selectedCanonicalId} selected but has rejectionReason`).toBeNull();
      } else {
        expect(s.rejectionReason?.trim(), "unselected signal needs a rejection reason").toBeTruthy();
      }
    }
  });

  it("discovery and evidence layers are separate (evidence hosts never used as a discovery-forum answer source)", () => {
    // Every selected signal's canonical id must actually be published in 2C.
    const publishedIds = new Set(WAVE2C_ANSWERS.map((a) => a.canonicalQuestionId));
    for (const s of PUBLIC_QUESTION_SIGNALS) {
      if (s.selectedCanonicalId) {
        expect(publishedIds.has(s.selectedCanonicalId), `${s.selectedCanonicalId} selected but not published`).toBe(true);
      }
    }
    // A forum discovery signal may never be promoted into an evidence source:
    // no evidence source URL equals any forum discovery URL.
    const evidenceUrls = new Set(WAVE2C_ANSWERS.flatMap((a) => (a.evidenceSources ?? []).map((s) => s.url)));
    for (const s of PUBLIC_QUESTION_SIGNALS) {
      if (s.discoverySourceType === "forum_thread" || s.discoverySourceType === "qa_site") {
        expect(evidenceUrls.has(s.discoverySourceUrl), `forum URL reused as evidence: ${s.discoverySourceUrl}`).toBe(false);
      }
    }
  });

  it("the research module is editorial-only (not imported by any route or rendered component)", () => {
    const roots = ["app", "components"].map((d) => resolve(webRoot, d));
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p);
        else if (/\.(tsx?|jsx?)$/.test(name)) {
          const src = readFileSync(p, "utf-8");
          if (src.includes("research/public-question-signals")) hits.push(p);
        }
      }
    };
    for (const r of roots) walk(r);
    expect(hits, `research signals imported by render/route: ${hits.join(", ")}`).toEqual([]);
  });
});

describe("answer engine — Wave 2D discovery signal contract", () => {
  const rawD = readFileSync(resolve(webRoot, "content/answer-engine/research/wave2d-question-signals.ts"), "utf-8");
  const VALID_STATUS = new Set([
    "SELECTED",
    "MAPPED_EXISTING",
    "DUPLICATE",
    "DEFERRED_RISK",
    "REJECTED_PRIVACY",
    "REJECTED_LOW_SIGNAL",
    "REJECTED_OUT_OF_SCOPE",
  ]);

  it("stores no personal-data fields", () => {
    // Match declared object KEYS (`key:`), not prose in the doc-comment.
    for (const forbidden of ["username", "userName", "profileUrl", "email", "phone", "realName", "fullName", "authorName"]) {
      expect(rawD.includes(`${forbidden}:`), `forbidden field ${forbidden}`).toBe(false);
    }
    for (const s of WAVE2D_QUESTION_SIGNALS) {
      const keys = Object.keys(s);
      for (const forbidden of ["username", "profileUrl", "email", "phone", "realName", "authorName"]) {
        expect(keys.includes(forbidden), `signal has ${forbidden}`).toBe(false);
      }
      expect(s.normalizedQuestion.length).toBeLessThanOrEqual(200);
      expect(s.normalizedQuestion.trim().length).toBeGreaterThan(0);
    }
  });

  it("each signal has a valid selectionStatus and a reason; mapped ids exist and are published", () => {
    const publishedIds = new Set(WAVE2D_ANSWERS.map((a) => a.canonicalQuestionId));
    for (const s of WAVE2D_QUESTION_SIGNALS) {
      expect(VALID_STATUS.has(s.selectionStatus), `bad status ${s.selectionStatus}`).toBe(true);
      expect(s.selectionReason?.trim(), "signal needs a reason").toBeTruthy();
      if (s.selectionStatus === "MAPPED_EXISTING" || s.selectionStatus === "SELECTED") {
        expect(s.canonicalQuestionId, "selected signal needs a canonical id").toBeTruthy();
        expect(registryById.has(s.canonicalQuestionId as string), `unknown canonical ${s.canonicalQuestionId}`).toBe(true);
        expect(publishedIds.has(s.canonicalQuestionId as string), `${s.canonicalQuestionId} mapped but not published`).toBe(true);
      } else {
        expect(s.canonicalQuestionId, `${s.selectionStatus} should not map to a canonical id`).toBeNull();
      }
    }
  });

  it("exactly the 15 Wave 2D questions are mapped, each once", () => {
    const mapped = WAVE2D_QUESTION_SIGNALS.filter((s) => s.selectionStatus === "MAPPED_EXISTING" || s.selectionStatus === "SELECTED").map((s) => s.canonicalQuestionId);
    expect(new Set(mapped).size, "duplicate mapping").toBe(mapped.length);
    expect(new Set(mapped).size).toBe(15);
    expect(new Set(WAVE2D_ANSWERS.map((a) => a.canonicalQuestionId)).size).toBe(15);
  });

  it("a forum/qa discovery URL is never reused as an evidence source", () => {
    const evidenceUrls = new Set(EVIDENCE_WAVES.flatMap((a) => (a.evidenceSources ?? []).map((s) => s.url)));
    for (const s of WAVE2D_QUESTION_SIGNALS) {
      if (s.sourceType === "forum_thread" || s.sourceType === "qa_site") {
        expect(evidenceUrls.has(s.sourceUrl), `forum URL reused as evidence: ${s.sourceUrl}`).toBe(false);
      }
    }
  });

  it("the Wave 2D research module is editorial-only (not imported by any route or component)", () => {
    const roots = ["app", "components"].map((d) => resolve(webRoot, d));
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p);
        else if (/\.(tsx?|jsx?)$/.test(name)) {
          if (readFileSync(p, "utf-8").includes("research/wave2d-question-signals")) hits.push(p);
        }
      }
    };
    for (const r of roots) walk(r);
    expect(hits, `wave2d signals imported by render/route: ${hits.join(", ")}`).toEqual([]);
  });
});
