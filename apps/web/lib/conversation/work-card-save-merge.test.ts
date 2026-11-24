import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W6 — the work-card save MERGES, it does not replace (measured on
 * production, #1579: the chat's work-card form opened empty and its executor
 * sent the country list whole, so a person adding one country lost the
 * others). Pinned here at the two layers a chat save crosses:
 *
 *   executor  `worker.save-work-card` → FormData → `saveWorkerCardAction`
 *   action    FormData → `saveWorkerCardCore` input (→ RPC `save_worker_card`,
 *             whose every column is `coalesce(param, column)` — null keeps)
 *
 * Rules: an omitted field keeps the recorded value; a non-empty list replaces
 * the list whole; ONLY an explicit `[]` clears it (its own wire flag, since
 * `[]` and "omitted" are the same empty string on FormData); a blank list
 * text never clears. The canonical modules are mocked — this pins the shape
 * that reaches them, not the database.
 */

vi.mock("@/lib/worker/work-card-actions", () => ({ saveWorkerCardAction: vi.fn() }));
vi.mock("@/lib/profile/cv-section-import-actions", () => ({ confirmCvWorkHistoryAction: vi.fn() }));
vi.mock("@/lib/worker/worker-languages-actions", () => ({ saveWorkerLanguageAction: vi.fn() }));
vi.mock("@/lib/documents/document-actions", () => ({ upsertWorkerDocumentAction: vi.fn() }));
vi.mock("@/lib/worker/availability-prefs-actions", () => ({ saveWorkerAvailabilityPrefsAction: vi.fn() }));
vi.mock("@/lib/worker/worker-education-actions", () => ({ saveWorkerEducationAction: vi.fn() }));
vi.mock("@/lib/worker/worker-achievements-actions", () => ({ saveWorkerAchievementAction: vi.fn() }));
vi.mock("@/lib/booking/booking-actions", () => ({ respondBookingAction: vi.fn() }));
vi.mock("@/lib/invitations/actions", () => ({ acceptInvitationByIdAction: vi.fn() }));
vi.mock("@/lib/worker/invitation-actions", () => ({ acceptWorkerInvitationAction: vi.fn() }));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: vi.fn() }));
vi.mock("@/lib/opportunities/interest-actions", () => ({ expressInterestAction: vi.fn() }));
vi.mock("@/lib/journal/actions", () => ({ createJournalEntry: vi.fn() }));

import { WORKER_EXECUTORS } from "@/lib/conversation/worker-executors";
import { workerSaveWorkCardSchema } from "@/lib/conversation/worker-schemas";
import { saveWorkerCardAction } from "@/lib/worker/work-card-actions";

const ctx = { locale: "lt" };
const saveMock = vi.mocked(saveWorkerCardAction);

function sentForm(): FormData {
  const call = saveMock.mock.calls.at(-1);
  if (!call) throw new Error("saveWorkerCardAction was not called");
  return call[1] as FormData;
}

describe("executor worker.save-work-card — omitted keeps, explicit [] clears", () => {
  beforeEach(() => {
    saveMock.mockReset();
    saveMock.mockResolvedValue({ ok: true });
  });

  it("the schema distinguishes an omitted list from an explicit empty one", () => {
    const omitted = workerSaveWorkCardSchema.parse({ availabilityStatus: "available" });
    expect(omitted.preferredCountries).toBeUndefined();
    const cleared = workerSaveWorkCardSchema.parse({ preferredCountries: [] });
    expect(cleared.preferredCountries).toEqual([]);
  });

  it("an omitted country list is sent empty WITHOUT the clear flag (= keep)", async () => {
    const input = workerSaveWorkCardSchema.parse({ availabilityStatus: "available" });
    const r = await WORKER_EXECUTORS["worker.save-work-card"](input, ctx);
    expect(r.ok).toBe(true);
    const f = sentForm();
    expect(f.get("availability_status")).toBe("available");
    expect(f.get("preferred_countries")).toBe("");
    expect(f.has("preferred_countries_clear")).toBe(false);
    // Every other omitted field travels as "" — the action turns "" into
    // null and the RPC coalesces null to the recorded value.
    for (const k of ["available_from", "location_country", "salary_min", "salary_max"]) {
      expect(f.get(k), k).toBe("");
    }
  });

  it("a non-empty list is sent whole, no clear flag (replace with the full list)", async () => {
    const input = workerSaveWorkCardSchema.parse({ preferredCountries: ["NO", "SE", "DE"] });
    await WORKER_EXECUTORS["worker.save-work-card"](input, ctx);
    const f = sentForm();
    expect(f.get("preferred_countries")).toBe("NO,SE,DE");
    expect(f.has("preferred_countries_clear")).toBe(false);
  });

  it("ONLY an explicit [] carries the clear flag", async () => {
    const input = workerSaveWorkCardSchema.parse({ preferredCountries: [] });
    await WORKER_EXECUTORS["worker.save-work-card"](input, ctx);
    const f = sentForm();
    expect(f.get("preferred_countries")).toBe("");
    expect(f.get("preferred_countries_clear")).toBe("1");
  });

  it("never claims success the canonical action did not return", async () => {
    saveMock.mockResolvedValue({ ok: false, code: "invalid", message: "salary_range" });
    const r = await WORKER_EXECUTORS["worker.save-work-card"](
      workerSaveWorkCardSchema.parse({ salaryMin: 1 }),
      ctx,
    );
    expect(r).toEqual({ ok: false, code: "invalid", message: "salary_range" });
  });
});
