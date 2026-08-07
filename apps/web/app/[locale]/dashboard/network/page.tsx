import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnedOrganizations } from "@/lib/company/owned-organizations";
import { listManagedProjects } from "@/lib/projects/projects";
import {
  listInvitationsForMe,
  listMyEngagements,
  listMySentInvitations,
  searchPeopleAndCompanies,
} from "@/lib/invitations/network";
import { listMyTeamEnquiries } from "@/lib/company/team-enquiries";
import { getEmployerOwnerProfileId } from "@/lib/communication/employer-resolution";
import { InvitePanel } from "@/components/app/invite-panel";
import {
  IncomingInvitationList,
  SentInvitationList,
} from "@/components/app/invitation-list";
import { MessageButton } from "@/components/app/message-button";
import {
  MyTeamEnquiriesList,
  TeamEnquiryButton,
} from "@/components/app/team-enquiry-entry";

/**
 * "Mano tinklas" (core-network area B) — a SUB-SURFACE of the person /
 * company context, never a second dashboard: my organizations, my active
 * relationships, people & company search, and the canonical "Pakviesti"
 * action with real invitation lifecycle (sent / resend / revoke / accepted).
 *
 * Privacy by construction: the people search runs under the fail-closed
 * `can_view_worker` RLS (consented discoverability or a real work
 * relationship); no email, phone or exact location is ever selected or
 * rendered; exact-email invitations never reveal whether an account exists.
 */

export const dynamic = "force-dynamic";

export default async function NetworkPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; type?: string; org?: string; project?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { q, type, org, project } = await searchParams;

  const t = await getTranslations("network");
  // W7-S4: the organizations block absorbed from `/dashboard/profile`
  // (`#managed-companies`) keeps its EXACT existing copy — the same
  // `marketplaceHub.company.*` / `marketplaceHub.individual.desc` keys it
  // rendered on the profile. No key is added, renamed or retranslated, so the
  // move cannot introduce i18n debt or change what the user reads. (The
  // `marketplaceHub` namespace name is now a misnomer — it has no marketplace
  // caller left. Renaming it is copy debt recorded in the S4 audit, not part
  // of an information-architecture move.)
  const tHub = await getTranslations("marketplaceHub");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login?next=/${locale}/dashboard/network`);

  const [
    orgsResult,
    projects,
    engagements,
    sent,
    incoming,
    myTeamEnquiries,
    // W7-S4: joins the existing batch rather than adding a serial stage — the
    // move must not re-introduce the waterfall W7-S3 removed from the profile.
    employerOwnerProfileId,
  ] = await Promise.all([
    getOwnedOrganizations(),
    listManagedProjects(),
    listMyEngagements(),
    listMySentInvitations(),
    listInvitationsForMe(),
    listMyTeamEnquiries(),
    getEmployerOwnerProfileId(),
  ]);
  const organizations =
    orgsResult.kind === "ok"
      ? orgsResult.organizations.map((o) => ({ id: o.id, name: o.name }))
      : [];
  const search = q ? await searchPeopleAndCompanies(q) : null;

  return (
    <div className="flex flex-col gap-6" data-testid="network-page">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("intro")}</p>
      </header>

      {/* Invitations addressed to ME — the most actionable thing first. */}
      {incoming.status === "ok" && incoming.items.length > 0 && (
        <section className="flex flex-col gap-2" data-testid="network-incoming">
          <h2 className="font-mono text-meta uppercase tracking-label text-text-secondary">
            {t("incoming.title")}
          </h2>
          <IncomingInvitationList items={incoming.items} locale={locale} />
        </section>
      )}

      {/* People & company search. */}
      <section className="flex flex-col gap-3" data-testid="network-search">
        <h2 className="font-mono text-meta uppercase tracking-label text-text-secondary">
          {t("search.title")}
        </h2>
        <form
          action={`/${locale}/dashboard/network`}
          method="get"
          className="flex flex-wrap items-center gap-2"
        >
          <label className="sr-only" htmlFor="network-search-input">
            {t("search.label")}
          </label>
          <input
            id="network-search-input"
            type="search"
            name="q"
            defaultValue={q ?? ""}
            minLength={2}
            maxLength={80}
            placeholder={t("search.placeholder")}
            data-testid="network-search-input"
            className="min-h-10 min-w-0 flex-1 rounded-md border border-ink-500 bg-ink-800/40 px-3 py-2 text-sm text-text-primary"
          />
          <button
            type="submit"
            className="inline-flex min-h-10 items-center rounded-md border border-brand-blue/50 px-4 py-2 text-sm font-medium text-brand-blue hover:border-brand-blue"
          >
            {t("search.submit")}
          </button>
        </form>
        {search && (
          <div className="flex flex-col gap-3" data-testid="network-search-results">
            {/* Why these people are visible (owner UX recovery v1): the
                fail-closed visibility rule, stated once above the results —
                every listed person has a reason to be here. */}
            {search.people.length > 0 && (
              <p
                className="text-meta leading-relaxed text-text-muted"
                data-testid="network-visibility-reason"
              >
                {t("search.visibilityReason")}
              </p>
            )}
            {search.people.length === 0 && search.companies.length === 0 ? (
              <p className="text-xs text-text-muted" data-testid="network-search-empty">
                {t("search.empty")}
              </p>
            ) : (
              <>
                {search.people.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {search.people.map((p) => (
                      <li
                        key={p.workerId}
                        className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2"
                        data-testid={`network-person-${p.workerId}`}
                      >
                        <span className="text-sm font-medium text-text-primary">
                          {p.displayName}
                        </span>
                        {(p.city ?? p.country) && (
                          <span className="text-meta text-text-muted">
                            {[p.city, p.country].filter(Boolean).join(", ")}
                          </span>
                        )}
                        <span className="ml-auto">
                          {/* Contact goes through the existing permission-
                              gated message flow — never a raw channel. */}
                          <MessageButton
                            profileId={p.profileId}
                            labelKey="messageWorker"
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {search.companies.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {search.companies.map((c) => (
                      <li
                        key={c.organizationId}
                        className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2"
                        data-testid={`network-company-${c.organizationId}`}
                      >
                        <span className="text-sm font-medium text-text-primary">
                          {c.displayName}
                        </span>
                        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                          {t(`search.orgType.${c.organizationType}`)}
                        </span>
                        {c.country && (
                          <span className="text-meta text-text-muted">{c.country}</span>
                        )}
                        {/* Trust Connect Teams v1: where a TEAM is already
                            legitimately visible (this public-display search),
                            the structured enquiry replaces off-platform
                            contact hunting. Not a directory — nothing new is
                            exposed. */}
                        {c.organizationType === "team" && (
                          <TeamEnquiryButton teamOrgId={c.organizationId} locale={locale} />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {/* The canonical Pakviesti action. */}
      <InvitePanel
        locale={locale}
        organizations={organizations}
        projects={projects.map((p) => ({ id: p.id, title: p.title }))}
        defaultType={type}
        defaultOrganizationId={org}
        defaultProjectId={project}
      />

      {/* My sent invitations with the real lifecycle. */}
      <section className="flex flex-col gap-2" data-testid="network-sent">
        <h2 className="font-mono text-meta uppercase tracking-label text-text-secondary">
          {t("sent.title")}
        </h2>
        {sent.status === "ok" ? (
          <SentInvitationList items={sent.items} locale={locale} />
        ) : sent.status === "needs-migration" ? (
          <p className="text-xs text-text-muted" data-testid="network-sent-not-enabled">
            {t("notEnabled")}
          </p>
        ) : (
          <p className="text-xs text-text-muted">{t("sent.error")}</p>
        )}
      </section>

      {/* My enquiries to teams (Trust Connect Teams v1) — shown once at
          least one real enquiry exists; the entry point lives on the team
          rows in the search above. */}
      {myTeamEnquiries.status === "ok" && myTeamEnquiries.items.length > 0 && (
        <section className="flex flex-col gap-2" data-testid="network-team-enquiries">
          <h2 className="font-mono text-meta uppercase tracking-label text-text-secondary">
            {t("teamEnquiriesTitle")}
          </h2>
          <MyTeamEnquiriesList items={myTeamEnquiries.items} locale={locale} />
        </section>
      )}

      {/* My organizations — the ONE surface (W7-S4).
          `/dashboard/profile#managed-companies` rendered this SAME
          `getOwnedOrganizations()` list with the SAME `/dashboard/company`
          destination, so the person-identity page and this page disagreed
          about nothing except which of them you happened to be on. The profile
          copy is gone; the three things it carried that this section did not
          are folded in below: the add-company action, the honest zero-company
          state, and the individual-activity note.

          Why here and not `/dashboard/company` (which `W7_S1_PROFILE_HUB_
          OVERVIEW.md` §11 proposed): that route is role-gated by
          `requireRoleOrRedirect(locale, "company")` and renders only the
          ACTIVE workspace's single company. A person with zero companies —
          exactly the reader the add-company action is for — is redirected away
          from it. Moving the block there would have deleted the capability
          instead of rehoming it. */}
      <section className="flex flex-col gap-2" data-testid="network-organizations">
        <h2 className="font-mono text-meta uppercase tracking-label text-text-secondary">
          {t("organizations.title")}
        </h2>
        {organizations.length > 0 ? (
          <>
            <ul className="flex flex-col gap-2">
              {organizations.map((o) => (
                <li key={o.id}>
                  <Link
                    href={"/dashboard/company" as "/dashboard"}
                    className="flex min-h-11 items-center gap-2 rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2 text-sm text-text-primary transition-colors hover:border-brand-blue"
                    data-testid={`network-org-${o.id}`}
                  >
                    {o.name}
                  </Link>
                </li>
              ))}
            </ul>
            {/* Absorbed from the profile: owning one company must never hide
                the way to add a second. The header role-switcher only offers
                the "add Įmonė" path to a profile that holds NO company
                identity, so without this link a one-company owner had no
                route to a second organization anywhere in the product. */}
            <Link
              href="/dashboard/start/company"
              className="inline-flex min-h-11 w-fit items-center font-mono text-meta uppercase tracking-label text-brand-blue hover:underline"
              data-testid="network-add-company"
            >
              + {tHub("company.noCompanyCta")}
            </Link>
          </>
        ) : (
          /* Absorbed from the profile: this page used to render NOTHING at
             zero organizations, so the move would have silently dropped both
             the explanation and the first-company action. */
          <>
            <p className="text-sm text-text-secondary">
              {tHub("company.noCompanyDesc")}
            </p>
            <Link
              href="/dashboard/start/company"
              className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md border border-brand-blue/40 bg-brand-blue/5 px-3 py-1.5 text-sm text-brand-blue hover:bg-brand-blue/10"
              data-testid="network-add-company"
            >
              + {tHub("company.noCompanyCta")}
            </Link>
          </>
        )}
        {/* Absorbed from the profile: self-employed / individual activity is
            the person acting WITHOUT a company. Said once, next to the company
            list it contrasts with — and it now points at the personal profile
            from a different page instead of at the page you are already on. */}
        <p className="text-xs leading-relaxed text-text-muted">
          {tHub("individual.desc")}
        </p>
      </section>

      {/* My active relationships (the other side of the network). */}
      <section className="flex flex-col gap-2" data-testid="network-relationships">
        <h2 className="font-mono text-meta uppercase tracking-label text-text-secondary">
          {t("relationships.title")}
        </h2>
        {/* W7-S4: the worker→employer "Rašyti įmonei" entry, moved here from
            `/dashboard/profile`. Same reader, same RLS scope (the caller's own
            accepted `company_worker_invitations` row), same no-dead-button
            rule — null resolves to nothing rendered.

            NOT `/dashboard/communication`, which
            `W7_S1_PROFILE_HUB_OVERVIEW.md` §11 named: the counterpart-trust
            P0 guard (`message-counterpart-restricted.test.ts`) forbids ANY
            contact button on the two thread surfaces, because a CTA beside a
            permission-restricted counterparty is a route to a stranger. This
            page is the relationships surface and already contacts people the
            viewer has a real relationship with through this exact component
            (`messageWorker`, on the search rows). Being employed by someone
            is such a relationship, so the entry sits with the others. */}
        {employerOwnerProfileId && (
          <div data-testid="network-message-employer">
            <MessageButton
              profileId={employerOwnerProfileId}
              labelKey="messageCompany"
            />
          </div>
        )}
        {/* Why each row is here: only ACTIVE work relationships appear, and
            the chip on every row names the relationship (owner UX recovery
            v1: no unexplained people). */}
        {engagements.length > 0 && (
          <p
            className="text-meta leading-relaxed text-text-muted"
            data-testid="network-relationships-why"
          >
            {t("relationships.why")}
          </p>
        )}
        {engagements.length === 0 ? (
          <p className="text-xs text-text-muted">{t("relationships.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {engagements.map((e) => (
              <li
                key={e.engagementId}
                className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2"
                data-testid={`network-engagement-${e.engagementId}`}
              >
                <span className="text-sm text-text-primary">
                  {e.organizationName ?? t("relationships.noOrg")}
                </span>
                <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {t(`relationships.slug.${e.relationshipSlug}`)}
                </span>
                {e.title && (
                  <span className="text-meta text-text-muted">{e.title}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
