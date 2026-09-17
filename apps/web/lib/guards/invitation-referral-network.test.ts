import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";
import {
  clampCampaignUses,
  DEMAND_INVITATION_TYPES,
  INVITATION_TYPES,
  MAX_CAMPAIGN_USES_WITH_CONTEXT,
  MAX_CAMPAIGN_USES_WITHOUT_CONTEXT,
  REVIEW_ITEM_KEY_RX,
  acceptedDestination,
} from "@/lib/invitations/model";

/**
 * UNIVERSAL INVITATION / REFERRAL NETWORK v1 — the invariants that must
 * survive every refactor, pinned against the SQL and the app layer.
 *
 *   THE INVITER CREATES THE CONNECTION.
 *   THE INVITED PERSON OWNS THEIR PROFESSIONAL IDENTITY.
 *
 * The migration is RED and unapplied; a browser cannot reach the v2 paths
 * before the owner applies it. These assertions are what CAN be proven
 * today, and they are the ones a later "small fix" would most plausibly
 * break: a grant to anon, a verified-skill write on acceptance, a match
 * band on an employer invitation, a consent check that quietly became
 * optional, a preview that started returning the addressee to strangers.
 */
const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const MIGRATION = join(
  REPO,
  "supabase",
  "migrations",
  "20260917120000_universal_invitation_referral_network_v1.sql",
);
const ROLLBACK = join(
  REPO,
  "supabase",
  "rollbacks",
  "20260917120000_universal_invitation_referral_network_v1.down.sql",
);
const read = (p: string) => readFileSync(p, "utf8");
/** TypeScript source with comments stripped — prose may name things code may not. */
const tsCode = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

/** Executable SQL only — comments do not count for or against a rule. */
const sqlCode = (src: string) => src.replace(/--[^\n]*/g, "");

function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThan(-1);
  const end = sql.indexOf("end $$;", start);
  return sql.slice(start, end);
}

describe("migration 20260917120000 — what it may and may not do", () => {
  const raw = read(MIGRATION);
  const sql = sqlCode(raw);

  it("is RED-annotated, ships its rollback, and the rollback refuses to erase real referrals", () => {
    expect(raw.startsWith("-- @human-gate-approved")).toBe(true);
    const down = read(ROLLBACK);
    expect(down).toMatch(/rollback refused: invitation_acceptances holds/);
    expect(down).toMatch(/rollback refused: invitations holds rows/);
    expect(down).toMatch(/set not null/);
  });

  it("grants NOTHING to anon; the two server-only functions are service_role-only", () => {
    expect(sql).not.toMatch(/\bto\s+anon\b/i);
    expect(sql).not.toMatch(/grant[^;]*\bto\s+(public|anon)\b/i);
    for (const fn of ["get_invitation_public_preview_v1", "receive_external_referral_v1", "mark_external_referral_delivery_v1"]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\)\\s*from public, anon, authenticated`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\)\\s*to service_role`));
    }
  });

  it("acceptance never touches the professional identity: no skill, profession, claim or evidence write anywhere", () => {
    for (const table of [
      "worker_skills",
      "worker_professions",
      "profile_skill_claims",
      "journal_entries",
      "journal_entry_confirmations",
      "candidate_skills",
    ]) {
      expect(sql, `no write to ${table}`).not.toMatch(new RegExp(`(insert into|update|delete from)\\s+public\\.${table}\\b`, "i"));
    }
    // Nothing in the file can say "verified".
    expect(sql.toLowerCase()).not.toMatch(/verified\s*=\s*true/);
  });

  it("an employer invitation to a need records EMPLOYER_INVITED, never a system match", () => {
    const accept = fnBody(sql, "accept_invitation_apply_v2");
    const arm = accept.slice(accept.indexOf("invite_to_demand"));
    expect(arm).toMatch(/insert into public\.demand_interest_signals/);
    expect(arm).toMatch(/'basis', 'employer_invitation'/);
    // No computed fit: the snapshot carries no band and no matched skills.
    expect(arm).not.toMatch(/status_band|matched_skills|missing_skills/);
    // The person needs a worker identity to say yes; without one the
    // invitation is NOT consumed.
    expect(arm).toMatch(/no_worker_profile/);
  });

  it("acceptance follows the existing membership/assignment rules — same arms as v1, no confirmed assignment invented", () => {
    const accept = fnBody(sql, "accept_invitation_apply_v2");
    expect(accept).toMatch(/insert into public\.engagement_contexts/);
    expect(accept).toMatch(/insert into public\.project_worker_assignments \(project_id, worker_id, status\)\s*values \(v_row\.project_id, v_worker, 'active'\)/);
    // No governance seat, no membership row, no booking: an invitation is
    // not an employment decision.
    expect(accept).not.toMatch(/company_memberships|booking_requests|company_workers/);
  });

  it("multi-use is bounded and every seat is its own person; the same person twice is idempotent", () => {
    expect(sql).toMatch(/max_uses between 1 and 500 and use_count between 0 and max_uses/);
    const create = fnBody(sql, "create_invitation_v2");
    expect(create).toMatch(/v_max > 1 and not v_has_context and v_max > 20/);
    const accept = fnBody(sql, "accept_invitation_apply_v2");
    expect(accept).toMatch(/on conflict \(invitation_id, profile_id\)/);
    expect(accept).toMatch(/'already_accepted'/);
    expect(accept).toMatch(/'exhausted'/);
    // The ledger row is written before the seat count moves.
    expect(accept.indexOf("insert into public.invitation_acceptances")).toBeLessThan(
      accept.indexOf("set use_count = v_uses"),
    );
  });

  it("one acceptance core, two doors: the core is callable by nobody directly; the in-app door is e-mail-bound and refuses open links", () => {
    expect(sql).toMatch(/revoke all on function public\.accept_invitation_apply_v2\(uuid, uuid\)\s*from public, anon, authenticated/);
    expect(sql).not.toMatch(/grant execute on function public\.accept_invitation_apply_v2/);
    const link = fnBody(sql, "accept_invitation_v2");
    expect(link).toMatch(/return public\.accept_invitation_apply_v2\(v_id, uid\)/);
    const byId = fnBody(sql, "accept_invitation_by_id_v2");
    expect(byId).toMatch(/auth\.jwt\(\) ->> 'email'/);
    expect(byId).toMatch(/v_invited is null or v_email = '' or v_invited <> v_email/);
    expect(byId).toMatch(/return public\.accept_invitation_apply_v2\(p_invitation_id, uid\)/);
    // Neither door carries its own copy of an arm — the demand arm exists once.
    expect((sql.match(/'basis', 'employer_invitation'/g) ?? []).length).toBe(1);
  });

  it("revoked / declined / expired can never create a relationship", () => {
    const accept = fnBody(sql, "accept_invitation_apply_v2");
    const guard = accept.indexOf("if v_row.status in ('revoked','declined','expired') then");
    const firstWrite = accept.indexOf("insert into public.engagement_contexts");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstWrite);
    expect(accept.indexOf("if v_row.expires_at <= now() then")).toBeLessThan(firstWrite);
  });

  it("NO CONSENT, NO REFERRAL — the database re-checks given/text/version against the registry version, last", () => {
    const recv = fnBody(sql, "receive_external_referral_v1");
    expect(recv).toMatch(/\(p_consent->>'given'\) is distinct from 'true'/);
    expect(recv).toMatch(/nullif\(trim\(coalesce\(p_consent->>'text', ''\)\), ''\) is null/);
    expect(recv).toMatch(/\(p_consent->>'version'\) <> p_required_consent_version/);
    expect(recv).toMatch(/'consent_required'/);
    // The check happens BEFORE the idempotency read and BEFORE the insert.
    expect(recv.indexOf("'consent_required'")).toBeLessThan(recv.indexOf("insert into public.invitations"));
    // The stored consent is copied, never synthesised: given is the literal
    // true only because the check above already required it.
    expect(recv).toMatch(/'text', p_consent->>'text',\s*'version', p_consent->>'version'/);
  });

  it("external ingestion is idempotent on (source, reference) and never looks up an existing person", () => {
    expect(sql).toMatch(/create unique index if not exists invitations_external_ref_uidx\s+on public\.invitations \(external_source_slug, external_reference\)/);
    const recv = fnBody(sql, "receive_external_referral_v1");
    expect(recv).toMatch(/'outcome', 'duplicate'/);
    expect(recv).toMatch(/when unique_violation then/);
    // No identity lookup by e-mail or phone: the partner learns nothing
    // about who has an account, and no merge happens by similarity.
    expect(recv).not.toMatch(/from public\.profiles|from auth\.users|from public\.workers/);
    expect(recv).not.toMatch(/phone/);
    // External referrals are always single-use platform invitations.
    expect(recv).toMatch(/p_token_hash, 'join_platform', v_email/);
  });

  it("an invitation has a person OR an approved source as its origin — never neither, never both", () => {
    expect(sql).toMatch(/add constraint invitations_origin_chk check \(\s*\(inviter_profile_id is not null and external_source_slug is null\s+and external_reference is null\)\s*or\s*\(inviter_profile_id is null and external_source_slug is not null\s+and external_reference is not null and consent_record is not null\)\s*\)/);
  });

  it("the logged-out preview discloses the minimum and never the addressee, the message, the need or the declared context", () => {
    const pub = fnBody(sql, "get_invitation_public_preview_v1");
    const returned = pub.slice(pub.lastIndexOf("return jsonb_build_object("));
    for (const forbidden of ["invited_email", "invited_name", "personal_message", "declared_context", "consent_record", "demand_role", "target_request_id", "'invitation_id'", "use_count"]) {
      expect(returned, `public preview must not return ${forbidden}`).not.toContain(forbidden);
    }
    // It counts the open — the one funnel fact only this door sees.
    expect(pub).toMatch(/set open_count = least\(open_count \+ 1, 1000000\)/);
  });

  it("the declared context is disclosed ONLY to the person who accepted, and the review writes only their own row", () => {
    const prev = fnBody(sql, "get_invitation_preview_v2");
    expect(prev).toMatch(/'declared_context', case when v_my_decision = 'accepted' then v_row\.declared_context else null end/);
    const review = fnBody(sql, "review_referral_context_v1");
    expect(review).toMatch(/where a\.invitation_id = p_invitation_id and a\.profile_id = uid\s+and a\.decision = 'accepted'/);
    expect(review).toMatch(/p_decision not in \('accepted','rejected','corrected'\)/);
    expect(review).not.toMatch(/worker_skills|worker_professions/);
  });

  it("the sender-side permission for a demand target is ownership or organization management of THAT need", () => {
    const create = fnBody(sql, "create_invitation_v2");
    const arm = create.slice(create.indexOf("elsif p_invitation_type = 'invite_to_demand' then"), create.indexOf("v_has_context := true;", create.indexOf("elsif p_invitation_type = 'invite_to_demand' then")));
    expect(arm).toMatch(/from public\.customer_requests where id = p_target_request_id/);
    expect(arm).toMatch(/v_req_owner = uid\s+or \(v_req_org is not null and public\.manages_organization\(v_req_org\)\)/);
    expect(arm).toMatch(/'demand_closed'/);
  });

  it("the acceptance ledger is readable by the person, the inviter and the org authority — nobody else — and has no write policy", () => {
    const policy = sql.slice(sql.indexOf("create policy invitation_acceptances_select"), sql.indexOf("grant select on public.invitation_acceptances"));
    expect(policy).toMatch(/profile_id = auth\.uid\(\)/);
    expect(policy).toMatch(/i\.inviter_profile_id = auth\.uid\(\)/);
    expect(policy).toMatch(/public\.invitation_org_authority_v1\(i\.organization_id\)/);
    expect(sql.match(/create policy \S+\s+on public\.invitation_acceptances/g)).toHaveLength(1);
  });
});

describe("app layer — the same boundaries above the database", () => {
  it("the model: the demand type is the one addition, campaign bounds clamp and never widen", () => {
    expect(DEMAND_INVITATION_TYPES).toEqual(["invite_to_demand"]);
    expect(INVITATION_TYPES).toContain("invite_to_demand");
    expect(clampCampaignUses("join_platform", 9999)).toBe(MAX_CAMPAIGN_USES_WITHOUT_CONTEXT);
    expect(clampCampaignUses("join_project", 9999)).toBe(MAX_CAMPAIGN_USES_WITH_CONTEXT);
    expect(clampCampaignUses("invite_to_demand", 0)).toBe(1);
    expect(clampCampaignUses("join_organization", Number.NaN)).toBe(1);
    expect(MAX_CAMPAIGN_USES_WITH_CONTEXT).toBe(500);
    expect(MAX_CAMPAIGN_USES_WITHOUT_CONTEXT).toBe(20);
    expect(REVIEW_ITEM_KEY_RX.test("skills:3")).toBe(true);
    expect(REVIEW_ITEM_KEY_RX.test("skills:abc")).toBe(false);
    // Saying yes to a need lands on the person's own interest list, not on
    // the employer's page and not on a booking.
    expect(acceptedDestination({ invitationType: "invite_to_demand" })).toBe("/dashboard/opportunities");
  });

  it("the public preview module re-applies the allowlist and never forwards PII fields", () => {
    const src = read(join(APP, "lib", "invitations", "public-preview.ts"));
    for (const forbidden of ["invited_email", "invited_name", "personal_message", "declared_context", "demand_role_text"]) {
      expect(src).not.toContain(forbidden);
    }
    expect(src).toMatch(/get_invitation_public_preview_v1/);
    expect(src).toMatch(/import "server-only"/);
  });

  it("the logged-out landing keeps the self-start path beside the invitation and returns through the guarded ?next=", () => {
    const page = read(join(APP, "app", "[locale]", "invite", "[token]", "page.tsx"));
    expect(page).toMatch(/href=\{`\/auth\/signup\?next=\$\{encodeURIComponent\(returnTo\)\}`\}/);
    expect(page).toMatch(/href=\{`\/auth\/login\?next=\$\{encodeURIComponent\(returnTo\)\}`\}/);
    expect(page).toMatch(/data-testid="invite-selfstart"/);
    // The anonymous branch renders from the PUBLIC preview type only.
    const anon = page.slice(page.indexOf("if (!user) {"), page.indexOf("// Signed in:"));
    expect(anon).not.toMatch(/invited_email|personal_message|declared_context|demand_role_text/);
    // An employer invitation is worded as the employer's, not the system's.
    expect(page).toMatch(/invite-demand-not-match/);
  });

  it("the partner door: no source is special-cased outside the registry, and the route never parses Authorization itself", () => {
    const route = tsCode(read(join(APP, "app", "api", "referrals", "external", "v1", "route.ts")));
    expect(route).not.toMatch(/nonstop/i);
    expect(route).not.toMatch(/headers\s*\.\s*get\(\s*["'`][Aa]uthorization/);
    expect(route).toMatch(/authorizeExternalReferralRequest/);
    expect(route).toMatch(/rateLimit\(/);
    const receive = tsCode(read(join(APP, "lib", "invitations", "external-referral-receive.ts")));
    expect(receive).not.toMatch(/nonstop/i);
    expect(receive).toMatch(/receive_external_referral_v1/);
    // The receiver never reads a table through the admin client — service
    // role holds no table grant on invitations in production.
    expect(receive).not.toMatch(/\.from\(/);
  });

  it("accepting a referral records the decision with provenance and points to the profile — it never writes a skill", () => {
    const review = tsCode(read(join(APP, "components", "app", "referral-context-review.tsx")));
    expect(review).toMatch(/reviewReferralContextAction/);
    // The ONE action it calls is the review; no profile writer, no table, no
    // other RPC.
    expect(review).not.toMatch(/saveProfileSkillClaims|worker_skills|worker_professions|supabase|\.rpc\(/);
    expect(review.match(/\w+Action\(/g)).toEqual(["reviewReferralContextAction("]);
    expect(review).toMatch(/\/dashboard\/profile/);
    const actions = read(join(APP, "lib", "invitations", "actions.ts"));
    // v2 first, v1 fallback — never a fake "not enabled" for what v1 serves.
    expect(actions).toMatch(/rpc\("accept_invitation_v2"/);
    expect(actions).toMatch(/rpc\("accept_invitation_v1"/);
    // The inviter's notification is awaited on the write path.
    expect(actions).toMatch(/await emitInvitationAcceptedNotification\(/);
  });

  it("every new UI key exists in every routed locale (LT / EN / RU + NL / DE) — no key leaks as itself", () => {
    const required = [
      ["network", "invitePage", "anonExplainer"],
      ["network", "invitePage", "register"],
      ["network", "invitePage", "signIn"],
      ["network", "invitePage", "youOwnYourIdentity"],
      ["network", "invitePage", "referredVia"],
      ["network", "invitePage", "demandNotMatch"],
      ["network", "invitePage", "titles", "invite_to_demand"],
      ["network", "invitePage", "closed", "exhausted"],
      ["network", "invitePage", "notices", "referral_accepted"],
      ["network", "invite", "modes", "link"],
      ["network", "invite", "seatsLabel"],
      ["network", "invite", "types", "invite_to_demand"],
      ["network", "invite", "outcomes", "demand_closed"],
      ["network", "sent", "joined"],
      ["network", "referralReview", "boundary"],
      ["network", "referralReview", "groups", "professions"],
      ["auth", "notifications", "types", "event_invitation_accepted"],
    ];
    for (const locale of activeLocales) {
      const messages = JSON.parse(read(join(APP, "messages", `${locale}.json`))) as Record<string, unknown>;
      for (const path of required) {
        let node: unknown = messages;
        for (const key of path) node = (node as Record<string, unknown> | undefined)?.[key];
        expect(typeof node, `${locale}: ${path.join(".")}`).toBe("string");
        expect((node as string).length, `${locale}: ${path.join(".")}`).toBeGreaterThan(0);
      }
    }
  });
});
