/**
 * Need submission survives every AI failure (owner P0-E, 2026-10-30).
 *
 * The public company-need form stores the need FIRST and only then asks the
 * `company_need` agent for an optional vacancy draft. With a 0 EUR AI budget a
 * free quota can be exhausted, rate-limited, down, or answer with garbage —
 * none of that may turn a stored need into an error screen.
 *
 * Synthetic data only; the AI seam and the persistence are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const persistPublicCompanyNeed = vi.fn();
const draftVacancyFromNeed = vi.fn();

vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("./company-need-public-intake", () => ({
  persistPublicCompanyNeed: (...a: unknown[]) => persistPublicCompanyNeed(...a),
}));
vi.mock("./company-need-actions", () => ({
  draftVacancyFromNeed: (...a: unknown[]) => draftVacancyFromNeed(...a),
}));
vi.mock("../security/ai-action-throttle", () => ({ aiActionRateLimited: async () => false }));
vi.mock("../notifications/telegram-owner-alerts", () => ({
  sendCompanyNeedOwnerAlert: async () => undefined,
}));

import { submitCompanyNeedAction } from "./company-need-form-actions";

function syntheticForm(): FormData {
  const f = new FormData();
  f.set("company_name", "Synthetic Builders QA");
  f.set("contact_email", "need-qa@example.test");
  f.set("country", "LT");
  f.set("profession", "tiler");
  f.set("number_of_workers", "2");
  f.set("description", "Synthetic need for an AI-failure test.");
  return f;
}

const okNeed = { ok: true, need: {} };

beforeEach(() => {
  persistPublicCompanyNeed.mockReset().mockResolvedValue({ ok: true });
  draftVacancyFromNeed.mockReset();
});

describe("a stored need stays a success whatever the AI does", () => {
  it("AI_PROVIDER_MODE=disabled → stored, draft honestly 'disabled'", async () => {
    draftVacancyFromNeed.mockResolvedValue({ ...okNeed, draft: { status: "disabled", reason: "ai_disabled" } });
    const state = await submitCompanyNeedAction(null, syntheticForm());
    expect(state).toMatchObject({ ok: true, persisted: true, draftStatus: "disabled" });
    expect(persistPublicCompanyNeed).toHaveBeenCalledTimes(1);
  });

  it("free quota exhausted (429 on every provider) → stored, no draft invented", async () => {
    draftVacancyFromNeed.mockResolvedValue({
      ...okNeed,
      draft: { status: "blocked", reason: "provider_unavailable", detail: "groq http 429 retry-after 60s" },
    });
    const state = await submitCompanyNeedAction(null, syntheticForm());
    expect(state).toMatchObject({ ok: true, persisted: true, draftStatus: "needs_review" });
    expect(state.role).toBeUndefined();
    expect(state.skills).toBeUndefined();
  });

  it("malformed model output (schema-invalid) → stored, nothing from the output reaches the screen", async () => {
    draftVacancyFromNeed.mockResolvedValue({
      ...okNeed,
      draft: { status: "needs_review", reason: "schema_invalid", detail: "not json" },
    });
    const state = await submitCompanyNeedAction(null, syntheticForm());
    expect(state).toMatchObject({ ok: true, persisted: true, draftStatus: "needs_review" });
    expect(state.role).toBeUndefined();
  });

  it("the AI layer THROWS (network, bug, env) → still stored and still a success", async () => {
    draftVacancyFromNeed.mockRejectedValue(new Error("fetch failed: ECONNRESET"));
    const state = await submitCompanyNeedAction(null, syntheticForm());
    expect(state).toMatchObject({ ok: true, persisted: true, draftStatus: "disabled" });
  });

  it("the AI layer throws and the store was unavailable → the honest 'prepared' state, never a crash", async () => {
    persistPublicCompanyNeed.mockResolvedValue({ ok: false, code: "unavailable" });
    draftVacancyFromNeed.mockRejectedValue(new Error("timeout"));
    const state = await submitCompanyNeedAction(null, syntheticForm());
    expect(state).toMatchObject({ ok: true, persisted: false, draftStatus: "disabled" });
  });

  it("NEGATIVE CONTROL: a valid suggestion is shown, labelled as a suggestion", async () => {
    draftVacancyFromNeed.mockResolvedValue({
      ...okNeed,
      draft: {
        status: "suggestion",
        value: {
          data: {
            normalized_role: "Tiler",
            required_skills: ["tiling"],
            required_documents: [],
            missing_fields: [],
            country_readiness_blockers: [],
          },
        },
      },
    });
    const state = await submitCompanyNeedAction(null, syntheticForm());
    expect(state).toMatchObject({ ok: true, persisted: true, draftStatus: "suggestion", role: "Tiler" });
  });
});
