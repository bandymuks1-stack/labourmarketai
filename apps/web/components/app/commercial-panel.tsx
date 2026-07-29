"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { Link } from "@/lib/i18n/navigation";
import {
  createContractAction,
  createProposalAction,
  deleteContractAction,
  deleteProposalAction,
  setContractStatusAction,
  setProposalStatusAction,
} from "@/lib/commercial/commercial-actions";
import {
  CONTRACT_STATUSES,
  PROPOSAL_STATUSES,
  type CommercialData,
  type ContractStatus,
  type ProposalStatus,
} from "@/lib/commercial/commercial-model";

const PROPOSAL_TONE: Record<ProposalStatus, string> = {
  draft: "border-ink-500 text-text-muted",
  sent: "border-brand-blue/40 text-brand-blue",
  accepted: "border-state-success/40 text-state-success",
  rejected: "border-state-danger/40 text-state-danger",
  withdrawn: "border-ink-500 text-text-muted",
};
const CONTRACT_TONE: Record<ContractStatus, string> = {
  draft: "border-ink-500 text-text-muted",
  active: "border-brand-blue/40 text-brand-blue",
  completed: "border-state-success/40 text-state-success",
  cancelled: "border-ink-500 text-text-muted",
};

export function CommercialPanel({ data }: { data: CommercialData }) {
  const router = useRouter();
  const t = useTranslations("commercial");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [pTitle, setPTitle] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [cTitle, setCTitle] = useState("");
  const [cValue, setCValue] = useState("");
  const [cRef, setCRef] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const eur = (cents: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
  const report = (m: string) => {
    setMsg(m);
    router.refresh();
  };
  const run = (fn: () => Promise<{ ok: boolean; code?: string }>, onOk?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) onOk?.();
      report(res.ok ? t("outcome.saved") : t(`outcome.${res.code}`));
    });

  const parseEur = (s: string) => Math.round(Number(s.replace(",", ".")) * 100);

  return (
    <div className="flex flex-col gap-6" data-testid="commercial">
      {!data.applied ? (
        <section className="card-border p-5">
          <p className="text-sm text-text-muted" data-testid="commercial-preapply">{t("preApply")}</p>
        </section>
      ) : (
        <>
          {/* Proposals */}
          <section className="card-border flex flex-col gap-4 p-5" data-testid="proposals-panel">
            <header className="flex flex-col gap-1">
              <h2 className="font-display text-lg font-semibold text-text-primary">{t("proposalsTitle")}</h2>
              <p className="text-meta leading-relaxed text-text-muted">{t("honestNote")}</p>
            </header>
            {data.proposals.length === 0 ? (
              <p className="text-sm text-text-secondary" data-testid="proposals-empty">{t("proposalsEmpty")}</p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="proposals-list">
                {data.proposals.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3" data-testid="proposal-row">
                    <span className="text-sm font-semibold text-text-primary">{p.title}</span>
                    <span className="font-mono text-sm text-text-secondary">{eur(p.amountCents)}</span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${PROPOSAL_TONE[p.status]}`}>{t(`proposalStatus.${p.status}`)}</span>
                    <select aria-label={t("statusLabel")} value={p.status} disabled={pending}
                      onChange={(e) => run(() => setProposalStatusAction({ proposalId: p.id, status: e.target.value }))}
                      className="ml-auto rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" data-testid="proposal-status">
                      {PROPOSAL_STATUSES.map((s) => (<option key={s} value={s}>{t(`proposalStatus.${s}`)}</option>))}
                    </select>
                    <button type="button" disabled={pending} onClick={() => run(() => deleteProposalAction({ proposalId: p.id }))}
                      className="rounded-md border border-ink-500 px-2 py-1 text-meta text-text-muted hover:border-state-danger hover:text-state-danger" data-testid="proposal-delete">{t("delete")}</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-ink-600 pt-3">
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">{t("addProposal")}</span>
              <input aria-label={t("titleLabel")} value={pTitle} maxLength={200} onChange={(e) => setPTitle(e.target.value)}
                placeholder={t("proposalTitlePlaceholder")} className="min-w-40 flex-1 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-sm text-text-primary" data-testid="proposal-title" />
              <input inputMode="decimal" aria-label={t("amountLabel")} value={pAmount} onChange={(e) => setPAmount(e.target.value)}
                placeholder="0.00" className="w-28 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-sm text-text-primary" data-testid="proposal-amount" />
              <span className="text-xs text-text-muted">EUR</span>
              <Button type="button" size="sm" disabled={pending || !pTitle.trim()}
                onClick={() => run(() => createProposalAction({ title: pTitle.trim(), amountCents: parseEur(pAmount || "0") }), () => { setPTitle(""); setPAmount(""); })}
                data-testid="proposal-create">{pending ? t("saving") : t("add")}</Button>
            </div>
          </section>

          {/* Contracts */}
          <section className="card-border flex flex-col gap-4 p-5" data-testid="contracts-panel">
            <header className="flex flex-col gap-1">
              <h2 className="font-display text-lg font-semibold text-text-primary">{t("contractsTitle")}</h2>
              <p className="text-meta leading-relaxed text-text-muted">{t("noSignatureNote")}</p>
            </header>
            {data.contracts.length === 0 ? (
              <p className="text-sm text-text-secondary" data-testid="contracts-empty">{t("contractsEmpty")}</p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="contracts-list">
                {data.contracts.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3" data-testid="contract-row">
                    <span className="text-sm font-semibold text-text-primary">{c.title}</span>
                    <span className="font-mono text-sm text-text-secondary">{eur(c.valueCents)}</span>
                    {c.signedDocumentRef ? <span className="text-meta text-text-muted">{t("docRef")}: {c.signedDocumentRef}</span> : null}
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${CONTRACT_TONE[c.status]}`}>{t(`contractStatus.${c.status}`)}</span>
                    <select aria-label={t("statusLabel")} value={c.status} disabled={pending}
                      onChange={(e) => run(() => setContractStatusAction({ contractId: c.id, status: e.target.value }))}
                      className="ml-auto rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" data-testid="contract-status">
                      {CONTRACT_STATUSES.map((s) => (<option key={s} value={s}>{t(`contractStatus.${s}`)}</option>))}
                    </select>
                    <button type="button" disabled={pending} onClick={() => run(() => deleteContractAction({ contractId: c.id }))}
                      className="rounded-md border border-ink-500 px-2 py-1 text-meta text-text-muted hover:border-state-danger hover:text-state-danger" data-testid="contract-delete">{t("delete")}</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-ink-600 pt-3">
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">{t("addContract")}</span>
              <input aria-label={t("titleLabel")} value={cTitle} maxLength={200} onChange={(e) => setCTitle(e.target.value)}
                placeholder={t("contractTitlePlaceholder")} className="min-w-40 flex-1 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-sm text-text-primary" data-testid="contract-title" />
              <input inputMode="decimal" aria-label={t("valueLabel")} value={cValue} onChange={(e) => setCValue(e.target.value)}
                placeholder="0.00" className="w-28 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-sm text-text-primary" data-testid="contract-value" />
              <span className="text-xs text-text-muted">EUR</span>
              <input aria-label={t("docRefLabel")} value={cRef} maxLength={500} onChange={(e) => setCRef(e.target.value)}
                placeholder={t("docRefPlaceholder")} className="w-44 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-sm text-text-primary" data-testid="contract-docref" />
              <Button type="button" size="sm" disabled={pending || !cTitle.trim()}
                onClick={() => run(() => createContractAction({ title: cTitle.trim(), valueCents: parseEur(cValue || "0"), signedDocumentRef: cRef.trim() || undefined }), () => { setCTitle(""); setCValue(""); setCRef(""); })}
                data-testid="contract-create">{pending ? t("saving") : t("add")}</Button>
            </div>
          </section>

          {/* Invoices + payments live in the canonical finance layer. */}
          <section className="card-border flex flex-col gap-2 p-5" data-testid="commercial-finance-link">
            <h2 className="font-display text-lg font-semibold text-text-primary">{t("invoicesTitle")}</h2>
            <p className="text-sm text-text-secondary">{t("invoicesNote")}</p>
            <Link href={"/dashboard/finance" as "/dashboard"} className="text-sm text-brand-blue hover:underline" data-testid="commercial-finance-cta">
              {t("openFinance")} →
            </Link>
          </section>
        </>
      )}
      {msg && <p className="text-xs text-text-secondary" data-testid="commercial-msg">{msg}</p>}
    </div>
  );
}
