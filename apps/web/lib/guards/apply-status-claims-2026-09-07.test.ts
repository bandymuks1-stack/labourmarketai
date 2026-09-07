import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * APPLY-STATUS CLAIMS, VERIFIED AGAINST THE DATABASE — not against a filename.
 * (Owner decision 7, 2026-09-07: stale implementation status is P0 governance
 * debt. VERIFY IMPLEMENTATION → VERIFY PRODUCTION STATE → CORRECT THE CLAIM.)
 *
 * ── WHY A SWEEP BY VERSION NUMBER IS IMPOSSIBLE ────────────────────────────
 * The obvious mechanical sweep — compare `supabase/migrations/*.sql` filenames
 * against `supabase_migrations.schema_migrations` — is WRONG in this
 * repository, and confidently so. Run on 2026-09-07 it reported 231 of 235
 * migrations "unapplied", including `agency_board_excludes_supply_v1`, which
 * had been verified applied minutes earlier by reading the function body out
 * of production. The repo's filenames do not match the ledger's versions;
 * `CLAUDE.md` says exactly this, and it is why a `db push` would be a re-run
 * hazard.
 *
 * The only sound method is the one the reconciliation used: ask the database
 * whether the OBJECT exists. That is what was done for every claim below.
 *
 * ── WHAT THIS GUARD IS, AND IS NOT ─────────────────────────────────────────
 * It is NOT a claim that these migrations are applied — a unit test cannot
 * know that, and pretending otherwise would recreate the defect one layer up.
 * It pins the CORRECTIONS: six comments that asserted, as fact, that something
 * was unapplied while it was live, and six that were right and were left
 * alone. If someone reverts a correction, this fails and names the object to
 * re-check.
 *
 * ── NEVER CHANGED TO MAKE A NUMBER LOOK BETTER ─────────────────────────────
 * Half the claims examined were correct and stay untouched. `agency_clients`,
 * `journal_profession_templates`, `worker_opportunity_seen`,
 * `worker_external_profiles`, `request_rate_limits` and `pilot_cohort_members`
 * are genuinely absent from production, and every module that says so still
 * says so.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

/** Read live from `to_regclass` / `pg_proc` on 2026-09-07. */
const PRODUCTION_STATE: Record<string, boolean> = {
  ai_runs: true,
  worker_absence_scheduling: true,
  contact_disclosure_requests: true,
  propose_booking_request_v3: true,
  save_self_declared_work_history_v1: true,
  worker_saved_opportunities: true,
  agency_clients: false,
  journal_profession_templates: false,
  pilot_cohort_members: false,
  request_rate_limits: false,
  worker_external_profiles: false,
  worker_opportunity_seen: false,
};

describe("the six stale claims are corrected", () => {
  const CASES: readonly { file: string; object: string; wasSaying: string }[] = [
    { file: "lib/ai/runtime/audit-store.ts", object: "ai_runs", wasSaying: "gated draft migration" },
    {
      file: "lib/planning/employer-availability.ts",
      object: "worker_absence_scheduling",
      wasSaying: "OWNER-GATED — not applied yet",
    },
    {
      file: "lib/profile/cv-section-import-actions.ts",
      object: "save_self_declared_work_history_v1",
      wasSaying: "DRAFT migration 20260714161000 — honest needs_migration",
    },
    {
      file: "lib/limits/request-rate-limits.ts",
      object: "propose_booking_request_v3",
      wasSaying: "draft migration 20260716121000, propose_booking_request_v3",
    },
    {
      file: "lib/opportunities/saved-opportunities.ts",
      object: "worker_saved_opportunities",
      wasSaying: "human-gated draft migration",
    },
  ];

  for (const c of CASES) {
    it(`${c.file} no longer calls ${c.object} unapplied`, () => {
      expect(PRODUCTION_STATE[c.object], `${c.object} was read as applied`).toBe(true);
      const src = read(c.file);
      expect(src, `the old claim is still there: "${c.wasSaying}"`).not.toContain(c.wasSaying);
      // And it now says WHEN it was checked, so the next reader can re-check
      // rather than trust a sentence of unknown age.
      expect(src).toContain("2026-09-07");
    });
  }

  it("the defensive code SURVIVES every correction", () => {
    // A correction that deleted the absent-object handling would trade a stale
    // comment for a crash on a fresh environment. The whole point is that the
    // code was already right and only the sentence was wrong.
    expect(read("lib/ai/runtime/audit-store.ts")).toMatch(/table not applied|NEVER throws/);
    expect(read("lib/planning/employer-availability.ts")).toContain("SCHEDULING_COLUMNS");
    expect(read("lib/opportunities/saved-opportunities.ts")).toMatch(
      /Relation missing|undefined_table/,
    );
  });
});

describe("the claims that were RIGHT are left exactly as they were", () => {
  it("nothing absent from production was quietly upgraded", () => {
    for (const object of [
      "agency_clients",
      "journal_profession_templates",
      "pilot_cohort_members",
      "request_rate_limits",
      "worker_external_profiles",
      "worker_opportunity_seen",
    ]) {
      expect(PRODUCTION_STATE[object], `${object} was read as ABSENT`).toBe(false);
    }
  });

  it("the modules behind them still say so", () => {
    // Owner decision 7 is explicit: never change a status merely to make
    // metrics look better. Six of twelve claims were correct; correcting the
    // other six must not have touched these.
    expect(read("lib/opportunities/seen.ts")).toMatch(/not applied yet|human-gated draft/);
    expect(read("lib/journal/journal-templates.ts")).toMatch(/DRAFT migration/);
  });

  it("`request_rate_limits` is still named as the absent half of its own wave", () => {
    // The correction there is precise rather than wholesale: the RPC and the
    // disclosure table from that wave ARE applied; the table is not, and the
    // comment now distinguishes them instead of calling all three drafts.
    const src = read("lib/limits/request-rate-limits.ts");
    expect(src).toContain("request_rate_limits");
    expect(src).toContain("genuinely absent");
  });
});

describe("the method itself is written down where the next sweep will look", () => {
  it("the report says a filename sweep is invalid here", () => {
    const report = readFileSync(
      join(WEB, "..", "..", "docs/reports/WINDOW-REPORT-2026-09-07.md"),
      "utf8",
    );
    expect(report).toContain("under-reports itself");
  });
});
