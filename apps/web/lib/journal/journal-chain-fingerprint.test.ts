import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  canonicalInputHash,
  issueConfirmationToken,
  verifyConfirmationToken,
} from "@/lib/conversation/confirmation-token";
import type { DomainCaller } from "@/lib/domain/caller";
import { journalChainFingerprint } from "./journal-chain-fingerprint";

/**
 * EXACTLY ONE RECORD PER CONFIRMATION (owner P0 2026-09-23).
 *
 * The conversation dispatcher bound `worker.log-work` tokens to the constant
 * "n/a", so one confirmation could be spent again for its whole 5-minute TTL —
 * a double-tap or a retried request could write a second journal entry. It now
 * binds them to the caller's journal CHAIN HEAD, the fingerprint the MCP
 * `journal.confirm` path already used: a save moves the head, so the same
 * token replayed afterwards is `stale_state`.
 */

type Outcome = { data: unknown; error: { message: string; code?: string } | null };

function stubCaller(tables: Record<string, Outcome>): DomainCaller {
  const supabase = {
    from(table: string) {
      const outcome = tables[table] ?? { data: null, error: { message: `unscripted ${table}` } };
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => outcome,
      };
      return chain;
    },
  };
  return { supabase, userId: "00000000-0000-4000-8000-0000000000aa" } as unknown as DomainCaller;
}

const WORKER: Outcome = { data: { id: "worker-1" }, error: null };
const head = (hash: string | null): Outcome => ({
  data: hash === null ? null : { hash_self: hash },
  error: null,
});

describe("journalChainFingerprint — the caller's chain head", () => {
  it("is the head hash, scoped to the caller's own worker", async () => {
    const fp = await journalChainFingerprint(stubCaller({ workers: WORKER, journal_entries: head("h0") }));
    expect(fp).toEqual({ ok: true, fingerprint: "journal-head:v1:worker-1:h0" });
  });

  it("an empty journal is the genesis head", async () => {
    const fp = await journalChainFingerprint(stubCaller({ workers: WORKER, journal_entries: head(null) }));
    expect(fp).toEqual({ ok: true, fingerprint: "journal-head:v1:worker-1:genesis" });
  });

  it("a failed read is a failure, never a head", async () => {
    const readFailed = await journalChainFingerprint(
      stubCaller({ workers: WORKER, journal_entries: { data: null, error: { message: "boom" } } }),
    );
    expect(readFailed).toMatchObject({ ok: false, result: { code: "unavailable" } });
    const noWorker = await journalChainFingerprint(
      stubCaller({ workers: { data: null, error: null }, journal_entries: head("h0") }),
    );
    expect(noWorker).toMatchObject({ ok: false, result: { code: "no_worker_profile" } });
  });
});

describe("a worker.log-work confirmation is single-use", () => {
  const SECRET = "unit-test-secret-not-a-real-key";
  const INPUT = {
    engagementContextId: "6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b",
    notes: "Buvau objekte",
    workDate: "2026-09-23",
    siteName: null,
  };
  const NOW = 1_800_000_000_000;

  async function fp(hash: string | null): Promise<string> {
    const r = await journalChainFingerprint(stubCaller({ workers: WORKER, journal_entries: head(hash) }));
    if (!r.ok) throw new Error("fixture read failed");
    return r.fingerprint;
  }

  it("verifies before the save, and is STALE once the save moved the head", async () => {
    const token = issueConfirmationToken(SECRET, {
      actionId: "worker.log-work",
      inputHash: canonicalInputHash(INPUT),
      userId: "u1",
      stateFingerprint: await fp("h0"),
      issuedAtMs: NOW,
    });
    const ctx = { actionId: "worker.log-work", input: INPUT, userId: "u1", nowMs: NOW + 1_000 };
    // The first spend: the head is still where the card was shown.
    expect(verifyConfirmationToken(SECRET, token, { ...ctx, currentStateFingerprint: await fp("h0") })).toEqual({
      ok: true,
    });
    // The entry was appended → a new head → the same token cannot write again.
    expect(verifyConfirmationToken(SECRET, token, { ...ctx, currentStateFingerprint: await fp("h1") })).toEqual({
      ok: false,
      reason: "stale_state",
    });
  });

  it("NEGATIVE CONTROL: the old constant fingerprint let the replay through", () => {
    const token = issueConfirmationToken(SECRET, {
      actionId: "worker.log-work",
      inputHash: canonicalInputHash(INPUT),
      userId: "u1",
      stateFingerprint: "n/a",
      issuedAtMs: NOW,
    });
    const replay = verifyConfirmationToken(SECRET, token, {
      actionId: "worker.log-work",
      input: INPUT,
      userId: "u1",
      currentStateFingerprint: "n/a",
      nowMs: NOW + 60_000,
    });
    expect(replay).toEqual({ ok: true });
  });
});

describe("ONE fingerprint for both transports (source pins)", () => {
  const WEB = join(__dirname, "..", "..");
  const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");
  const dispatch = read("lib", "conversation", "dispatch.ts");
  const registry = read("lib", "capabilities", "registry.ts");

  it("the dispatcher binds worker.log-work to the chain head, in its own branch", () => {
    const fn = dispatch.slice(
      dispatch.indexOf("async function stateFingerprint("),
      dispatch.indexOf("type ExecutableActionId"),
    );
    expect(fn).toMatch(/if \(actionId === "worker\.log-work"\) \{/);
    expect(fn).toContain("await journalChainFingerprint({ supabase, userId })");
    expect(dispatch).toContain('import { journalChainFingerprint } from "@/lib/journal/journal-chain-fingerprint";');
  });

  it("the capability registry consumes the SAME function — its private copy is gone", () => {
    expect(registry).toContain('import { journalChainFingerprint } from "@/lib/journal/journal-chain-fingerprint";');
    expect(registry).not.toMatch(/async function journalChainFingerprint\(/);
    expect(registry.match(/journalChainFingerprint\(caller\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
