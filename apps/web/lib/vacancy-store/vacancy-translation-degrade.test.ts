/**
 * Job-offer translation degrades, never breaks (owner P0-E, 2026-10-30).
 *
 * The board and the job-offer reads use ONLY stored renderings
 * (`storedVacancyTitles` — no vendor call on that path). The one place a
 * vacancy meets the AI runtime is the reader's explicit "translate this ad"
 * request. With a 0 EUR budget its provider WILL fail sometimes; each failure
 * below must leave the publisher's original text as the answer, store nothing
 * false and charge nothing.
 *
 * Synthetic vacancy only; the runtime, entitlement, rate limit and DB are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const runAiAgent = vi.fn();
const recordTranslationConsumed = vi.fn();
const update = vi.fn();

vi.mock("@/lib/ai/run-agent-server", () => ({ runAiAgent: (...a: unknown[]) => runAiAgent(...a) }));
vi.mock("@/lib/ai/egress-precheck-server", () => ({ aiTaskServableNow: async () => true }));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit: () => ({ limited: false }) }));
vi.mock("./vacancy-translation-entitlement", () => ({
  translationAllowance: async () => ({
    configured: true,
    allowed: true,
    profileId: "00000000-0000-4000-8000-00000000qa01",
    planKey: "free",
    used: 0,
    remaining: 3,
  }),
  recordTranslationConsumed: (...a: unknown[]) => recordTranslationConsumed(...a),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { translations: {} } }) }) }),
      update: (...a: unknown[]) => {
        update(...a);
        return { eq: async () => ({}) };
      },
    }),
  }),
}));

import { storedVacancyTitles, translateVacancyOnDemand } from "./vacancy-translation-read";
import type { StoredPublicVacancyV1 } from "./vacancy-read";

const VACANCY = {
  storeId: "qa-vacancy-1",
  sourceLanguage: "no",
  titleRaw: "Flislegger søkes, 2 stillinger",
  descriptionRaw: "Synthetic ad: 37,5 timer per uke.",
  contentHash: "hash-qa-1",
  translations: {},
} as unknown as StoredPublicVacancyV1;

beforeEach(() => {
  runAiAgent.mockReset();
  recordTranslationConsumed.mockReset();
  update.mockReset();
});

describe("a failed provider leaves the original ad readable, nothing stored, nothing charged", () => {
  it("runtime disabled / no provider → unavailable", async () => {
    runAiAgent.mockResolvedValue({ status: "disabled", reason: "ai_disabled" });
    const r = await translateVacancyOnDemand(VACANCY, "en");
    expect(r).toMatchObject({ kind: "unavailable", reason: "no_provider" });
    expect(update).not.toHaveBeenCalled();
    expect(recordTranslationConsumed).not.toHaveBeenCalled();
  });

  it("free quota exhausted (every provider 429) → unavailable", async () => {
    runAiAgent.mockResolvedValue({
      status: "blocked",
      reason: "provider_unavailable",
      detail: "cloudflare http 429; groq http 429 retry-after 60s",
    });
    const r = await translateVacancyOnDemand(VACANCY, "en");
    expect(r).toMatchObject({ kind: "unavailable", reason: "no_provider" });
    expect(recordTranslationConsumed).not.toHaveBeenCalled();
  });

  it("the runtime throws → unavailable (caught), never an error page", async () => {
    runAiAgent.mockRejectedValue(new Error("fetch failed"));
    const r = await translateVacancyOnDemand(VACANCY, "en");
    expect(r).toMatchObject({ kind: "unavailable", reason: "no_provider" });
    expect(recordTranslationConsumed).not.toHaveBeenCalled();
  });

  it("malformed output (no items) → unavailable", async () => {
    runAiAgent.mockResolvedValue({ status: "suggestion", value: { data: { items: "garbage" } }, provider: "groq", model: "m" });
    const r = await translateVacancyOnDemand(VACANCY, "en");
    expect(r).toMatchObject({ kind: "unavailable", reason: "no_provider" });
    expect(recordTranslationConsumed).not.toHaveBeenCalled();
  });

  it("a rendering that lost a figure is refused and not charged", async () => {
    runAiAgent.mockResolvedValue({
      status: "suggestion",
      value: { data: { items: [{ id: "v0", title: "Tiler wanted, two positions", description: "Synthetic ad: hours per week." }] } },
      provider: "groq",
      model: "m",
    });
    const r = await translateVacancyOnDemand(VACANCY, "en");
    expect(r).toMatchObject({ kind: "unavailable", reason: "refused" });
    expect(recordTranslationConsumed).not.toHaveBeenCalled();
  });

  it("the board path never calls the runtime: a missing rendering simply yields no substitution", () => {
    const titles = storedVacancyTitles([VACANCY], "en");
    expect(titles.size).toBe(0);
    expect(runAiAgent).not.toHaveBeenCalled();
  });
});
