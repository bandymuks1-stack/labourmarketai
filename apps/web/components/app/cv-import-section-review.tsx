"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  hasAnyProposal,
  TRAINING_TYPE_SLUG,
  type CvDatePart,
  type CvEducationProposal,
  type CvProposalConfidence,
  type CvSectionProposals,
} from "@/lib/cv/structured-parse";
import {
  achievementInput,
  certificateInput,
  cvDateText,
  editedText,
  educationInput,
  learningKind,
  workHistoryInput,
  type CvFieldEdits,
} from "@/lib/cv/cv-proposal-edit";
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

/** Where a line the parser could not place may go: through the SAME confirm
 *  actions as a proposal, so the person's choice is saved the same way. */
const UNPLACED_TARGETS = ["workHistory", "education", "certificates", "achievements"] as const;
type UnplacedTarget = (typeof UNPLACED_TARGETS)[number];

function saveUnplaced(target: UnplacedTarget, line: string): Promise<CvImportConfirmResult> {
  switch (target) {
    case "workHistory":
      return confirmCvWorkHistoryAction({
        title: line,
        startYear: null,
        endYear: null,
        start: null,
        end: null,
        isCurrent: false,
      });
    case "education":
      return confirmCvEducationAction({
        institution: line,
        program: null,
        educationTypeSlug: "other",
        startYear: null,
        endYear: null,
      });
    case "certificates":
      return confirmCvCertificateAction({ title: line, year: null });
    case "achievements":
      return confirmCvAchievementAction({ title: line });
  }
}

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
    unplaced: det.unplaced,
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
  const [placeByKey, setPlaceByKey] = useState<Record<string, UnplacedTarget | "">>({});
  const [editsByKey, setEditsByKey] = useState<Record<string, CvFieldEdits>>({});
  const editsOf = (key: string): CvFieldEdits => editsByKey[key] ?? {};
  const setEdit = (key: string, field: string, value: string) =>
    setEditsByKey((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));

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

  const rowCtx: RowContext = { statusOf, setItem, run, editsOf, setEdit };
  /** The typed values could not be saved: the row says so, nothing is sent. */
  const notSaved = async (): Promise<CvImportConfirmResult> => ({ ok: false, code: "invalid" });

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
            label={editsOf(`wh-${i}`).title ?? w.title}
            sub={
              editsOf(`wh-${i}`).start !== undefined || editsOf(`wh-${i}`).end !== undefined
                ? `${editsOf(`wh-${i}`).start ?? cvDateText(w.start)}–${editsOf(`wh-${i}`).end ?? cvDateText(w.end)}`
                : periodLabel(w)
            }
            confidence={w.confidence}
            fields={[
              { name: "title", label: t("fieldTitle"), value: w.title },
              { name: "start", label: t("fieldStart"), value: cvDateText(w.start ?? (w.startYear ? { year: w.startYear, month: null, day: null } : null)), hint: t("dateHint") },
              { name: "end", label: t("fieldEnd"), value: cvDateText(w.end ?? (w.endYear ? { year: w.endYear, month: null, day: null } : null)), hint: t("dateHint") },
            ]}
            aiOrigin={i >= merged.aiStart.workHistory}
            onConfirm={() => {
              const input = workHistoryInput(w, editsOf(`wh-${i}`));
              return input ? confirmCvWorkHistoryAction(input) : notSaved();
            }}
          />
        ))}
      </ReviewGroup>

      {([
        ["education", (e: CvEducationProposal) => e.educationTypeSlug !== TRAINING_TYPE_SLUG],
        ["training", (e: CvEducationProposal) => e.educationTypeSlug === TRAINING_TYPE_SLUG],
      ] as const).map(([nameKey, belongs]) => (
      <ReviewGroup key={nameKey} nameKey={nameKey} count={merged.education.filter(belongs).length}>
        {merged.education.map((e, i) => !belongs(e) ? null : (
          <ItemRow
            key={`edu-${i}`}
            ctx={rowCtx}
            itemKey={`edu-${i}`}
            label={editsOf(`edu-${i}`).institution ?? e.institution}
            sub={
              [
                editsOf(`edu-${i}`).program ?? e.program,
                yearsLabel(
                  Number(editsOf(`edu-${i}`).startYear ?? e.startYear) || null,
                  Number(editsOf(`edu-${i}`).endYear ?? e.endYear) || null,
                  false,
                ),
              ]
                .filter(Boolean)
                .join(" · ") || null
            }
            confidence={e.confidence}
            fields={[
              { name: "institution", label: t("fieldInstitution"), value: e.institution },
              { name: "program", label: t("fieldProgram"), value: e.program ?? "" },
              {
                name: "kind",
                label: t("fieldKind"),
                value: learningKind(e.educationTypeSlug),
                options: [
                  { value: "education", label: t("groups.education") },
                  { value: "training", label: t("groups.training") },
                ],
              },
              { name: "startYear", label: t("fieldStart"), value: e.startYear ? String(e.startYear) : "" },
              { name: "endYear", label: t("fieldEnd"), value: e.endYear ? String(e.endYear) : "" },
            ]}
            aiOrigin={i >= merged.aiStart.education}
            onConfirm={() => {
              const input = educationInput(e, editsOf(`edu-${i}`));
              return input ? confirmCvEducationAction(input) : notSaved();
            }}
          />
        ))}
      </ReviewGroup>
      ))}

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
              confidence={l.confidence}
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
            label={editsOf(`cert-${i}`).title ?? c.title}
            sub={editsOf(`cert-${i}`).year ?? (c.year ? String(c.year) : null)}
            confidence={c.confidence}
            fields={[
              { name: "title", label: t("fieldTitle"), value: c.title },
              { name: "year", label: t("fieldYear"), value: c.year ? String(c.year) : "" },
            ]}
            aiOrigin={i >= merged.aiStart.certificates}
            onConfirm={() => {
              const input = certificateInput(c, editsOf(`cert-${i}`));
              return input ? confirmCvCertificateAction(input) : notSaved();
            }}
          />
        ))}
      </ReviewGroup>

      <ReviewGroup nameKey="achievements" count={merged.achievements.length}>
        {merged.achievements.map((a, i) => (
          <ItemRow
            key={`ach-${i}`}
            ctx={rowCtx}
            itemKey={`ach-${i}`}
            label={editsOf(`ach-${i}`).title ?? a.title}
            sub={null}
            confidence={a.confidence}
            fields={[{ name: "title", label: t("fieldTitle"), value: a.title }]}
            aiOrigin={false}
            onConfirm={() => {
              const input = achievementInput(a, editsOf(`ach-${i}`));
              return input ? confirmCvAchievementAction(input) : notSaved();
            }}
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
            confidence={merged.salary.confidence}
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
            confidence={h.confidence}
            aiOrigin={false}
            onConfirm={(allowReplace) =>
              confirmCvAvailabilityAction({ key: h.key, allowReplace })
            }
          />
        ))}
      </ReviewGroup>

      <ReviewGroup
        nameKey="unplaced"
        count={merged.unplaced.length}
        hint={t("unplacedHint")}
      >
        {merged.unplaced.map((line, i) => {
          const key = `unplaced-${i}`;
          const target = placeByKey[key] ?? "";
          return (
            <ItemRow
              key={key}
              ctx={rowCtx}
              itemKey={key}
              label={editsOf(key).text ?? line}
              sub={null}
              confidence={null}
              aiOrigin={false}
              confirmDisabled={target === ""}
              fields={[{ name: "text", label: t("fieldText"), value: line }]}
              onConfirm={() => {
                const text = editedText(line, editsOf(key));
                return text ? saveUnplaced(target as UnplacedTarget, text) : notSaved();
              }}
            >
              <select
                value={target}
                onChange={(e) =>
                  setPlaceByKey((prev) => ({
                    ...prev,
                    [key]: e.target.value as UnplacedTarget | "",
                  }))
                }
                aria-label={t("placeAs")}
                className="rounded-md border border-ink-500 bg-ink-700 px-2 py-1 text-xs text-text-primary outline-none focus:border-brand-blue"
                data-testid={`cv-import-place-${key}`}
              >
                <option value="">{t("placeAs")}</option>
                {UNPLACED_TARGETS.map((g) => (
                  <option key={g} value={g}>
                    {t(`groups.${g}`)}
                  </option>
                ))}
              </select>
            </ItemRow>
          );
        })}
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
  editsOf: (key: string) => CvFieldEdits;
  setEdit: (key: string, field: string, value: string) => void;
}

/** One correctable field of a proposal. `value` is what the parser read. */
interface EditField {
  name: string;
  label: string;
  value: string;
  hint?: string;
  options?: readonly { value: string; label: string }[];
}

function ReviewGroup({
  nameKey,
  count,
  hint,
  children,
}: {
  nameKey: string;
  count: number;
  hint?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("cvImport");
  if (count === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-mono text-meta uppercase tracking-label text-text-secondary">
        {t(`groups.${nameKey}`)} · {count}
      </p>
      {hint ? <p className="text-xs leading-relaxed text-text-secondary">{hint}</p> : null}
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </div>
  );
}

function ItemRow({
  ctx,
  itemKey,
  label,
  sub,
  confidence: readingConfidence,
  aiOrigin,
  confirmDisabled,
  fields,
  onConfirm,
  children,
}: {
  ctx: RowContext;
  itemKey: string;
  label: string;
  sub?: string | null;
  /** How sure the parser is of its READING of the CV, never of the fact. Null
   *  for a line it did not read into anything. */
  confidence: CvProposalConfidence | null;
  aiOrigin: boolean;
  confirmDisabled?: boolean;
  fields?: readonly EditField[];
  onConfirm: (allowReplace: boolean) => Promise<CvImportConfirmResult>;
  children?: React.ReactNode;
}) {
  const t = useTranslations("cvImport");
  const { statusOf, setItem, run, editsOf, setEdit } = ctx;
  const [editing, setEditing] = useState(false);
  const s = statusOf(itemKey);
  const open = s.state === "pending" || s.state === "error";
  const edits = editsOf(itemKey);
  // What the person corrected is theirs: the parser's doubt no longer applies.
  const confidence = Object.keys(edits).length > 0 ? null : readingConfidence;
  return (
      <li
        className="flex flex-col gap-1.5 rounded-md border border-ink-600 px-3 py-2"
        data-testid={`cv-import-item-${itemKey}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <span className="break-words text-sm text-text-primary">{label}</span>
            {sub ? (
              <span className="text-xs text-text-secondary">{sub}</span>
            ) : null}
            {confidence ? (
              <span
                className={`text-xs ${confidence === "low" ? "text-state-warning" : "text-text-muted"}`}
                data-testid={`cv-import-confidence-${itemKey}`}
                data-confidence={confidence}
              >
                {t(`confidence.${confidence}`)}
              </span>
            ) : null}
            {aiOrigin && (
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                {t("aiHint")}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
                {fields ? (
                  <button
                    type="button"
                    aria-expanded={editing}
                    onClick={() => setEditing((v) => !v)}
                    className="rounded-md border border-ink-600 px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-text-secondary hover:text-text-primary"
                    data-testid={`cv-import-edit-${itemKey}`}
                  >
                    {editing ? t("editDone") : t("edit")}
                  </button>
                ) : null}
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
                className="font-mono text-meta uppercase tracking-label text-state-success"
                data-testid={`cv-import-saved-${itemKey}`}
              >
                ✓ {t("confirmedLabel")}
              </span>
            )}
            {s.state === "discarded" && (
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                {t("discardedLabel")}
              </span>
            )}
          </div>
        </div>
        {editing && open && fields ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid={`cv-import-fields-${itemKey}`}>
            {fields.map((f) => (
              <label key={f.name} className="flex flex-col gap-1 text-xs text-text-secondary">
                {f.label}
                {f.options ? (
                  <select
                    value={edits[f.name] ?? f.value}
                    onChange={(e) => setEdit(itemKey, f.name, e.target.value)}
                    className="rounded-md border border-ink-500 bg-ink-700 px-2 py-1.5 text-sm text-text-primary outline-none focus:border-brand-blue"
                    data-testid={`cv-import-field-${itemKey}-${f.name}`}
                  >
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={edits[f.name] ?? f.value}
                    placeholder={f.hint}
                    onChange={(e) => setEdit(itemKey, f.name, e.target.value)}
                    className="rounded-md border border-ink-500 bg-ink-700 px-2 py-1.5 text-sm text-text-primary outline-none focus:border-brand-blue"
                    data-testid={`cv-import-field-${itemKey}-${f.name}`}
                  />
                )}
              </label>
            ))}
          </div>
        ) : null}
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
