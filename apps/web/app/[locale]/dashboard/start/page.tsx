import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/session-profile";
import { baseIdentityForRole } from "@/lib/config/roles";
import { getWorkspaceContext } from "@/lib/company/active-organization";
import { PERSONAL_WORKSPACE_ID } from "@/lib/company/organization-switch";
import {
  listMyMembershipInvitations,
  listOrganizationMembers,
  type MembershipRole,
} from "@/lib/company/memberships";
import { MembershipInvitationsPanel } from "@/components/app/membership-invitations-panel";
import { OrganizationMembersSection } from "@/components/app/organization-members-section";

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
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

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

  const uiLocale: "lt" | "en" = locale === "lt" ? "lt" : "en";
  const label = (lt: string, en: string) => (uiLocale === "lt" ? lt : en);

  // M-P0-4 Slice 2 — governance surfaces. Invitations addressed to me render
  // in ANY workspace; the member directory renders when the ACTIVE workspace
  // is an organization the caller belongs to. Both degrade silently when the
  // membership schema is absent in this environment (feature-detected).
  const session = await getSessionProfile();
  const identity = session.profile?.active_role
    ? baseIdentityForRole(session.profile.active_role)
    : null;
  const workspace = await getWorkspaceContext(identity);
  const activeOrgId =
    workspace.activeWorkspaceId !== PERSONAL_WORKSPACE_ID &&
    workspace.workspaces.some(
      (w) => w.kind === "organization" && w.id === workspace.activeWorkspaceId,
    )
      ? workspace.activeWorkspaceId
      : null;
  const [invitationsRes, membersRes] = await Promise.all([
    listMyMembershipInvitations(),
    activeOrgId
      ? listOrganizationMembers(activeOrgId)
      : Promise.resolve(null),
  ]);
  const invitations =
    invitationsRes.kind === "ok" ? invitationsRes.invitations : [];
  const members = membersRes?.kind === "ok" ? membersRes.members : [];
  const myRole = membersRes?.kind === "ok" ? membersRes.myRole : null;

  const roleLabels: Record<MembershipRole, string> = {
    owner: label("Savininkas", "Owner"),
    admin: label("Administratorius", "Admin"),
    manager: label("Vadovas", "Manager"),
    external_manager: label("Išorinis vadovas", "External manager"),
    member: label("Narys", "Member"),
  };
  const outcomeLabels: Record<string, string> = {
    invited: label("Pakvietimas išsiųstas.", "Invitation sent."),
    accepted: label("Pakvietimas priimtas.", "Invitation accepted."),
    declined: label("Pakvietimas atmestas.", "Invitation declined."),
    cancelled: label("Pakvietimas atšauktas.", "Invitation cancelled."),
    role_changed: label("Rolė pakeista.", "Role changed."),
    revoked: label("Narystė atšaukta.", "Membership revoked."),
    left: label("Palikote organizaciją.", "You left the organization."),
    unchanged: label("Rolė nepakito.", "Role unchanged."),
    already_member: label("Šis žmogus jau narys.", "Already a member."),
    already_invited: label("Pakvietimas jau laukia.", "Invitation already pending."),
    already_active: label("Narystė jau aktyvi.", "Membership already active."),
    not_invited: label("Pakvietimas neberastas.", "Invitation not available."),
    not_active: label("Narystė nebeaktyvi.", "Membership is not active."),
    not_a_member: label("Nesate šios organizacijos narys.", "You are not a member."),
    not_found: label("Įrašas neberastas.", "Record not available."),
    not_authorized: label("Neturite teisės šiam veiksmui.", "You are not authorized for this."),
    no_such_user: label("Tokio naudotojo nėra.", "No user with this email."),
    cannot_invite_self: label("Savęs pakviesti negalima.", "You cannot invite yourself."),
    invalid_role: label("Netinkama rolė.", "Invalid role."),
    last_owner: label(
      "Paskutinis savininkas negali pasitraukti — pirmiau paskirkite kitą savininką.",
      "The last owner cannot step down — activate another owner first.",
    ),
    no_workspace: label(
      "Pirmiausia pasirinkite organizacijos erdvę.",
      "Select an organization workspace first.",
    ),
    needs_migration: label(
      "Ši funkcija dar neįjungta šioje aplinkoje.",
      "This capability is not enabled in this environment yet.",
    ),
    invalid: label("Netinkami duomenys.", "Invalid input."),
    error: label("Nepavyko — bandykite dar kartą.", "Something failed — try again."),
  };

  return (
    <div className="flex flex-col gap-6" data-testid="activity-setup-hub">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
          {label("VEIKLOS PRADŽIA", "ACTIVITY SETUP")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {label("Nuo ko pradėti", "Where to start")}
        </h1>
        <p className="text-sm text-text-secondary">
          {label(
            "Trys realios veiklos kryptys. Kiekviena rodo dabartinę būseną — ar jau pradėta, ar dar laukia veiksmo, ar blokuojama duomenų bazės lygmenyje.",
            "Three real activity paths. Each shows its current state — already started, waiting for an action, or schema-blocked.",
          )}
        </p>
      </header>

      <MembershipInvitationsPanel
        invitations={invitations}
        labels={{
          heading: label("Pakvietimai į organizacijas", "Organization invitations"),
          explainer: label(
            "Jums adresuoti valdymo pakvietimai. Priėmus organizacija atsiras erdvių perjungiklyje.",
            "Governance invitations addressed to you. Accepting makes the organization appear in your workspace switcher.",
          ),
          roleLabels,
          accept: label("Priimti", "Accept"),
          decline: label("Atmesti", "Decline"),
          outcomes: outcomeLabels,
        }}
      />

      {activeOrgId && members.length > 0 && (
        <OrganizationMembersSection
          members={members}
          myRole={myRole}
          myProfileId={user.id}
          labels={{
            heading: label("Organizacijos nariai", "Organization members"),
            explainer: label(
              "Aktyvios erdvės valdymo narystės. Narystė nėra įdarbinimas — ji nekuria ir nenutraukia darbo santykių.",
              "Governance memberships of the active workspace. Membership is not employment — it never creates or ends an engagement.",
            ),
            roleLabels,
            statusInvited: label("pakviesta", "invited"),
            inviteHeading: label("Pakviesti narį", "Invite a member"),
            inviteEmail: label("El. paštas", "Email"),
            inviteRole: label("Rolė", "Role"),
            inviteSubmit: label("Pakviesti", "Invite"),
            cancelInvite: label("Atšaukti pakvietimą", "Cancel invite"),
            revoke: label("Atšaukti narystę", "Revoke"),
            leave: label("Palikti organizaciją", "Leave"),
            outcomes: outcomeLabels,
          }}
        />
      )}

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
                {label("Agentūra", "Agency")}
              </h2>
              <span className="rounded bg-state-success/20 px-2 py-0.5 text-xs text-state-success">
                {label("✓ Pradėta", "✓ Started")}
              </span>
            </header>
            <p className="text-sm text-text-secondary">
              {label("Agentūros profilis pradėtas.", "Agency profile started.")}
            </p>
            <p className="text-xs text-text-muted">
              {label(
                "Nuo šiol agentūra yra įmonės tipas — naują agentūrą kurkite kaip įmonę, kurios tipas „Personalo agentūra“.",
                "Going forward an agency is a company type — start a new agency as a company whose type is “Staffing agency”.",
              )}
            </p>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-text-muted">
                  {label("Pavadinimas", "Legal name")}
                </dt>
                <dd className="text-text-primary">
                  {agency.legal_name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">
                  {label("Šalis", "Country")}
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
              {label("Įmonė", "Company")}
            </h2>
            {company ? (
              <span className="rounded bg-state-success/20 px-2 py-0.5 text-xs text-state-success">
                {label("✓ Pradėta", "✓ Started")}
              </span>
            ) : (
              <span className="rounded bg-ink-700/40 px-2 py-0.5 text-xs text-text-muted">
                {label("dar nepradėta", "not started")}
              </span>
            )}
          </header>
          {company ? (
            <>
              <p className="text-sm text-text-secondary">
                {label("Įmonės profilis pradėtas.", "Company profile started.")}
              </p>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-text-muted">
                    {label("Pavadinimas", "Legal name")}
                  </dt>
                  <dd className="text-text-primary">
                    {company.legal_name ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">
                    {label("Šalis", "Country")}
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
                {label("Atidaryti įmonės nustatymą →", "Open company setup →")}
              </Link>
              <Link
                href={"/dashboard/company" as "/dashboard"}
                className="self-start text-xs text-text-secondary hover:underline"
              >
                {label("Eiti į įmonės dashboardą →", "Go to company dashboard →")}
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-text-secondary">
                {label(
                  "Sukurkite įmonės profilį. Tipą (statyba, personalo agentūra, subrangovas, gamyba, paslaugos, klientas / užsakovas, kita) pasirinksite profilyje — vienas profilis visiems tipams.",
                  "Create a company profile. You pick the type (construction, staffing agency, subcontractor, manufacturing, services, client / requester, other) inside it — one profile for every type.",
                )}
              </p>
              <Link
                href={"/dashboard/start/company" as "/dashboard"}
                className="inline-flex min-h-11 items-center self-start rounded-md border border-brand-blue px-3 text-sm text-brand-blue hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                data-testid="activity-setup-lane-company-start"
              >
                {label("Pradėti įmonės nustatymą →", "Start company setup →")}
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
              {label("Pirkėjas", "Buyer")}
            </h2>
            {customer ? (
              <span className="rounded bg-state-success/20 px-2 py-0.5 text-xs text-state-success">
                {label("✓ Pradėta", "✓ Started")}
              </span>
            ) : (
              <span className="rounded bg-ink-700/40 px-2 py-0.5 text-xs text-text-muted">
                {label("dar nepradėta", "not started")}
              </span>
            )}
          </header>
          {customer ? (
            <>
              <p className="text-sm text-text-secondary">
                {label(
                  "Pirkėjo profilis pradėtas. Galite kurti darbo užklausas — jos lieka privačios, kol nenuspręsite kitaip.",
                  "Buyer profile started. You can create work requests — they stay private until you decide otherwise.",
                )}
              </p>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-text-muted">
                    {label("Vardas / kontaktas", "Name / contact")}
                  </dt>
                  <dd className="text-text-primary">
                    {customer.contact_name ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">
                    {label("Šalis", "Country")}
                  </dt>
                  <dd className="text-text-primary">
                    {customer.country ?? "—"}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="text-sm text-text-secondary">
              {label(
                "Ieškote žmogaus ar paslaugos sau? Susikurkite pirkėjo profilį ir aprašykite, ko reikia. Užklausos juodraštis išsaugomas ir lieka privatus. Jei perkate įmonės vardu — kurkite įmonės profilį su tipu „Klientas / užsakovas“.",
                "Looking for a person or a service for yourself? Start a buyer profile and describe what you need. Your request draft is saved and stays private. Buying on behalf of a company? Create a company profile with the “Client / requester” type instead.",
              )}
            </p>
          )}
          <Link
            href={"/dashboard/start/buyer" as "/dashboard"}
            className="inline-flex min-h-11 items-center self-start rounded-md border border-brand-blue px-3 text-sm text-brand-blue hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            data-testid="activity-setup-lane-buyer-start"
          >
            {customer
              ? label("Atidaryti pirkėjo nustatymą →", "Open buyer setup →")
              : label("Pradėti pirkėjo profilį →", "Start buyer profile →")}
          </Link>
        </article>
      </section>

      <footer className="flex flex-col gap-1 text-xs text-text-secondary">
        <p>
          {label(
            "Sąžiningas etapas · Be sintetinių darbuotojų · Be sugalvotų agentūrų · Visi skaičiai realūs iš DB.",
            "Honest stage · No synthetic workers · No invented agencies · All counts come from the live DB.",
          )}
        </p>
      </footer>
    </div>
  );
}
