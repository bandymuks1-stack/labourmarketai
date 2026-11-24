import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pinning tests for migration `supabase/migrations/0017_seed_platform_productivity_units.sql`.
 *
 * The migration closes a long-latent gap: `productivity_units` only had
 * area-rate slugs (`square_meters`, `square_meters_per_day`, `box_per_day`),
 * even though the composer's UNIT_OPTIONS and the i18n labels have always
 * exposed `hours / minutes / days / meters / pieces / kilograms / packages`.
 * Any journal save that posted one of those as a metric `unit_slug` was
 * silently rejected by the FK — masked by the action's generic catch path
 * pre-PR #61, surfaced by the structured-result contract afterwards.
 *
 * The same migration ships `create_journal_entry_full(...)` so the save
 * happens atomically server-side. These guards make sure neither half can
 * be removed without breaking the test.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const migration = readFileSync(
  join(REPO_ROOT, "supabase/migrations/0017_seed_platform_productivity_units.sql"),
  "utf-8",
);

describe("0017 — productivity_units seed", () => {
  it("seeds every unit slug that the composer / messages already exposed", () => {
    for (const slug of [
      "hours",
      "minutes",
      "days",
      "meters",
      "pieces",
      "kilograms",
      "packages",
    ]) {
      expect(migration).toMatch(new RegExp(`'${slug}'\\s*,`));
    }
  });

  it("uses `on conflict (slug) do nothing` so it is idempotent / re-runnable", () => {
    expect(migration).toMatch(/on conflict\s*\(\s*slug\s*\)\s*do nothing/i);
  });

  it("only adds rows — no DROP / no ALTER / no DELETE", () => {
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|function)\b/i);
    expect(migration).not.toMatch(/\balter\s+table\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
  });
});

describe("0017 — create_journal_entry_full RPC", () => {
  it("defines the RPC with the parameter list the action calls", () => {
    expect(migration).toMatch(/create or replace function public\.create_journal_entry_full/i);
    for (const param of [
      "p_worker_id",
      "p_engagement_context_id",
      "p_entry_type_slug",
      "p_profession_id",
      "p_original_text",
      "p_original_language",
      "p_hash_prev",
      "p_hash_self",
      "p_visibility_scope",
      "p_metrics",
    ]) {
      expect(migration).toContain(param);
    }
  });

  it("runs as security INVOKER so RLS still applies to the caller's session", () => {
    expect(migration).toMatch(/security invoker/i);
    expect(migration).not.toMatch(/security definer/i);
  });

  it("grants execute to authenticated (and only authenticated)", () => {
    expect(migration).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.create_journal_entry_full[\s\S]*?to\s+authenticated/i,
    );
    expect(migration).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.create_journal_entry_full[\s\S]*?from\s+public/i,
    );
  });
});
