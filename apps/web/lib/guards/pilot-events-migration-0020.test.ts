import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pinning tests for `supabase/migrations/0020_pilot_events.sql` and the
 * Agent OS pilot-telemetry surface (server action + client helper + admin
 * pages).
 *
 * Privacy contract (encoded here so future edits can't silently regress):
 *   - Table is RLS-enabled; SELECT is admin-only via `public.is_admin()`.
 *   - INSERT restricts `profile_id` to `auth.uid()` OR NULL (anon tester).
 *   - No UPDATE / DELETE policy → append-only inbox.
 *   - Grants limited to `authenticated`; `anon` / `public` are empty.
 *   - Additive only — no DROP / no ALTER drop / no DELETE FROM.
 *   - Server action enforces metadata allowlist + 200-char value cap +
 *     2 KB total size cap, derives `profile_id` server-side from
 *     `supabase.auth.getUser()` (client never says who it is), and uses
 *     no service_role.
 *   - Client helper is fire-and-forget (never throws, never blocks),
 *     uses a pseudonymous per-tab session id, and DOES NOT add any
 *     continuous-tracking listeners (no document.addEventListener for
 *     scroll / pointermove / keydown / etc).
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const APP_ROOT = join(process.cwd());

function readRepo(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf-8");
}
function readApp(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf-8");
}

const migration = readRepo("supabase/migrations/0020_pilot_events.sql");
const action = readApp("lib/telemetry/actions.ts");
const helper = readApp("lib/telemetry/task.ts");
const adminAgent = readApp("app/[locale]/dashboard/admin/agent-os/page.tsx");
const adminTelemetry = readApp(
  "app/[locale]/dashboard/admin/telemetry/page.tsx",
);

describe("0020 — pilot_events table + RLS", () => {
  it("creates the table with the v1 columns + bounded check constraints", () => {
    expect(migration).toMatch(
      /create table if not exists public\.pilot_events/i,
    );
    for (const col of [
      "id",
      "created_at",
      "profile_id",
      "session_id",
      "route",
      "locale",
      "event_name",
      "task_name",
      "task_step",
      "duration_ms",
      "result",
      "error_code",
      "metadata",
      "app_version",
    ]) {
      expect(migration).toContain(col);
    }
    // Result column is constrained to the v1 vocabulary.
    expect(migration).toMatch(
      /result[\s\S]{0,200}check\s*\(result in\s*\(\s*'started','success','error','abandoned','info'\s*\)\)/i,
    );
    // session_id has a char_length cap.
    expect(migration).toMatch(/char_length\(session_id\)\s*<=\s*64/);
  });

  it("enables RLS on the table", () => {
    expect(migration).toMatch(
      /alter table public\.pilot_events enable row level security/i,
    );
  });

  it("SELECT policy is admin-only via public.is_admin()", () => {
    expect(migration).toMatch(
      /create policy pilot_events_select on public\.pilot_events for select[\s\S]*using\s*\(\s*public\.is_admin\(\)\s*\)/i,
    );
  });

  it("INSERT policy restricts profile_id to auth.uid() OR NULL", () => {
    expect(migration).toMatch(
      /create policy pilot_events_insert on public\.pilot_events for insert[\s\S]*with check\s*\(\s*profile_id is null or profile_id = auth\.uid\(\)\s*\)/i,
    );
  });

  it("no UPDATE / DELETE policy is declared (append-only)", () => {
    expect(migration).not.toMatch(/for update/i);
    expect(migration).not.toMatch(/for delete/i);
  });

  it("grants select + insert only to authenticated (no public / anon)", () => {
    expect(migration).toMatch(
      /grant select, insert on public\.pilot_events to authenticated/i,
    );
    expect(migration).not.toMatch(/grant[^;]*to\s+anon/i);
    expect(migration).not.toMatch(/grant[^;]*to\s+public/i);
  });

  it("is additive — no DROP / no ALTER drop / no DELETE FROM", () => {
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|function|policy)\b/i);
    expect(migration).not.toMatch(/\balter\s+table[\s\S]*\bdrop\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
  });
});

describe("recordPilotEvent server action — privacy contract", () => {
  it("exports a tagged RecordPilotEventResult", () => {
    expect(action).toMatch(/export type RecordPilotEventResult\s*=/);
    expect(action).toMatch(/ok:\s*true/);
    expect(action).toMatch(/ok:\s*false/);
  });

  it("never throws strings for known validation paths", () => {
    expect(action).not.toMatch(/throw new Error\(/);
  });

  it("does not use service_role / admin runtime client", () => {
    expect(action).not.toMatch(/service[_-]?role/i);
    expect(action).not.toMatch(/SUPABASE_SERVICE_ROLE/);
    expect(action).not.toMatch(/createAdminClient/i);
  });

  it("derives profile_id server-side via supabase.auth.getUser() — client never says who it is", () => {
    expect(action).toMatch(/supabase\.auth\.getUser\(\)/);
    expect(action).toMatch(/const\s+profileId\s*=\s*user\??\.id\s*\?\?\s*null/);
    // The client-side helper MUST NOT pass a profile_id through — pin
    // that on the input type shape (no profileId / userId field).
    expect(action).toMatch(/export type PilotEventInput\s*=/);
    expect(action).not.toMatch(/profileId\??:\s*string/);
  });

  it("enforces a metadata allowlist", () => {
    expect(action).toMatch(/ALLOWED_METADATA_KEYS/);
    // The allowlist must NOT contain any free-text body keys.
    expect(action).not.toMatch(/['"]journal_text['"]/);
    expect(action).not.toMatch(/['"]profile_text['"]/);
    expect(action).not.toMatch(/['"]comment_body['"]/);
    expect(action).not.toMatch(/['"]selected_text['"]/);
    expect(action).not.toMatch(/['"]raw_text['"]/);
  });

  it("caps scalar metadata values + total metadata size", () => {
    expect(action).toMatch(/SCALAR_VALUE_MAX/);
    expect(action).toMatch(/METADATA_BYTE_MAX/);
  });
});

describe("task helper — fire-and-forget + no continuous tracking", () => {
  it("never throws (catches inside fire())", () => {
    expect(helper).toMatch(/\.catch\(/);
  });

  it("does NOT register any continuous-tracking listeners", () => {
    // No document.addEventListener for input/scroll/keydown/pointermove.
    expect(helper).not.toMatch(
      /document\.addEventListener\(\s*['"](?:input|keydown|keyup|keypress|scroll|pointermove|mousemove|click)['"]/,
    );
    expect(helper).not.toMatch(
      /window\.addEventListener\(\s*['"](?:scroll|keydown|input|pointermove|mousemove)['"]/,
    );
  });

  it("session_id is generated by crypto.getRandomValues, cached in sessionStorage", () => {
    expect(helper).toMatch(/crypto\.getRandomValues/);
    expect(helper).toMatch(/sessionStorage/);
  });

  it("never sends a query-string-bearing route (path only)", () => {
    expect(helper).toMatch(/document\.location\.pathname/);
    expect(helper).not.toMatch(/document\.location\.href/);
    expect(helper).not.toMatch(/document\.location\.search/);
  });
});

describe("admin pages are admin-only (server gate + RLS)", () => {
  it("agent-os page requires superadmin server-side", () => {
    expect(adminAgent).toMatch(/await\s+requireSuperadmin\(\s*locale\s*\)/);
  });

  it("telemetry page requires superadmin server-side", () => {
    expect(adminTelemetry).toMatch(/await\s+requireSuperadmin\(\s*locale\s*\)/);
  });

  it("admin pages never use service_role", () => {
    expect(adminAgent).not.toMatch(/service[_-]?role/i);
    expect(adminTelemetry).not.toMatch(/service[_-]?role/i);
  });
});
