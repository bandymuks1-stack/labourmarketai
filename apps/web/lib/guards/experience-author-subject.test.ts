import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * W6 author/subject slice guard — migration 20260806230000 (OWNER-GATED,
 * unapplied until the owner's explicit production decision).
 *
 * The recorded W6 modelling defect: an experience about an EMPLOYER was
 * stored as `subject_type='worker'` + a personal profile id, and no row
 * recorded whether its author acted for an organization. This suite pins the
 * correction at every layer it touches:
 *
 *   1. the migration is RED (no self-added approval marker) and paired with
 *      a rollback that restores the v1 RPC verbatim;
 *   2. the author-side model: person|organization, org shape enforced, an
 *      organization never reviews itself, the organization speaks ONCE per
 *      interaction;
 *   3. the RPC derives the author side SERVER-SIDE — the client cannot even
 *      express one — and org authorship requires LIVE manages_organization()
 *      authority (membership-widened), so revocation blocks new submissions;
 *   4. the entry point resolves an ORGANIZATION subject for org-scoped
 *      bookings and reads org authority from the SQL-truth mirror, not the
 *      owner-only list;
 *   5. the read model surfaces subject_type always and author_side
 *      feature-detected (null on stacks where the migration is unapplied);
 *   6. the moderation queue names the subject — an org-subject row can no
 *      longer render indistinguishably from a row about a worker;
 *   7. every locale carries the subject/author labels.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const MIG = "supabase/migrations/20260806230000_experience_author_subject_v1.sql";
const ROLLBACK =
  "supabase/rollbacks/20260806230000_experience_author_subject_v1.down.sql";

const sql = readFileSync(join(REPO, MIG), "utf8");
const down = readFileSync(join(REPO, ROLLBACK), "utf8");
const entry = readFileSync(join(WEB, "lib", "trust", "experience-entry.ts"), "utf8");
const records = readFileSync(join(WEB, "lib", "trust", "experience-records.ts"), "utf8");
const managed = readFileSync(
  join(WEB, "lib", "company", "managed-organizations.ts"),
  "utf8",
);
const moderationItem = readFileSync(
  join(WEB, "components", "app", "experience-moderation-item.tsx"),
  "utf8",
);
const resultCard = readFileSync(
  join(WEB, "components", "app", "workspace", "experiences-result.tsx"),
  "utf8",
);

describe("owner gate hygiene", () => {
  it("the migration carries NO self-added approval marker", () => {
    // An agent never approves its own migration. The marker may appear ONLY
    // once the owner records the production decision. The regex is the SAME
    // anchored form .github/scripts/migration-safety.mjs uses, so this pin
    // and the CI agree about what counts as an approval.
    expect(sql).not.toMatch(/(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
  });

  it("the migration states the owner gate and the apply channel", () => {
    expect(sql).toMatch(/OWNER-GATED/);
    expect(sql).toMatch(/apply_migration/);
    expect(sql).toMatch(/Never `db push`/);
  });

  it("the paired rollback exists and restores the v1 RPC verbatim", () => {
    // The distinguishing v1 booking predicate — two profile parties only —
    // must be present in the DOWN body (that is what "restore v1" means).
    expect(down).toMatch(/w\.profile_id = v_author and b\.owner_id = v_subject_profile/);
    expect(down).toMatch(/drop column if exists author_organization_id/);
    expect(down).toMatch(/drop column if exists author_side/);
    expect(down).toMatch(/experience_records_one_org_author_per_interaction/);
  });
});

describe("author-side model", () => {
  it("author_side is person|organization with the org shape enforced", () => {
    expect(sql).toMatch(/author_side text not null default 'person'/);
    expect(sql).toMatch(/check \(author_side in \('person','organization'\)\)/);
    expect(sql).toMatch(
      /\(author_side = 'organization'\) = \(author_organization_id is not null\)/,
    );
  });

  it("deleting an organization never deletes a worker-subject record it authored", () => {
    expect(sql).toMatch(
      /author_organization_id uuid\s*\n?\s*references public\.organizations\(id\) on delete set null/,
    );
  });

  it("an organization never reviews itself", () => {
    expect(sql).toMatch(/author_organization_id <> subject_organization_id/);
  });

  it("the organization speaks once per interaction", () => {
    expect(sql).toMatch(
      /create unique index if not exists experience_records_one_org_author_per_interaction/,
    );
    expect(sql).toMatch(
      /\(author_organization_id, interaction_kind, interaction_id\)\s*\n?\s*where author_organization_id is not null/,
    );
  });
});

describe("server-side derivation (the client cannot express an author side)", () => {
  it("the RPC signature is unchanged — no author-side parameter exists", () => {
    expect(sql).not.toMatch(/p_author_side|p_author_org/);
    expect(sql).toMatch(
      /create or replace function public\.submit_experience_record\(\s*\n\s*p_subject_type text,/,
    );
  });

  it("org-scoped booking: employer authorship requires live authority and records the org", () => {
    expect(sql).toMatch(/if public\.manages_organization\(v_b_org\) then/);
    expect(sql).toMatch(
      /v_ok := true; v_author_side := 'organization'; v_author_org := v_b_org;/,
    );
  });

  it("org-scoped booking: the worker's subject IS the booking organization", () => {
    expect(sql).toMatch(/v_ok := \(v_subject_org is not null and v_subject_org = v_b_org\);/);
  });

  it("engagement: manager authorship records the engagement organization", () => {
    expect(sql).toMatch(
      /v_ok := true; v_author_side := 'organization'; v_author_org := v_e_org;/,
    );
  });

  it("the insert carries the derived author columns", () => {
    expect(sql).toMatch(/author_profile_id, author_side, author_organization_id/);
  });

  it("privileges are restated for the replaced function (secdef closure rule)", () => {
    expect(sql).toMatch(
      /revoke execute on function public\.submit_experience_record[\s\S]*from public, anon/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.submit_experience_record[\s\S]*to authenticated/,
    );
  });
});

describe("entry point resolves the organization subject", () => {
  it("bookings are read WITH their organization", () => {
    expect(entry).toMatch(/organization_id.*workers\(profile_id\)|organization_id, status, start_date/);
  });

  it("a worker describing an org-scoped booking gets an ORGANIZATION subject", () => {
    expect(entry).toMatch(/subjectType = "organization";\s*\n\s*subjectId = orgId;/);
  });

  it("org authority comes from the SQL-truth mirror, not the owner-only list", () => {
    expect(entry).toMatch(/getManagedOrganizationIds/);
    expect(entry).not.toMatch(/getOwnedOrganizations/);
  });

  it("the mirror asks BOTH authority arms exactly like manages_organization()", () => {
    expect(managed).toMatch(/engagement_contexts/);
    expect(managed).toMatch(/company_memberships/);
    expect(managed).toMatch(/\["manager", "owner", "external_manager"\]/);
    expect(managed).toMatch(/\["owner", "admin", "manager", "external_manager"\]/);
  });
});

describe("read model: subject always, author side feature-detected", () => {
  it("subject_type is part of the base select (v1 column, always present)", () => {
    expect(records).toMatch(/BASE_SELECT[\s\S]*subject_type/);
  });

  it("author_side is the extended select with a 42703 fallback to null", () => {
    expect(records).toMatch(/EXTENDED_SELECT = `\$\{BASE_SELECT\}, author_side`/);
    expect(records).toMatch(/UNDEFINED_COLUMN_CODE = "42703"/);
    expect(records).toMatch(/authorSide: !authorSideKnown\s*\n?\s*\? null/);
  });
});

describe("surfaces name the subject", () => {
  it("the moderation item renders subject and (when known) author side", () => {
    expect(moderationItem).toMatch(/experience-moderation-subject/);
    expect(moderationItem).toMatch(/subject\.\$\{subjectType\}/);
    expect(moderationItem).toMatch(/authorSide === "organization"/);
  });

  it("the experiences result renders subject and (when known) author side", () => {
    expect(resultCard).toMatch(/experience-subject-type/);
    expect(resultCard).toMatch(/experience-author-side/);
  });
});

describe("i18n", () => {
  it("every locale carries subject.worker / subject.organization / authorSide.organization", () => {
    const dir = join(WEB, "messages");
    const locales = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(locales.length).toBeGreaterThanOrEqual(11);
    for (const file of locales) {
      const messages = JSON.parse(readFileSync(join(dir, file), "utf8"));
      const exp = messages.experience ?? {};
      expect(exp.subject?.worker, `${file}: experience.subject.worker`).toBeTruthy();
      expect(
        exp.subject?.organization,
        `${file}: experience.subject.organization`,
      ).toBeTruthy();
      expect(
        exp.authorSide?.organization,
        `${file}: experience.authorSide.organization`,
      ).toBeTruthy();
    }
  });
});

describe("no reputation arithmetic sneaks in", () => {
  it("the migration's SQL (comments aside) adds no score, stars, or ranking", () => {
    // Comments legitimately SAY "no stars, no numeric score" — the doctrine
    // statement. The executable SQL must not contain any of these tokens.
    const executable = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    for (const forbidden of [/\bstars?\b/i, /\bscore/i, /\brating/i, /\brank\b/i]) {
      expect(executable).not.toMatch(forbidden);
    }
  });
});
