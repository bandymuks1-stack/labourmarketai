import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { addRole } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { getPilotDraft } from "@/lib/pilot/pilot-drafts";

/**
 * Stage 2 — Buyer state (honest partial).
 *
 * Buyer / customer is schema-blocked: migration 0007's `add_role`
 * RPC explicitly comments
 * `-- customer: no entity in M1 (B2C service_requests land in M3).`
 *
 * There is no `public.customers` (or `public.buyers`) entity table
 * yet. So "Start buyer setup" cannot insert a first-class buyer
 * row. What CAN persist today:
 *
 *   1. The `customer` role can be added to `profile_roles` via
 *      `addRole('customer', {})` — that is real catalogue
 *      persistence (the RPC just upserts profile_roles + flips
 *      active_role; the entity-insert branch is a no-op for
 *      'customer').
 *   2. `pilot_drafts` (draft_type = 'buyer_request') — the
 *      existing PilotDraftForm at `/dashboard/buyer` writes here
 *      and reads back. That IS real persistence; just not a
 *      first-class buyer entity.
 *
 * This page surfaces both realities explicitly. No fake row, no
 * pretend "buyer created" success.
 */

async function addCustomerRoleAction(): Promise<void> {
  "use server";
  // Empty FormData — the customer branch of add_role does not
  // create an entity row, only the profile_roles catalogue entry.
  await addRole("customer", new FormData());
}

export default async function BuyerStartPage({
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

  const [rolesRes, draft] = await Promise.all([
    supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", user.id)
      .eq("is_active", true),
    getPilotDraft("buyer_request"),
  ]);
  const heldRoles = new Set((rolesRes.data ?? []).map((r) => r.role as string));
  const hasCustomerRole = heldRoles.has("customer");

  const uiLocale: "lt" | "en" = locale === "lt" ? "lt" : "en";
  const label = (lt: string, en: string) => (uiLocale === "lt" ? lt : en);

  return (
    <div className="flex flex-col gap-6" data-testid="buyer-start-page">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {label("PIRKĖJO BŪSENA", "BUYER STATE")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {label("Pirkėjo / kliento paskyra", "Buyer / client account")}
        </h1>
      </header>

      <Link
        href={"/dashboard/start" as "/dashboard"}
        className="self-start text-sm text-text-secondary hover:underline"
      >
        ← {label("Grįžti į veiklos pradžią", "Back to activity start")}
      </Link>

      {/* ── Block explanation ────────────────────────────────────── */}
      <section
        className="card-border flex flex-col gap-2 p-5"
        data-testid="buyer-start-blocker"
      >
        <header className="flex items-center gap-2">
          <span className="rounded bg-state-warning/20 px-2 py-0.5 text-xs text-state-warning">
            {label("dalinis", "partial")}
          </span>
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {label("Kas blokuoja pilną pirkėjo profilį", "What blocks a full buyer profile")}
          </h2>
        </header>
        <p className="text-sm text-text-secondary">
          {label(
            "Duomenų bazėje dar nėra pirmaeilės pirkėjo lentelės. Migracijos 0007 komentaras tai paaiškina: 'customer: no entity in M1 (B2C service_requests land in M3)'.",
            "There is no first-class buyer table in the database yet. Migration 0007 explicitly states: 'customer: no entity in M1 (B2C service_requests land in M3)'.",
          )}
        </p>
        <p className="text-sm text-text-secondary">
          {label("Tikslus blokas:", "Exact blocker:")}
        </p>
        <ul className="ml-4 list-disc text-xs text-text-secondary">
          <li>
            {label(
              "trūksta DB lentelės pvz. public.customers su laukais profile_id, service_area, budget_range, preferred_languages;",
              "missing DB table e.g. public.customers with columns profile_id, service_area, budget_range, preferred_languages;",
            )}
          </li>
          <li>
            {label(
              "trūksta RLS policy customers_select/insert/update palaikomos savininko prieigai;",
              "missing RLS policies customers_select/insert/update for owner access;",
            )}
          </li>
          <li>
            {label(
              "trūksta add_role RPC 'customer' šakos su INSERT INTO public.customers ... (po lentelės sukūrimo).",
              "missing add_role RPC 'customer' branch with INSERT INTO public.customers ... (after the table exists).",
            )}
          </li>
        </ul>
        <p className="text-xs text-text-secondary">
          {label("Sekantis žingsnis:", "Next step:")}{" "}
          {label(
            "atskira migracija 002X_customer_entity (pasiūlymas: 0025) ir 002Y_add_role_customer_branch papildymas. Nepriklauso šio PR scope.",
            "a separate migration 002X_customer_entity (suggested 0025) plus the 002Y add_role customer-branch addition. Out of scope for this PR.",
          )}
        </p>
      </section>

      {/* ── What works now ───────────────────────────────────────── */}
      <section
        className="card-border flex flex-col gap-3 p-5"
        data-testid="buyer-start-real-now"
      >
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {label("Kas veikia realiai dabar", "What works for real now")}
        </h2>

        {/* customer role status */}
        <div className="flex flex-col gap-2">
          <header className="flex items-center gap-2">
            {hasCustomerRole ? (
              <span className="rounded bg-state-success/20 px-2 py-0.5 text-xs text-state-success">
                {label("✓ vaidmuo pridėtas", "✓ role held")}
              </span>
            ) : (
              <span className="rounded bg-ink-700/40 px-2 py-0.5 text-xs text-text-muted">
                {label("dar nepridėta", "not added")}
              </span>
            )}
            <h3 className="font-display text-sm font-semibold text-text-primary">
              {label(
                "customer vaidmuo profile_roles kataloge",
                "customer role in profile_roles catalogue",
              )}
            </h3>
          </header>
          {hasCustomerRole ? (
            <p className="text-xs text-text-secondary">
              {label(
                "Jūs jau turite 'customer' vaidmenį. Galite atidaryti pirkėjo dashboardą ir pildyti pilot užklausą — ji bus išsaugota tikrai.",
                "You already hold the 'customer' role. You can open the buyer dashboard and fill the pilot request — it persists for real.",
              )}
            </p>
          ) : (
            <form
              action={addCustomerRoleAction}
              className="flex flex-col gap-2"
              data-testid="buyer-start-add-role-form"
            >
              <p className="text-xs text-text-secondary">
                {label(
                  "Pridės 'customer' vaidmenį į profile_roles katalogą (idempotentinis). Niekos kito DB nemutuoja.",
                  "Adds the 'customer' role to the profile_roles catalogue (idempotent). No other DB mutation.",
                )}
              </p>
              <button
                type="submit"
                className="self-start rounded-md border border-brand-blue px-3 py-1.5 text-sm text-brand-blue hover:bg-brand-blue/10"
                data-testid="buyer-start-add-role-submit"
              >
                {label("Pridėti customer vaidmenį", "Add customer role")}
              </button>
            </form>
          )}
        </div>

        {/* pilot draft status */}
        <div className="flex flex-col gap-2">
          <header className="flex items-center gap-2">
            {draft ? (
              <span className="rounded bg-state-success/20 px-2 py-0.5 text-xs text-state-success">
                {label("✓ juodraštis išsaugotas", "✓ draft saved")}
              </span>
            ) : (
              <span className="rounded bg-ink-700/40 px-2 py-0.5 text-xs text-text-muted">
                {label("dar nėra juodraščio", "no draft yet")}
              </span>
            )}
            <h3 className="font-display text-sm font-semibold text-text-primary">
              {label(
                "Pilot pirkėjo užklausa (pilot_drafts lentelė)",
                "Pilot buyer request (pilot_drafts table)",
              )}
            </h3>
          </header>
          {draft ? (
            <p className="text-xs text-text-secondary">
              {label(
                "Jūsų pirkėjo užklausos juodraštis išsaugotas pilot_drafts lentelėje (draft_type='buyer_request') ir matomas administratoriui. Galite jį redaguoti pirkėjo dashboarde.",
                "Your buyer request draft is saved in pilot_drafts (draft_type='buyer_request') and visible to the admin. You can edit it on the buyer dashboard.",
              )}
            </p>
          ) : (
            <p className="text-xs text-text-secondary">
              {label(
                "Dar nėra pirkėjo užklausų — sukurkite užklausą per pirkėjo dashboardą. Ji bus išsaugota pilot_drafts lentelėje.",
                "No buyer request yet — create one via the buyer dashboard. It will persist in pilot_drafts.",
              )}
            </p>
          )}
          <Link
            href={"/dashboard/buyer" as "/dashboard"}
            className="self-start text-sm text-brand-blue hover:underline"
            data-testid="buyer-start-goto-buyer-dashboard"
          >
            {label("Atidaryti pirkėjo dashboardą →", "Open buyer dashboard →")}
          </Link>
        </div>
      </section>
    </div>
  );
}
