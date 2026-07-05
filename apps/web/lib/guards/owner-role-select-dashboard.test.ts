import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { ASSIGNABLE_OPERATIONS_ROLES } from "@/lib/operations/assign-operations-role";

/**
 * Guards for the owner role-select UI + dashboard ready-today cleanup
 * (slice owner-role-select-dashboard-ready-today-v1).
 *
 * Part A — the role-select control must be honest:
 *   - allowed roles match the validator/RPC set;
 *   - the journal-review toggle is VISIBLY DISABLED and never submits true;
 *   - the exact "review not enabled yet" copy is present (LT + EN).
 * Part B — preparing/not-enabled dashboard cards must NOT expose primary
 *   open buttons, and live the demoted "Coming later" section.
 */

const APP = resolve(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}

// ── Part A.1 — the shared role-select control ───────────────────────────

describe("WorkerOperationsRoleForm is an honest owner control", () => {
  const src = read("components/app/worker-operations-role-form.tsx");

  it("sources its role options from the validator/RPC set (no drift)", () => {
    expect(src).toMatch(/ASSIGNABLE_OPERATIONS_ROLES/);
    expect(src).toMatch(
      /from\s+["']@\/lib\/operations\/assign-operations-role["']/,
    );
  });

  it("renders a role <select> + title input wired to the assignment", () => {
    expect(src).toMatch(/name="operationsRole"/);
    expect(src).toMatch(/name="operationsTitle"/);
    expect(src).toMatch(/name="workerId"/);
  });

  it("renders an honest review toggle: reflects real state, disabled until bridge-ready", () => {
    // The checkbox mirrors the REAL reviewActive verdict (never a fake active
    // state) and is disabled unless the relationship is genuinely bridge-ready.
    expect(src).toMatch(/type="checkbox"/);
    expect(src).toMatch(/checked=\{bridge\.reviewActive\}/);
    expect(src).toMatch(/disabled=\{!bridge\.bridgeReady\}/);
    // When not bridge-ready, an explicit disabled-state blocker note is shown.
    expect(src).toMatch(/worker-ops-review-disabled-note-/);
  });

  it("enables review only through the bridge-ready-gated toggle, never from a label", () => {
    // The enable/disable submit is gated on bridge.bridgeReady and carries the
    // desired state via the `enabled` field — there is no hardcoded enable.
    expect(src).toMatch(/bridge\.bridgeReady\s*\?/);
    expect(src).toMatch(/name="enabled"/);
    expect(src).not.toMatch(/name="journalReviewEnabled"/);
    expect(src).not.toMatch(/journal_review_enabled\s*[:=]\s*true/i);
    expect(src).not.toMatch(/journalReviewEnabled:\s*true/);
  });

  it("makes no fake AI / verification / approval / match claim", () => {
    for (const re of [
      /\bAI[\s-]*verified\b/i,
      /\bverified\b/i,
      /\bapproved\b/i,
      /\bguaranteed\b/i,
      /\bAI\s+match/i,
    ]) {
      expect(re.test(src), `must not match ${re}`).toBe(false);
    }
  });
});

// ── Part A.2 — exact disabled-review copy (LT + EN) ─────────────────────

describe("disabled journal-review copy is present verbatim", () => {
  const LT =
    "Darbo žurnalo peržiūra dar neįjungta. Pirma reikia sujungti žurnalo kontekstą.";
  const EN =
    "Work journal review is not enabled yet. The journal context must be connected first.";
  for (const [locale, phrase] of [
    ["lt", LT],
    ["en", EN],
  ] as const) {
    it(`${locale}.json carries the company + agency review-disabled note`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`));
      for (const ns of ["company", "agency"] as const) {
        const assign =
          json.roleDashboards[ns].workers.operations.assign;
        expect(assign.reviewDisabledNote).toBe(phrase);
      }
    });
  }
});

// ── Part A.3 — wired into both sections, gated on canAssignRoles ────────

describe("company + agency sections mount the gated role-select control", () => {
  for (const s of [
    "components/app/company-workers-section.tsx",
    "components/app/agency-workers-section.tsx",
  ]) {
    it(`${s} renders WorkerOperationsRoleForm behind canAssignRoles`, () => {
      const src = read(s);
      expect(src).toMatch(/canAssignRoles/);
      expect(src).toMatch(/canAssignRoles\s*\?\s*\(\s*<WorkerOperationsRoleForm/);
    });
  }
  // Direction A (2026-07-05): only the canonical company page mounts a
  // workers section now — /dashboard/agency is a redirect stub into it.
  for (const p of ["app/[locale]/dashboard/company/page.tsx"]) {
    it(`${p} passes canAssignRoles to the section`, () => {
      expect(read(p)).toMatch(/canAssignRoles/);
    });
  }
});

// ── Part A.4 — server actions never enable review ───────────────────────

describe("assign actions never enable journal review", () => {
  for (const a of ["lib/company/actions.ts", "lib/agency/actions.ts"]) {
    it(`${a} forwards only role/title (no review-enable)`, () => {
      const src = read(a);
      expect(src).toMatch(/assign(Company|Agency)WorkerRoleAction/);
      expect(src).not.toMatch(/journalReviewEnabled:\s*true/);
      expect(src).not.toMatch(/p_journal_review_enabled:\s*true/);
    });
  }
});

// ── Part B — dashboard ready-today cleanup ──────────────────────────────

describe("the future-module grid is not mounted on the active room or account", () => {
  // Superseded PR #204: the future-module grid is retired from the nav surfaces
  // — neither the active /dashboard room nor account (settings only) mounts it.
  const dashboard = read("app/[locale]/dashboard/page.tsx");
  const account = read("app/[locale]/dashboard/account/page.tsx");

  it("the active dashboard room renders NO FeatureAvailabilityGrid", () => {
    expect(dashboard).not.toMatch(/<FeatureAvailabilityGrid\b/);
  });

  it("the account (settings-only) surface renders NO FeatureAvailabilityGrid", () => {
    expect(account).not.toMatch(/<FeatureAvailabilityGrid\b/);
  });
});

describe("FeatureAvailabilityGrid never gives preparing cards a primary CTA", () => {
  const src = read("components/app/feature-availability-grid.tsx");

  it("supports a comingLater / preparing-only mode", () => {
    expect(src).toMatch(/comingLater/);
    expect(src).toMatch(/filterMode\s*===\s*"preparing"/);
  });

  it("gates the navigating <Link> on active && primaryRoute (the only Link)", () => {
    expect(src).toMatch(/isFeatureActive/);
    expect(src).toMatch(/active\s*&&\s*f\.primaryRoute\s*\?\s*\(\s*<Link/);
    const links = src.match(/<Link\b/g) ?? [];
    expect(links.length).toBe(1);
  });
});

describe("Coming-later heading copy present (LT + EN)", () => {
  it("lt = 'Vėliau įjungiami moduliai', en = 'Modules coming later'", () => {
    const lt = JSON.parse(read("messages/lt.json"));
    const en = JSON.parse(read("messages/en.json"));
    expect(lt.dashboard.comingLater.title).toBe("Vėliau įjungiami moduliai");
    expect(en.dashboard.comingLater.title).toBe("Modules coming later");
  });
});

// ── Sanity: the assignable set is exactly the conservative five ─────────

describe("assignable role set is the conservative five", () => {
  it("matches worker/foreman/project_manager/company_admin/agency_admin", () => {
    expect([...ASSIGNABLE_OPERATIONS_ROLES].sort()).toEqual(
      [
        "agency_admin",
        "company_admin",
        "foreman",
        "project_manager",
        "worker",
      ].sort(),
    );
  });
});
