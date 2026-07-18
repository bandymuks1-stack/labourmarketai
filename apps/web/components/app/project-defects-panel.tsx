"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import {
  addDefectCorrectionAction,
  deleteDefectAction,
  reportDefectAction,
  setDefectStatusAction,
} from "@/lib/quality/quality-actions";
import {
  CORRECTION_OUTCOMES,
  DEFECT_CATEGORIES,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  type Defect,
  type DefectCategory,
  type DefectSeverity,
  type DefectStatus,
  type ProjectDefectsData,
} from "@/lib/quality/quality-model";

const SEVERITY_TONE: Record<DefectSeverity, string> = {
  low: "border-ink-500 text-text-muted",
  medium: "border-state-warning/40 text-state-warning",
  high: "border-state-amber/40 text-state-amber",
  critical: "border-state-danger/40 text-state-danger",
};
const STATUS_ACCEPTED: DefectStatus = "accepted";

function DefectRow({ defect, onDone }: { defect: Defect; onDone: (m: string) => void }) {
  const t = useTranslations("quality");
  const [pending, startTransition] = useTransition();
  const [showCorrection, setShowCorrection] = useState(false);
  const [work, setWork] = useState("");
  const [outcome, setOutcome] = useState("passed");

  const run = (fn: () => Promise<{ ok: boolean; code?: string }>, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) after?.();
      onDone(res.ok ? t("outcome.saved") : t(`outcome.${res.code}`));
    });

  return (
    <li className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3" data-testid="defect-row">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${SEVERITY_TONE[defect.severity]}`}>{t(`severity.${defect.severity}`)}</span>
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">{t(`category.${defect.category}`)}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-text-primary" title={defect.description}>{defect.description}</span>
        {defect.status === STATUS_ACCEPTED && (
          <span className="font-mono text-[10px] uppercase tracking-label text-state-success">{t(`status.${defect.status}`)}</span>
        )}
      </div>
      {defect.location ? <span className="text-[11px] text-text-muted">{t("locationLabel")}: {defect.location}</span> : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11px] text-text-secondary" htmlFor={`defect-status-${defect.id}`}>{t("statusLabel")}</label>
        <select id={`defect-status-${defect.id}`} value={defect.status} disabled={pending}
          onChange={(e) => run(() => setDefectStatusAction({ defectId: defect.id, status: e.target.value }))}
          className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" data-testid="defect-status">
          {DEFECT_STATUSES.map((s) => (<option key={s} value={s}>{t(`status.${s}`)}</option>))}
        </select>
        <button type="button" disabled={pending} onClick={() => setShowCorrection((v) => !v)}
          className="rounded-md border border-ink-500 px-2 py-1 text-[11px] hover:border-brand-blue" data-testid="defect-correction-toggle">{t("addCorrection")}</button>
        <button type="button" disabled={pending} onClick={() => run(() => deleteDefectAction({ defectId: defect.id }))}
          className="ml-auto rounded-md border border-ink-500 px-2 py-1 text-[11px] text-text-muted hover:border-state-danger hover:text-state-danger" data-testid="defect-delete">{t("delete")}</button>
      </div>

      {defect.corrections.length > 0 && (
        <ul className="flex flex-col gap-1 border-l border-ink-600 pl-3" data-testid="defect-corrections">
          {defect.corrections.map((c) => (
            <li key={c.id} className="text-xs text-text-secondary">
              {c.workPerformed} · <span className="font-mono uppercase tracking-label text-text-muted">{t(`correctionOutcome.${c.outcome}`)}</span>
            </li>
          ))}
        </ul>
      )}

      {showCorrection && (
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-600 pt-2">
          <input aria-label={t("workLabel")} value={work} maxLength={2000} onChange={(e) => setWork(e.target.value)}
            placeholder={t("workPlaceholder")} className="min-w-40 flex-1 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-sm text-text-primary" data-testid="correction-work" />
          <select aria-label={t("outcomeLabel")} value={outcome} onChange={(e) => setOutcome(e.target.value)}
            className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" data-testid="correction-outcome">
            {CORRECTION_OUTCOMES.map((o) => (<option key={o} value={o}>{t(`correctionOutcome.${o}`)}</option>))}
          </select>
          <Button type="button" size="sm" disabled={pending || !work.trim()}
            onClick={() => run(() => addDefectCorrectionAction({ defectId: defect.id, workPerformed: work.trim(), outcome }), () => { setWork(""); setShowCorrection(false); })}
            data-testid="correction-submit">{t("save")}</Button>
        </div>
      )}
    </li>
  );
}

export function ProjectDefectsPanel({ projectId, data }: { projectId: string; data: ProjectDefectsData }) {
  const router = useRouter();
  const t = useTranslations("quality");
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<DefectCategory>("workmanship");
  const [severity, setSeverity] = useState<DefectSeverity>("medium");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const report = (m: string) => {
    setMsg(m);
    router.refresh();
  };

  function submit() {
    if (!description.trim()) {
      report(t("outcome.invalid"));
      return;
    }
    startTransition(async () => {
      const res = await reportDefectAction({ projectId, category, description: description.trim(), severity, location: location.trim() || undefined });
      if (res.ok) { setDescription(""); setLocation(""); report(t("outcome.reported")); }
      else report(t(`outcome.${res.code}`));
    });
  }

  return (
    <section className="card-border flex flex-col gap-4 p-5" data-testid="project-defects-panel">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">{t("title")}</h2>
        <p className="text-[11px] leading-relaxed text-text-muted">{t("honestNote")}</p>
      </header>

      {!data.applied ? (
        <p className="text-sm text-text-muted" data-testid="defects-preapply">{t("preApply")}</p>
      ) : (
        <>
          {data.defects.length === 0 ? (
            <p className="text-sm text-text-secondary" data-testid="defects-empty">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="defects-list">
              {data.defects.map((d) => (<DefectRow key={d.id} defect={d} onDone={report} />))}
            </ul>
          )}

          <div className="flex flex-col gap-2 border-t border-ink-600 pt-3">
            <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">{t("reportHeading")}</span>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label={t("categoryLabel")} value={category} onChange={(e) => setCategory(e.target.value as DefectCategory)}
                className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" data-testid="defect-category">
                {DEFECT_CATEGORIES.map((c) => (<option key={c} value={c}>{t(`category.${c}`)}</option>))}
              </select>
              <select aria-label={t("severityLabel")} value={severity} onChange={(e) => setSeverity(e.target.value as DefectSeverity)}
                className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" data-testid="defect-severity">
                {DEFECT_SEVERITIES.map((s) => (<option key={s} value={s}>{t(`severity.${s}`)}</option>))}
              </select>
              <input aria-label={t("locationLabel")} value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)}
                placeholder={t("locationPlaceholder")} className="w-40 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-sm text-text-primary" data-testid="defect-location" />
            </div>
            <input aria-label={t("descriptionLabel")} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")} className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-sm text-text-primary" data-testid="defect-description" />
            <div>
              <Button type="button" size="sm" disabled={pending || !description.trim()} onClick={submit} data-testid="defect-report">{pending ? t("saving") : t("report")}</Button>
            </div>
          </div>
        </>
      )}
      {msg && <p className="text-xs text-text-secondary" data-testid="defects-msg">{msg}</p>}
    </section>
  );
}
