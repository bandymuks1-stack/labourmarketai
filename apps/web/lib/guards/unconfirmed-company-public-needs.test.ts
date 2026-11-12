import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * OWNER DECISION V-1 (2026-11-12) — needs of unconfirmed companies are shown,
 * labelled "Company not confirmed", when the ONE database rule admits them.
 *
 * What this guard keeps true:
 *   1. the eligibility rule exists ONCE (need_public_state_v1) and every read
 *      path calls it — the worker board no longer carries its own verified-only
 *      join, the public reader does not invent a second rule;
 *   2. the public reader returns exactly nine non-contact columns and is the
 *      only new anon door (and it is in the anon allowlist);
 *   3. the app never re-implements the rule (no state is computed in TS);
 *   4. every catalog carries "Company not confirmed", and no surface puts the
 *      verified badge on an unconfirmed route (SEP-3 EVIDENCE != VERIFICATION).
 */
const WEB = resolve(__dirname, "..", "..");
const ROOT = resolve(WEB, "..", "..");
const NAME = "20261112100000_unconfirmed_company_public_needs_v1";
const sqlOnly = (s: string) =>
  s
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
const up = sqlOnly(readFileSync(resolve(ROOT, `supabase/migrations/${NAME}.sql`), "utf8"));
const downPath = resolve(ROOT, `supabase/rollbacks/${NAME}.down.sql`);

function fnBody(name: string): string {
  const start = up.search(new RegExp(`create or replace function public\\.${name}\\(`, "i"));
  expect(start, `${name} is defined`).toBeGreaterThanOrEqual(0);
  const end = up.indexOf("$function$;", start);
  return up.slice(start, end);
}

describe("V-1: one eligibility rule in the database", () => {
  it("defines need_public_state_v1 once, internal only", () => {
    expect(up.match(/create or replace function public\.need_public_state_v1\(/gi)?.length).toBe(1);
    expect(up).toMatch(
      /revoke all on function public\.need_public_state_v1\(uuid\) from public, anon, authenticated, service_role;/,
    );
  });

  it("every reader goes through the rule", () => {
    for (const fn of [
      "list_open_demand_for_workers",
      "list_public_company_needs_v1",
      "get_my_need_public_states_v1",
      "list_need_public_review_queue_v1",
      "decide_need_public_review_v1",
    ]) {
      expect(fnBody(fn), fn).toMatch(/need_public_state_v1\(/);
    }
  });

  it("no reader keeps its own verified-only gate", () => {
    for (const fn of ["list_open_demand_for_workers", "list_public_company_needs_v1"]) {
      expect(fnBody(fn), fn).not.toMatch(/verification_status\s*=\s*'verified'/);
    }
    // The worker board keeps verified needs exactly as before, plus admitted unconfirmed ones.
    expect(fnBody("list_open_demand_for_workers")).toMatch(/st\.state in \('verified', 'unconfirmed_public'\)/);
  });

  it("principle C (7): the signed-out reader never returns a verified company's need", () => {
    const body = fnBody("list_public_company_needs_v1");
    expect(body).toMatch(/and st\.state = 'unconfirmed_public'/);
    expect(body).not.toMatch(/'verified'/);
    expect(body).toMatch(/false as company_confirmed/);
  });

  it("principle C (1): nothing is public without the company's explicit per-need choice", () => {
    const rule = fnBody("need_public_state_v1");
    // The choice is checked before every other outcome, operator approval included.
    expect(rule).toMatch(/case\s+when not v_published then 'not_published'\s+when v_decision = 'approved'/);
    expect(rule).toMatch(/from public\.customer_request_publications p\s+where p\.request_id = r\.id\s+order by p\.created_at desc, p\.id desc/);
    expect(rule).toMatch(/v_published := coalesce\([\s\S]*?false\);/);
    // The choice table: append-only, sealed, written only by the door.
    expect(up).toMatch(/alter table public\.customer_request_publications enable row level security;/);
    expect(up).toMatch(/revoke all on public\.customer_request_publications from public, anon, authenticated, service_role;/);
    // No backfill: the migration never inserts a publication.
    const writes = up.match(/insert into public\.customer_request_publications/g) ?? [];
    expect(writes.length, "only the door writes a choice").toBe(1);
    expect(fnBody("set_need_public_publication_v1")).toMatch(/insert into public\.customer_request_publications/);
  });

  it("principle C: only the poster or an org member with demand authority may choose", () => {
    const door = fnBody("set_need_public_publication_v1");
    expect(door).toMatch(/if not coalesce\(\(r\.profile_id = uid or public\.has_org_demand_access\(r\.organization_id\)\), false\) then/);
    expect(door).not.toMatch(/is_admin\(\)/);
    expect(up).toMatch(/grant execute on function public\.set_need_public_publication_v1\(uuid, boolean\) to authenticated;/);
  });

  it("every reason the SQL can give is in the app's closed list", async () => {
    const { NEED_PUBLIC_REASONS } = await import("@/lib/opportunities/public-company-needs-model");
    const body = fnBody("need_public_state_v1") + fnBody("need_public_text_flags_v1");
    const codes = new Set([...body.matchAll(/'([a-z_]+)'::text|then '([a-z_]+)' end/g)].map((m) => m[1] ?? m[2]));
    for (const c of ["verified", "not_listed", "not_published", "unconfirmed_public", "rejected", "held_incomplete", "held_review", "pitch"]) codes.delete(c);
    codes.add("pitch");
    expect([...codes].sort()).toEqual([...NEED_PUBLIC_REASONS].sort());
  });

  it("a verified company is not re-screened (nothing visible today disappears)", () => {
    expect(fnBody("need_public_state_v1")).toMatch(
      /if c\.verification_status = 'verified' then\s+return query select 'verified'/,
    );
  });

  it("the worker board keeps its signature (the interest policy is untouched)", () => {
    expect(up).not.toMatch(/drop function[^;]*list_open_demand_for_workers/i);
    expect(up).not.toMatch(/drop policy/i);
    expect(fnBody("list_open_demand_for_workers")).toMatch(
      /RETURNS TABLE\(id uuid, role_text text, country text, team_size integer, start_period text, accommodation text, created_at timestamp with time zone, company_name text, route_status text, location_label text, transport text, required_tools text\[\], structured jsonb, need_skill_slugs text\[\], need_skill_source text\)/,
    );
    expect(fnBody("list_open_demand_for_workers")).toMatch(/else 'unconfirmed_company' end/);
  });

  it("an operator decision binds to the content it judged", () => {
    expect(up).toMatch(/content_hash text not null check \(content_hash ~ '\^\[0-9a-f\]\{32\}\$'\)/);
    expect(fnBody("need_public_state_v1")).toMatch(/d\.content_hash = v_hash/);
    expect(fnBody("decide_need_public_review_v1")).toMatch(/if uid is null or not public\.is_admin\(\)/);
    expect(fnBody("list_need_public_review_queue_v1")).toMatch(/not public\.is_admin\(\)/);
  });

  it("the decision table is sealed: RLS on, no policy, no client grant", () => {
    expect(up).toMatch(/alter table public\.customer_request_public_reviews enable row level security;/);
    expect(up).toMatch(/revoke all on public\.customer_request_public_reviews from public, anon, authenticated, service_role;/);
    expect(up).not.toMatch(/create policy/i);
    expect(up).not.toMatch(/grant [^;]* on (table )?public\.customer_request_public_reviews/i);
  });
});

describe("V-1: the public reader", () => {
  it("returns exactly nine non-contact columns", () => {
    const sig = fnBody("list_public_company_needs_v1").match(/returns table\(([\s\S]*?)\)\s*language/i)?.[1] ?? "";
    const cols = sig
      .split(",")
      .map((c) => c.trim().split(/\s+/)[0])
      .filter(Boolean);
    expect(cols).toEqual([
      "id",
      "role_text",
      "country",
      "location_label",
      "team_size",
      "start_period",
      "created_at",
      "company_name",
      "company_confirmed",
    ]);
    expect(fnBody("list_public_company_needs_v1")).not.toMatch(
      /contact_email|contact_phone|need_summary|cr\.notes|cr\.title|cr\.payload|registration_code|website|address|profile_id\s+as/,
    );
  });

  it("always drops synthetic QA fixtures and is the only anon grant", () => {
    expect(fnBody("list_public_company_needs_v1")).toMatch(/and not public\.demand_is_synthetic_fixture_v1/);
    const anonGrants = up.match(/grant execute on function [^;]* to [^;]*\banon\b[^;]*;/gi) ?? [];
    expect(anonGrants).toEqual([
      "grant execute on function public.list_public_company_needs_v1(p_query text, p_country text) to anon, authenticated;",
    ]);
  });

  it("is on the reviewed anon allowlist with its exact signature", async () => {
    const { ANON_SECDEF_ALLOWED_SIGNATURES } = await import("@/lib/security/anon-secdef-allowlist");
    expect(ANON_SECDEF_ALLOWED_SIGNATURES.has("list_public_company_needs_v1(p_query text, p_country text)")).toBe(true);
  });
});

describe("V-1: rollback", () => {
  it("ships a rollback that restores the verified-only board and keeps decisions", () => {
    expect(existsSync(downPath)).toBe(true);
    const down = sqlOnly(readFileSync(downPath, "utf8"));
    expect(down).toMatch(/and c\.verification_status = 'verified'/);
    expect(down).toMatch(/if not exists \(select 1 from public\.customer_request_public_reviews\) then[\s\S]*?drop table public\.customer_request_public_reviews;/);
    expect(down).toMatch(/revoke execute on function public\.list_public_company_needs_v1\(text, text\) from public, anon, authenticated;/);
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("V-1: the app reads the rule, never re-implements it", () => {
  const sources = [...walk(join(WEB, "lib")), ...walk(join(WEB, "app")), ...walk(join(WEB, "components"))];

  it("no app code computes an eligibility state", () => {
    const offenders = sources.filter((f) => {
      const s = readFileSync(f, "utf8");
      return /["']held_review["']\s*:/.test(s) === false && /state\s*=\s*["'](held_review|held_incomplete|unconfirmed_public)["']/.test(s);
    });
    expect(offenders).toEqual([]);
  });

  it("the verified badge is keyed on the verified route only", () => {
    const page = readFileSync(join(WEB, "app/[locale]/dashboard/opportunities/page.tsx"), "utf8");
    expect(page).toMatch(/need\.routeStatus === "approved_direct_partner" \?/);
    expect(page).toMatch(/need\.routeStatus === UNCONFIRMED_COMPANY_ROUTE_STATUS \?/);
    const ctx = readFileSync(join(WEB, "lib/world-state/job-context-server.ts"), "utf8");
    expect(ctx).toMatch(/model\.verifiedRoute\s*\?\s*\(t\("companyVerified"\)/);
  });
});

describe("V-1: copy in every catalog", () => {
  const catalogs = readdirSync(join(WEB, "messages")).filter((f) => f.endsWith(".json"));

  it("covers the eleven catalogs", () => {
    expect(catalogs.length).toBe(11);
  });

  it.each(catalogs)("%s carries the label, the public section and the readback states", (file) => {
    const d = JSON.parse(readFileSync(join(WEB, "messages", file), "utf8"));
    const label = d.opportunities?.companyNotConfirmed;
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(3);
    for (const k of ["title", "intro", "people", "respond", "openBoard", "roleUnknown"]) {
      expect(typeof d.publicCompanyNeeds?.[k], k).toBe("string");
    }
    expect(d.publicCompanyNeeds.intro).toContain(label);
    for (const k of ["not_published", "unconfirmed_public", "held_incomplete", "held_review", "rejected"]) {
      expect(typeof d.demandReadback?.publicState?.[k], k).toBe("string");
    }
    for (const k of ["publish", "withdraw", "explain", "failed", "saving"]) {
      expect(typeof d.demandReadback?.publication?.[k], `publication.${k}`).toBe("string");
    }
    expect(Object.keys(d.demandReadback.publicReason).length).toBe(14);
  });

  it("Lithuanian says exactly what the owner wrote", () => {
    const lt = JSON.parse(readFileSync(join(WEB, "messages", "lt.json"), "utf8"));
    expect(lt.opportunities.companyNotConfirmed).toBe("Įmonė nepatvirtinta");
    expect(lt.demandReadback.publication.publish).toBe("Skelbti viešai");
  });
});
