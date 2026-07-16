import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * TEAMS / BRIGADES LAYER guards (product-tree branch 13, train §8.3).
 *
 * The wagon rule (reality-map 2026-07-05 row 5): "team identity on
 * organizations + membership via engagement_contexts + capability summary" —
 * build ON the existing org spine, never a parallel team subsystem. These
 * pins keep that true:
 *
 *   - ADDITIVE-ONLY migration: the organization_type check is widened to a
 *     strict superset (the 20260612090000 company_type precedent); no new
 *     table, no new column, no RLS/policy/table-grant change.
 *   - ONLY NEW RPCs: create_team_v1 + get_team_capability_summary_v1 are
 *     brand-new names — the migration recreates NO existing RPC, so the
 *     ROLLBACK-CHAIN RULE is satisfied structurally: the down file restores
 *     no function body (there is none to restore) and must contain no
 *     create-function at all.
 *   - MEMBERSHIP ONLY VIA engagement_contexts: team membership is written by
 *     the EXISTING canonical add_org_member RPC (20260530140000); the
 *     migration adds no membership write and the app adds no direct
 *     engagement insert.
 *   - CAPABILITY SUMMARY READ-ONLY from real worker_skills rows — honest
 *     counts (declared vs manager-confirmed), never a team rating.
 *   - Honest degradation pre-apply (probe → existing roster empty state).
 *   - i18n en/lt/ru presence for the new namespace.
 */

const APP = join(process.cwd());
const REPO = join(APP, "..", "..");
const MIGRATIONS_DIR = join(REPO, "supabase", "migrations");
const MIGRATION_FILE = "20260705220000_team_brigade_org_spine.sql";
const MIGRATION = `supabase/migrations/${MIGRATION_FILE}`;
const ROLLBACK = "supabase/rollbacks/20260705220000_team_brigade_org_spine.down.sql";

const NEW_FUNCTIONS = ["create_team_v1", "get_team_capability_summary_v1"];

const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const readWeb = (rel: string) => readFileSync(join(APP, rel), "utf8");
// CRLF-safe comment strip — prose comments may legitimately DISCUSS banned
// shapes; only executable SQL is checked.
const stripSql = (src: string) =>
  src
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

const enumListOf = (sqlFragment: string): string[] =>
  [...sqlFragment.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

describe("teams migration — additive typed rows on the EXISTING organizations table", () => {
  const migration = read(MIGRATION);
  const code = stripSql(migration);

  it("widens organization_type to a strict superset (company_type precedent)", () => {
    // Original 0013 inline check.
    const original = stripSql(read("supabase/migrations/0013_work_journal_m1.sql")).match(
      /organization_type text not null check \(organization_type in \(([^)]*)\)\)/i,
    );
    expect(original, "0013 original check must exist").toBeTruthy();
    const originalValues = enumListOf((original as RegExpMatchArray)[1]);
    expect([...originalValues].sort()).toEqual(["agency", "company", "other"]);

    // Widened constraint in this migration.
    const widened = code.match(
      /add constraint organizations_organization_type_check\s+check \(organization_type in \(([^)]*)\)\)/i,
    );
    expect(widened, "widened check must exist").toBeTruthy();
    const widenedValues = enumListOf((widened as RegExpMatchArray)[1]);
    // Strict superset: every previously valid value stays valid…
    for (const v of originalValues) {
      expect(widenedValues, `widened check must keep '${v}'`).toContain(v);
    }
    // …and exactly ONE new typed value is added: 'team'.
    expect([...widenedValues].sort()).toEqual(["agency", "company", "other", "team"]);
  });

  it("adds NO table, NO column, NO policy change, NO table grant", () => {
    expect(code).not.toMatch(/create table/i);
    expect(code).not.toMatch(/add column/i);
    expect(code).not.toMatch(/drop table/i);
    expect(code).not.toMatch(/drop column/i);
    expect(code).not.toMatch(/create policy|alter policy|drop policy/i);
    expect(code).not.toMatch(/enable row level security/i);
    // Only function-execute grants — never a table grant, never anon/public.
    expect(code).not.toMatch(/grant (select|insert|update|delete|all)/i);
    expect(code).toMatch(/grant execute on function[\s\S]{0,120}to authenticated/i);
    expect(code).not.toMatch(/\bto anon\b|\bto public\b/i);
  });

  it("creates ONLY the two brand-new functions (no existing RPC recreated)", () => {
    const created = [
      ...code.matchAll(/create (?:or replace )?function public\.([a-z0-9_]+)/gi),
    ].map((m) => m[1]);
    expect([...created].sort()).toEqual([...NEW_FUNCTIONS].sort());
  });

  it("both function names are NEW to the repo — never defined by a prior migration", () => {
    const others = readdirSync(MIGRATIONS_DIR).filter(
      (f) => f.endsWith(".sql") && f !== MIGRATION_FILE,
    );
    expect(others.length).toBeGreaterThan(100);
    for (const f of others) {
      const src = read(`supabase/migrations/${f}`);
      for (const fn of NEW_FUNCTIONS) {
        expect(src, `${f} must not define ${fn}`).not.toContain(fn);
      }
    }
  });

  it("adds NO membership write — engagement_contexts stays the add_org_member spine", () => {
    // The migration never inserts an engagement row itself: the creator's
    // 'owner' engagement comes from the EXISTING 0035 trigger, members come
    // from the EXISTING add_org_member RPC.
    expect(code).not.toMatch(/insert into public\.engagement_contexts/i);
    expect(code).not.toMatch(/add_team_member|team_members|create table.*member/i);
    // No new relationship_types slug either — membership reuses 'employee'.
    expect(code).not.toMatch(/insert into public\.relationship_types/i);
    // add_org_member itself is untouched.
    expect(code).not.toMatch(/add_org_member/i);
  });

  it("writes ONLY the team org row + its audit row (no update/delete anywhere)", () => {
    const inserts = [...code.matchAll(/insert into public\.([a-z_]+)/gi)].map(
      (m) => m[1],
    );
    expect([...inserts].sort()).toEqual(["audit_logs", "organizations"]);
    expect(code).not.toMatch(/\bupdate public\./i);
    expect(code).not.toMatch(/\bdelete from\b/i);
  });

  it("capability summary is READ-ONLY over members' existing worker_skills rows", () => {
    expect(code).toMatch(/function public\.get_team_capability_summary_v1/i);
    expect(code).toMatch(/\bstable\b/i);
    // Derived from the real spine: engagements → workers → worker_skills → skills.
    expect(code).toMatch(/join public\.workers w\s+on w\.profile_id = ec\.profile_id/i);
    expect(code).toMatch(/join public\.worker_skills ws on ws\.worker_id = w\.id/i);
    expect(code).toMatch(/join public\.skills s\s+on s\.id = ws\.skill_id/i);
    // Honest counts: declared = distinct members; confirmed = the EXISTING
    // manager-review flag (worker_skills.verified) — never a fabricated tier.
    expect(code).toMatch(/count\(distinct w\.id\)::integer as members_declared/i);
    expect(code).toMatch(
      /count\(distinct w\.id\) filter \(where ws\.verified\)::integer/i,
    );
    // Authority gate: admin / team owner / manages_organization — else empty.
    expect(code).toMatch(/public\.manages_organization\(p_org_id\)/);
    expect(code).toMatch(/public\.is_admin\(\)/);
    // Membership definition is the canonical active employee engagement.
    expect(code).toMatch(/ec\.relationship_slug = 'employee'/);
    expect(code).toMatch(/ec\.status = 'active'/);
  });

  it("create_team_v1 stays gated, capped and honest", () => {
    // Only an existing org owner (or admin) may create; name is validated;
    // an abuse cap bounds row minting.
    expect(code).toMatch(/organization_type <> 'team'/);
    expect(code).toMatch(/'not_allowed'/);
    expect(code).toMatch(/'invalid_team_name'/);
    expect(code).toMatch(/'team_limit_reached'/);
    expect(code).toMatch(/>= 20/);
    // The inserted row is typed 'team' and owned by the caller.
    expect(code).toMatch(
      /insert into public\.organizations\s*\(owner_profile_id, organization_type, display_name\)/i,
    );
    expect(code).toMatch(/\(uid, 'team', cleaned_name\)/i);
    // Audit trail on the existing append-only audit_logs.
    expect(code).toMatch(/insert into public\.audit_logs/i);
  });

  it("is a human-gated DRAFT (owner-gated prod apply, never db push)", () => {
    expect(migration).toMatch(/--\s*@human-gate-approved/);
    expect(migration).toMatch(/needs-human-gate/);
    expect(migration).toMatch(/DO NOT APPLY automatically/i);
    expect(migration).toMatch(/security definer/i);
    expect(migration).toMatch(/set search_path = public/i);
    expect(migration).toMatch(/revoke all on function/i);
  });
});

describe("teams rollback chain — nothing recreated, nothing stale to restore", () => {
  const down = read(ROLLBACK);
  const downCode = stripSql(down);

  it("the down file exists and restores the ORIGINAL 0013 constraint verbatim", () => {
    expect(existsSync(join(REPO, ROLLBACK))).toBe(true);
    const restored = downCode.match(
      /add constraint organizations_organization_type_check\s+check \(organization_type in \(([^)]*)\)\)/i,
    );
    expect(restored, "restored check must exist").toBeTruthy();
    // VERBATIM the pre-wagon value set — 'team' gone, nothing else changed.
    expect(enumListOf((restored as RegExpMatchArray)[1])).toEqual([
      "company",
      "agency",
      "other",
    ]);
  });

  it("ROLLBACK-CHAIN RULE: no existing RPC was recreated, so the down file restores NO function body", () => {
    // If this wagon HAD recreated an existing RPC, the down file would need
    // that RPC's CURRENT repo-latest body verbatim. It did not — so the down
    // file must contain zero create-function statements (a stale-body restore
    // is impossible by construction).
    expect(downCode).not.toMatch(/create (or replace )?function/i);
    expect(downCode).not.toMatch(/create (or replace )?trigger/i);
    // Existing spine functions are untouched in both directions.
    for (const untouched of [
      "add_org_member",
      "manages_organization",
      "ensure_org_owner_engagement",
      "list_open_demand_for_workers",
    ]) {
      expect(downCode, `down must not touch ${untouched}`).not.toContain(untouched);
    }
  });

  it("drops ONLY the two new functions and removes ONLY feature-created 'team' rows", () => {
    const drops = [
      ...downCode.matchAll(/drop function if exists public\.([a-z0-9_]+)/gi),
    ].map((m) => m[1]);
    expect([...drops].sort()).toEqual([...NEW_FUNCTIONS].sort());
    // Row removal is scoped to organization_type='team' — never a blanket
    // delete on the spine tables.
    const deletes = [...downCode.matchAll(/delete from public\.([a-z_]+)/gi)].map(
      (m) => m[1],
    );
    expect([...deletes].sort()).toEqual(["engagement_contexts", "organizations"]);
    expect(downCode).toMatch(
      /delete from public\.organizations o\s+where o\.organization_type = 'team'/i,
    );
    expect(downCode).toMatch(/organization_type = 'team'[\s\S]*\)/i);
    expect(downCode).not.toMatch(/drop table/i);
    expect(downCode).not.toMatch(/drop column/i);
  });
});

describe("app surface — reuse of the existing spine, no parallel team system", () => {
  const lib = readWeb("lib/company/team-brigades.ts");
  const panel = readWeb("components/app/team-brigades-panel.tsx");
  const page = readWeb("app/[locale]/dashboard/company/page.tsx");

  it("CONSENT (Trust Connect v1): membership arrives ONLY via a join_team invitation — no direct add remains", () => {
    // The former direct addOrgMember call was a consent bypass: the owner
    // could mint an engagement for a worker who never agreed. The panel now
    // sends a canonical join_team invitation instead; the worker's OWN accept
    // (accept_invitation_v1) creates the engagement.
    expect(panel).not.toMatch(/addOrgMember/);
    expect(panel).toMatch(/inviteWorkerToTeamAction/);
    const actions = readWeb("lib/company/team-brigade-actions.ts");
    expect(actions).not.toMatch(/addOrgMember/);
    expect(actions).toMatch(/invitationType: "join_team"/);
    expect(actions).toMatch(/createAndSendInvitations/);
    // No direct engagement writes and no bespoke membership RPC app-side.
    expect(lib).not.toMatch(/\.insert\(/);
    expect(lib).not.toMatch(/\.update\(/);
    expect(lib).not.toMatch(/\.delete\(/);
    expect(lib).not.toMatch(/add_team_member/);
    expect(panel).not.toMatch(/add_team_member/);
    // The invitee's email / invite link never reach the client from this
    // surface — the action returns only a closed outcome vocabulary.
    expect(actions).not.toMatch(/inviteLink/);
    expect(actions).not.toMatch(/first\?\.email/);
  });

  it("membership provenance is derived from the real invitations ledger, never invented", () => {
    // 'invited' comes ONLY from an accepted join_team invitation row;
    // pre-existing members read as 'direct'; a missing invitations model
    // reads as 'unknown' — no fake consent history for old rows.
    expect(lib).toMatch(/"invited" \| "direct" \| "unknown"/);
    expect(lib).toMatch(/\.eq\("invitation_type", "join_team"\)/);
    expect(lib).toMatch(/accepted_by_profile_id/);
    expect(lib).not.toMatch(/provenance:\s*"invited",/);
  });

  it("reads ride the EXISTING tables — organizations / engagement_contexts / company_workers", () => {
    expect(lib).toMatch(/\.from\("organizations"\)/);
    expect(lib).toMatch(/\.eq\("organization_type", "team"\)/);
    expect(lib).toMatch(/\.from\("engagement_contexts"\)/);
    expect(lib).toMatch(/\.eq\("relationship_slug", "employee"\)/);
    expect(lib).toMatch(/\.from\("company_workers"\)/);
    // No parallel team tables anywhere on the read path.
    expect(lib).not.toMatch(/\.from\("teams?"\)/);
    expect(lib).not.toMatch(/\.from\("team_members"\)/);
  });

  it("degrades honestly pre-apply: probe → existing roster empty state, nothing faked", () => {
    expect(lib).toMatch(/get_team_capability_summary_v1/);
    expect(lib).toMatch(/RPC_NOT_FOUND_CODE = "42883"/);
    expect(lib).toMatch(/applied: false/);
    expect(page).toMatch(/teamBrigades\.applied \?/);
    expect(page).toMatch(/<TeamRosterEmptyState variant="company" \/>/);
    expect(page).toMatch(/<TeamBrigadesPanel/);
    expect(page).toMatch(/teams=\{teamBrigades\.teams\}/);
    // Trust Connect layers degrade independently and honestly.
    expect(page).toMatch(/invitationsApplied=\{teamBrigades\.invitationsApplied\}/);
    expect(page).toMatch(/detailsApplied=\{teamBrigades\.detailsApplied\}/);
    expect(page).toMatch(/enquiriesApplied=\{teamBrigades\.enquiriesApplied\}/);
  });

  it("capability chips are honest counts with the disclaimer, labels from the EXISTING skillNames catalogue", () => {
    expect(panel).toMatch(/useTranslations\("skillNames"\)/);
    expect(panel).toMatch(/tSkill\.has\(slug\) \? tSkill\(slug\) : slug/);
    expect(panel).toMatch(/t\("honestNote"\)/);
    expect(panel).toMatch(/t\("capabilityEmpty"\)/);
    // Never a fabricated summary: null/empty renders the empty copy.
    expect(panel).toMatch(
      /team\.capability === null \|\| team\.capability\.length === 0/,
    );
  });
});

describe("i18n — teamBrigades + teamEnquiries namespaces present in every ACTIVE locale", () => {
  for (const locale of ["en", "lt", "ru", "nl", "de"]) {
    it(`${locale} carries the full teamBrigades catalogue`, () => {
      const messages = JSON.parse(readWeb(`messages/${locale}.json`));
      const ns = messages.teamBrigades;
      expect(ns, `${locale} teamBrigades namespace`).toBeTruthy();
      for (const key of [
        "title",
        "intro",
        "honestNote",
        "noTeams",
        "memberCount",
        "noMembers",
        "capabilityHeading",
        "capabilityEmpty",
        "declaredShort",
        "confirmedShort",
        "noAddable",
        "addLabel",
        "addButton",
        "consentNote",
        "inviteNotEnabled",
        "invitePendingOption",
        "createLabel",
        "createPlaceholder",
        "createButton",
        "creating",
      ]) {
        expect(String(ns[key] ?? "").length, `${locale} teamBrigades.${key}`).toBeGreaterThan(0);
      }
      for (const key of [
        "created",
        "invalidName",
        "notAllowed",
        "limitReached",
        "needsMigration",
        "error",
      ]) {
        expect(
          String(ns.outcome?.[key] ?? "").length,
          `${locale} teamBrigades.outcome.${key}`,
        ).toBeGreaterThan(0);
      }
      // The direct-add outcome catalogue is GONE with the consent bypass.
      expect(ns.memberOutcome, `${locale} memberOutcome removed`).toBeUndefined();
      for (const key of [
        "sent",
        "created",
        "deliveryFailed",
        "alreadyInvited",
        "rateLimited",
        "notAuthorized",
        "noEmail",
        "needsMigration",
        "error",
      ]) {
        expect(
          String(ns.inviteOutcome?.[key] ?? "").length,
          `${locale} teamBrigades.inviteOutcome.${key}`,
        ).toBeGreaterThan(0);
      }
      for (const key of ["invited", "direct"]) {
        expect(
          String(ns.provenance?.[key] ?? "").length,
          `${locale} teamBrigades.provenance.${key}`,
        ).toBeGreaterThan(0);
      }
      for (const key of ["heading", "notSet", "from", "accommodationNeeded", "ownTransport", "maxTripDays"]) {
        expect(
          String(ns.availability?.[key] ?? "").length,
          `${locale} teamBrigades.availability.${key}`,
        ).toBeGreaterThan(0);
      }
      for (const key of ["heading", "empty", "notEnabled", "accept", "decline", "dates"]) {
        expect(
          String(ns.enquiries?.[key] ?? "").length,
          `${locale} teamBrigades.enquiries.${key}`,
        ).toBeGreaterThan(0);
      }
      for (const key of ["created", "accepted", "declined", "withdrawn", "expired", "other"]) {
        expect(
          String(ns.enquiries?.status?.[key] ?? "").length,
          `${locale} teamBrigades.enquiries.status.${key}`,
        ).toBeGreaterThan(0);
      }
      expect(String(ns.details?.heading ?? "").length).toBeGreaterThan(0);
      expect(String(ns.details?.notEnabled ?? "").length).toBeGreaterThan(0);
      // The roster empty state (pre-apply fallback) stays intact.
      expect(String(messages.teamRosterEmpty?.company?.title ?? "").length).toBeGreaterThan(0);
    });

    it(`${locale} carries the employer-side teamEnquiries catalogue`, () => {
      const messages = JSON.parse(readWeb(`messages/${locale}.json`));
      const ns = messages.teamEnquiries;
      expect(ns, `${locale} teamEnquiries namespace`).toBeTruthy();
      for (const key of [
        "enquireButton",
        "formIntro",
        "messageLabel",
        "startLabel",
        "endLabel",
        "submit",
        "sending",
        "cancel",
        "notEnabled",
        "dates",
        "withdraw",
      ]) {
        expect(String(ns[key] ?? "").length, `${locale} teamEnquiries.${key}`).toBeGreaterThan(0);
      }
      for (const key of [
        "created",
        "duplicateOpen",
        "ownTeam",
        "contactDetails",
        "messageRequired",
        "messageTooLong",
        "invalidDates",
        "rateLimited",
        "error",
      ]) {
        expect(
          String(ns.outcome?.[key] ?? "").length,
          `${locale} teamEnquiries.outcome.${key}`,
        ).toBeGreaterThan(0);
      }
      for (const key of ["created", "accepted", "declined", "withdrawn", "expired", "other"]) {
        expect(
          String(ns.status?.[key] ?? "").length,
          `${locale} teamEnquiries.status.${key}`,
        ).toBeGreaterThan(0);
      }
      expect(String(ns.withdrawOutcome?.withdrawn ?? "").length).toBeGreaterThan(0);
      expect(String(ns.myList?.empty ?? "").length).toBeGreaterThan(0);
      expect(
        String(messages.network?.teamEnquiriesTitle ?? "").length,
        `${locale} network.teamEnquiriesTitle`,
      ).toBeGreaterThan(0);
    });
  }
});
