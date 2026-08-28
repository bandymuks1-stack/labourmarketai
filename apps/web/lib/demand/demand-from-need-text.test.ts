import { describe, expect, it, vi, beforeEach } from "vitest";

const saveDemandDraft = vi.fn();
vi.mock("./demand-drafts", () => ({
  saveDemandDraft: (...args: unknown[]) => saveDemandDraft(...args),
}));

import {
  demandTitleFromNeedText,
  startDemandFromNeedText,
} from "./demand-from-need-text";

/**
 * THE DEFECT UNDER TEST. /dashboard/market/recognize read the employer's need,
 * recognised it, listed what was missing - and then handed over a plain link to
 * a demand form that opened EMPTY. The employer typed the same sentence twice.
 *
 * These tests pin the join that closes it, and they pin it by BEHAVIOUR: what is
 * written, where, and what happens when it cannot be.
 */
describe("carrying a recognised need into the canonical demand draft", () => {
  beforeEach(() => {
    saveDemandDraft.mockReset();
    saveDemandDraft.mockResolvedValue(null);
  });

  it("writes the employer's own sentence, unedited, as the draft description", async () => {
    const need = "Reikia 4 suvirintoju Vokietijoje nuo rugsejo";
    const res = await startDemandFromNeedText(need, "lt");

    expect(res.ok).toBe(true);
    expect(saveDemandDraft).toHaveBeenCalledTimes(1);
    const [kind, payload] = saveDemandDraft.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    // The CANONICAL intake kind - not a new draft type, not a new table.
    expect(kind).toBe("company_request");
    // `capabilities` is the alias the wizard's prefill reads into `description`.
    expect(payload.capabilities).toBe(need);
  });

  it("titles the draft from the recognised work type, not from the paragraph", () => {
    // "suvirintoju" -> the welder work type; the title is the taxonomy's own
    // localized label, so the draft is not titled with a whole sentence.
    const title = demandTitleFromNeedText(
      "Reikia 4 suvirintoju Vokietijoje nuo rugsejo",
      "lt",
    );
    expect(title.length).toBeLessThan(40);
    expect(title.toLowerCase()).toContain("suvirint");
  });

  it("falls back to the employer's opening words when no work type is recognised", () => {
    const title = demandTitleFromNeedText(
      "Mums reikia zmoniu prie naujo projekto\nDetales aptarsime veliau",
      "lt",
    );
    // Their words, first line only, never an invented role.
    expect(title).toBe("Mums reikia zmoniu prie naujo projekto");
  });

  it("truncates a very long single line instead of storing a paragraph as a title", () => {
    const long = "x".repeat(200);
    const title = demandTitleFromNeedText(long, "en");
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.endsWith("\u2026")).toBe(true);
  });

  /**
   * A title matters more than it looks: `save_demand_draft` stores '—' when the
   * title is null, and the wizard's prefill reads `payload.role || title` into
   * the ROLE field. A null title would have put a literal em-dash in the role
   * box - the same class of defect as the hardcoded em-dash found in #1274.
   */
  it("never hands the draft a null or em-dash title", async () => {
    await startDemandFromNeedText("keliu darbininku Norvegijoje", "lt");
    const [, payload] = saveDemandDraft.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(payload.title).toBeTruthy();
    expect(payload.title).not.toBe("\u2014");
    expect(payload.title).not.toBe("-");
  });

  it("refuses an empty need instead of writing an empty draft", async () => {
    const res = await startDemandFromNeedText("   \n  ", "lt");
    expect(res).toEqual({ ok: false, reason: "empty" });
    expect(saveDemandDraft).not.toHaveBeenCalled();
  });

  /**
   * Honest degradation, not a swallowed error. A signed-in person holding no
   * employer workspace is an EXPECTED state; the caller must be able to tell it
   * apart from a genuine write failure, because one is explained to the user
   * and the other is a defect.
   */
  it("reports no_company distinctly from a real failure", async () => {
    saveDemandDraft.mockRejectedValueOnce(
      new Error("no company context: not_an_employer"),
    );
    expect(await startDemandFromNeedText("reikia suvirintoju", "lt")).toEqual({
      ok: false,
      reason: "no_company",
    });

    saveDemandDraft.mockRejectedValueOnce(new Error("save failed: 57014"));
    expect(await startDemandFromNeedText("reikia suvirintoju", "lt")).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  /**
   * The STRUCTURED values (work type, country, headcount, start period,
   * accommodation) are deliberately NOT written here - the wizard re-derives
   * them from the description with the same `structureNeed` call, filling only
   * fields the employer left empty. Two writers deciding what one sentence means
   * is how the two sides drift apart.
   */
  it("does not write structured values the wizard re-derives itself", async () => {
    await startDemandFromNeedText(
      "Reikia 4 suvirintoju Vokietijoje nuo rugsejo, apgyvendinimas suteikiamas",
      "lt",
    );
    const [, payload] = saveDemandDraft.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    for (const key of [
      "workType",
      "country",
      "teamSize",
      "timing",
      "accommodation",
    ]) {
      expect(payload[key], `${key} must be left to the wizard`).toBeUndefined();
    }
  });

  it("caps an absurd paste rather than passing it straight through", async () => {
    await startDemandFromNeedText("y".repeat(9000), "en");
    const [, payload] = saveDemandDraft.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(String(payload.capabilities).length).toBeLessThanOrEqual(4000);
  });
});
