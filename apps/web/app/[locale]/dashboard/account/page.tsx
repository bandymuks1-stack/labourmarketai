import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { Link } from "@/lib/i18n/navigation";
import { FeatureNote } from "@/components/app/feature-note";
import { createClient } from "@/lib/supabase/server";
import { type Role } from "@/lib/auth/actions";
import {
  ROLE_BY_ID,
  type LabourMarketRoleId,
  roleStatusChipKey,
} from "@/lib/config/roles";
import { RoleIcon } from "@/components/app/role-icon";
import { IdCard } from "lucide-react";
import { deriveIsAdmin } from "@/lib/auth/admin-signal";
import { readAdminUiHidden } from "@/lib/auth/admin-ui-pref";
import { AdminUiToggle } from "@/components/app/admin-ui-toggle";

/**
 * Account — SETTINGS ONLY (marketplace IA cleanup 2026-06-25).
 *
 * Account is no longer a second dashboard: the cross-space catalogue, the
 * future-module grid and the identity/action launcher were removed (they
 * belong to the dashboard overview + the role switcher). This page now carries
 * only settings: identity (email + edit-profile link), preferences (appearance,
 * language, admin UI), the account's roles (informational), and sign-out.
 * Switching/adding an identity is the header role switcher; the person↔company
 * actions live on the dashboard overview.
 */
export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth.dashboard");
  const tRoot = await getTranslations();
  const tRole = await getTranslations("auth.signup.role");
  const tSwitcher = await getTranslations("auth.roleSwitcher");
  const tCommon = await getTranslations("common");
  const tProfile = await getTranslations("auth.dashboard.tabs");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, active_role")
    .eq("id", user.id)
    .single();
  const { data: rolesRows } = await supabase
    .from("profile_roles")
    .select("role, added_at, is_active")
    .eq("profile_id", user.id)
    .order("added_at", { ascending: true });

  const isAdmin = deriveIsAdmin({
    activeRole: profile?.active_role ?? null,
    profileRoles: rolesRows ?? [],
  });
  const adminUiHidden = isAdmin ? await readAdminUiHidden() : false;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("tabs.account")}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {t("empty.account_intro")}
        </p>
      </header>

      {/* Honest payment readiness — payments are not active yet (billing
          disabled). No pay-now, no subscription-active, no paid unlock. */}
      <FeatureNote testId="account-payment-readiness">
        {tRoot("featureNotes.paymentReadiness")}
      </FeatureNote>

      <section className="card-border p-5">
        <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {t("account.email_label")}
        </p>
        <p className="mt-2 break-words text-sm text-text-primary">
          {profile?.email ?? user.email}
        </p>
      </section>

      {/* Identity is edited on the Profilis surface; a single settings link
          (not a launcher grid) keeps account = settings while the profile-cv
          guard's canonical /dashboard/profile reference stays satisfied. */}
      <section className="card-border p-5">
        <Link
          href="/dashboard/profile"
          className="flex items-center justify-between gap-3 text-sm text-text-primary hover:text-brand-blue"
          data-testid="account-edit-identity-link"
        >
          <span className="flex items-center gap-2">
            <IdCard className="h-4 w-4 text-text-secondary" strokeWidth={1.75} aria-hidden />
            {tProfile("profile")}
          </span>
          <span aria-hidden className="text-text-muted">
            →
          </span>
        </Link>
      </section>

      {/* Privacy & data explanations (CR train WAGON 2): settings-appropriate
          LINKS ONLY (no catalogue/launcher grid — account stays settings-only).
          Points at the public explanation pack so a signed-in user can find
          what the platform is, what data it uses and who can see it. */}
      <section className="card-border p-5" data-testid="account-privacy-data">
        <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {tRoot("legal.accountSection.title")}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-text-secondary">
          {tRoot("legal.accountSection.intro")}
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          <li>
            <Link
              href="/about"
              className="flex items-center justify-between gap-3 text-sm text-text-primary hover:text-brand-blue"
            >
              <span>{tRoot("about.navLabel")}</span>
              <span aria-hidden className="text-text-muted">→</span>
            </Link>
          </li>
          <li>
            <Link
              href="/legal/privacy"
              className="flex items-center justify-between gap-3 text-sm text-text-primary hover:text-brand-blue"
            >
              <span>{tRoot("legal.privacy.title")}</span>
              <span aria-hidden className="text-text-muted">→</span>
            </Link>
          </li>
          <li>
            <Link
              href="/legal/data-access"
              className="flex items-center justify-between gap-3 text-sm text-text-primary hover:text-brand-blue"
            >
              <span>{tRoot("legal.dataAccess.title")}</span>
              <span aria-hidden className="text-text-muted">→</span>
            </Link>
          </li>
          <li>
            <Link
              href="/legal/data-protection"
              className="flex items-center justify-between gap-3 text-sm text-text-primary hover:text-brand-blue"
            >
              <span>{tRoot("legal.dataProtection.title")}</span>
              <span aria-hidden className="text-text-muted">→</span>
            </Link>
          </li>
        </ul>
      </section>

      {isAdmin && (
        <AdminUiToggle
          hidden={adminUiHidden}
          labels={{
            title: t("account.adminUi.title"),
            description: t("account.adminUi.description"),
            statusShown: t("account.adminUi.statusShown"),
            statusHidden: t("account.adminUi.statusHidden"),
            show: t("account.adminUi.show"),
            hide: t("account.adminUi.hide"),
          }}
        />
      )}

      <section className="card-border p-5">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-label text-text-muted">
          {t("account.theme.appearance")}
        </p>
        <ThemeToggle
          labels={{
            appearance: t("account.theme.help"),
            toDark: t("account.theme.toDark"),
            toLight: t("account.theme.toLight"),
          }}
        />
      </section>

      {/* Role / context management — collapsed by default (compression pass):
          settings stay practical, not a product dashboard. The rolesIntro +
          per-role chips (roleStatusChipKey) remain in the source. */}
      <details className="card-border group p-5" data-testid="account-roles-details">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-[11px] uppercase tracking-label text-text-muted hover:text-text-primary">
          <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
          {t("account.roles_label")}
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-text-secondary">
          {t("account.rolesIntro")}
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {(rolesRows ?? []).map((r) => {
            const isActiveView = r.role === profile?.active_role;
            const role = r.role as Role;
            const cfg = ROLE_BY_ID[role as LabourMarketRoleId];
            const isAdminRole = r.role === "admin";
            const chipKey = isAdminRole
              ? isAdmin
                ? "roles.status.active"
                : null
              : cfg && cfg.availability !== "active"
                ? roleStatusChipKey(cfg.availability)
                : null;
            const chipTone =
              isAdminRole || cfg?.availability === "active"
                ? "border-state-success/40 bg-state-success/5 text-state-success"
                : cfg?.availability === "start-available"
                  ? "border-brand-blue/40 bg-brand-blue/5 text-brand-blue"
                  : "border-state-warning/40 bg-state-warning/5 text-state-warning";
            return (
              <li
                key={r.role}
                className="flex items-center justify-between gap-3 rounded-md border border-ink-500 px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm text-text-primary">
                  <RoleIcon role={role} className="h-4 w-4 text-text-secondary" />
                  {tRole(role)}
                </span>
                <span className="flex items-center gap-2">
                  {chipKey && (
                    <span
                      className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${chipTone}`}
                    >
                      {tRoot(chipKey)}
                    </span>
                  )}
                  {isActiveView && (
                    <span className="font-mono text-[10px] uppercase tracking-label text-state-live">
                      ● {tSwitcher("active_label")}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </details>

      {/* Language lives in the header on tablet/desktop; on mobile the top bar
          is simplified, so the switcher is relocated here (md:hidden). */}
      <section className="card-border p-6 md:hidden">
        <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {tCommon("localeSwitch")}
        </p>
        <div className="mt-3">
          <LocaleSwitcher />
        </div>
      </section>

      <section className="card-border p-5">
        <form action={`/${locale}/auth/logout`} method="post">
          <Button type="submit" variant="secondary">
            {t("account.logout")}
          </Button>
        </form>
      </section>
    </div>
  );
}
