import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * RED-1 (J-13): an ACCEPTED service request can become an offer in the ONE
 * existing proposal/contract system (register 6.6) — never a second contract
 * system. Pins the shape of 20261102154500 and its rollback.
 */
const ROOT = resolve(__dirname, "..", "..", "..", "..");
const NAME = "20261102154500_service_request_proposal_link_v1";
const sqlOnly = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const up = sqlOnly(readFileSync(resolve(ROOT, `supabase/migrations/${NAME}.sql`), "utf8"));
const down = sqlOnly(readFileSync(resolve(ROOT, `supabase/rollbacks/${NAME}.down.sql`), "utf8"));
const fn = up.slice(up.indexOf("create or replace function public.create_proposal_from_service_request_v1("));

describe("service request → proposal link (RED-1)", () => {
  it("adds one nullable link on the EXISTING proposals table and creates no new table", () => {
    expect(up).toMatch(
      /alter table public\.proposals\s+add column if not exists service_offering_request_id uuid\s+references public\.service_offering_requests\(id\) on delete set null;/,
    );
    expect(up).not.toMatch(/create table/i);
    expect(up).not.toMatch(/alter table public\.contracts/);
    expect(up).not.toMatch(/uuid not null|set not null/i);
  });

  it("changes no existing policy, function or row", () => {
    expect(up).not.toMatch(/\b(create|alter|drop) policy\b/i);
    expect(up).not.toMatch(/\bupdate public\.|\bdelete from\b/i);
    expect(up).not.toMatch(/function public\.(create_proposal_v1|set_proposal_status_v1|create_contract_v1|respond_service_offering_request)\(/);
  });

  it("lets only the request's provider, on an accepted request, write a DRAFT proposal it owns", () => {
    expect(fn).toMatch(/v_uid\s+uuid := auth\.uid\(\);/);
    expect(fn).toMatch(/if v_provider is null or v_provider <> v_uid then/);
    expect(fn).toMatch(/if v_status <> 'accepted' then/);
    expect(fn).toMatch(/insert into public\.proposals \(owner_id, service_offering_request_id, title,/);
    expect(fn).toMatch(/values \(v_uid, p_request_id,/);
    // Status is the column default ('draft'): nothing is sent from here.
    expect(fn).not.toMatch(/'sent'\s*\)|status\s*=\s*'sent'|sent_at/);
    expect(fn).toMatch(/set search_path = public, pg_temp/);
  });

  it("locks the request row so two concurrent calls cannot both insert", () => {
    // `for share` let two callers pass the open-proposal check together (PG16
    // proof: scripts/db-proof/service-request-proposal-link-v1.sh, 2 rows).
    expect(fn).toMatch(/from public\.service_offering_requests\s+where id = p_request_id\s+for update;/);
    expect(fn).not.toMatch(/for share/);
    expect(existsSync(resolve(ROOT, "scripts/db-proof/service-request-proposal-link-v1.sh"))).toBe(true);
  });

  it("returns the open proposal instead of a duplicate", () => {
    expect(fn).toMatch(/where service_offering_request_id = p_request_id\s+and owner_id = v_uid\s+and status in \('draft','sent','accepted'\)/);
  });

  it("is callable by signed-in users only", () => {
    expect(up).toMatch(/revoke all on function public\.create_proposal_from_service_request_v1\(uuid, text, bigint, text, text, date\)\s+from public, anon;/);
    expect(up).toMatch(/grant execute on function public\.create_proposal_from_service_request_v1\(uuid, text, bigint, text, text, date\)\s+to authenticated;/);
  });

  it("rolls back without erasing a linked offer", () => {
    expect(down).toMatch(/drop function if exists public\.create_proposal_from_service_request_v1\(uuid, text, bigint, text, text, date\);/);
    expect(down).toMatch(/select exists \(select 1 from public\.proposals where service_offering_request_id is not null\)/);
    expect(down).toMatch(/if v_linked then\s+raise exception/);
    // Re-runnable: the linked-row check only runs while the column exists.
    expect(down).toMatch(/information_schema\.columns[\s\S]+column_name = 'service_offering_request_id'/);
    expect(down.indexOf("raise exception")).toBeLessThan(down.indexOf("drop column"));
  });
});
