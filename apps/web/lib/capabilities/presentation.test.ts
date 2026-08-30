import { describe, expect, it, vi } from "vitest";

/**
 * The presentation adapter's rules: right key + right values per capability,
 * honest null on shapes it does not understand, notes trimmed. Localized
 * RENDERING is the message catalogs' job (parity-guarded across the five
 * active locales); here the translator is a probe that records its inputs.
 */

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => {
    return (key: string, values?: Record<string, string | number>) =>
      JSON.stringify({ namespace, key, values: values ?? null });
  },
}));

import { summarizeCapabilityResult } from "./presentation";

const parse = (s: string | null) =>
  s === null ? null : (JSON.parse(s) as { namespace: string; key: string; values: Record<string, unknown> | null });

describe("summarizeCapabilityResult", () => {
  it("profile.get: names the profile facts and the worker state, with notSet fallbacks", async () => {
    const out = parse(
      await summarizeCapabilityResult(
        "profile.get",
        {
          profile: { fullName: "Donatas", country: "LT", locale: "lt", activeRole: "worker" },
          worker: { status: "exists", workerId: "w-1" },
        },
        "lt",
      ),
    );
    expect(out?.namespace).toBe("capabilities");
    expect(out?.key).toBe("profileSummary");
    expect(out?.values).toMatchObject({ name: "Donatas", country: "LT", role: "worker" });

    const missing = parse(
      await summarizeCapabilityResult(
        "profile.get",
        { profile: { fullName: null, country: null, locale: null, activeRole: null }, worker: { status: "none" } },
        "en",
      ),
    );
    // Null facts render through the localized notSet key, never literally.
    for (const field of ["name", "country", "language", "role"] as const) {
      expect(String(missing?.values?.[field])).toContain('"key":"notSet"');
    }
    expect(String(missing?.values?.worker)).toContain('"key":"workerNone"');
  });

  it("living_cv.skills.get: counts skills and verified skills; empty list gets its own honest key", async () => {
    const out = parse(
      await summarizeCapabilityResult(
        "living_cv.skills.get",
        {
          workerId: "w-1",
          skills: [
            { skillId: "s1", verified: true },
            { skillId: "s2", verified: false },
            { skillId: "s3", verified: true },
          ],
        },
        "en",
      ),
    );
    expect(out?.key).toBe("skillsSummary");
    expect(out?.values).toEqual({ count: 3, verified: 2 });

    const empty = parse(
      await summarizeCapabilityResult("living_cv.skills.get", { workerId: "w-1", skills: [] }, "en"),
    );
    expect(empty?.key).toBe("skillsEmpty");
  });

  it("journal.create_draft: summarizes the exact preview; site switches the key; long notes are trimmed", async () => {
    const withSite = parse(
      await summarizeCapabilityResult(
        "journal.create_draft",
        {
          preview: { workDate: "2026-08-30", siteName: "Objektas X", notes: "Klojau plyteles, 6 valandos." },
          confirmationToken: "t",
        },
        "lt",
      ),
    );
    expect(withSite?.key).toBe("draftSummaryWithSite");
    expect(withSite?.values).toMatchObject({ date: "2026-08-30", site: "Objektas X" });

    const noSite = parse(
      await summarizeCapabilityResult(
        "journal.create_draft",
        { preview: { workDate: "2026-08-30", siteName: null, notes: "x".repeat(500) }, confirmationToken: "t" },
        "lt",
      ),
    );
    expect(noSite?.key).toBe("draftSummary");
    const notes = String(noSite?.values?.notes);
    expect(notes.length).toBeLessThanOrEqual(140);
    expect(notes.endsWith("…")).toBe(true);
  });

  it("journal.create_draft: the resolved context is NAMED; a rule-C outcome lists the labeled options", async () => {
    // Compound string: draftSummary followed by draftContext — assert both
    // keys fired with the right values (raw probe output, not re-parsed).
    const withContext = await summarizeCapabilityResult(
      "journal.create_draft",
      {
        preview: {
          workDate: "2026-08-30",
          siteName: null,
          notes: "Testas",
          engagementContextId: "ec-1",
          engagementLabel: "Dev Statyba",
        },
        confirmationToken: "t",
      },
      "lt",
    );
    expect(withContext).toContain('"key":"draftSummary"');
    expect(withContext).toContain('"key":"draftContext"');
    expect(withContext).toContain("Dev Statyba");

    const choice = parse(
      await summarizeCapabilityResult(
        "journal.create_draft",
        {
          status: "engagement_choice_required",
          options: [
            { id: "a", label: "Dev Statyba" },
            { id: "b", label: "Nonstop Group" },
          ],
        },
        "lt",
      ),
    );
    expect(choice?.key).toBe("draftChooseContext");
    expect(choice?.values).toEqual({ options: "Dev Statyba, Nonstop Group" });
  });

  it("journal.confirm: reports the REAL pipeline numbers, never invented ones", async () => {
    const out = parse(
      await summarizeCapabilityResult(
        "journal.confirm",
        { entryId: "e-1", skills: { status: "completed", added: 2, strengthened: 1, reviewNeeded: 0 } },
        "en",
      ),
    );
    expect(out?.key).toBe("confirmSummary");
    expect(out?.values).toEqual({ added: 2, strengthened: 1, reviewNeeded: 0 });
  });

  it("unknown capability or unrecognized data shape → null, never a guess", async () => {
    expect(await summarizeCapabilityResult("future.capability", { anything: 1 }, "en")).toBeNull();
    expect(await summarizeCapabilityResult("profile.get", {}, "en")).toBeNull();
    expect(await summarizeCapabilityResult("journal.create_draft", { preview: {} }, "en")).toBeNull();
    expect(await summarizeCapabilityResult("journal.confirm", { entryId: 5 }, "en")).toBeNull();
  });
});
