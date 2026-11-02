import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * INTEREST AND BOOKING-PROPOSAL INTEGRITY (owner-approved fix programme
 * 2026-10-21). Three defects, three migrations:
 *   20261021095000 — the need's organization's demand managers see and answer
 *                    worker interest (a WIDENED read, stated in the file);
 *   20261021095100 — a worker writes only their own act on their own row;
 *   20261021095200 — a booking proposal reaches only a contactable worker, on
 *                    an open need, and never re-opens an answered proposal.
 */
const repo = resolve(__dirname, "..", "..", "..", "..");
const web = resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(resolve(repo, p), "utf8").replace(/\r\n/g, "\n");
const code = (s: string) => s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

const M1 = "20261021095000_demand_interest_org_managers_v1";
const M2 = "20261021095100_demand_interest_worker_writes_v1";
const M3 = "20261021095200_booking_propose_reachable_open_v1";
const up = (m: string) => code(read(`supabase/migrations/${m}.sql`));
const down = (m: string) => code(read(`supabase/rollbacks/${m}.down.sql`));

describe("1 — the need's organization's demand managers see and answer interest", () => {
  const sql = up(M1);
  it("the read policy admits the creator OR has_org_demand_access on the need's organization", () => {
    expect(sql).toMatch(/create policy demand_interest_signals_demand_owner_select/);
    expect(sql).toMatch(
      /cr\.profile_id = auth\.uid\(\)\s*or coalesce\(public\.has_org_demand_access\(cr\.organization_id\), false\)/,
    );
  });
  it("the acknowledgement uses the same two parties, fail-closed, and still writes only status + updated_at", () => {
    expect(sql).toMatch(
      /if not coalesce\(\(v_found and \(v_owner = uid\s*or public\.has_org_demand_access\(v_org\)\)\), false\) then/,
    );
    expect(sql).toMatch(/p_status not in \('reviewed','contacted'\)/);
    expect(sql).toMatch(/if v_cur = 'withdrawn' then/);
    const set = sql.slice(sql.indexOf("update public.demand_interest_signals"));
    expect(set.slice(0, set.indexOf("where"))).not.toMatch(/note|match_snapshot|worker_id|request_id\s*=/);
    expect(sql).toMatch(/set search_path to 'public'/);
    expect(sql).toMatch(/acknowledge_demand_interest\(uuid, uuid, text\) from anon/);
  });
  it("the rollback restores the creator-only policy and function", () => {
    const d = down(M1);
    expect(d).toMatch(/and cr\.profile_id = auth\.uid\(\)\n\s*\)/);
    expect(d).toMatch(/if v_owner is null or v_owner <> uid then/);
    expect(d).not.toMatch(/has_org_demand_access/);
  });
  it("the app's company reads follow the workspace rule and the manage-demand capability", () => {
    const src = readFileSync(resolve(web, "lib/opportunities/interest.ts"), "utf8");
    const one = src.slice(src.indexOf("export async function listDemandInterestForCompany"));
    expect(one).toMatch(/\.or\(demandsOfWorkspaceFilter\(user\.id, employer\.organizationId\)\)/);
    expect(one).toMatch(/hasOrganizationCapability\(employer\.role, "manage-demand"\)/);
    const counts = src.slice(src.indexOf("export async function listPendingInterestCountsForCompany"));
    expect(counts).toMatch(/\.in\("request_id", ids\)/);
  });
});

describe("2 — a worker writes only their own act on their own interest row", () => {
  const sql = up(M2);
  it("FOR ALL is gone; select / insert / update are separate", () => {
    expect(sql).toMatch(/drop policy if exists demand_interest_signals_worker_all/);
    expect(sql).not.toMatch(/for all/i);
    for (const p of ["worker_select", "worker_insert", "worker_update"]) {
      expect(sql).toMatch(new RegExp(`create policy demand_interest_signals_${p}`));
    }
  });
  it("an insert is the worker's own 'interested' on a need the board shows (or a public vacancy)", () => {
    const ins = sql.slice(sql.indexOf("create policy demand_interest_signals_worker_insert"));
    expect(ins).toMatch(/and status = 'interested'/);
    expect(ins).toMatch(/exists \(select 1 from public\.list_open_demand_for_workers\(\) b\s*where b\.id = demand_interest_signals\.request_id\)/);
    expect(ins).toMatch(/demand_interest_signals\.request_id is null\s*and demand_interest_signals\.public_vacancy_id is not null/);
  });
  it("the guard freezes the target and admits only withdrawn, or withdrawn → interested on the board", () => {
    expect(sql).toMatch(/if current_user not in \('authenticated', 'anon'\) then\s*return new;/);
    for (const col of ["id", "worker_id", "request_id", "public_vacancy_id", "created_at"]) {
      expect(sql).toMatch(new RegExp(`new\\.${col} is distinct from old\\.${col}`));
    }
    expect(sql).toMatch(/raise exception 'interest_target_immutable'/);
    expect(sql).toMatch(/if new\.status = 'interested' and old\.status = 'withdrawn' then/);
    expect(sql).toMatch(/raise exception 'interest_demand_not_visible'/);
    expect(sql).toMatch(/raise exception 'interest_status_not_worker_writable'/);
    // INVOKER rights: current_user must be the caller's role.
    const fn = sql.slice(sql.indexOf("create or replace function public.demand_interest_signals_worker_write_guard_v1"));
    expect(fn.slice(0, fn.indexOf("as $function$"))).not.toMatch(/security definer/i);
    expect(sql).toMatch(/before update on public\.demand_interest_signals/);
  });
  it("the rollback restores the FOR ALL policy verbatim and drops the guard", () => {
    const d = down(M2);
    expect(d).toMatch(/create policy demand_interest_signals_worker_all\s*on public\.demand_interest_signals for all/);
    expect(d).toMatch(/drop function if exists public\.demand_interest_signals_worker_write_guard_v1\(\)/);
  });
});

describe("3 — a booking proposal: contactable worker, open need, no re-open", () => {
  const sql = up(M3);
  it("the worker must be reachable (can_view_worker, or an open agency offer on this need), fail-closed", () => {
    expect(sql).toMatch(/if not coalesce\(\(\s*public\.can_view_worker\(p_worker_id\)/);
    expect(sql).toMatch(/o\.status in \('offered', 'accepted'\)\s*and public\.owns_company\(o\.client_company_id\)/);
    expect(sql).toMatch(/raise exception 'worker_not_reachable' using errcode = '42501'/);
    // reachability is checked before existence: no probe can tell hidden from absent
    expect(sql.indexOf("worker_not_reachable")).toBeLessThan(sql.indexOf("'Unknown worker'"));
  });
  it("the need must be open; a DECLINED proposal stays answered, a withdrawn one may be made again (owner 2026-10-21)", () => {
    expect(sql).toMatch(/if v_need_status is not distinct from 'closed' then\s*raise exception 'demand_closed'/);
    expect(sql).toMatch(/for update;/);
    expect(sql).toMatch(/if v_existing = 'declined' then\s*raise exception 'booking_not_reopenable'/);
    expect(sql).not.toMatch(/if v_existing in \('declined', 'withdrawn'\)/);
    expect(sql).toMatch(/case when public\.booking_requests\.status in \('expired', 'withdrawn'\)/);
    // the reach and open-need checks run BEFORE the upsert, so a proposal made
    // again after the company's own withdrawal meets them like a first one
    const upsert = sql.indexOf("on conflict (owner_id, request_id, worker_id)");
    expect(sql.indexOf("raise exception 'worker_not_reachable'")).toBeLessThan(upsert);
    expect(sql.indexOf("raise exception 'demand_closed'")).toBeLessThan(upsert);
    expect(sql).not.toMatch(/in \('withdrawn','declined','expired'\)/);
  });
  it("grants are restated: authenticated only", () => {
    expect(sql).toMatch(/revoke all on function public\.propose_booking_request\(uuid, uuid, text, text, text, text, text\) from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.propose_booking_request\(uuid, uuid, text, text, text, text, text\) to authenticated;/);
  });
  it("the rollback restores the 20260928140000 body", () => {
    const d = down(M3);
    expect(d).toMatch(/in \('withdrawn','declined','expired'\)/);
    expect(d).not.toMatch(/worker_not_reachable|demand_closed|booking_not_reopenable/);
  });
  it("the action maps each refusal word to its own honest state, in every catalogue", () => {
    const actions = readFileSync(resolve(web, "lib/booking/booking-actions.ts"), "utf8");
    for (const w of ["worker_not_reachable", "demand_closed", "booking_not_reopenable"]) expect(actions).toContain(w);
    const btn = readFileSync(resolve(web, "components/app/propose-booking-button.tsx"), "utf8");
    for (const k of ["refusedNotReachable", "refusedNeedClosed", "refusedAnswered"]) {
      expect(btn).toContain(`tPropose("${k}")`);
      for (const loc of ["lt", "en", "de", "nl", "pl", "ru", "lv", "et", "da", "no", "sv"]) {
        const m = JSON.parse(readFileSync(resolve(web, `messages/${loc}.json`), "utf8"));
        expect(typeof m.bookings.propose[k], `${loc} ${k}`).toBe("string");
      }
    }
  });
});

describe("review of #2606 — budget in the function, interest acts bound to the active workspace", () => {
  it("the proposal budget is enforced in the function, the day counted from proposal events", () => {
    const sql = up(M3);
    expect(sql).toMatch(/b\.status = 'proposed'\) >= 10 then\s*raise exception 'Booking proposal limit reached \(open\)' using errcode = 'P0001'/);
    expect(sql).toMatch(/ev\.event_type = 'proposed'\s*and ev\.created_at > now\(\) - interval '24 hours'\) >= 30 then\s*raise exception 'Booking proposal limit reached \(day\)' using errcode = 'P0001'/);
    // both checks run before the upsert
    const upsert = sql.indexOf("on conflict (owner_id, request_id, worker_id)");
    expect(sql.indexOf("limit reached (day)")).toBeLessThan(upsert);
    // the app reads the limit message as rate-limited
    const actions = readFileSync(resolve(web, "lib/booking/booking-actions.ts"), "utf8");
    expect(actions).toMatch(/error\.code === "P0004"/);
  });
  it("acknowledging and contacting go through the ONE active-workspace rule", () => {
    const interest = readFileSync(resolve(web, "lib/opportunities/interest.ts"), "utf8");
    expect(interest).toMatch(/export async function actingDemandForInterest\(/);
    expect(interest).toMatch(/employer\.organizationId !== row\.organization_id/);
    const ack = interest.slice(interest.indexOf("export async function acknowledgeInterest("));
    expect(ack.indexOf("actingDemandForInterest(")).toBeGreaterThan(-1);
    expect(ack.indexOf("actingDemandForInterest(")).toBeLessThan(ack.indexOf('rpc("acknowledge_demand_interest"'));
    const contact = readFileSync(resolve(web, "lib/communication/contact-interested-worker.ts"), "utf8");
    expect(contact).toMatch(/actingDemandForInterest\(supabase, user\.id, requestId\)/);
    expect(contact).not.toMatch(/\.eq\("profile_id", user\.id\)/);
  });
});
