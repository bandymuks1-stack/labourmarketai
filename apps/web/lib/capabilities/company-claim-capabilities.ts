import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { CANONICAL_ORIGIN } from "@/lib/domain/canonical";
import { guardedSendTransactionalEmail } from "@/lib/email/send-ledger-store";
import { isTransactionalEmailConfigured } from "@/lib/email/transactional";
import { buildInviteLink } from "@/lib/invitations/model";
import { resolveRecipientLocale } from "@/lib/invitations/email-content";
import type { ExecResult } from "@/lib/conversation/executor-contract";

import { mintCapabilityConfirmation, verifyCapabilityConfirmation } from "./confirmable";
import type { CapabilityCaller, CapabilityDescriptor } from "./contract";

/**
 * COMPANY CLAIM — the operator half of partner registration Slice 1
 * (docs/proposals/partner-registration-v1.md, migration 20261110190000).
 *
 *   company.claims.list            open claims an operator may decide
 *   company.claim.invite.preview   → company.claim.invite.confirm   one-time link to ONE company's representative
 *   company.claim.decide.preview   → company.claim.decide.confirm   verify (links the owner) or reject
 *
 * AUTHORITY is the same `marketplace_company_ingest` capability as the import. The database
 * enforces every rule again: the inviting operator can't decide the claim, a claimant can't decide
 * their own, and no operator becomes the owner. Nothing here can set an owner by itself.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: CapabilityCaller["supabase"]): any {
  return c;
}

const UUID = z.string().uuid();

async function authority(caller: CapabilityCaller): Promise<ExecResult | null> {
  const { data, error } = await asAny(caller.supabase).rpc("has_platform_capability", {
    p_capability: "marketplace_company_ingest",
  });
  if (error) return { ok: false, code: "unavailable", message: "Could not check the operator permission." };
  if (data !== true) {
    return { ok: false, code: "not_authorized", message: "Only a marketplace operator can do this." };
  }
  return null;
}

function missing(error: { code?: string } | null): boolean {
  return ["42883", "PGRST202"].includes(error?.code ?? "");
}

type ClaimRow = {
  id: string;
  organization_id: string;
  state: string;
  verification_method: string | null;
  representative_role: string | null;
  invitation_id: string | null;
  created_at: string;
};

async function readCompany(caller: CapabilityCaller, organizationId: string) {
  const { data } = await asAny(caller.supabase)
    .from("organizations")
    .select("id, display_name, country, claim_state, owner_profile_id")
    .eq("id", organizationId)
    .maybeSingle();
  return data as
    | { id: string; display_name: string; country: string | null; claim_state: string; owner_profile_id: string | null }
    | null;
}

/* ── list ───────────────────────────────────────────────────────────────────────────────────── */

const companyClaimsList: CapabilityDescriptor = {
  id: "company.claims.list",
  kind: "read",
  title: "List open company claims",
  description:
    "For a marketplace operator. Lists the open requests to take over a company profile: the " +
    "company, how the request came (invitation or verification request), the role the person " +
    "stated, when, and whether you may decide it (not when you sent its invitation).",
  exposed: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: z.object({}).strict(),
  run: async (caller): Promise<ExecResult> => {
    const denied = await authority(caller);
    if (denied) return denied;
    const { data, error } = await asAny(caller.supabase)
      .from("organization_claims")
      .select("id, organization_id, state, verification_method, representative_role, invitation_id, created_at")
      .eq("state", "requested")
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) {
      if (error.code === "42703") return { ok: false, code: "needs_migration", message: "Company claims are not enabled on this environment." };
      return { ok: false, code: "unavailable", message: "Could not read the claims." };
    }
    const rows = (data ?? []) as ClaimRow[];
    const orgIds = [...new Set(rows.map((r) => r.organization_id))];
    const invIds = rows.map((r) => r.invitation_id).filter((v): v is string => !!v);
    const { data: orgs } = orgIds.length
      ? await asAny(caller.supabase).from("organizations").select("id, display_name, country").in("id", orgIds)
      : { data: [] };
    const { data: invs } = invIds.length
      ? await asAny(caller.supabase).from("invitations").select("id, inviter_profile_id").in("id", invIds)
      : { data: [] };
    const orgById = new Map(((orgs ?? []) as { id: string; display_name: string; country: string | null }[]).map((o) => [o.id, o]));
    const invitedByMe = new Set(
      ((invs ?? []) as { id: string; inviter_profile_id: string | null }[])
        .filter((i) => i.inviter_profile_id === caller.userId)
        .map((i) => i.id),
    );
    return {
      ok: true,
      data: {
        claims: rows.map((r) => ({
          claimId: r.id,
          organizationId: r.organization_id,
          company: orgById.get(r.organization_id)?.display_name ?? null,
          country: orgById.get(r.organization_id)?.country ?? null,
          via: r.invitation_id ? "invitation" : "verification_request",
          statedRole: r.representative_role,
          requestedAt: r.created_at,
          youMayDecide: !(r.invitation_id && invitedByMe.has(r.invitation_id)),
        })),
      },
    };
  },
};

/* ── invite ─────────────────────────────────────────────────────────────────────────────────── */

const inviteFields = z
  .object({
    organizationId: UUID,
    email: z.string().trim().email().max(254),
    /** The representative's language for the e-mail and the link. */
    recipientLocale: z.string().trim().max(5).optional(),
  })
  .strict();

const fingerprint = (orgId: string, email: string, state: string) => `company-claim-invite:${orgId}:${email}:${state}`;

const companyClaimInvitePreview: CapabilityDescriptor = {
  id: "company.claim.invite.preview",
  kind: "draft",
  title: "Preview inviting a company's representative to take over its profile (nothing is sent)",
  description:
    "For a marketplace operator. Checks that the company has no owner yet and returns what will " +
    "be sent: ONE one-time link, valid 14 days, that only the given e-mail address can use, after " +
    "proving it owns that mailbox. Accepting is a request, not ownership: another operator decides. " +
    "Returns a one-time token; company.claim.invite.confirm sends it.",
  exposed: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: inviteFields,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = inviteFields.parse(input);
    const denied = await authority(caller);
    if (denied) return denied;
    const email = parsed.email.toLowerCase();
    const org = await readCompany(caller, parsed.organizationId);
    if (!org) return { ok: false, code: "not_found", message: "No such company you may see." };
    if (org.owner_profile_id !== null || !["discovered", "invited"].includes(org.claim_state)) {
      return { ok: false, code: "not_claimable", message: "This company already has an owner or an open claim." };
    }
    const token = mintCapabilityConfirmation({
      actionId: "company.claim.invite.confirm",
      input: { organizationId: org.id, email },
      userId: caller.userId,
      stateFingerprint: fingerprint(org.id, email, org.claim_state),
    });
    return {
      ok: true,
      data: {
        company: org.display_name,
        country: org.country,
        sendTo: email,
        validDays: 14,
        confirmationToken: token,
        note: "Nothing was sent. company.claim.invite.confirm with the same company, address and this token sends the link.",
      },
    };
  },
};

const companyClaimInviteConfirmInput = inviteFields.extend({ confirmationToken: z.string().min(10) });

const companyClaimInviteConfirm: CapabilityDescriptor = {
  id: "company.claim.invite.confirm",
  kind: "confirm",
  title: "Send the company takeover invitation",
  description:
    "Verifies the token, stores the one-time invitation for this one company and address, marks the " +
    "company invited and e-mails the link. When e-mail is not configured the link is returned for " +
    "the operator to pass on by hand. Requires the marketplace_company_ingest capability.",
  exposed: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  inputSchema: companyClaimInviteConfirmInput,
  run: async (caller, input): Promise<ExecResult> => {
    const { confirmationToken, ...parsed } = companyClaimInviteConfirmInput.parse(input);
    const denied = await authority(caller);
    if (denied) return denied;
    const email = parsed.email.toLowerCase();
    const org = await readCompany(caller, parsed.organizationId);
    if (!org) return { ok: false, code: "not_found", message: "No such company you may see." };
    const verdict = await verifyCapabilityConfirmation({
      actionId: "company.claim.invite.confirm",
      token: confirmationToken,
      input: { organizationId: org.id, email },
      userId: caller.userId,
      currentStateFingerprint: fingerprint(org.id, email, org.claim_state),
    });
    if (!verdict.ok) {
      return { ok: false, code: "confirmation_rejected", message: `Confirmation token rejected (${verdict.reason}). Preview again.` };
    }
    const locale = resolveRecipientLocale(parsed.recipientLocale ?? null, caller.locale);
    const raw = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(raw).digest("hex");
    const { data, error } = await asAny(caller.supabase).rpc("create_claim_invitation_v1", {
      p_organization_id: org.id,
      p_invited_email: email,
      p_token_hash: hash,
      p_locale: locale,
    });
    if (error) {
      if (missing(error)) return { ok: false, code: "needs_migration", message: "Company claims are not enabled on this environment." };
      if (error.code === "42501") return { ok: false, code: "not_authorized", message: "The database refused: operator permission required." };
      return { ok: false, code: "unavailable", message: "The invitation was not stored; nothing was sent." };
    }
    const outcome = (data as { outcome?: string })?.outcome;
    if (outcome !== "invited") {
      return { ok: false, code: outcome ?? "unavailable", message: `Not invited: ${outcome ?? "unknown"}.` };
    }
    const invitationId = (data as { invitation_id: string }).invitation_id;
    const link = buildInviteLink(CANONICAL_ORIGIN, locale, raw);
    if (!isTransactionalEmailConfigured()) {
      return { ok: true, data: { invitationId, delivery: "not_sent", link, note: "E-mail is not configured: pass the link on yourself." } };
    }
    const t = await getTranslations({ locale, namespace: "companyClaim.email" });
    const sent = await guardedSendTransactionalEmail(
      {
        to: email,
        subject: t("subject", { company: org.display_name }),
        text: [t("intro", { company: org.display_name }), "", t("open"), link, "", t("validity"), "", t("notYou")].join("\n"),
      },
      { kind: "invitation", organizationId: org.id },
    );
    if (sent.status === "suppressed_synthetic_address") {
      return { ok: true, data: { invitationId, delivery: "not_sent", link, note: "A synthetic address is never mailed." } };
    }
    const delivery = sent.status === "sent" ? "sent" : "delivery_failed";
    await asAny(caller.supabase).rpc("mark_invitation_delivery_v1", { p_invitation_id: invitationId, p_outcome: delivery });
    return { ok: true, data: { invitationId, delivery, ...(delivery === "sent" ? {} : { link }) } };
  },
};

/* ── decide ─────────────────────────────────────────────────────────────────────────────────── */

const decideFields = z
  .object({
    claimId: UUID,
    decision: z.enum(["verify", "reject"]),
    /** What the operator checked: a register extract, a call note, a document reference. Required to verify. */
    evidence: z.string().trim().max(500).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

/** What the operator reviewed: changing the evidence or the note needs another preview. */
const decideTokenInput = (claimId: string, p: { decision: string; evidence?: string | null; note?: string | null }) => ({
  claimId,
  decision: p.decision,
  evidence: (p.evidence ?? "").trim(),
  note: (p.note ?? "").trim(),
});

const decideFingerprint = (claimId: string, decision: string, state: string) => `company-claim-decide:${claimId}:${decision}:${state}`;

/** The claim, or "needs_migration" when the claim-invitation columns are not there yet (42703). */
async function readClaim(caller: CapabilityCaller, claimId: string): Promise<ClaimRow | null | "needs_migration"> {
  const { data, error } = await asAny(caller.supabase)
    .from("organization_claims")
    .select("id, organization_id, state, verification_method, representative_role, invitation_id, created_at")
    .eq("id", claimId)
    .maybeSingle();
  if (error?.code === "42703") return "needs_migration";
  return data as ClaimRow | null;
}

const NEEDS_MIGRATION: ExecResult = { ok: false, code: "needs_migration", message: "Company claims are not enabled on this environment." };

const companyClaimDecidePreview: CapabilityDescriptor = {
  id: "company.claim.decide.preview",
  kind: "draft",
  title: "Preview deciding a company claim (nothing changes)",
  description:
    "For a marketplace operator who did NOT send the claim's invitation. Shows the company and the " +
    "claim. Verify makes the claimant the company's owner at once; it needs the evidence you checked. " +
    "Returns a one-time token; company.claim.decide.confirm applies it.",
  exposed: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: decideFields,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = decideFields.parse(input);
    const denied = await authority(caller);
    if (denied) return denied;
    if (parsed.decision === "verify" && !parsed.evidence) {
      return { ok: false, code: "evidence_required", message: "Say what you checked before verifying." };
    }
    const claim = await readClaim(caller, parsed.claimId);
    if (claim === "needs_migration") return NEEDS_MIGRATION;
    if (!claim) return { ok: false, code: "not_found", message: "No such claim." };
    if (claim.state !== "requested") return { ok: false, code: "not_pending", message: `This claim is ${claim.state}.` };
    const org = await readCompany(caller, claim.organization_id);
    const token = mintCapabilityConfirmation({
      actionId: "company.claim.decide.confirm",
      input: decideTokenInput(claim.id, parsed),
      userId: caller.userId,
      stateFingerprint: decideFingerprint(claim.id, parsed.decision, claim.state),
    });
    return {
      ok: true,
      data: {
        company: org?.display_name ?? null,
        via: claim.invitation_id ? "invitation" : "verification_request",
        statedRole: claim.representative_role,
        decision: parsed.decision,
        effect: parsed.decision === "verify" ? "The claimant becomes the company's owner." : "The claim is closed; the company keeps no owner.",
        confirmationToken: token,
      },
    };
  },
};

const companyClaimDecideConfirmInput = decideFields.extend({ confirmationToken: z.string().min(10) });

const companyClaimDecideConfirm: CapabilityDescriptor = {
  id: "company.claim.decide.confirm",
  kind: "confirm",
  title: "Decide a company claim",
  description:
    "Verifies the token and applies the decision. Verify records the evidence and makes the claimant " +
    "the owner, with the owner membership, in one step; reject closes the claim. The database refuses " +
    "the operator who sent the invitation and the claimant themself.",
  exposed: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  inputSchema: companyClaimDecideConfirmInput,
  run: async (caller, input): Promise<ExecResult> => {
    const { confirmationToken, ...parsed } = companyClaimDecideConfirmInput.parse(input);
    const denied = await authority(caller);
    if (denied) return denied;
    const claim = await readClaim(caller, parsed.claimId);
    if (claim === "needs_migration") return NEEDS_MIGRATION;
    if (!claim) return { ok: false, code: "not_found", message: "No such claim." };
    const verdict = await verifyCapabilityConfirmation({
      actionId: "company.claim.decide.confirm",
      token: confirmationToken,
      input: decideTokenInput(claim.id, parsed),
      userId: caller.userId,
      currentStateFingerprint: decideFingerprint(claim.id, parsed.decision, claim.state),
    });
    if (!verdict.ok) {
      return { ok: false, code: "confirmation_rejected", message: `Confirmation token rejected (${verdict.reason}). Preview again.` };
    }
    const { data, error } = await asAny(caller.supabase).rpc("decide_organization_claim_v2", {
      p_claim_id: claim.id,
      p_decision: parsed.decision,
      p_evidence_ref: parsed.evidence ?? "",
      p_note: parsed.note ?? null,
    });
    if (error) {
      if (missing(error)) return { ok: false, code: "needs_migration", message: "Company claims are not enabled on this environment." };
      if (error.code === "42501") return { ok: false, code: "not_authorized", message: "The database refused this decision for you." };
      if (error.code === "22023") return { ok: false, code: "evidence_required", message: "Say what you checked before verifying." };
      return { ok: false, code: "unavailable", message: "Nothing was decided." };
    }
    const outcome = (data as { outcome?: string })?.outcome ?? "unknown";
    const org = await readCompany(caller, claim.organization_id);
    return {
      ok: outcome === "linked" || outcome === "rejected",
      ...(outcome === "linked" || outcome === "rejected"
        ? { data: { outcome, company: org?.display_name ?? null, claimState: org?.claim_state ?? null, ownerAssigned: !!org?.owner_profile_id } }
        : { code: outcome, message: `Not decided: ${outcome}.` }),
    } as ExecResult;
  },
};

export const COMPANY_CLAIM_CAPABILITIES: readonly CapabilityDescriptor[] = [
  companyClaimsList,
  companyClaimInvitePreview,
  companyClaimInviteConfirm,
  companyClaimDecidePreview,
  companyClaimDecideConfirm,
];
