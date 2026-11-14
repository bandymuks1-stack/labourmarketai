import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A CLOSED NEED REFUSES A NEW PROPOSAL OR A FIRST ACCEPT
 * (20261114100000_booking_refuses_closed_need_v1).
 *
 * The behaviour itself is proven against a real database in the isolated CI
 * job (supabase/tests/20261114100000_booking_refuses_closed_need_*): the
 * single-session cases and two sessions racing a close against an accept.
 * This guard pins the shape those proofs depend on, so a later edit cannot
 * quietly drop the lock, the definer read, the named exception or the app's
 * meaning of the error.
 */
const web = process.cwd();
const repo = join(web, "..", "..");
const read = (p: string) => readFileSync(join(repo, p), "utf8");
const MIG = "supabase/migrations/20261114100000_booking_refuses_closed_need_v1.sql";
const DOWN = "supabase/rollbacks/20261114100000_booking_refuses_closed_need_v1.down.sql";

describe("the database refuses entering proposed / accepted on a closed need", () => {
  const sql = read(MIG);

  it("guards every writer: a BEFORE trigger on the booking row, insert and status change", () => {
    expect(sql).toMatch(
      /create trigger booking_requests_open_need_guard\s+before insert or update of status on public\.booking_requests\s+for each row/,
    );
  });

  it("reads the need under a lock, so a concurrent close is waited for", () => {
    expect(sql).toMatch(/from public\.customer_requests cr\s+where cr\.id = new\.request_id\s+for share;/);
  });

  it("reads as definer (the worker cannot read the need) with a fixed search path, and nobody can call it", () => {
    expect(sql).toMatch(/security definer\s+set search_path = public, pg_temp/);
    for (const role of ["public", "anon", "authenticated"]) {
      expect(sql).toContain(`revoke all on function public.booking_requests_open_need_guard() from ${role};`);
    }
  });

  it("uses the propose function's own word, so the app keeps one meaning", () => {
    expect(sql).toContain("raise exception 'demand_closed' using errcode = 'P0001';");
  });

  it("only entering proposed / accepted is checked; leaving them never is", () => {
    expect(sql).toMatch(/if new\.status not in \('proposed', 'accepted'\) then\s+return new;/);
  });

  it("the one named exception is an existing hire (already accepted), read from its own history", () => {
    expect(sql).toMatch(/old\.status = 'accepted'/);
    expect(sql).toMatch(/e\.booking_request_id = new\.id and e\.to_status = 'accepted'/);
  });

  it("ships a rollback and the database proofs, and CI runs both proofs", () => {
    expect(existsSync(join(repo, DOWN))).toBe(true);
    expect(read(DOWN)).toContain("drop trigger if exists booking_requests_open_need_guard on public.booking_requests;");
    const wf = read(".github/workflows/signup-isolated.yml");
    expect(wf).toContain("supabase/tests/20261114100000_booking_refuses_closed_need_regression.sql");
    expect(wf).toContain("bash supabase/tests/20261114100000_booking_refuses_closed_need_race.sh");
  });
});

describe("the app says it plainly instead of a generic error", () => {
  it("an accept refused for a closed need is its own result", () => {
    const actions = readFileSync(join(web, "lib/booking/booking-actions.ts"), "utf8");
    expect(actions).toMatch(/if \(\/\\bdemand_closed\\b\/\.test\(error\.message \?\? ""\)\) return \{ kind: "need-closed" \};/);
  });

  it("the worker's buttons show the reason, keep decline and offer no accept", () => {
    const ui = readFileSync(join(web, "components/app/booking-respond-buttons.tsx"), "utf8");
    const block = ui.slice(ui.indexOf('if (state.kind === "need-closed")'), ui.indexOf('if (state.kind === "conflict")'));
    expect(block).toContain('t("actions.needClosed")');
    expect(block).toContain("booking-need-closed-decline-open");
    expect(block).not.toContain('respond("accepted"');
  });

  it("the sentence exists in every catalog", () => {
    for (const l of ["en", "lt", "ru", "nl", "de", "pl", "sv", "da", "no", "et", "lv"]) {
      const m = JSON.parse(readFileSync(join(web, `messages/${l}.json`), "utf8")) as {
        bookings?: { actions?: { needClosed?: string } };
      };
      expect(m.bookings?.actions?.needClosed, l).toBeTruthy();
    }
  });
});
