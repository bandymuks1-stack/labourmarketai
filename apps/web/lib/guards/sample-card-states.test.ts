import { describe, expect, it } from "vitest";

import { buildSampleAllTime, buildSampleWorkerPlayerCard, type SampleCardState } from "@/lib/player-card/sample-card";

/**
 * Fixtures are part of design proof: a screenshot must never communicate a
 * state the real data model would reject. These pin that each sample state is
 * INTERNALLY CONSISTENT — in particular that a card with no recorded work can
 * never claim an employer's confirmation (the state-C artefact of 2026-10-02).
 */
const NOW = new Date("2026-10-02T00:00:00Z");
const card = (state: SampleCardState) =>
  buildSampleWorkerPlayerCard({ sampleName: "Sample", sampleOrganization: "Sample kitchen", now: NOW, state });

describe("sample card states agree with the data model", () => {
  it("confirmed: provenance is derived as employer-confirmed AND the totals agree with the confirmations", () => {
    const c = card("confirmed");
    expect(c.provenance.class).toBe("EMPLOYER_CONFIRMED");
    expect(c.managerConfirmations).toBeGreaterThan(0);
    const t = buildSampleAllTime(NOW, "confirmed");
    // one approved eight-hour day per manager confirmation
    expect(t?.confirmedHours).toBe(c.managerConfirmations * 8);
  });

  it("recorded: work exists, nobody has confirmed it — never employer-confirmed", () => {
    const c = card("recorded");
    expect(c.evidenceEntries).toBeGreaterThan(0);
    expect(c.managerConfirmations).toBe(0);
    expect(c.verifiedSkills).toEqual([]);
    expect(c.provenance.class).toBe("EVIDENCE_SUPPORTED");
    expect(buildSampleAllTime(NOW, "recorded")?.confirmedHours).toBe(0);
  });

  it("empty: nothing recorded — self-declared at most, no totals, no history, no confirmations", () => {
    const c = card("empty");
    expect(c.provenance.class).toBe("SELF_DECLARED");
    expect(c.evidenceEntries).toBe(0);
    expect(c.managerConfirmations).toBe(0);
    expect(c.workHistory).toEqual([]);
    expect(c.latestEvidenceAt).toBeNull();
    expect(buildSampleAllTime(NOW, "empty")).toBeNull();
  });

  it("the default (public) sample is the confirmed state", () => {
    expect(buildSampleWorkerPlayerCard({ sampleName: "Sample", sampleOrganization: "Sample kitchen", now: NOW })).toEqual(card("confirmed"));
  });
});
