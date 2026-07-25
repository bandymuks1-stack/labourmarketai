import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { deriveNeedSkills } from "@/lib/market/need-skills";
import {
  matchWorkerToNeed,
  compareMatches,
  type MatchNeed,
  type MatchSubject,
  type MatchResultV1,
} from "@/lib/market/match-v1";
import {
  computeOpportunityFit,
  workerOpportunityNextAction,
  isApprovedRouteRow,
  safeApprovedCompanyName,
} from "@/lib/opportunities/opportunity-fit";

/**
 * WORKER OPPORTUNITY BOARD GUARDS (PR5, Tasks 5+7).
 *
 * The board must use the SAME PR4 canonical engine (inverted), never a
 * second matching system; must not depend on ESCO; must explain matches and
 * gaps; must never show a fake apply/contact CTA or fake trust; and must not
 * introduce a duplicate marketplace page.
 */

const APP_ROOT = join(__dirname, "..", "..");

/** Demand role text → need, exactly like the loader does it. */
function needFromRole(roleText: string, country: string | null = "LT"): MatchNeed {
  const derived = deriveNeedSkills({
    roleOrWorkType: roleText.replace(/[_-]+/g, " "),
  });
  return {
    skillIds: derived.skillSlugs,
    needSource: derived.source,
    professionSlug: derived.professionSlug,
    country,
  };
}

const subjectOf = (
  professionSlug: string | null,
  skills: [string, "manager_confirmed" | "work_journal" | "self_declared"][],
): MatchSubject => ({
  professionSlug,
  skills: skills.map(([uri, evidence]) => ({ uri, evidence })),
  country: "LT",
  availabilityStatus: "available",
});

const rankNeeds = (
  subject: MatchSubject,
  needs: { label: string; need: MatchNeed }[],
): { label: string; match: MatchResultV1 }[] =>
  needs
    .map((n) => ({ label: n.label, match: matchWorkerToNeed(n.need, subject) }))
    .sort((a, b) => compareMatches(a.match, b.match));

describe("scenarios: workers see THEIR demands first (same engine, inverted)", () => {
  const demands = [
    { label: "warehouse", need: needFromRole("warehouse_worker — order picking, pallet handling") },
    { label: "kitchen", need: needFromRole("kitchen_helper — dishwashing, kitchen help") },
    { label: "office", need: needFromRole("office administrator — data entry, worked with excel") },
    { label: "masonry", need: needFromRole("mason — bricklaying, blockwork") },
  ];

  it("1. warehouse worker ranks the warehouse demand first", () => {
    const s = subjectOf("warehouse_worker", [
      ["order-picking", "work_journal"],
      ["pallet-handling", "self_declared"],
      ["warehouse-operations", "manager_confirmed"],
    ]);
    expect(rankNeeds(s, demands)[0].label).toBe("warehouse");
  });

  it("2. kitchen/dishwashing evidence ranks the kitchen demand first", () => {
    const s = subjectOf("kitchen_helper", [
      ["kitchen-help", "work_journal"],
      ["dishwashing", "work_journal"],
    ]);
    expect(rankNeeds(s, demands)[0].label).toBe("kitchen");
  });

  it("3. office/Excel evidence ranks the admin demand first", () => {
    const s = subjectOf("office_administrator", [
      ["data-entry", "work_journal"],
      ["office-software", "self_declared"],
      ["document-handling", "work_journal"],
    ]);
    expect(rankNeeds(s, demands)[0].label).toBe("office");
  });

  it("4. construction worker ranks the masonry demand first", () => {
    const s = subjectOf("mason", [
      ["bricklaying", "manager_confirmed"],
      ["blockwork", "work_journal"],
      ["mortar-prep", "self_declared"],
    ]);
    expect(rankNeeds(s, demands)[0].label).toBe("masonry");
  });

  it("6. missing required skills are listed clearly", () => {
    const s = subjectOf("warehouse_worker", [["order-picking", "work_journal"]]);
    const m = matchWorkerToNeed(demands[0].need, s);
    const missing = m.gaps.find((g) => g.code === "skills_missing");
    expect(missing).toBeTruthy();
    expect(missing!.code === "skills_missing" && missing!.uris.length).toBeGreaterThan(0);
  });
});

describe("5. no skills → honest improvement state, never a fake fit", () => {
  it("profile fit says missing_profile_info and next action is add_work_evidence", () => {
    const fit = computeOpportunityFit(
      { hasWorkType: false, hasSkills: false, countries: [], availabilitySet: false, documentsCount: 0 },
      { id: "x", roleText: "warehouse_worker", country: "LT", teamSize: null, startPeriod: null, accommodation: null },
    );
    expect(fit.status).toBe("missing_profile_info");
    const next = workerOpportunityNextAction({
      profileFitStatus: fit.status,
      hasAnySkill: false,
      matchStatus: "weak",
    });
    expect(next).toBe("add_work_evidence");
  });

  it("skill-less subject never reaches strong/possible", () => {
    const m = matchWorkerToNeed(needFromRole("warehouse_worker order picking"), {
      skills: [],
    });
    expect(["weak", "insufficient_data"]).toContain(m.status);
    expect(m.missingData).toContain("no_subject_skills");
  });
});

describe("7. no ESCO dependency", () => {
  it("board matching runs entirely on slugs (no esco anywhere in the flow)", () => {
    const need = needFromRole("cleaner — cleaning and laundry work");
    expect(need.skillIds!.length).toBeGreaterThan(0);
    const m = matchWorkerToNeed(need, subjectOf("cleaner", [["cleaning-services", "work_journal"], ["laundry", "work_journal"]]));
    expect(m.skillFit!.matchedTotal).toBeGreaterThan(0);
  });

  it("the loader never keys on esco_uri (source pin)", () => {
    // Since the worker-interest-signal slice the subject/need builders live
    // in shared modules (ONE pipeline for the board AND interest snapshots).
    const loader = readFileSync(
      join(APP_ROOT, "lib", "opportunities", "load-worker-opportunities.ts"),
      "utf8",
    );
    const workerSubject = readFileSync(
      join(APP_ROOT, "lib", "opportunities", "worker-subject.ts"),
      "utf8",
    );
    const needModule = readFileSync(
      join(APP_ROOT, "lib", "opportunities", "opportunity-need.ts"),
      "utf8",
    );
    for (const src of [loader, workerSubject, needModule]) {
      expect(src).not.toMatch(/esco_uri/);
    }
    expect(workerSubject).toMatch(/skills \( slug \)/);
    expect(needModule).toMatch(/deriveNeedSkills/);
    expect(loader).toMatch(/needFromRoleText/);
    expect(loader).toMatch(/buildOwnWorkerContext/);
    expect(loader).toMatch(/compareMatches/);
  });
});

describe("8. display names are never canonical identity", () => {
  it("a display-name skill on the worker side matches nothing", () => {
    const m = matchWorkerToNeed(
      { skillIds: ["order-picking"], needSource: "human_structured" },
      { skills: [{ uri: "Order picking & packing", evidence: "work_journal" }] },
    );
    expect(m.skillFit?.matchedTotal).toBe(0);
  });
});

describe("9. no fake verification / trust", () => {
  it("company name shows ONLY from the approved-route RPC column", () => {
    expect(safeApprovedCompanyName({ company_name: "  " })).toBeNull();
    expect(safeApprovedCompanyName({})).toBeNull();
    expect(safeApprovedCompanyName({ company_name: "Real Verified OÜ" })).toBe("Real Verified OÜ");
  });

  it("rows without an approved-route signal stay hidden (default-closed)", () => {
    expect(isApprovedRouteRow({})).toBe(false);
    expect(isApprovedRouteRow({ route_status: "not_reviewed" })).toBe(false);
    expect(isApprovedRouteRow({ route_status: "approved_direct_partner" })).toBe(true);
  });

  it("no fake apply/contact CTA — the ONLY action is the real interest signal", () => {
    const page = readFileSync(
      join(APP_ROOT, "app", "[locale]", "dashboard", "opportunities", "page.tsx"),
      "utf8",
    );
    // Applications/direct contact still do not exist — the board must not
    // pretend they do. The express-interest flow (worker-interest-signal
    // slice) is REAL: a demand_interest_signals row behind an owner-gated
    // migration, rendered ONLY when the table exists (interestAvailable),
    // with the honest internal-signal copy. Anything beyond it stays banned.
    expect(page).not.toMatch(/apply now|contactCompany|applyCta|mailto:/i);
    expect(page).toMatch(/data-next-action/);
    // Stage B: capability flags travel in the canonical marketplace view.
    expect(page).toMatch(/result\.capabilities\.interestAvailable\s*\?/);
    expect(page).toMatch(/WorkerInterestButton/);
    expect(page).toMatch(/internalNote/);
  });
});

describe("10. no duplicate marketplace/opportunity route", () => {
  it("exactly one opportunities page exists under the dashboard", () => {
    const dashDir = join(APP_ROOT, "app", "[locale]", "dashboard");
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, name.name);
        if (name.isDirectory()) walk(p);
        else if (/opportunit/i.test(p) && name.name === "page.tsx") found.push(p);
      }
    };
    walk(dashDir);
    expect(found.length, found.join(", ")).toBe(1);
  });
});

describe("worker next-action contract is the honest closed set", () => {
  it("maps deterministically", () => {
    expect(
      workerOpportunityNextAction({ profileFitStatus: "possible_match", hasAnySkill: true, matchStatus: "strong" }),
    ).toBe("review_match");
    expect(
      workerOpportunityNextAction({ profileFitStatus: "possible_match", hasAnySkill: true, matchStatus: "insufficient_data" }),
    ).toBe("review_opportunity");
    expect(
      workerOpportunityNextAction({ profileFitStatus: "missing_profile_info", hasAnySkill: true, matchStatus: "weak" }),
    ).toBe("complete_profile");
  });
});
