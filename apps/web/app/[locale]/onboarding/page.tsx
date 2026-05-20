import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AmbientGlow } from "@/components/decor/ambient-glow";
import { OnboardingForm } from "@/components/app/onboarding-form";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/auth/actions";

const ROLES = new Set(["worker", "company", "agency", "customer"]);

export default async function OnboardingPage({
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
    .select("active_role, full_name, email, onboarded_at")
    .eq("id", user.id)
    .single();

  // Already onboarded — middleware would normally catch this, but a direct
  // visit shouldn't show the form again.
  if (profile?.onboarded_at) redirect(`/${locale}/dashboard`);

  // Pick the role this onboarding is for: prefer profile.active_role; fall
  // back to the first profile_roles row; default to worker if neither.
  let role: Role = "worker";
  if (profile?.active_role && ROLES.has(profile.active_role)) {
    role = profile.active_role as Role;
  } else {
    const { data: pr } = await supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", user.id)
      .limit(1)
      .maybeSingle();
    if (pr?.role && ROLES.has(pr.role)) role = pr.role as Role;
  }

  const defaultName =
    profile?.full_name ?? (profile?.email ? profile.email.split("@")[0] : "");

  // Worker onboarding needs the profession dropdown options. Fetch all
  // active professions and pick the locale-appropriate display name in
  // memory (avoids a dynamic column-name select that TypeScript can't
  // narrow). Empty list is OK — the form will render an empty dropdown.
  type ProfessionRow = {
    id: string;
    name_lt: string;
    name_en: string;
    name_nl: string | null;
    name_de: string | null;
    name_pl: string | null;
    name_ru: string | null;
  };
  let professions: { id: string; name: string }[] = [];
  if (role === "worker") {
    const { data } = await supabase
      .from("professions")
      .select("id, name_lt, name_en, name_nl, name_de, name_pl, name_ru")
      .eq("is_active", true);
    const key = (`name_${locale}` as keyof ProfessionRow);
    professions = ((data as ProfessionRow[] | null) ?? [])
      .map((p) => ({
        id: p.id,
        name: (p[key] as string | null) ?? p.name_en,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <div className="relative min-h-screen">
      <AmbientGlow />
      <header className="relative z-10 mx-auto max-w-container px-6 py-6 sm:px-12">
        <Link
          href="/"
          className="font-display text-lg font-bold tracking-tightest text-text-primary"
        >
          labourmarket<span className="text-gradient-accent">.ai</span>
        </Link>
      </header>
      <main className="relative z-10 mx-auto flex max-w-md flex-col px-6 pb-20">
        <OnboardingForm
          role={role}
          defaultName={defaultName}
          professions={professions}
        />
      </main>
    </div>
  );
}
