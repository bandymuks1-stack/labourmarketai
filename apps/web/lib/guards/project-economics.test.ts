import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { deriveEconomics } from "@/lib/economics/economics-model";
import type { ProjectBudgetLine } from "@/lib/economics/economics-model";

/**
 * Wagon 8 — Project Economics guard. Budget lives in the new project_budgets;
 * ACTUAL cost is read from the canonical finance_records ledger (no second cost
 * ledger); EUR only (no currency mixing); financials are manager-only.
 */

const repoRoot = join(__dirname, "..", "..", "..", "..");
const webRoot = join(__dirname, "..", "..");
const migration = readFileSync(
  join(repoRoot, "supabase/migrations/20260718160000_project_budgets.sql"),
  "utf8",
);
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

describe("project_budgets migration is additive, manager-only, EUR, reversible", () => {
  it("carries the human-gate acknowledgement", () => {
    expect(migration).toMatch(/--\s*@human-gate-approved/);
  });
  it("SELECT is manager-only (can_manage_project) — never workers", () => {
    expect(migration).toMatch(/enable row level security/i);
    expect(migration).toMatch(/for select[\s\S]*can_manage_project\(project_id\)/);
    expect(migration).not.toMatch(/profile_id = auth\.uid\(\)/); // no worker-self read of money
    expect(migration).not.toMatch(/for (insert|update|delete)/i);
  });
  it("is EUR-only — no silent currency mixing", () => {
    expect(migration).toMatch(/currency char\(3\) not null default 'EUR' check \(currency = 'EUR'\)/);
  });
  it("write RPCs are SECURITY DEFINER with a pinned search_path", () => {
    expect((migration.match(/security definer/gi) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((migration.match(/set search_path = public/gi) ?? []).length).toBeGreaterThanOrEqual(3);
  });
  it("grants EXECUTE only to authenticated, never anon", () => {
    expect(migration).toMatch(/grant execute on function[\s\S]*to authenticated/i);
    expect(migration).not.toMatch(/to anon/i);
  });
  it("ships a paired rollback file", () => {
    const down = join(repoRoot, "supabase/rollbacks/20260718160000_project_budgets.down.sql");
    expect(existsSync(down)).toBe(true);
    expect(readFileSync(down, "utf8")).toMatch(/drop table if exists public\.project_budgets/i);
  });
});

describe("actual cost reuses the canonical ledger — no second cost ledger", () => {
  it("actuals go through the canonical finance reader, not a direct table read", () => {
    const model = read("lib/economics/economics.ts");
    // Reuse the single-owner finance reader — never touch finance_records here.
    expect(model).toMatch(/listMyFinanceRecords/);
    expect(model).toMatch(/from "@\/lib\/finance\/finance"/);
    expect(model).not.toMatch(/\.from\("finance_records"\)/);
    expect(model).toMatch(/expense/);
    expect(model).toMatch(/invoice_received/);
    // No new cost/actuals table anywhere.
    expect(model).not.toMatch(/CREATE\s+TABLE/i);
    expect(migration).not.toMatch(/create table[^;]*cost_actuals/i);
  });
  it("read model degrades honestly on a missing project_budgets relation", () => {
    const model = read("lib/economics/economics.ts");
    expect(model).toMatch(/42P01/);
    expect(model).toMatch(/applied:\s*false/);
  });
  it("write actions surface needs_migration when the RPC is absent", () => {
    const actions = read("lib/economics/economics-actions.ts");
    expect(actions).toMatch(/needs_migration/);
    expect(actions).toMatch(/42883/);
  });
});

describe("deriveEconomics is pure and honest", () => {
  const line = (category: ProjectBudgetLine["category"], cents: number): ProjectBudgetLine => ({
    id: category,
    category,
    plannedAmountCents: cents,
    status: "approved",
    note: null,
  });

  it("baseline is the sum of category lines when no explicit total", () => {
    const d = deriveEconomics([line("labour", 10000), line("materials", 5000)], 12000);
    expect(d.baselineCents).toBe(15000);
    expect(d.varianceCents).toBe(3000); // 15000 - 12000 under budget
    expect(d.state).toBe("under_budget");
  });

  it("an explicit total line overrides the category sum (no double count)", () => {
    const d = deriveEconomics([line("labour", 10000), line("total", 20000)], 25000);
    expect(d.baselineCents).toBe(20000);
    expect(d.varianceCents).toBe(-5000);
    expect(d.state).toBe("over_budget");
  });

  it("null actual yields a null variance (ledger unknown, never invented)", () => {
    const d = deriveEconomics([line("labour", 10000)], null);
    expect(d.varianceCents).toBeNull();
  });

  it("no lines → no baseline", () => {
    const d = deriveEconomics([], 5000);
    expect(d.hasBaseline).toBe(false);
    expect(d.state).toBe("no_baseline");
  });
});

describe("project economics strings exist in every active-parity locale", () => {
  for (const loc of ["en", "lt", "ru", "nl", "de"]) {
    it(`${loc} has projectEconomics with all categories + states`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`));
      expect(msgs.projectEconomics?.title, loc).toBeTruthy();
      for (const c of ["labour", "materials", "total"]) {
        expect(msgs.projectEconomics?.categories?.[c], `${loc}.${c}`).toBeTruthy();
      }
      for (const s of ["over_budget", "under_budget", "on_budget", "no_baseline"]) {
        expect(msgs.projectEconomics?.state?.[s], `${loc}.${s}`).toBeTruthy();
      }
    });
  }
});
