import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * D1 (owner decision 2026-09-30): managers and agencies see a worker's REAL
 * profile photo where an existing, real work relationship lets them see that
 * worker's professional profile — "not public, not every manager role".
 *
 * This pins the rule where it lives (the database function) and the only way
 * the app may use it, so a later change cannot quietly widen who sees a face.
 */
const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/--[^\n]*/g, "");

const MIGRATION = read(join(REPO, "supabase", "migrations", "20260930133500_worker_avatar_path_for_relations_v1.sql"));
const ROLLBACK = read(join(REPO, "supabase", "rollbacks", "20260930133500_worker_avatar_path_for_relations_v1.down.sql"));
const AVATAR = code(read(join(WEB, "lib", "profile", "avatar.ts")));
const PERSON = read(join(WEB, "app", "[locale]", "dashboard", "people", "[workerId]", "page.tsx"));

describe("D1 — a worker's photo for real work relationships only", () => {
  const sql = code(MIGRATION);

  it("the database decides: the worker, or an ACTIVE company / agency / engagement / project relationship", () => {
    expect(sql).toMatch(/w\.profile_id = auth\.uid\(\)/);
    expect(sql).toMatch(/company_workers[\s\S]*cw\.status = 'active'[\s\S]*c\.profile_id = auth\.uid\(\)/);
    expect(sql).toMatch(/agency_workers[\s\S]*aw\.status = 'active'[\s\S]*a\.profile_id = auth\.uid\(\)/);
    expect(sql).toMatch(/engagement_contexts[\s\S]*ec\.status = 'active'[\s\S]*manages_organization/);
    expect(sql).toMatch(/project_worker_assignments[\s\S]*pwa\.status = 'active'[\s\S]*ended_at is null[\s\S]*can_manage_project/);
  });

  it("is NOT the discovery branch and NOT a role: no discoverability consent, no is_employer(), no can_view_worker()", () => {
    expect(sql).not.toMatch(/worker_profile_discoverable/);
    expect(sql).not.toMatch(/is_employer\s*\(/);
    expect(sql).not.toMatch(/can_view_worker\s*\(/);
    expect(sql).not.toMatch(/is_admin\s*\(/);
  });

  it("returns only a path inside the worker's own folder, to signed-in callers only", () => {
    expect(sql).toMatch(/returns text/);
    expect(sql).toMatch(/select p\.avatar_url/);
    expect(sql).toMatch(/p\.avatar_url like p\.id::text \|\| '\/%'/);
    expect(sql).toMatch(/revoke all on function public\.worker_avatar_path_v1\(uuid\) from public;/);
    expect(sql).toMatch(/revoke all on function public\.worker_avatar_path_v1\(uuid\) from anon;/);
    expect(sql).toMatch(/grant execute on function public\.worker_avatar_path_v1\(uuid\) to authenticated;/);
    expect(sql).not.toMatch(/to\s+anon|to\s+public|grant select/i);
    expect(ROLLBACK).toMatch(/drop function if exists public\.worker_avatar_path_v1\(uuid\);/);
  });

  it("the app asks under the VIEWER's session, and the service key only signs that one path", () => {
    const fn = AVATAR.slice(AVATAR.indexOf("export async function getAvatarForVisibleWorker"));
    const rpc = fn.indexOf('"worker_avatar_path_v1"');
    const admin = fn.indexOf("createAdminClient()");
    expect(fn).toContain("await createClient()");
    expect(rpc).toBeGreaterThan(0);
    expect(admin).toBeGreaterThan(rpc);
    // the key never reads a table here — storage signing only, one hour
    expect(fn).not.toMatch(/\.from\("/);
    expect(fn).toContain("createSignedUrl(path, 60 * 60)");
    expect(fn).not.toMatch(/getPublicUrl/);
  });

  it("the person page shows it through the one identity stage, with the monogram as the fallback", () => {
    expect(PERSON).toContain("getAvatarForVisibleWorker(worker.id as string)");
    expect(PERSON).toContain("avatarUrl={avatarUrl}");
  });
});
