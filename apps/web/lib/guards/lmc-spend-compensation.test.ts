import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  LMC_COMPENSATION_ENABLED,
  LMC_FLAG_POLICY,
  lmcFlagPolicy,
} from "@/lib/billing/lmc-flags";

/**
 * LMC SPEND COMPENSATION — the migration is the money contract, so it is
 * pinned here rather than trusted.
 *
 * The gap this closes was measured on production 2026-08-28: `lmc_reverse_v1`
 * resolves `lmc_lots.transaction_id = original.id` to find value to take back,
 * and a `spend` has no such lot — so a user debited for an action that failed
 * had no in-product remedy at all. The remaining route was an admin GRANT,
 * which records restitution as a promotion and makes the ledger lie about why
 * money moved.
 *
 * The RPC and all eight controls were exercised against PRODUCTION inside a
 * transaction that rolled itself back (nothing persisted; verified after).
 * This file exists so the file that ships cannot drift away from what was
 * proven there.
 */

const REPO = join(process.cwd(), "..", "..");
const MIGRATION = join(
  REPO,
  "supabase",
  "migrations",
  "20260828090000_lmc_spend_compensation_v1.sql",
);
const ROLLBACK = join(
  REPO,
  "supabase",
  "rollbacks",
  "20260828090000_lmc_spend_compensation_v1.down.sql",
);

/**
 * LINE ENDINGS ARE NOT PART OF THE CONTRACT. This repo checks out with
 * `core.autocrlf=true`, so on Windows every migration arrives as CRLF while
 * CI reads LF. The multi-line `toContain` below ("… is not null\n       and …")
 * therefore FAILED on every Windows checkout and PASSED in CI — a guard whose
 * verdict depends on the developer's OS is the Windows-only-guard-failure class
 * recorded on 2026-08-25. Normalising once here makes the verdict the same on
 * both, and the NEGATIVE CONTROL at the bottom proves that the raw CRLF form
 * would still fail without it.
 */
const normalizeEol = (s: string): string => s.replace(/\r\n/g, "\n");
const sql = normalizeEol(readFileSync(MIGRATION, "utf8"));
const down = normalizeEol(readFileSync(ROLLBACK, "utf8"));

describe("compensation ships disabled", () => {
  it("the DB flag is seeded false and the TS mirror is a literal false", () => {
    expect(sql).toContain("('lmc_compensation_enabled', false)");
    expect(readFileSync(join(process.cwd(), "lib/billing/lmc-flags.ts"), "utf8")).toContain(
      "export const LMC_COMPENSATION_ENABLED = false as const;",
    );
    expect(LMC_COMPENSATION_ENABLED).toBe(false);
  });

  it("is class `admin` in BOTH the SQL policy and its TS mirror", () => {
    // Not owner_only: it returns a user's own credit after our failure. A
    // mismatch between the two would mean the app and the database disagree
    // about who may authorise restitution.
    expect(sql).toMatch(/'lmc_compensation_enabled'\s+then 'admin'/);
    expect(LMC_FLAG_POLICY.lmc_compensation_enabled).toBe("admin");
    expect(lmcFlagPolicy("lmc_compensation_enabled")).toBe("admin");
  });

  it("the RPC consults the flag before creating any credit", () => {
    expect(sql).toContain("lmc_require_flag_v1('lmc_compensation_enabled')");
  });
});

describe("the vocabulary is widened, never left unconstrained", () => {
  it("every CHECK it touches is re-added in the same transaction", () => {
    for (const name of [
      "lmc_transactions_kind_check",
      "lmc_tx_reversal_linkage",
      "lmc_lots_source_kind_check",
      "lmc_lots_expiry_policy",
      "lmc_settings_key_check",
    ]) {
      expect(sql, `${name} dropped`).toContain(`drop constraint if exists ${name}`);
      expect(sql, `${name} re-added`).toContain(`add constraint ${name}`);
    }
    // Both inside one transaction, so the column is never unguarded.
    expect(sql.indexOf("begin;")).toBeLessThan(sql.indexOf("drop constraint"));
    expect(sql.lastIndexOf("add constraint")).toBeLessThan(sql.lastIndexOf("commit;"));
  });

  it("a compensation MUST carry the spend it answers", () => {
    // `lmc_tx_reversal_linkage` is an equality, so adding the kind to the left
    // side makes `original_transaction_id` required for it AND keeps it
    // forbidden for every kind not listed.
    const linkage = sql.slice(
      sql.indexOf("add constraint lmc_tx_reversal_linkage"),
      sql.indexOf("add constraint lmc_lots_source_kind_check"),
    );
    expect(linkage).toContain("'spend_compensation'");
    expect(linkage).toContain("original_transaction_id is not null");
  });

  it("restored value keeps its expiry — the policy admits both", () => {
    // Compensating expiring promotional credit with permanent credit would
    // return MORE than was taken; the RPC computes the expiry from the lots
    // the spend actually consumed.
    expect(sql).toMatch(/referral_reward',\s*'spend_compensation'/);
    expect(sql).toContain("select min(l.expires_at) into v_expires");
    expect(sql).toContain("from public.lmc_lot_consumptions c");
  });
});

describe("the money rules a reviewer must be able to find", () => {
  it("only a spend can be compensated", () => {
    expect(sql).toContain("if v_orig.kind <> 'spend' then");
    expect(sql).toContain("lmc_not_a_spend");
  });

  it("over-compensation is computed from the ledger, not a boolean", () => {
    // A flag would silently allow two partial compensations to exceed the
    // spend. The sum cannot.
    expect(sql).toContain("select coalesce(sum(t.amount_cents), 0) into v_already");
    expect(sql).toContain("t.kind = 'spend_compensation'");
    expect(sql).toContain("lmc_over_compensation");
    expect(sql).toContain("lmc_already_compensated");
  });

  it("concurrent retries serialise on the account row", () => {
    // The over-compensation guard is only sound under this lock: without it
    // two racing calls could each read `v_already = 0`.
    expect(sql).toContain("from public.lmc_accounts where id = v_orig.account_id for update");
    const lockAt = sql.indexOf("where id = v_orig.account_id for update");
    const sumAt = sql.indexOf("into v_already");
    expect(lockAt, "the lock must be taken BEFORE the guard reads").toBeLessThan(sumAt);
  });

  it("the actor-authority chain is NULL-safe", () => {
    // The rev33 defect in lmc_reverse_v1: for a company account `profile_id`
    // is NULL, so a bare comparison makes the whole OR chain NULL — and
    // `if not (NULL)` skips the raise, waving an unrelated actor through.
    expect(sql).toContain("v_account.profile_id is not null\n       and v_account.profile_id = p_actor_profile_id");
    expect(sql).toContain("lmc_actor_not_authorized");
  });

  it("replay resolves BEFORE the kill-switch, like every other ledger RPC", () => {
    // A committed compensation must stay acknowledgeable even if the flag is
    // flipped off between the winner committing and the loser retrying.
    const replayAt = sql.indexOf("lmc_existing_by_idempotency_v1");
    const flagAt = sql.indexOf("lmc_require_flag_v1('lmc_compensation_enabled')");
    expect(replayAt).toBeGreaterThan(-1);
    expect(replayAt).toBeLessThan(flagAt);
  });

  it("writes a credit LOT and an audit row, and never an UPDATE", () => {
    expect(sql).toContain("insert into public.lmc_lots");
    expect(sql).toContain("insert into public.audit_logs");
    expect(sql).toContain("'lmc_compensate_spend'");
    // Append-only: the migration must not mutate any existing ledger row.
    expect(sql).not.toMatch(/update\s+public\.lmc_transactions/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.lmc_(transactions|lots)/i);
  });

  it("is a server-side monetary write — service_role only", () => {
    expect(sql).toContain(
      "revoke all on function public.lmc_compensate_spend_v1(uuid, text, text, uuid, bigint) from public",
    );
    expect(sql).toContain(
      "grant execute on function public.lmc_compensate_spend_v1(uuid, text, text, uuid, bigint) to service_role",
    );
    expect(sql).not.toMatch(/lmc_compensate_spend_v1[^\n]*to anon/);
    expect(sql).not.toMatch(/lmc_compensate_spend_v1[^\n]*to authenticated/);
  });
});

describe("the rollback refuses to destroy money records", () => {
  it("aborts if any compensation was ever issued", () => {
    expect(down).toContain("REFUSING ROLLBACK");
    expect(down).toContain("where kind = 'spend_compensation'");
    expect(down).toContain("if v_rows > 0 then");
  });

  it("names the non-destructive alternative", () => {
    expect(down).toContain("lmc_compensation_enabled");
    expect(down).toContain("enabled=false");
  });

  it("does NOT narrow the settings key CHECK — it keeps the preserved row legal", () => {
    // The down script deliberately keeps the flag ROW (audit history), so
    // re-narrowing `lmc_settings_key_check` would reject it and the rollback
    // would fail on its last step having already dropped the function.
    expect(down).not.toMatch(/add constraint lmc_settings_key_check/);
  });
});

describe("NEGATIVE CONTROL — LF and CRLF checkouts must reach the same verdict", () => {
  // The exact multi-line contract string the actor-authority assertion pins.
  const CONTRACT = "v_account.profile_id is not null\n       and v_account.profile_id = p_actor_profile_id";
  const asCrlf = (s: string): string => s.replace(/\n/g, "\r\n");

  it("the raw CRLF form of the migration would FAIL the contract without normalisation", () => {
    const crlf = asCrlf(sql);
    expect(crlf).not.toBe(sql);
    expect(crlf).not.toContain(CONTRACT);
  });

  it("after normalisation the CRLF and LF forms are byte-identical and both carry the contract", () => {
    expect(normalizeEol(asCrlf(sql))).toBe(sql);
    expect(normalizeEol(asCrlf(sql))).toContain(CONTRACT);
    expect(sql).toContain(CONTRACT);
    expect(normalizeEol(asCrlf(down))).toBe(down);
  });
});
