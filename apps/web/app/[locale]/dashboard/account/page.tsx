import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { type Role } from "@/lib/auth/actions";
import {
  ROLE_BY_ID,
  type LabourMarketRoleId,
  getVisibleRoleOptions,
  roleStatusChipKey,
} from "@/lib/config/roles";
import { RoleCatalogueGrid } from "@/components/app/role-catalogue-card";
import { FeatureAvailabilityGrid } from "@/components/app/feature-availability-grid";
import { RoleIcon } from "@/components/app/role-icon";
import { Wrench, NotebookPen, Inbox } from "lucide-react";
import { deriveIsAdmin } from "@/lib/auth/admin-signal";
import { readAdminUiHidden } from "@/lib/auth/admin-ui-pref";
import { AdminUiToggle } from "@/components/app/admin-ui-toggle";

/** Account tab — email + role catalogue + logout. Manage-roles UI lives
 *  in the RoleSwitcher header dropdown; this page is the canonical place
 *  to see them listed and sign out. */
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
  const tSkills = await getTranslations("skills");
  const tJournal = await getTranslations("journal");
  const tSpaces = await getTranslations("spaces");

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

  // Show the manager confirm inbox link only to people who manage an org (§13.2).
  const { data: mgrEc } = await supabase
    .from("engagement_contexts")
    .select("id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .in("relationship_slug", ["manager", "owner", "external_manager"])
    .limit(1);
  const managesOrg = (mgrEc ?? []).length > 0;
  const isAdmin = deriveIsAdmin({
    activeRole: profile?.active_role ?? null,
    profileRoles: rolesRows ?? [],
  });
  const adminUiHidden = isAdmin ? await readAdminUiHidden() : false;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("tabs.account")}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {t("empty.account_intro")}
        </p>
      </header>

      <section className="card-border p-6">
        <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {t("account.email_label")}
        </p>
        <p className="mt-2 text-sm text-text-primary">
          {profile?.email ?? user.email}
        </p>
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

      <section className="card-border p-6">
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

      <section className="card-border p-6">
        <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {t("account.roles_label")}
        </p>
        {/* Honest framing: only the worker space is live today. The other
            roles route to a pilot cockpit (not a full management surface), so
            we tag them clearly instead of suggesting full parity. */}
        <p className="mt-2 text-xs leading-relaxed text-text-secondary">
          {t("account.rolesIntro")}
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {(rolesRows ?? []).map((r) => {
            const isActiveView = r.role === profile?.active_role;
            const role = r.role as Role;
            const cfg = ROLE_BY_ID[role as LabourMarketRoleId];
            // ONE status vocabulary for this page. Catalogue roles read their
            // chip from the single source in `lib/config/roles.ts` (Aktyvu /
            // Pradėti / Dalinis / Ruošiama) — the SAME chips the role catalogue
            // below renders — so the account page can never show two different
            // statuses for one role. `admin` is a PERMISSION grant, not a
            // workspace role: it has no catalogue row and its access surface is
            // the admin UI toggle above, so it must NEVER be tagged "Ruošiama"
            // while that toggle is reachable — it reads as active access.
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
      </section>

      <section className="card-border p-6">
        <Link
          href="/dashboard/profile"
          className="flex items-center justify-between gap-3 text-sm text-text-primary hover:text-brand-blue"
        >
          <span className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-text-secondary" strokeWidth={1.75} aria-hidden />
            {tSkills("pageTitle")}
          </span>
          <span aria-hidden className="text-text-muted">
            →
          </span>
        </Link>
      </section>

      {profile?.active_role === "worker" && (
        <section className="card-border p-6">
          <Link
            href="/dashboard/journal"
            className="flex items-center justify-between gap-3 text-sm text-text-primary hover:text-brand-blue"
          >
            <span className="flex items-center gap-2">
              <NotebookPen className="h-4 w-4 text-text-secondary" strokeWidth={1.75} aria-hidden />
              {tJournal("navTitle")}
            </span>
            <span aria-hidden className="text-text-muted">
              →
            </span>
          </Link>
        </section>
      )}

      {managesOrg && (
        <section className="card-border p-6">
          <Link
            href="/dashboard/inbox"
            className="flex items-center justify-between gap-3 text-sm text-text-primary hover:text-brand-blue"
          >
            <span className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-text-secondary" strokeWidth={1.75} aria-hidden />
              {tJournal("inbox.title")}
            </span>
            <span aria-hidden className="text-text-muted">
              →
            </span>
          </Link>
        </section>
      )}

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

      {/* Room-based IA (PR #204 review): cross-space content lives HERE, in the
          "Mano erdvės / My spaces" surface — not inside any active dashboard
          room. This is where other spaces are shown, added, or explained. */}
      <section className="card-border flex flex-col gap-4 p-6" data-testid="my-spaces">
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-base font-semibold text-text-primary">
            {tSpaces("mySpaces")}
          </h2>
          {(() => {
            const SPACE_KEY: Record<string, "profile" | "company" | "agency" | "buyer"> = {
              worker: "profile",
              company: "company",
              agency: "agency",
              customer: "buyer",
            };
            const key = profile?.active_role ? SPACE_KEY[profile.active_role] : undefined;
            return key ? (
              <p className="text-xs text-text-secondary" data-testid="my-spaces-current">
                <span className="font-mono uppercase tracking-label text-text-muted">
                  {tSpaces("current")}:
                </span>{" "}
                <span className="font-semibold text-text-primary">
                  {tSpaces(`${key}.name`)}
                </span>
              </p>
            ) : null;
          })()}
          <p className="text-xs leading-relaxed text-text-secondary">
            {tSpaces("addSpace")}
          </p>
        </header>
        <p
          className="font-mono text-[10px] uppercase tracking-label text-text-muted"
          data-testid="my-spaces-available"
        >
          {tSpaces("availableSpaces")}
        </p>
        <RoleCatalogueGrid roles={getVisibleRoleOptions()} />
        {/* Coming-soon modules are SECONDARY: collapsed by default so the
            real, actionable spaces above remain the main account experience.
            Still honestly discoverable — one click opens the preparing list. */}
        <details
          className="rounded-md border border-ink-600 bg-ink-800/20"
          data-testid="my-spaces-coming-later"
        >
          <summary className="cursor-pointer list-none px-4 py-3 font-mono text-[10px] uppercase tracking-label text-text-muted hover:text-text-secondary">
            {tSpaces("comingLaterToggle")}
          </summary>
          <div className="px-4 pb-4">
            <FeatureAvailabilityGrid comingLater showHeading={false} />
          </div>
        </details>
      </section>

      <section className="card-border p-6">
        <form action={`/${locale}/auth/logout`} method="post">
          <Button type="submit" variant="secondary">
            {t("account.logout")}
          </Button>
        </form>
      </section>
    </div>
  );
}
