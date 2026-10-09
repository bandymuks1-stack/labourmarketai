import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/company/active-organization";
import { activeOrganizationAuthority } from "@/lib/company/organization-authority";
import { listMyMembershipInvitations } from "@/lib/company/memberships";
import { getMembershipLabels } from "@/lib/company/membership-labels";
import { MembershipInvitationsPanel } from "@/components/app/membership-invitations-panel";
import { MyOnboardingSection } from "./my-onboarding-section";
import { isLifecycleNotice } from "@/lib/lifecycle/lifecycle-model";
import { PageTitle } from "@/components/app/premium/page-title";

/**
 * Stage 2 — Activity Setup Hub.
 *
 * Single entry surface for the three side-roles (Agency / Company /
 * Buyer). Reads the user's REAL state from `public.agencies`,
 * `public.companies`, and `public.profile_roles` and renders each
 * lane as either:
 *
 *   - "Already started" (✓) — the entity row exists, show its
 *     legal_name + country + a link to the role dashboard;
 *   - "Start now" — no entity row yet, link to the setup form;
 *   - Buyer reads public.customers (real since 0026) and renders the
 *     same started / start-now pattern in plain language.
 *
 * No fake counts, no fake names, no static preview labels.
 */

export default async function ActivitySetupHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Honest `?lc=` outcome from the worker-side onboarding confirmations
  // (NATIVE-NAV actions); unknown values are dropped, never rendered raw.
  const sp = (await searchParams) ?? {};
  const rawLc = typeof sp.lc === "string" ? sp.lc : "";
  const lifecycleNotice = isLifecycleNotice(rawLc) ? rawLc : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  // Read REAL entity rows. Each query is RLS-gated:
  //   - agencies.agencies_select policy: (profile_id = auth.uid())
  //   - companies.companies_select policy: same shape
  // If no row exists for this user, data is null.
  const [agencyRes, companyRes, customerRes] = await Promise.all([
    supabase
      .from("agencies")
      .select("id, legal_name, country, created_at")
      .eq("profile_id", user.id)
      .maybeSingle(),
    supabase
      .from("companies")
      .select("id, legal_name, display_name, country, created_at")
      .eq("profile_id", user.id)
      .maybeSingle(),
    supabase
      .from("customers")
      .select("id, contact_name, country, created_at")
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);
  const agency = agencyRes.data;
  const company = companyRes.data;
  const customer = customerRes.data;

  // Every locale reads its own catalogue (activitySetupHub). This hub was
  // inline LT/EN pairs, so RU/PL/DE/NL readers got English on the first
  // screen after registration (walk 2026-10-08).
  const t = await getTranslations("activitySetupHub");

  // M-P0-4 Slice 2 — the INVITEE's governance surface. Invitations addressed
  // to me render in ANY workspace (an invitee holds no membership yet, so
  // this hub — open to every authenticated person — is where a seat is
  // accepted; the bell's `pending-membership-invitations` signal points
  // here). The MEMBER DIRECTORY moved to the organization's Settings door
  // (capability matrix P1, 2026-09-23): governance of an organization is
  // administration of that organization. When the ACTIVE workspace is one
  // the caller belongs to, this hub says so and points there. Labels come
  // from the catalogue (all 11 locales) — they were inline LT/EN pairs.
  // The ONE session resolution the chip renders (identity read inside it).
  const workspace = await getWorkspaceContext();
  const activeMembership = activeOrganizationAuthority(workspace);
  const activeWorkspaceName =
    workspace.workspaces.find((w) => w.id === activeMembership.organizationId)?.name ?? "";
  const [invitationsRes, membershipLabels, tMembers] = await Promise.all([
    listMyMembershipInvitations(),
    getMembershipLabels(),
    getTranslations("organizationMembers"),
  ]);
  const invitations =
    invitationsRes.kind === "ok" ? invitationsRes.invitations : [];

  return (
    <div className="flex flex-col gap-6" data-testid="activity-setup-hub">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("eyebrow")}
        </p>
        <PageTitle>{t("title")}</PageTitle>
        <p className="text-sm text-text-secondary">
          {t("subtitle")}
        </p>
      </header>

      {/* My onboarding checklist (employee lifecycle v1) — renders ONLY
          while an employer-started run is open for one of my engagements;
          plain-language, confirm-own-items only. */}
      <MyOnboardingSection locale={locale} notice={lifecycleNotice} />

      <MembershipInvitationsPanel
        invitations={invitations}
        labels={membershipLabels.invitations}
      />

      {/* The member directory of the ACTIVE organization lives behind its
          Settings door now — one line here says where, for every governance
          role (a member reaches it through the membership gate too). */}
      {activeMembership.authority.canOpen ? (
        <p
          className="text-sm text-text-secondary"
          data-testid="org-members-moved-to-settings"
        >
          {tMembers("start.membersMoved", {
            workspace: activeWorkspaceName || tMembers("start.unnamedOrganization"),
          })}{" "}
          <Link
            href={"/dashboard/company/settings#organization-members" as "/dashboard"}
            className="font-medium text-brand-blue underline-offset-2 hover:underline"
            data-testid="org-members-open-settings"
          >
            {tMembers("start.openSettings")} →
          </Link>
        </p>
      ) : null}

      <section
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="activity-setup-lane-grid"
      >
        {/* ── Agency lane (LEGACY holders only) ──────────────────
            Owner directive (company-role-simplicity-v1): an agency is a
            COMPANY TYPE ('staffing_agency') inside the company profile, not
            a separate root role. The lane renders ONLY for users who already
            have a legacy agencies row, so their tools stay reachable. New
            users never see an agency start path here. */}
        {agency ? (
          <article
            className="card-border flex flex-col gap-3 p-4"
            data-testid="activity-setup-lane-agency"
          >
            <header className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-text-primary">
                {t("agency")}
              </h2>
              <span className="rounded bg-state-success/20 px-2 py-0.5 text-xs text-state-success">
                {t("started")}
              </span>
            </header>
            <p className="text-sm text-text-secondary">
              {t("agencyStarted")}
            </p>
            <p className="text-xs text-text-muted">
              {t("agencyIsCompanyType")}
            </p>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-text-muted">
                  {t("legalName")}
                </dt>
                <dd className="text-text-primary">
                  {agency.legal_name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">
                  {t("country")}
                </dt>
                <dd className="text-text-primary">
                  {agency.country ?? "—"}
                </dd>
              </div>
            </dl>
            {/* Beta audit F2: this linked "/dashboard/agency", a route that
                does not exist (the typed-routes cast hid the 404). The agency
                workspace is still `preparing` in the feature catalogue, so no
                honest destination exists yet — the dead link is removed
                rather than pointed somewhere it does not belong. */}
          </article>
        ) : null}

        {/* ── Company lane ───────────────────────────────────── */}
        <article
          className="card-border flex flex-col gap-3 p-4"
          data-testid="activity-setup-lane-company"
        >
          <header className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {t("company")}
            </h2>
            {company ? (
              <span className="rounded bg-state-success/20 px-2 py-0.5 text-xs text-state-success">
                {t("started")}
              </span>
            ) : (
              <span className="rounded bg-ink-700/40 px-2 py-0.5 text-xs text-text-muted">
                {t("notStarted")}
              </span>
            )}
          </header>
          {company ? (
            <>
              <p className="text-sm text-text-secondary">
                {t("companyStarted")}
              </p>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-text-muted">
                    {t("legalName")}
                  </dt>
                  <dd className="text-text-primary">
                    {company.legal_name ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">
                    {t("country")}
                  </dt>
                  <dd className="text-text-primary">
                    {company.country ?? "—"}
                  </dd>
                </div>
              </dl>
              <Link
                href={"/dashboard/start/company" as "/dashboard"}
                className="self-start text-sm text-brand-blue hover:underline"
              >
                {t("openCompanySetup")}
              </Link>
              <Link
                href={"/dashboard/company" as "/dashboard"}
                className="self-start text-xs text-text-secondary hover:underline"
              >
                {t("goToCompanyDashboard")}
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-text-secondary">
                {t("companyIntro")}
              </p>
              <Link
                href={"/dashboard/start/company" as "/dashboard"}
                className="inline-flex min-h-11 items-center self-start rounded-md border border-brand-blue px-3 text-sm text-brand-blue hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                data-testid="activity-setup-lane-company-start"
              >
                {t("startCompanySetup")}
              </Link>
            </>
          )}
        </article>

        {/* ── Buyer lane (real state, plain language) ─────────────
            The buyer profile has been REAL since the customers entity
            shipped — this lane previously still showed an outdated
            technical blocker. Now it mirrors the company lane: live
            state + a plain-language description of what works. */}
        <article
          className="card-border flex flex-col gap-3 p-4"
          data-testid="activity-setup-lane-buyer"
        >
          <header className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {t("buyer")}
            </h2>
            {customer ? (
              <span className="rounded bg-state-success/20 px-2 py-0.5 text-xs text-state-success">
                {t("started")}
              </span>
            ) : (
              <span className="rounded bg-ink-700/40 px-2 py-0.5 text-xs text-text-muted">
                {t("notStarted")}
              </span>
            )}
          </header>
          {customer ? (
            <>
              <p className="text-sm text-text-secondary">
                {t("buyerStarted")}
              </p>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-text-muted">
                    {t("nameContact")}
                  </dt>
                  <dd className="text-text-primary">
                    {customer.contact_name ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">
                    {t("country")}
                  </dt>
                  <dd className="text-text-primary">
                    {customer.country ?? "—"}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="text-sm text-text-secondary">
              {t("buyerIntro")}
            </p>
          )}
          <Link
            href={"/dashboard/start/buyer" as "/dashboard"}
            className="inline-flex min-h-11 items-center self-start rounded-md border border-brand-blue px-3 text-sm text-brand-blue hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            data-testid="activity-setup-lane-buyer-start"
          >
            {customer
              ? t("openBuyerSetup")
              : t("startBuyerProfile")}
          </Link>
        </article>
      </section>

      <footer className="flex flex-col gap-1 text-xs text-text-secondary">
        <p>
          {t("footer")}
        </p>
      </footer>
    </div>
  );
}
