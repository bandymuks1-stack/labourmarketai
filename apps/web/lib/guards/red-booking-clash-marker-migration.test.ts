import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pinning tests for
 * `supabase/migrations/20261025190000_booking_clash_acknowledged_marker_v1.sql`
 * — completes RED #5. PREPARED, NOT APPLIED; owner-gated.
 *
 * Production 2026-10-25 (walk orders-bookings O-5): v4 skipped its own clash
 * check on an acknowledged accept, but the table constraint
 * `booking_requests_no_overlapping_accepted` still refused the UPDATE, so the
 * person's decision could never land. The fix is a marker ON THE ROW (a
 * constraint cannot read the events table) and one added WHERE condition.
 *
 * These are a static reading of the SQL. The runtime evidence (throwaway PG16:
 * bug reproduced, up, 9 assertions, guarded down, byte-identical constraint
 * restore, re-apply) is in the PR description. What these protect is the
 * boundary a later "cleanup" could quietly widen:
 *
 *   every UNacknowledged accept stays protected exactly as today ·
 *   only an acknowledged REAL clash leaves the constraint ·
 *   the marker cannot outlive the acceptance it was given for ·
 *   v3 is untouched · the rollback refuses rather than rewrite bookings.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const NAME = "20261025190000_booking_clash_acknowledged_marker_v1";
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf-8");
const UP = read(`supabase/migrations/${NAME}.sql`);
const DOWN = read(`supabase/rollbacks/${NAME}.down.sql`);

/** SQL with `--` comments removed, so prose cannot satisfy an assertion. */
const code = (s: string) => s.replace(/--[^\n]*/g, "");
const UPC = code(UP);
const DOWNC = code(DOWN);

describe("the marker lives on the row", () => {
  it("adds one boolean, not null, default false", () => {
    expect(UPC).toMatch(
      /alter table public\.booking_requests\s+add column if not exists clash_acknowledged boolean not null default false;/,
    );
  });

  it("writes no data: no statement-level UPDATE or DELETE outside function bodies", () => {
    const outside = UPC.replace(/\$function\$[\s\S]*?\$function\$/g, "");
    expect(outside).not.toMatch(/\b(update|delete from)\s+public\./i);
  });
});

describe("the constraint keeps every unacknowledged accept protected", () => {
  it("re-creates the SAME exclusion with exactly one added condition", () => {
    expect(UPC).toMatch(/drop constraint if exists booking_requests_no_overlapping_accepted;/);
    expect(UPC).toMatch(
      /add constraint booking_requests_no_overlapping_accepted\s+exclude using gist \(\s+worker_id with =,\s+daterange\(start_date, coalesce\(expected_end_date, start_date\), '\[\]'\) with &&\s+\)\s+where \(status = 'accepted' and start_date is not null and not clash_acknowledged\);/,
    );
  });

  it("drop and re-add are in ONE transaction", () => {
    const begin = UPC.indexOf("begin;");
    const commit = UPC.lastIndexOf("commit;");
    const drop = UPC.indexOf("drop constraint if exists booking_requests_no_overlapping_accepted");
    const add = UPC.indexOf("add constraint booking_requests_no_overlapping_accepted");
    expect(begin).toBeGreaterThan(-1);
    expect(begin).toBeLessThan(drop);
    expect(drop).toBeLessThan(add);
    expect(add).toBeLessThan(commit);
  });
});

describe("v4 sets the marker only for an acknowledged real clash", () => {
  const v4 = UPC.slice(
    UPC.indexOf("create or replace function public.respond_booking_request_v4("),
    UPC.indexOf("$function$;", UPC.indexOf("create or replace function public.respond_booking_request_v4(")),
  );

  it("same signature, still SECURITY DEFINER with a pinned search_path", () => {
    expect(v4).toMatch(
      /respond_booking_request_v4\(\s+p_booking_id uuid,\s+p_decision text,\s+p_reason_kind text,\s+p_reason_note text,\s+p_acknowledge_clash boolean default false\s+\)/,
    );
    expect(v4).toMatch(/security definer\s+set search_path to 'public'/);
  });

  it("the marker needs BOTH the acknowledgement and a non-empty clash set", () => {
    expect(v4).toMatch(
      /v_mark := coalesce\(p_acknowledge_clash, false\) is true\s+and array_length\(v_clashes, 1\) is not null;/,
    );
  });

  it("it is written in the SAME UPDATE as the accept", () => {
    expect(v4).toMatch(
      /update public\.booking_requests\s+set status = p_decision,\s+clash_acknowledged = \(p_decision = 'accepted' and v_mark\),\s+updated_at = now\(\)\s+where id = br\.id\s+and status = 'proposed';/,
    );
  });

  it("the unacknowledged refusal is unchanged", () => {
    expect(v4).toMatch(
      /if array_length\(v_clashes, 1\) is not null and coalesce\(p_acknowledge_clash, false\) is not true then\s+raise exception 'Conflicting accepted booking for these dates'\s+using errcode = '23P01';/,
    );
  });

  it("the receipt is still written per counterpart", () => {
    expect(v4).toMatch(/'clash_acknowledged', 'proposed', 'accepted', v_clash/);
  });

  it("grants are restated exactly — nothing widens", () => {
    expect(UPC).toMatch(
      /revoke all on function public\.respond_booking_request_v4\(uuid, text, text, text, boolean\) from public, anon;/,
    );
    expect(UPC).toMatch(
      /grant execute on function public\.respond_booking_request_v4\(uuid, text, text, text, boolean\) to authenticated;/,
    );
    expect(UPC.match(/\bgrant\b/gi)).toHaveLength(1);
  });

  it("v3 is not touched", () => {
    expect(UPC).not.toMatch(/respond_booking_request_v3/);
  });
});

describe("the marker cannot outlive its acceptance", () => {
  it("a BEFORE INSERT OR UPDATE row trigger scopes it", () => {
    expect(UPC).toMatch(
      /create trigger booking_requests_clash_marker_scope\s+before insert or update on public\.booking_requests\s+for each row execute function public\.booking_requests_clash_marker_scope\(\);/,
    );
  });

  it("the trigger function is SECURITY INVOKER and forces false off the accept", () => {
    const fn = UPC.slice(
      UPC.indexOf("create or replace function public.booking_requests_clash_marker_scope()"),
      UPC.indexOf("$function$;", UPC.indexOf("create or replace function public.booking_requests_clash_marker_scope()")),
    );
    expect(fn).not.toMatch(/security definer/i);
    expect(fn).toMatch(/if tg_op = 'INSERT' then\s+new\.clash_acknowledged := false;/);
    expect(fn).toMatch(/elsif new\.status is distinct from 'accepted' then\s+new\.clash_acknowledged := false;/);
    expect(fn).toMatch(/new\.start_date is distinct from old\.start_date/);
    expect(fn).toMatch(/new\.expected_end_date is distinct from old\.expected_end_date/);
    expect(fn).toMatch(/new\.worker_id is distinct from old\.worker_id/);
    expect(fn).toMatch(/new\.clash_acknowledged := old\.clash_acknowledged;/);
  });
});

describe("the rollback restores the original, and refuses rather than rewrite", () => {
  it("guards on overlapping accepted pairs before changing anything", () => {
    const guard = DOWNC.indexOf("rollback refused");
    const firstDdl = DOWNC.indexOf("drop constraint if exists booking_requests_no_overlapping_accepted");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstDdl);
    expect(DOWNC).toMatch(/begin;[\s\S]*commit;/);
  });

  it("restores the ORIGINAL predicate", () => {
    expect(DOWNC).toMatch(/where \(status = 'accepted' and start_date is not null\);/);
    expect(DOWNC).not.toMatch(/not clash_acknowledged/);
  });

  it("restores v4 without the marker, with its grants", () => {
    const v4 = DOWNC.slice(DOWNC.indexOf("create or replace function public.respond_booking_request_v4("));
    expect(v4).toMatch(/set status = p_decision, updated_at = now\(\)/);
    expect(DOWNC).toMatch(/grant execute on function public\.respond_booking_request_v4\(uuid, text, text, text, boolean\) to authenticated;/);
  });

  it("removes the trigger, its function and the column — and no booking row", () => {
    expect(DOWNC).toMatch(/drop trigger if exists booking_requests_clash_marker_scope on public\.booking_requests;/);
    expect(DOWNC).toMatch(/drop function if exists public\.booking_requests_clash_marker_scope\(\);/);
    expect(DOWNC).toMatch(/drop column if exists clash_acknowledged;/);
    const outside = DOWNC.replace(/\$function\$[\s\S]*?\$function\$/g, "").replace(/\$guard\$[\s\S]*?\$guard\$/g, "");
    expect(outside).not.toMatch(/\b(update|delete from)\s+public\./i);
  });
});
