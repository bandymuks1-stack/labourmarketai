/**
 * Guard for the demand-intake consolidation migration (Phase 3 / Slice 3.1).
 * Pins: ONE canonical intake (customer_requests), additive + reversible, the
 * owner-scoped save_demand_draft (draft) + submit_demand_request (submitted)
 * RPCs (no RLS loosening, no direct cross-profile insert), pilot_drafts folded
 * (not dropped here), default-closed preserved — and that the shipped
 * pilot-request CTA writes the canonical intake, never the leads pre-auth funnel.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(__dirname, "..", "..", "..", "..", "supabase", "migrations");
const WEB_ROOT = join(__dirname, "..", "..");
const readWeb = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

function migration(): { name: string; sql: string } {
  const file = readdirSync(MIG_DIR).find((f) => f.endsWith("_demand_intake_consolidation.sql"));
  if (!file) throw new Error("demand_intake_consolidation migration not found");
  return { name: file, sql: readFileSync(join(MIG_DIR, file), "utf8") };
}
const code = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

describe("Guard: demand-intake consolidation migration", () => {
  const { name, sql } = migration();
  const exec = code(sql);

  it("filename matches §16", () => {
    expect(name).toMatch(/^\d{14}_demand_intake_consolidation\.sql$/);
  });

  it("extends the CANONICAL intake (customer_requests), not a new table", () => {
    expect(exec).not.toMatch(/create table/i);
    expect(exec).toMatch(/alter table public\.customer_requests[\s\S]*add column if not exists kind/i);
    expect(exec).toMatch(/add column if not exists payload jsonb/i);
    expect(exec).toMatch(/add column if not exists original_language/i); // §2 multilingual
  });

  it("one-draft-per-(profile,kind) via a partial unique index", () => {
    expect(exec).toMatch(/create unique index[\s\S]*customer_requests[\s\S]*\(\s*profile_id\s*,\s*kind\s*\)[\s\S]*where status\s*=\s*'draft'/i);
  });

  it("save is an owner-scoped SECURITY DEFINER RPC (insert RLS is admin-only)", () => {
    expect(exec).toMatch(/create or replace function public\.save_demand_draft[\s\S]*security definer/i);
    expect(exec).toMatch(/uid uuid := auth\.uid\(\)/i);
    expect(exec).toMatch(/profile_id = uid/i); // acts only on the caller's own draft
    expect(exec).toMatch(/grant execute on function public\.save_demand_draft[\s\S]*to authenticated/i);
    expect(exec).toMatch(/revoke all on function public\.save_demand_draft[\s\S]*from public/i);
  });

  it("submit_demand_request is owner-scoped, status='submitted', stamps kind", () => {
    // The pilot-request CTA submit path — repointed off the leads funnel onto the
    // canonical intake. Owner-scoped SECURITY DEFINER (same admin-only INSERT RLS
    // reason as the draft RPC); status hard-pinned to 'submitted' (no self-promote
    // into the admin-only review statuses).
    const fn = exec.match(
      /create or replace function public\.submit_demand_request[\s\S]*?end \$\$;/i,
    );
    expect(fn, "submit_demand_request RPC not found").not.toBeNull();
    const body = fn?.[0] ?? "";
    expect(body).toMatch(/security definer/i);
    expect(body).toMatch(/uid uuid := auth\.uid\(\)/i);
    expect(body).toMatch(/profile_id[\s\S]*kind[\s\S]*status/i); // insert stamps kind
    expect(body).toMatch(/'submitted'/);
    // Must NOT accept a caller-supplied status (no admin-status footgun).
    expect(body).not.toMatch(/p_status/);
    expect(exec).toMatch(/grant execute on function public\.submit_demand_request[\s\S]*to authenticated/i);
    expect(exec).toMatch(/revoke all on function public\.submit_demand_request[\s\S]*from public/i);
  });

  it("does not fold/merge leads (kept as a distinct pre-auth funnel, §17.2)", () => {
    expect(exec).not.toMatch(/\bleads\b/i);
  });

  it("default-closed: no RLS widening; additive + reversible", () => {
    expect(exec).not.toMatch(/create policy|alter policy/i);
    expect(exec).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(exec).not.toMatch(/\bto\s+anon\b/i);
    expect(exec).not.toMatch(/drop\s+table\b/i);
    expect(exec).not.toMatch(/drop\s+column\b/i);
    expect(exec).not.toMatch(/drop\s+function\b/i); // drops live only in ROLLBACK comment
    expect(sql).toMatch(/--[^\n]*\brollback\b/i);
  });
});

describe("Guard: the pilot-request CTA writes the CANONICAL intake (not leads)", () => {
  // Strip comments so the "must not" checks test real CODE, not the prose that
  // (legitimately) names /api/leads to explain why it is NOT used.
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  const button = stripComments(readWeb("components/app/pilot-request-button.tsx"));
  const helper = stripComments(readWeb("lib/pilot/pilot-request.ts"));

  it("PilotRequestButton submits via the canonical action — no leads fetch", () => {
    // The shipped pilot-request CTA is the single demand front door. It must go
    // through the canonical submit action, never re-fork back onto the funnel.
    expect(button).toMatch(/submitPilotRequestAction/);
    expect(button).not.toMatch(/\/api\/leads/);
    expect(button).not.toMatch(/fetch\(/); // server action, not a network POST
  });

  it("the submit helper writes customer_requests via submit_demand_request (owner-scoped)", () => {
    expect(helper).toMatch(/submit_demand_request/);
    // User-scoped client + server-resolved owner; never the RLS-bypassing admin
    // client and never the leads table/endpoint.
    expect(helper).toMatch(/from\s+["']@\/lib\/supabase\/server["']/);
    expect(helper).toMatch(/auth\.getUser\(\)/);
    expect(helper).not.toMatch(/createAdminClient|SUPABASE_SERVICE_ROLE_KEY/);
    expect(helper).not.toMatch(/from\(["']leads["']\)/);
    expect(helper).not.toMatch(/\/api\/leads/);
  });
});
