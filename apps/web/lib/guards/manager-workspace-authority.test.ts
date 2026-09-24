import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales, locales } from "@/lib/i18n/config";
import { MEMBERSHIP_OUTCOME_KEYS } from "@/lib/company/membership-labels";
import { MEMBERSHIP_ROLES } from "@/lib/company/memberships";
import { SPINE_SIGNALS } from "@/lib/notifications/spine-signals";

/**
 * MANAGER ROLE — READ authority split from EDIT authority; members and
 * invitations live in Settings (capability matrix P1, 2026-09-23).
 *
 * Source pins for what the unit tests cannot see: which surfaces take which
 * access mode, where the governance surfaces are mounted, that the labels
 * come from the catalogue in every locale, and that the manager's refused
 * writes are named. Every pin has a negative control so a gutted file cannot
 * pass by absence.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8");
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/** Doors and pages that only READ the company: the OPEN access mode. */
const READ_SITES = [
  "lib/company/organization-doors.ts",
  "app/[locale]/dashboard/company/page.tsx",
  "app/[locale]/dashboard/company/settings/page.tsx",
  "app/[locale]/dashboard/company/people/page.tsx",
  "app/[locale]/dashboard/company/needs/page.tsx",
  "app/[locale]/dashboard/company/partners/page.tsx",
  "app/[locale]/dashboard/company/education/page.tsx",
  "lib/conversation/starter-signals.ts",
  "lib/conversation/agency-workspace.ts",
];

/** Surfaces that WRITE company identity: the GOVERN access mode stays. */
const WRITE_SITES = [
  "lib/company/organization-rename.ts",
  "app/[locale]/dashboard/start/company/page.tsx",
];

describe("READ ≠ EDIT — one implementation, two access modes", () => {
  const setup = code(read("lib/company/company-setup.ts"));

  it("the by-id read is ONE function whose membership filter follows the access mode", () => {
    expect(setup).toMatch(/export async function readCompanyByIdForAccess\(/);
    expect(setup).toMatch(/\.in\("role", \[\.\.\.rolesForAccess\(access\)\]\)/);
    // The old literal owner/admin list is gone from the read (it lives in
    // the pure projection now); the two wrappers delegate.
    expect(setup).not.toMatch(/\.in\("role", \["owner", "admin"\]\)/);
    expect(setup).toMatch(/return readCompanyByIdForAccess\(companyId, "govern"\)/);
    expect(setup).toMatch(/return readCompanyByIdForAccess\(companyId, "open"\)/);
  });

  it.each(READ_SITES)("%s reads with OPEN access (a manager opens it)", (rel) => {
    const src = code(read(rel));
    expect(src).toMatch(/getAccessibleCompanyById/);
    expect(src).not.toMatch(/\bgetOwnedCompanyById\b/);
  });

  it.each(WRITE_SITES)("%s keeps the GOVERN read (owner/admin; SQL re-checks)", (rel) => {
    const src = code(read(rel));
    expect(src).toMatch(/\bgetOwnedCompanyById\b/);
    expect(src).not.toMatch(/getAccessibleCompanyById/);
  });

  it("saveCompanySetup's lock read stays on the govern mode", () => {
    expect(setup).toMatch(/\? await getOwnedCompanyById\(input\.companyId\)/);
  });
});

describe("the company gate's membership arm — layout, page gate, dispatcher", () => {
  it("the dispatcher's held roles carry `company` from the ACTIVE workspace", () => {
    const src = code(read("lib/conversation/dispatch.ts"));
    expect(src).toMatch(/if \(workspaceOpensCompanySpace\(workspace\)\) set\.add\("company"\)/);
    // Both entry points resolve the workspace BEFORE authorization.
    const prepare = src.indexOf("export async function prepareConfirmationAction");
    const dispatch = src.indexOf("export async function dispatchWorkerAction");
    for (const start of [prepare, dispatch]) {
      const body = src.slice(start, start + 1600);
      const wsAt = body.indexOf("await getWorkspaceContext()");
      const authzAt = body.indexOf("authorizeDispatch(");
      expect(wsAt).toBeGreaterThan(-1);
      expect(authzAt).toBeGreaterThan(wsAt);
      expect(body).toMatch(/heldRolesOf\(supabase, user\.id, ws\)/);
    }
  });

  it("the Work door admits the employer context, not only the acting identity", () => {
    const src = code(read("app/[locale]/dashboard/projects/page.tsx"));
    expect(src).toMatch(/if \(!MANAGER_ROLES\.has\(role\) && employerCtx\?\.kind !== "ok"\)/);
    // ONE resolver call — the second read is gone.
    expect(src.match(/await resolveEmployerCompanyContext\(\)/g)).toHaveLength(1);
  });

  it("the Work door decides the branch from the ONE workspace context before any employer read", () => {
    // Re-anchored (review P2 on #1859, 2026-09-24): the employer resolver
    // costs three organization reads, and it used to run for EVERY visitor —
    // a plain worker in an employee workspace paid them only to be refused.
    // The branch is decided from the request-cached `getWorkspaceContext()`
    // (the shell's read; `cache()` makes it free here) through the same pure
    // gate rule everywhere else uses, and the resolver runs only when that
    // rule (or the acting identity) opens the company space.
    const src = code(read("app/[locale]/dashboard/projects/page.tsx"));
    expect(src).toMatch(/const workspace = await getWorkspaceContext\(\);/);
    expect(src).toMatch(
      /MANAGER_ROLES\.has\(role\) \|\| workspaceOpensCompanySpace\(workspace\)\s*\?\s*await resolveEmployerCompanyContext\(\)\s*:\s*null/,
    );
    // Order: the workspace decision precedes the employer read, and both
    // precede the worker branch.
    const workspaceAt = src.indexOf("await getWorkspaceContext()");
    const resolverAt = src.indexOf("await resolveEmployerCompanyContext()");
    const branchAt = src.indexOf('employerCtx?.kind !== "ok"');
    expect(workspaceAt).toBeGreaterThan(-1);
    expect(resolverAt).toBeGreaterThan(workspaceAt);
    expect(branchAt).toBeGreaterThan(resolverAt);
    // NEGATIVE CONTROL: the unconditional shape — every visitor pays the
    // three reads — is exactly what this pin keeps out.
    expect(src).not.toMatch(/const employerCtx = await resolveEmployerCompanyContext\(\)/);
    // The resolver takes no identity of its own (W9), and the page never
    // narrows by organization type: an agency owner opens the Work door too.
    expect(src).not.toMatch(/getWorkspaceContext\([^)]/);
    expect(src).not.toMatch(/organizationType/);
  });

  it("nothing writes profile_roles from the client to make the gate pass", () => {
    for (const rel of [
      "lib/auth/require-role.ts",
      "app/[locale]/dashboard/layout.tsx",
      "lib/conversation/dispatch.ts",
      "lib/company/organization-authority.ts",
    ]) {
      const src = code(read(rel));
      expect(src, rel).not.toMatch(/from\("profile_roles"\)[\s\S]{0,240}?\.(insert|upsert|update|delete)\(/);
    }
    // The pure projection stays pure: no IO, no client.
    const pure = code(read("lib/company/organization-authority.ts"));
    expect(pure).not.toMatch(/server-only|createClient|supabase/);
  });
});

describe("members and invitations live in Settings; the hub keeps the invitee's panel", () => {
  const settings = code(read("app/[locale]/dashboard/company/settings/page.tsx"));
  const hub = code(read("app/[locale]/dashboard/start/page.tsx"));

  it("Settings mounts BOTH governance surfaces with catalogue labels", () => {
    expect(settings).toMatch(/<OrganizationMembersSection\b/);
    expect(settings).toMatch(/<MembershipInvitationsPanel\b/);
    expect(settings).toMatch(/getMembershipLabels\(\)/);
    expect(settings).toMatch(/id="organization-members"/);
    // A failed directory read is said, not rendered as "no members" (SEP-7).
    expect(settings).toMatch(/org-members-unavailable/);
  });

  it("Settings keys the directory on the ACTIVE workspace's membership (a member keeps it)", () => {
    expect(settings).toMatch(/activeOrganizationAuthority\(workspace\)/);
    expect(settings).toMatch(/memberOrgId \? listOrganizationMembers\(memberOrgId\)/);
    // Rendered in the no-company branch too — the employer context fails
    // closed for a member, the directory must not.
    const noCompany = settings.slice(settings.indexOf("if (!companyRow)"), settings.indexOf("const orgContext"));
    expect(noCompany).toMatch(/\{membershipSections\}/);
  });

  it("the hub no longer mounts the directory and points at Settings", () => {
    expect(hub).not.toMatch(/<OrganizationMembersSection\b/);
    expect(hub).not.toMatch(/listOrganizationMembers/);
    expect(hub).toMatch(/<MembershipInvitationsPanel\b/);
    expect(hub).toMatch(/\/dashboard\/company\/settings#organization-members/);
    expect(hub).toMatch(/org-members-open-settings/);
  });

  it("no inline LT/EN membership labels survive on the hub", () => {
    for (const literal of ["Savininkas", "Pakvietimas išsiųstas", "Organizacijos nariai", "Pakviesti narį"]) {
      expect(hub, literal).not.toContain(literal);
    }
    expect(hub).not.toMatch(/roleLabels\s*:\s*Record<MembershipRole/);
  });

  it("the labels helper covers every role and every command outcome", () => {
    expect([...MEMBERSHIP_ROLES].sort()).toEqual(
      ["admin", "external_manager", "manager", "member", "owner"],
    );
    const actions = code(read("lib/company/membership-actions.ts"));
    const memberships = code(read("lib/company/memberships.ts"));
    // Every outcome the commands and the actions can answer with has a key.
    const outcomes = [...memberships.matchAll(/^\s*\| "([a-z_]+)"$/gm)].map((m) => m[1]);
    for (const o of outcomes) expect(MEMBERSHIP_OUTCOME_KEYS, o).toContain(o);
    for (const o of ["no_workspace", "needs_migration", "invalid", "error"]) {
      expect(actions).toContain(`"${o}"`);
      expect(MEMBERSHIP_OUTCOME_KEYS).toContain(o);
    }
  });
});

describe("the manager's refused write is NAMED (never a generic error)", () => {
  it("both project-create paths map 42501 to not_authorized", () => {
    const context = code(read("lib/company/project-context-actions.ts"));
    expect(context).toMatch(/created\.code === "42501"\) return \{ ok: false, code: "not_authorized" \}/);
    const inline = code(read("lib/projects/actions.ts"));
    expect(inline).toMatch(/created\.code === "42501"\) return \{ ok: false, code: "not_authorized" \}/);
  });

  it("the create form renders the owner/admin sentence for not_authorized", () => {
    const form = code(read("components/app/project-context-create-form.tsx"));
    expect(form).toMatch(/state\.code === "not_authorized"\s*\?\s*t\("errorNotAuthorized"\)/);
    const projects = code(read("app/[locale]/dashboard/projects/page.tsx"));
    expect(projects).toMatch(/createNotAuthorized: tOps\("createProject\.errorNotAuthorized"\)/);
  });

  it("the manager-scope notice renders from the pure projection, on the operating doors", () => {
    const notice = code(read("components/app/organization/manager-scope-notice.tsx"));
    expect(notice).toMatch(/operationalWritesNeedGrant\(projectOrganizationAuthority\(\{ role \}\)\)/);
    for (const rel of [
      "app/[locale]/dashboard/company/page.tsx",
      "app/[locale]/dashboard/company/people/page.tsx",
      "app/[locale]/dashboard/projects/page.tsx",
    ]) {
      expect(code(read(rel)), rel).toMatch(/<ManagerScopeNotice role=\{employerCtx\??\.role\}/);
    }
  });

  it("the notice yields to the platform-admin dual signal, read AFTER the projection", () => {
    // Review P2 on #1859: `is_admin()` admits an admin's project writes and
    // roster read, so the sentence was false for a manager who is also a
    // platform admin. The signal is the shell's own derivation
    // (`getSessionIsAdmin` → `deriveIsAdmin`), consulted only once the pure
    // projection says the notice would otherwise render — never a second
    // workspace read (W9), never a `profile_roles` re-implementation here.
    const notice = code(read("components/app/organization/manager-scope-notice.tsx"));
    expect(notice).toMatch(/if \(await getSessionIsAdmin\(\)\) return null;/);
    const projectionAt = notice.indexOf("operationalWritesNeedGrant(");
    const adminAt = notice.indexOf("await getSessionIsAdmin()");
    expect(projectionAt).toBeGreaterThan(-1);
    expect(adminAt, "the roles read comes after the pure decision").toBeGreaterThan(projectionAt);
    expect(notice).not.toMatch(/getWorkspaceContext|from\("profile_roles"\)|deriveIsAdmin\(/);
    // The reader composes the reads that exist through the one derivation.
    const reader = code(read("lib/auth/session-admin-signal.ts"));
    expect(reader).toMatch(/export const getSessionIsAdmin = cache\(/);
    expect(reader).toMatch(/getSessionProfile\(\)/);
    expect(reader).toMatch(/readActiveProfileRoles\(/);
    expect(reader).toMatch(/deriveIsAdmin\(\{/);
    expect(reader).toMatch(/\.eq\("is_active", true\)/);
    expect(reader).not.toMatch(/getWorkspaceContext|catch/);
  });

  it("the projection never narrows by organization type (an agency is a company type)", () => {
    // Review P2 on #1859, stated as the contract in the projection's own
    // comment and pinned behaviourally in `organization-authority.test.ts`;
    // this is the source-level negative control.
    const pure = code(read("lib/company/organization-authority.ts"));
    expect(pure).not.toMatch(/organizationType|companyType|staffing_agency/);
    expect(pure).toMatch(/if \(workspace\.relationship === "owner"\) \{\s*return projectOrganizationAuthority\(\{ role: "owner" \}\);/);
  });

  it("the entry guide renders the membership state for a member, not 'create a company'", () => {
    const guide = code(read("components/app/company-next-actions.tsx"));
    expect(guide).toMatch(/isMembershipEntryRefusal\(reason\)/);
    expect(guide).toMatch(/<EmployerContextNotice reason=\{reason\}/);
    for (const rel of [
      "app/[locale]/dashboard/company/page.tsx",
      "app/[locale]/dashboard/company/people/page.tsx",
      "app/[locale]/dashboard/company/needs/page.tsx",
      "app/[locale]/dashboard/company/partners/page.tsx",
      "app/[locale]/dashboard/company/settings/page.tsx",
    ]) {
      expect(code(read(rel)), rel).toMatch(/<CompanyNoProfileGuide\s+reason=\{employerCtx\.kind === "ok" \? null : employerCtx\.reason\}/);
    }
  });
});

describe("spine: the membership-invitation signal is wired end to end", () => {
  it("is in the catalogue, points at the hub, badges no tab", () => {
    const s = SPINE_SIGNALS.find((x) => x.id === "pending-membership-invitations");
    expect(s).toBeDefined();
    expect(s?.href).toBe("/dashboard/start");
    expect(s?.featureKey).toBeUndefined();
    expect(s?.count({
      unreadConversations: 0,
      pendingIncomingServiceRequests: 0,
      serviceRequestResponsesNew: 0,
      pendingIncomingBookings: 0,
      bookingResponsesNew: 0,
      pendingInvitations: 0,
      pendingMembershipInvitations: 4,
      openTaskAttention: 0,
      newJobMatches: 0,
      pendingAbsenceReviews: 0,
      // Agency ↔ client bridge counts (#1863) — zero here; the signal under
      // test reads only the membership-invitation count.
      pendingConnectionInvites: 0,
      sharedRequestsAwaitingOffer: 0,
      openCandidateOffers: 0,
    })).toBe(4);
  });
});

type Json = Record<string, unknown>;
const resolve = (msgs: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>(
    (node, k) => (node && typeof node === "object" ? (node as Json)[k] : undefined),
    msgs,
  );

describe("i18n: every catalogue carries the membership copy (all 11), the active six carry the rest", () => {
  const LEAVES = [
    ...MEMBERSHIP_ROLES.map((r) => `organizationMembers.roles.${r}`),
    ...MEMBERSHIP_OUTCOME_KEYS.map((o) => `organizationMembers.outcomes.${o}`),
    "organizationMembers.invitations.heading",
    "organizationMembers.invitations.explainer",
    "organizationMembers.invitations.accept",
    "organizationMembers.invitations.decline",
    "organizationMembers.members.heading",
    "organizationMembers.members.explainer",
    "organizationMembers.members.statusInvited",
    "organizationMembers.members.inviteHeading",
    "organizationMembers.members.inviteEmail",
    "organizationMembers.members.inviteRole",
    "organizationMembers.members.inviteSubmit",
    "organizationMembers.members.cancelInvite",
    "organizationMembers.members.revoke",
    "organizationMembers.members.leave",
    "organizationMembers.members.unavailable",
    "organizationMembers.start.membersMoved",
    "organizationMembers.start.unnamedOrganization",
    "organizationMembers.start.openSettings",
    "organizationMembers.entry.memberOnly",
    "organizationMembers.entry.openMembers",
    "organizationMembers.managerScope.title",
    "organizationMembers.managerScope.body",
    "auth.notifications.types.pending_membership_invitations",
  ];
  const ACTIVE_ONLY = [
    "activityCentre.readSemantics.pending_membership_invitations",
    "companyOps.createProject.errorNotAuthorized",
  ];
  const en = JSON.parse(read("messages/en.json")) as unknown;

  for (const loc of locales) {
    it(`${loc}: every membership leaf is a non-empty string (no [EN] placeholder)`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as unknown;
      for (const key of LEAVES) {
        const v = resolve(msgs, key);
        expect(typeof v === "string" && v.trim().length > 0, `${loc}: ${key}`).toBe(true);
        expect(v as string, `${loc}: ${key}`).not.toMatch(/^\[EN\]/);
      }
    });
  }

  for (const loc of activeLocales) {
    it(`${loc}: the spine read-semantics line and the create refusal resolve`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as unknown;
      for (const key of ACTIVE_ONLY) {
        const v = resolve(msgs, key);
        expect(typeof v === "string" && v.trim().length > 0, `${loc}: ${key}`).toBe(true);
      }
    });
  }

  for (const loc of activeLocales.filter((l) => l !== "en")) {
    it(`${loc}: the membership copy is translated, not English`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as unknown;
      for (const key of [...LEAVES, ...ACTIVE_ONLY]) {
        expect(resolve(msgs, key), `${loc}: ${key} is byte-identical to English`).not.toBe(resolve(en, key));
      }
    });
  }

  it("the copy names no person and carries no banned framing", () => {
    for (const loc of locales) {
      const ns = JSON.stringify(resolve(JSON.parse(read(`messages/${loc}.json`)), "organizationMembers"));
      expect(ns, loc).not.toMatch(/(?<![\p{L}\p{N}_])demos?(?![\p{L}\p{N}_])/iu);
      expect(ns, loc).not.toMatch(/@/);
    }
  });
});
