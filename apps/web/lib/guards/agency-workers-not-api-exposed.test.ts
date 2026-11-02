import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * `public.agency_workers` is NOT exposed to the API role — and no live reader
 * may pretend otherwise.
 *
 * Production facts (readback 2026-10-15):
 *   - `0001_initial_schema.sql` created the table with NO grant, unlike its
 *     sibling `company_workers` (0027: `grant select, … to authenticated`).
 *     The production ACL has never held SELECT for `authenticated`; R-1
 *     (20260919100000) only revoked insert/update/delete, which materialised
 *     the owner-only ACL `{postgres=arwdDxtm/postgres}`. Nothing was "lost".
 *   - The table holds 0 rows and belongs to the legacy Model A agency world,
 *     retired by owner decision 2026-09-14 (agencies are organizations; see
 *     agency-model-b-canonical-v1.test.ts).
 *   - Every PostgREST read of it therefore answered 42501: 415–463
 *     `permission denied for table agency_workers` per 24 h in postgres_logs,
 *     plus one wasted round-trip on the journal, profile, projects,
 *     instructions and planning pages. Each reader degraded silently to the
 *     `company_workers` answer, so removing the reads changes no output.
 *
 * The fix is to stop reading, NOT to add a grant: granting SELECT would widen
 * API access to a retired surface (RED class, owner decision). The two halves
 * are pinned together — if a migration ever grants SELECT to `authenticated`,
 * the second test fails and this guard has to be revisited in the same PR.
 * SECURITY DEFINER functions (caller_manages_worker, can_view_worker,
 * accept_agency_worker_invitation, …) are unaffected and out of scope.
 */

const WEB = join(__dirname, "..", "..");
const MIGRATIONS = join(WEB, "..", "..", "supabase", "migrations");

/**
 * The retired Model A reader. Unreachable from any route: its only caller is
 * `lib/agency/pool.ts`, which agency-model-b-canonical-v1.test.ts bans from
 * every route and component, and it is gated on `getOwnAgency()` reading
 * `public.agencies` (also not API-exposed). A 42501 there surfaces as its
 * honest `{ kind: "error" }` state, never as an empty roster.
 */
const RETIRED_MODEL_A_READER = "lib/agency/agency-workers.ts";

/** A PostgREST read of the table: `.from("agency_workers")` or `untyped(x, "agency_workers")`. */
const API_READ = /\.from\(\s*["'`]agency_workers["'`]|untyped\([^,]+,\s*["'`]agency_workers["'`]/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry === ".next") continue;
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      if (/\.test\.(ts|tsx)$/.test(entry)) continue;
      out.push(full);
    }
  };
  walk(dir);
  return out;
}

const rel = (f: string) => relative(WEB, f).split(sep).join("/");

describe("agency_workers is not API-exposed — no live reader queries it", () => {
  it("no app/lib/components module reads public.agency_workers through PostgREST", () => {
    const offenders = ["app", "lib", "components"]
      .flatMap((d) => sourceFiles(join(WEB, d)))
      .filter((f) => rel(f) !== RETIRED_MODEL_A_READER)
      .filter((f) => API_READ.test(readFileSync(f, "utf8")))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("the recorded exception still exists and is still the retired reader (not a silent allow-list)", () => {
    const src = readFileSync(join(WEB, RETIRED_MODEL_A_READER), "utf8");
    expect(API_READ.test(src)).toBe(true);
    // A 42501 must stay a visible error state there, never an empty roster.
    expect(src).toMatch(/return \{ kind: "error", message: error\.message \}/);
  });

  it("no migration grants SELECT on agency_workers to the API roles (re-exposing it is an owner decision)", () => {
    const grants = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) =>
        /grant\s+[^;]*\bselect\b[^;]*\bon\s+(table\s+)?(public\.)?agency_workers\b[^;]*\bto\s+[^;]*\b(authenticated|anon|public)\b/i.test(
          readFileSync(join(MIGRATIONS, f), "utf8"),
        ),
      );
    expect(grants).toEqual([]);
  });
});
