import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  acceptInviteFormAction,
  declineInviteFormAction,
} from "@/lib/invitations/invite-page-actions";
import { readPublicInvitationPreview } from "@/lib/invitations/public-preview";
import { findExternalReferralSource } from "@/lib/invitations/external-sources";
import { declaredContextItems } from "@/lib/invitations/model";
import {
  ReferralContextReview,
  type ReferralReviewLabels,
} from "@/components/app/referral-context-review";
import { formatUtcDate } from "@/lib/time/display";
// The ONE list that says "this happened and it was a placement, not a job".
import { PRACTICE_RELATIONSHIPS } from "@/lib/player-card/work-history-model";
import type { Metadata } from "next";

/**
 * Invitation landing page (core-network area B; universal network v1) — the
 * destination of every emailed / shared invite link.
 *
 * LOGGED OUT: the minimal preview (what kind of invitation, from whom, in
 * which capacity, until when — nothing else) and the two doors, register or
 * sign in, both carrying ?next=/{locale}/invite/{token} so the invitation
 * survives e-mail confirmation and OAuth (the existing safe-return
 * mechanism, open-redirect-guarded in lib/auth/redirect.ts). The self-start
 * path is the same door: a person who arrived with a token may still simply
 * register and use the product without accepting anything.
 *
 * LOGGED IN: the full preview (v2, with the v1 function as fallback while
 * the owner-gated migration is not applied) and accept / decline. After
 * accepting an external-source referral the person reviews, item by item,
 * what the source declared about them — declared input, never evidence.
 *
 * The token is the only capability. The page never reveals whether an
 * e-mail has an account and never renders an addressee to a stranger.
 */

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

type Preview = {
  outcome: string;
  invitation_id?: string;
  invitation_type?: string;
  status?: string;
  invited_email?: string | null;
  invited_name?: string | null;
  proposed_role?: string | null;
  personal_message?: string | null;
  expires_at?: string;
  organization_name?: string | null;
  project_title?: string | null;
  inviter_name?: string | null;
  relationship_slug?: string | null;
  // v2 only — absent while the v1 function serves the page.
  max_uses?: number;
  use_count?: number;
  campaign_label?: string | null;
  demand_role_text?: string | null;
  demand_country?: string | null;
  external_source_slug?: string | null;
  my_decision?: string | null;
  has_declared_context?: boolean;
  declared_context?: unknown;
  context_review?: unknown;
};

/** The person's earlier review decisions, from the v2 preview. Unknown
 *  shapes yield nothing — never a crash on the person's own page. */
function readReviews(
  raw: unknown,
): Record<string, { decision: "accepted" | "rejected" | "corrected"; correction?: string | null }> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, { decision: "accepted" | "rejected" | "corrected"; correction?: string | null }> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const d = (value as { decision?: unknown }).decision;
    if (d !== "accepted" && d !== "rejected" && d !== "corrected") continue;
    const c = (value as { correction?: unknown }).correction;
    out[key] = { decision: d, correction: typeof c === "string" ? c : null };
  }
  return out;
}

const NOTICES = new Set([
  "not_enabled",
  "already_accepted",
  "exhausted",
  "expired",
  "revoked",
  "declined",
  "no_worker_profile",
  "not_found",
  "error",
  "referral_accepted",
]);

function isMissingFunction(error: { code?: string } | null): boolean {
  return Boolean(error && (error.code === "PGRST202" || error.code === "42883"));
}

/** A page reached by a capability token is never a search result. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { locale, token } = await params;
  const { notice } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("network.invitePage");
  // The ONE localized relationship vocabulary — the words the CV also prints.
  const tRelationships = await getTranslations("relationshipTypes");

  const returnTo = `/${locale}/invite/${token}`;
  const shell = (children: React.ReactNode) => (
    <main
      className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-4 px-6 py-10"
      data-testid="invite-page"
    >
      {children}
    </main>
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const pub = await readPublicInvitationPreview(token);
    if (pub.kind === "not_enabled") {
      // Pre-migration behaviour: sign in first, the invitation waits.
      redirect(`/${locale}/auth/login?next=${encodeURIComponent(returnTo)}`);
    }
    if (pub.kind === "unavailable") {
      return shell(
        <p className="rounded-md border border-dashed border-ink-500 p-5 text-sm text-text-secondary">
          {t("loadError")}
        </p>,
      );
    }
    if (pub.kind === "not_found") {
      return shell(
        <>
          <h1 className="font-display text-2xl font-bold text-text-primary">
            {t("invalidTitle")}
          </h1>
          <p className="text-sm text-text-secondary">{t("invalidBody")}</p>
          <Link
            href="/auth/signup"
            className="w-fit rounded-md border border-brand-blue/50 px-4 py-2 text-sm text-brand-blue hover:border-brand-blue"
            data-testid="invite-selfstart"
          >
            {t("selfStart")}
          </Link>
        </>,
      );
    }
    const p = pub.preview;
    const closed = p.status !== "pending";
    const source = findExternalReferralSource(p.externalSourceSlug);
    return shell(
      <>
        <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-2xl font-bold text-text-primary">
          {t(`titles.${p.invitationType}`)}
        </h1>
        <div className="flex flex-col gap-1 text-sm text-text-secondary">
          {p.inviterName && (
            <p data-testid="invite-inviter">{t("from", { name: p.inviterName })}</p>
          )}
          {source && (
            <p data-testid="invite-source">{t("referredVia", { source: source.displayName })}</p>
          )}
          {p.organizationName && (
            <p data-testid="invite-org">{t("organization", { name: p.organizationName })}</p>
          )}
          {p.projectTitle && (
            <p data-testid="invite-project">{t("project", { name: p.projectTitle })}</p>
          )}
          {p.campaignLabel && (
            <p data-testid="invite-campaign">{t("campaign", { label: p.campaignLabel })}</p>
          )}
          {p.relationshipSlug && (
            <p data-testid="invite-relationship">
              {t("capacity", { capacity: tRelationships(p.relationshipSlug) })}
            </p>
          )}
        </div>
        {closed ? (
          <p
            className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-secondary"
            data-testid="invite-closed"
          >
            {t(`closed.${p.status}`)}
          </p>
        ) : (
          <>
            <p className="text-sm text-text-secondary" data-testid="invite-anon-explainer">
              {t("anonExplainer")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/auth/signup?next=${encodeURIComponent(returnTo)}`}
                className="inline-flex min-h-11 items-center rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-5 py-2 text-sm font-semibold text-ink-900 transition-opacity hover:opacity-90"
                data-testid="invite-register"
              >
                {t("register")}
              </Link>
              <Link
                href={`/auth/login?next=${encodeURIComponent(returnTo)}`}
                className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-5 py-2 text-sm text-text-secondary hover:border-brand-blue hover:text-text-primary"
                data-testid="invite-login"
              >
                {t("signIn")}
              </Link>
            </div>
            <p className="text-meta text-text-muted" data-testid="invite-owns-identity">
              {t("youOwnYourIdentity")}
            </p>
          </>
        )}
        <p className="text-meta text-text-muted">
          {t("expiresNote", {
            date: formatUtcDate(p.expiresAt ?? undefined, locale) ?? "—",
          })}
        </p>
      </>,
    );
  }

  // Signed in: v2 preview, v1 when v2 is not there yet.
  let { data, error } = await asAny(supabase).rpc("get_invitation_preview_v2", {
    p_token: token,
  });
  if (isMissingFunction(error)) {
    ({ data, error } = await asAny(supabase).rpc("get_invitation_preview_v1", {
      p_token: token,
    }));
  }

  if (error) {
    return shell(
      <p className="rounded-md border border-dashed border-ink-500 p-5 text-sm text-text-secondary">
        {isMissingFunction(error) ? t("notEnabled") : t("loadError")}
      </p>,
    );
  }

  const preview = (data ?? { outcome: "not_found" }) as Preview;
  if (preview.outcome !== "ok") {
    return shell(
      <>
        <h1 className="font-display text-2xl font-bold text-text-primary">
          {t("invalidTitle")}
        </h1>
        <p className="text-sm text-text-secondary">{t("invalidBody")}</p>
        <Link
          href="/dashboard"
          className="w-fit rounded-md border border-brand-blue/50 px-4 py-2 text-sm text-brand-blue hover:border-brand-blue"
        >
          {t("toDashboard")}
        </Link>
      </>,
    );
  }

  const status = preview.status ?? "pending";
  const myDecision = preview.my_decision ?? null;
  const maxUses = preview.max_uses ?? 1;
  // A campaign link stays open for others after MY answer; my own answer is
  // what closes it for me.
  const closed =
    status !== "pending" || myDecision === "accepted" || myDecision === "declined";
  const closedKey =
    myDecision === "accepted"
      ? "accepted"
      : myDecision === "declined"
        ? "declined"
        : status === "accepted" && maxUses > 1
          ? "exhausted"
          : status;
  const relationshipSlug = preview.relationship_slug ?? null;
  const source = findExternalReferralSource(preview.external_source_slug);
  const contextItems = declaredContextItems(preview.declared_context);
  const declaredFreeText = (preview.declared_context as { freeText?: unknown } | null)
    ?.freeText;
  const safeNotice = notice && NOTICES.has(notice) ? notice : null;
  const isDemand = preview.invitation_type === "invite_to_demand";
  // Resolved here, on the server: the /invite tree ships no `network`
  // messages to the client (client-messages-allowlist).
  const tReview = await getTranslations("network.referralReview");
  const reviewLabels: ReferralReviewLabels = {
    title: tReview("title", { source: "{source}" }),
    intro: tReview("intro"),
    groups: {
      professions: tReview("groups.professions"),
      sectors: tReview("groups.sectors"),
      skills: tReview("groups.skills"),
      languages: tReview("groups.languages"),
      destinations: tReview("groups.destinations"),
      freeText: tReview("groups.freeText"),
    },
    decisions: {
      accepted: tReview("decisions.accepted"),
      rejected: tReview("decisions.rejected"),
      corrected: tReview("decisions.corrected"),
    },
    accept: tReview("accept"),
    reject: tReview("reject"),
    correct: tReview("correct"),
    save: tReview("save"),
    cancel: tReview("cancel"),
    correctionPlaceholder: tReview("correctionPlaceholder"),
    failed: { not_enabled: tReview("failed.not_enabled"), error: tReview("failed.error") },
    boundary: tReview("boundary"),
    toProfile: tReview("toProfile"),
  };

  return shell(
    <>
      <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
        {t("eyebrow")}
      </p>
      <h1 className="font-display text-2xl font-bold text-text-primary">
        {t(`titles.${preview.invitation_type ?? "join_platform"}`)}
      </h1>
      <div className="flex flex-col gap-1 text-sm text-text-secondary">
        {preview.inviter_name && (
          <p data-testid="invite-inviter">{t("from", { name: preview.inviter_name })}</p>
        )}
        {source && (
          <p data-testid="invite-source">{t("referredVia", { source: source.displayName })}</p>
        )}
        {preview.organization_name && (
          <p data-testid="invite-org">{t("organization", { name: preview.organization_name })}</p>
        )}
        {preview.project_title && (
          <p data-testid="invite-project">{t("project", { name: preview.project_title })}</p>
        )}
        {/* THE NEED the employer invited this person to — what they can say
            yes or no to, even with an incomplete matching profile. It is the
            employer's invitation, stated as such; no match is claimed. */}
        {preview.demand_role_text && (
          <p data-testid="invite-demand">
            {t("demand", {
              role: preview.demand_role_text,
              country: preview.demand_country ?? "—",
            })}
            <span className="ml-1 text-text-muted" data-testid="invite-demand-not-match">
              {t("demandNotMatch")}
            </span>
          </p>
        )}
        {preview.campaign_label && (
          <p data-testid="invite-campaign">{t("campaign", { label: preview.campaign_label })}</p>
        )}
        {maxUses > 1 && (
          <p data-testid="invite-seats" className="text-text-muted">
            {t("seats", { used: preview.use_count ?? 0, max: maxUses })}
          </p>
        )}
        {preview.proposed_role && (
          <p data-testid="invite-role">{t("role", { role: preview.proposed_role })}</p>
        )}
        {/* WHAT YOU ARE AGREEING TO. Acceptance creates a real, attributable
            relationship; the name is resolved through the localized
            `relationshipTypes` catalogue; the slug itself never renders. */}
        {relationshipSlug && (
          <p data-testid="invite-relationship">
            {t("capacity", { capacity: tRelationships(relationshipSlug) })}
            {(PRACTICE_RELATIONSHIPS as readonly string[]).includes(relationshipSlug) && (
              <span
                className="ml-1 text-text-muted"
                data-testid="invite-relationship-not-employment"
              >
                {t("capacityNotEmployment")}
              </span>
            )}
          </p>
        )}
        {preview.personal_message && (
          <p className="rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2 text-xs">
            &ldquo;{preview.personal_message}&rdquo;
          </p>
        )}
      </div>

      {safeNotice && (
        <p
          role="status"
          className="rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2 text-xs text-text-secondary"
          data-testid="invite-notice"
        >
          {t(`notices.${safeNotice}`)}
        </p>
      )}

      {closed ? (
        <p
          className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-secondary"
          data-testid="invite-closed"
        >
          {t(`closed.${closedKey}`)}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <form action={acceptInviteFormAction}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              data-testid="invite-accept"
              className="inline-flex min-h-11 items-center rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-5 py-2 text-sm font-semibold text-ink-900 transition-opacity hover:opacity-90"
            >
              {isDemand ? t("interested") : t("accept")}
            </button>
          </form>
          <form action={declineInviteFormAction}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              data-testid="invite-decline"
              className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-5 py-2 text-sm text-text-secondary hover:border-brand-blue hover:text-text-primary"
            >
              {isDemand ? t("notInterested") : t("decline")}
            </button>
          </form>
        </div>
      )}

      {/* WHAT WAS DECLARED ABOUT YOU — shown only to the person who accepted,
          only for an external-source referral, and only as declared input:
          accept / reject / correct each line. Nothing here is verified and
          nothing here writes a skill; the profile paths that exist do. */}
      {myDecision === "accepted" && preview.invitation_id && contextItems.length > 0 && (
        <ReferralContextReview
          invitationId={preview.invitation_id}
          sourceName={source?.displayName ?? preview.external_source_slug ?? ""}
          items={contextItems}
          freeText={typeof declaredFreeText === "string" ? declaredFreeText : null}
          initialReviews={readReviews(preview.context_review)}
          labels={reviewLabels}
        />
      )}

      <p className="text-meta text-text-muted">
        {t("expiresNote", {
          date: formatUtcDate(preview.expires_at, locale) ?? "—",
        })}
      </p>
    </>,
  );
}
