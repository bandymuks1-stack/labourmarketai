import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * DEM-8 — a recurring query that notifies.
 *
 * THE GAP, IN THE REGISTER'S OWN WORDS: "Bookmarks exist; a recurring query
 * that notifies does not." `worker_saved_opportunities` remembers ONE
 * opportunity a worker already found. Nothing remembered the QUESTION, so a
 * worker re-asked it by hand and learned about new work only by happening to
 * look on the right day.
 *
 * This is the one item in the approved wave that genuinely needed new
 * storage, and the owner authorized exactly that and no more. This guard pins
 * the "and no more": ONE table, no second notification path, no second
 * matcher, and a criteria column the database keeps closed.
 *
 * The behaviour itself is proven against a real PostgreSQL server —
 * `scripts/db-proof/worker-saved-searches.sh` runs the migration verbatim and
 * measures the closed key set, the RLS privacy, the write bounds, the
 * notification widening and the rollback's data guard. This file makes sure
 * the properties that proof depended on stay in the files it read.
 */

const webRoot = join(__dirname, "..", "..");
const repoRoot = join(webRoot, "..", "..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

const MIGRATION = "supabase/migrations/20260914140000_worker_saved_searches_v1.sql";
const ROLLBACK = "supabase/rollbacks/20260914140000_worker_saved_searches_v1.down.sql";
const migration = readFileSync(join(repoRoot, MIGRATION), "utf8");
const rollback = readFileSync(join(repoRoot, ROLLBACK), "utf8");

const MODEL = "lib/opportunities/saved-search-model.ts";
const READER = "lib/opportunities/saved-searches.ts";
const ACTIONS = "lib/opportunities/saved-search-actions.ts";
const STRIP = "components/app/saved-searches-strip.tsx";

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ").replace(/^\s*\/\/[^\n]*$/gm, " ");
}

describe("the criteria column is closed by the database, not by convention", () => {
  it("the CHECK admits exactly the seven discovery dimensions", () => {
    const c = code(migration);
    expect(c).toMatch(/constraint worker_saved_searches_criteria_keys check/i);
    for (const key of [
      "profession", "country", "start", "accommodation", "transport", "tool", "opportunityType",
    ]) {
      expect(c, `the CHECK must name ${key}`).toContain(`'${key}'`);
    }
  });

  it("the CHECK contains no subquery, which PostgreSQL forbids", () => {
    // Measured against a real server while writing this: `check (not exists
    // (select …))` raises "cannot use subquery in check constraint" AT APPLY
    // TIME. The first draft had exactly that and would have failed the
    // production apply.
    const keysCheck = code(migration).slice(
      code(migration).indexOf("worker_saved_searches_criteria_keys"),
      code(migration).indexOf("worker_saved_searches_criteria_size"),
    );
    expect(keysCheck).not.toMatch(/\bselect\b/i);
    expect(keysCheck).toMatch(/criteria - array\[/);
  });

  it("the per-value rules live in the only writer there is", () => {
    // A CHECK cannot express them, and the table has no INSERT/UPDATE policy,
    // so the RPC is enforcement rather than decoration.
    const c = code(migration);
    expect(c).toMatch(/Criteria values must be short strings/);
    expect(c).not.toMatch(/for (insert|update|delete)/i);
  });

  it("the TypeScript key list and the SQL CHECK cannot drift apart", () => {
    const keys = [
      ...code(read(MODEL))
        .slice(
          code(read(MODEL)).indexOf("SAVED_SEARCH_CRITERIA_KEYS = ["),
          code(read(MODEL)).indexOf("] as const;"),
        )
        .matchAll(/"([a-zA-Z]+)"/g),
    ].map((m) => m[1]);
    expect(keys).toHaveLength(7);
    for (const key of keys) {
      expect(migration, `the SQL CHECK must also name ${key}`).toContain(`'${key}'`);
    }
  });
});

describe("a saved question is private, and writes go through one door", () => {
  it("SELECT is the saving worker only", () => {
    const c = code(migration);
    expect(c).toMatch(/create policy worker_saved_searches_select/i);
    expect(c).toMatch(/w\.profile_id = auth\.uid\(\)/);
    expect(c).toMatch(/public\.is_admin\(\)/);
  });

  it("direct writes are revoked and no write policy exists", () => {
    const c = code(migration);
    expect(c).toMatch(/revoke insert, update, delete on public\.worker_saved_searches from authenticated/i);
  });

  it("every RPC is definer with a pinned search_path and revoked from anon", () => {
    const c = code(migration);
    expect((c.match(/security definer/gi) ?? []).length).toBe(3);
    expect((c.match(/set search_path = public/gi) ?? []).length).toBe(3);
    for (const fn of ["save_worker_search_v1", "delete_worker_search_v1", "mark_worker_search_seen_v1"]) {
      expect(c, `${fn} must be revoked from anon`).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon`, "i"),
      );
      expect(c, `${fn} must be granted to authenticated`).toMatch(
        new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`, "i"),
      );
    }
  });

  it("the migration carries the human-gate acknowledgement", () => {
    expect(migration).toMatch(/@human-gate-approved/);
  });
});

describe("one notification path, not a second one", () => {
  it("the alert is a type on the EXISTING store, added by the same idiom", () => {
    const c = code(migration);
    expect(c).toMatch(/alter table public\.notification_events/);
    expect(c).toMatch(/'saved_search_match'/);
    expect(c).toMatch(/'saved_search'/);
    // Every previously valid type survives — a strict superset.
    for (const kept of ["weekly_digest", "booking_accepted", "demand_interest_reviewed"]) {
      expect(c, `the widening must keep ${kept}`).toContain(`'${kept}'`);
    }
  });

  it("no new table, cron route or delivery mechanism is introduced", () => {
    const c = code(migration);
    const created = [...c.matchAll(/create table if not exists public\.([a-z_]+)/g)].map((m) => m[1]);
    expect(created).toEqual(["worker_saved_searches"]);
    expect(existsSync(join(webRoot, "app", "api", "cron", "saved-searches"))).toBe(false);
  });

  it("the emitter uses the ONE audited deliver path and the shared exactly-once id", () => {
    const emitters = read("lib/notifications/event-emitters.ts");
    const block = emitters.slice(emitters.indexOf("export async function emitSavedSearchMatchNotification"));
    expect(block).toMatch(/await deliver\(admin, \{/);
    expect(block).toMatch(/deterministicEntityId\(/);
    // POINTER-ONLY, like the digest: no count is persisted.
    expect(block).not.toMatch(/metadata:/);
  });

  it("the deterministic id has ONE implementation", () => {
    // Two copies of exactly-once arithmetic is one drift away from sending
    // the same alert twice.
    const digest = read("lib/notifications/weekly-digest-emitter.ts");
    expect(digest).toMatch(/deterministicEntityId\(`weekly_digest:/);
    expect(code(digest)).not.toMatch(/createHash/);
  });
});

describe("one matcher: the board's own", () => {
  it("the model imports applyDiscoveryFilters instead of reimplementing it", () => {
    const src = read(MODEL);
    expect(src).toMatch(/applyDiscoveryFilters[\s\S]*from "@\/lib\/opportunities\/discovery-filters"/);
    expect(code(src)).not.toMatch(/function\s+(needMatches|matchesCriteria|filterCards)/i);
  });

  it("the model is pure — a saved search reads no demand of its own", () => {
    const c = code(read(MODEL));
    expect(c).not.toMatch(/server-only|createClient|\.from\(|\.rpc\(/);
  });

  it("no demand facts are stored, so a saved search cannot go stale", () => {
    const c = code(migration);
    for (const copied of ["title", "company_name", "pay", "salary", "request_id"]) {
      expect(c, `a saved search must not store ${copied}`).not.toMatch(
        new RegExp(`^\\s*${copied}\\s`, "m"),
      );
    }
  });
});

describe("unknown is never rendered as nothing-new — SEP-7", () => {
  it("newSinceSeen is null when a match carries no date", () => {
    const c = code(read(MODEL));
    expect(c).toMatch(/const anyUndated = matches\.some\(\(c\) => !c\.need\.createdAt\);/);
    expect(c).toMatch(/anyUndated\s*\?\s*null/);
  });

  it("an unknown count can never raise an alert", () => {
    const c = code(read(MODEL));
    expect(c).toMatch(/r\.notify && \(r\.newSinceSeen \?\? 0\) > 0/);
  });

  it("the strip renders the new badge only when the number is known", () => {
    const c = code(read(STRIP));
    expect(c).toMatch(/reading\.newSinceSeen !== null && reading\.newSinceSeen > 0/);
  });

  it("only the worker looking clears 'unseen'", () => {
    // Not a background pass: the one thing that means someone looked is
    // someone looking.
    expect(code(read(STRIP))).toMatch(/await markSearchSeenAction\(reading\.id\);/);
    expect(code(migration)).toMatch(/create or replace function public\.mark_worker_search_seen_v1/);
  });
});

describe("honest invisibility before the owner applies it", () => {
  it("the reader reports unavailable rather than an empty list", () => {
    const c = code(read(READER));
    expect(c).toMatch(/available: false/);
    expect(c).toMatch(/42P01|PGRST205/);
  });

  it("the board renders no control at all while it is unavailable", () => {
    const page = code(read("app/[locale]/dashboard/opportunities/page.tsx"));
    expect(page).toMatch(/savedSearches\.available \? \(/);
  });

  it("the actions map an absent store to its own outcome, not to an error", () => {
    expect(code(read(ACTIONS))).toMatch(/"feature-absent"/);
  });

  for (const loc of ["en", "lt", "ru", "nl", "de"]) {
    it(`${loc} carries the strip copy and every outcome`, () => {
      const s = JSON.parse(read(`messages/${loc}.json`)).opportunities?.savedSearches;
      expect(s, `${loc}.opportunities.savedSearches`).toBeTruthy();
      for (const key of ["title", "intro", "empty", "matches", "new", "delete", "saveCurrent"]) {
        expect(s[key], `${loc}.${key}`).toBeTruthy();
      }
      for (const outcome of ["saved", "deleted", "invalid", "limit", "auth", "feature-absent", "error"]) {
        expect(s.outcome?.[outcome], `${loc}.outcome.${outcome}`).toBeTruthy();
      }
      const types = JSON.parse(read(`messages/${loc}.json`)).auth?.notifications?.types;
      expect(types?.event_saved_search_match, `${loc} notification label`).toBeTruthy();
    });
  }
});

describe("the change is reversible, and the reverse cannot destroy data by accident", () => {
  it("the rollback runs in ONE transaction so its guard actually refuses", () => {
    // Measured on a real server: without the transaction, psql aborted the
    // guard's RAISE and then ran the drops anyway — the refusal printed AND
    // the table was destroyed.
    expect(rollback).toMatch(/^begin;$/m);
    expect(rollback.trimEnd()).toMatch(/commit;$/);
    const guard = rollback.indexOf("raise exception");
    const drop = rollback.indexOf("drop table if exists public.worker_saved_searches");
    expect(guard).toBeGreaterThan(0);
    expect(drop).toBeGreaterThan(guard);
  });

  it("the guard counts real rows before dropping anything", () => {
    expect(code(rollback)).toMatch(/select count\(\*\) into n from public\.worker_saved_searches;/);
    expect(code(rollback)).toMatch(/if n > 0 then/);
  });

  it("the reverse restores the v6 notification lists", () => {
    const c = code(rollback);
    expect(c).toMatch(/notification_events_type_check/);
    expect(c).toContain("'weekly_digest'");
    expect(c).not.toContain("'saved_search_match'");
  });
});
