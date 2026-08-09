/**
 * Privacy-aware routing — the veto that cost class must never override.
 *
 * The hard part of testing this rule is that it currently has NO live subject:
 * every cloud provider in `AI_PROVIDER_PROFILES` is classed `paid`, so a free
 * tier never appears and the veto never fires in production. A test that only
 * exercised the shipped table would pass whether the rule worked or not.
 *
 * So the free-tier cases below INJECT a synthetic `free_tier` provider. That is
 * the negative control the rule needs: it proves the exclusion is a property of
 * the cost CLASS, enforced the moment anything lands in it — not a property of
 * today's provider list.
 */
import { describe, it, expect } from "vitest";
import {
  AI_DATA_SENSITIVITY_CLASSES,
  TASK_SENSITIVITY,
  carriesPersonalData,
  providerEligibleForSensitivity,
  sensitivityForTask,
  type AiDataSensitivity,
} from "./data-sensitivity";
import { AI_PROVIDER_PROFILES, type AiProviderProfile } from "./provider-chain";
import { AI_TASK_TYPES, TASK_POLICIES } from "./task-routing";

const LOCAL = { id: "local", costClass: "free_local", locality: "local" } as const;
const PAID_CLOUD = { id: "anthropic", costClass: "paid", locality: "cloud" } as const;
/** Injected — nothing in the shipped profile table is free_tier today. */
const FREE_CLOUD = { id: "gemini", costClass: "free_tier", locality: "cloud" } as const;

describe("every task is classified, and the table matches the shipped profiles", () => {
  it("covers all 10 task types", () => {
    expect(AI_TASK_TYPES.length).toBe(10);
    for (const t of AI_TASK_TYPES) {
      expect(TASK_SENSITIVITY[t], `missing sensitivity for ${t}`).toBeDefined();
      expect(AI_DATA_SENSITIVITY_CLASSES).toContain(TASK_SENSITIVITY[t]);
    }
  });

  it("the tasks that read a person are classed PERSONAL or above", () => {
    // Derived from what each policy's allowedFields actually admit, not from
    // the task's name. `extract_cv` is the clearest case: it is the one policy
    // that admits `cv_text`.
    expect(TASK_POLICIES.extract_cv.allowedFields).toContain("cv_text");
    for (const t of [
      "extract_cv",
      "normalize_work_scope",
      "normalize_external_profile",
      "explain_match",
      "draft_follow_up",
      "translate_message",
    ] as const) {
      expect(carriesPersonalData(sensitivityForTask(t)), t).toBe(true);
    }
  });

  it("unbounded free text is classed above ordinary personal data", () => {
    // `source_text` has no shape the platform can enforce minimisation on.
    expect(TASK_SENSITIVITY.translate_message).toBe("SENSITIVE_FREE_TEXT");
  });

  it("a business's own work scope is NOT personal", () => {
    for (const t of [
      "structure_future_work",
      "derive_workforce_requirements",
    ] as const) {
      expect(sensitivityForTask(t)).toBe("LOW_RISK_PROJECT_DATA");
      expect(carriesPersonalData(sensitivityForTask(t))).toBe(false);
    }
  });

  it("no task claims PUBLIC — that is a finding, not an omission", () => {
    // If a genuinely public reference task is ever added, this expectation is
    // the thing that must be changed deliberately, with the task named.
    const publicTasks = AI_TASK_TYPES.filter(
      (t) => TASK_SENSITIVITY[t] === "PUBLIC",
    );
    expect(publicTasks).toEqual([]);
  });
});

describe("a free cloud tier may not receive personal data", () => {
  it.each(["PERSONAL", "SENSITIVE_FREE_TEXT"] as AiDataSensitivity[])(
    "%s is refused to an injected free_tier provider",
    (sensitivity) => {
      const verdict = providerEligibleForSensitivity(FREE_CLOUD, sensitivity);
      expect(verdict.eligible).toBe(false);
      expect(!verdict.eligible && verdict.reason).toMatch(/free cloud tier/i);
    },
  );

  it.each(["PUBLIC", "LOW_RISK_PROJECT_DATA"] as AiDataSensitivity[])(
    "%s IS allowed to a free_tier provider — the veto is not a blanket ban",
    (sensitivity) => {
      expect(providerEligibleForSensitivity(FREE_CLOUD, sensitivity).eligible).toBe(
        true,
      );
    },
  );

  it("NEGATIVE CONTROL: reclassifying the same provider as paid lets it through", () => {
    // Same id, same locality — only the cost class differs. If this did not
    // flip, the rule would be keyed on the vendor rather than on the class,
    // and a new free provider would slip past it.
    const asFree = providerEligibleForSensitivity(FREE_CLOUD, "PERSONAL");
    const asPaid = providerEligibleForSensitivity(
      { ...FREE_CLOUD, costClass: "paid" },
      "PERSONAL",
    );
    expect(asFree.eligible).toBe(false);
    expect(asPaid.eligible).toBe(true);
  });
});

describe("local is always eligible; paid cloud is eligible; disabled never is", () => {
  it.each(AI_DATA_SENSITIVITY_CLASSES)(
    "local may receive %s — the prompt never leaves the operator's network",
    (s) => {
      expect(providerEligibleForSensitivity(LOCAL, s).eligible).toBe(true);
    },
  );

  it.each(AI_DATA_SENSITIVITY_CLASSES)("paid cloud may receive %s", (s) => {
    expect(providerEligibleForSensitivity(PAID_CLOUD, s).eligible).toBe(true);
  });

  it("a disabled provider is refused everything", () => {
    for (const s of AI_DATA_SENSITIVITY_CLASSES) {
      const v = providerEligibleForSensitivity(
        { id: "xai", costClass: "disabled", locality: "cloud" },
        s,
      );
      expect(v.eligible).toBe(false);
    }
  });
});

describe("the shipped profile table still has no free_tier entry", () => {
  it("every cloud provider is paid — promoting one is a conscious edit", () => {
    // This mirrors the pin in provider-chain.test.ts and exists here for a
    // different reason: it documents WHY the tests above must inject their
    // subject. If this ever goes red, the injected cases become live cases and
    // the free-provider matrix must carry the source for the promotion.
    const freeTier = AI_PROVIDER_PROFILES.filter(
      (p: AiProviderProfile) => p.costClass === "free_tier",
    );
    expect(freeTier).toEqual([]);
  });
});
