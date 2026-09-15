import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { capabilityById } from "@/lib/product-gate/capability-register";

/**
 * SKL-9 / ARCH-2 — the RPL record packet (PREPARED, NOT APPLIED) and the
 * rule that the model and the database state the SAME authority.
 *
 * The invariants the owner named, each pinned as a shape property:
 *   · recognition comes from an INDEPENDENT assessor with an assessor role;
 *   · never the subject; never an organization that engages the subject;
 *   · evidence cited must be the subject's own CONFIRMED work;
 *   · validity, revocation-with-reason, correction by superseding row;
 *   · the subject can always read their own recognition;
 *   · ESCO is not an input; nothing scores;
 *   · no surface points at the unapplied record — SKL-9 stays
 *     ARCHITECTURE_ONLY with an owner decision, not a dead control.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const MIGRATION = join(REPO, "supabase", "migrations", "20260915140000_competency_recognitions_v1.sql");
const ROLLBACK = join(REPO, "supabase", "rollbacks", "20260915140000_competency_recognitions_v1.down.sql");
const read = (p: string) => readFileSync(p, "utf8");

describe("the packet — prepared, unapplied, and the authority rule in the database", () => {
  const sql = read(MIGRATION);
  const fn = sql.slice(sql.indexOf("create or replace function public.record_competency_recognition_v1"));

  it("exists with a guarded rollback and no approval annotation", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    expect(read(ROLLBACK)).toMatch(/still holds % recognition\(s\)/);
    expect(sql).toMatch(/PREPARED FOR REVIEW ONLY/);
    expect(sql).not.toMatch(/@human-gate-approved/);
    expect(sql).toMatch(/^-- ROLLBACK/m);
  });

  it("refuses the four things the model refuses, by the same names", () => {
    for (const refusal of [
      "not_an_assessor_role",
      "actor_does_not_manage_assessor",
      "self_recognition",
      "beneficiary_organization",
    ]) {
      expect(fn).toContain(`raise exception '${refusal}'`);
    }
    expect(fn).toMatch(/r\.role_slug = 'training_provider'/);
    expect(fn).toMatch(/ec\.relationship_slug <> 'student'/);
  });

  it("admits only the subject's own CONFIRMED evidence — never self-reported", () => {
    expect(fn).toMatch(/w\.profile_id = p_subject_profile_id/);
    expect(fn).toMatch(/journal_entry_confirmations c/);
    expect(fn).toMatch(/c\.confirmer_id <> p_subject_profile_id/);
  });

  it("the subject can always read their own; employers do not read the table", () => {
    const policy = sql.slice(sql.indexOf("create policy competency_recognitions_select"));
    expect(policy).toMatch(/subject_profile_id = auth\.uid\(\)/);
    expect(policy).toMatch(/public\.manages_organization\(assessor_organization_id\)/);
    expect(policy).not.toMatch(/can_manage_project|owns_company|caller_manages_worker/);
    expect(sql).not.toMatch(/for insert|for update|for delete/i);
  });

  it("revocation carries a reason and never rewrites; correction is by superseding row", () => {
    expect(sql).toMatch(/a revocation must carry a reason/);
    expect(sql).toMatch(/revoked_at = coalesce\(revoked_at, now\(\)\)/);
    expect(sql).toMatch(/supersedes_id\s+uuid references public\.competency_recognitions\(id\)/);
    expect(sql).toMatch(/competency_recognitions_revocation_shape/);
  });

  it("ESCO is not an input and nothing scores", () => {
    // The header may SAY that ESCO is the semantic layer only; the executable
    // SQL must not touch it, and must compute no score or rank.
    const executable = sql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(executable).not.toMatch(/esco/i);
    expect(executable).not.toMatch(/score|rank/i);
  });
});

describe("the model and the register — architecture, not a dead control", () => {
  it("the model has no IO and no writer, and states the same assessor roles", () => {
    const model = read(join(APP, "lib/skills/recognition-model.ts"));
    expect(model).not.toMatch(/server-only|\.from\(|\.rpc\(|createClient/);
    expect(model).toMatch(/export const ASSESSOR_ROLES = \["training_provider"\] as const;/);
    // ESCO is named in the doc comment as the semantic layer it is NOT using;
    // no identifier, import or lookup may reference it.
    expect(model).not.toMatch(/esco[A-Za-z_]*\(|from ["'][^"']*esco|import[^;]*esco/i);
  });

  it("SKL-9 is ARCHITECTURE_ONLY with an owner decision naming the packet, and no surface points at the unapplied record", () => {
    const row = capabilityById("SKL-9")!;
    expect(row.status).toBe("ARCHITECTURE_ONLY");
    expect(row.ownerDecision).toMatch(/20260915140000_competency_recognitions_v1/);
    expect(row.surfaces).toEqual([]);
    expect(row.coreModule).toBe("lib/skills/recognition-model.ts");
  });

  it("no app code calls the unapplied RPCs yet", () => {
    // The record is owner-gated. A caller shipped before the apply would be a
    // control that answers 42501 to the one person it exists for.
    const out = execSync(
      'git grep -l "record_competency_recognition_v1\\|revoke_competency_recognition_v1" -- "apps/web/lib" "apps/web/app" "apps/web/components" || true',
      { cwd: REPO, encoding: "utf8" },
    );
    const hits = out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((f) => !f.endsWith(".test.ts"));
    expect(hits).toEqual([]);
  });
});
