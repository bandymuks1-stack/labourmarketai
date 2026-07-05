import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PROFESSION_SKILLS } from "../taxonomy/profession-skills";

/**
 * EQUIPMENT / TOOLS LAYER guards (product-tree branch 16, train §8.6).
 *
 * Required tools are a CLOSED SLUG LIST over the EXISTING canonical skill
 * taxonomy on the REAL demand → RPC → worker-board pipeline (reality-map
 * 2026-07-05 §branch 16: tools previously existed only as free text in the
 * non-persisted marketing preview engine). These pins keep every hop in
 * lockstep:
 *
 *   - ONE closed slug set — app-side whitelist (demand-request.ts), wizard
 *     chip options and the RPC projection whitelist must all agree EXACTLY,
 *     and every slug must ALREADY exist in the canonical taxonomy
 *     (lib/taxonomy/profession-skills.ts + skill-names catalogues). No new
 *     taxonomy, and no free text can reach the worker board through tools.
 *   - The RPC recreate stays a strict superset of the prior definition
 *     (Model A verified gate + location label + transport untouched) and
 *     remains human-gated with a rollback restoring the prior repo-latest
 *     definition (20260705200000) VERBATIM.
 *   - The wizard field is optional and honest (nothing selected → key null).
 *   - The app degrades honestly while the migration is not applied (loader
 *     tolerates the missing field; board shows the localized "not stated").
 */

const APP = join(process.cwd());
const REPO = join(APP, "..", "..");
const MIGRATION =
  "supabase/migrations/20260705210000_worker_demand_required_tools.sql";
const ROLLBACK =
  "supabase/rollbacks/20260705210000_worker_demand_required_tools.down.sql";
const PRIOR_MIGRATION =
  "supabase/migrations/20260705200000_worker_demand_transport.sql";

const EQUIPMENT_TOOL_SLUGS = [
  "bulldozer-operator",
  "compactor-operator",
  "crane-operator",
  "equipment-operation",
  "excavator-operator",
  "forklift-operator",
  "grader-operator",
  "hand-tools",
  "loader-operator",
  "scaffolding",
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

describe("required-tools migration — strict slug whitelist on the worker RPC", () => {
  const migration = read(MIGRATION);
  const code = stripSql(migration);

  it("projects payload->'required_tools' through the exact closed slug set", () => {
    const m = code.match(
      /jsonb_array_elements_text\(cr\.payload -> 'required_tools'\) as v\s*where v in \(([\s\S]*?)\)/i,
    );
    expect(m, "required_tools whitelist filter must exist").toBeTruthy();
    const values = [...(m as RegExpMatchArray)[1].matchAll(/'([a-z-]+)'/g)].map(
      (x) => x[1],
    );
    expect([...values].sort()).toEqual([...EQUIPMENT_TOOL_SLUGS].sort());
    // Non-array / absent key → NULL, never a raw payload value.
    expect(code).toMatch(
      /when jsonb_typeof\(cr\.payload -> 'required_tools'\) = 'array'/i,
    );
    expect(code).toMatch(/else null[\s\S]{0,40}end as required_tools/i);
  });

  it("every whitelisted slug is an EXISTING canonical taxonomy skill slug", () => {
    const taxonomySlugs = new Set(Object.values(PROFESSION_SKILLS).flat());
    for (const slug of EQUIPMENT_TOOL_SLUGS) {
      expect(taxonomySlugs.has(slug), `${slug} must exist in the taxonomy`).toBe(
        true,
      );
    }
  });

  it("stays a superset of the prior definition (Model A + location label + transport)", () => {
    expect(code).toMatch(
      /join public\.companies c[\s\S]{0,120}verification_status = 'verified'/i,
    );
    expect(code).toMatch(/'approved_direct_partner'::text as route_status/);
    expect(code).toMatch(/as location_label/);
    expect(code).toMatch(/from public\.workers w where w\.profile_id = uid/i);
    // Accommodation + transport whitelists unchanged (the path being extended).
    expect(code).toMatch(/when cr\.payload ->> 'accommodation' in \(/i);
    expect(code).toMatch(/when cr\.payload ->> 'transport' in \(/i);
  });

  it("projection stays curated — no free text, no ids beyond the need id", () => {
    for (const banned of [
      "need_summary",
      "notes",
      "payload ->> 'role'",
      "payload ->> 'location'",
      "payload ->> 'skills'",
      "customer_id",
    ]) {
      expect(code, `must not project ${banned}`).not.toContain(banned);
    }
    const returnsBlock = code.match(/returns table \(([\s\S]*?)\)/i)?.[1] ?? "";
    expect(returnsBlock.length).toBeGreaterThan(0);
    expect(returnsBlock).not.toMatch(/profile_id|company_id|customer/i);
  });

  it("adds NO table/column change — the slug list rides the existing payload", () => {
    expect(code).not.toMatch(/alter table/i);
    expect(code).not.toMatch(/add column/i);
    expect(code).not.toMatch(/create table/i);
  });

  it("grant surface unchanged and no policy statements", () => {
    expect(code).toMatch(/revoke all on function/i);
    expect(code).toMatch(
      /grant execute on function[\s\S]{0,120}to authenticated/i,
    );
    expect(code).not.toMatch(/to anon|to public\b/i);
    expect(code).not.toMatch(/create policy|alter policy|drop policy/i);
    expect(migration).toMatch(/security definer/i);
    expect(migration).toMatch(/set search_path = public/i);
  });

  it("is a human-gated DRAFT (owner-gated prod apply, never db push)", () => {
    expect(migration).toMatch(/--\s*@human-gate-approved/);
    expect(migration).toMatch(/needs-human-gate/);
    expect(migration).toMatch(/DO NOT APPLY automatically/i);
  });

  it("ships a rollback restoring the prior repo-latest definition VERBATIM", () => {
    expect(existsSync(join(REPO, ROLLBACK))).toBe(true);
    // Executable-SQL equality: the rollback's begin→commit block must equal
    // the 20260705200000 transport migration's begin→commit block exactly
    // (comments stripped, whitespace collapsed). NOT the older Model-A body —
    // the prior repo-latest definition includes location_label + transport.
    const execOf = (src: string) => {
      const n = stripSql(src).replace(/\s+/g, " ").trim();
      const start = n.indexOf("begin;");
      const end = n.lastIndexOf("commit;");
      expect(start, "begin; block must exist").toBeGreaterThanOrEqual(0);
      expect(end, "commit; must exist").toBeGreaterThan(start);
      return n.slice(start, end + "commit;".length);
    };
    expect(execOf(read(ROLLBACK))).toBe(execOf(read(PRIOR_MIGRATION)));
    // …and the restored definition carries NO required-tools artifacts
    // (executable SQL, comments stripped).
    const down = stripSql(read(ROLLBACK));
    expect(down).not.toMatch(/required_tools/i);
    expect(down).toMatch(/when cr\.payload ->> 'transport' in \(/i);
    expect(down).toMatch(/as location_label/);
    expect(down).toMatch(/'approved_direct_partner'::text as route_status/);
    expect(down).toMatch(/verification_status = 'verified'/);
    expect(down).toMatch(/revoke all on function/i);
    expect(down).toMatch(
      /grant execute on function[\s\S]{0,120}to authenticated/i,
    );
  });
});

describe("worker-demand RPC rollback chain — no stale-body restores (wagon-3 caveat closed)", () => {
  // Every rollback of a list_open_demand_for_workers() recreate must restore
  // its TRUE PREDECESSOR definition, never an older body. Column history:
  //   20260702170000 Model A · 20260705130000 +location_label ·
  //   20260705200000 +transport · 20260705210000 +required_tools.
  // So: any worker-demand rollback AFTER 20260705130000 must carry
  // location_label, and any AFTER 20260705200000 must also carry transport.
  // (Rollbacks at or before 20260705130000 legitimately restore older
  // bodies — their true predecessors predate location_label.)
  const rollbackDir = join(REPO, "supabase", "rollbacks");
  const workerDemandDowns = readdirSync(rollbackDir).filter(
    (f) => /worker_demand/.test(f) && f.endsWith(".down.sql"),
  );
  const ts = (f: string) => f.slice(0, 14);

  it("post-location-label rollbacks restore location_label; post-transport also transport", () => {
    expect(workerDemandDowns.length).toBeGreaterThan(0);
    for (const f of workerDemandDowns) {
      const down = stripSql(read(`supabase/rollbacks/${f}`));
      if (ts(f) > "20260705130000") {
        expect(down, `${f} must restore the location_label column`).toMatch(
          /location_label\s+text/i,
        );
        expect(down, `${f} must restore the cdl location subselect`).toMatch(
          /company_demand_locations cdl/i,
        );
      }
      if (ts(f) > "20260705200000") {
        expect(down, `${f} must restore the transport whitelist`).toMatch(
          /when cr\.payload ->> 'transport' in \(/i,
        );
      }
    }
  });

  it("the 20260705200000 down file restores the 20260705130000 body VERBATIM", () => {
    // Executable-SQL equality with its true predecessor (comments stripped,
    // whitespace collapsed) — the wagon-3 partial-rollback caveat stays closed.
    const execOf = (src: string) => {
      const n = stripSql(src).replace(/\s+/g, " ").trim();
      return n.slice(n.indexOf("begin;"), n.lastIndexOf("commit;") + "commit;".length);
    };
    expect(
      execOf(read("supabase/rollbacks/20260705200000_worker_demand_transport.down.sql")),
    ).toBe(
      execOf(read("supabase/migrations/20260705130000_worker_demand_location_label.sql")),
    );
  });

  it("this wagon's rollback pins the FULL expected projection column list", () => {
    const down = stripSql(read(ROLLBACK));
    const returnsBlock = down.match(/returns table \(([\s\S]*?)\)/i)?.[1] ?? "";
    const cols = [...returnsBlock.matchAll(/^\s*([a-z_]+)\s+/gim)].map((m) => m[1]);
    expect(cols).toEqual([
      "id",
      "role_text",
      "country",
      "team_size",
      "start_period",
      "accommodation",
      "created_at",
      "company_name",
      "route_status",
      "location_label",
      "transport",
    ]);
  });
});

describe("app-side closed set mirrors the RPC whitelist exactly", () => {
  const action = readWeb("lib/demand/demand-request.ts");

  it("demand-request.ts pins the same closed required-tools slug set", () => {
    const m = action.match(/REQUIRED_TOOL_SLUGS = new Set\(\[([\s\S]*?)\]\)/);
    expect(m, "REQUIRED_TOOL_SLUGS must exist").toBeTruthy();
    const values = [
      ...(m as RegExpMatchArray)[1].matchAll(/"([a-z-]+)"/g),
    ].map((x) => x[1]);
    expect([...values].sort()).toEqual([...EQUIPMENT_TOOL_SLUGS].sort());
  });

  it("the payload key is built ONLY from validated slugs (never raw input)", () => {
    // Every element passes the closed-set membership check…
    expect(action).toMatch(/REQUIRED_TOOL_SLUGS\.has\(s\)/);
    // …and the payload carries the derived list (empty → null, honest unknown),
    // never the raw client array and never clamped free text.
    expect(action).toMatch(
      /required_tools: requiredTools\.length > 0 \? requiredTools : null/,
    );
    expect(action).not.toMatch(/required_tools:\s*fields/);
    expect(action).not.toMatch(/required_tools:\s*clamp\(/);
  });
});

describe("wizard field — optional, honest, closed chip options only", () => {
  const wizard = readWeb("components/app/demand-request-button.tsx");

  it("offers exactly the closed slug set as toggle chips", () => {
    const m = wizard.match(
      /REQUIRED_TOOL_OPTIONS: readonly string\[\] = \[([\s\S]*?)\];/,
    );
    expect(m, "REQUIRED_TOOL_OPTIONS must exist").toBeTruthy();
    const values = [
      ...(m as RegExpMatchArray)[1].matchAll(/"([a-z-]+)"/g),
    ].map((x) => x[1]);
    expect([...values].sort()).toEqual([...EQUIPMENT_TOOL_SLUGS].sort());
    // Real toggle controls in a closed group — never a free-text tool input.
    expect(wizard).toMatch(/data-testid="demand-required-tools"/);
    expect(wizard).toMatch(/aria-pressed=\{isSelected\}/);
  });

  it("is optional — nothing selected submits undefined, never a fabricated list", () => {
    expect(wizard).toMatch(
      /requiredTools: requiredTools\.length > 0 \? requiredTools : undefined/,
    );
  });

  it("chip labels reuse the EXISTING skillNames catalogue (no new taxonomy names)", () => {
    expect(wizard).toMatch(/useTranslations\("skillNames"\)/);
    expect(wizard).toMatch(/tSkill\.has\(slug\) \? tSkill\(slug\) : slug/);
  });
});

describe("worker board — honest degradation + slug-whitelist-only display", () => {
  it("the loader tolerates the missing RPC field (pre-apply honesty)", () => {
    const loader = readWeb("lib/opportunities/load-worker-opportunities.ts");
    expect(loader).toMatch(/Array\.isArray\(row\.required_tools\)/);
  });

  it("the need model documents requiredTools as an optional closed slug list", () => {
    const fit = readWeb("lib/opportunities/opportunity-fit.ts");
    expect(fit).toMatch(/readonly requiredTools\?: readonly string\[\] \| null/);
  });

  it("the board renders localized taxonomy names or an honest 'not stated'", () => {
    const page = readWeb("app/[locale]/dashboard/opportunities/page.tsx");
    expect(page).toMatch(/t\("fieldTools"\)/);
    expect(page).toMatch(/need\.requiredTools\.map\(skillLabel\)/);
    expect(page).toMatch(/t\("toolsNotStated"\)/);
    expect(page).toMatch(/data-testid="opportunity-required-tools"/);
  });
});

describe("i18n — tools keys + taxonomy names present in en/lt/ru", () => {
  for (const locale of ["en", "lt", "ru"]) {
    it(`${locale} carries the board + wizard tools catalogue`, () => {
      const messages = JSON.parse(readWeb(`messages/${locale}.json`));
      // Worker board field label + honest-unknown label.
      expect(
        String(messages.opportunities.fieldTools ?? "").length,
      ).toBeGreaterThan(0);
      expect(
        String(messages.opportunities.toolsNotStated ?? "").length,
      ).toBeGreaterThan(0);
      // Demand wizard (companyNeed catalogue, mirroring the acc*/trans* keys).
      for (const key of ["requiredTools", "requiredToolsHelp"]) {
        expect(
          String(messages.companyNeed[key] ?? "").length,
          `${locale} companyNeed.${key}`,
        ).toBeGreaterThan(0);
      }
      // Every whitelisted slug has a non-empty EXISTING taxonomy name.
      const skillNames = JSON.parse(
        readWeb(`messages/${locale}/skill-names.json`),
      );
      for (const slug of EQUIPMENT_TOOL_SLUGS) {
        expect(
          String(skillNames[slug] ?? "").length,
          `${locale} skill-names ${slug}`,
        ).toBeGreaterThan(0);
      }
    });
  }
});
