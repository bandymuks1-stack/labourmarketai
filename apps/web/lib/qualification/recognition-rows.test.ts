import { describe, expect, it } from "vitest";

import { assessCapability, type CapabilityEvidence } from "@/lib/qualification/capability-standing";
import { mapRecognitionRows, RECOGNITION_ROW_COLUMNS } from "@/lib/qualification/recognition-rows";
import { deriveRecognisedByItems } from "@/lib/qualification/recognised-by-view";
import { recognitionAnswersDocumentTypes } from "@/lib/skills/recognition-model";

/**
 * REAL ROWS. These three rows are the exact `learner_reads` output of ONE
 * rolled-back production DO block (project gorgitwvdzxbnaxhrsrw, 2026-10-07,
 * synthetic zz-proof data, zero residue verified afterwards): invitation
 * (student) -> accept -> student engagement context -> cohort member ->
 * independently confirmed work -> record_competency_recognition_v1 for a
 * document_type, a skill and a profession. The learner read them under RLS as
 * the columns in RECOGNITION_ROW_COLUMNS; an outsider and the confirming
 * employer read 0 rows and anon was refused.
 */
const ASSESSOR = "47fff8c9-1efa-49f5-9ffa-bef646eec5f5";
const PRODUCTION_ROWS: Record<string, unknown>[] = [
  { id: "fc2af673-85e0-4ef0-a01e-bfc2846dab44", decision: "recognised", revoked_at: null, valid_from: "2026-10-07", valid_until: "2027-10-07", requirement_key: "zz-proof-certificate", requirement_kind: "document_type", assessor_organization_id: ASSESSOR },
  { id: "3185c77e-bf67-4a82-ad81-282cafd02334", decision: "recognised", revoked_at: null, valid_from: "2026-10-07", valid_until: null, requirement_key: "zz-proof-plasterer", requirement_kind: "profession", assessor_organization_id: ASSESSOR },
  { id: "445af926-1340-494c-b16a-41d935379891", decision: "recognised", revoked_at: null, valid_from: "2026-10-07", valid_until: null, requirement_key: "zz-proof-drywall", requirement_kind: "skill", assessor_organization_id: ASSESSOR },
];

describe("real production recognition rows through the pure model", () => {
  const rows = mapRecognitionRows(PRODUCTION_ROWS);
  const today = "2026-10-08";

  it("reads the columns the reader selects", () => {
    for (const col of ["decision", "valid_from", "valid_until", "assessor_organization_id", "requirement_kind", "requirement_key", "revoked_at"]) {
      expect(RECOGNITION_ROW_COLUMNS).toContain(col);
    }
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.requirementKind).sort()).toEqual(["document_type", "profession", "skill"]);
  });

  it("a document_type recognition answers exactly that document type", () => {
    expect(recognitionAnswersDocumentTypes(rows, ["zz-proof-certificate"], today)).toBe(true);
    expect(recognitionAnswersDocumentTypes(rows, ["zz-proof-drywall"], today)).toBe(false); // a skill key is not a document type
    expect(recognitionAnswersDocumentTypes(rows, ["other-document"], today)).toBe(false);
    expect(recognitionAnswersDocumentTypes(rows, ["zz-proof-certificate"], "2027-10-08")).toBe(false); // lapsed
  });

  it("assessCapability: recognition meets the formal requirement; work alone never does", () => {
    const base: CapabilityEvidence = {
      independentlyConfirmedEntries: 1,
      recordedEntries: 2,
      verifiedSkills: 0,
      hasValidCredential: false,
      hasExpiringCredential: false,
      hasRecognizedEquivalence: false,
    };
    expect(assessCapability(base).formalRequirementMet).toBe(false);
    const recognised = assessCapability({
      ...base,
      hasRecognizedEquivalence: recognitionAnswersDocumentTypes(rows, ["zz-proof-certificate"], today),
    });
    expect(recognised.standing).toBe("recognized_equivalence");
    expect(recognised.formalRequirementMet).toBe(true);
  });

  it("the recognised-by view shows skill and profession only, labelled by the assessing institution", () => {
    const items = deriveRecognisedByItems(rows, { [ASSESSOR]: "Institution X" }, today);
    expect(items.map((i) => [i.kind, i.key, i.institutionName])).toEqual([
      ["profession", "zz-proof-plasterer", "Institution X"],
      ["skill", "zz-proof-drywall", "Institution X"],
    ]);
    expect(items.every((i) => i.evidenceClass === "assessor_recognition")).toBe(true);
    // an unreadable name is never invented
    expect(deriveRecognisedByItems(rows, {}, today).every((i) => i.institutionName === null)).toBe(true);
  });

  it("revoked, negative and lapsed decisions are never shown as a recognition; unavailable shows nothing", () => {
    const bad = mapRecognitionRows([
      { ...PRODUCTION_ROWS[2], id: "a", revoked_at: "2026-10-08T00:00:00Z" },
      { ...PRODUCTION_ROWS[2], id: "b", decision: "not_recognised" },
      { ...PRODUCTION_ROWS[2], id: "c", valid_until: "2026-01-01" },
    ]);
    expect(deriveRecognisedByItems(bad, {}, today)).toEqual([]);
    expect(deriveRecognisedByItems(null, {}, today)).toEqual([]);
  });

  it("carries no number a ranking could read", () => {
    const items = deriveRecognisedByItems(rows, {}, today);
    expect(items.every((i) => Object.values(i).every((v) => typeof v !== "number"))).toBe(true);
  });
});
