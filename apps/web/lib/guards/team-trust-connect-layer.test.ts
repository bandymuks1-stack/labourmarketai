import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * TRUST CONNECT TEAMS v1 guards (wagon 2).
 *
 * Three pinned invariants on top of the team org spine (see
 * team-brigades-layer.test.ts):
 *
 *   1. TEAM DETAILS (20260716130000): 1:1 team-scoped
 *      availability/accommodation/transport rows, RLS default-closed to
 *      admin/owner/manager, ONE gated SECURITY DEFINER writer with bounded
 *      inputs. Employers never read the table raw.
 *   2. TEAM ENQUIRIES (20260716131000): the booking_requests state-machine
 *      clone at team granularity — proposed → accepted|declined|withdrawn|
 *      expired, append-only events, proposer can NEVER self-accept,
 *      rate-limited propose, NO contact leakage (no email/phone columns; the
 *      propose RPC refuses embedded contact details).
 *   3. APP LAYER: honest per-migration degradation flags; employer payloads
 *      carry display names only; enquiry statuses render as translated
 *      labels, never raw database words.
 */

const APP = join(process.cwd());
const REPO = join(APP, "..", "..");
const MIGRATIONS_DIR = join(REPO, "supabase", "migrations");

const DETAILS_FILE = "20260716130000_team_profile_details_v1.sql";
const ENQUIRIES_FILE = "20260716131000_team_enquiries_v1.sql";
const DETAILS_ROLLBACK =
  "supabase/rollbacks/20260716130000_team_profile_details_v1.down.sql";
const ENQUIRIES_ROLLBACK =
  "supabase/rollbacks/20260716131000_team_enquiries_v1.down.sql";

const NEW_FUNCTIONS_DETAILS = ["save_team_details_v1"];
const NEW_FUNCTIONS_ENQUIRIES = [
  "propose_team_enquiry_v1",
  "respond_team_enquiry_v1",
  "withdraw_team_enquiry_v1",
  "expire_stale_team_enquiries_v1",
  "list_my_team_enquiries_v1",
  "list_team_enquiries_for_my_teams_v1",
];

const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const readWeb = (rel: string) => readFileSync(join(APP, rel), "utf8");
// CRLF-safe comment strip — prose comments may legitimately DISCUSS banned
// shapes; only executable SQL is checked.
const stripSql = (src: string) =>
  src
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

describe("team details migration (20260716130000) — bounded 1:1 rows, one gated writer", () => {
  const migration = read(`supabase/migrations/${DETAILS_FILE}`);
  const code = stripSql(migration);

  it("is a human-gated DRAFT with the annotation and no db-push path", () => {
    expect(migration).toMatch(/DRAFT — needs-human-gate/);
    expect(migration).toMatch(/DO NOT APPLY without explicit owner OK/);
    expect(migration).toMatch(/--\s*@human-gate-approved/);
    expect(migration).toMatch(/Never `db push`/);
  });

  it("creates ONLY team_details keyed 1:1 by the team org id", () => {
    const created = [...code.matchAll(/create table if not exists public\.([a-z_]+)/gi)].map(
      (m) => m[1],
    );
    expect(created).toEqual(["team_details"]);
    expect(code).toMatch(
      /org_id\s+uuid primary key references public\.organizations\(id\) on delete cascade/i,
    );
  });

  it("bounds every free field: closed status set, 1–365 trip days, 500-char note", () => {
    expect(code).toMatch(/'available_now','available_from','not_available'/);
    expect(code).toMatch(/max_trip_days between 1 and 365/i);
    expect(code).toMatch(/char_length\(note\) <= 500/i);
    // available_from is REQUIRED when the status says so (no half-truth rows).
    expect(code).toMatch(
      /availability_status <> 'available_from' or available_from is not null/i,
    );
  });

  it("RLS default-closed: ONE select policy (admin/owner/manager), zero write policies", () => {
    expect(code).toMatch(/alter table public\.team_details enable row level security/i);
    const policies = [...code.matchAll(/create policy ([a-z_]+)/gi)].map((m) => m[1]);
    expect(policies).toEqual(["team_details_select"]);
    expect(code).toMatch(/for select to authenticated/i);
    expect(code).toMatch(/public\.is_admin\(\)/);
    expect(code).toMatch(/owner_profile_id = auth\.uid\(\)/);
    expect(code).toMatch(/public\.manages_organization\(org_id\)/);
    expect(code).not.toMatch(/create policy[\s\S]{0,200}?for (insert|update|delete|all)/i);
  });

  it("the ONLY writer is the gated SECURITY DEFINER RPC, granted to authenticated only", () => {
    const fns = [
      ...code.matchAll(/create (?:or replace )?function public\.([a-z0-9_]+)/gi),
    ].map((m) => m[1]);
    expect([...fns].sort()).toEqual([...NEW_FUNCTIONS_DETAILS].sort());
    expect(code).toMatch(/security definer/i);
    expect(code).toMatch(/set search_path = public/i);
    expect(code).toMatch(/revoke all on function public\.save_team_details_v1/i);
    expect(code).toMatch(
      /grant execute on function public\.save_team_details_v1[\s\S]{0,120}to authenticated/i,
    );
    expect(code).not.toMatch(/\bto anon\b|\bto public\b(?!\.)/i);
    // Writer gate mirrors the spine: admin / team owner / org manager, and
    // ONLY for organization_type='team' rows.
    expect(code).toMatch(/v_type <> 'team'/);
    expect(code).toMatch(/'not_allowed'/);
    // Every save leaves an audit row.
    expect(code).toMatch(/insert into public\.audit_logs/i);
  });

  it("rollback exists and drops ONLY the new objects (nothing recreated)", () => {
    expect(existsSync(join(REPO, DETAILS_ROLLBACK))).toBe(true);
    const down = stripSql(read(DETAILS_ROLLBACK));
    expect(down).toMatch(/drop function if exists public\.save_team_details_v1/i);
    expect(down).toMatch(/drop table if exists public\.team_details/i);
    expect(down).not.toMatch(/create (or replace )?function/i);
    expect(down).not.toMatch(/delete from public\.audit_logs/i);
  });
});

describe("team enquiries migration (20260716131000) — booking-pattern clone, no contact leakage", () => {
  const migration = read(`supabase/migrations/${ENQUIRIES_FILE}`);
  const code = stripSql(migration);

  it("is a human-gated DRAFT with the annotation and the apply-order note", () => {
    expect(migration).toMatch(/DRAFT — needs-human-gate/);
    expect(migration).toMatch(/DO NOT APPLY without explicit owner OK/);
    expect(migration).toMatch(/--\s*@human-gate-approved/);
    expect(migration).toMatch(/20260716130000_team_profile_details_v1\.sql FIRST/);
  });

  it("carries the SHARED CONTRACT state machine: created-status vocabulary + full 7-event lifecycle", () => {
    // Statuses (shared contract): created -> accepted|declined|withdrawn|expired.
    expect(code).toMatch(
      /status in\s*\(\s*'created','accepted','declined','withdrawn','expired'\)/i,
    );
    // delivered/viewed are EVENTS, never statuses.
    expect(code).not.toMatch(/status in[\s\S]{0,120}'delivered'/i);
    expect(code).not.toMatch(/status in[\s\S]{0,120}'viewed'/i);
    expect(code).toMatch(
      /event_type in\s*\(\s*'created','delivered','viewed','accepted','declined',\s*'withdrawn','expired'\)/i,
    );
    // Events carry the contract columns.
    expect(code).toMatch(/actor_profile_id uuid not null references public\.profiles\(id\)/i);
    // 14-day expiry recorded on the row; reads treat past-expiry as expired.
    expect(code).toMatch(/expires_at\s+timestamptz not null default now\(\) \+ interval '14 days'/i);
    expect(code).toMatch(/case when e\.status = 'created' and e\.expires_at <= now\(\)\s*then 'expired' else e\.status end/i);
    // 'viewed' has a real deduplicated writer on the team-side inbox read.
    expect(code).toMatch(/'viewed'/);
    expect(code).toMatch(/not exists \(select 1 from public\.team_enquiry_events ev\s*where ev\.enquiry_id = e\.id and ev\.event_type = 'viewed'\)/i);
    // Events are append-only: the migration never updates or deletes them and
    // grants no write policy anywhere (writes are RPC-only).
    expect(code).not.toMatch(/update public\.team_enquiry_events/i);
    expect(code).not.toMatch(/delete from public\.team_enquiry_events/i);
    const policies = [...code.matchAll(/create policy ([a-z_]+)/gi)].map((m) => m[1]);
    expect([...policies].sort()).toEqual(
      ["team_enquiries_select", "team_enquiry_events_select"].sort(),
    );
    expect(code).not.toMatch(/create policy[\s\S]{0,200}?for (insert|update|delete|all)/i);
  });

  it("NO contact leakage: no email/phone columns, and the propose RPC refuses embedded contacts", () => {
    // Table shapes carry platform data only.
    const tables = code.match(/create table[\s\S]*?\);/gi) ?? [];
    expect(tables.length).toBe(2);
    for (const t of tables) {
      expect(t).not.toMatch(/email/i);
      expect(t).not.toMatch(/phone/i);
    }
    // The propose guard: email regex + phone-like digit-run token check.
    expect(code).toMatch(/'contact_details_in_message'/);
    expect(code).toMatch(/regexp_split_to_table\(v_msg, '\\s\+'\)/);
    expect(code).toMatch(/>= 9/);
    // Read models return display names only — never an email selection.
    expect(code).not.toMatch(/invited_email|\.email\b/i);
  });

  it("the requester can NEVER accept their own enquiry; respond is team-owner/manager-only", () => {
    // Create blocks the team's own owner/managers up front…
    expect(code).toMatch(/'own_team'/);
    // …and respond refuses the requesting profile even if they also manage
    // the team, then requires owner/manager authority.
    expect(code).toMatch(/if e\.owner_id = uid then return 'not_allowed'; end if;/);
    expect(code).toMatch(
      /v_team_owner = uid or public\.manages_organization\(e\.team_org_id\)/,
    );
    // Only an open enquiry can be answered / withdrawn.
    expect(code).toMatch(/if e\.status <> 'created' then return 'not_open'; end if;/);
    // Withdraw is requester-only.
    expect(code).toMatch(/if e\.owner_id <> uid then return 'not_allowed'; end if;/);
  });

  it("IDEMPOTENCY (shared contract): duplicate create returns the EXISTING enquiry, never a second row", () => {
    expect(code).toMatch(/'existing_open', 'enquiry_id', v_existing/);
    // Enforced structurally too: one open row per (requester, team).
    expect(code).toMatch(/create unique index if not exists team_enquiries_one_open_idx/i);
    expect(code).toMatch(/where status = 'created'/);
  });

  it("abuse bounds are present: 10 open + 30/24h per requester, 500-char message", () => {
    expect(code).toMatch(/v_open >= 10/);
    expect(code).toMatch(/v_day >= 30/);
    expect(code).toMatch(/interval '24 hours'/);
    expect(code).toMatch(/char_length\(message\) between 1 and 500/i);
    expect(code).toMatch(/> 500/);
  });

  it("'expired' has real writers: admin-only sweep (capped, no scheduler) + finalise-on-touch", () => {
    expect(code).toMatch(/expire_stale_team_enquiries_v1/);
    expect(code).toMatch(/not public\.is_admin\(\)/);
    expect(code).toMatch(/limit 500/);
    expect(code).not.toMatch(/pg_cron|cron\.schedule/i);
    // respond/withdraw finalise a past-expiry open row honestly.
    const touches = code.match(/if e\.expires_at <= now\(\) then/gi) ?? [];
    expect(touches.length).toBeGreaterThanOrEqual(2);
  });

  it("creates ONLY the six brand-new RPCs, SECURITY DEFINER, authenticated-only grants", () => {
    const fns = [
      ...code.matchAll(/create (?:or replace )?function public\.([a-z0-9_]+)/gi),
    ].map((m) => m[1]);
    expect([...fns].sort()).toEqual([...NEW_FUNCTIONS_ENQUIRIES].sort());
    expect(code).toMatch(/security definer/i);
    expect(code).toMatch(/set search_path = public/i);
    const grants = [...code.matchAll(/grant execute on function[\s\S]{0,160}?to ([a-z]+)/gi)].map(
      (m) => m[1],
    );
    expect(new Set(grants)).toEqual(new Set(["authenticated"]));
    expect(code).not.toMatch(/\bto anon\b/i);
    // Every state change appends an audit row.
    const auditInserts = code.match(/insert into public\.audit_logs/gi) ?? [];
    expect(auditInserts.length).toBeGreaterThanOrEqual(4);
  });

  it("all seven new function names are NEW to the repo — never defined by a prior migration", () => {
    const others = readdirSync(MIGRATIONS_DIR).filter(
      (f) => f.endsWith(".sql") && f !== DETAILS_FILE && f !== ENQUIRIES_FILE,
    );
    expect(others.length).toBeGreaterThan(100);
    for (const f of others) {
      const src = read(`supabase/migrations/${f}`);
      for (const fn of [...NEW_FUNCTIONS_DETAILS, ...NEW_FUNCTIONS_ENQUIRIES]) {
        expect(src, `${f} must not define ${fn}`).not.toContain(fn);
      }
    }
  });

  it("rollback exists, drops ONLY the new objects, and recreates nothing", () => {
    expect(existsSync(join(REPO, ENQUIRIES_ROLLBACK))).toBe(true);
    const down = stripSql(read(ENQUIRIES_ROLLBACK));
    for (const fn of NEW_FUNCTIONS_ENQUIRIES) {
      expect(down).toMatch(new RegExp(`drop function if exists public\\.${fn}`, "i"));
    }
    expect(down).toMatch(/drop table if exists public\.team_enquiry_events/i);
    expect(down).toMatch(/drop table if exists public\.team_enquiries/i);
    expect(down).not.toMatch(/create (or replace )?function/i);
    expect(down).not.toMatch(/drop table if exists public\.(organizations|profiles|invitations|booking_requests)/i);
  });
});

describe("app layer — honest degradation + no contact fields in enquiry payloads", () => {
  const enquiriesLib = readWeb("lib/company/team-enquiries.ts");
  const enquiryActions = readWeb("lib/company/team-enquiry-actions.ts");
  const entry = readWeb("components/app/team-enquiry-entry.tsx");
  const inbox = readWeb("components/app/team-enquiry-inbox.tsx");
  const brigadesLib = readWeb("lib/company/team-brigades.ts");

  it("employer enquiry payloads carry NO email/phone fields — display names only", () => {
    for (const [name, src] of [
      ["team-enquiries.ts", enquiriesLib],
      ["team-enquiry-actions.ts", enquiryActions],
      ["team-enquiry-entry.tsx", entry],
      ["team-enquiry-inbox.tsx", inbox],
    ] as const) {
      // No email/phone-shaped property is declared or read anywhere in the
      // enquiry surfaces (contact stays behind the existing permission-gated
      // message flow, never inside an enquiry).
      expect(src, `${name} must not carry an email property`).not.toMatch(
        /\bemail\b\s*[:?]/i,
      );
      expect(src, `${name} must not carry a phone property`).not.toMatch(
        /\bphone\b\s*[:?]/i,
      );
    }
  });

  it("every write goes through the gated state-machine RPCs (no table writes app-side)", () => {
    expect(enquiryActions).toMatch(/rpc\("propose_team_enquiry_v1"/);
    expect(enquiryActions).toMatch(/rpc\("withdraw_team_enquiry_v1"/);
    expect(enquiryActions).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    expect(enquiriesLib).toMatch(/rpc\("list_my_team_enquiries_v1"/);
    expect(enquiriesLib).not.toMatch(/\.from\("team_enquiries"\)/);
  });

  it("degrades honestly: 42883 probes map to needs-migration, never a fake empty success", () => {
    expect(enquiriesLib).toMatch(/RPC_NOT_FOUND_CODE = "42883"/);
    expect(enquiriesLib).toMatch(/needs-migration/);
    expect(enquiryActions).toMatch(/needs_migration/);
    expect(brigadesLib).toMatch(/detailsApplied/);
    expect(brigadesLib).toMatch(/enquiriesApplied/);
    expect(brigadesLib).toMatch(/invitationsApplied/);
  });

  it("statuses render as translated labels — never a raw status word", () => {
    for (const src of [entry, inbox]) {
      expect(src).toMatch(/statusLabel/);
      expect(src).toMatch(/t\("status\.other"\)/);
      // The raw value is never printed as a fallback.
      expect(src).not.toMatch(/\{e\.status\}/);
    }
  });

  it("the employer entry lives ONLY where a team is already visible (network search) — no directory", () => {
    const network = readWeb("app/[locale]/dashboard/network/page.tsx");
    expect(network).toMatch(/c\.organizationType === "team"/);
    expect(network).toMatch(/<TeamEnquiryButton teamOrgId=\{c\.organizationId\}/);
    // No new team listing/browse surface is introduced anywhere.
    expect(network).not.toMatch(/\.eq\("organization_type", "team"\)/);
  });
});
