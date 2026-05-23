import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { type Role } from "@/lib/auth/actions";

const ROLE_ICON: Record<Role, string> = {
  worker: "🔨",
  company: "🏗️",
  agency: "🤝",
  customer: "🛒",
};

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
  const tRole = await getTranslations("auth.signup.role");
  const tSwitcher = await getTranslations("auth.roleSwitcher");
  const tCommon = await getTranslations("common");
  const tSkills = await getTranslations("skills");
  const tJournal = await getTranslations("journal");

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
            const isActive = r.role === profile?.active_role;
            const role = r.role as Role;
            // worker is the only role with a fully active worker space today;
            // the others land on the pilot cockpit ("preview") — say so.
            const isLiveRole = role === "worker";
            return (
              <li
                key={r.role}
                className="flex items-center justify-between gap-3 rounded-md border border-ink-500 px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm text-text-primary">
                  <span aria-hidden>{ROLE_ICON[role] ?? "•"}</span>
                  {tRole(role)}
                </span>
                <span className="flex items-center gap-2">
                  {!isLiveRole && (
                    <span className="rounded-sm border border-state-warning/40 bg-state-warning/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-state-warning">
                      {t("account.preview_workspace")}
                    </span>
                  )}
                  {isActive && (
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
            <span aria-hidden>🔧</span>
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
              <span aria-hidden>📓</span>
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
              <span aria-hidden>✅</span>
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
