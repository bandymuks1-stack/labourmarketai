import { describe, expect, it } from "vitest";

import {
  parseExternalWorkerReferral,
  toDeclaredContext,
} from "./external-referral-contract";
import { declaredContextItems } from "./model";

/**
 * The partner's `NONSTOP_WORKER_REFERRAL` v1 envelope, exactly as
 * `buildWorkerReferral` in the partner repository emits it (contract fixture,
 * not a live payload).
 */
function envelope(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    kind: "NONSTOP_WORKER_REFERRAL",
    leadId: "lead_7f3a9c2e",
    receivedAt: "2026-09-16T10:15:00.000Z",
    locale: "lt",
    worker: {
      subjectType: "INDIVIDUAL_WORKER",
      professions: [{ id: "tiler", raw: "plytelių klojėjas" }, { raw: "apdailininkas" }],
      sectors: ["construction", "finishing"],
      skills: ["plytelės", "glaistymas"],
      yearsClaimed: 7,
      languages: ["lt", "ru"],
      residenceCountry: "LT",
      availability: "AVAILABLE_NOW",
      destinations: ["NO", "SE"],
      mobilityScope: "EU_WIDE",
      freeText: "Dirbau 7 metus Norvegijoje.",
      contact: { name: "Jonas J.", phone: "+37060000000", email: "Jonas@Example.com" },
    },
    consent: {
      given: true,
      text: "Sutinku, kad mano duomenys būtų perduoti LabourMarket.ai platesnei paieškai.",
      version: "worker-broader-search-v1",
    },
    requests: ["WORKER_PROFILE", "OPPORTUNITY_SEARCH", "OPPORTUNITY_DELIVERY"],
    ...over,
  };
}

describe("external worker referral contract v1", () => {
  it("accepts the partner's envelope exactly as it emits it", () => {
    const r = parseExternalWorkerReferral(envelope());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.envelope.leadId).toBe("lead_7f3a9c2e");
    // The address is normalised for the invitation's addressee.
    expect(r.envelope.worker.contact.email).toBe("jonas@example.com");
  });

  it("NO CONSENT, NO ENVELOPE — given:false, missing text/version, absent consent", () => {
    for (const bad of [
      { consent: { given: false, text: "x", version: "worker-broader-search-v1" } },
      { consent: { given: true, text: "", version: "worker-broader-search-v1" } },
      { consent: { given: true, text: "x", version: "" } },
      { consent: undefined },
    ]) {
      const r = parseExternalWorkerReferral(envelope(bad));
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      if (!r.ok) expect(r.issues.some((i) => i.startsWith("consent"))).toBe(true);
    }
  });

  it("consent cannot be inferred from anything else: a flag on the worker is refused as unknown", () => {
    const e = envelope({ consent: undefined });
    (e.worker as Record<string, unknown>).reach = "NONSTOP_AND_MARKET";
    const r = parseExternalWorkerReferral(e);
    expect(r.ok).toBe(false);
  });

  it("is STRICT: an unknown top-level or worker key is refused, so 'verified' has nowhere to travel", () => {
    expect(parseExternalWorkerReferral(envelope({ verified: true })).ok).toBe(false);
    const e = envelope();
    (e.worker as Record<string, unknown>).verified = true;
    expect(parseExternalWorkerReferral(e).ok).toBe(false);
    const f = envelope();
    (f.worker as Record<string, unknown>).profileId = "00000000-0000-0000-0000-000000000000";
    expect(parseExternalWorkerReferral(f).ok).toBe(false);
  });

  it("refuses an unknown kind, a wrong version and an unbounded reference", () => {
    expect(parseExternalWorkerReferral(envelope({ kind: "OTHER_PARTNER_THING" })).ok).toBe(false);
    expect(parseExternalWorkerReferral(envelope({ v: 2 })).ok).toBe(false);
    expect(parseExternalWorkerReferral(envelope({ leadId: "x".repeat(121) })).ok).toBe(false);
    expect(parseExternalWorkerReferral(envelope({ leadId: "" })).ok).toBe(false);
  });

  it("issues name paths and codes only — never the values a person typed", () => {
    const r = parseExternalWorkerReferral(envelope({ leadId: "" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.join("\n")).not.toContain("Jonas");
    expect(r.issues.join("\n")).not.toContain("Norvegijoje");
  });

  it("EU_WIDE stays a scope on arrival — never materialised into member states", () => {
    const r = parseExternalWorkerReferral(envelope());
    if (!r.ok) throw new Error("fixture must parse");
    const ctx = toDeclaredContext(r.envelope);
    expect(ctx.mobilityScope).toBe("EU_WIDE");
    expect(ctx.destinations).toEqual(["NO", "SE"]);
  });

  it("declared context carries what was declared and DROPS the contact (no phone, no e-mail stored as context)", () => {
    const r = parseExternalWorkerReferral(envelope());
    if (!r.ok) throw new Error("fixture must parse");
    const ctx = toDeclaredContext(r.envelope) as unknown as Record<string, unknown>;
    expect(ctx).not.toHaveProperty("contact");
    expect(JSON.stringify(ctx)).not.toContain("+37060000000");
    expect(JSON.stringify(ctx)).not.toContain("jonas@example.com");
    expect(ctx.professions).toEqual([{ id: "tiler", raw: "plytelių klojėjas" }, { raw: "apdailininkas" }]);
    // Nothing in the stored shape can be read as a verification.
    expect(JSON.stringify(ctx).toLowerCase()).not.toContain("verif");
  });

  it("the declared context flattens into reviewable items the person can answer one by one", () => {
    const r = parseExternalWorkerReferral(envelope());
    if (!r.ok) throw new Error("fixture must parse");
    const items = declaredContextItems(toDeclaredContext(r.envelope));
    expect(items.map((i) => i.key)).toEqual([
      "professions:0",
      "professions:1",
      "sectors:0",
      "sectors:1",
      "skills:0",
      "skills:1",
      "languages:0",
      "languages:1",
      "destinations:0",
      "destinations:1",
    ]);
    expect(items[0]).toEqual({ key: "professions:0", group: "professions", label: "plytelių klojėjas" });
    // A malformed stored blob renders as nothing to review, never as a crash.
    expect(declaredContextItems(null)).toEqual([]);
    expect(declaredContextItems("garbage")).toEqual([]);
    expect(declaredContextItems({ professions: "not-a-list" })).toEqual([]);
  });
});
