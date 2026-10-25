import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  collaborationChecks,
  isCrossBorder,
  type CollaborationTopic,
} from "@/lib/collaboration/collaboration-checks";

const topics = (ctx: Parameters<typeof collaborationChecks>[0]): CollaborationTopic[] =>
  collaborationChecks(ctx).map((c) => c.topic);

describe("the mutual pre-agreement recommendation depends on the deal — no universal list (owner 2026-10-24)", () => {
  it("every deal starts with the terms and ends with the client's own requirements", () => {
    for (const dealKind of ["work_engagement", "team_offer", "service", "b2b_contract"] as const) {
      const t = topics({ dealKind });
      expect(t[0]).toBe("terms");
      expect(t[t.length - 1]).toBe("client_requirements");
    }
  });

  it("A1 / posting is suggested ONLY when both countries are known and differ", () => {
    expect(topics({ dealKind: "work_engagement", workCountry: "NO", partyCountry: "LT" })).toContain("posting_a1");
    expect(topics({ dealKind: "work_engagement", workCountry: "LT", partyCountry: "LT" })).not.toContain("posting_a1");
    expect(topics({ dealKind: "work_engagement", workCountry: "NO" })).not.toContain("posting_a1");
    expect(isCrossBorder({ workCountry: null, partyCountry: "LT" })).toBe(false);
  });

  it("a driving job names the licence as required by law; site safety only for construction", () => {
    const driver = collaborationChecks({ dealKind: "work_engagement", professionSlug: "driver" });
    expect(driver.find((c) => c.topic === "driving_licence")?.basis).toBe("law");
    expect(driver.some((c) => c.topic === "site_safety")).toBe(false);
    expect(topics({ dealKind: "work_engagement", professionSlug: "tiler" })).toContain("site_safety");
    expect(topics({ dealKind: "work_engagement", sector: "construction" })).toContain("site_safety");
  });

  it("a regulated profession's qualification is 'required by law in some cases'; otherwise it is for the parties", () => {
    const electrician = collaborationChecks({ dealKind: "work_engagement", professionSlug: "electrician" });
    expect(electrician.find((c) => c.topic === "professional_qualification")?.basis).toBe("law_if");
    const cleaner = collaborationChecks({ dealKind: "work_engagement", professionSlug: "cleaner" });
    expect(cleaner.find((c) => c.topic === "professional_qualification")?.basis).toBe("agreement");
  });

  it("a B2B contract asks about business details and insurance, never a person's identity or permit", () => {
    const t = topics({ dealKind: "b2b_contract" });
    expect(t).toEqual(expect.arrayContaining(["business_details", "insurance"]));
    expect(t).not.toContain("identity_right_to_work");
    expect(t).not.toContain("work_permit");
  });

  it("no topic is ever a platform upload — every topic has a translated sentence in all six active locales", () => {
    const all = new Set<CollaborationTopic>();
    for (const dealKind of ["work_engagement", "team_offer", "service", "b2b_contract"] as const) {
      for (const professionSlug of ["driver", "electrician", "tiler", null]) {
        for (const c of collaborationChecks({ dealKind, professionSlug, workCountry: "NO", partyCountry: "LT" })) {
          all.add(c.topic);
        }
      }
    }
    for (const l of ["lt", "en", "ru", "nl", "de", "pl"]) {
      const m = JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", `${l}.json`), "utf8")) as {
        collaborationChecks: { lead: string; topic: Record<string, string>; basis: Record<string, string> };
      };
      expect(m.collaborationChecks.lead.length).toBeGreaterThan(40);
      for (const t of all) expect(m.collaborationChecks.topic[t], `${l} ${t}`).toBeTruthy();
      for (const b of ["law", "law_if", "agreement"]) expect(m.collaborationChecks.basis[b]).toBeTruthy();
    }
  });

  it("the LT lead is the owner's sentence, verbatim", () => {
    const m = JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", "lt.json"), "utf8")) as {
      collaborationChecks: { lead: string };
    };
    expect(m.collaborationChecks.lead).toBe(
      "Prieš sudarydami galutinį susitarimą rekomenduojame abiem šalims patikrinti šiam darbui ar sandoriui aktualius dokumentus, kvalifikacijas, leidimus ir bendradarbiavimo sąlygas.",
    );
  });
});
