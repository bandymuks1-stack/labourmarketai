import { setRequestLocale, getTranslations } from "next-intl/server";

import { requireSuperadmin } from "@/lib/auth/superadmin";
import { loadUnstructuredNeeds } from "@/lib/admin/need-backfill";
import { NeedStructureRow } from "@/components/app/need-structure-row";

/**
 * Admin need-structuring backfill (superadmin-only). Lists SUBMITTED demands
 * that still lack structured fields, shows the deterministic suggestion from
 * their free text, and lets the admin review + apply closed-set values to the
 * structured columns so old needs become useful worker-board cards. The free
 * text stays in this admin surface only — never written to the worker board.
 * No migration; the apply UPDATE rides the existing customer_requests RLS.
 */
export default async function NeedStructuringPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);

  const t = await getTranslations("needStructuring");
  const needs = await loadUnstructuredNeeds();

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6" id="main-content">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("pageTitle")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">{t("pageIntro")}</p>
      </header>

      {needs.length === 0 ? (
        <p className="rounded-md border border-dashed border-ink-500 px-4 py-6 text-sm text-text-secondary">
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="need-structuring-list">
          {needs.map((need) => (
            <NeedStructureRow key={need.id} need={need} />
          ))}
        </ul>
      )}

      <p className="text-meta leading-relaxed text-text-muted">{t("footnote")}</p>
    </div>
  );
}
