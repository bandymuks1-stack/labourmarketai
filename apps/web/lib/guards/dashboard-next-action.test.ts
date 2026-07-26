import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  workerNextAction,
  managerNextAction,
  customerNextAction,
  type NextActionKey,
} from "@/lib/dashboard/next-action";

/**
 * Role-based Next Action simplicity guard (slice
 * role-next-action-simplicity-v1).
 *
 * Pins:
 *   1. the pure decision maps each real state to the right action + a REAL
 *      route (never a disabled/fake target);
 *   2. the dashboard surfaces ONE primary CTA — the gradient primary lives only
 *      in <DashboardNextAction>, the old inline worker "next move" duplicate is
 *      gone, and the first-use panel no longer repeats the profile/journal CTAs;
 *   3. the Next Action copy + component never claim AI / automatic verification
 *      / matching / payment, and never name a broad confirmer role.
 */

const APP = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}
function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}

// ── 1. Pure decision logic ─────────────────────────────────────────────────

describe("workerNextAction maps real state → the right action + real route", () => {
  it("no profile → complete profile", () => {
    const a = workerNextAction({ hasProfile: false, entriesTotal: 0, confirmedCount: 0 });
    expect(a.key).toBe<NextActionKey>("worker_complete_profile");
    expect(a.href).toBe("/dashboard/profile");
  });
  it("profile but no entries → first entry", () => {
    const a = workerNextAction({ hasProfile: true, entriesTotal: 0, confirmedCount: 0 });
    expect(a.key).toBe("worker_first_entry");
    expect(a.href).toBe("/dashboard/journal");
  });
  it("entries not all confirmed → waiting", () => {
    const a = workerNextAction({ hasProfile: true, entriesTotal: 3, confirmedCount: 1 });
    expect(a.key).toBe("worker_waiting");
    expect(a.href).toBe("/dashboard/journal");
  });
  it("all entries confirmed → all confirmed", () => {
    const a = workerNextAction({ hasProfile: true, entriesTotal: 2, confirmedCount: 2 });
    expect(a.key).toBe("worker_all_confirmed");
  });
});

describe("managerNextAction is data-driven, customerNextAction is real", () => {
  it("pending entries → review inbox", () => {
    const a = managerNextAction("company", 4);
    expect(a.key).toBe("manager_review_pending");
    expect(a.href).toBe("/dashboard/inbox");
  });
  it("no pending → invite (workspace by role)", () => {
    expect(managerNextAction("company", 0)).toMatchObject({ key: "manager_invite", href: "/dashboard/company" });
    expect(managerNextAction("agency", 0)).toMatchObject({ key: "manager_invite", href: "/dashboard/agency" });
  });
  it("customer → real requests route", () => {
    expect(customerNextAction()).toMatchObject({ key: "customer_requests", href: "/dashboard/buyer" });
  });
});

describe("every action points at a real in-app route (no fake/disabled target)", () => {
  const all = [
    workerNextAction({ hasProfile: false, entriesTotal: 0, confirmedCount: 0 }),
    workerNextAction({ hasProfile: true, entriesTotal: 0, confirmedCount: 0 }),
    workerNextAction({ hasProfile: true, entriesTotal: 2, confirmedCount: 0 }),
    workerNextAction({ hasProfile: true, entriesTotal: 2, confirmedCount: 2 }),
    managerNextAction("company", 1),
    managerNextAction("company", 0),
    managerNextAction("agency", 0),
    customerNextAction(),
  ];
  it("hrefs are concrete /dashboard routes, never '#' or empty", () => {
    for (const a of all) {
      expect(a.href.startsWith("/dashboard/"), `href ${a.href}`).toBe(true);
      expect(a.href).not.toContain("#");
    }
  });
});

// ── 2. One primary CTA per surface ──────────────────────────────────────────

describe("the dashboard surfaces a single primary Next Action CTA", () => {
  const page = read("app/[locale]/dashboard/advanced/page.tsx");
  const cmp = read("components/app/dashboard-next-action.tsx");

  it("the dashboard mounts <DashboardNextAction>", () => {
    expect(page).toMatch(/<DashboardNextAction/);
  });

  it("the primary gradient CTA lives ONLY in the Next Action component", () => {
    // Page must not carry its own inline primary gradient CTA anymore (the old
    // worker "next move" duplicate was removed).
    expect(page).not.toMatch(/from-brand-blue to-brand-cyan/);
    expect(page).not.toMatch(/worker\.nextMove/);
    // The component renders exactly one primary gradient CTA.
    const hits = cmp.match(/from-brand-blue to-brand-cyan/g) ?? [];
    expect(hits.length).toBe(1);
  });

  it("the worker home no longer stacks a separate first-use panel (control room owns first-use)", () => {
    // Action-first IA v1: the standalone DashboardFirstUsePanel is gone from the
    // home; first-use guidance lives in the MyZone control room (real readiness
    // status + fast actions), so there is no duplicate first-use CTA row.
    expect(page).not.toMatch(/<DashboardFirstUsePanel/);
    expect(page).toMatch(/<MyZone\b/);
  });
});

// ── 3. Honesty: no fake AI/matching/verification/payment, no broad confirmer ─

const LOCALES = ["lt", "en"] as const;
const BAD = {
  broad: { en: /\b(parent|guardian|teacher|mentor|classmate)\b|\bfamily member\b/i, lt: /tėv|globėj|mokytoj|mentori|šeimos nar/i },
  autoAi: {
    en: /\bauto(?:matic|matically)?[- ]?(confirm|verif|match)|\bai[- ]?(confirm|verif|match)|smart match/i,
    lt: /automat\S*\s+(patvirtin|patikrin|atitik)|dirbtin\S*\s+intelekt/i,
  },
  pay: {
    en: /stripe|checkout|subscription|billing|\bpayment\b|\bpay now\b/i,
    lt: /atsiskait|prenumerat|mokėjim/i,
  },
} as const;

function nextActionStrings(loc: "lt" | "en"): string[] {
  const na = ((loadJson(`messages/${loc}.json`).auth as Record<string, unknown>)?.dashboard as Record<string, unknown>)
    ?.nextAction as Record<string, unknown> | undefined;
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(na ?? {});
  return out;
}

describe("Next Action copy stays honest in both locales", () => {
  for (const loc of LOCALES) {
    it(`${loc}: no broad confirmer / auto-AI verification-matching / payment claim`, () => {
      const strings = nextActionStrings(loc);
      expect(strings.length).toBeGreaterThan(0);
      for (const s of strings) {
        expect(BAD.broad[loc].test(s), `${loc} broad confirmer: "${s}"`).toBe(false);
        expect(BAD.autoAi[loc].test(s), `${loc} auto/AI claim: "${s}"`).toBe(false);
        expect(BAD.pay[loc].test(s), `${loc} payment claim: "${s}"`).toBe(false);
      }
    });
  }

  it("the component + decision lib carry no fake/disabled affordance", () => {
    const cmp = read("components/app/dashboard-next-action.tsx");
    const lib = read("lib/dashboard/next-action.ts");
    for (const src of [cmp, lib]) {
      // actual disabled affordances (attribute form), not the word in prose
      expect(src).not.toMatch(/\bdisabled=|aria-disabled/i);
      expect(src).not.toMatch(/href="#"/);
      expect(src).not.toMatch(/stripe|checkout|subscription/i);
    }
  });
});

// ── Negative controls — the detectors are real ─────────────────────────────

describe("the honesty detectors are real", () => {
  it("flags the bad patterns, passes the honest Next Action copy", () => {
    expect(BAD.autoAi.en.test("AI match found")).toBe(true);
    expect(BAD.pay.en.test("checkout now")).toBe(true);
    expect(BAD.broad.en.test("confirmed by a teacher")).toBe(true);
    for (const loc of LOCALES) {
      for (const s of nextActionStrings(loc)) {
        expect(BAD.broad[loc].test(s)).toBe(false);
        expect(BAD.autoAi[loc].test(s)).toBe(false);
        expect(BAD.pay[loc].test(s)).toBe(false);
      }
    }
  });
});
