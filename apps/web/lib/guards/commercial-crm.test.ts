import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Wagon 10 — Commercial CRM guard. Owner-scoped proposals + contracts; invoices
 * and payments are NOT duplicated (they stay in the finance layer); no
 * e-signature is created or claimed.
 */

const repoRoot = join(__dirname, "..", "..", "..", "..");
const webRoot = join(__dirname, "..", "..");
const migration = readFileSync(
  join(repoRoot, "supabase/migrations/20260718190000_commercial_crm.sql"),
  "utf8",
);
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

describe("commercial migration is additive, owner-scoped, EUR, reversible", () => {
  it("carries the human-gate acknowledgement", () => {
    expect(migration).toMatch(/--\s*@human-gate-approved/);
  });
  it("both tables enable RLS with owner-scoped SELECT; writes RPC-only", () => {
    expect((migration.match(/enable row level security/gi) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((migration.match(/owner_id = auth\.uid\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(migration).not.toMatch(/for (insert|update|delete)/i);
  });
  it("is EUR-only", () => {
    expect((migration.match(/currency = 'EUR'/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it("does NOT create an invoices/payments/finance table (reuse the finance layer)", () => {
    expect(migration).not.toMatch(/create table[^;]*\b(invoices?|payments?|finance_records)\b/i);
  });
  it("creates no e-signature — only a document reference", () => {
    expect(migration).toMatch(/signed_document_ref/);
    expect(migration).not.toMatch(/docusign|hellosign|adobe\s*sign|e-?signature|electronic\s+signature|qualified\s+signature/i);
  });
  it("write RPCs are SECURITY DEFINER with a pinned search_path", () => {
    expect((migration.match(/security definer/gi) ?? []).length).toBeGreaterThanOrEqual(6);
    expect((migration.match(/set search_path = public/gi) ?? []).length).toBeGreaterThanOrEqual(6);
  });
  it("grants EXECUTE only to authenticated, never anon", () => {
    expect(migration).toMatch(/grant execute on function[\s\S]*to authenticated/i);
    expect(migration).not.toMatch(/to anon/i);
  });
  it("ships a paired rollback file dropping both tables", () => {
    const down = join(repoRoot, "supabase/rollbacks/20260718190000_commercial_crm.down.sql");
    expect(existsSync(down)).toBe(true);
    const d = readFileSync(down, "utf8");
    expect(d).toMatch(/drop table if exists public\.contracts/i);
    expect(d).toMatch(/drop table if exists public\.proposals/i);
  });
});

describe("commercial code: honest degradation, no finance duplication", () => {
  it("read model degrades honestly and never reads finance_records", () => {
    const model = read("lib/commercial/commercial.ts");
    expect(model).toMatch(/42P01/);
    expect(model).toMatch(/applied:\s*false/);
    expect(model).not.toMatch(/\.from\("finance_records"\)/);
  });
  it("actions surface needs_migration when the RPC is absent", () => {
    const actions = read("lib/commercial/commercial-actions.ts");
    expect(actions).toMatch(/needs_migration/);
    expect(actions).toMatch(/42883/);
  });
  it("panel links invoices/payments to the finance layer and states no e-signature", () => {
    const panel = read("components/app/commercial-panel.tsx");
    expect(panel).toMatch(/dashboard\/finance/);
    expect(panel).toMatch(/noSignatureNote/);
  });
});

describe("commercial strings exist in every active-parity locale", () => {
  for (const loc of ["en", "lt", "ru", "nl", "de"]) {
    it(`${loc} has commercial with proposal + contract statuses`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`));
      expect(msgs.commercial?.pageTitle, loc).toBeTruthy();
      for (const s of ["draft", "sent", "accepted", "rejected", "withdrawn"]) {
        expect(msgs.commercial?.proposalStatus?.[s], `${loc}.${s}`).toBeTruthy();
      }
      for (const s of ["draft", "active", "completed", "cancelled"]) {
        expect(msgs.commercial?.contractStatus?.[s], `${loc}.${s}`).toBeTruthy();
      }
    });
  }
});
