import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CRITERIA_KEYS,
  missingImportantCriteria,
  presentCriteria,
  type CriteriaSnapshot,
} from "./criteria-summary-contract";

const APP = join(__dirname, "..", "..");

function snap(over: Partial<CriteriaSnapshot> = {}): CriteriaSnapshot {
  return {
    hasWorkerProfile: true,
    skillsCount: 0,
    languages: [],
    preferredCountries: [],
    salaryMinEur: null,
    salaryMaxEur: null,
    availabilityStatus: null,
    availableFrom: null,
    willingToRelocate: null,
    preferredContractType: null,
    documentsCount: 0,
    ...over,
  };
}

describe("presentCriteria — real presence, never defaults", () => {
  it("an empty snapshot has NOTHING present", () => {
    const p = presentCriteria(snap());
    for (const k of CRITERIA_KEYS) expect(p[k], k).toBe(false);
  });

  it("each fact flips only its own key", () => {
    expect(presentCriteria(snap({ skillsCount: 3 })).skills).toBe(true);
    expect(presentCriteria(snap({ languages: ["lt"] })).languages).toBe(true);
    expect(presentCriteria(snap({ preferredCountries: ["NL"] })).countries).toBe(true);
    expect(presentCriteria(snap({ salaryMinEur: 15 })).salary).toBe(true);
    expect(presentCriteria(snap({ salaryMaxEur: 25 })).salary).toBe(true);
    expect(presentCriteria(snap({ availabilityStatus: "available" })).availability).toBe(true);
    expect(presentCriteria(snap({ availableFrom: "2026-08-01" })).start).toBe(true);
    // An explicit "no" is an ANSWER, not a gap.
    expect(presentCriteria(snap({ willingToRelocate: false })).relocate).toBe(true);
    expect(presentCriteria(snap({ preferredContractType: "employment" })).contract).toBe(true);
    expect(presentCriteria(snap({ documentsCount: 1 })).documents).toBe(true);
  });
});

describe("missingImportantCriteria — matching-relevant gaps only, stable order", () => {
  it("empty profile reports the five matching-critical gaps in ask order", () => {
    expect(missingImportantCriteria(snap())).toEqual([
      "skills",
      "countries",
      "availability",
      "languages",
      "salary",
    ]);
  });

  it("optional fields (contract, relocate, start, documents) are never nagged", () => {
    const missing = missingImportantCriteria(snap());
    expect(missing).not.toContain("contract");
    expect(missing).not.toContain("relocate");
    expect(missing).not.toContain("start");
    expect(missing).not.toContain("documents");
  });

  it("a fully-set profile has zero missing", () => {
    const full = snap({
      skillsCount: 2,
      languages: ["lt", "en"],
      preferredCountries: ["NL"],
      salaryMinEur: 15,
      availabilityStatus: "available",
    });
    expect(missingImportantCriteria(full)).toEqual([]);
  });
});

describe("server half wiring (source contract)", () => {
  const src = readFileSync(join(APP, "lib", "conversation", "criteria-summary.ts"), "utf8");

  const activity = readFileSync(join(APP, "lib", "conversation", "worker-activity.ts"), "utf8");

  it("delegates table reads to the ONE canonical worker read model", () => {
    expect(src).toMatch(/"use server"/);
    expect(src).toMatch(/server-only/);
    expect(src).toMatch(/getWorkerCriteriaSnapshot/);
    // No direct table reads here — the delegation guard owns that rule; this
    // pins the same contract from this side.
    expect(src).not.toMatch(/\.from\(["']/);
  });

  it("the read model reads the CANONICAL matching columns", () => {
    for (const col of [
      "preferred_countries",
      "salary_min_eur",
      "salary_max_eur",
      "availability_status",
      "available_from",
      "willing_to_relocate",
    ]) {
      expect(activity, col).toContain(col);
    }
    expect(activity).toContain("profile_skill_claims");
    expect(activity).toContain("worker_languages");
    expect(activity).toContain("worker_documents");
  });

  it("never fabricates values: unset fields are reported missing, not defaulted", () => {
    // No hardcoded fallback country and no invented salary anywhere in the
    // module (count ?? 0 for empty result sets is a count, not a criterion).
    expect(src).not.toMatch(/\?\?\s*"[A-Z]{2}"/);
    expect(src).not.toMatch(/salary[A-Za-z]*\s*\?\?\s*\d/);
  });

  it("the chat routes the criteria intent to this real read (no canned answer)", () => {
    const chat = readFileSync(
      join(APP, "components", "app", "conversation", "chat", "conversation-chat.tsx"),
      "utf8",
    );
    expect(chat).toMatch(/loadCriteriaSummaryForChat/);
    expect(chat).toMatch(/intent === "criteria"/);
  });
});

describe("transcript adapter honesty (source contract)", () => {
  // Lives OUTSIDE lib/conversation on purpose: the conversation layer is
  // orchestration-only (no-direct-write guard); the transcript module is the
  // canonical server-action owner of assistant_* persistence.
  const src = readFileSync(join(APP, "lib", "assistant", "transcript.ts"), "utf8");

  it("degrades to available:false on error — never fakes a persisted turn", () => {
    expect(src).toMatch(/available:\s*false/);
    // Appends go ONLY through the hash-chaining RPC, never direct insert
    // into assistant_messages.
    expect(src).toMatch(/\.rpc\("append_assistant_message"/);
    expect(src).not.toMatch(/from\("assistant_messages"\)\s*\.\s*insert/);
  });
});
