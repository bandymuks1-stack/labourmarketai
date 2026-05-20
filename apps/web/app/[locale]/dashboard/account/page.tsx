import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/Button";
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
        <ul className="mt-3 flex flex-col gap-2">
          {(rolesRows ?? []).map((r) => {
            const isActive = r.role === profile?.active_role;
            return (
              <li
                key={r.role}
                className="flex items-center justify-between gap-3 rounded-md border border-ink-500 px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm text-text-primary">
                  <span aria-hidden>{ROLE_ICON[r.role as Role] ?? "•"}</span>
                  {tRole(r.role as Role)}
                </span>
                {isActive && (
                  <span className="font-mono text-[10px] uppercase tracking-label text-state-live">
                    ● {tSwitcher("active_label")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
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
