import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * An institution can CORRECT a programme it created.
 *
 * WHAT THIS GUARD IS FOR. `education_programs` carried exactly one policy — a
 * SELECT — and exactly one writer, `create_education_program_v1`. No update
 * function existed anywhere in `pg_proc`, so a programme was immutable from
 * creation. That is not cosmetic: the target profession is the field that
 * activates the live employer-demand count beside the programme, and
 * production's single programme has a null slug, so it reads "no direction"
 * forever with no act available to change it.
 *
 * The assertions below pin the two properties that make the new write path
 * narrow rather than a general programme writer: the organization is read FROM
 * THE ROW (never taken from the caller), and the identity fields are not
 * updatable, so a programme can never be moved or re-attributed.
 */

const ROOT = join(process.cwd(), "..", "..");
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260908120000_education_program_correction_v1.sql",
);
const ROLLBACK = join(
  ROOT,
  "supabase/rollbacks/20260908120000_education_program_correction_v1.down.sql",
);

const sql = readFileSync(MIGRATION, "utf8");
const down = readFileSync(ROLLBACK, "utf8");

/** Executable statements only — the header comment names what the structural
 *  assertions forbid, so matching the whole file would test prose. */
const body = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const ACTIONS = readFileSync(
  join(process.cwd(), "lib/education/program-actions.ts"),
  "utf8",
);
const FORMS = readFileSync(
  join(process.cwd(), "components/app/institution-program-forms.tsx"),
  "utf8",
);
const SECTION = readFileSync(
  join(process.cwd(), "components/app/institution-programs-section.tsx"),
  "utf8",
);

describe("the correction path cannot be turned into authority over another organization", () => {
  it("reads the organization FROM THE ROW, and never takes one from the caller", () => {
    // The signature must not accept an organization id at all: if it did, a
    // manager of organization A could pass A while editing B's programme.
    expect(body).not.toMatch(/p_organization_id/);
    expect(body).toMatch(
      /select organization_id into v_org\s+from public\.education_programs/,
    );
    expect(body).toMatch(/public\.manages_organization\(v_org\)/);
  });

  it("keeps the same three refusals as the create path it mirrors", () => {
    expect(body).toContain("'Not authenticated'");
    expect(body).toContain("'not_manager'");
    expect(body).toContain("'not_education_institution'");
    expect(body).toMatch(/role_slug = 'training_provider'/);
    // One refusal for "no such programme" and "not yours" alike.
    expect(body).toMatch(/v_org is null or not public\.manages_organization/);
  });

  it("validates both slugs against the same active catalogues, not a copy", () => {
    expect(body).toMatch(/from public\.professions p[\s\S]{0,80}p\.is_active/);
    expect(body).toMatch(
      /from public\.education_types e[\s\S]{0,90}e\.is_active/,
    );
    expect(body).toContain("'unknown_profession'");
    expect(body).toContain("'unknown_education_type'");
  });

  it("updates only the four editable fields — a programme cannot be moved or re-attributed", () => {
    const update = body.slice(body.indexOf("update public.education_programs"));
    const setClause = update.slice(0, update.indexOf("where"));
    for (const editable of [
      "name",
      "target_profession_slug",
      "education_type_slug",
      "description",
    ]) {
      expect(setClause).toContain(editable);
    }
    for (const frozen of ["organization_id", "created_by", "created_at", "id ="]) {
      expect(setClause).not.toContain(frozen);
    }
  });

  it("revokes anon and public BY NAME and grants only authenticated", () => {
    const sig = "public.update_education_program_v1(uuid, text, text, text, text)";
    expect(body).toContain(`revoke all on function ${sig} from public;`);
    expect(body).toContain(`revoke all on function ${sig} from anon;`);
    expect(body).toContain(`grant execute on function ${sig} to authenticated;`);
  });

  it("is not destructive and ships a complete inverse", () => {
    expect(body).not.toMatch(/delete\s+from/i);
    expect(body).not.toMatch(/drop\s+table/i);
    expect(body).not.toMatch(/drop\s+column/i);
    expect(body).not.toMatch(/create policy|drop policy|alter policy/i);
    expect(down).toContain(
      "drop function if exists public.update_education_program_v1",
    );
    expect(down).not.toMatch(/delete\s+from/i);
  });

  it("stays owner-gated: the RED acknowledgement says it is not an approval", () => {
    expect(sql.startsWith("-- @human-gate-approved")).toBe(true);
    expect(sql).toMatch(/NO OWNER DECISION EXISTS FOR THIS FILE YET/);
  });
});

describe("the surface makes the correction reachable and says what the empty field costs", () => {
  it("the action re-derives the caller and validates against the shared slug lists", () => {
    expect(ACTIONS).toContain("update_education_program_v1");
    expect(ACTIONS).toMatch(/PROFESSION_SLUGS\.includes\(profession\)/);
    // No organization id is sent — the RPC reads it from the row.
    const fn = ACTIONS.slice(ACTIONS.indexOf("export async function updateProgramAction"));
    expect(fn.slice(0, fn.indexOf("\n}"))).not.toContain("organizationId");
  });

  it("the edit form is rendered for EVERY programme, prefilled with what is there now", () => {
    expect(SECTION).toContain("<EditProgramForm");
    expect(FORMS).toContain("export function EditProgramForm");
    expect(FORMS).toMatch(/defaultValue=\{program\.name\}/);
    expect(FORMS).toMatch(/defaultValue=\{program\.targetProfessionSlug \?\? ""\}/);
    expect(FORMS).toMatch(/defaultValue=\{program\.educationTypeSlug \?\? ""\}/);
  });

  it("a programme with no direction is told what setting one gives it", () => {
    // Before this, such a programme rendered "no direction", no demand chip and
    // no explanation — a dead end the person could not read their way out of.
    expect(FORMS).toMatch(/program\.targetProfessionSlug === null/);
    expect(FORMS).toContain("labels.setDirectionHint");
    expect(SECTION).toContain('setDirectionHint: t("form.setDirectionHint")');
  });
});
