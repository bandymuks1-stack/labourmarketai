import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guard for W9 slice 2 — organization RLS hardening (P0 + latent P1).
 *
 * P0: `organizations_select` was `using (true)` (0013 line 327) while
 * `authenticated` held `GRANT SELECT` on the table (0013 line 409). Any logged-in
 * session could read EVERY column of EVERY organization row directly —
 * owner_profile_id, legal_name, vat_number, public_contact_email/phone,
 * description, trust_score — regardless of `public_profile_enabled`. That voided
 * the "default PRIVATE, opt in per org" contract that 20260719120000 was built
 * on, whose own header wrongly asserted the org RLS was already owner-scoped.
 *
 * P1 (latent): `engagement_contexts_write` (0013 line 334) permitted a self-write
 * (`profile_id = auth.uid()`), closed today only by the ABSENCE of a DML grant.
 * One future `grant insert` would have let any user insert themselves a
 * `relationship_slug='manager'` row and seize `manages_organization()`.
 *
 * This guard pins the shape of the fix so a later edit cannot silently:
 *   - restore `using (true)` or any other unscoped organizations SELECT,
 *   - widen the policy to `public_profile_enabled` (a row policy cannot hide
 *     columns — that would leak legal_name / vat_number / owner ids for every
 *     published org and would be a SECOND public organization system),
 *   - re-introduce the engagement_contexts self-write arm or re-grant DML,
 *   - hand the new directory RPC to anon, or widen its projection,
 *   - self-approve the human gate, or
 *   - smuggle DML into an RLS migration.
 *
 * Static analysis of SQL + TS text: the policies themselves can only be proven on
 * a real stack, so behaviour is proven by the paired e2e
 * (apps/web/tests/e2e/w9-organization-rls-hardening.spec.ts).
 */

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
function readRepo(rel: string): string {
  return readFileSync(resolve(REPO, rel), "utf8");
}

const MIGRATION =
  "supabase/migrations/20260802170000_organization_rls_hardening_v1.sql";
const ROLLBACK =
  "supabase/rollbacks/20260802170000_organization_rls_hardening_v1.down.sql";

const rawMigration = readRepo(MIGRATION);

/** Executable SQL only, whitespace-normalised. The header prose explains the
 *  very rules we guard, so leaving comments in would create false positives. */
function executable(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase()
    .replace(/[ \t]+/g, " ");
}

const code = executable(rawMigration);
const rollback = executable(readRepo(ROLLBACK));

describe("W9 slice 2 — the migration is definer-safe and self-contained", () => {
  it("defines exactly two new SECURITY DEFINER functions, each with a pinned search_path", () => {
    expect(code).toContain(
      "create or replace function public.belongs_to_organization(org uuid)",
    );
    expect(code).toContain(
      "create or replace function public.search_organizations_directory_v1(p_term text)",
    );
    expect(code.match(/create or replace function/g) ?? []).toHaveLength(2);
    expect(code.match(/security definer/g) ?? []).toHaveLength(2);
    expect(code.match(/set search_path = public/g) ?? []).toHaveLength(2);
  });

  it("revokes PUBLIC + anon and grants EXECUTE to authenticated only", () => {
    for (const sig of [
      "public.belongs_to_organization(org uuid)",
      "public.search_organizations_directory_v1(text)",
    ]) {
      expect(code).toContain(`revoke all on function ${sig} from public`);
      expect(code).toContain(`revoke all on function ${sig} from anon`);
      expect(code).toContain(`grant execute on function ${sig} to authenticated`);
    }
    // Nothing in this migration may be handed to anon.
    expect(code).not.toMatch(/\bto anon\b/);
  });

  it("performs ZERO DML — this is a policy/grant migration", () => {
    expect(code).not.toMatch(/\binsert into\b/);
    expect(code).not.toMatch(/\bdelete from\b/);
    expect(code).not.toMatch(/^\s*update /m);
    expect(code).not.toMatch(/\btruncate\b/);
  });

  it("does NOT self-approve the human gate", () => {
    // Byte-identical to ANNOTATION in .github/scripts/migration-safety.mjs, so
    // this asserts exactly what CI asserts: the marker only counts as a comment
    // line that STARTS with it. The header discusses the marker in prose (to
    // explain why it is absent), which must not read as an approval.
    const ANNOTATION = /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i;
    expect(ANNOTATION.test(rawMigration)).toBe(false);
  });

  it("states that production apply is not authorised by merge", () => {
    expect(rawMigration).toMatch(/PRODUCTION APPLY IS NOT APPROVED/i);
    expect(rawMigration).toContain("PENDING_SEPARATE_OWNER_APPROVAL");
  });

  it("is wrapped in a single transaction", () => {
    expect(code).toMatch(/\bbegin;/);
    expect(code).toMatch(/\bcommit;/);
  });
});

describe("W9 slice 2 — organizations SELECT is scoped", () => {
  it("replaces organizations_select and never restores an unscoped read", () => {
    expect(code).toContain(
      "drop policy if exists organizations_select on public.organizations",
    );
    expect(code).toContain(
      "create policy organizations_select on public.organizations for select",
    );
    // The exact defect being closed. `using (true)` must not survive anywhere
    // in the forward migration.
    expect(code).not.toMatch(/using \(\s*true\s*\)/);
  });

  it("scopes the policy to owner, active member, and admin — and nothing else", () => {
    expect(code).toContain("owner_profile_id = auth.uid()");
    expect(code).toContain("or public.belongs_to_organization(id)");
    expect(code).toContain("or public.is_admin()");
  });

  it("does NOT add a public_profile_enabled arm (no second public org system)", () => {
    // A row-level policy cannot hide individual columns, so a
    // `public_profile_enabled = true` arm would expose legal_name, vat_number
    // and owner_profile_id for every published org. The public contract is the
    // allowlisted SECURITY DEFINER reader from 20260719120000.
    expect(code).not.toContain("public_profile_enabled");
  });

  it("keys membership on ACTIVE engagements so W9 slice 1 revocation propagates", () => {
    const fn = code.slice(
      code.indexOf("create or replace function public.belongs_to_organization"),
      code.indexOf("revoke all on function public.belongs_to_organization"),
    );
    expect(fn).toContain("ec.profile_id = auth.uid()");
    expect(fn).toContain("ec.status = 'active'");
    // Membership, NOT authority: the role filter that makes
    // manages_organization() manager-only must not be copied in here.
    expect(fn).not.toContain("relationship_slug");
  });

  it("leaves organizations_write_admin and the mirror triggers untouched", () => {
    expect(code).not.toContain("organizations_write_admin");
    expect(code).not.toContain("mirror_company_to_org");
    expect(code).not.toContain("mirror_agency_to_org");
    expect(code).not.toContain("ensure_org_owner_engagement");
  });
});

describe("W9 slice 2 — the directory RPC is minimum-width", () => {
  const fn = code.slice(
    code.indexOf(
      "create or replace function public.search_organizations_directory_v1",
    ),
    code.indexOf("revoke all on function public.search_organizations_directory_v1"),
  );

  it("returns only id, display name, organization_type and country", () => {
    const signature = fn.slice(0, fn.indexOf("language sql"));
    expect(signature).toContain("id uuid");
    expect(signature).toContain("display_name text");
    expect(signature).toContain("organization_type text");
    expect(signature).toContain("country text");
    // The fields the P0 was actually about must never be in the projection.
    for (const leaked of [
      "owner_profile_id",
      "vat_number",
      "public_contact_email",
      "public_contact_phone",
      "trust_score",
      "legacy_company_id",
      "legacy_agency_id",
    ]) {
      expect(fn).not.toContain(leaked);
    }
  });

  it("never returns legal_name as its own column (display fallback only)", () => {
    const signature = fn.slice(0, fn.indexOf("language sql"));
    expect(signature).not.toContain("legal_name");
    // It may still be MATCHED against and coalesced into the display name.
    expect(fn).toContain("o.legal_name");
  });

  it("bounds the term and the result set so it cannot be a full dump", () => {
    expect(fn).toMatch(/char_length\(t\.term\) >= 2/);
    expect(fn).toMatch(/left\(coalesce\(p_term, ''\), 80\)/);
    expect(fn).toMatch(/limit 20/);
    expect(fn).toContain("regexp_replace");
  });
});

describe("W9 slice 2 — engagement_contexts writes are RPC-only", () => {
  it("removes the self-write arm from the write policy", () => {
    expect(code).toContain(
      "drop policy if exists engagement_contexts_write on public.engagement_contexts",
    );
    expect(code).toContain(
      "create policy engagement_contexts_write on public.engagement_contexts for all",
    );
    const policy = code.slice(
      code.indexOf(
        "create policy engagement_contexts_write on public.engagement_contexts",
      ),
    );
    const body = policy.slice(0, policy.indexOf("revoke insert"));
    expect(body).toContain("using (public.is_admin())");
    expect(body).toContain("with check (public.is_admin())");
    // The escalation vector: a user writing their OWN membership row.
    expect(body).not.toContain("profile_id = auth.uid()");
  });

  it("revokes DML from authenticated and anon (belt and braces)", () => {
    expect(code).toContain(
      "revoke insert, update, delete on public.engagement_contexts from authenticated",
    );
    expect(code).toContain(
      "revoke insert, update, delete on public.engagement_contexts from anon",
    );
    // SELECT is NOT revoked — reading your own memberships was never the bug.
    expect(code).not.toMatch(/revoke[^;]*\bselect\b[^;]*engagement_contexts/);
  });

  it("leaves engagement_contexts_select untouched", () => {
    expect(code).not.toContain("engagement_contexts_select");
  });
});

describe("W9 slice 2 — the rollback restores the exact prior state", () => {
  it("restores both 0013 policies verbatim", () => {
    expect(rollback).toContain(
      "create policy organizations_select on public.organizations for select using (true)",
    );
    expect(rollback).toContain(
      "create policy engagement_contexts_write on public.engagement_contexts for all",
    );
    expect(rollback).toContain("using (profile_id = auth.uid() or is_admin())");
  });

  it("drops both new functions", () => {
    expect(rollback).toContain(
      "drop function if exists public.search_organizations_directory_v1(text)",
    );
    expect(rollback).toContain(
      "drop function if exists public.belongs_to_organization(uuid)",
    );
  });

  it("does NOT re-grant DML that 0013 never granted", () => {
    expect(rollback).not.toMatch(/grant[^;]*\binsert\b[^;]*engagement_contexts/);
    expect(rollback).not.toMatch(/grant[^;]*\bupdate\b[^;]*engagement_contexts/);
    expect(rollback).not.toMatch(/grant[^;]*\bdelete\b[^;]*engagement_contexts/);
  });

  it("warns in prose that running it re-opens the P0", () => {
    const prose = readRepo(ROLLBACK);
    expect(prose).toMatch(/re-?open/i);
  });
});

describe("W9 slice 2 — the app reads the directory through the RPC", () => {
  const network = readRepo("apps/web/lib/invitations/network.ts");

  it("calls search_organizations_directory_v1 from the network search", () => {
    expect(network).toContain('rpc("search_organizations_directory_v1"');
    expect(network).toContain("searchOrganizationsDirectory");
  });

  it("falls back to the table read ONLY on 42883 (migration not applied)", () => {
    expect(network).toContain('UNDEFINED_FUNCTION_CODE = "42883"');
    const fn = network.slice(
      network.indexOf("async function searchOrganizationsDirectory"),
    );
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain("UNDEFINED_FUNCTION_CODE");
    // A non-42883 error must surface, not silently degrade to the wide read.
    expect(body).toMatch(/!==\s*UNDEFINED_FUNCTION_CODE/);
  });

  it("no longer selects org columns the directory must not expose", () => {
    const fn = network.slice(
      network.indexOf("export async function searchPeopleAndCompanies"),
    );
    const body = fn.slice(0, fn.indexOf("\n}"));
    for (const leaked of [
      "owner_profile_id",
      "vat_number",
      "public_contact_email",
      "public_contact_phone",
      "trust_score",
    ]) {
      expect(body).not.toContain(leaked);
    }
  });
});
