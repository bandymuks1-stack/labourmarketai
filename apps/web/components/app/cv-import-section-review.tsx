"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  hasAnyProposal,
  type CvDatePart,
  type CvSectionProposals,
} from "@/lib/cv/structured-parse";
import {
  confirmCvAchievementAction,
  confirmCvAvailabilityAction,
  confirmCvCertificateAction,
  confirmCvEducationAction,
  confirmCvLanguageAction,
  confirmCvSalaryAction,
  confirmCvWorkHistoryAction,
  type CvImportConfirmResult,
} from "@/lib/profile/cv-section-import-actions";
import {
  WORKER_LANGUAGE_LEVELS,
  WORKER_LANGUAGE_NATIVE_NAMES,
  type WorkerLanguageCode,
} from "@/lib/worker/worker-languages-model";

/**
 * Structured CV import review panel (Full CV System v1, M2 wiring).
 *
 * Renders the SECTION proposals the deterministic parser (and, when the AI
 * runtime is live, the labelled AI enhancement) produced from the imported /
 * pasted CV text, grouped by section, each with its own confirm / discard.
 *
 * Doctrine §7.1 contract, enforced here:
 *   - NOTHING persists without the per-item confirm click;
 *   - single-value facts are conflict-checked server-side — when a DIFFERENT
 *     value is already saved the item shows BOTH values and only the explicit
 *     "replace" click overwrites;
 *   - a language proposal without a stated level requires the user to pick
 *     one before confirm (no invented levels);
 *   - sections whose write path is a not-yet-applied draft migration report
 *     the honest "prepared, not enabled" state on confirm — never a fake save.
 */

type ItemStatus =
  | { state: "pending" }
  | { state: "saving" }
  | { state: "saved" }
  | { state: "discarded" }
  | { state: "conflict"; existing: string }
  | { state: "needs_migration" }
  | { state: "error"; message: "error" | "invalid" };

function mergeProposals(
  det: CvSectionProposals,
  ai: CvSectionProposals | null,
): CvSectionProposals & { aiStart: Record<string, number> } {
  if (!ai) {
    return {
      ...det,
      aiStart: {
        workHistory: det.workHistory.length,
        education: det.education.length,
        languages: det.languages.length,
        certificates: det.certificates.length,
        achievements: det.achievements.length,
      },
    };
  }
  const norm = (s: string) => s.trim().toLowerCase();
  const merged: CvSectionProposals = {
    workHistory: [
      ...det.workHistory,
      ...ai.workHistory.filter(
        (w) => !det.workHistory.some((d) => norm(d.title) === norm(w.title)),
      ),
    ],
    education: [
      ...det.education,
      ...ai.education.filter(
        (e) =>
          !det.education.some((d) => norm(d.institution) === norm(e.institution)),
      ),
    ],
    languages: [
      ...det.languages,
      ...ai.languages.filter(
        (l) => !det.languages.some((d) => d.lang === l.lang),
      ),
    ],
    certificates: [
      ...det.certificates,
      ...ai.certificates.filter(
        (c) => !det.certificates.some((d) => norm(d.title) === norm(c.title)),
      ),
    ],
    achievements: det.achievements,
    salary: det.salary ?? ai.salary,
    availability: det.availability,
  };
  return {
    ...merged,
    aiStart: {
      workHistory: det.workHistory.length,
      education: det.education.length,
      languages: det.languages.length,
      certificates: det.certificates.length,
      achievements: det.achievements.length,
    },
  };
}

export function CvImportSectionReview({
  proposals,
  aiProposals = null,
}: {
  proposals: CvSectionProposals;
  /** Optional AI-path proposals (same shape) — merged, labelled, deduped. */
  aiProposals?: CvSectionProposals | null;
}) {
  const t = useTranslations("cvImport");
  const router = useRouter();

  const merged = useMemo(
    () => mergeProposals(proposals, aiProposals),
    [proposals, aiProposals],
  );

  const [status, setStatus] = useState<Record<string, ItemStatus>>({});
  const [levelByKey, setLevelByKey] = useState<Record<string, string>>({});

  const statusOf = (key: string): ItemStatus =>
    status[key] ?? { state: "pending" };
  const setItem = (key: string, s: ItemStatus) =>
    setStatus((prev) => ({ ...prev, [key]: s }));

  if (!hasAnyProposal(merged)) return null;

  async function run(
    key: string,
    call: (allowReplace: boolean) => Promise<CvImportConfirmResult>,
    allowReplace = false,
  ) {
    setItem(key, { state: "saving" });
    try {
      const res = await call(allowReplace);
      if (res.ok) {
        setItem(key, { state: "saved" });
        router.refresh();
        return;
      }
      switch (res.code) {
        case "conflict":
          setItem(key, { state: "conflict", existing: res.existing ?? "—" });
          return;
        case "needs_migration":
          setItem(key, { state: "needs_migration" });
          return;
        case "invalid":
          setItem(key, { state: "error", message: "invalid" });
          return;
        default:
          setItem(key, { state: "error", message: "error" });
      }
    } catch (e) {
      console.error("[cv-import-review] confirm failed:", e);
      setItem(key, { state: "error", message: "error" });
    }
  }

  const rowCtx: RowContext = { statusOf, setItem, run };

  const yearsLabel = (
    start: number | null,
    end: number | null,
    isCurrent: boolean,
  ) =>
    start || end || isCurrent
      ? `${start ?? ""}–${isCurrent ? "…" : (end ?? "")}`
      : null;

  // Honest period label: show the precision the CV actually stated
  // ("2021-03 – 2024-11", "2021-03-15 – …"), never widen it to bare years.
  const datePartLabel = (p: CvDatePart | null | undefined): string => {
    if (!p) return "";
    const mm = p.month !== null ? `-${String(p.month).padStart(2, "0")}` : "";
    const dd = p.day !== null ? `-${String(p.day).padStart(2, "0")}` : "";
    return `${p.year}${mm}${dd}`;
  };
  const periodLabel = (w: {
    startYear: number | null;
    endYear: number | null;
    start?: CvDatePart | null;
    end?: CvDatePart | null;
    isCurrent: boolean;
  }) => {
    if (!w.start && !w.end)
      return yearsLabel(w.startYear, w.endYear, w.isCurrent);
    return `${datePartLabel(w.start)}–${w.isCurrent ? "…" : datePartLabel(w.end)}`;
  };

  return (
    <section
      className="card-border flex flex-col gap-4 p-4"
      data-testid="cv-import-section-review"
    >
      <header className="flex flex-col gap-0.5">
        <h3 className="font-display text-base font-semibold text-text-primary">
          {t("reviewTitle")}
        </h3>
        <p className="text-xs leading-relaxed text-text-secondary">
          {t("reviewHint")}
        </p>
      </header>

      <ReviewGroup nameKey="workHistory" count={merged.workHistory.length}>
        {merged.workHistory.map((w, i) => (
          <ItemRow
            key={`wh-${i}`}
            ctx={rowCtx}
            itemKey={`wh-${i}`}
            label={w.title}
            sub={periodLabel(w)}
            aiOrigin={i >= merged.aiStart.workHistory}
            onConfirm={() =>
              confirmCvWorkHistoryAction({
                title: w.title,
                startYear: w.startYear,
                endYear: w.endYear,
                start: w.start ?? null,
                end: w.end ?? null,
                isCurrent: w.isCurrent,
              })
            }
          />
        ))}
      </ReviewGroup>

      <ReviewGroup nameKey="education" count={merged.education.length}>
        {merged.education.map((e, i) => (
          <ItemRow
            key={`edu-${i}`}
            ctx={rowCtx}
            itemKey={`edu-${i}`}
            label={e.institution}
            sub={
              [e.program, yearsLabel(e.startYear, e.endYear, false)]
                .filter(Boolean)
                .join(" · ") || null
            }
            aiOrigin={i >= merged.aiStart.education}
            onConfirm={() =>
              confirmCvEducationAction({
                institution: e.institution,
                program: e.program,
                educationTypeSlug: e.educationTypeSlug,
                startYear: e.startYear,
                endYear: e.endYear,
              })
            }
          />
        ))}
      </ReviewGroup>

      <ReviewGroup nameKey="languages" count={merged.languages.length}>
        {merged.languages.map((l, i) => {
          const key = `lang-${l.lang}`;
          const chosen = levelByKey[key] ?? l.level ?? "";
          return (
            <ItemRow
              key={key}
              ctx={rowCtx}
              itemKey={key}
              label={
                WORKER_LANGUAGE_NATIVE_NAMES[l.lang as WorkerLanguageCode] ??
                l.lang
              }
              sub={null}
              aiOrigin={i >= merged.aiStart.languages}
              confirmDisabled={chosen === ""}
              onConfirm={(allowReplace) =>
                confirmCvLanguageAction({
                  lang: l.lang,
                  level: chosen,
                  allowReplace,
                })
              }
            >
              {/* Level: prefilled ONLY when the text stated one; otherwise the
                  user must pick — no invented levels. */}
              <select
                value={chosen}
                onChange={(e) =>
                  setLevelByKey((prev) => ({ ...prev, [key]: e.target.value }))
                }
                aria-label={t("chooseLevel")}
                className="rounded-md border border-ink-500 bg-ink-700 px-2 py-1 text-xs text-text-primary outline-none focus:border-brand-blue"
                data-testid={`cv-import-level-${l.lang}`}
              >
                <option value="">{t("chooseLevel")}</option>
                {WORKER_LANGUAGE_LEVELS.map((lv) => (
                  <option key={lv} value={lv}>
                    {lv}
                  </option>
                ))}
              </select>
            </ItemRow>
          );
        })}
      </ReviewGroup>

      <ReviewGroup nameKey="certificates" count={merged.certificates.length}>
        {merged.certificates.map((c, i) => (
          <ItemRow
            key={`cert-${i}`}
            ctx={rowCtx}
            itemKey={`cert-${i}`}
            label={c.title}
            sub={c.year ? String(c.year) : null}
            aiOrigin={i >= merged.aiStart.certificates}
            onConfirm={() =>
              confirmCvCertificateAction({ title: c.title, year: c.year })
            }
          />
        ))}
      </ReviewGroup>

      <ReviewGroup nameKey="achievements" count={merged.achievements.length}>
        {merged.achievements.map((a, i) => (
          <ItemRow
            key={`ach-${i}`}
            ctx={rowCtx}
            itemKey={`ach-${i}`}
            label={a.title}
            sub={null}
            aiOrigin={false}
            onConfirm={() => confirmCvAchievementAction({ title: a.title })}
          />
        ))}
      </ReviewGroup>

      <ReviewGroup nameKey="salary" count={merged.salary ? 1 : 0}>
        {merged.salary && (
          <ItemRow
            ctx={rowCtx}
            itemKey="salary"
            label={`${[merged.salary.minEur, merged.salary.maxEur]
              .filter((v): v is number => v !== null)
              .join("–")} ${t("perMonth")}`}
            sub={null}
            aiOrigin={proposals.salary === null}
            onConfirm={(allowReplace) =>
              confirmCvSalaryAction({
                minEur: merged.salary!.minEur,
                maxEur: merged.salary!.maxEur,
                allowReplace,
              })
            }
          />
        )}
      </ReviewGroup>

      <ReviewGroup nameKey="availability" count={merged.availability.length}>
        {merged.availability.map((h) => (
          <ItemRow
            key={`avail-${h.key}`}
            ctx={rowCtx}
            itemKey={`avail-${h.key}`}
            label={t(`availabilityKeys.${h.key}`)}
            sub={null}
            aiOrigin={false}
            onConfirm={(allowReplace) =>
              confirmCvAvailabilityAction({ key: h.key, allowReplace })
            }
          />
        ))}
      </ReviewGroup>
    </section>
  );
}

interface RowContext {
  statusOf: (key: string) => ItemStatus;
  setItem: (key: string, s: ItemStatus) => void;
  run: (
    key: string,
    call: (allowReplace: boolean) => Promise<CvImportConfirmResult>,
    allowReplace?: boolean,
  ) => Promise<void>;
}

function ReviewGroup({
  nameKey,
  count,
  children,
}: {
  nameKey: string;
  count: number;
  children: React.ReactNode;
}) {
  const t = useTranslations("cvImport");
  if (count === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-mono text-[11px] uppercase tracking-label text-text-secondary">
        {t(`groups.${nameKey}`)} · {count}
      </p>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </div>
  );
}

function ItemRow({
  ctx,
  itemKey,
  label,
  sub,
  aiOrigin,
  confirmDisabled,
  onConfirm,
  children,
}: {
  ctx: RowContext;
  itemKey: string;
  label: string;
  sub?: string | null;
  aiOrigin: boolean;
  confirmDisabled?: boolean;
  onConfirm: (allowReplace: boolean) => Promise<CvImportConfirmResult>;
  children?: React.ReactNode;
}) {
  const t = useTranslations("cvImport");
  const { statusOf, setItem, run } = ctx;
  const s = statusOf(itemKey);
  return (
      <li
        className="flex flex-col gap-1.5 rounded-md border border-ink-600 px-3 py-2"
        data-testid={`cv-import-item-${itemKey}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm text-text-primary">{label}</span>
            {sub ? (
              <span className="text-xs text-text-secondary">{sub}</span>
            ) : null}
            {aiOrigin && (
              <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                {t("aiHint")}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {children}
            {s.state === "pending" || s.state === "error" ? (
              <>
                <button
                  type="button"
                  disabled={confirmDisabled}
                  onClick={() => run(itemKey, onConfirm)}
                  className="rounded-md border border-brand-blue/40 bg-brand-blue/10 px-2.5 py-1 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/20 disabled:opacity-50"
                  data-testid={`cv-import-confirm-${itemKey}`}
                >
                  {t("confirm")}
                </button>
                <button
                  type="button"
                  onClick={() => setItem(itemKey, { state: "discarded" })}
                  className="rounded-md border border-ink-600 px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-state-danger hover:text-state-danger"
                >
                  {t("discard")}
                </button>
              </>
            ) : null}
            {s.state === "saving" && (
              <span className="text-xs text-text-secondary">{t("saving")}</span>
            )}
            {s.state === "saved" && (
              <span
                className="font-mono text-[10px] uppercase tracking-label text-state-success"
                data-testid={`cv-import-saved-${itemKey}`}
              >
                ✓ {t("confirmedLabel")}
              </span>
            )}
            {s.state === "discarded" && (
              <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                {t("discardedLabel")}
              </span>
            )}
          </div>
        </div>
        {s.state === "conflict" && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-md border border-state-warning/40 bg-state-warning/5 px-2 py-1.5"
            data-testid={`cv-import-conflict-${itemKey}`}
          >
            <span className="text-xs text-text-secondary">
              {t("conflict", { value: s.existing })}
            </span>
            <button
              type="button"
              onClick={() => run(itemKey, onConfirm, true)}
              className="rounded-md border border-state-warning/50 px-2 py-0.5 text-xs font-semibold text-text-primary hover:bg-state-warning/10"
              data-testid={`cv-import-replace-${itemKey}`}
            >
              {t("replace")}
            </button>
            <button
              type="button"
              onClick={() => setItem(itemKey, { state: "discarded" })}
              className="text-xs text-text-secondary hover:text-text-primary"
            >
              {t("discard")}
            </button>
          </div>
        )}
        {s.state === "needs_migration" && (
          <p className="text-xs text-text-secondary" role="status">
            {t("needsMigration")}
          </p>
        )}
        {s.state === "error" && (
          <p className="text-xs text-state-danger" role="alert">
            {s.message === "invalid" ? t("invalid") : t("error")}
          </p>
        )}
      </li>
    );
}
