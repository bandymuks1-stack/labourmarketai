import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { InvoicePanel } from "@/components/app/invoice-panel";
import { getProjectInvoicing } from "@/lib/finance/project-invoice";
import { formatMoney, totalsByCurrency } from "@/lib/finance/project-invoice-model";

/**
 * Durable financial history of ONE project, read from the lifecycle records:
 * billing periods and the invoices / credit notes issued against them. A
 * summary only - numbers come from the stored, frozen snapshot, never from a
 * recalculation; the detail (lines, evidence classes, tax) is one click away.
 *
 * Renders nothing before the owner-gated migration is applied or when the
 * caller cannot read the records: there is no empty or fake panel.
 */
export async function ProjectFinancialHistory({
  projectId,
  organizationId,
  locale,
}: {
  projectId: string;
  organizationId: string | null;
  locale: string;
}) {
  const read = await getProjectInvoicing(projectId, organizationId);
  if (read.kind !== "ok") return null;
  const { periods, invoices, rateTerms, totals } = read.value;
  const t = await getTranslations("projectInvoice");
  const issued = invoices.filter((i) => i.issuedAt !== null);
  return (
    <InvoicePanel id="ops-financial-history" testId="ops-financial-history" gap={3}>
      <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("history.title")}</h2>
      <div className="flex flex-wrap gap-2 text-meta text-text-secondary">
        <span className="inline-flex rounded-full border border-ink-500 bg-ink-800 px-3 py-1">
          {t("history.terms", { count: rateTerms.length })}
        </span>
        <span className="inline-flex rounded-full border border-ink-500 bg-ink-800 px-3 py-1">
          {t("history.periods", { count: periods.length })}
        </span>
        <span className="inline-flex rounded-full border border-ink-500 bg-ink-800 px-3 py-1">
          {t("history.invoices", { count: issued.length })}
        </span>
      </div>
      {totals.length > 0 ? (
        <div className="flex flex-col gap-1" data-testid="ops-financial-totals">
          {[...totalsByCurrency(totals).entries()].map(([cur, rows]) => (
            <p key={cur} className="text-sm text-text-primary">
              <span className="font-semibold">{cur}</span>:{" "}
              {rows.map((r) => `${t(`kind.${r.kind}`)} ${formatMoney(r.grossCents, r.currency, locale)} (${r.documents})`).join(" - ")}
            </p>
          ))}
          <p className="text-meta text-text-muted">{t("invoices.totalsNote")}</p>
        </div>
      ) : null}
      {issued.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm text-text-primary">
          {issued.slice(0, 8).map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2">
              <Link href={`/dashboard/projects/${projectId}/invoicing/${i.id}` as "/dashboard"} className="font-semibold text-brand-blue hover:underline">
                {t(`kind.${i.kind}`)} {i.invoiceNumber}
              </Link>
              <span className="text-text-muted">{i.issuedAt?.slice(0, 10)}</span>
              <span>{i.grossTotalCents != null ? formatMoney(i.grossTotalCents, i.currency, locale) : ""}</span>
              <span className="text-text-muted">{i.creditedAt ? t("status.credited") : t(`status.${i.status}` as "status.draft")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-muted">{t("history.none")}</p>
      )}
      <Link href={`/dashboard/projects/${projectId}/invoicing` as "/dashboard"} className="text-sm text-brand-blue hover:underline">
        {t("history.open")} {"->"}
      </Link>
      <p className="text-meta text-text-muted">{t("history.note")}</p>
    </InvoicePanel>
  );
}
