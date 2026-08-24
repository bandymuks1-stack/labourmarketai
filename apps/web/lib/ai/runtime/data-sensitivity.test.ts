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
import type { AiEgressGrant } from "./data-egress";
import { AI_TASK_TYPES, TASK_POLICIES } from "./task-routing";

const LOCAL = { id: "local", costClass: "free_local", locality: "local" } as const;
const PAID_CLOUD = { id: "anthropic", costClass: "paid", locality: "cloud" } as const;
/** Injected — nothing in the shipped profile table is free_tier today. */
const FREE_CLOUD = { id: "gemini", costClass: "free_tier", locality: "cloud" } as const;

describe("every task is classified, and the table matches the shipped profiles", () => {
  it("covers all 11 task types", () => {
    expect(AI_TASK_TYPES.length).toBe(11);
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

  it("the PUBLIC set is exactly the one task that was reviewed for it", () => {
    // SUPERSEDES "no task claims PUBLIC — that is a finding, not an omission",
    // which said: if a genuinely public reference task is ever added, THIS is
    // the expectation that must change deliberately, with the task named.
    //
    // 2026-08-24: `explain_market_demand` is that task, and it is named here.
    // Its payload is aggregate counts of externally published advertisements —
    // no data subject, no employer identity, no advertisement text — and the
    // field list backing the claim is its own `TASK_POLICIES` entry.
    //
    // Still an equality against a NAMED list rather than a count, for the same
    // reason as before: the risk is a second task being relabelled quietly,
    // and a count would go green on a swap.
    const publicTasks = AI_TASK_TYPES.filter(
      (t) => TASK_SENSITIVITY[t] === "PUBLIC",
    );
    expect(publicTasks).toEqual(["explain_market_demand"]);
  });
});

describe("default deny: an external provider with no grant gets PUBLIC only", () => {
  /**
   * OWNER DECISION 2026-08-19 (AI DATA BOUNDARY) replaced the rule these tests
   * used to assert. The old rule sorted providers by PRICE — free tiers refused
   * personal data, paid cloud allowed it, on the ground that enabling a paid
   * vendor was already an owner decision. The owner has separated the two acts:
   * paying a vendor is not permitting it to process a worker's journal. The
   * axis is now INTERNAL vs EXTERNAL, and permission is explicit.
   *
   * So the cases below are inverted on purpose, not relaxed: PAID cloud is now
   * refused personal data too, because it holds no egress grant.
   */
  it.each(["LOW_RISK_PROJECT_DATA", "PERSONAL", "SENSITIVE_FREE_TEXT"] as AiDataSensitivity[])(
    "%s is refused to a PAID external provider with no grant",
    (sensitivity) => {
      const verdict = providerEligibleForSensitivity(PAID_CLOUD, sensitivity);
      expect(verdict.eligible).toBe(false);
      expect(!verdict.eligible && verdict.reason).toMatch(/egress grant/i);
    },
  );

  it.each(["LOW_RISK_PROJECT_DATA", "PERSONAL", "SENSITIVE_FREE_TEXT"] as AiDataSensitivity[])(
    "%s is refused to a FREE external provider with no grant",
    (sensitivity) => {
      expect(
        providerEligibleForSensitivity(FREE_CLOUD, sensitivity).eligible,
      ).toBe(false);
    },
  );

  it("PUBLIC reaches an external provider — the gate is not a blanket ban", () => {
    expect(providerEligibleForSensitivity(PAID_CLOUD, "PUBLIC").eligible).toBe(
      true,
    );
    expect(providerEligibleForSensitivity(FREE_CLOUD, "PUBLIC").eligible).toBe(
      true,
    );
  });

  it("EUR 0 grants nothing, and neither does an invoice", () => {
    // The owner's sentence, as a test: cost class must not move the verdict.
    // Same id, same locality, only the price differs — both refused.
    const free = providerEligibleForSensitivity(
      { id: "v", costClass: "free_tier", locality: "cloud" },
      "PERSONAL",
    );
    const paid = providerEligibleForSensitivity(
      { id: "v", costClass: "paid", locality: "cloud" },
      "PERSONAL",
    );
    expect(free.eligible).toBe(false);
    expect(paid.eligible).toBe(false);
  });
});

describe("an explicit grant opens the gate, and only as far as it says", () => {
  // The grant table ships EMPTY, so these inject one — the same reason the
  // free-tier cases used to inject a synthetic provider: a rule with no live
  // subject is indistinguishable from a rule that does not work.
  const grantTo = (
    provider: string,
    maxSensitivity: AiDataSensitivity,
  ): AiEgressGrant[] => [
    { provider, maxSensitivity, basis: "test fixture", grantedOn: "2026-08-19" },
  ];

  it("a grant permits up to its ceiling", () => {
    const grants = grantTo("anthropic", "PERSONAL");
    expect(
      providerEligibleForSensitivity(PAID_CLOUD, "PERSONAL", grants).eligible,
    ).toBe(true);
    expect(
      providerEligibleForSensitivity(PAID_CLOUD, "LOW_RISK_PROJECT_DATA", grants)
        .eligible,
    ).toBe(true);
  });

  it("a grant does NOT permit above its ceiling", () => {
    const grants = grantTo("anthropic", "PERSONAL");
    expect(
      providerEligibleForSensitivity(PAID_CLOUD, "SENSITIVE_FREE_TEXT", grants)
        .eligible,
    ).toBe(false);
  });

  it("a grant is per provider — it never leaks to another vendor", () => {
    const grants = grantTo("anthropic", "SENSITIVE_FREE_TEXT");
    expect(
      providerEligibleForSensitivity(
        { id: "openai", costClass: "paid", locality: "cloud" },
        "PERSONAL",
        grants,
      ).eligible,
    ).toBe(false);
  });

  it("a free tier cannot be granted personal data, whatever the grant claims", () => {
    // MAX_GRANTABLE_FOR_FREE_TIER survives from the old rule: when a service is
    // free the consideration is sometimes the content itself.
    const grants = grantTo("gemini", "SENSITIVE_FREE_TEXT");
    expect(
      providerEligibleForSensitivity(FREE_CLOUD, "PERSONAL", grants).eligible,
    ).toBe(false);
    // ...but the grant still works up to the capped ceiling.
    expect(
      providerEligibleForSensitivity(
        FREE_CLOUD,
        "LOW_RISK_PROJECT_DATA",
        grants,
      ).eligible,
    ).toBe(true);
  });
});

describe("local is unrestricted; disabled never is", () => {
  it.each(AI_DATA_SENSITIVITY_CLASSES)(
    "local may receive %s — no egress occurs, so there is nothing to permit",
    (s) => {
      expect(providerEligibleForSensitivity(LOCAL, s).eligible).toBe(true);
    },
  );

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
