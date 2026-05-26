#!/usr/bin/env tsx
// SR-1 migration 0022 static preview validator.
//
// Purpose
//   Live local DB validation is gated by `check:db-validation-
//   readiness` which currently FAILS on this machine (Docker missing
//   + CLI linked to prod). Until the owner clears those blockers,
//   the strongest validation we can run is *structural*: parse the
//   migration SQL and assert it contains every object the PR #81
//   body promises, and lacks the destructive patterns it forbids.
//
//   This is preparation work — running the live `supabase db reset`
//   would still be a follow-up step, owned by the operator. But it
//   gives the reviewer a deterministic, machine-checked answer to
//   "does the SQL actually do what the PR claims?" that doesn't
//   depend on a database being online.
//
// Scope
//   File:   supabase/migrations/0022_organization_tier2.sql.
//   Checks: presence of every documented object (columns,
//   constraints, indexes, tables, triggers, RLS policies, grants,
//   RPC function), AND absence of every destructive pattern.
//
// Output
//   Exit 0 only when EVERY expected pattern is found AND no
//   destructive pattern matches. Exit 1 otherwise, with a detailed
//   per-check report.
//
// What this does NOT do
//   - Run the migration.
//   - Connect to any database.
//   - Invoke `supabase` or `psql`.
//   - Replace the live DB validation required before merge.

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const migrationPath = join(
  repoRoot,
  "supabase",
  "migrations",
  "0022_organization_tier2.sql",
);
// The migration lives on the SR-1 branch (PR #81) and is intentionally
// not on main yet. When this script runs from a branch that doesn't
// carry the file, fall back to reading it from the SR-1 branch via
// `git show`. This keeps the validator independent of branch state.
const SR1_BRANCH_REF = "origin/feat/sr1-tier2-schema-draft-v1";
const SR1_FILE_PATH =
  "supabase/migrations/0022_organization_tier2.sql";

function readMigration(): string {
  if (existsSync(migrationPath)) {
    return readFileSync(migrationPath, "utf8");
  }
  try {
    return execSync(`git show ${SR1_BRANCH_REF}:${SR1_FILE_PATH}`, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
      maxBuffer: 1024 * 1024 * 4,
    }).toString();
  } catch (e) {
    process.stderr.write(
      `\nCould not read migration 0022 from local path or ${SR1_BRANCH_REF}.\n` +
        `Run \`git fetch origin feat/sr1-tier2-schema-draft-v1\` to make the SR-1 branch available locally.\n` +
        `Underlying error: ${(e as Error).message}\n`,
    );
    process.exit(1);
  }
}

type Check = { name: string; rx: RegExp };

const EXPECTED: Check[] = [
  // organizations new columns
  { name: "organizations.registration_code (text, null)", rx: /add column if not exists registration_code\s+text/i },
  { name: "organizations.correspondence_address (jsonb, null)", rx: /add column if not exists correspondence_address\s+jsonb/i },
  { name: "organizations.tier (text not null default 'pilot')", rx: /add column if not exists tier\s+text\s+not null\s+default\s+'pilot'/i },
  { name: "organizations.tier2_submitted_at (timestamptz, null)", rx: /add column if not exists tier2_submitted_at\s+timestamptz/i },
  { name: "organizations.tier2_promoted_by (uuid fk profiles)", rx: /add column if not exists tier2_promoted_by\s+uuid\s+references\s+public\.profiles\(id\)/i },
  { name: "organizations.tier2_verified_at (timestamptz, null — SR-4 use)", rx: /add column if not exists tier2_verified_at\s+timestamptz/i },
  { name: "organizations.tier2_verified_by (uuid fk profiles — SR-4 use)", rx: /add column if not exists tier2_verified_by\s+uuid\s+references\s+public\.profiles\(id\)/i },

  // organizations check constraints
  { name: "organizations_tier_check (tier in 'pilot','tier2')", rx: /add constraint organizations_tier_check[\s\S]*?check \(tier in \('pilot','tier2'\)\)/i },
  { name: "organizations_correspondence_address_shape check", rx: /add constraint organizations_correspondence_address_shape/i },

  // organizations index
  { name: "idx_organizations_tier index", rx: /create index if not exists idx_organizations_tier/i },

  // organization_representatives table
  { name: "organization_representatives table", rx: /create table if not exists public\.organization_representatives/i },
  { name: "representative role enum check", rx: /check \(role in \('director','authorised_representative','employee','contractor'\)\)/i },

  // representatives indexes
  { name: "idx_org_reps_org index", rx: /create index if not exists idx_org_reps_org/i },
  { name: "idx_org_reps_profile index", rx: /create index if not exists idx_org_reps_profile/i },
  { name: "idx_org_reps_active partial index (revoked_at is null)", rx: /create index if not exists idx_org_reps_active[\s\S]*?where revoked_at is null/i },

  // representatives trigger
  { name: "trg_org_reps_set_updated_at trigger", rx: /create trigger trg_org_reps_set_updated_at/i },

  // representatives RLS
  { name: "RLS enabled on organization_representatives", rx: /alter table public\.organization_representatives enable row level security/i },
  { name: "org_reps_select_visible policy", rx: /create policy org_reps_select_visible/i },
  { name: "org_reps_update_owner_revoke policy", rx: /create policy org_reps_update_owner_revoke/i },

  // organization_countries table
  { name: "organization_countries table", rx: /create table if not exists public\.organization_countries/i },
  { name: "presence_kind enum check", rx: /check \(presence_kind in \(\s*'headquarters',\s*'subsidiary',\s*'project_site',\s*'representative_office'\s*\)\)/i },
  { name: "organization_countries composite PK", rx: /primary key \(organization_id, country_code\)/i },
  { name: "country_code references countries(code)", rx: /country_code\s+text\s+not null\s+references\s+public\.countries\(code\)/i },

  // countries index
  { name: "idx_org_countries_org index", rx: /create index if not exists idx_org_countries_org/i },

  // countries trigger
  { name: "trg_org_countries_set_updated_at trigger", rx: /create trigger trg_org_countries_set_updated_at/i },

  // countries RLS
  { name: "RLS enabled on organization_countries", rx: /alter table public\.organization_countries enable row level security/i },
  { name: "org_countries_select_owner policy", rx: /create policy org_countries_select_owner/i },
  { name: "org_countries_write_owner policy", rx: /create policy org_countries_write_owner/i },
  { name: "org_countries_update_owner policy", rx: /create policy org_countries_update_owner/i },

  // grants
  { name: "grant select on representatives to authenticated", rx: /grant select on public\.organization_representatives to authenticated/i },
  { name: "grant update (revoked_at) on representatives to authenticated", rx: /grant update \(revoked_at\) on public\.organization_representatives to authenticated/i },
  { name: "grant select, insert, update on countries to authenticated", rx: /grant select, insert, update on public\.organization_countries to authenticated/i },

  // RPC
  { name: "promote_organization_to_tier2 function (security definer)", rx: /create or replace function public\.promote_organization_to_tier2[\s\S]*?security definer/i },
  { name: "RPC: search_path = public", rx: /set search_path = public/i },
  { name: "RPC: owner gate (raise on non-owner)", rx: /Only the organization owner may submit Tier-2/i },
  { name: "RPC: registration_code required", rx: /registration_code is required/i },
  { name: "RPC: representative_role enum validation", rx: /representative_role not in \(\s*'director','authorised_representative','employee','contractor'\s*\)/i },
  { name: "RPC: update organizations set tier='tier2'", rx: /set\s+tier\s+=\s+'tier2'/i },
  { name: "RPC: insert into organization_representatives", rx: /insert into public\.organization_representatives/i },
  { name: "RPC: audit_logs insert with action='organization.promote_tier2'", rx: /insert into public\.audit_logs[\s\S]*?'organization\.promote_tier2'/i },
  { name: "grant execute on promote_organization_to_tier2 to authenticated", rx: /grant execute on function public\.promote_organization_to_tier2[\s\S]*?to authenticated/i },
];

// Patterns that MUST NOT appear at the top level (function bodies are
// stripped before this check). Re-uses the same set as
// check-migration-safety.ts; this is a per-migration sanity belt.
const FORBIDDEN: Check[] = [
  { name: "no `drop table` in 0022", rx: /\bdrop\s+table\b/i },
  { name: "no `drop column` in 0022", rx: /\bdrop\s+column\b/i },
  { name: "no `truncate` in 0022", rx: /\btruncate\b/i },
  { name: "no `delete from` in 0022", rx: /\bdelete\s+from\b/i },
  { name: "no `alter column ... type` in 0022", rx: /\balter\s+column\b[^;]*\btype\b/i },
];

function stripCommentsAndBodies(raw: string): string {
  let s = raw.replace(/--[^\n]*/g, "");
  s = s.replace(/\$\$[\s\S]*?\$\$/g, "$$BODY$$");
  return s;
}

const raw = readMigration();
const stripped = stripCommentsAndBodies(raw);

const present: Check[] = [];
const missing: Check[] = [];
for (const c of EXPECTED) {
  // For RPC-body checks, run against the raw text so $$ ... $$ bodies
  // are visible. For top-level structural checks, the stripped form
  // is what matters but raw also contains them, so the simplest
  // unified rule is: search the raw text.
  (c.rx.test(raw) ? present : missing).push(c);
}

const destructive: Check[] = [];
for (const c of FORBIDDEN) {
  if (c.rx.test(stripped)) destructive.push(c);
}

process.stdout.write(
  "\nSR-1 migration 0022 static preview\n" +
    "(read-only structural check; no DB touched)\n\n",
);

process.stdout.write(`Expected items present: ${present.length} / ${EXPECTED.length}\n`);
if (missing.length === 0) {
  process.stdout.write("  All expected schema objects, constraints, indexes, RLS policies, grants and RPC body markers are present.\n\n");
} else {
  process.stdout.write("\nMISSING expected items:\n");
  for (const c of missing) {
    process.stdout.write(`  [MISS] ${c.name}\n`);
  }
  process.stdout.write("\n");
}

process.stdout.write(`Destructive patterns found: ${destructive.length}\n`);
if (destructive.length === 0) {
  process.stdout.write("  No drop / truncate / delete-from / alter-column-type at top level. Function bodies were excluded from this scan.\n\n");
} else {
  process.stdout.write("\nDESTRUCTIVE patterns found at top level:\n");
  for (const c of destructive) {
    process.stdout.write(`  [BAD]  ${c.name}\n`);
  }
  process.stdout.write("\n");
}

if (missing.length === 0 && destructive.length === 0) {
  process.stdout.write(
    "VERDICT: PASS — migration 0022 is structurally what PR #81 promises.\n" +
      "This is static structural validation only. Live DB validation\n" +
      "(`supabase db reset` on a local Docker stack, then staging-copy)\n" +
      "is still required before this PR moves out of DRAFT.\n",
  );
  process.exit(0);
}

process.stdout.write("VERDICT: FAIL — see items above.\n");
process.exit(1);
