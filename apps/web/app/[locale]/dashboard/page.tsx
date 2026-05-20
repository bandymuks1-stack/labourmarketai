import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
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

  // M1 only ships worker functionality. Company / agency / customer users
  // see an honest "coming soon" panel instead of the placeholder skeleton
  // (PV §10). Worker keeps the existing 3-section overview stub.
  if (role !== "worker") {
    return (
      <div className="flex flex-col gap-8">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
            {tRole(role)}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tightest text-text-primary">
            {t("comingSoon.greeting", { name })}
          </h1>
        </header>
        <div className="card-border max-w-2xl p-6 sm:p-8">
          <p className="text-base leading-relaxed text-text-secondary">
            {t("comingSoon.body_main")}
          </p>
          <p className="mt-4 text-base leading-relaxed text-text-secondary">
            {t("comingSoon.body_notify")}
          </p>
          <p className="mt-4 text-base leading-relaxed text-text-secondary">
            {t("comingSoon.body_meanwhile")}
          </p>
        </div>
      </div>
    );
  }

  // Primary profession lookup for the worker badge (migration 0008).
  // Two-step query keeps types simple; if either row is missing the
  // badge silently drops the profession suffix.
  type ProfRow = {
    name_lt: string;
    name_en: string;
    name_nl: string | null;
    name_de: string | null;
    name_pl: string | null;
    name_ru: string | null;
  };
  let primaryProfession: string | null = null;
  const { data: workerRow } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (workerRow?.id) {
    const { data: wp } = await supabase
      .from("worker_professions")
      .select(
        "professions(name_lt, name_en, name_nl, name_de, name_pl, name_ru)",
      )
      .eq("worker_id", workerRow.id)
      .eq("is_primary", true)
      .maybeSingle();
    const prof = (wp?.professions as ProfRow | null) ?? null;
    if (prof) {
      const key = `name_${locale}` as keyof ProfRow;
      primaryProfession = (prof[key] as string | null) ?? prof.name_en;
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {tRole(role)}
          {primaryProfession ? ` · ${primaryProfession}` : ""}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("greeting", { name })}
        </h1>
      </header>

      <div className="grid gap-5 md:grid-cols-3">
        <DashboardSection
          title={t("section.offer.title")}
          emptyBody={t(`empty.${role}.offer`)}
        />
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
