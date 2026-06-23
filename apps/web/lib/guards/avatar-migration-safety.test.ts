import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Profile-avatar migration safety. The migration is RED/owner-gated (storage
 * bucket + storage.objects RLS). This pins that it is additive + reversible,
 * private (no public/anon read), strictly owner-scoped, and ships a rollback.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");
const NAME = "20260623200000_profile_avatar";
const sql = read(`supabase/migrations/${NAME}.sql`);
const code = sql
  .split(/\r?\n/)
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase();

describe("migration is additive + private + owner-scoped", () => {
  it("adds avatar_url to profiles additively (no drop/rename of existing)", () => {
    expect(code).toMatch(/add column if not exists\s+avatar_url/);
    expect(code).not.toMatch(/drop\s+column/);
    expect(code).not.toMatch(/\brename\b/);
    expect(code).not.toMatch(/delete\s+from\s+public\./);
    expect(code).not.toMatch(/\bupdate\s+public\.profiles\b/);
  });
  it("creates a PRIVATE avatar bucket (public = false, never public)", () => {
    expect(code).toMatch(/insert into storage\.buckets[\s\S]*?'profile-avatars'[\s\S]*?false/);
    expect(code).not.toMatch(/'profile-avatars',\s*'profile-avatars',\s*true/);
  });
  it("storage policies are owner-folder-scoped, NOT public/anon", () => {
    expect(code).toMatch(/\(storage\.foldername\(name\)\)\[1\]\s*=\s*auth\.uid\(\)::text/);
    expect(code).not.toMatch(/to\s+anon|to\s+public|using\s*\(\s*true\s*\)/);
    // No admin/cross-user read on avatars (faces stay owner-only).
    expect(code).not.toMatch(/is_admin\(\)/);
  });
});

describe("migration is reversible (paired rollback)", () => {
  it("ships supabase/rollbacks/<name>.down.sql", () => {
    expect(existsSync(join(REPO, `supabase/rollbacks/${NAME}.down.sql`))).toBe(true);
  });
  it("the rollback drops the column, bucket and policies", () => {
    const down = read(`supabase/rollbacks/${NAME}.down.sql`).toLowerCase();
    expect(down).toMatch(/drop column if exists avatar_url/);
    expect(down).toMatch(/delete from storage\.buckets where id = 'profile-avatars'/);
    expect(down).toMatch(/drop policy if exists "profile-avatars owner/);
  });
});

describe("migration is honestly flagged owner-gated", () => {
  it("the header marks it RED / needs-human-gate / not applied", () => {
    expect(sql.toLowerCase()).toMatch(/red/);
    expect(sql.toLowerCase()).toMatch(/not\s+applied|human-gate/);
  });
});