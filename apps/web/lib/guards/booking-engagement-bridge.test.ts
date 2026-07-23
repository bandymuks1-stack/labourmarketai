import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BOOKING-ENGAGEMENT BRIDGE GUARDS (booking-engagement bridge v1).
 *
 * The 2026-07-23 employer full E2E dead-ended at step 10: an ACCEPTED booking
 * gave the company no path to project assignment (roster requires an
 * email-keyed invitation; the scouting candidate is anonymized). Migration
 * 20260723120000 closes that with ONE limited, auditable engagement primitive.
 * These guards pin its whole contract: statuses, idempotency anchors,
 * caller-bound NULL-safe authorization, least-privilege grants, the exact
 * one-branch widening of the assign gate, honest app-side degradation until
 * the owner applies the migration, and the untouched roster semantics
 * everywhere else.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const readRepo = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

const MIGRATION =
  "supabase/migrations/20260723120000_company_worker_engagements_v1.sql";
const ROLLBACK =
  "supabase/rollbacks/20260723120000_company_worker_engagements_v1.down.sql";

const migration = () => readRepo(MIGRATION);
const rollback = () => readRepo(ROLLBACK);
/** SQL with `-- …` comment lines removed — for pins that must not be tripped
 *  by header prose (the annotation and service_role are DISCUSSED there). */
const migrationSql = () =>
  migration()
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

/** The function body between `create or replace function public.<name>` and
 *  the closing grant line — coarse but stable for pinning. */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`create or replace function public.${name}`);
  expect(start, `${name} present`).toBeGreaterThan(-1);
  const rest = src.slice(start);
  const end = rest.indexOf("grant execute on function");
  return rest.slice(0, end === -1 ? undefined : end);
}

describe("engagement table — limited, auditable, idempotent by construction", () => {
  it("ships as an UNAPPLIED owner-gated draft with a paired rollback", () => {
    const m = migration();
    expect(m).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY automatically/);
    // Deliberately NOT self-annotated — RED is the intended CI state until
    // the owner reviews (repo rule: never self-add the annotation). The
    // header PROSE may mention the annotation; an actual standalone
    // annotation line must not exist.
    expect(m).not.toMatch(/^--\s*@human-gate-approved/m);
    expect(rollback().length).toBeGreaterThan(0);
  });

  it("explicit active/ended states and full provenance columns", () => {
    const m = migration();
    expect(m).toMatch(/check \(status in \('active','ended'\)\)/);
    expect(m).toMatch(/source_booking_id uuid not null references public\.booking_requests\(id\) on delete restrict/);
    for (const col of ["started_at", "ended_at", "ended_by", "created_at", "created_by", "subject_key"]) {
      expect(m, `column ${col}`).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("GDPR model A: no FK in this table can ever block a worker/profile erasure", () => {
    const m = migration();
    // worker link detaches, never blocks (issue #856 compatibility).
    expect(m).toMatch(/worker_id\s+uuid references public\.workers\(id\) on delete set null/);
    // actor references detach too — no NO-ACTION profiles FK anywhere here.
    expect(m).toMatch(/ended_by\s+uuid references public\.profiles\(id\) on delete set null/);
    expect(m).toMatch(/created_by\s+uuid references public\.profiles\(id\) on delete set null/);
    // The ONLY restrictive FK is the booking provenance anchor.
    const restricts = m.match(/on delete restrict/g) ?? [];
    expect(restricts.length).toBe(1);
    // No cascade into workers/profiles and no NOT NULL worker binding left.
    expect(m).not.toMatch(/worker_id\s+uuid not null/);
    // Pseudonymized surviving subject: random, derived from nothing.
    expect(m).toMatch(/subject_key\s+uuid not null default gen_random_uuid\(\)/);
  });

  it("a DETACHED engagement (worker erased) grants nothing anywhere", () => {
    const assign = fnBody(migration(), "caller_has_booking_engagement_for_project");
    expect(assign).toMatch(/e\.worker_id is not null/);
    const list = fnBody(migration(), "list_booking_engagement_workers_v1");
    expect(list).toMatch(/e\.worker_id is not null/);
    // The picker also inner-joins workers — a NULL worker can never surface.
    expect(list).toMatch(/join public\.workers\s+w on w\.id = e\.worker_id/);
  });

  it("idempotency anchors: one engagement per booking + one ACTIVE per pair", () => {
    const m = migration();
    expect(m).toMatch(/unique \(source_booking_id\)/);
    expect(m).toMatch(
      /create unique index if not exists company_worker_engagements_active_pair_idx[\s\S]{0,120}\(company_id, worker_id\)[\s\S]{0,40}where status = 'active'/,
    );
  });

  it("writes are RPC-only; anon/PUBLIC have nothing", () => {
    const m = migration();
    expect(m).toMatch(/revoke insert, update, delete on public\.company_worker_engagements from authenticated/);
    expect(m).toMatch(/revoke all on public\.company_worker_engagements from anon/);
    expect(m).toMatch(/revoke all on public\.company_worker_engagements from public/);
    // No INSERT/UPDATE/DELETE policy exists — SELECT only.
    expect(m).not.toMatch(/for (insert|update|delete)/);
  });

  it("SELECT policy is company-owner OR subject-worker OR admin — nothing broader", () => {
    const m = migration();
    const policy = m.slice(m.indexOf("create policy company_worker_engagements_select"));
    const using = policy.slice(0, policy.indexOf(";"));
    expect(using).toMatch(/owns_company\(company_id\)/);
    expect(using).toMatch(/w\.profile_id = auth\.uid\(\)/);
    expect(using).toMatch(/is_admin\(\)/);
    expect(using).not.toMatch(/is_employer|can_view_worker|true/);
  });
});

describe("respond_booking_request_v3 — v2 semantics + transactional engagement", () => {
  it("keeps worker-only, proposed-only and the overlap guard", () => {
    const body = fnBody(migration(), "respond_booking_request_v3");
    expect(body).toMatch(/Only the addressed worker may respond/);
    expect(body).toMatch(/br\.status is distinct from 'proposed'/);
    expect(body).toMatch(/Conflicting accepted booking for these dates/);
  });

  it("engagement is minted ONLY inside the accepted branch, in the same transaction", () => {
    const body = fnBody(migration(), "respond_booking_request_v3");
    const acceptedBranch = body.slice(body.indexOf("if p_decision = 'accepted' then", body.indexOf("insert into public.booking_request_events")));
    expect(acceptedBranch).toMatch(/insert into public\.company_worker_engagements/);
    // The decline path can never reach the insert: the only engagement insert
    // sits after the accepted check.
    const firstInsert = body.indexOf("insert into public.company_worker_engagements");
    const acceptedCheck = body.lastIndexOf("if p_decision = 'accepted' then", firstInsert);
    expect(acceptedCheck).toBeGreaterThan(-1);
  });

  it("derives the company from the booking's CANONICAL chain — no client ids", () => {
    const body = fnBody(migration(), "respond_booking_request_v3");
    // booking.request_id → customer_requests.profile_id → companies.
    expect(body).toMatch(/from public\.customer_requests cr\s*\n\s*where cr\.id = br\.request_id/);
    expect(body).toMatch(/c\.profile_id = v_demand_owner/);
    // The demand-owner ↔ booking-owner invariant is VERIFIED, not trusted.
    expect(body).toMatch(/v_demand_owner is distinct from br\.owner_id/);
    expect(body).toMatch(/values \(v_company, br\.worker_id, br\.id, uid\)/);
    // The function signature takes NO company_id / worker_id parameters.
    expect(body.slice(0, body.indexOf("returns"))).not.toMatch(/p_company_id|p_worker_id/);
  });

  it("NEVER picks a company implicitly: no created_at ordering, no LIMIT pick, ambiguity is an honest non-mint", () => {
    const body = fnBody(migration(), "respond_booking_request_v3");
    expect(body).not.toMatch(/order by c\.created_at/);
    expect(body).not.toMatch(/limit 1/);
    // Multiple owner companies → explicit refusal, never a guess.
    expect(body).toMatch(/v_company_count > 1/);
    expect(body).toMatch(/'ambiguous_company'/);
    // Zero companies / broken invariant → honest no_company.
    expect(body).toMatch(/v_company_count = 0/);
  });

  it("retry paths are explicit no-ops: already_recorded / already_active", () => {
    const body = fnBody(migration(), "respond_booking_request_v3");
    expect(body).toMatch(/'already_recorded'/);
    expect(body).toMatch(/'already_active'/);
    expect(body).toMatch(/on conflict \(source_booking_id\) do nothing/);
  });
});

describe("the assign gate is widened by exactly one branch — nothing else", () => {
  it("assign_worker_to_project requires can_manage_project AND (roster OR engagement)", () => {
    const body = fnBody(migration(), "assign_worker_to_project");
    expect(body).toMatch(/public\.can_manage_project\(pid\)/);
    expect(body).toMatch(/public\.caller_manages_worker\(w_id\)/);
    expect(body).toMatch(/public\.caller_has_booking_engagement_for_project\(w_id, pid\)/);
    expect(body).toMatch(/or public\.is_admin\(\)/);
  });

  it("caller_manages_worker itself is NOT redefined by this migration", () => {
    expect(migration()).not.toMatch(/create or replace function public\.caller_manages_worker/);
  });

  it("engagement authority binds worker→company→THIS project's canonical org, caller-bound and NULL-safe", () => {
    const body = fnBody(migration(), "caller_has_booking_engagement_for_project");
    expect(body).toMatch(/auth\.uid\(\) is not null/);
    expect(body).toMatch(/e\.status = 'active'/);
    expect(body).toMatch(/c\.profile_id is not distinct from auth\.uid\(\)/);
    expect(body).toMatch(/o\.legacy_company_id is not distinct from e\.company_id/);
    expect(body).toMatch(/p\.id = p_project_id/);
  });

  it("rollback restores the ORIGINAL roster-only assign gate", () => {
    const r = rollback();
    expect(r).toMatch(/create or replace function public\.assign_worker_to_project/);
    expect(r).toMatch(/public\.caller_manages_worker\(w_id\)/);
    expect(r).not.toMatch(/caller_has_booking_engagement_for_project\(w_id, pid\)/);
    expect(r).toMatch(/drop table if exists public\.company_worker_engagements/);
    for (const fn of [
      "respond_booking_request_v3",
      "list_booking_engagement_workers_v1",
      "end_company_worker_engagement_v1",
      "caller_has_booking_engagement_for_project",
    ]) {
      expect(r, `rollback drops ${fn}`).toMatch(new RegExp(`drop function if exists public\\.${fn}`));
    }
  });
});

describe("least privilege on every new function", () => {
  const FNS = [
    "respond_booking_request_v3(uuid, text, text, text)",
    "caller_has_booking_engagement_for_project(uuid, uuid)",
    "list_booking_engagement_workers_v1()",
    "end_company_worker_engagement_v1(uuid)",
  ];
  it("PUBLIC and anon are revoked; authenticated gets exactly EXECUTE", () => {
    const m = migration();
    for (const fn of FNS) {
      const esc = fn.replace(/[()]/g, "\\$&").replace(/, /g, ",\\s*");
      expect(m, `${fn} public revoke`).toMatch(
        new RegExp(`revoke all on function public\\.${esc} from public`),
      );
      expect(m, `${fn} anon revoke`).toMatch(
        new RegExp(`revoke all on function public\\.${esc} from anon`),
      );
      expect(m, `${fn} authenticated grant`).toMatch(
        new RegExp(`grant execute on function public\\.${esc} to authenticated`),
      );
    }
  });

  it("every SECURITY DEFINER pins search_path", () => {
    const m = migration();
    const definers = m.split("security definer").length - 1;
    const pinned = m.split("set search_path = public").length - 1;
    expect(definers).toBeGreaterThan(0);
    expect(pinned).toBeGreaterThanOrEqual(definers);
  });

  it("no service_role grant appears anywhere in the migration SQL", () => {
    expect(migrationSql()).not.toMatch(/service_role/);
  });
});

describe("picker read + explicit end stay narrow", () => {
  it("list RPC is caller-bound, active-only, and never selects email/contact fields", () => {
    const body = fnBody(migration(), "list_booking_engagement_workers_v1");
    expect(body).toMatch(/e\.status = 'active'/);
    expect(body).toMatch(/c\.profile_id is not distinct from auth\.uid\(\)/);
    expect(body).not.toMatch(/email|phone|contact/i);
  });

  it("end RPC: company-owner-or-worker bound, active-only, ends — never deletes", () => {
    const body = fnBody(migration(), "end_company_worker_engagement_v1");
    expect(body).toMatch(/owns_company\(e\.company_id\)/);
    expect(body).toMatch(/w\.profile_id = uid/);
    expect(body).toMatch(/set status = 'ended', ended_at = now\(\), ended_by = uid/);
    expect(body).not.toMatch(/delete from/);
  });
});

describe("app wiring — honest until applied, roster surfaces untouched", () => {
  it("accept calls v3 first and tags the honest needs_migration fallback via v1", () => {
    const src = read("lib/booking/booking-actions.ts");
    const acceptBlock = src.slice(src.indexOf('input.decision === "accepted"'));
    expect(acceptBlock).toMatch(/respond_booking_request_v3/);
    expect(acceptBlock).toMatch(/isAbsentFunction\(v3\.error\)/);
    expect(acceptBlock).toMatch(/engagement: "needs_migration"/);
    // The v1 fallback still completes the ACCEPT — the response is never lost.
    expect(acceptBlock).toMatch(/rpc\("respond_booking_request"/);
  });

  it("engagement picker read feature-detects and degrades honestly", () => {
    const src = read("lib/projects/booking-engagement-workers.ts");
    expect(src).toMatch(/list_booking_engagement_workers_v1/);
    expect(src).toMatch(/needs-migration/);
    for (const code of ["42883", "42P01", "PGRST202", "PGRST205"]) {
      expect(src, `absent code ${code}`).toContain(code);
    }
  });

  it("instructions picker (listManagedWorkers) stays roster-only — no engagement read", () => {
    const src = read("lib/instructions/instructions.ts");
    expect(src).not.toMatch(/company_worker_engagements|booking_engagement/);
  });

  it("the assign picker renders roster and engagement candidates as DISTINCT groups", () => {
    const src = read("components/app/project-assignment-manager.tsx");
    expect(src).toMatch(/data-testid="assign-roster-group"/);
    expect(src).toMatch(/data-testid="assign-engagement-group"/);
    expect(src).toMatch(/labels\.rosterGroupLabel/);
    expect(src).toMatch(/labels\.engagementGroupLabel/);
    // Render condition counts BOTH lists — an engagement-only company still
    // gets the form.
    expect(src).toMatch(/workers\.length === 0 && engagementWorkers\.length === 0/);
  });

  it("projects page fetches the engagement list separately from the roster", () => {
    const src = read("app/[locale]/dashboard/projects/page.tsx");
    expect(src).toMatch(/listBookingEngagementWorkers\(\)/);
    expect(src).toMatch(/listManagedWorkers\(\)/);
    expect(src).toMatch(/engagementWorkers=\{/);
  });

  it("both picker group labels exist in every active locale", () => {
    for (const locale of ["lt", "en", "de", "nl", "ru"] as const) {
      const j = JSON.parse(read(`messages/${locale}.json`)) as {
        projects?: { assign?: Record<string, string> };
      };
      expect(j.projects?.assign?.rosterGroup, `${locale} rosterGroup`).toBeTruthy();
      expect(j.projects?.assign?.engagementGroup, `${locale} engagementGroup`).toBeTruthy();
    }
  });
});
