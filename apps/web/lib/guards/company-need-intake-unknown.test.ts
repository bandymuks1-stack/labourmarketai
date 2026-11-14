import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * AN ANSWER NOT GIVEN STAYS UNKNOWN (owner P0 2026-11-10).
 *
 * The public intake RPC used to turn an empty urgency / accommodation /
 * engagement / transport / headcount into 'flexible' / 'not_provided' /
 * 'employment' / false / 1, so an operator read the company's silence as its
 * answer. The newest migration that defines `submit_company_need_public_v1`
 * must keep NULL as NULL, and the public form must start every optional
 * select on "not specified".
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

function latestDefinition(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) =>
      /create or replace function public\.submit_company_need_public_v1/i.test(
        readFileSync(join(MIGRATIONS, f), "utf8"),
      ),
    );
  const file = files.at(-1)!;
  return { file, sql: readFileSync(join(MIGRATIONS, file), "utf8") };
}

describe("the intake RPC keeps an unanswered field unknown", () => {
  const { file, sql } = latestDefinition();
  const body = sql.slice(sql.toLowerCase().indexOf("create or replace function"));

  it(`${file}: no default is put in place of a missing answer`, () => {
    for (const invented of [
      /coalesce\([^;]*'flexible'\)/i,
      /coalesce\([^;]*'not_provided'\)/i,
      /coalesce\([^;]*'employment'\)/i,
      /coalesce\(p_transport_needed,\s*false\)/i,
      /coalesce\(p_headcount,\s*1\)/i,
      /then v_urgency := 'flexible'/i,
      /v_acc := 'not_provided'/i,
      /then v_eng := 'employment'/i,
    ])
      expect(body, String(invented)).not.toMatch(invented);
  });

  it(`${file}: the abuse bounds and required checks are still there`, () => {
    for (const kept of ["invalid_company_name", "invalid_description", "invalid_country", "intake_rate_limited", "security definer"])
      expect(body.toLowerCase()).toContain(kept);
  });
});

describe("the public form starts every optional answer on 'not specified'", () => {
  const form = readFileSync(join(__dirname, "..", "..", "components", "app", "company-need-form.tsx"), "utf8");
  it.each(["urgency", "accommodation", "transport_provided", "engagement_model"])("%s", (name) => {
    expect(form).toMatch(
      new RegExp(String.raw`<select name="${name}" defaultValue="" [^>]*>\s*<option value="">\{labels\.notSpecified\}</option>`),
    );
  });
  it("the headcount field starts empty", () => {
    expect(form).not.toMatch(/name="number_of_workers"[^>]*defaultValue/);
  });
});
