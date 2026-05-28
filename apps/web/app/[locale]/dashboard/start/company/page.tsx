import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { addRole } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

/**
 * Stage 2 — Company setup (real persistence).
 *
 * Mirrors `/dashboard/start/agency` for the company role. The same
 * `addRole('company', formData)` server action drives the insert
 * into `public.companies` (legal_name + display_name + country)
 * via the migration 0007 RPC. Idempotent on retry.
 */

async function startCompanyAction(formData: FormData): Promise<void> {
  "use server";
  await addRole("company", formData);
}

export default async function CompanyStartPage({
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

  const { data: company } = await supabase
    .from("companies")
    .select("id, legal_name, display_name, country, created_at")
    .eq("profile_id", user.id)
    .maybeSingle();

  const uiLocale: "lt" | "en" = locale === "lt" ? "lt" : "en";
  const label = (lt: string, en: string) => (uiLocale === "lt" ? lt : en);

  return (
    <div className="flex flex-col gap-6" data-testid="company-start-page">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {label("ĮMONĖS NUSTATYMAS", "COMPANY SETUP")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {label("Įmonės profilis", "Company profile")}
        </h1>
      </header>

      <Link
        href={"/dashboard/start" as "/dashboard"}
        className="self-start text-sm text-text-secondary hover:underline"
      >
        ← {label("Grįžti į veiklos pradžią", "Back to activity start")}
      </Link>

      {company ? (
        <section
          className="card-border flex flex-col gap-3 p-5"
          data-testid="company-start-already-started"
        >
          <header className="flex items-center gap-2">
            <span className="rounded bg-state-success/20 px-2 py-0.5 text-xs text-state-success">
              {label("✓ Pradėta", "✓ Started")}
            </span>
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {label("Įmonės profilis pradėtas", "Company profile started")}
            </h2>
          </header>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-text-muted">
                {label("Teisinis pavadinimas", "Legal name")}
              </dt>
              <dd className="text-text-primary">
                {company.legal_name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">
                {label("Šalis", "Country")}
              </dt>
              <dd className="text-text-primary">{company.country ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-text-muted">
                {label("Sukurta", "Created at")}
              </dt>
              <dd className="text-text-primary">{company.created_at}</dd>
            </div>
          </dl>
          <p className="text-xs text-text-secondary">
            {label(
              "Šie duomenys saugomi public.companies lentelėje. Perkrovus puslapį būsena išliks.",
              "This data is stored in public.companies. Reload preserves the state.",
            )}
          </p>

          <section
            className="card-border flex flex-col gap-2 p-4"
            data-testid="company-start-workers-empty"
          >
            <h3 className="font-display text-sm font-semibold text-text-primary">
              {label("Savi darbuotojai", "Own workers")}
            </h3>
            <p className="text-sm text-text-secondary">
              {label(
                "Dar nėra darbuotojų — pridėkite arba pakvieskite darbuotoją.",
                "No workers yet — add or invite a worker.",
              )}
            </p>
            <p className="text-xs text-text-secondary">
              {label(
                "Darbo skelbimų lentelė jau veikia — galite atidaryti įmonės dashboardą ir sukurti skelbimą.",
                "Job postings already work — open the company dashboard to create one.",
              )}
            </p>
          </section>

          <Link
            href={"/dashboard/company" as "/dashboard"}
            className="self-start text-sm text-brand-blue hover:underline"
            data-testid="company-start-goto-dashboard"
          >
            {label("Eiti į įmonės dashboardą →", "Go to company dashboard →")}
          </Link>
        </section>
      ) : (
        <section
          className="card-border flex flex-col gap-4 p-5"
          data-testid="company-start-form-section"
        >
          <header className="flex flex-col gap-1">
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {label("Pradėti įmonės nustatymą", "Start company setup")}
            </h2>
            <p className="text-sm text-text-secondary">
              {label(
                "Vienas laukas — pavadinimas. Po pateikimo įrašoma į public.companies (legal_name + display_name), profile_roles pridedamas 'company' įrašas, aktyvus vaidmuo pasikeičia į 'company'.",
                "One field — the name. On submit it's written to public.companies (legal_name + display_name), a profile_roles 'company' row is added, and active workspace switches to 'company'.",
              )}
            </p>
          </header>
          <form
            action={startCompanyAction}
            className="flex flex-col gap-3"
            data-testid="company-start-form"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-secondary">
                {label("Įmonės teisinis pavadinimas", "Company legal name")}
              </span>
              <input
                name="name"
                type="text"
                required
                minLength={2}
                maxLength={200}
                placeholder={label("pvz. UAB Statybos sprendimai", "e.g. UAB Build Solutions")}
                className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
                data-testid="company-start-form-name"
              />
              <span className="text-xs text-text-muted">
                {label(
                  "Privaloma. 2-200 simbolių. Tampa companies.legal_name ir companies.display_name reikšme.",
                  "Required. 2-200 chars. Becomes companies.legal_name AND companies.display_name verbatim.",
                )}
              </span>
            </label>
            <button
              type="submit"
              className="self-start rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-text-primary hover:bg-brand-blue/80"
              data-testid="company-start-form-submit"
            >
              {label("Pradėti įmonės nustatymą", "Start company setup")}
            </button>
            <p className="text-xs text-text-secondary">
              {label(
                "Po pateikimo puslapis perkraunamas; pamatysite ✓ Pradėta būseną.",
                "After submit the page reloads; you'll see the ✓ Started state.",
              )}
            </p>
          </form>
        </section>
      )}
    </div>
  );
}
