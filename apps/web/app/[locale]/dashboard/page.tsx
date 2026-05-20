import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AddRoleHint } from "@/components/app/add-role-hint";
import { DashboardSection } from "@/components/app/dashboard-section";
import { createClient } from "@/lib/supabase/server";
import { type Role } from "@/lib/auth/actions";

const ROLES = new Set<Role>(["worker", "company", "agency", "customer"]);

/** Overview tab — the 3 marketplace sections (Offer / Seek / Proofs)
 *  per active role, all empty stubs in M1 (PV §10 honesty). */
export default async function DashboardOverviewPage({
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_role, full_name, email")
    .eq("id", user.id)
    .single();

  const t = await getTranslations("auth.dashboard");
  const tRole = await getTranslations("auth.signup.role");

  const role: Role = ROLES.has(profile?.active_role as Role)
    ? (profile!.active_role as Role)
    : "worker";

  const name =
    profile?.full_name ?? (profile?.email ? profile.email.split("@")[0] : "");

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {tRole(role)}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("greeting", { name })}
        </h1>
      </header>

      <div className="grid gap-5 md:grid-cols-3">
        {role === "customer" ? (
          <DashboardSection title={t("section.offer.title")}>
            <p className="text-sm leading-relaxed text-text-secondary">
              {t("customer.offerHint")}
            </p>
            <div className="mt-4">
              <AddRoleHint label={t("customer.offerHintCta")} role="worker" />
            </div>
          </DashboardSection>
        ) : (
          <DashboardSection
            title={t("section.offer.title")}
            emptyBody={t(`empty.${role}.offer`)}
          />
        )}

        <DashboardSection
          title={t("section.seek.title")}
          emptyBody={t(`empty.${role}.seek`)}
        />
        <DashboardSection
          title={t("section.proofs.title")}
          emptyBody={t(`empty.${role}.proofs`)}
        />
      </div>
    </div>
  );
}
