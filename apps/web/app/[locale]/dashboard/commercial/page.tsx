import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getMyCommercial } from "@/lib/commercial/commercial";
import { CommercialPanel } from "@/components/app/commercial-panel";
import { AgreementsRegister } from "@/components/app/agreements-register";

export const dynamic = "force-dynamic";

/**
 * Commercial CRM (Wagon 10) + the canonical agreement register (Agreement &
 * Rights Engine v1). One commercial surface: the signed-in owner's proposals
 * + contracts over the canonical demand/project facts, and — for an
 * organization workspace — the org-scoped agreement register below them.
 * The legacy B2B `contracts` register stays untouched; `agreements` is the
 * canonical general register going forward. Invoices and payments are the
 * canonical finance layer's concern (linked, not duplicated).
 */
export default async function CommercialPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    agr?: string;
    agrType?: string;
    agrStatus?: string;
    agrSearch?: string;
    agrExpiring?: string;
  }>;
}) {
  const { locale } = await params;
  const search = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("commercial");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const data = await getMyCommercial();

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("pageTitle")}
        </h1>
        <p className="text-sm text-text-secondary">{t("pageIntro")}</p>
      </header>
      <CommercialPanel data={data} />
      <AgreementsRegister locale={locale} searchParams={search} />
    </div>
  );
}
