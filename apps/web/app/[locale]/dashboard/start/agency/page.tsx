import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { addRole } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

/**
 * Stage 2 — Agency setup (real persistence).
 *
 * Server component + inline server action. Reads
 * `public.agencies` for the current user; if a row exists, renders
 * the persistent "Agentūros profilis pradėtas" success state. If no
 * row exists, renders a 1-field form that on submit calls the
 * existing `addRole('agency', formData)` server action, which:
 *
 *   1. RPC `public.add_role` (migration 0007) inserts a row into
 *      `public.agencies` with `legal_name = formData.name` and
 *      `country` derived from the profile's onboarding country.
 *   2. Upserts a `profile_roles` row with `role = 'agency'`.
 *   3. Overwrites `profiles.active_role = 'agency'`.
 *   4. Idempotent on retry (the RPC's `if not exists` guard).
 *
 * Persistence is REAL — after submit the agencies row is in the
 * production DB, RLS-readable by the owner, and survives any
 * client reload or session restart. Empty-state copy honoured:
 * "Dar nėra darbuotojų — pridėkite arba pakvieskite darbuotoją"
 * when no `agency_workers` rows are attached yet (next slice).
 */

async function startAgencyAction(formData: FormData): Promise<void> {
  "use server";
  // addRole is already auth-gated (throws "Not authenticated" if no user)
  // and validates the role string against the ONBOARDING_ROLES allowlist.
  // The form supplies `name` as the only field; the RPC reads it from
  // role_data.name and writes agencies.legal_name.
  await addRole("agency", formData);
}

export default async function AgencyStartPage({
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

  const { data: agency } = await supabase
    .from("agencies")
    .select("id, legal_name, country, description, created_at")
    .eq("profile_id", user.id)
    .maybeSingle();

  const uiLocale: "lt" | "en" = locale === "lt" ? "lt" : "en";
  const label = (lt: string, en: string) => (uiLocale === "lt" ? lt : en);

  return (
    <div className="flex flex-col gap-6" data-testid="agency-start-page">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {label("AGENTŪROS NUSTATYMAS", "AGENCY SETUP")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {label("Agentūros profilis", "Agency profile")}
        </h1>
      </header>

      <Link
        href={"/dashboard/start" as "/dashboard"}
        className="self-start text-sm text-text-secondary hover:underline"
      >
        ← {label("Grįžti į veiklos pradžią", "Back to activity start")}
      </Link>

      {agency ? (
        // ── Persistent success state ───────────────────────────
        <section
          className="card-border flex flex-col gap-3 p-5"
          data-testid="agency-start-already-started"
        >
          <header className="flex items-center gap-2">
            <span className="rounded bg-state-success/20 px-2 py-0.5 text-xs text-state-success">
              {label("✓ Pradėta", "✓ Started")}
            </span>
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {label("Agentūros profilis pradėtas", "Agency profile started")}
            </h2>
          </header>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-text-muted">
                {label("Teisinis pavadinimas", "Legal name")}
              </dt>
              <dd className="text-text-primary">
                {agency.legal_name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">
                {label("Šalis", "Country")}
              </dt>
              <dd className="text-text-primary">{agency.country ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-text-muted">
                {label("Sukurta", "Created at")}
              </dt>
              <dd className="text-text-primary">{agency.created_at}</dd>
            </div>
          </dl>
          <p className="text-xs text-text-secondary">
            {label(
              "Šie duomenys saugomi public.agencies lentelėje. Perkrovus puslapį būsena išliks.",
              "This data is stored in public.agencies. Reload preserves the state.",
            )}
          </p>

          <section
            className="card-border flex flex-col gap-2 p-4"
            data-testid="agency-start-workers-empty"
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
            <ul className="ml-4 list-disc text-xs text-text-secondary">
              <li>
                {label(
                  "Darbuotojų pridėjimo paviršius dar nepateikia DB rašymo — bus kitame sluoksnyje (agency_workers lentelė jau egzistuoja).",
                  "Worker-add surface does not yet write to DB — it is the next slice (the agency_workers table already exists).",
                )}
              </li>
              <li>
                {label(
                  "Platesnė kandidatų paieška lieka operatoriaus padedama paslauga, ne atvira duomenų bazė.",
                  "Broader candidate search remains an operator-assisted service, not an open database.",
                )}
              </li>
            </ul>
          </section>

          <Link
            href={"/dashboard/agency" as "/dashboard"}
            className="self-start text-sm text-brand-blue hover:underline"
            data-testid="agency-start-goto-dashboard"
          >
            {label("Eiti į agentūros dashboardą →", "Go to agency dashboard →")}
          </Link>
        </section>
      ) : (
        // ── Setup form (not started yet) ──────────────────────
        <section
          className="card-border flex flex-col gap-4 p-5"
          data-testid="agency-start-form-section"
        >
          <header className="flex flex-col gap-1">
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {label("Pradėti agentūros nustatymą", "Start agency setup")}
            </h2>
            <p className="text-sm text-text-secondary">
              {label(
                "Vienas laukas — pavadinimas. Po pateikimo paskyra įrašoma į public.agencies, profile_roles pridedamas 'agency' įrašas, ir aktyvus vaidmuo pasikeičia į 'agency'.",
                "One field — the name. On submit the row is inserted into public.agencies, a profile_roles 'agency' row is added, and the active workspace switches to 'agency'.",
              )}
            </p>
          </header>
          <form
            action={startAgencyAction}
            className="flex flex-col gap-3"
            data-testid="agency-start-form"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-secondary">
                {label("Agentūros teisinis pavadinimas", "Agency legal name")}
              </span>
              <input
                name="name"
                type="text"
                required
                minLength={2}
                maxLength={200}
                placeholder={label("pvz. UAB Šiaurės darbo jėga", "e.g. UAB Šiaurės Workforce")}
                className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
                data-testid="agency-start-form-name"
              />
              <span className="text-xs text-text-muted">
                {label(
                  "Privaloma. 2-200 simbolių. Šis tekstas tampa agencies.legal_name reikšme.",
                  "Required. 2-200 chars. Becomes agencies.legal_name verbatim.",
                )}
              </span>
            </label>
            <button
              type="submit"
              className="self-start rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-text-primary hover:bg-brand-blue/80"
              data-testid="agency-start-form-submit"
            >
              {label("Pradėti agentūros nustatymą", "Start agency setup")}
            </button>
            <p className="text-xs text-text-secondary">
              {label(
                "Po pateikimo puslapis perkraunamas; pamatysite ✓ Pradėta būseną su išsaugotais duomenimis. Pakartotinis pateikimas yra idempotentinis (RPC saugiai praleidžia).",
                "After submit the page reloads; you'll see the ✓ Started state with the saved data. Resubmitting is idempotent (the RPC safely skips).",
              )}
            </p>
          </form>
        </section>
      )}
    </div>
  );
}
