import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isSyntheticFixtureLabel } from "@/lib/qa/synthetic-fixture";

// Pins 20261028123000_synthetic_demand_cross_org_readers_v1 (RED, owner-approved
// 2026-10-28 and applied through Supabase MCP): the three cross-organization SQL
// demand readers keep OTHER organizations' synthetic QA needs out, with the
// SAME markers as lib/qa/synthetic-fixture.ts, and change nothing else.
const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const NAME = "20261028123000_synthetic_demand_cross_org_readers_v1";
const up = read(`supabase/migrations/${NAME}.sql`);
const down = read(`supabase/rollbacks/${NAME}.down.sql`);
const tsSource = read("apps/web/lib/qa/synthetic-fixture.ts");
const agencySource = read("supabase/migrations/20261003150000_org2_agency_capability_authority_v1.sql");
const oneRuleSource = read("supabase/migrations/20261020010000_demand_company_one_rule_v1.sql");

const READERS = [
  "list_open_demand_for_agencies",
  "list_open_demand_for_workers",
  "list_open_demand_for_team_offer_v1",
] as const;

/** The whole `create or replace function public.<name>(` … `$<tag>$;` block. */
function fnBlock(sql: string, name: string): string {
  const re = new RegExp(`create or replace function public\\.${name}\\(`, "i");
  const m = re.exec(sql);
  if (!m) throw new Error(`no definition of ${name}`);
  const start = sql.lastIndexOf("\n", m.index) + 1;
  const tag = /\n\s*as (\$[a-z]*\$)/i.exec(sql.slice(m.index))![1];
  const bodyOpen = sql.indexOf(tag, m.index) + tag.length;
  const end = sql.indexOf(`${tag};`, bodyOpen) + tag.length + 1;
  return sql.slice(start, end);
}

const PREDICATE = [
  "     and (v_sees_fixtures",
  "          or not public.demand_is_synthetic_fixture_v1(cr.organization_id, cr.profile_id)",
  "          or cr.profile_id = uid",
  "          or coalesce(public.has_org_demand_access(cr.organization_id), false))",
].join("\n");

/** Remove exactly what this migration adds, to compare with the prior body. */
function withoutAdditions(block: string): string {
  const lines = block.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l === "  v_sees_fixtures boolean;") continue;
    if (/^\s*-- SYNTHETIC QA FIXTURES \(20261028123000\)/.test(l)) {
      // the 3-line comment + the 4-line predicate
      i += 2 + 4;
      continue;
    }
    if (/^\s*-- A synthetic (viewer|QA identity)/.test(l)) {
      while (!/^\s*v_sees_fixtures := /.test(lines[i])) i++;
      while (!lines[i].trimEnd().endsWith(";")) i++;
      continue;
    }
    out.push(l);
  }
  return out.join("\n");
}

describe("synthetic QA needs stay out of the cross-organization SQL readers", () => {
  it("one marker helper mirrors MARKERS of synthetic-fixture.ts exactly", () => {
    const block = tsSource.slice(tsSource.indexOf("const MARKERS"), tsSource.indexOf("];", tsSource.indexOf("const MARKERS")));
    const tsMarkers = [...block.matchAll(/^\s*\/(.+)\/i,\s*$/gm)].map((m) => m[1]);
    expect(tsMarkers).toHaveLength(3);
    const helper = fnBlock(up, "is_synthetic_fixture_label_v1");
    const sqlMarkers = [...helper.matchAll(/v ~\* '([^']+)'/g)].map((m) => m[1]);
    // JS `\b` (word boundary) is `\y` in PostgreSQL's ARE; `~*` is the `/i`.
    expect(sqlMarkers).toEqual(tsMarkers.map((s) => s.replace(/\\b/g, "\\y")));
    expect(helper).toMatch(/\bimmutable\b/i);
    expect(helper).toContain("variadic p_values text[]");
  });

  it("the documented fixture names are fixtures; a real name with 'test' is not", () => {
    // TS side of the mirror; the PG16 proof in the PR runs the same strings in SQL.
    expect(isSyntheticFixtureLabel("QA-SYNTHETIC Gama (testinis subjektas)")).toBe(true);
    expect(isSyntheticFixtureLabel("[E2E] agency")).toBe(true);
    expect(isSyntheticFixtureLabel("E2E_FIXTURE co")).toBe(true);
    expect(isSyntheticFixtureLabel("Testas UAB", "QASYNTHETIC")).toBe(false);
  });

  it("the viewer helper trusts only the server-set flag, never the self-chosen email", () => {
    const viewer = fnBlock(up, "is_synthetic_viewer_v1");
    expect(tsSource).toContain("meta?.qa_synthetic === true");
    expect(viewer).toContain("(auth.jwt() -> 'app_metadata' -> 'qa_synthetic') = 'true'::jsonb");
    expect(viewer).not.toMatch(/email/i);
  });

  it("the demand helper reads the need's OWN organization and its one company", () => {
    const d = fnBlock(up, "demand_is_synthetic_fixture_v1");
    expect(d).toContain("public.is_synthetic_fixture_label_v1(o.display_name, o.legal_name)");
    expect(d).toContain("where o.id = p_organization_id");
    expect(d).toContain("c.id = public.demand_company_id_v1(p_organization_id, p_profile_id)");
  });

  it("no helper is an API door", () => {
    for (const sig of [
      "is_synthetic_fixture_label_v1(text[])",
      "demand_is_synthetic_fixture_v1(uuid, uuid)",
      "is_synthetic_viewer_v1()",
    ]) {
      expect(up).toContain(`revoke all on function public.${sig} from public, anon, authenticated;`);
      expect(up.toLowerCase()).not.toContain(`grant execute on function public.${sig}`);
    }
  });

  it.each(READERS)("%s carries the ONE predicate exactly once, with owner rows kept", (name) => {
    const block = fnBlock(up, name);
    expect(block.split(PREDICATE).length - 1).toBe(1);
    expect(block).toMatch(/v_sees_fixtures := public\.is_synthetic_viewer_v1\(\)/);
    expect(block).toMatch(/\bSECURITY DEFINER\b/i);
    expect(up).toContain(`revoke all on function public.${name}(`);
    expect(up).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated;`));
  });

  it("agency and team readers let an acting organization that is itself a fixture see fixtures (QA walks)", () => {
    const ag = fnBlock(up, "list_open_demand_for_agencies");
    expect(ag).toContain("where c.id = v_company");
    expect(ag).toContain("where o.legacy_company_id = v_company");
    const to = fnBlock(up, "list_open_demand_for_team_offer_v1");
    expect(to).toContain("where o.id = p_team_org_id\n                  and public.is_synthetic_fixture_label_v1(o.display_name, o.legal_name)");
  });

  it("everything else in each body is the latest repo definition, byte for byte", () => {
    const prior: Record<(typeof READERS)[number], string> = {
      list_open_demand_for_agencies: fnBlock(agencySource, "list_open_demand_for_agencies"),
      list_open_demand_for_workers: fnBlock(oneRuleSource, "list_open_demand_for_workers"),
      list_open_demand_for_team_offer_v1: fnBlock(oneRuleSource, "list_open_demand_for_team_offer_v1"),
    };
    for (const name of READERS) {
      expect(withoutAdditions(fnBlock(up, name))).toBe(prior[name]);
      // and the rollback restores exactly that prior body
      expect(fnBlock(down, name)).toBe(prior[name]);
    }
  });

  it("the rollback drops the three helpers and restores the grants", () => {
    expect(down).toContain("drop function if exists public.demand_is_synthetic_fixture_v1(uuid, uuid);");
    expect(down).toContain("drop function if exists public.is_synthetic_viewer_v1();");
    expect(down).toContain("drop function if exists public.is_synthetic_fixture_label_v1(text[]);");
    for (const name of READERS) {
      expect(down).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated;`));
      expect(fnBlock(down, name)).not.toContain("synthetic");
    }
  });

  it("carries the owner's approval for this migration only, and writes no row", () => {
    expect(up).toMatch(/^-- @human-gate-approved \(owner, 2026-10-28, .*#2876.*covers this migration only\)$/m);
    expect(up).not.toMatch(/^\s*(update|delete|insert)\b/im);
  });
});
