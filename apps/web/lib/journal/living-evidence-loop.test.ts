import { describe, expect, it } from "vitest";

import { deriveJournalRecognition } from "@/lib/journal/journal-recognition";
import { reconcileWorkerSkillSources } from "@/lib/journal/skill-source";
import { deriveEvidenceTier } from "@/lib/evidence/evidence-tier";
import { deriveProvenance, provenanceTextKey } from "@/lib/evidence/provenance";
import { deriveNeedSkills } from "@/lib/market/need-skills";
import { matchWorkerToNeed, type MatchSubject } from "@/lib/market/match-v1";

/**
 * LIVING EVIDENCE LOOP — the pure composition the production walk proved on
 * 2026-09-06 (docs/launch/pilot-feedback/walks-2026-09-06/walk-living-evidence-loop):
 *
 *   person writes what they did  →  recogniser reads the skill
 *   →  the pipeline ADDS a worker_skills row (self_declared) and LINKS it
 *   →  the reconcile lifts the row to work_journal (never verified)
 *   →  BOTH matching consumers read the tier ladder from that row
 *   →  the employer's own need ("Suvirintojas") ranks the person STRONG
 *   →  a company confirm flips the row to manager_confirmed
 *   →  the match reads "confirmed", provenance reads "patvirtino <org>".
 *
 * On production the same sentence took worker2 from "PER MAŽAI DUOMENŲ · 0 %"
 * to "STIPRUS ATITIKIMAS · 100 %" on the company's candidates result, and the
 * one-tap confirm to "Vadovo patvirtinti įgūdžiai 1". Every module below is
 * pure; the DB steps between them are the ones the walk exercised for real.
 * If any edge here regresses, the loop is broken before it reaches a person.
 */

const SENTENCE = "Suvirinau metalo konstrukcijas pusautomačiu.";
const NEED_ROW = {
  title: "Suvirintojas",
  needSummary: null,
  roleOrWorkType: null,
  notes: null,
  payload: { role: "Suvirintojas", intent: "hire_workers", skills: null },
  escoUriToSlug: new Map<string, string>(),
};

const WELDING = { id: "skill-welding-blueprint", slug: "welding-blueprint" };

function recognise(text: string) {
  return deriveJournalRecognition(text, {
    declaredSlugs: new Set(),
    entryRejections: { slugs: new Set(), claimLabels: new Set() },
    entryResolutions: new Map(),
  });
}

describe("living evidence loop — journal → profile → capability → matching → provenance", () => {
  it("EDGE journal→evidence: the sentence recognises the skill the open need requires", () => {
    const recognised = recognise(SENTENCE).recognizedSkills.map((r) => r.slug);
    const need = deriveNeedSkills(NEED_ROW);
    expect(need.source).toBe("recognized_from_text");
    expect(need.skillSlugs).toContain(WELDING.slug);
    // The need's requirement set is SATISFIABLE by what the entry evidences.
    for (const required of need.skillSlugs) expect(recognised).toContain(required);
  });

  it("EDGE evidence→profile: a pipeline-added row starts self_declared and the reconcile lifts it to work_journal, never verified", () => {
    // Exactly what skill-pipeline.ts step 5 writes for a recognised, undeclared skill.
    const added = { skill_id: WELDING.id, source: "self_declared", verified: false };
    const updates = reconcileWorkerSkillSources([added], new Set([WELDING.id]));
    expect(updates).toEqual([{ skill_id: WELDING.id, source: "work_journal" }]);
    expect(deriveEvidenceTier({ verified: false, source: "work_journal" })).toBe("work_journal");
    // A link alone can never reach the confirmed rung.
    expect(deriveEvidenceTier({ verified: false, source: "manager_confirmed" })).not.toBe(
      "manager_confirmed",
    );
  });

  it("EDGE capability→matching: the journal-tier skill turns the employer's own need from insufficient_data into a strong match", () => {
    const need = deriveNeedSkills(NEED_ROW);
    const matchNeed = { skillIds: need.skillSlugs, needSource: need.source, professionSlug: need.professionSlug, country: "LT" };
    const before: MatchSubject = { skills: [], country: "LT" };
    const after: MatchSubject = {
      skills: [{ uri: WELDING.slug, evidence: "work_journal" }],
      country: "LT",
    };
    expect(matchWorkerToNeed(matchNeed, before).status).toBe("insufficient_data");
    const m = matchWorkerToNeed(matchNeed, after);
    expect(m.status).toBe("strong");
    expect(m.evidence.matchedJournalSupported).toBe(1);
    expect(m.evidence.matchedManagerConfirmed).toBe(0);
    expect(m.evidenceConfidence).toBe("mixed");
    expect(m.reasons).toContainEqual({ code: "skill_fit", matched: 1, total: 1, confirmed: 0 });
  });

  it("EDGE confirm→capability→matching: the company confirm reads as confirmed evidence, with the manager-confirmed reason", () => {
    const need = deriveNeedSkills(NEED_ROW);
    const matchNeed = { skillIds: need.skillSlugs, needSource: need.source, country: "LT" };
    const confirmedRow = { verified: true, source: "manager_confirmed" };
    expect(deriveEvidenceTier(confirmedRow)).toBe("manager_confirmed");
    const m = matchWorkerToNeed(matchNeed, {
      skills: [{ uri: WELDING.slug, evidence: deriveEvidenceTier(confirmedRow) }],
      country: "LT",
    });
    expect(m.status).toBe("strong");
    expect(m.evidence.matchedManagerConfirmed).toBe(1);
    expect(m.evidenceConfidence).toBe("confirmed");
    expect(m.reasons).toContainEqual({ code: "skills_manager_confirmed", count: 1 });
  });

  it("EDGE provenance: the worker's card names the confirming organisation; before the confirm it says the entry backs it, unconfirmed", () => {
    const beforeConfirm = deriveProvenance({
      skill: { verified: false, source: "work_journal" },
      confirmations: [],
      journalEntries: 1,
    });
    expect(beforeConfirm).toEqual({ class: "EVIDENCE_SUPPORTED", journalEntries: 1, validUntil: null });
    expect(provenanceTextKey(beforeConfirm)).toBe("evidenceEntries");

    const afterConfirm = deriveProvenance({
      skill: { verified: true, source: "manager_confirmed" },
      confirmations: [
        {
          confirmation_scope: { action: "confirm", decision: "approved" },
          created_at: "2026-09-06T06:52:52.998Z",
          organizationName: "E2E Walker UAB",
        },
      ],
      journalEntries: 1,
    });
    expect(afterConfirm).toEqual({
      class: "EMPLOYER_CONFIRMED",
      confirmedBy: "E2E Walker UAB",
      confirmedAt: "2026-09-06T06:52:52.998Z",
    });
    expect(provenanceTextKey(afterConfirm)).toBe("employerConfirmed");
  });
});
