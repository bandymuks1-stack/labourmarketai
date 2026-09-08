import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guard for 20260901100000_revoke_public_schema_create_v1 — the minimal
 * current-equivalent extraction of the still-live half of #879 (owner approved
 * 2026-09-01).
 *
 * The migration removes ONE thing: the implicit PUBLIC grant of CREATE on
 * schema `public`, which `anon`, `authenticated` and `service_role` all
 * inherited (measured: none of them holds a direct grant). What this guard
 * exists to prevent is the two ways that change could go wrong later:
 *
 *   1. USAGE gets revoked along with CREATE. That would break every read, RPC
 *      and auth path in the product — the migration is only safe BECAUSE it
 *      leaves `=U/postgres` in place.
 *   2. The migration quietly grows into a broader grant rewrite. The owner's
 *      ruling was explicit: preserve USAGE and object-level privileges the
 *      product actually needs, and do not broaden or rewrite unrelated grants.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATION = join(
  REPO_ROOT,
  "supabase",
  "migrations",
  "20260901100000_revoke_public_schema_create_v1.sql",
);
const ROLLBACK = join(
  REPO_ROOT,
  "supabase",
  "rollbacks",
  "20260901100000_revoke_public_schema_create_v1.down.sql",
);

const sql = readFileSync(MIGRATION, "utf8");
const down = readFileSync(ROLLBACK, "utf8");

/** Statement text with `--` comments stripped, so prose never satisfies a check. */
function statements(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();
}

const body = statements(sql);
const downBody = statements(down);

describe("20260901100000 revokes exactly one privilege", () => {
  it("revokes CREATE on schema public from PUBLIC", () => {
    expect(body).toMatch(/revoke\s+create\s+on\s+schema\s+public\s+from\s+public\s*;/);
  });

  it("is the ONLY revoke in the migration", () => {
    const revokes = body.match(/\brevoke\b/g) ?? [];
    expect(revokes).toHaveLength(1);
  });

  it("grants nothing — the direction is narrowing only", () => {
    expect(body).not.toMatch(/\bgrant\b/);
  });

  it("never revokes USAGE — losing it would break every read, RPC and auth path", () => {
    expect(body).not.toMatch(/revoke[\s\S]*?\busage\b/);
  });

  it("touches no object-level privilege, table, function, policy or row", () => {
    for (const forbidden of [
      /\bon\s+table\b/,
      /\bon\s+function\b/,
      /\bon\s+all\s+tables\b/,
      /\bon\s+all\s+functions\b/,
      /\bcreate\s+policy\b/,
      /\bdrop\s+policy\b/,
      /\bcreate\s+or\s+replace\s+function\b/,
      /\balter\s+table\b/,
      /\bdrop\s+table\b/,
      /\bupdate\s+/,
      /\bdelete\s+from\b/,
      /\binsert\s+into\b/,
    ]) {
      expect(body).not.toMatch(forbidden);
    }
  });

  it("carries the human-gate marker, because a REVOKE is a grant-surface change", () => {
    expect(sql).toContain("@human-gate-approved");
  });
});

describe("the rollback restores exactly what was revoked", () => {
  it("grants CREATE on schema public back to PUBLIC", () => {
    expect(downBody).toMatch(/grant\s+create\s+on\s+schema\s+public\s+to\s+public\s*;/);
  });

  it("is a single statement and revokes nothing", () => {
    expect(downBody.match(/\bgrant\b/g) ?? []).toHaveLength(1);
    expect(downBody).not.toMatch(/\brevoke\b/);
  });

  it("warns that rolling back re-opens the exposure", () => {
    expect(down.toUpperCase()).toContain("RE-OPENS");
  });
});

describe("#879 supersession is recorded, not assumed", () => {
  it("records why the stale branch was not merged", () => {
    expect(sql).toContain("890 commits");
    expect(sql).toContain("20260727170000_null_safe_owner_guards_v1");
  });

  it("records that the I-02 half was re-measured as already closed", () => {
    // The claim that matters: it was verified against production, not inferred
    // from the fact that a newer migration exists somewhere.
    expect(sql).toContain("v_owner is not null and v_owner = uid");
    expect(sql).toContain("ZERO");
  });

  it("names no guarded function identifier, so the team-layer guards stay true", () => {
    // team-brigades-layer.test.ts and team-trust-connect-layer.test.ts assert
    // that each of those function names is defined by exactly ONE migration.
    // This file defines none of them, so it must not spell them out either —
    // a substring in a comment is enough to trip those guards. Naming them
    // belongs in the PR description, not in the migration text.
    for (const guarded of [
      "save_team_details_v1",
      "get_team_capability_summary_v1",
      "add_org_member",
      "grant_org_manager",
    ]) {
      expect(sql).not.toContain(guarded);
    }
  });
});
