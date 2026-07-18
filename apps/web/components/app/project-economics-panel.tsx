"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import {
  deleteBudgetLineAction,
  setBudgetLineAction,
  setBudgetStatusAction,
} from "@/lib/economics/economics-actions";
import {
  BUDGET_CATEGORIES,
  type BudgetCategory,
  type ProjectEconomicsData,
  type VarianceState,
} from "@/lib/economics/economics-model";

const STATE_TONE: Record<VarianceState, string> = {
  over_budget: "text-state-danger",
  under_budget: "text-state-success",
  on_budget: "text-text-secondary",
  no_baseline: "text-text-muted",
};

/**
 * Project economics panel (Wagon 8) on the manager-only project operations
 * surface. Budget lines (per category) + a variance summary vs the actual cost
 * read from the canonical finance_records ledger. EUR only — no currency mixing,
 * no invented accounting precision. Honest states throughout.
 */
export function ProjectEconomicsPanel({
  projectId,
  data,
}: {
  projectId: string;
  data: ProjectEconomicsData;
}) {
  const router = useRouter();
  const t = useTranslations("projectEconomics");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<BudgetCategory>("labour");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const eur = (cents: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);

  function report(m: string) {
    setMsg(m);
    router.refresh();
  }

  function save() {
    const value = Number(amount.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      setMsg(t("outcome.invalid"));
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const res = await setBudgetLineAction({
        projectId,
        category,
        plannedAmountCents: Math.round(value * 100),
      });
      if (res.ok) {
        setAmount("");
        report(t("outcome.saved"));
      } else {
        report(t(`outcome.${res.code}`));
      }
    });
  }

  function toggleApprove(id: string, next: "draft" | "approved") {
    startTransition(async () => {
      const res = await setBudgetStatusAction({ budgetId: id, status: next });
      report(res.ok ? t("outcome.saved") : t(`outcome.${res.code}`));
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteBudgetLineAction({ budgetId: id });
      report(res.ok ? t("outcome.deleted") : t(`outcome.${res.code}`));
    });
  }

  return (
    <section className="card-border flex flex-col gap-4 p-5" data-testid="project-economics-panel">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">{t("title")}</h2>
        <p className="text-[11px] leading-relaxed text-text-muted">{t("honestNote")}</p>
      </header>

      {!data.applied ? (
        <p className="text-sm text-text-muted" data-testid="economics-preapply">{t("preApply")}</p>
      ) : (
        <>
          {/* Variance summary */}
          <div className="flex flex-wrap gap-4 rounded-md border border-ink-600 bg-ink-800/40 p-3" data-testid="economics-summary">
            <div className="flex flex-col">
              <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">{t("baseline")}</span>
              <span className="text-sm text-text-primary" data-testid="economics-baseline">
                {data.hasBaseline ? eur(data.baselineCents) : t("noBaseline")}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">{t("actual")}</span>
              <span className="text-sm text-text-primary" data-testid="economics-actual">
                {data.actualCents === null ? t("actualUnavailable") : eur(data.actualCents)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">{t("variance")}</span>
              <span className={`text-sm font-semibold ${STATE_TONE[data.state]}`} data-testid="economics-variance">
                {data.varianceCents === null
                  ? "—"
                  : `${eur(data.varianceCents)} · ${t(`state.${data.state}`)}`}
              </span>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-text-muted">{t("actualNote")}</p>

          {/* Budget lines */}
          {data.lines.length === 0 ? (
            <p className="text-sm text-text-secondary" data-testid="economics-empty">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="economics-lines">
              {data.lines.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 p-3" data-testid="economics-line">
                  <span className="text-sm text-text-primary">{t(`categories.${l.category}`)}</span>
                  <span className="font-mono text-sm text-text-secondary">{eur(l.plannedAmountCents)}</span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${l.status === "approved" ? "border-state-success/40 text-state-success" : "border-ink-500 text-text-muted"}`}>
                    {t(`budgetStatus.${l.status}`)}
                  </span>
                  <div className="ml-auto flex gap-2">
                    <button type="button" disabled={pending}
                      onClick={() => toggleApprove(l.id, l.status === "approved" ? "draft" : "approved")}
                      className="rounded-md border border-ink-500 px-2 py-1 text-[11px] text-text-secondary hover:border-brand-blue hover:text-brand-blue"
                      data-testid="economics-toggle-approve">
                      {l.status === "approved" ? t("unapprove") : t("approve")}
                    </button>
                    <button type="button" disabled={pending} onClick={() => remove(l.id)}
                      className="rounded-md border border-ink-500 px-2 py-1 text-[11px] text-text-muted hover:border-state-danger hover:text-state-danger"
                      data-testid="economics-delete">
                      {t("delete")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Add / edit a budget line */}
          <div className="flex flex-col gap-2 border-t border-ink-600 pt-3">
            <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">{t("addHeading")}</span>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label={t("categoryLabel")} value={category} disabled={pending}
                onChange={(e) => setCategory(e.target.value as BudgetCategory)}
                className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" data-testid="economics-category">
                {BUDGET_CATEGORIES.map((c) => (<option key={c} value={c}>{t(`categories.${c}`)}</option>))}
              </select>
              <input inputMode="decimal" aria-label={t("amountLabel")} value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder={t("amountPlaceholder")}
                className="w-32 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-sm text-text-primary" data-testid="economics-amount" />
              <span className="text-xs text-text-muted">EUR</span>
              <Button type="button" size="sm" disabled={pending || amount.trim() === ""} onClick={save} data-testid="economics-save">
                {pending ? t("saving") : t("save")}
              </Button>
            </div>
          </div>
        </>
      )}
      {msg && <p className="text-xs text-text-secondary" data-testid="economics-msg">{msg}</p>}
    </section>
  );
}
