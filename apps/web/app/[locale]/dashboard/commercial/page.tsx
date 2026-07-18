import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getMyCommercial } from "@/lib/commercial/commercial";
import { CommercialPanel } from "@/components/app/commercial-panel";

export const dynamic = "force-dynamic";

/**
 * Commercial CRM (Wagon 10). One commercial surface: the signed-in owner's
 * proposals + contracts over the canonical demand/project facts. Invoices and
 * payments are the canonical finance layer's concern (linked, not duplicated).
 */
export default async function CommercialPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
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
    </div>
  );
}
