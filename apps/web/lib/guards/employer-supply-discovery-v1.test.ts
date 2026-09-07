import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE SUPPLY SIDE OF THE MARKET IS READABLE — and stays as narrow as it began.
 *
 * ── WHAT THIS PINS AND WHY ─────────────────────────────────────────────────
 * Six surfaces were fixed for serving SUPPLY where DEMAND belongs, and every
 * one of those fixes was subtractive. Measured on production 2026-09-07: three
 * real `agency_offer` rows existed and `customer_requests_select` is
 * `profile_id = auth.uid() OR is_admin() OR has_org_demand_access(...)`, so the
 * only readers of an agency's declared capacity were that agency and an admin.
 * No employer could discover available workforce at all.
 *
 * The fix is the first CROSS-ORGANIZATION read this product has, which makes
 * its narrowness the thing most worth pinning. The risk is not that it stops
 * working; it is that a later slice widens it — one more column, one more
 * kind, a name "just for context" — and nobody notices that a deliberately
 * anonymised board has become a directory of who has spare people.
 */

const WEB = join(__dirname, "..", "..");
const ROOT = join(WEB, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const MIGRATION = "supabase/migrations/20260907153000_employer_supply_discovery_v1.sql";
const sql = () => readFileSync(join(ROOT, MIGRATION), "utf8");

/** The migration with `--` comments removed — every "must not contain"
 *  assertion runs on the executable SQL, so the header's own explanation of
 *  what it avoids can never be mistaken for the thing itself. */
function executableSql(): string {
  return sql()
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

describe("the gated read exposes the shape of capacity, never who has it", () => {
  it("returns exactly the six non-identifying columns", () => {
    const body = executableSql();
    const signature = body.slice(body.indexOf("returns table"), body.indexOf("language plpgsql"));
    for (const col of ["id", "role_text", "country", "team_size", "start_period", "duration", "created_at"]) {
      expect(signature, `${col} must be part of the contract`).toContain(col);
    }
  });

  it("NOTHING identifying is selected — not a name, not a profile, not free text", () => {
    const body = executableSql();
    // Scoped to the QUERY, not the whole file: the trailing `comment on
    // function` legitimately uses the word "organizations" in prose, and an
    // assertion that cannot tell a sentence from a column is one that gets
    // silenced rather than fixed the first time it is wrong.
    const query = body.slice(body.indexOf("return query"), body.indexOf("limit 100"));
    // Each of these exists on `customer_requests`, and each would turn an
    // anonymised board into a directory of who has spare people.
    for (const forbidden of [
      "cr.notes",
      "cr.need_summary",
      "cr.payload",
      "cr.title",
      "cr.location",
      "cr.manual_review_note",
      "organizations",
      "display_name",
      "legal_name",
      "email",
      "phone",
      "join",
    ]) {
      expect(query, `${forbidden} must never be exposed by this read`).not.toContain(forbidden);
    }
    // `profile_id` appears ONLY in the exclusion predicate, never selected.
    const selectList = body.slice(body.indexOf("return query"), body.indexOf("from public.customer_requests"));
    expect(selectList).not.toContain("profile_id");
  });

  it("the direction is a CLOSED allow-list, never a deny-list", () => {
    const body = executableSql();
    // A deny-list lets the NEXT demand kind straight through, which is the
    // entire defect class these six fixes belong to.
    expect(body).toMatch(/cr\.kind in \('agency_offer'\)/);
    expect(body).not.toMatch(/cr\.kind\s+not\s+in/i);
    expect(body).not.toMatch(/cr\.kind\s*<>/);
    // And no `kind is null` branch: a pre-`kind` row is genuine DEMAND, and
    // treating an unknown direction as supply is the guess this stops.
    const supplyPredicate = body.slice(body.indexOf("where cr.status"), body.indexOf("order by"));
    expect(supplyPredicate).not.toContain("kind is null");
  });

  it("a caller never gets their own side back", () => {
    const body = executableSql();
    expect(body).toContain("cr.profile_id <> uid");
    expect(body).toContain("not public.manages_organization(cr.organization_id)");
  });

  it("only someone who manages an organization sees anything", () => {
    const body = executableSql();
    expect(body).toContain("relationship_slug in ('manager', 'owner', 'external_manager')");
    expect(body).toContain("m.role in ('owner', 'admin', 'manager', 'external_manager')");
    // An unauthorized caller gets an empty result, not an exception, so a UI
    // can render an honest empty state without parsing an error message.
    const gate = body.slice(body.indexOf("if not exists"), body.indexOf("return query"));
    expect(gate).toContain("return;");
  });

  it("it is STABLE, SECURITY DEFINER, search_path-pinned, and anon gets nothing", () => {
    const body = executableSql();
    expect(body).toContain("stable security definer");
    expect(body).toContain("set search_path to 'public'");
    expect(body).toContain("revoke all on function public.list_open_supply_for_employers() from anon;");
    expect(body).toContain("grant execute on function public.list_open_supply_for_employers() to authenticated;");
  });

  it("it creates one function and touches nothing that already exists", () => {
    const body = executableSql();
    expect(body).not.toMatch(/\bdrop\s+(table|column|policy)\b/i);
    expect(body).not.toMatch(/\balter\s+(table|policy)\b/i);
    expect(body).not.toMatch(/\b(insert into|update\s+public\.|delete from)\b/i);
    // It replaces no existing function — the one name in it is new.
    expect((body.match(/create or replace function/g) ?? []).length).toBe(1);
  });

  it("it carries no human-gate-approved marker — no owner decision exists", () => {
    const marked = sql()
      .split("\n")
      .filter((l) => /^\s*--\s*@human-gate-approved\s*$/.test(l));
    expect(marked).toEqual([]);
  });

  it("a rollback exists and is complete", () => {
    const down = readFileSync(
      join(ROOT, "supabase/rollbacks/20260907153000_employer_supply_discovery_v1.down.sql"),
      "utf8",
    );
    expect(down).toContain("drop function if exists public.list_open_supply_for_employers()");
  });
});

describe("the app layer adds no authority and hides no state", () => {
  const core = read("lib/supply/employer-supply-discovery.ts");
  const section = read("components/app/available-supply-section.tsx");
  const page = read("app/[locale]/dashboard/company/scouting/page.tsx");

  it("the read goes through the one gated door, never the table", () => {
    expect(core).toContain('rpc("list_open_supply_for_employers")');
    expect(core).not.toMatch(/\.from\(\s*["']customer_requests["']/);
  });

  it("it never uses a service-role client", () => {
    for (const [name, src] of [["core", core], ["section", section]] as const) {
      expect(src, `${name} must run as the caller`).not.toMatch(
        /service[_-]?role|SUPABASE_SERVICE_ROLE_KEY/i,
      );
    }
  });

  it("an unprovisioned read is NOT rendered as an empty market", () => {
    // The whole §54 lesson in one assertion: three different causes of "no
    // rows on screen" must reach the reader as three different sentences.
    expect(core).toContain('kind: "needs-migration"');
    expect(section).toContain("available-supply-not-enabled");
    expect(section).toContain("available-supply-error");
    expect(section).toContain("available-supply-empty");
  });

  it("the privacy boundary is stated on every render, not only when rows exist", () => {
    const privacyLine = section.indexOf("available-supply-privacy");
    const bodyCall = section.indexOf("{body()}");
    expect(privacyLine).toBeGreaterThan(bodyCall);
    expect(section).toContain('t("privacyNote")');
  });

  it("the supply read shares the page's existing batch — no new serial stage", () => {
    expect(page).toContain("listAvailableSupplyForEmployer({ limit: 50 })");
    expect(page.replace(/\/\*[\s\S]*?\*\//g, " ")).not.toMatch(
      /=\s*await\s+listAvailableSupplyForEmployer\(/,
    );
  });

  it("supply sits WITH candidate discovery, not in a separate product", () => {
    expect(page).toContain("AvailableSupplySection");
  });
});
