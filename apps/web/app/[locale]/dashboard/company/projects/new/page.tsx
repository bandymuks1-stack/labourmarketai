import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { ProjectContextCreateForm } from "@/components/app/project-context-create-form";

/**
 * Company-side "create project context" route. Gated to the company role
 * (route-level), and the create action re-resolves the company server-side +
 * RLS enforces ownership (data-level). First real create step — journal
 * linking stays disabled.
 */
export default async function NewProjectContextPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "company");

  const t = await getTranslations("companyOps.createProject");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/dashboard/company"
          className="w-fit text-xs font-medium text-brand-blue hover:underline"
        >
          ← {t("backToDashboard")}
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      <ProjectContextCreateForm />
    </div>
  );
}
