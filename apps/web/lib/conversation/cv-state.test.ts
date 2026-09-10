import { describe, expect, it } from "vitest";

import {
  CV_STATE_UNREADABLE,
  classifyCvState,
  cvHasContent,
  type CvState,
} from "@/lib/conversation/cv-state";
import type { VerifiedCvData, VerifiedCvResult } from "@/lib/cv-export/verified-cv";

/** A CV with nothing in it — every field at its real empty value. */
function emptyCv(): VerifiedCvData {
  return {
    personName: "A Person",
    professionalSummary: null,
    professionSlugs: [],
    tiers: { confirmed: [], evidence: [], declared: [] } as VerifiedCvData["tiers"],
    skillFacts: [],
    declaredClaims: [],
    workHistory: [],
    languages: [],
    certificateDocs: [],
    drivingLicenceCategories: [],
    declaredCertificates: [],
    education: [],
    achievements: [],
    projects: [],
    privateDetails: {} as VerifiedCvData["privateDetails"],
    signals: {} as VerifiedCvData["signals"],
    proof: [],
  };
}

const ok = (cv: VerifiedCvData): VerifiedCvResult => ({ ok: true, cv });

describe("classifyCvState", () => {
  it("an empty record is empty", () => {
    const s = classifyCvState(ok(emptyCv()));
    expect(s.presence).toBe("empty");
    expect(cvHasContent(s)).toBe(false);
  });

  it("work history makes a CV substantive", () => {
    const cv = emptyCv();
    cv.workHistory = [{}, {}] as VerifiedCvData["workHistory"];
    const s = classifyCvState(ok(cv));
    expect(s.presence).toBe("substantive");
    expect(s.workHistory).toBe(2);
    expect(cvHasContent(s)).toBe(true);
  });

  it("confirmed proof alone makes a CV substantive", () => {
    const cv = emptyCv();
    cv.proof = [{}] as VerifiedCvData["proof"];
    expect(classifyCvState(ok(cv)).presence).toBe("substantive");
  });

  it("content without work history or proof is STARTED, not substantive and not empty", () => {
    const cv = emptyCv();
    cv.education = [{}] as VerifiedCvData["education"];
    const s = classifyCvState(ok(cv));
    expect(s.presence).toBe("started");
    expect(cvHasContent(s)).toBe(true);
  });

  it("only a REAL verified flag counts as confirmed (SEP-3)", () => {
    const cv = emptyCv();
    cv.skillFacts = [
      { slug: "a", verified: true },
      { slug: "b", verified: false },
      { slug: "c", verified: false },
    ];
    const s = classifyCvState(ok(cv));
    expect(s.skills).toBe(3);
    expect(s.confirmedSkills).toBe(1);
  });

  it("a self-declared claim is content but is never confirmed", () => {
    const cv = emptyCv();
    cv.declaredClaims = [{ label: "welding", origin: "profile" }];
    const s = classifyCvState(ok(cv));
    expect(s.presence).toBe("started");
    expect(s.skills).toBe(1);
    expect(s.confirmedSkills).toBe(0);
  });

  it("a whitespace-only summary is not content", () => {
    const cv = emptyCv();
    cv.professionalSummary = "   ";
    expect(classifyCvState(ok(cv)).presence).toBe("empty");
  });

  it("no worker record is its own answer, never 'empty'", () => {
    const s = classifyCvState({ ok: false, code: "no_worker" });
    expect(s.presence).toBe("not_a_worker");
  });

  it("not authenticated is its own answer, never 'empty'", () => {
    const s = classifyCvState({ ok: false, code: "not_authenticated" });
    expect(s.presence).toBe("unauthenticated");
  });
});

describe("SEP-7 — a failed read is never an empty CV", () => {
  it("the unreadable constant is not empty and carries no counts", () => {
    expect(CV_STATE_UNREADABLE.presence).toBe("unreadable");
    expect(CV_STATE_UNREADABLE.presence).not.toBe("empty");
    expect(cvHasContent(CV_STATE_UNREADABLE)).toBe(false);
  });

  it("every non-ok presence is distinguishable from a real empty CV", () => {
    // The point of the whole module: four different situations that all show
    // zero rows must NOT collapse into one sentence.
    const presences: CvState["presence"][] = [
      classifyCvState(ok(emptyCv())).presence,
      classifyCvState({ ok: false, code: "no_worker" }).presence,
      classifyCvState({ ok: false, code: "not_authenticated" }).presence,
      CV_STATE_UNREADABLE.presence,
    ];
    expect(new Set(presences).size).toBe(4);
  });
});
