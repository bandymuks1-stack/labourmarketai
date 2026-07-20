import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * LMC ledger foundation guard — Wagon 1 of the LMC Commercial System Train.
 * Contract: docs/product/lmc-commercial-system-train-v1.md
 *
 * Pins, statically and secret-free:
 *  1. the migration + paired rollback exist and carry the human gate;
 *  2. the append-only / fail-closed invariants are present in the SQL;
 *  3. every commercial flag defaults to false (DB seeds + TS constants);
 *  4. referral rewards are impossible while disabled and no reward rate
 *     exists anywhere;
 *  5. no cash-out / withdrawal / MLM wording exists in the shipped surfaces;
 *  6. the rollback removes ONLY lmc_* objects.
 */

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");

const MIGRATION = "supabase/migrations/20260720190000_lmc_ledger_foundation_v1.sql";
const ROLLBACK = "supabase/rollbacks/20260720190000_lmc_ledger_foundation_v1.down.sql";
const FLAGS = "lib/billing/lmc-flags.ts";
const TRAIN_DOC = "docs/product/lmc-commercial-system-train-v1.md";

function readRepo(rel: string): string {
  return readFileSync(resolve(REPO, rel), "utf8");
}
function readApp(rel: string): string {
  return readFileSync(resolve(APP, rel), "utf8");
}

/** SQL with `--` line comments stripped, lowercased. */
function sqlBody(raw: string): string {
  return raw
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();
}

describe("LMC Wagon 1 — migration and rollback presence", () => {
  it("migration exists with the human gate and DO-NOT-APPLY banner", () => {
    const raw = readRepo(MIGRATION);
    expect(raw.startsWith("-- @human-gate-approved")).toBe(true);
    expect(raw).toContain("DO NOT APPLY");
    expect(raw).toContain("needs-human-gate");
  });

  it("rollback refuses to drop a populated ledger without the scratch override", () => {
    const raw = readRepo(ROLLBACK);
    expect(raw).toContain("lmc_rollback_refused");
    expect(raw).toContain("lmc-ledger-removal-approved");
    expect(raw.indexOf("lmc_rollback_refused")).toBeLessThan(
      raw.indexOf("drop view"),
    );
  });

  it("paired rollback exists and drops ONLY lmc_* objects", () => {
    // Scan executable SQL only — `--` comments may mention DROP in prose.
    const raw = sqlBody(readRepo(ROLLBACK));
    const drops = raw.match(/drop\s+\w+(\s+if exists)?\s+(?:public\.)?([a-z0-9_]+)/gi) ?? [];
    expect(drops.length).toBeGreaterThan(10);
    for (const d of drops) {
      const m = /drop\s+(?:table|view|function|trigger|policy)\s+(?:if exists\s+)?(?:public\.)?([a-z0-9_]+)/i.exec(d);
      expect(m, `unparseable drop statement: ${d}`).toBeTruthy();
      expect(
        m![1].startsWith("lmc_"),
        `rollback must only drop lmc_* objects, saw: ${d}`,
      ).toBe(true);
    }
  });
});

describe("LMC Wagon 1 — append-only and fail-closed invariants", () => {
  const sql = sqlBody(readRepo(MIGRATION));

  it("append-only triggers cover every ledger table", () => {
    expect(sql).toContain("lmc_transactions_append_only");
    expect(sql).toContain("lmc_lots_append_only");
    expect(sql).toContain("lmc_lot_consumptions_append_only");
    expect(sql).toContain("lmc_accounts_immutable");
    expect(sql).toContain("before update or delete on public.lmc_transactions");
  });

  it("no INSERT/UPDATE/DELETE policy exists on any lmc table", () => {
    const policyDefs = sql.match(/create policy[\s\S]*?;/g) ?? [];
    expect(policyDefs.length).toBeGreaterThanOrEqual(5);
    for (const p of policyDefs) {
      expect(p).toContain("for select");
      expect(p).not.toContain("for insert");
      expect(p).not.toContain("for update");
      expect(p).not.toContain("for delete");
      expect(p).not.toContain("for all");
    }
  });

  it("nothing is granted to anon and no policy uses using (true)", () => {
    expect(sql).not.toMatch(/grant[^;]*to\s+anon/);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/);
  });

  it("ledger write privileges are revoked from every client role", () => {
    expect(sql).toContain(
      "revoke insert, update, delete on public.lmc_transactions from service_role",
    );
    expect(sql).toContain(
      "revoke insert, update, delete on public.lmc_lots from service_role",
    );
    expect(sql).toContain(
      "revoke insert, update, delete on public.lmc_lot_consumptions from service_role",
    );
    expect(sql).toContain("revoke all on public.lmc_transactions from anon, authenticated");
  });

  it("idempotency, single-reversal and once-per-account promos are DB-enforced", () => {
    expect(sql).toContain("unique (account_id, idempotency_key)");
    expect(sql).toContain("lmc_one_reversal_per_original");
    expect(sql).toContain("lmc_one_signup_grant_per_account");
    expect(sql).toContain("lmc_one_activity_grant_per_account");
    expect(sql).toContain("lmc_one_expiry_per_lot");
  });

  it("amounts are bigint LMC-cents — no float/numeric money columns", () => {
    expect(sql).toMatch(/amount_cents\s+bigint/);
    expect(sql).not.toMatch(/amount[a-z_]*\s+(real|double precision|float|numeric)/);
  });

  it("purchased value cannot expire; promotional value must expire", () => {
    expect(sql).toContain("source_kind = 'purchased' and expires_at is null");
    expect(sql).toMatch(
      /'promotional_signup',\s*'promotional_activity',\s*'admin_grant'\)\s*\n?\s*and expires_at is not null/,
    );
  });

  it("every SECURITY DEFINER function pins search_path", () => {
    const definers = sql.match(/create or replace function[\s\S]*?\$\$;/g) ?? [];
    const withDefiner = definers.filter((d) => d.includes("security definer"));
    expect(withDefiner.length).toBeGreaterThanOrEqual(8);
    for (const d of withDefiner) {
      expect(d).toContain("set search_path = public");
    }
  });
});

describe("LMC Wagon 1 — every commercial flag ships disabled", () => {
  it("DB seeds all six lmc_settings flags as false", () => {
    const sql = sqlBody(readRepo(MIGRATION));
    for (const key of [
      "lmc_purchases_enabled",
      "lmc_promotional_grants_enabled",
      "lmc_referrals_enabled",
      "stripe_lmc_topups_enabled",
      "live_payments_enabled",
      "lmc_spending_enabled",
    ]) {
      expect(sql).toContain(`('${key}', false)`);
    }
    expect(sql).toContain("enabled    boolean not null default false");
  });

  it("TS kill-switches are literal false as const", () => {
    const ts = readApp(FLAGS);
    for (const name of [
      "LMC_PURCHASES_ENABLED",
      "LMC_PROMOTIONAL_GRANTS_ENABLED",
      "LMC_REFERRALS_ENABLED",
      "STRIPE_LMC_TOPUPS_ENABLED",
      "LIVE_PAYMENTS_ENABLED",
      "LMC_SPENDING_ENABLED",
    ]) {
      expect(ts).toContain(`export const ${name} = false as const;`);
    }
  });

  it("referral rewards are DB-impossible while disabled; no rate exists", () => {
    const sql = sqlBody(readRepo(MIGRATION));
    expect(sql).toContain("lmc_referral_insert_guard");
    expect(sql).toContain("lmc_transactions_referral_guard");
    expect(sql).toContain("s.key = 'lmc_referrals_enabled'");
    // Flag gates take FOR SHARE so kill-switch flips serialize with writers.
    expect(sql).toContain("lmc_require_flag_v1");
    expect(sql).toMatch(/for share/);
    // No reward rate/percentage may exist anywhere in schema or flags.
    for (const surface of [sql, readApp(FLAGS).toLowerCase()]) {
      expect(surface).not.toMatch(/referral[a-z_]*(rate|percent|pct|bps)/);
    }
  });
});

describe("LMC Wagon 1 — positioning and wording honesty", () => {
  it("train doc exists with the binding non-money positioning", () => {
    const doc = readRepo(TRAIN_DOC);
    expect(doc).toContain("not a cryptocurrency");
    expect(doc).toContain("not an investment");
    expect(doc).toContain("not a withdrawable balance");
    expect(doc).toContain("1 LMC = 1 EUR of internal platform credit");
    expect(doc).toContain("No MLM");
  });

  it("no cash-out / withdrawal / MLM wording in shipped code surfaces", () => {
    const surfaces = [sqlBody(readRepo(MIGRATION)), readApp(FLAGS).toLowerCase()];
    for (const s of surfaces) {
      expect(s).not.toMatch(/cash[- ]?out/);
      expect(s).not.toMatch(/downline|multi-?level|team commission|pyramid/);
      // "withdrawable" may appear ONLY inside an explicit negation.
      const withdrawHits = s.match(/[^\n]*withdraw[^\n]*/g) ?? [];
      for (const hit of withdrawHits) {
        expect(hit).toMatch(/not (a )?(be )?(come )?withdraw|never.*withdraw|not.*withdrawable/);
      }
    }
  });

  it("no public earning claim or invented percentage ships with Wagon 1", () => {
    const ts = readApp(FLAGS);
    expect(ts).not.toMatch(/earn(ing)? (up to|money|cash)/i);
    expect(ts).not.toMatch(/\d+\s?%/);
  });
});
