import { getTranslations } from "next-intl/server";

import { billingStripeTaxEnabled } from "@/lib/billing/config";
import { listTaxEvidenceForAdmin } from "@/lib/billing/tax-evidence-store";
import { formatMinorAmount } from "@/lib/billing/tax-evidence-read";
import { reviewReasonFamily, splitReviewReasons } from "@/lib/billing/stripe-tax-core";
import { AdminTaxReviewButton } from "@/components/app/admin-tax-review-button";
import { Card } from "@/components/ui/Card";

/**
 * Superadmin billing → Stripe Tax review list (owner order 2026-10-23, point
 * 6). Read-only rows flagged `review_required` by the webhook's review rules:
 * reason, organization, country, VAT id + its check status, amounts, invoice
 * link. The only action is "mark reviewed" (who/when) — no amount is editable,
 * no exemption can be granted here.
 */
export async function AdminTaxReviewSection({ locale }: { locale: string }) {
  const t = await getTranslations("adminBilling.tax");
  const on = billingStripeTaxEnabled();
  const list = await listTaxEvidenceForAdmin();
  return (
    <section className="flex flex-col gap-2" data-testid="admin-tax-review" data-switch={on ? "on" : "off"}>
      <h2 className="font-display text-lg font-semibold text-text-primary">{t("title")}</h2>
      <p className="text-xs text-text-secondary">{on ? t("switchOn") : t("switchOff")}</p>
      {list.status === "needs-migration" ? (
        <p className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary">
          {t("unavailable")}
        </p>
      ) : list.status !== "ok" ? (
        <p className="text-sm text-state-warning">{t("error")}</p>
      ) : list.rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.rows.map((r) => (
            <li key={r.id} data-testid="admin-tax-review-row">
              <Card compact className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
                <span className="font-mono text-xs text-text-muted">{r.objectKind} · {r.providerObjectId}</span>
                {r.testMode ? (
                  <span className="font-mono text-meta uppercase tracking-label text-state-amber">test</span>
                ) : null}
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {splitReviewReasons(r.reviewReason).map((code) => {
                  const { family, status } = reviewReasonFamily(code);
                  return (
                    <li
                      key={code}
                      className="rounded-md border border-state-warning/40 px-2 py-0.5 text-meta text-state-warning"
                      title={code}
                    >
                      {t(`reason.${family}` as never, { status: status ?? "—", code } as never)}
                    </li>
                  );
                })}
              </ul>
              <p className="text-meta text-text-secondary">
                {t("org")}: <span className="font-mono">{r.organizationId ? r.organizationId.slice(0, 8) : "—"}</span>
                {" · "}
                {t("country")}: {r.billingCountry ?? "—"}
                {" · "}
                {r.customerBusinessName ?? "—"}
              </p>
              <p className="text-meta text-text-secondary">
                {t("vatId")}: {r.taxIdValue ? `${r.taxIdType ?? ""} ${r.taxIdValue}`.trim() : "—"}
                {" · "}
                {t("vatIdCheck")}: {r.taxIdVerificationStatus ?? "—"}
                {" · "}
                {t("automaticTax")}: {r.automaticTaxStatus ?? "—"}
                {r.reverseCharge ? ` · ${t("reverseCharge")}` : ""}
              </p>
              <p className="text-meta text-text-secondary">
                {t("subtotal")}: {formatMinorAmount(r.amountSubtotal, r.currency, locale) ?? "—"}
                {" · "}
                {t("vat")}: {formatMinorAmount(r.amountTax, r.currency, locale) ?? "—"}
                {" · "}
                {t("total")}: {formatMinorAmount(r.amountTotal, r.currency, locale) ?? "—"}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {r.invoiceUrl ? (
                  <a
                    href={r.invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-meta text-brand-blue underline-offset-2 hover:underline"
                  >
                    {t("invoice")}
                  </a>
                ) : null}
                <AdminTaxReviewButton
                  locale={locale}
                  evidenceId={r.id}
                  labels={{ mark: t("markReviewed"), saving: t("saving"), error: t("markError") }}
                />
              </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
