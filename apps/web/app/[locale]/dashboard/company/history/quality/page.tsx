import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { PageTitle } from "@/components/app/premium/page-title";
import { Stat, nf, span } from "@/components/app/organization/company-work-history";
import { HistoryUndoMergeForm } from "@/components/app/organization/history-undo-merge-form";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { Link } from "@/lib/i18n/navigation";
import { loadHistoryQuality } from "@/lib/organization-evidence/history-quality-read";

/**
 * IMPORTED HISTORY — DATA QUALITY (owner 2026-10-14). What the import
 * produced, what LabourMarket.ai recognised in it, every recorded mismatch,
 * and what is still unresolved — from the same records, none of them changed.
 * Organization governors only (RLS); a failed read is said, never drawn as
 * "no problems".
 */
export default async function HistoryQualityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "company");
  const t = await getTranslations("historyQuality");
  const load = await loadHistoryQuality(locale);
  if (load.kind === "hidden") notFound();

  const back = (
    <Link href={"/dashboard/company/history" as "/dashboard"} className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      {t("back")}
    </Link>
  );
  if (load.kind === "unavailable") {
    return (
      <div className="mx-auto flex w-full max-w-content flex-col gap-4" data-testid="history-quality" data-state="unavailable">
        {back}
        <Card variant="error" compact>
          <p className="text-sm text-text-secondary">{t("unavailable")}</p>
        </Card>
      </div>
    );
  }

  const { quality: q, decisions } = load;
  const example = q.byProject.filter((p) => p.importedRows > 1).slice(0, 3);
  const typeLabel = (k: string) => (t.has(`types.${k}` as never) ? t(`types.${k}` as never) : k);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-8" data-testid="history-quality" data-state="ready" data-ledger={load.ledgerApplied ? "applied" : "none"}>
      {back}
      <header className="flex flex-col gap-2">
        <PageTitle>{t("title")}</PageTitle>
        <p className="text-sm leading-relaxed text-text-secondary">{t("intro", { organization: load.organizationName })}</p>
        {!load.ledgerApplied ? (
          <p className="text-meta text-text-muted" data-testid="history-quality-not-applied">{t("notApplied")}</p>
        ) : null}
      </header>

      {/* BEFORE → AFTER */}
      <section className="grid gap-4 md:grid-cols-2" data-testid="history-quality-before-after">
        <Card compact className="flex flex-col gap-3">
          <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("before.title")}</h2>
          <div className="grid grid-cols-2 gap-2">
            <Stat concept="object" value={String(q.before.importedProjectRows)} label={t("m.projectRows")} />
            <Stat concept="calendar" value={String(q.before.records)} label={t("m.records")} />
            <Stat concept="time" value={`${nf(q.before.hours)} h`} label={t("m.hours")} />
            <Stat concept="person" value={String(q.before.people)} label={t("m.people")} />
          </div>
          <p className="text-meta text-text-muted">{t("before.note", { sources: q.before.sources })}</p>
        </Card>
        <Card compact className="flex flex-col gap-3 border-brand-blue/40">
          <h2 className="font-mono text-meta uppercase tracking-label text-brand-blue">{t("after.title")}</h2>
          <div className="grid grid-cols-2 gap-2">
            <Stat concept="object" value={String(q.after.realProjects)} label={t("m.realProjects")} />
            <Stat concept="calendar" value={String(q.after.records)} label={t("m.records")} />
            <Stat concept="time" value={`${nf(q.after.hours)} h`} label={t("m.hours")} />
            <Stat concept="person" value={String(q.after.people)} label={t("m.people")} />
          </div>
          <ul className="flex flex-col gap-0.5 text-meta text-text-secondary">
            <li data-testid="history-quality-merged">{t("after.merged", { rows: q.after.mergedRows })}</li>
            <li>{t("after.onProject", { records: q.after.recordsOnAProject, hours: nf(q.after.hoursOnAProject) })}</li>
            <li>{t("after.peopleWithHistory", { people: q.after.peopleWithProjectHistory })}</li>
          </ul>
        </Card>
      </section>
      <p className="text-sm font-medium text-state-success" data-testid="history-quality-invariant">
        {q.before.records === q.after.records && q.before.hours === q.after.hours && q.before.people === q.after.people
          ? t("invariant")
          : t("invariantBroken")}
      </p>

      {/* THE DEMONSTRATION — real groups from this import */}
      {example.length > 0 ? (
        <section className="flex flex-col gap-3" data-testid="history-quality-example">
          <h2 className="font-display text-xl font-semibold text-text-primary">{t("example.title")}</h2>
          <p className="text-sm text-text-secondary">{t("example.intro")}</p>
          {example.map((p) => (
            <div key={p.projectId} className="grid gap-3 md:grid-cols-2">
              <Card compact className="flex flex-col gap-1">
                <p className="font-mono text-meta uppercase tracking-label text-text-muted">{t("example.spreadsheet", { rows: p.importedRows })}</p>
                <ul className="flex flex-col gap-0.5">
                  {p.variants.map((v) => (
                    <li key={v} className="truncate font-mono text-meta text-text-secondary">{v}</li>
                  ))}
                  {p.importedRows > p.variants.length ? (
                    <li className="text-meta text-text-muted">{t("example.more", { count: p.importedRows - p.variants.length })}</li>
                  ) : null}
                </ul>
              </Card>
              <Card compact className="flex flex-col gap-1 border-brand-blue/40">
                <p className="font-mono text-meta uppercase tracking-label text-brand-blue">{t("example.lm")}</p>
                <Link href={`/dashboard/projects/${p.projectId}` as "/dashboard"} className="text-sm font-medium text-brand-blue hover:underline">
                  {p.title ?? "—"} →
                </Link>
                <p className="text-meta text-text-secondary">
                  {t("example.facts", { records: p.records, hours: nf(p.hours), people: p.people })}
                  {p.firstDate ? ` · ${span(p.firstDate, p.lastDate, locale)}` : ""}
                </p>
                {p.certainty === "probable" ? <p className="text-meta text-state-warning">{t("example.probable")}</p> : null}
              </Card>
            </div>
          ))}
        </section>
      ) : null}

      {/* STILL UNRESOLVED — kept as recorded */}
      <section className="flex flex-col gap-2" data-testid="history-quality-unresolved">
        <h2 className="font-display text-xl font-semibold text-text-primary">{t("unresolved.title")}</h2>
        <ul className="flex flex-col gap-1 text-sm text-text-secondary">
          <li>{t("unresolved.noObject", { records: q.after.unplaced.no_object.records, hours: nf(q.after.unplaced.no_object.hours) })}</li>
          <li>{t("unresolved.multi", { records: q.after.unplaced.multiple_objects.records, hours: nf(q.after.unplaced.multiple_objects.hours) })}</li>
          <li>{t("unresolved.single", { records: q.after.unplaced.single_unmatched.records, hours: nf(q.after.unplaced.single_unmatched.hours) })}</li>
          <li data-testid="history-quality-date-conflicts">{t("unresolved.dates", { personDays: q.after.dateConflicts.personDays, records: q.after.dateConflicts.records })}</li>
          {load.ledgerApplied ? <li>{t("unresolved.probable", { count: q.after.probableMerges })}</li> : null}
          {load.ledgerApplied ? <li>{t("unresolved.conflicts", { count: q.after.recordedConflicts })}</li> : null}
        </ul>
      </section>

      {/* PER SOURCE FILE */}
      <section className="flex flex-col gap-2" data-testid="history-quality-sessions">
        <h2 className="font-display text-xl font-semibold text-text-primary">{t("sessions.title")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="font-mono text-meta uppercase tracking-label text-text-muted">
              <tr>
                <th className="py-1 pr-3">{t("sessions.source")}</th>
                <th className="py-1 pr-3 text-right">{t("m.records")}</th>
                <th className="py-1 pr-3 text-right">{t("m.hours")}</th>
                <th className="py-1 pr-3 text-right">{t("m.people")}</th>
                <th className="py-1 pr-3 text-right">{t("sessions.onProject")}</th>
                <th className="py-1 text-right">{t("sessions.unplaced")}</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              {q.bySession.map((s) => (
                <tr key={s.sessionId ?? "none"} className="border-t border-ink-700">
                  <td className="py-1 pr-3 font-mono text-meta">{s.source ?? "—"}</td>
                  <td className="py-1 pr-3 text-right font-mono">{s.records}</td>
                  <td className="py-1 pr-3 text-right font-mono">{nf(s.hours)}</td>
                  <td className="py-1 pr-3 text-right font-mono">{s.people}</td>
                  <td className="py-1 pr-3 text-right font-mono">{s.onAProject}</td>
                  <td className="py-1 text-right font-mono">{s.unplaced}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* THE REGISTER — every recorded mismatch */}
      <section className="flex flex-col gap-2" data-testid="history-quality-register">
        <h2 className="font-display text-xl font-semibold text-text-primary">{t("register.title")}</h2>
        <ul className="flex flex-wrap gap-2">
          {Object.entries(q.mismatchCounts)
            .filter(([, n]) => n > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => (
              <li key={k} className="rounded-full border border-ink-600 px-3 py-1 text-meta text-text-secondary" data-testid="history-quality-type" data-type={k}>
                {typeLabel(k)} <span className="font-mono text-text-muted">{n}</span>
              </li>
            ))}
        </ul>
        {decisions.length > 0 ? (
          <details className="rounded-md border border-ink-700 p-3">
            <summary className="cursor-pointer text-sm text-text-primary">{t("register.rows", { count: decisions.length })}</summary>
            <ul className="mt-2 flex flex-col divide-y divide-ink-700">
              {decisions.map((d) => (
                <li key={d.id} className="flex flex-col gap-1 py-2" data-testid="history-quality-decision" data-decision={d.decision}>
                  <span className="font-mono text-meta text-text-secondary">{d.originalText}</span>
                  <span className="text-meta text-text-muted">
                    {t(`register.decision.${d.decision}` as never)} · {t(`register.certainty.${d.certainty}` as never)} · {d.normalizedName}
                    {d.mismatchTypes.length ? ` · ${d.mismatchTypes.map(typeLabel).join(", ")}` : ""}
                    {d.reverted ? ` · ${t("register.reverted")}` : ""}
                  </span>
                  <span className="text-meta text-text-muted">{t("register.rule", { rule: d.ruleVersion, at: d.decidedAt.slice(0, 10) })}</span>
                  {d.decision === "merged" && !d.reverted ? (
                    <HistoryUndoMergeForm
                      decisionId={d.id}
                      labels={{ reason: t("undo.reason"), undo: t("undo.button"), pending: t("undo.pending"), done: t("undo.done"), failed: t("undo.failed") }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <p className="text-meta text-text-muted" data-testid="history-quality-timing">
        {t("timing", { records: q.before.records, ms: load.foldMs })}
      </p>
    </div>
  );
}
