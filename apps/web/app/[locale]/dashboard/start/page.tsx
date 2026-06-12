import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

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
 *   - "Honest partial / blocker" — for Buyer, where the schema does
 *     not yet have a customer/buyer entity table (M3 scope per
 *     migration 0007 comment), surface that explicitly with a link
 *     to the existing pilot-draft form which DOES persist.
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
  const [agencyRes, companyRes, rolesRes] = await Promise.all([
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
      .from("profile_roles")
      .select("role")
      .eq("profile_id", user.id)
      .eq("is_active", true),
  ]);
  const agency = agencyRes.data;
  const company = companyRes.data;
  const heldRoles = new Set(
    (rolesRes.data ?? []).map((r) => r.role as string),
  );
  const hasCustomerRole = heldRoles.has("customer");

  const uiLocale: "lt" | "en" = locale === "lt" ? "lt" : "en";
  const label = (lt: string, en: string) => (uiLocale === "lt" ? lt : en);

  return (
    <div className="flex flex-col gap-6" data-testid="activity-setup-hub">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
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
            <Link
              href={"/dashboard/agency" as "/dashboard"}
              className="self-start text-xs text-text-secondary hover:underline"
            >
              {label("Eiti į agentūros dashboardą →", "Go to agency dashboard →")}
            </Link>
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
                className="self-start rounded-md border border-brand-blue px-3 py-1.5 text-sm text-brand-blue hover:bg-brand-blue/10"
                data-testid="activity-setup-lane-company-start"
              >
                {label("Pradėti įmonės nustatymą →", "Start company setup →")}
              </Link>
            </>
          )}
        </article>

        {/* ── Buyer lane (honest partial) ────────────────────── */}
        <article
          className="card-border flex flex-col gap-3 p-4"
          data-testid="activity-setup-lane-buyer"
        >
          <header className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {label("Pirkėjas", "Buyer")}
            </h2>
            <span className="rounded bg-state-warning/20 px-2 py-0.5 text-xs text-state-warning">
              {label("dalinis", "partial")}
            </span>
          </header>
          <p className="text-sm text-text-secondary">
            {label(
              "Pirkėjo (customer) entiteto lentelė dar nesukurta (M3 etapas pagal 0007 migracijos komentarą).",
              "The buyer (customer) entity table does not yet exist (M3 scope per migration 0007 comment).",
            )}
          </p>
          <p className="text-xs text-text-secondary">
            {label("Kas veikia dabar:", "What works now:")}
          </p>
          <ul className="ml-4 list-disc text-xs text-text-secondary">
            <li>
              {label(
                "pilot_drafts lentelė — pirkėjo užklausos juodraštis išsaugomas tikrai;",
                "pilot_drafts table — your buyer request draft persists for real;",
              )}
            </li>
            <li>
              {label(
                hasCustomerRole
                  ? "jūs jau turite customer vaidmenį profile_roles kataloge."
                  : "customer vaidmuo dar nepridėtas — galite jį pridėti per /dashboard/start/buyer.",
                hasCustomerRole
                  ? "you already hold the customer role in profile_roles."
                  : "the customer role is not yet added — add it via /dashboard/start/buyer.",
              )}
            </li>
          </ul>
          <p className="text-xs text-state-warning">
            {label("Blokas:", "Blocker:")}{" "}
            {label(
              "trūksta DB lentelės pvz. public.customers su profile_id + service_area + budget_range. Migracija atskirame PR.",
              "missing DB table e.g. public.customers with profile_id + service_area + budget_range. Migration in a separate PR.",
            )}
          </p>
          <Link
            href={"/dashboard/start/buyer" as "/dashboard"}
            className="self-start rounded-md border border-state-warning px-3 py-1.5 text-sm text-state-warning hover:bg-state-warning/10"
            data-testid="activity-setup-lane-buyer-start"
          >
            {label("Atidaryti pirkėjo būseną →", "Open buyer state →")}
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
