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
import { InvitePanel } from "@/components/app/invite-panel";
import {
  IncomingInvitationList,
  SentInvitationList,
} from "@/components/app/invitation-list";
import { MessageButton } from "@/components/app/message-button";

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login?next=/${locale}/dashboard/network`);

  const [orgsResult, projects, engagements, sent, incoming] = await Promise.all([
    getOwnedOrganizations(),
    listManagedProjects(),
    listMyEngagements(),
    listMySentInvitations(),
    listInvitationsForMe(),
  ]);
  const organizations =
    orgsResult.kind === "ok"
      ? orgsResult.organizations.map((o) => ({ id: o.id, name: o.name }))
      : [];
  const search = q ? await searchPeopleAndCompanies(q) : null;

  return (
    <div className="flex flex-col gap-6" data-testid="network-page">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
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
          <h2 className="font-mono text-[11px] uppercase tracking-label text-text-secondary">
            {t("incoming.title")}
          </h2>
          <IncomingInvitationList items={incoming.items} locale={locale} />
        </section>
      )}

      {/* People & company search. */}
      <section className="flex flex-col gap-3" data-testid="network-search">
        <h2 className="font-mono text-[11px] uppercase tracking-label text-text-secondary">
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
                className="text-[11px] leading-relaxed text-text-muted"
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
                          <span className="text-[11px] text-text-muted">
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
                        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                          {t(`search.orgType.${c.organizationType}`)}
                        </span>
                        {c.country && (
                          <span className="text-[11px] text-text-muted">{c.country}</span>
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
        <h2 className="font-mono text-[11px] uppercase tracking-label text-text-secondary">
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

      {/* My organizations. */}
      {organizations.length > 0 && (
        <section className="flex flex-col gap-2" data-testid="network-organizations">
          <h2 className="font-mono text-[11px] uppercase tracking-label text-text-secondary">
            {t("organizations.title")}
          </h2>
          <ul className="flex flex-col gap-2">
            {organizations.map((o) => (
              <li key={o.id}>
                <Link
                  href={"/dashboard/company" as "/dashboard"}
                  className="flex items-center gap-2 rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2 text-sm text-text-primary transition-colors hover:border-brand-blue"
                  data-testid={`network-org-${o.id}`}
                >
                  {o.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* My active relationships (the other side of the network). */}
      <section className="flex flex-col gap-2" data-testid="network-relationships">
        <h2 className="font-mono text-[11px] uppercase tracking-label text-text-secondary">
          {t("relationships.title")}
        </h2>
        {/* Why each row is here: only ACTIVE work relationships appear, and
            the chip on every row names the relationship (owner UX recovery
            v1: no unexplained people). */}
        {engagements.length > 0 && (
          <p
            className="text-[11px] leading-relaxed text-text-muted"
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
                <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {t(`relationships.slug.${e.relationshipSlug}`)}
                </span>
                {e.title && (
                  <span className="text-[11px] text-text-muted">{e.title}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
