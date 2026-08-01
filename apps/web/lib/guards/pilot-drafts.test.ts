/**
 * Guards for PR B — pilot draft flows (feat/cc/pilot-draft-flows).
 *
 *   1. Migration 0016 keeps pilot_drafts strictly owner-scoped with
 *      explicit GRANTs and a closed-only visibility CHECK.
 *   2. The server module sanitises unknown keys before any write and
 *      never gives the service_role table access.
 *   3. The three role dashboard pages call `requireRoleOrRedirect` as
 *      their FIRST awaited call (no data fetch before the auth gate).
 *   4. No surface affirms matching / verification / sharing-by-default.
 *   5. The admin metrics tile is read-only — no mutation imports.
 *
 * These tests read source files as plain text (no runtime imports), so
 * they catch regressions even if a later PR rewires the components.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Guard: 0016 migration is owner-only, closed-by-default, explicit grants", () => {
  const sql = read("../../supabase/migrations/0016_pilot_drafts.sql");

  it("enables RLS on pilot_drafts", () => {
    expect(sql).toMatch(
      /alter table public\.pilot_drafts enable row level security/i,
    );
  });

  it("select policy allows owner OR admin only", () => {
    const block = sql.match(
      /create policy pilot_drafts_select[\s\S]*?;/i,
    );
    expect(block?.[0] ?? "").toMatch(
      /profile_id\s*=\s*auth\.uid\(\)\s+or\s+public\.is_admin\(\)/i,
    );
    // Defence in depth: the select policy must NOT open a reader path
    // to employers / agencies / "shared" roles.
    expect(block?.[0] ?? "").not.toMatch(/is_employer\(\)/);
    expect(block?.[0] ?? "").not.toMatch(/is_agency\(\)/);
  });

  it("insert/update/delete policies anchor at profile_id = auth.uid()", () => {
    for (const verb of ["insert", "update", "delete"] as const) {
      const re = new RegExp(
        `create policy pilot_drafts_${verb}[\\s\\S]*?profile_id\\s*=\\s*auth\\.uid\\(\\)`,
        "i",
      );
      expect(sql, `${verb} policy missing owner anchor`).toMatch(re);
    }
  });

  it("draft_type CHECK is locked to the three pilot types", () => {
    const m = sql.match(
      /draft_type[\s\S]*?check\s*\(\s*draft_type\s+in\s*\(([^)]+)\)/i,
    );
    expect(m, "draft_type CHECK not found").not.toBeNull();
    const list = (m?.[1] ?? "").toLowerCase();
    expect(list).toMatch(/'company_request'/);
    expect(list).toMatch(/'agency_offer'/);
    expect(list).toMatch(/'buyer_request'/);
    // Future-public guard: nothing like 'public' / 'shared' may sneak in.
    expect(list).not.toMatch(/'public'/);
    expect(list).not.toMatch(/'shared'/);
  });

  it("visibility CHECK is closed-only (no public widening)", () => {
    const m = sql.match(
      /visibility[\s\S]*?check\s*\(\s*visibility\s+in\s*\(([^)]+)\)/i,
    );
    expect(m, "visibility CHECK not found").not.toBeNull();
    const list = (m?.[1] ?? "").toLowerCase();
    expect(list).toMatch(/'closed'/);
    expect(list).not.toMatch(/'public'/);
    expect(list).not.toMatch(/'shared'/);
  });

  it("UNIQUE(profile_id, draft_type) enforces one draft per type per user", () => {
    expect(sql).toMatch(
      /unique\s*\(\s*profile_id\s*,\s*draft_type\s*\)/i,
    );
  });

  it("grants are EXPLICIT to authenticated only (no service_role)", () => {
    expect(sql).toMatch(
      /grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+public\.pilot_drafts\s+to\s+authenticated/i,
    );
    // No service_role grant — PR B requirement #10. service_role would
    // bypass RLS entirely; the table is intentionally invisible to it.
    expect(sql).not.toMatch(/grant[\s\S]*?\bservice_role\b/i);
  });

  it("ON DELETE CASCADE from profiles — pilot data follows profile deletion", () => {
    expect(sql).toMatch(
      /profile_id[\s\S]*?references\s+public\.profiles\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
  });
});

describe("Guard: pilot-drafts server module sanitises + stays owner-scoped", () => {
  const src = read("lib/demand/demand-drafts.ts");

  it("uses the user-scoped supabase client (createClient from server.ts)", () => {
    expect(src).toMatch(
      /from\s+["']@\/lib\/supabase\/server["']/,
    );
    // No service_role / admin client imports — must not bypass RLS.
    expect(src).not.toMatch(/createServiceRoleClient/);
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("scopes every write to the authenticated user (RPC, no caller profile_id)", () => {
    // saveDemandDraft resolves the user then writes through the owner-scoped
    // save_demand_draft RPC, which sets profile_id = auth.uid() server-side; it
    // never accepts a caller-supplied profile_id.
    expect(src).toMatch(
      /saveDemandDraft[\s\S]*?auth\.getUser\(\)[\s\S]*?save_demand_draft/,
    );
    // deleteDemandDraft still filters by the authenticated user.
    expect(src).toMatch(
      /deleteDemandDraft[\s\S]*?auth\.getUser\(\)[\s\S]*?\.eq\(\s*["']profile_id["']\s*,\s*user\.id\s*\)/,
    );
  });

  it("folds onto the canonical intake — customer_requests, not pilot_drafts", () => {
    // Structured demand is consolidated to customer_requests (status='draft');
    // the retired pilot_drafts table is no longer read or written here.
    expect(src).toMatch(/from\(["']customer_requests["']\)/);
    expect(src).toMatch(/save_demand_draft/);
    expect(src).toMatch(/["']status["']\s*,\s*["']draft["']/);
    expect(src).not.toMatch(/from\(["']pilot_drafts["']\)/);
  });

  it("sanitise() enforces a per-type key allowlist", () => {
    expect(src).toMatch(/ALLOWED_KEYS\s*:\s*Record<DraftType,\s*ReadonlySet<string>>/);
    expect(src).toMatch(/if\s*\(!allowed\.has\(key\)\)\s*continue/);
    // Length cap defence in depth.
    expect(src).toMatch(/MAX_FIELD_LEN/);
    expect(src).toMatch(/MAX_NOTES_LEN/);
  });

  it("does not affirm matching / verified / shared / public", () => {
    const lower = src.toLowerCase();
    // The server module must not implement any "match candidate" / "verify"
    // / "share" / "publish" path. These words are reserved for later
    // explicit-consent slices.
    expect(lower).not.toMatch(/\bmatch\(/);
    expect(lower).not.toMatch(/\bpublish\(/);
    expect(lower).not.toMatch(/\bshare\(/);
    expect(lower).not.toMatch(/\bverify\(/);
  });
});

describe("Guard: server-action wrapper is a thin pass-through", () => {
  const src = read("lib/demand/demand-drafts-actions.ts");

  it("declares 'use server' as the file directive", () => {
    expect(src.trimStart()).toMatch(/^"use server"/);
  });

  it("re-exports only save/delete (no list-all / share / publish)", () => {
    expect(src).toMatch(/export\s+async\s+function\s+saveDemandDraftAction/);
    expect(src).toMatch(/export\s+async\s+function\s+deleteDemandDraftAction/);
    expect(src).not.toMatch(/shareDemandDraftAction/);
    expect(src).not.toMatch(/publishDemandDraftAction/);
  });
});

describe("Guard: role dashboard pages gate BEFORE any data fetch", () => {
  // Direction A (2026-07-05): /dashboard/agency is a redirect stub into the
  // canonical company workspace; the agency_offer intake lives on the demand
  // wizard (partner intent). W3 rows 7/8/25: the company page's light draft
  // form was absorbed by the full wizard (whose save-draft leg uses the same
  // canonical action) — only the buyer renders a DemandDraftForm now.
  for (const role of ["buyer"] as const) {
    it(`${role}/page.tsx calls requireRoleOrRedirect before getDemandDraft`, () => {
      const src = read(`app/[locale]/dashboard/${role}/page.tsx`);
      const requireAt = src.indexOf("requireRoleOrRedirect");
      const fetchAt = src.indexOf("getDemandDraft(");
      expect(requireAt, `${role}: requireRoleOrRedirect missing`).toBeGreaterThan(-1);
      expect(fetchAt, `${role}: getDemandDraft missing`).toBeGreaterThan(-1);
      expect(
        requireAt,
        `${role}: requireRoleOrRedirect must precede getDemandDraft`,
      ).toBeLessThan(fetchAt);
    });
  }

  it("company/page.tsx gates before its demand reads and mounts the wizard, not the light form", () => {
    const src = read("app/[locale]/dashboard/company/page.tsx");
    const requireAt = src.indexOf("requireRoleOrRedirect");
    const fetchAt = src.indexOf("listOwnCustomerRequests(");
    expect(requireAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(-1);
    expect(requireAt).toBeLessThan(fetchAt);
    expect(src).not.toMatch(/DemandDraftForm/);
    expect(src).toMatch(/DemandRequestButton/);
  });

  it("buyer page uses the DB slug 'customer' (not 'buyer') for the role gate", () => {
    // Active rolebook: workers / company / agency / customer. The URL is
    // /buyer for human readability, but the gate maps to the DB slug.
    const src = read("app/[locale]/dashboard/buyer/page.tsx");
    expect(src).toMatch(/requireRoleOrRedirect\(\s*locale\s*,\s*["']customer["']\s*\)/);
  });

  it("each remaining light-form page renders the DemandDraftForm for its own draft_type", () => {
    const cases = [{ role: "buyer", draftType: "buyer_request" }] as const;
    for (const { role, draftType } of cases) {
      const src = read(`app/[locale]/dashboard/${role}/page.tsx`);
      expect(src).toMatch(
        new RegExp(`draftType=\\{?["']${draftType}["']\\}?`),
      );
    }
    // The company draft leg lives in the wizard, on the same canonical action.
    const wizard = read("components/app/demand-request-button.tsx");
    expect(wizard).toMatch(/saveDemandDraftAction\("company_request"/);
  });
});

describe("Guard: admin metrics surface is READ-ONLY", () => {
  it("admin dashboard page imports getDemandDraftCounts only — no save/delete", () => {
    const src = read("app/[locale]/dashboard/admin/page.tsx");
    expect(src).toMatch(/getDemandDraftCounts/);
    // No mutation paths in the admin metrics tile.
    expect(src).not.toMatch(/saveDemandDraft/);
    expect(src).not.toMatch(/deleteDemandDraft/);
    expect(src).not.toMatch(/DemandDraftForm/);
  });

  it("admin per-user page lists drafts read-only — no form / save / delete", () => {
    const src = read("app/[locale]/dashboard/admin/users/[id]/page.tsx");
    expect(src).toMatch(/listDemandDraftsForProfile/);
    expect(src).not.toMatch(/saveDemandDraft/);
    expect(src).not.toMatch(/deleteDemandDraft/);
    expect(src).not.toMatch(/DemandDraftForm/);
  });
});

describe("Guard: no public exposure / fake matching / billing in this slice", () => {
  // Spot-check every file added or rewritten in this PR.
  const files = [
    "lib/demand/demand-drafts.ts",
    "lib/demand/demand-drafts-actions.ts",
    "components/app/demand-draft-form.tsx",
    "app/[locale]/dashboard/company/page.tsx",
    "app/[locale]/dashboard/buyer/page.tsx",
  ];

  for (const f of files) {
    it(`${f} has no billing / payment / fake-match surface`, () => {
      const lower = read(f).toLowerCase();
      expect(lower).not.toMatch(/\bstripe\b/);
      expect(lower).not.toMatch(/\bcheckout\b/);
      expect(lower).not.toMatch(/\bsubscription\b/);
      // "match" appears as a substring in legitimate words (e.g. "match the
      // shape"); restrict to obvious function/route names.
      expect(lower).not.toMatch(/\bmatchcandidate\b/);
      expect(lower).not.toMatch(/\bmatchworker\b/);
      expect(lower).not.toMatch(/\/api\/match\b/);
    });
  }
});

describe("Guard: i18n surface ships the draftForm + admin keys in LT and EN", () => {
  for (const locale of ["lt", "en"] as const) {
    const json = JSON.parse(read(`messages/${locale}.json`)) as Record<
      string,
      unknown
    >;
    const role = json.roleDashboards as Record<string, Record<string, unknown>>;

    it(`${locale}.json: agency/buyer have draftForm subtrees (company's died with the light form, W3 7/8/25)`, () => {
      for (const r of ["agency", "buyer"] as const) {
        const df = (role?.[r] as Record<string, unknown> | undefined)
          ?.draftForm;
        expect(df, `${locale}.${r}.draftForm missing`).toBeTruthy();
        const dfo = df as Record<string, unknown>;
        for (const k of [
          "saveButton",
          "saving",
          "deleteButton",
          "deleting",
          "savedPrivate",
          "saveError",
          "deleteError",
        ]) {
          expect(dfo[k], `${locale}.${r}.draftForm.${k} missing`).toBeTruthy();
        }
      }
    });

    it(`${locale}.json: admin namespace has the drafts metrics keys`, () => {
      const admin = json.admin as Record<string, unknown> | undefined;
      const drafts = admin?.drafts as Record<string, unknown> | undefined;
      expect(drafts, `${locale}.admin.drafts missing`).toBeTruthy();
      for (const k of ["title", "help", "total"]) {
        expect(drafts?.[k], `${locale}.admin.drafts.${k} missing`).toBeTruthy();
      }
      const byType = drafts?.byType as Record<string, unknown> | undefined;
      for (const k of ["company", "agency", "buyer"]) {
        expect(byType?.[k], `${locale}.admin.drafts.byType.${k} missing`).toBeTruthy();
      }
    });
  }
});
