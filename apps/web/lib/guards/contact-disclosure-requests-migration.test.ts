import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contact disclosure requests v1 (Wagon 1, SHARED CONTACT/CONSENT CONTRACT)
 * — draft-migration guard.
 *
 * Pins the SQL invariants of
 * supabase/migrations/20260716120000_contact_disclosure_requests_v1.sql:
 * DRAFT gate present; shared-contract status vocabulary (created → accepted |
 * declined | withdrawn | expired) with delivered/viewed as EVENT types only;
 * idempotent create (partial unique index on the live 'created' row, dedupe
 * returns the existing id); 14-day expiry + admin-only sweep RPC; audit rows
 * (events with actor_profile_id + audit_logs) on every state change; RLS
 * default-closed with RPC-only writes; append-only event log; closed field
 * whitelist identical to the applied consent RPC; worker-only respond that
 * NEVER touches the consent ledger (accepting discloses nothing); abuse caps
 * inside the RPC; FKs to applied tables only; paired guarded rollback. Also
 * pins the v3 booking rate-limit wrapper.
 */

const root = join(__dirname, "..", "..", "..", "..");
const MIGRATION = join(
  root,
  "supabase",
  "migrations",
  "20260716120000_contact_disclosure_requests_v1.sql",
);
const ROLLBACK = join(
  root,
  "supabase",
  "rollbacks",
  "20260716120000_contact_disclosure_requests_v1.down.sql",
);
const V3_MIGRATION = join(
  root,
  "supabase",
  "migrations",
  "20260716121000_request_rate_limits_v3.sql",
);
const V3_ROLLBACK = join(
  root,
  "supabase",
  "rollbacks",
  "20260716121000_request_rate_limits_v3.down.sql",
);

const sql = readFileSync(MIGRATION, "utf8");
const sqlNoComments = sql.replace(/--[^\n]*/g, "");

describe("draft gate + rollback pairing", () => {
  it("both migrations carry the DRAFT needs-human-gate header on line 1", () => {
    for (const file of [MIGRATION, V3_MIGRATION]) {
      const firstLine = readFileSync(file, "utf8").split("\n")[0];
      expect(firstLine).toMatch(/^--\s*DRAFT — needs-human-gate — DO NOT APPLY/);
    }
  });

  it("paired rollbacks exist and the data-bearing one is guarded", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    expect(existsSync(V3_ROLLBACK)).toBe(true);
    const down = readFileSync(ROLLBACK, "utf8");
    expect(down).toMatch(/refusing automatic rollback/);
    expect(down).toMatch(/drop table if exists public\.contact_disclosure_requests/);
  });
});

describe("shared-contract status + event vocabulary", () => {
  it("request status is EXACTLY created|accepted|declined|withdrawn|expired", () => {
    expect(sqlNoComments).toMatch(
      /status\s+text not null default 'created' check \(status in\s*\('created','accepted','declined','withdrawn','expired'\)\)/,
    );
  });

  it("delivered/viewed live ONLY in the events vocabulary (7-step lifecycle)", () => {
    expect(sqlNoComments).toMatch(
      /event_type\s+text not null check \(event_type in\s*\('created','delivered','viewed','accepted',\s*'declined','withdrawn','expired'\)\)/,
    );
  });

  it("events carry actor_profile_id / event_type / from_status / to_status", () => {
    const events =
      sqlNoComments
        .split("create table if not exists public.contact_disclosure_request_events")[1]
        ?.split(");")[0] ?? "";
    for (const col of ["actor_profile_id", "event_type", "from_status", "to_status", "created_at"]) {
      expect(events).toContain(col);
    }
  });

  it("every state change also appends an audit_logs row (invitations pattern)", () => {
    expect(sqlNoComments).toMatch(/insert into public\.audit_logs \(actor_id, action, entity, entity_id, payload\)/);
    // The shared logger is used by create, respond, withdraw and the sweep.
    const calls = sqlNoComments.match(/perform public\.contact_disclosure_log_change\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(5);
  });
});

describe("idempotency + expiry (shared contract)", () => {
  it("unique PARTIAL index on (owner, request, worker) WHERE status='created'", () => {
    expect(sqlNoComments).toMatch(
      /create unique index if not exists contact_disclosure_requests_live_uniq\s+on public\.contact_disclosure_requests \(owner_id, request_id, worker_id\)\s+where status = 'created'/,
    );
  });

  it("duplicate create returns the EXISTING request, never a second row", () => {
    expect(sqlNoComments).toMatch(/'deduplicated', true/);
  });

  it("expiry is created_at + 14 days", () => {
    expect(sqlNoComments).toMatch(
      /expires_at\s+timestamptz not null default now\(\) \+ interval '14 days'/,
    );
  });

  it("expiry sweep RPC is admin-only (no scheduler)", () => {
    const fn =
      sqlNoComments
        .split("function public.expire_contact_disclosure_requests_v1")[1]
        ?.split("$$;")[0] ?? "";
    expect(fn).toMatch(/not public\.is_admin\(\)/);
    expect(fn).toMatch(/status = 'created' and expires_at <= now\(\)/);
  });
});

describe("RLS: default-closed, RPC-only writes", () => {
  it("enables RLS on both tables", () => {
    expect(sqlNoComments).toMatch(
      /alter table public\.contact_disclosure_requests enable row level security/,
    );
    expect(sqlNoComments).toMatch(
      /alter table public\.contact_disclosure_request_events enable row level security/,
    );
  });

  it("creates ONLY select policies — no insert/update/delete policy exists", () => {
    const policies = sqlNoComments
      .split(/create policy/)
      .slice(1)
      .map((p) => p.slice(0, 200));
    expect(policies.length).toBe(2);
    for (const p of policies) {
      expect(p).toMatch(/for select/);
      expect(p).not.toMatch(/for (insert|update|delete)/);
    }
  });

  it("never grants table write privileges to authenticated", () => {
    expect(sqlNoComments).not.toMatch(
      /grant\s+(insert|update|delete|all)[^;]*on\s+public\.contact_disclosure_request/i,
    );
  });

  it("event log is append-only (trigger blocks update/delete for every role)", () => {
    expect(sqlNoComments).toMatch(
      /create trigger contact_disclosure_request_events_append_only\s+before update or delete/,
    );
  });
});

describe("propose RPC — scope, whitelist and caps", () => {
  const fn =
    sqlNoComments
      .split("function public.propose_contact_disclosure_request_v1")[1]
      ?.split("$$;")[0] ?? "";

  it("requires demand ownership, org ownership and worker visibility (fail closed)", () => {
    expect(fn).toMatch(/cr\.profile_id = v_uid/);
    expect(fn).toMatch(/owner_profile_id = v_uid or public\.manages_organization/);
    expect(fn).toMatch(/public\.can_view_worker\(p_worker_id\)/);
  });

  it("enforces the closed 7-field whitelist (same as the applied consent RPC)", () => {
    expect(fn).toMatch(
      /'full_name', 'phone', 'email', 'cv_document',\s*'preferred_locations', 'availability_details', 'salary_expectation'/,
    );
    expect(fn).toMatch(/field_not_allowed/);
  });

  it("bounds the free-text message to 500 chars", () => {
    expect(sqlNoComments).toMatch(/char_length\(note\) <= 500/);
    expect(fn).toMatch(/char_length\(p_note\) > 500/);
  });

  it("enforces the 10-open / 30-per-24h caps inside the DB", () => {
    expect(fn).toMatch(/v_open >= 10/);
    expect(fn).toMatch(/v_day >= 30/);
    expect(fn).toMatch(/interval '24 hours'/);
  });
});

describe("respond RPC — worker-only, discloses NOTHING", () => {
  const fn =
    sqlNoComments
      .split("function public.respond_contact_disclosure_request_v1")[1]
      ?.split("$$;")[0] ?? "";

  it("only the subject worker may answer, and only created→accepted|declined", () => {
    expect(fn).toMatch(/w\.id = v_row\.worker_id and w\.profile_id = v_uid/);
    expect(fn).toMatch(/not_the_subject_worker/);
    expect(fn).toMatch(/p_decision not in \('accepted', 'declined'\)/);
    expect(fn).toMatch(/v_row\.status <> 'created'/);
  });

  it("accepting NEVER touches the consent ledger (separate grant, applied RPC only)", () => {
    // The migration must never write or call the consent ledger — the applied
    // grant RPC is the only writer, invoked by the worker's SEPARATE action.
    expect(sqlNoComments).not.toMatch(/insert into public\.privacy_consent_events/);
    expect(sqlNoComments).not.toMatch(/grant_employer_data_disclosure\s*\(/);
  });
});

describe("no contact data in the request row; FKs to applied tables only", () => {
  const tableDef =
    sqlNoComments
      .split("create table if not exists public.contact_disclosure_requests")[1]
      ?.split(");")[0] ?? "";

  it("the table carries field NAMES (requested_fields) — no contact column", () => {
    expect(tableDef).toMatch(/requested_fields jsonb not null/);
    for (const forbidden of ["phone ", "email ", "address ", "full_name "]) {
      expect(tableDef).not.toContain(forbidden);
    }
  });

  it("references ONLY applied tables (no other unmerged wagon's tables)", () => {
    const refs = [...sqlNoComments.matchAll(/references public\.(\w+)/g)].map((m) => m[1]);
    const allowed = new Set([
      "profiles",
      "organizations",
      "customer_requests",
      "workers",
      "contact_disclosure_requests",
    ]);
    for (const r of refs) expect(allowed.has(r), `FK to ${r}`).toBe(true);
    expect(sqlNoComments).not.toMatch(/team_enquiries|team_details|pilots/);
  });
});

describe("v3 booking rate-limit wrapper (defense-in-depth)", () => {
  const v3 = readFileSync(V3_MIGRATION, "utf8").replace(/--[^\n]*/g, "");

  it("enforces the same 10-open / 30-per-24h caps and delegates to the UNCHANGED v1", () => {
    expect(v3).toMatch(/v_open >= 10/);
    expect(v3).toMatch(/v_day >= 30/);
    expect(v3).toMatch(/return public\.propose_booking_request\(/);
    // It must WRAP, never redefine, the applied v1 function.
    expect(v3).not.toMatch(/create or replace function public\.propose_booking_request\(/);
  });
});
