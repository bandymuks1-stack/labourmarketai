import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_RELATIONSHIP_SLUG,
  INVITATION_TYPES,
  RELATIONSHIP_INVITE_CHOICES,
  isRelationshipInviteSlug,
  relationshipChoiceBlocked,
} from "@/lib/invitations/model";

/**
 * RELATIONSHIP INVITATIONS — the institution↔learner link, and the two ways it
 * could quietly become something else.
 *
 * Migration 20260827200000 made the relationship an invitation establishes into
 * DATA instead of a hardcoded CASE. That closes `CAPABILITY_INVENTORY.md` §4
 * blocker 1 (an institution could declare it trains people and still not
 * connect a single learner) without committing the narrowing ARCHITECTURE §6.2
 * forbids.
 *
 * The two failures this guards against are opposite:
 *   NARROWING — someone "simplifies" it back into a `join_as_student` type,
 *               and the next relationship needs another migration again;
 *   OVERREACH — someone marks `manager` or `owner` invitable, turning a mailed
 *               token into a way to hand out authority over other people's
 *               records.
 *
 * Every string assertion below is paired with a NEGATIVE CONTROL, because a
 * guard that would pass against an empty file proves nothing (the vacuous-guard
 * class recorded after the backspace-escape incident).
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const MIGRATION = join(
  REPO,
  "supabase",
  "migrations",
  "20260827200000_relationship_invitations_v1.sql",
);
const ROLLBACK = join(
  REPO,
  "supabase",
  "rollbacks",
  "20260827200000_relationship_invitations_v1.down.sql",
);

const sql = readFileSync(MIGRATION, "utf8");
const rollbackSql = readFileSync(ROLLBACK, "utf8");
const norm = (s: string) => s.replace(/\s+/g, " ");
const sqlFlat = norm(sql);
/**
 * The migration WITHOUT its `--` commentary.
 *
 * The file explains at length why `join_as_student` was refused, so a
 * whole-file "must not contain" check fails on the rationale that documents the
 * very rule it is enforcing. Assertions about what the migration DOES run
 * against this; assertions about what it SAYS run against `sqlFlat`.
 */
const sqlCode = norm(sql.replace(/--[^\n]*/g, " "));

const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;
const messages = (loc: string) =>
  JSON.parse(readFileSync(join(WEB, "messages", `${loc}.json`), "utf8"));
const relationshipNames = (loc: string) =>
  JSON.parse(
    readFileSync(join(WEB, "messages", loc, "relationship-types.json"), "utf8"),
  );

describe("relationship invitations — the migration", () => {
  it("NEGATIVE CONTROL: the files this guard reads are real and substantial", () => {
    // If a path ever goes wrong, every `toContain` below would still pass
    // against "" only if the assertion were inverted — but a truncated or
    // stubbed file is the realistic accident, and this catches it.
    expect(sql.length).toBeGreaterThan(4000);
    expect(rollbackSql.length).toBeGreaterThan(2000);
    expect(sqlFlat).not.toContain("THIS ASSERTION SHOULD NEVER MATCH");
  });

  it("is fail-closed: a relationship is not invitable until deliberately marked", () => {
    expect(sqlFlat).toContain(
      "add column if not exists invitable boolean not null default false",
    );
  });

  it("makes the organization capability the gate for a learner", () => {
    // `student` may only be offered by an organization that declared it trains
    // people — which is what makes the capability declaration consequential
    // rather than a stored fact nothing reads.
    expect(sqlFlat).toContain(
      "set requires_organization_role = 'training_provider' where slug = 'student'",
    );
    expect(sqlFlat).toContain("organization_capability_required");
  });

  it("never lets authority be handed out through a mailed token", () => {
    // The seed's invitable list is the whole allowlist. `manager` grants
    // administrative authority over other people's records and `owner` is a
    // transfer; neither may be established by accepting an emailed link.
    const seed = sqlFlat.match(
      /set invitable = true where slug in \(([^)]*)\)/,
    )?.[1];
    expect(seed, "the invitable seed statement was not found").toBeTruthy();
    expect(seed).toContain("'student'");
    expect(seed).toContain("'volunteer'");
    expect(seed).not.toContain("'manager'");
    expect(seed).not.toContain("'owner'");
    expect(seed).not.toContain("'viewer'");
    expect(seed).not.toContain("'unemployed'");
  });

  it("keeps every pre-existing invitation meaning exactly what it meant", () => {
    // The historical CASE must survive as the FALLBACK, in BOTH accept paths.
    // An invitation created before this migration carries no slug, so it must
    // still produce `employee` / `collaborator`.
    const coalesceFallbacks = sql.match(
      /coalesce\(\s*nullif\(\s*v_(row|token_row)\.relationship_slug, ''\s*\),\s*case when/g,
    );
    expect(
      coalesceFallbacks?.length,
      "both accept_invitation_v1 and accept_invitation_by_id_v1 must fall back",
    ).toBe(2);
    // And the column must be nullable — no NOT NULL, no default that would
    // rewrite existing rows.
    expect(sqlFlat).toContain(
      "add column if not exists relationship_slug text references public.relationship_types(slug)",
    );
    expect(sqlFlat).not.toMatch(/relationship_slug text not null/);
  });

  it("tells the invited person what they are agreeing to", () => {
    // Consent: acceptance creates a real relationship, so the preview must be
    // able to say which one before the person accepts.
    expect(sqlFlat).toContain("'relationship_slug', v_row.relationship_slug");
  });

  it("ships a rollback that restores the old shape and destroys no history", () => {
    expect(norm(rollbackSql)).toContain(
      "drop function if exists public.create_invitation_v1( text, text, text, text, uuid, uuid, text, text, text, text)",
    );
    // A rollback must never delete relationships two people agreed to.
    expect(rollbackSql).not.toMatch(/delete\s+from\s+public\.engagement_contexts/i);
    expect(rollbackSql).not.toMatch(/drop\s+column/i);
  });
});

describe("relationship invitations — the anti-narrowing contract", () => {
  it("adds NO new invitation_type (ARCHITECTURE §6.2)", () => {
    // The whole point: a learner invitation is `join_organization` carrying a
    // relationship slug. Growing this list per relationship is the taxonomy
    // hardcoding the extensibility contract names as a rejectable move.
    expect([...INVITATION_TYPES]).toEqual([
      "join_platform",
      "join_organization",
      "join_team",
      "join_as_employee",
      "collaborate_partner",
      "join_project",
      "invite_company",
    ]);
    // Asserted against the EXECUTABLE sql: the file's own prose explains why
    // this type was refused, and that explanation must not trip the guard.
    expect(sqlCode).not.toContain("join_as_student");
    // NEGATIVE CONTROL: comment-stripping must not have emptied the haystack.
    expect(sqlCode).toContain("create or replace function public.create_invitation_v1");
    // The type CHECK constraint must not be rewritten either.
    expect(sqlCode).not.toMatch(/drop constraint invitations_invitation_type_check/i);
  });

  it("offers education without demoting the historical default", () => {
    expect(DEFAULT_RELATIONSHIP_SLUG).toBe("employee");
    expect(RELATIONSHIP_INVITE_CHOICES[0]?.slug).toBe("employee");
    expect(RELATIONSHIP_INVITE_CHOICES.map((c) => c.slug)).toContain("student");
  });

  it("never offers a capacity the database refuses to create", () => {
    // The UI list must be a SUBSET of what the migration marked invitable —
    // otherwise the screen offers something the RPC will reject, which reads
    // to the user as a broken product.
    const seed = sqlFlat.match(
      /set invitable = true where slug in \(([^)]*)\)/,
    )?.[1] as string;
    for (const choice of RELATIONSHIP_INVITE_CHOICES) {
      expect(seed, `${choice.slug} is offered but not seeded invitable`).toContain(
        `'${choice.slug}'`,
      );
    }
  });

  it("mirrors the capability rule the database enforces", () => {
    const student = RELATIONSHIP_INVITE_CHOICES.find((c) => c.slug === "student");
    expect(student?.requiresOrganizationRole).toBe("training_provider");
  });
});

describe("relationship invitations — the pure helpers", () => {
  it("blocks a capacity the organization has not declared", () => {
    const student = RELATIONSHIP_INVITE_CHOICES.find((c) => c.slug === "student")!;
    expect(relationshipChoiceBlocked(student, [])).toBe(true);
    expect(relationshipChoiceBlocked(student, ["employer"])).toBe(true);
    // NEGATIVE CONTROL: it must actually UNBLOCK, or the assertion above would
    // pass for a function that always returns true.
    expect(relationshipChoiceBlocked(student, ["training_provider"])).toBe(false);
  });

  it("never blocks a capacity that requires nothing", () => {
    const employee = RELATIONSHIP_INVITE_CHOICES.find((c) => c.slug === "employee")!;
    expect(relationshipChoiceBlocked(employee, [])).toBe(false);
  });

  it("accepts only offered slugs", () => {
    expect(isRelationshipInviteSlug("student")).toBe(true);
    // NEGATIVE CONTROL: a real relationship_types slug that is deliberately
    // NOT offerable must still be refused, so this is not merely "any string".
    expect(isRelationshipInviteSlug("manager")).toBe(false);
    expect(isRelationshipInviteSlug("owner")).toBe(false);
    expect(isRelationshipInviteSlug("")).toBe(false);
    expect(isRelationshipInviteSlug(null)).toBe(false);
  });
});

describe("relationship invitations — the reader never meets a slug", () => {
  it("names every offered capacity in every active locale", () => {
    for (const loc of ACTIVE_LOCALES) {
      const names = relationshipNames(loc);
      for (const choice of RELATIONSHIP_INVITE_CHOICES) {
        expect(
          typeof names[choice.slug] === "string" && names[choice.slug].trim() !== "",
          `${loc}/relationship-types.json is missing a name for ${choice.slug}`,
        ).toBe(true);
      }
    }
  });

  it("carries the capacity question and both new outcomes in every active locale", () => {
    for (const loc of ACTIVE_LOCALES) {
      const invite = messages(loc).network.invite;
      for (const key of [
        "capacityLabel",
        "capacityHint",
        "capacityNeedsCapability",
        "capacityNeedsCapabilityCta",
      ]) {
        expect(
          typeof invite[key] === "string" && invite[key].trim() !== "",
          `${loc}: network.invite.${key} missing or empty`,
        ).toBe(true);
      }
      for (const key of [
        "invalid_relationship",
        "organization_capability_required",
      ]) {
        expect(
          typeof invite.outcomes[key] === "string" &&
            invite.outcomes[key].trim() !== "",
          `${loc}: network.invite.outcomes.${key} missing or empty`,
        ).toBe(true);
      }
      // The acceptance screen must be able to state the relationship AND that
      // a placement is not a job.
      const page = messages(loc).network.invitePage;
      expect(page.capacity, `${loc}: invitePage.capacity missing`).toContain(
        "{capacity}",
      );
      expect(
        typeof page.capacityNotEmployment === "string" &&
          page.capacityNotEmployment.trim() !== "",
        `${loc}: invitePage.capacityNotEmployment missing`,
      ).toBe(true);
    }
  });

  it("never renders a raw slug in the invite panel", () => {
    const panel = readFileSync(
      join(WEB, "components", "app", "invite-panel.tsx"),
      "utf8",
    );
    // The capacity option's label must come from the shared catalogue.
    expect(panel).toContain('useTranslations("relationshipTypes")');
    expect(panel).toContain("{tRelationships(c.slug)}");
    // NEGATIVE CONTROL: the option must not print the slug itself.
    expect(panel).not.toMatch(/<option[^>]*>\s*\{c\.slug\}\s*</);
  });
});
